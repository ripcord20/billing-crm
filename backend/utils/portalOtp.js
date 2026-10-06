/**
 * Helper murni untuk login OTP portal pelanggan (email / WhatsApp).
 * Tidak menyentuh DB — aman diuji tanpa MySQL.
 */
const crypto = require('crypto');

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 3;
const RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_LEN = 6;

function digitsOnly(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function to62(value) {
  let d = digitsOnly(value);
  if (!d) return '';
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8') && d.length >= 9 && !d.startsWith('62')) d = '62' + d;
  return d;
}

function to08(value) {
  const d62 = to62(value);
  if (d62.startsWith('62')) return '0' + d62.slice(2);
  return digitsOnly(value);
}

function phoneLookupVariants(input) {
  const d = digitsOnly(input);
  const set = new Set();
  if (!d) return [];
  set.add(d);
  const n62 = to62(d);
  const n08 = to08(d);
  if (n62) set.add(n62);
  if (n08) set.add(n08);
  if (n62.startsWith('62') && n62.length > 2) set.add(n62.slice(2));
  return [...set];
}

function phonesMatch(stored, input) {
  const a = to62(stored);
  const b = to62(input);
  return !!(a && b && a.length >= 10 && a === b);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function isValidPhone(value) {
  const d62 = to62(value);
  return d62.length >= 10 && d62.length <= 15 && d62.startsWith('62');
}

function identifierKey(channel, identifier) {
  if (channel === 'email') return normalizeEmail(identifier);
  return to62(identifier);
}

function generateOtpCode() {
  return String(crypto.randomInt(0, 10 ** OTP_LEN)).padStart(OTP_LEN, '0');
}

function otpSecret() {
  return process.env.JWT_PORTAL_SECRET || process.env.JWT_SECRET || 'portal-otp';
}

function hashOtp(code, secret) {
  return crypto.createHmac('sha256', secret || otpSecret()).update(String(code)).digest('hex');
}

function verifyOtpHash(code, hash, secret) {
  if (!hash) return false;
  const expected = hashOtp(code, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(hash));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function maskEmail(email) {
  const e = normalizeEmail(email);
  const at = e.indexOf('@');
  if (at < 1) return '***';
  const user = e.slice(0, at);
  const domain = e.slice(at + 1);
  const vis = user.slice(0, Math.min(2, user.length));
  return vis + '***@' + domain;
}

function maskPhone(phone) {
  const p = to08(phone) || digitsOnly(phone);
  if (p.length < 8) return '****';
  return p.slice(0, 4) + '****' + p.slice(-3);
}

function maskDestination(channel, value) {
  return channel === 'email' ? maskEmail(value) : maskPhone(value);
}

function requestGate({ recentCount, lastCreatedAt, now }) {
  const t = now || Date.now();
  if ((recentCount || 0) >= MAX_REQUESTS_PER_HOUR) {
    return {
      ok: false,
      reason: 'limit',
      message: 'Terlalu banyak permintaan kode. Coba lagi dalam 1 jam.'
    };
  }
  if (lastCreatedAt) {
    const elapsed = t - new Date(lastCreatedAt).getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const wait = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000));
      return {
        ok: false,
        reason: 'cooldown',
        wait,
        message: `Tunggu ${wait} detik sebelum meminta kode lagi.`
      };
    }
  }
  return { ok: true };
}

module.exports = {
  OTP_TTL_MS,
  MAX_VERIFY_ATTEMPTS,
  MAX_REQUESTS_PER_HOUR,
  RESEND_COOLDOWN_MS,
  OTP_LEN,
  digitsOnly,
  to62,
  to08,
  phoneLookupVariants,
  phonesMatch,
  normalizeEmail,
  isValidEmail,
  isValidPhone,
  identifierKey,
  generateOtpCode,
  otpSecret,
  hashOtp,
  verifyOtpHash,
  maskEmail,
  maskPhone,
  maskDestination,
  requestGate
};
