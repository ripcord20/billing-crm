'use strict';

/**
 * Grace isolir: integer 0–365. Nilai non-numerik / NaN → 0.
 */
function parseGraceDays(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(365, Math.max(0, n));
}

/**
 * Cocokkan nominal callback gateway vs total invoice (dibulatkan ke rupiah).
 * `candidates` boleh angka tunggal atau array (Tripay: amount / amount_received / total_amount).
 * Nilai 0 / kosong diabaikan. Kalau semua kandidat kosong, dianggap match
 * (tidak ada angka untuk dibanding).
 */
function amountsMatch(expectedTotal, candidates) {
  const expected = Math.round(parseFloat(expectedTotal));
  if (!Number.isFinite(expected)) return false;
  const list = Array.isArray(candidates) ? candidates : [candidates];
  const present = list
    .map(v => Math.round(parseFloat(v)))
    .filter(v => Number.isFinite(v) && v > 0);
  if (!present.length) return true;
  return present.some(v => v === expected);
}

function isCustomerPeriodConflict(err) {
  if (!err) return false;
  const name = err.name || '';
  const parent = err.parent || {};
  const fields = err.fields || {};
  const fieldKeys = Object.keys(fields);
  const msg = String(parent.sqlMessage || parent.message || err.message || '');
  const constraint = String(parent.constraint || '');
  if (/uq_invoice_customer_period/i.test(constraint + msg)) return true;
  if (name === 'SequelizeUniqueConstraintError') {
    if (fieldKeys.includes('period_month') || fieldKeys.includes('period_year')) return true;
    if (fieldKeys.includes('customer_id') && fieldKeys.length > 1) return true;
  }
  return false;
}

module.exports = { parseGraceDays, amountsMatch, isCustomerPeriodConflict };
