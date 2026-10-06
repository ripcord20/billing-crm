/**
 * PortalOtpService — minta & verifikasi OTP login portal (email / WhatsApp).
 * Login password tidak diubah; endpoint ini tambahan.
 */
const { Customer, Package, PortalOtp, sequelize } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const otp = require('../utils/portalOtp');

function normalizeChannel(channel) {
  const c = String(channel || '').trim().toLowerCase();
  if (c === 'email' || c === 'whatsapp') return c;
  return '';
}

async function findPortalCustomer(channel, identifier) {
  if (channel === 'email') {
    const email = otp.normalizeEmail(identifier);
    if (!email) return null;
    const rows = await Customer.findAll({
      where: {
        portal_enabled: true,
        [Op.and]: [sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email)]
      },
      include: [{ model: Package, as: 'package' }],
      limit: 5
    });
    if (rows.length > 1) return 'ambiguous';
    return rows[0] || null;
  }

  const variants = otp.phoneLookupVariants(identifier);
  const n62 = otp.to62(identifier);
  const tail = n62.length >= 11 ? n62.slice(-11) : n62;
  if (!variants.length || tail.length < 10) return null;

  const rows = await Customer.findAll({
    where: {
      portal_enabled: true,
      phone: { [Op.ne]: null, [Op.ne]: '' },
      [Op.or]: [
        { phone: { [Op.in]: variants } },
        { phone: { [Op.like]: '%' + tail } }
      ]
    },
    include: [{ model: Package, as: 'package' }],
    limit: 8
  });
  const matched = rows.filter((c) => otp.phonesMatch(c.phone, identifier));
  if (matched.length > 1) return 'ambiguous';
  return matched[0] || null;
}

async function sendWhatsappOtp(customer, code) {
  const GatewayService = require('./GatewayService');
  const session = await GatewayService.getDefaultSendingSession();
  if (!session || !session.session_id) throw new Error('WhatsApp session tidak terhubung');
  let company = 'ISP';
  try { company = await require('../utils/companyInfo').getCompanyName(); } catch (_) {}
  const name = customer.name || 'Pelanggan';
  const mins = Math.round(otp.OTP_TTL_MS / 60000);
  const msg = `*${company}*\nHalo ${name},\n\nKode login portal Anda: *${code}*\nBerlaku ${mins} menit. Jangan berikan kode ini ke siapa pun.\n\nJika Anda tidak meminta kode ini, abaikan pesan ini.`;
  await GatewayService.sendMessage(session.session_id, otp.to62(customer.phone), msg, null);
}

async function sendEmailOtp(customer, code) {
  const EmailService = require('./EmailService');
  let company = 'ISP';
  try { company = await require('../utils/companyInfo').getCompanyName(); } catch (_) {}
  const result = await EmailService.sendPortalOtp(customer.email, {
    code,
    name: customer.name || 'Pelanggan',
    companyName: company,
    ttlMinutes: Math.round(otp.OTP_TTL_MS / 60000)
  });
  if (!result || !result.ok) {
    throw new Error((result && result.reason) || 'Gagal mengirim email OTP');
  }
}

async function requestOtp({ channel, identifier, ip }) {
  const ch = normalizeChannel(channel);
  if (!ch) {
    return { ok: false, status: 400, message: 'Channel harus email atau whatsapp' };
  }
  const rawId = String(identifier || '').trim();
  if (ch === 'email' && !otp.isValidEmail(rawId)) {
    return { ok: false, status: 400, message: 'Format email tidak valid' };
  }
  if (ch === 'whatsapp' && !otp.isValidPhone(rawId)) {
    return { ok: false, status: 400, message: 'Nomor WhatsApp tidak valid' };
  }

  const customer = await findPortalCustomer(ch, rawId);
  if (customer === 'ambiguous') {
    return { ok: false, status: 409, message: 'Nomor/email terdaftar di lebih dari satu akun. Hubungi CS.' };
  }
  if (!customer) {
    return {
      ok: false,
      status: 404,
      message: ch === 'email'
        ? 'Email tidak terdaftar atau portal nonaktif'
        : 'Nomor WhatsApp tidak terdaftar atau portal nonaktif'
    };
  }
  if (customer.status === 'suspended') {
    return { ok: false, status: 403, message: 'Akun Anda telah di-suspend. Hubungi ISP.' };
  }
  if (ch === 'email' && !otp.normalizeEmail(customer.email)) {
    return { ok: false, status: 400, message: 'Email belum terdaftar di akun ini. Hubungi CS.' };
  }
  if (ch === 'whatsapp' && !otp.digitsOnly(customer.phone)) {
    return { ok: false, status: 400, message: 'Nomor WhatsApp belum terdaftar di akun ini. Hubungi CS.' };
  }

  const identKey = otp.identifierKey(ch, rawId);
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await PortalOtp.findAll({
    where: {
      identifier: identKey,
      channel: ch,
      createdAt: { [Op.gte]: since }
    },
    order: [['createdAt', 'DESC']],
    limit: otp.MAX_REQUESTS_PER_HOUR + 2
  });
  const gate = otp.requestGate({
    recentCount: recent.length,
    lastCreatedAt: recent[0] ? recent[0].createdAt : null
  });
  if (!gate.ok) {
    return { ok: false, status: 429, message: gate.message, wait: gate.wait };
  }

  await PortalOtp.update(
    { consumed_at: new Date() },
    { where: { identifier: identKey, channel: ch, consumed_at: null } }
  );

  const code = otp.generateOtpCode();
  const row = await PortalOtp.create({
    customer_id: customer.id,
    channel: ch,
    identifier: identKey,
    code_hash: otp.hashOtp(code),
    expires_at: new Date(Date.now() + otp.OTP_TTL_MS),
    attempts: 0,
    ip: ip ? String(ip).slice(0, 64) : null
  });

  try {
    if (ch === 'whatsapp') await sendWhatsappOtp(customer, code);
    else await sendEmailOtp(customer, code);
  } catch (e) {
    try { await row.destroy(); } catch (_) {}
    logger.error('[PortalOTP] gagal kirim: ' + (e && e.message ? e.message : e));
    return {
      ok: false,
      status: 503,
      message: ch === 'whatsapp'
        ? 'WhatsApp gateway tidak terhubung. Gunakan login password.'
        : 'Email gagal dikirim. Gunakan login password atau WhatsApp.'
    };
  }

  const dest = otp.maskDestination(ch, ch === 'email' ? customer.email : customer.phone);
  return {
    ok: true,
    status: 200,
    message: 'Kode OTP telah dikirim',
    destination: dest,
    expires_in: Math.round(otp.OTP_TTL_MS / 1000),
    resend_in: Math.round(otp.RESEND_COOLDOWN_MS / 1000)
  };
}

async function verifyOtp({ channel, identifier, code }) {
  const ch = normalizeChannel(channel);
  if (!ch) {
    return { ok: false, status: 400, message: 'Channel harus email atau whatsapp' };
  }
  const rawId = String(identifier || '').trim();
  const digits = String(code || '').replace(/\D/g, '');
  if (digits.length !== otp.OTP_LEN) {
    return { ok: false, status: 400, message: 'Kode OTP harus 6 digit' };
  }
  if (ch === 'email' && !otp.isValidEmail(rawId)) {
    return { ok: false, status: 400, message: 'Format email tidak valid' };
  }
  if (ch === 'whatsapp' && !otp.isValidPhone(rawId)) {
    return { ok: false, status: 400, message: 'Nomor WhatsApp tidak valid' };
  }

  const identKey = otp.identifierKey(ch, rawId);
  const row = await PortalOtp.findOne({
    where: { identifier: identKey, channel: ch, consumed_at: null },
    order: [['createdAt', 'DESC']]
  });
  if (!row) {
    return { ok: false, status: 401, message: 'Kode OTP tidak ditemukan. Minta kode baru.' };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 401, message: 'Kode OTP sudah kedaluwarsa. Minta kode baru.' };
  }
  if ((row.attempts || 0) >= otp.MAX_VERIFY_ATTEMPTS) {
    return { ok: false, status: 429, message: 'Terlalu banyak percobaan. Minta kode baru.' };
  }

  const nextAttempts = (row.attempts || 0) + 1;
  const good = otp.verifyOtpHash(digits, row.code_hash);
  await row.update({
    attempts: nextAttempts,
    consumed_at: good ? new Date() : row.consumed_at
  });
  if (!good) {
    const left = otp.MAX_VERIFY_ATTEMPTS - nextAttempts;
    return {
      ok: false,
      status: 401,
      message: left > 0
        ? `Kode OTP salah. Sisa ${left} percobaan.`
        : 'Kode OTP salah. Minta kode baru.'
    };
  }

  const customer = await Customer.findByPk(row.customer_id, {
    include: [{ model: Package, as: 'package' }]
  });
  if (!customer || !customer.portal_enabled) {
    return { ok: false, status: 401, message: 'Akun tidak aktif' };
  }
  if (customer.status === 'suspended') {
    return { ok: false, status: 403, message: 'Akun Anda telah di-suspend. Hubungi ISP.' };
  }
  return { ok: true, status: 200, customer };
}

module.exports = {
  requestOtp,
  verifyOtp,
  findPortalCustomer
};
