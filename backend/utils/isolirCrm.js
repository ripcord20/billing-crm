/**
 * isolirCrm.js
 *
 * Status isolir di CRM (customers.isolir_status) harus mengikuti tagihan.
 * Attention / daftar terisolir membaca kolom itu — bukan MikroTik.
 *
 * Restore jaringan tetap dicoba, tapi kalau invoice sudah tidak ada yang
 * unpaid/overdue, isolir_status di-CRM wajib 'active' supaya pelunasan
 * langsung hilang dari Needs Attention.
 */

const OUTSTANDING = ['unpaid', 'overdue'];

function shouldClearIsolir(isolirStatus, outstandingCount) {
  return outstandingCount === 0 && ['isolated', 'restoring'].includes(isolirStatus);
}

function outstandingInvoiceSql(customerAlias = 'c') {
  return `EXISTS (
    SELECT 1 FROM invoices i
     WHERE i.customer_id = ${customerAlias}.id
       AND i.status IN ('unpaid','overdue')
  )`;
}

async function countOutstandingInvoices(sequelize, customerId) {
  const rows = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM invoices
      WHERE customer_id = ? AND status IN ('unpaid','overdue')`,
    { replacements: [customerId], type: sequelize.QueryTypes.SELECT }
  );
  return parseInt(rows[0]?.cnt || 0, 10);
}

async function activateCrmIfPaidUp(sequelize, customerId) {
  const outstanding = await countOutstandingInvoices(sequelize, customerId);
  if (outstanding > 0) return { cleared: false, reason: 'has_outstanding', outstanding };
  await sequelize.query(
    `UPDATE customers
        SET isolir_status = 'active',
            isolir_at = NULL,
            status = IF(status = 'isolated', 'active', status)
      WHERE id = ?
        AND isolir_status IN ('isolated','restoring')`,
    { replacements: [customerId] }
  );
  return { cleared: true, reason: 'paid_up', outstanding: 0 };
}

async function reconcilePaidIsolated(sequelize) {
  const [meta] = await sequelize.query(
    `UPDATE customers c
        SET c.isolir_status = 'active',
            c.isolir_at = NULL,
            c.status = IF(c.status = 'isolated', 'active', c.status)
      WHERE c.isolir_status IN ('isolated','restoring')
        AND NOT ${outstandingInvoiceSql('c')}`
  );
  const affected = (meta && (meta.affectedRows != null ? meta.affectedRows : meta.changedRows)) || 0;
  return { cleared: Number(affected) || 0 };
}

module.exports = {
  OUTSTANDING,
  shouldClearIsolir,
  outstandingInvoiceSql,
  countOutstandingInvoices,
  activateCrmIfPaidUp,
  reconcilePaidIsolated
};
