'use strict';

/** Aturan insentif lapangan — murni, tanpa DB. */

const DEFAULTS = {
  fee_tagihan: 5000,
  fee_router: 15000,
  fee_sisa: 15000,
  oli_qty: 1,
};

function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    fee_tagihan: Number(s.fee_tagihan) > 0 ? Math.round(Number(s.fee_tagihan)) : DEFAULTS.fee_tagihan,
    fee_router: Number(s.fee_router) > 0 ? Math.round(Number(s.fee_router)) : DEFAULTS.fee_router,
    fee_sisa: Number(s.fee_sisa) > 0 ? Math.round(Number(s.fee_sisa)) : DEFAULTS.fee_sisa,
    oli_qty: Number(s.oli_qty) > 0 ? Math.round(Number(s.oli_qty)) : DEFAULTS.oli_qty,
  };
}

/**
 * Tagihan sisa pemakaian akhir mengganti fee 5.000 (tidak ditumpuk).
 * Router adalah kerja terpisah.
 */
function classifyPayment({ collectedBy, invoiceIsStopFinal, customerStoppedAt, paymentDate }) {
  if (!collectedBy) return null;
  const stopped = customerStoppedAt ? String(customerStoppedAt).slice(0, 10) : '';
  const pay = paymentDate ? String(paymentDate).slice(0, 10) : '';
  const isSisa = !!invoiceIsStopFinal || (!!stopped && (!pay || pay >= stopped));
  return isSisa ? 'sisa' : 'tagihan';
}

function feeForKind(kind, settings) {
  const s = normalizeSettings(settings);
  if (kind === 'tagihan') return s.fee_tagihan;
  if (kind === 'sisa') return s.fee_sisa;
  if (kind === 'router') return s.fee_router;
  if (kind === 'oli') return 0;
  return 0;
}

function monthPeriodKey(ymd) {
  const s = String(ymd || '').slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Periode oli 2 bulan: Jan-Feb, Mar-Apr, ... (bulan ganjil + berikutnya). */
function oilPeriodKey(ymd) {
  const s = String(ymd || monthPeriodKey()).slice(0, 7);
  const [ys, ms] = s.split('-');
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  const start = m % 2 === 0 ? m - 1 : m;
  const end = start + 1;
  return `${y}-${String(start).padStart(2, '0')}_${y}-${String(end).padStart(2, '0')}`;
}

function oilPeriodLabel(key) {
  const m = String(key || '').match(/^(\d{4})-(\d{2})_(\d{4})-(\d{2})$/);
  if (!m) return key || '';
  const names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${names[parseInt(m[2], 10)]}–${names[parseInt(m[4], 10)]} ${m[1]}`;
}

function uniqueSourceKey(kind, sourceType, sourceId) {
  return `${kind}:${sourceType}:${sourceId}`;
}

module.exports = {
  DEFAULTS,
  normalizeSettings,
  classifyPayment,
  feeForKind,
  monthPeriodKey,
  oilPeriodKey,
  oilPeriodLabel,
  uniqueSourceKey,
};
