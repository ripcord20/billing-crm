'use strict';

/**
 * TenantSignupController
 * ──────────────────────────────────────────────────────────────────────────
 * Publik  : halaman & API pendaftaran tenant self-service (/daftar-tenant).
 * Webhook : gateway (midtrans/duitku/tripay) → aktivasi otomatis (TSU-*).
 * Admin   : list + verifikasi manual (aktivasi) + tolak.
 *
 * Setelah pembayaran sukses (webhook) ATAU verifikasi admin, tenant + user
 * owner (role tenant_owner) dibuat otomatis dan langsung aktif.
 */

const crypto = require('crypto');
const { TenantSignup, AppSetting } = require('../models');
const TenantSignupService = require('../services/TenantSignupService');
const { decryptSecret } = require('../utils/secretBox');
const { isPlatformAdmin } = require('../middleware/tenantContext');
const logger = require('../utils/logger');

async function getSetting(key, fallback = '') {
  try {
    const s = await AppSetting.findOne({ where: { key } });
    return s && s.value != null ? s.value : fallback;
  } catch (_) { return fallback; }
}

async function loadBrand() {
  const [name, logo] = await Promise.all([
    getSetting('company_name', 'ISP Billing'),
    getSetting('logo_url', '')
  ]);
  return { name: name || 'ISP Billing', logo: logo || '' };
}

function baseUrlOf(req) {
  const env = (process.env.APP_URL || process.env.BASE_URL || '').replace(/\/+$/, '');
  if (env) return env;
  return `${req.protocol}://${req.get('host')}`;
}

// Ringkasan publik aman untuk status page (tanpa data sensitif kecuali kredensial
// saat aktif — signup_code berlaku sebagai token klaim).
function publicView(s, { withCredentials = false } = {}) {
  const out = {
    signup_code: s.signup_code,
    name: s.name,
    email: s.email,
    company_name: s.company_name,
    plan_name: s.plan_name,
    plan_code: s.plan_code,
    amount: Number(s.amount),
    status: s.status,
    payment_url: s.payment_url || null,
    activated_at: s.activated_at || null
  };
  if (withCredentials && s.status === 'active') {
    out.owner_email = s.email;
    out.owner_password = s.temp_password ? decryptSecret(s.temp_password) : null;
    out.login_url = '/login';
  }
  return out;
}

class TenantSignupController {
  // ── Halaman publik ──────────────────────────────────────────────────────
  async renderPage(req, res, next) {
    try {
      const brand = await loadBrand();
      res.render('pages/daftar-tenant', { title: `Daftar Jadi Mitra — ${brand.name}`, brand });
    } catch (e) { next(e); }
  }

  async renderStatus(req, res, next) {
    try {
      const brand = await loadBrand();
      res.render('pages/daftar-tenant-status', {
        title: `Status Pendaftaran — ${brand.name}`, brand, signupCode: req.params.code
      });
    } catch (e) { next(e); }
  }

  // ── API publik ──────────────────────────────────────────────────────────
  async plans(req, res) {
    try {
      const plans = await TenantSignupService.getPlans();
      const gwEnabled = ['true', '1'].includes(await getSetting('payment_gateway_enabled', 'false'));
      res.json({ success: true, data: { plans, gateway_enabled: gwEnabled } });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async create(req, res) {
    try {
      const signup = await TenantSignupService.createSignup(req.body || {});
      const gwEnabled = ['true', '1'].includes(await getSetting('payment_gateway_enabled', 'false'));
      res.status(201).json({
        success: true,
        data: publicView(signup),
        gateway_enabled: gwEnabled,
        message: 'Pendaftaran dibuat. Lanjutkan pembayaran untuk mengaktifkan.'
      });
    } catch (e) {
      res.status(e.status || 400).json({ success: false, message: e.message });
    }
  }

  async pay(req, res) {
    try {
      const signup = await TenantSignup.findOne({ where: { signup_code: req.params.code } });
      if (!signup) return res.status(404).json({ success: false, message: 'Pendaftaran tidak ditemukan' });
      if (signup.status === 'active') {
        return res.json({ success: true, already: true, data: publicView(signup, { withCredentials: true }) });
      }
      const out = await TenantSignupService.createGatewayTxn({
        signup, tripayMethod: req.body && req.body.tripay_method, baseUrl: baseUrlOf(req)
      });
      if (!out.success) return res.status(out.http || 400).json(out);
      res.json({ success: true, data: out });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async status(req, res) {
    try {
      const signup = await TenantSignup.findOne({ where: { signup_code: req.params.code } });
      if (!signup) return res.status(404).json({ success: false, message: 'Pendaftaran tidak ditemukan' });
      res.json({ success: true, data: publicView(signup, { withCredentials: true }) });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  // ── Webhooks gateway (TSU-*) ────────────────────────────────────────────
  async _resolveByRef(ref) {
    const m = /^TSU-(\d+)-\d+$/.exec(ref || '');
    if (!m) return null;
    return TenantSignup.findByPk(parseInt(m[1], 10));
  }

  async webhookMidtrans(req, res) {
    try {
      const b = req.body || {};
      const serverKey = await getSetting('payment_gateway_server_key', '');
      const expected = crypto.createHash('sha512')
        .update(String(b.order_id) + String(b.status_code) + String(b.gross_amount) + serverKey)
        .digest('hex');
      if (b.signature_key && b.signature_key !== expected) {
        return res.status(403).json({ success: false, message: 'Invalid signature' });
      }
      const paid = ['settlement', 'capture'].includes(b.transaction_status) &&
        (!b.fraud_status || b.fraud_status === 'accept');
      const signup = await this._resolveByRef(b.order_id);
      if (!signup) return res.status(404).json({ success: false, message: 'Signup tidak ditemukan' });
      if (paid) await TenantSignupService.markPaidAndActivate(signup, { gateway: 'midtrans', ref: b.order_id });
      res.json({ success: true });
    } catch (e) {
      logger.error('[TenantSignup] webhook midtrans:', e.message);
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async webhookDuitku(req, res) {
    try {
      const b = req.body || {};
      const merchantCode = await getSetting('payment_gateway_merchant_code', '');
      const apiKey = await getSetting('payment_gateway_server_key', '');
      const expected = crypto.createHash('md5')
        .update(String(merchantCode) + String(b.amount) + String(b.merchantOrderId) + String(apiKey))
        .digest('hex');
      if (b.signature && b.signature !== expected) {
        return res.status(403).send('Invalid signature');
      }
      const paid = String(b.resultCode) === '00';
      const signup = await this._resolveByRef(b.merchantOrderId);
      if (!signup) return res.status(404).send('not found');
      if (paid) await TenantSignupService.markPaidAndActivate(signup, { gateway: 'duitku', ref: b.merchantOrderId });
      res.send('OK');
    } catch (e) {
      logger.error('[TenantSignup] webhook duitku:', e.message);
      res.status(500).send('error');
    }
  }

  async webhookTripay(req, res) {
    try {
      const privateKey = await getSetting('payment_gateway_private_key', '');
      const raw = req.rawBody || JSON.stringify(req.body || {});
      const sig = req.get('X-Callback-Signature') || '';
      const expected = crypto.createHmac('sha256', privateKey).update(raw).digest('hex');
      if (sig && sig !== expected) return res.status(403).json({ success: false, message: 'Invalid signature' });
      const b = req.body || {};
      const paid = String(b.status).toUpperCase() === 'PAID';
      const signup = await this._resolveByRef(b.merchant_ref);
      if (!signup) return res.status(404).json({ success: false, message: 'not found' });
      if (paid) await TenantSignupService.markPaidAndActivate(signup, { gateway: 'tripay', ref: b.merchant_ref });
      res.json({ success: true });
    } catch (e) {
      logger.error('[TenantSignup] webhook tripay:', e.message);
      res.status(500).json({ success: false, message: e.message });
    }
  }

  // ── Admin ───────────────────────────────────────────────────────────────
  async adminList(req, res) {
    try {
      if (!isPlatformAdmin(req)) return res.status(403).json({ success: false, message: 'Akses ditolak' });
      const where = {};
      if (req.query.status) where.status = req.query.status;
      const rows = await TenantSignup.findAll({ where, order: [['id', 'DESC']] });
      res.json({ success: true, data: rows.map((r) => r.toJSON()) });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  // Verifikasi pembayaran manual (transfer) → aktifkan tenant + owner.
  async adminActivate(req, res) {
    try {
      if (!isPlatformAdmin(req)) return res.status(403).json({ success: false, message: 'Akses ditolak' });
      const signup = await TenantSignup.findByPk(req.params.id);
      if (!signup) return res.status(404).json({ success: false, message: 'Pendaftaran tidak ditemukan' });
      if (['rejected', 'cancelled'].includes(signup.status)) {
        return res.status(400).json({ success: false, message: 'Pendaftaran sudah ' + signup.status });
      }
      const out = await TenantSignupService.markPaidAndActivate(signup, {
        gateway: signup.gateway || 'manual', ref: signup.gateway_ref || 'manual-admin'
      });
      res.json({
        success: true,
        message: 'Tenant diaktifkan',
        data: {
          tenant: out.tenant ? { id: out.tenant.id, name: out.tenant.name, slug: out.tenant.slug } : null,
          owner: out.owner ? { id: out.owner.id, email: out.owner.email } : null,
          temp_password: out.tempPassword || null
        }
      });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async adminReject(req, res) {
    try {
      if (!isPlatformAdmin(req)) return res.status(403).json({ success: false, message: 'Akses ditolak' });
      const signup = await TenantSignup.findByPk(req.params.id);
      if (!signup) return res.status(404).json({ success: false, message: 'Pendaftaran tidak ditemukan' });
      if (signup.status === 'active') return res.status(400).json({ success: false, message: 'Sudah aktif, tidak bisa ditolak' });
      await signup.update({ status: 'rejected', notes: (req.body && req.body.reason) || signup.notes });
      res.json({ success: true, message: 'Pendaftaran ditolak' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}

module.exports = new TenantSignupController();
