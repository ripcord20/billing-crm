'use strict';

/**
 * Normalisasi & format redaman optik (dBm).
 *
 * Vendor mengirim angka dalam satuan berbeda:
 *   - sudah dBm          : -22.678
 *   - 0.01 dBm (centi)   : -2268  → -22.68
 *   - 0.001 dBm (milli)  : -22678 → -22.678
 *   - string IGC         : "-22.6780 dBm"
 *
 * MIB SNMP HSGQ G02/G04 kolom RX sering hanya kelipatan 1 dBm
 * (-2300 → -23.00) meski web IGC menampilkan 4 desimal.
 */

function parseDbmNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw === 0) return null;
    return scaleOpticalRaw(raw);
  }
  const s = String(raw).trim().replace(/,/g, '');
  if (!s || /^n\/?a$/i.test(s) || /los|no\s*signal/i.test(s)) return null;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  if (!Number.isFinite(n) || n === 0) return null;
  // String dari IGC/CLI sudah dBm (punya desimal atau |n| < 50).
  if (s.includes('.') || Math.abs(n) <= 50) return roundDbm(n);
  return scaleOpticalRaw(n);
}

function scaleOpticalRaw(val) {
  if (!Number.isFinite(val) || val === 0) return null;
  const abs = Math.abs(val);
  if (abs >= 100000) return null; // sentinel / invalid
  let n = val;
  if (abs >= 10000) n = val / 1000;      // 0.001 dBm  (-22678 → -22.678)
  else if (abs >= 80) n = val / 100;     // 0.01 dBm   (-2268 / -2300)
  if (n > 8 || n < -45) return null;
  return roundDbm(n);
}

function roundDbm(n) {
  if (!Number.isFinite(n)) return null;
  return parseFloat(n.toFixed(4));
}

function formatDbm(n, { min = 2, max = 4 } = {}) {
  const x = typeof n === 'number' ? n : parseDbmNumber(n);
  if (x === null || x === undefined || !Number.isFinite(Number(x))) return null;
  const fixed = Number(x).toFixed(max);
  const trimmed = fixed.replace(/0+$/, '').replace(/\.$/, '');
  const dot = trimmed.indexOf('.');
  if (dot === -1) return Number(x).toFixed(min);
  const dec = trimmed.length - dot - 1;
  if (dec < min) return Number(x).toFixed(min);
  return trimmed;
}

function formatDbmLabel(n, suffix = ' dBm') {
  const s = formatDbm(n);
  return s == null ? null : s + suffix;
}

module.exports = {
  parseDbmNumber,
  scaleOpticalRaw,
  roundDbm,
  formatDbm,
  formatDbmLabel,
};
