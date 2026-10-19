'use strict';

const FieldIncentiveService = require('../services/FieldIncentiveService');

function periodFrom(req) {
  const now = new Date();
  const year = parseInt(req.query.year || req.body.year, 10) || now.getFullYear();
  const month = parseInt(req.query.month || req.body.month, 10) || (now.getMonth() + 1);
  return {
    year,
    month: Math.min(12, Math.max(1, month))
  };
}

function serializeRow(r) {
  const j = r.toJSON ? r.toJSON() : r;
  return {
    id: j.id,
    kind: j.kind,
    amount: parseFloat(j.amount || 0),
    qty: j.qty,
    unit: j.unit,
    status: j.status,
    earned_at: j.earned_at,
    period_key: j.period_key,
    notes: j.notes,
    source_type: j.source_type,
    customer: j.customer
      ? { id: j.customer.id, name: j.customer.name, customer_id: j.customer.customer_id }
      : null,
    invoice: j.invoice
      ? { id: j.invoice.id, invoice_number: j.invoice.invoice_number }
      : null
  };
}

class FieldIncentiveController {
  async summary(req, res) {
    try {
      const { year, month } = periodFrom(req);
      const data = await FieldIncentiveService.summary(year, month);
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async settings(req, res) {
    try {
      const data = await FieldIncentiveService.getSettings();
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async saveSettings(req, res) {
    try {
      const data = await FieldIncentiveService.saveSettings(req.body || {});
      res.json({ success: true, data, message: 'Aturan insentif disimpan.' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async staff(req, res) {
    try {
      const data = await FieldIncentiveService.staffList();
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async detail(req, res) {
    try {
      const userId = parseInt(req.params.userId, 10);
      if (!userId) return res.status(400).json({ success: false, message: 'User tidak valid' });
      const { year, month } = periodFrom(req);
      const rows = await FieldIncentiveService.listForUser(userId, year, month);
      res.json({ success: true, data: rows.map(serializeRow) });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async payMoney(req, res) {
    try {
      const userId = parseInt(req.body.user_id, 10);
      if (!userId) return res.status(400).json({ success: false, message: 'Pilih petugas dulu' });
      const { year, month } = periodFrom(req);
      const result = await FieldIncentiveService.markMoneyPaid(
        userId, year, month, req.user && req.user.id, req.body.note
      );
      res.json({
        success: true,
        data: result,
        message: result.count
          ? `Fee Rp ${Math.round(result.amount).toLocaleString('id-ID')} ditandai dibayar.`
          : 'Tidak ada fee yang menunggu.'
      });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async payOil(req, res) {
    try {
      const userId = parseInt(req.body.user_id, 10);
      const periodKey = String(req.body.period_key || '').trim();
      if (!userId || !periodKey) {
        return res.status(400).json({ success: false, message: 'Petugas atau periode oli tidak valid' });
      }
      const result = await FieldIncentiveService.markOilPaid(
        userId, periodKey, req.user && req.user.id, req.body.note
      );
      res.json({
        success: true,
        data: result,
        message: result.qty
          ? `${result.qty} botol oli ditandai sudah diserahkan.`
          : 'Tidak ada hak oli yang menunggu.'
      });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async addRouter(req, res) {
    try {
      const userId = parseInt(req.body.user_id, 10);
      const customerId = parseInt(req.body.customer_id, 10) || null;
      if (!userId) return res.status(400).json({ success: false, message: 'Pilih petugas dulu' });
      const earnedAt = String(req.body.earned_at || '').slice(0, 10)
        || new Date().toISOString().slice(0, 10);
      const sourceId = `${userId}:${customerId || 0}:${earnedAt}`;
      const row = await FieldIncentiveService.accrueRouter({
        userId,
        customerId,
        sourceType: 'manual_router',
        sourceId,
        earnedAt,
        notes: req.body.notes || 'Pengambilan router'
      });
      res.json({ success: true, data: row, message: 'Fee ambil router dicatat.' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async addSisa(req, res) {
    try {
      const userId = parseInt(req.body.user_id, 10);
      const customerId = parseInt(req.body.customer_id, 10) || null;
      const invoiceId = parseInt(req.body.invoice_id, 10) || null;
      if (!userId) return res.status(400).json({ success: false, message: 'Pilih petugas dulu' });
      const earnedAt = String(req.body.earned_at || '').slice(0, 10)
        || new Date().toISOString().slice(0, 10);
      const sourceId = invoiceId
        ? `inv:${invoiceId}`
        : `${userId}:${customerId || 0}:${earnedAt}`;
      const row = await FieldIncentiveService.accrueSisa({
        userId,
        customerId,
        invoiceId,
        sourceType: invoiceId ? 'manual_sisa_invoice' : 'manual_sisa',
        sourceId,
        earnedAt,
        notes: req.body.notes || 'Sisa pemakaian akhir'
      });
      res.json({ success: true, data: row, message: 'Fee sisa tagihan dicatat.' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async backfill(req, res) {
    try {
      const { year, month } = periodFrom(req);
      const data = await FieldIncentiveService.backfillMonth(year, month);
      res.json({
        success: true,
        data,
        message: `Backfill ${year}-${String(month).padStart(2, '0')}: ${data.created} fee tagihan/sisa, ${data.routers_created} router.`
      });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async voidRow(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const row = await FieldIncentiveService.voidRow(id);
      if (!row) return res.status(404).json({ success: false, message: 'Catatan tidak ditemukan' });
      res.json({ success: true, message: 'Catatan insentif dibatalkan.' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}

module.exports = new FieldIncentiveController();
