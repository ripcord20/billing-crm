'use strict';

/**
 * Pelanggan berhenti (churn): status inactive + tanggal + alasan.
 * Dipakai form, API, dan halaman /customers/stopped.
 */

const STOP_REASONS = [
  'Pindah rumah',
  'Pindah kota',
  'Ganti ISP',
  'Tidak mampu bayar',
  'Isolir berkepanjangan',
  'Tutup usaha',
  'Kualitas jaringan',
  'Lainnya',
];

/** Contoh pencatatan — tampil di halaman supaya admin lihat formatnya. */
const EXAMPLE_STOPPED = {
  customer_id: 'FLN-1042',
  name: 'Budi Santoso',
  phone: '0812-3456-7890',
  package_name: '20 Mbps Home',
  area: 'Sumur, Kabupaten Pandeglang',
  stopped_at: '2026-09-15',
  stop_reason: 'Pindah rumah',
  example: true,
};

function todayYmd(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeReason(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Lainnya';
  const hit = STOP_REASONS.find(r => r.toLowerCase() === s.toLowerCase());
  return hit || s.slice(0, 120);
}

function normalizeDate(raw, fallback = todayYmd()) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return fallback;
}

/**
 * Patch kolom berhenti saat status berubah.
 * prevStatus/nextStatus: nilai customers.status.
 */
function applyStopFields(prevStatus, nextStatus, body = {}, now = new Date()) {
  const patch = {};
  if (!nextStatus || nextStatus === prevStatus) {
    if (nextStatus === 'inactive') {
      if (body.stopped_at) patch.stopped_at = normalizeDate(body.stopped_at);
      if (body.stop_reason != null && String(body.stop_reason).trim()) {
        patch.stop_reason = normalizeReason(body.stop_reason);
      }
    }
    return patch;
  }
  if (nextStatus === 'inactive') {
    patch.stopped_at = normalizeDate(body.stopped_at, todayYmd(now));
    patch.stop_reason = normalizeReason(body.stop_reason);
  } else if (prevStatus === 'inactive') {
    patch.stopped_at = null;
    patch.stop_reason = null;
  }
  return patch;
}

function displayStoppedAt(row) {
  if (row && row.stopped_at) return String(row.stopped_at).slice(0, 10);
  if (row && row.updated_at) return String(row.updated_at).slice(0, 10);
  return null;
}

module.exports = {
  STOP_REASONS,
  EXAMPLE_STOPPED,
  todayYmd,
  normalizeReason,
  normalizeDate,
  applyStopFields,
  displayStoppedAt,
};
