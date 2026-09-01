'use strict';

const STAGES = [
  'daftar', 'survey', 'jadwal', 'stok', 'pasang',
  'bind', 'redaman', 'pppoe', 'tagihan', 'done'
];

const STAGE_LABEL = {
  daftar: 'Daftar',
  survey: 'Survey / coverage',
  jadwal: 'Jadwal teknisi',
  stok: 'Ambil stok',
  pasang: 'Pasang',
  bind: 'Bind ONT',
  redaman: 'Cek redaman',
  pppoe: 'PPPoE',
  tagihan: 'Tagihan pertama',
  done: 'Selesai',
  cancelled: 'Batal'
};

function stageIndex(stage) {
  return STAGES.indexOf(stage);
}

function nextStage(stage) {
  const i = stageIndex(stage);
  if (i < 0 || i >= STAGES.length - 1) return null;
  return STAGES[i + 1];
}

function canAdvance(from, to) {
  if (from === 'cancelled' || to === 'cancelled') return false;
  const i = stageIndex(from);
  const j = stageIndex(to);
  return i >= 0 && j === i + 1;
}

function occupancyLevel(used, capacity) {
  if (capacity == null || Number(capacity) <= 0) return 'unknown';
  const pct = Number(used || 0) / Number(capacity);
  if (pct >= 1) return 'full';
  if (pct >= 0.8) return 'warning';
  return 'ok';
}

function occupancyColor(level) {
  return { full: '#ef4444', warning: '#f59e0b', ok: '#22c55e', unknown: '#94a3b8' }[level] || '#94a3b8';
}

function warehouseNextStatus(from, action) {
  const map = {
    in_stock: { checkout: 'checked_out', damage: 'damaged' },
    checked_out: { install: 'installed', return: 'in_stock', damage: 'damaged' },
    installed: { return: 'in_stock' },
    returned: { checkout: 'checked_out' },
    damaged: {}
  };
  const table = map[from] || {};
  return table[action] || null;
}

function alarmFingerprint(kind, key) {
  return `alarm:${kind}:${String(key || '').trim().toLowerCase()}`;
}

function parseAlarmTag(tags) {
  if (!tags) return null;
  let t = tags;
  if (typeof t === 'string') {
    try { t = JSON.parse(t); } catch (_) { return null; }
  }
  if (!t || t.source !== 'alarm') return null;
  return t;
}

/**
 * Halaman /psb (kanban pasang baru) dobel dengan form registrasi Sales.
 * Bookmark lama diarahkan ke alur yang sudah dipakai.
 */
function pageRedirect(roleName) {
  const r = String(roleName || '').toLowerCase();
  if (r === 'tenant_owner') return '/customers';
  if (r === 'noc' || r === 'technician') return '/work-orders';
  if (r === 'finance') return '/finance';
  return '/sales#pipeline';
}

module.exports = {
  STAGES,
  STAGE_LABEL,
  stageIndex,
  nextStage,
  canAdvance,
  occupancyLevel,
  occupancyColor,
  warehouseNextStatus,
  alarmFingerprint,
  parseAlarmTag,
  pageRedirect
};
