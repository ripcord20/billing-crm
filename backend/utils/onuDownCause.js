'use strict';

/**
 * Sebab modem mati, dipakai semua merek OLT.
 * Listrik putus (Dying Gasp, Power down, Power off) bukan LOS optik.
 * Laser out, LOS, LOSi, LOAi, LOFi tetap tidak ada sinyal.
 * Sebab lama pada modem yang sedang online tidak dihitung.
 */

function textOf(v) {
  return String(v == null ? '' : v).trim();
}

function isOnlineOnu(onu) {
  const status = textOf(onu && onu.status).toLowerCase();
  if (status === 'online' || status === 'warning') return true;
  const phase = textOf(onu && (onu.phase_state || onu.phase)).toLowerCase().replace(/\(.*\)$/, '');
  return /^(working|online|up|active|normal)$/.test(phase);
}

function kindOf(raw) {
  const p = textOf(raw);
  if (!p || p === '--' || /^n\/?a$/i.test(p) || /^(unknown|match|success|initial)$/i.test(p)) return null;
  if (/dying[\s_-]*gasp/i.test(p) || /power[\s_-]*(down|off)/i.test(p) || /^dgi$/i.test(p)) return 'power';
  if (/laser[\s_-]*out/i.test(p) || /^loa[i1]$/i.test(p) || /^(losi|lofi|lobi|los|loss)$/i.test(p)) return 'optical';
  return null;
}

function canonicalPhase(raw) {
  const p = textOf(raw);
  const kind = kindOf(p);
  if (kind === 'power') {
    if (/dying[\s_-]*gasp/i.test(p) || /^dgi$/i.test(p)) return 'Dying Gasp';
    if (/power[\s_-]*off/i.test(p)) return 'Power off';
    return 'Power down';
  }
  if (kind === 'optical') {
    if (/laser[\s_-]*out/i.test(p)) return 'Laser out';
    if (/^loa[i1]$/i.test(p)) return 'LOAi';
    if (/^losi$/i.test(p)) return 'LOSi';
    if (/^lofi$/i.test(p)) return 'LOFi';
    if (/^lobi$/i.test(p)) return 'LOBi';
    return 'LOS';
  }
  return null;
}

function isSentinelRx(v) {
  if (v == null || v === '') return false;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) && n <= -29.5;
}

function clearRx(onu) {
  onu.onu_rx_dbm = null;
  if ('signal_strength' in onu) onu.signal_strength = null;
  if (onu.tr069_params) onu.tr069_params.rx_power = null;
}

function applyDownCause(onu) {
  if (!onu || typeof onu !== 'object') return onu;
  if (isOnlineOnu(onu)) return onu;

  const phase = canonicalPhase(onu.phase_state || onu.phase)
    || canonicalPhase(onu.last_down_cause || onu.last_d_cause);
  if (phase) {
    onu.phase_state = phase;
    onu.status = 'offline';
    clearRx(onu);
    onu.quality = kindOf(phase) === 'power' ? 'unknown' : 'los';
    return onu;
  }

  if (isSentinelRx(onu.onu_rx_dbm) || isSentinelRx(onu.signal_strength)) {
    clearRx(onu);
    if (onu.quality !== 'los') onu.quality = 'los';
  }
  return onu;
}

function applyDownCauseList(list) {
  if (Array.isArray(list)) list.forEach(applyDownCause);
  else if (list && Array.isArray(list.onus)) list.onus.forEach(applyDownCause);
  return list;
}

module.exports = {
  kindOf,
  canonicalPhase,
  isOnlineOnu,
  applyDownCause,
  applyDownCauseList,
};
