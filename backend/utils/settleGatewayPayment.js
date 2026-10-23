'use strict';
/**
 * Pelunasan invoice dari webhook gateway — satu transaksi + row lock.
 *
 * Urutan:
 *   1. SELECT invoice FOR UPDATE
 *   2. Validasi nominal (kalau kandidat dikirim)
 *   3. Kalau sudah paid + ada payment → retry finalize (skip WA), jangan dobel payment
 *   4. Kalau paid tapi payment hilang → buat payment (repair) lalu finalize
 *   5. Kalau unpaid → buat payment DULU, baru set invoice paid (tahan crash di tengah)
 */
const logger = require('./logger');

async function settleGatewayPayment({
  invoiceId,
  paidAmount,
  matchCandidates,
  paymentMethod = 'gateway',
  referenceNumber = null,
  notes = null,
  gateway = null,
  channel = 'gateway'
}) {
  const { Invoice, Payment, sequelize } = require('../models');
  const { amountsMatch } = require('./billingGuards');

  let outcome;
  try {
    outcome = await sequelize.transaction(async (t) => {
      const invoice = await Invoice.findByPk(invoiceId, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!invoice) {
        return { ok: false, httpStatus: 404, message: 'Invoice not found' };
      }

      if (matchCandidates !== undefined && matchCandidates !== null) {
        if (!amountsMatch(invoice.total, matchCandidates)) {
          logger.error(
            `[settleGatewayPayment] amount mismatch invoice #${invoiceId} ` +
            `(got=${JSON.stringify(matchCandidates)}, expected=${invoice.total})`
          );
          return { ok: false, httpStatus: 400, message: 'Amount mismatch' };
        }
      }

      const existingPay = await Payment.findOne({
        where: { invoice_id: invoiceId },
        order: [['id', 'ASC']],
        transaction: t
      });

      const wasPaid = invoice.status === 'paid';
      if (wasPaid && existingPay) {
        return {
          ok: true,
          alreadyPaid: true,
          repaired: false,
          paymentId: existingPay.id,
          invoiceId
        };
      }

      const expected = Math.round(parseFloat(invoice.total));
      const recorded = Number.isFinite(parseFloat(paidAmount)) && parseFloat(paidAmount) > 0
        ? Math.round(parseFloat(paidAmount))
        : expected;
      const today = new Date().toISOString().slice(0, 10);

      let payment = existingPay;
      if (!payment) {
        payment = await Payment.create({
          invoice_id: invoiceId,
          amount: recorded,
          payment_method: paymentMethod,
          payment_date: today,
          reference_number: referenceNumber,
          notes,
          gateway
        }, { transaction: t });
      }

      if (!wasPaid) {
        await invoice.update({ status: 'paid', paid_date: today }, { transaction: t });
      }

      return {
        ok: true,
        alreadyPaid: false,
        repaired: wasPaid && !existingPay,
        paymentId: payment.id,
        invoiceId
      };
    });
  } catch (e) {
    logger.error(`[settleGatewayPayment] invoice #${invoiceId}: ${e.message}`);
    return { ok: false, httpStatus: 500, message: 'Server error' };
  }

  if (!outcome || !outcome.ok) return outcome;

  try {
    const { finalizePaidInvoice } = require('./paymentFinalizer');
    await finalizePaidInvoice({
      invoiceId: outcome.invoiceId,
      paymentId: outcome.paymentId,
      channel,
      referenceNo: referenceNumber,
      // Retry webhook: jangan kirim WA kedua kali. Repair (paid tanpa payment) tetap kirim.
      skipWa: !!outcome.alreadyPaid
    });
  } catch (finErr) {
    logger.error(`[settleGatewayPayment] finalize invoice #${invoiceId}: ${finErr.message}`);
  }

  return outcome;
}

module.exports = { settleGatewayPayment };
