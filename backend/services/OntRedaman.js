'use strict';
/**
 * Klasifikasi redaman ONT (RX Power dBm) dan ringkasan fleet.
 *
 * GPON tipikal:
 *   hot      > -8 dBm   (sinyal terlalu kuat)
 *   good    -8 … -24    (normal)
 *   warning -24 … -27   (mulai lemah)
 *   critical < -27      (kritis, perlu cek kabel/splitter)
 */

function classifyRx(dbm) {
  const n = parseFloat(dbm);
  if (dbm == null || dbm === '' || Number.isNaN(n)) return 'unknown';
  if (n > -8) return 'hot';
  if (n >= -24) return 'good';
  if (n >= -27) return 'warning';
  return 'critical';
}

function rxLabel(severity) {
  return {
    hot: 'Terlalu kuat',
    good: 'Baik',
    warning: 'Lemah',
    critical: 'Kritis',
    unknown: 'Tidak ada data',
  }[severity] || 'Tidak ada data';
}

function emptyStats() {
  return { total: 0, good: 0, warning: 0, critical: 0, hot: 0, unknown: 0, offline: 0 };
}

function summarize(rows) {
  const stats = emptyStats();
  stats.total = rows.length;
  for (const r of rows) {
    const sev = r.severity || classifyRx(r.rx_power);
    if (stats[sev] != null) stats[sev] += 1;
    if (r.status === 'offline') stats.offline += 1;
  }
  return stats;
}

function downsampleSpark(values, maxPoints = 24) {
  if (!Array.isArray(values) || values.length <= maxPoints) return values || [];
  const step = Math.ceil(values.length / maxPoints);
  const out = [];
  for (let i = 0; i < values.length; i += step) out.push(values[i]);
  const last = values[values.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

module.exports = {
  classifyRx,
  rxLabel,
  emptyStats,
  summarize,
  downsampleSpark,
};
