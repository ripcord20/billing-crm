'use strict';

/**
 * Normalisasi phase/state ONU antar merek OLT (ZTE, CDATA, HIOSO, dll).
 *
 * Penting: Dying Gasp ≠ LOS
 *   - dying-gasp = ONU kehabisan listrik / dimatikan (adapter cabut, PLN mati)
 *   - LOS        = OLT tidak menerima sinyal optik (fiber putus / redaman)
 * Beberapa firmware CDATA menuliskan State=LOS/offline di `show onu_information`
 * padahal phase / last-down-cause sebenarnya dying-gasp.
 */

const RANGING = new Set(['ranging', 'syncmib', 'logging', 'initial']);

function compact(raw) {
  return String(raw == null ? '' : raw).toLowerCase().replace(/[\s_\-()]/g, '');
}

function normalize(raw) {
  const c = compact(raw);
  if (!c) return '';
  if (/dyinggasp|dyinggas|\bdgi\b/.test(c)) return 'dyinggasp';
  if (c === 'los' || c === 'loss' || c === 'losi' || c === 'lofi') return 'los';
  if (c === 'working') return 'working';
  if (c === 'online' || c === 'up' || c === 'normal') return 'online';
  if (c === 'disabled' || c === 'disable' || c === 'deactive' || c === 'deactivated') return 'disabled';
  if (RANGING.has(c)) return c;
  if (c === 'offline' || c === 'off') return 'offline';
  return c;
}

function isDyingGasp(raw) {
  return normalize(raw) === 'dyinggasp';
}

function statusFromPhase(raw, { admin } = {}) {
  const p = normalize(raw);
  if (p === 'online' || p === 'working') return 'online';
  if (p === 'disabled' || /disable|deactiv/i.test(String(admin || ''))) return 'disabled';
  return 'offline';
}

function extractDownCause(text) {
  const s = String(text || '');
  const labeled = s.match(/last\s*(?:down|offline)\s*(?:cause|reason)\s*[:=]\s*([^\r\n,;]+)/i)
    || s.match(/(?:down|offline)\s*(?:cause|reason)\s*[:=]\s*([^\r\n,;]+)/i);
  if (labeled) {
    const n = normalize(labeled[1]);
    if (n) return n;
  }
  if (/dying[\s_\-]?gasp/i.test(s)) return 'dyinggasp';
  return '';
}

function qualityFor(phaseRaw, opticalQuality, opticalRaw) {
  const fromText = extractDownCause(opticalRaw);
  const phase = normalize(phaseRaw) || fromText;
  if (phase === 'dyinggasp' || fromText === 'dyinggasp') return 'dyinggasp';
  if (opticalQuality) return opticalQuality;
  if (phase === 'los') return 'los';
  return 'unknown';
}

/**
 * Cari token phase di satu baris CLI. Dying-gasp / LOS diutamakan
 * supaya flag "Active" (Huawei control-flag) tidak lolos sebagai online.
 */
function findPhaseToken(line) {
  const parts = String(line || '').split(/\s+/).filter(Boolean);
  let fallback = null;
  for (const part of parts) {
    const p = normalize(part);
    if (p === 'dyinggasp' || p === 'los') return { raw: part, phase: p };
    if (!fallback && (p === 'online' || p === 'working' || p === 'offline' || p === 'disabled' || RANGING.has(p))) {
      fallback = { raw: part, phase: p };
    }
  }
  return fallback;
}

function looksLikeSn(token) {
  const s = String(token || '');
  if (s.length < 8) return false;
  if (/dying|gasp|offline|online|working|success|match|enable|disable|active|los/i.test(s)) return false;
  return /^[0-9A-Za-z\-:]+$/.test(s);
}

/**
 * Kode SNMP phase ZTE C320/C300 (zxAnGponOnuPhaseState).
 * 1=logging 2=LOS 3=sync/working (banyak C320 memakai 3=working)
 * 4=working 5=dyingGasp 6=authFail 7=offline
 */
const ZTE_SNMP_PHASE = {
  1: 'logging',
  2: 'los',
  3: 'working',
  4: 'working',
  5: 'dyinggasp',
  6: 'offline',
  7: 'offline',
};

function fromSnmpCode(code) {
  const n = parseInt(code, 10);
  if (!Number.isFinite(n)) return normalize(code);
  if (ZTE_SNMP_PHASE[n]) return ZTE_SNMP_PHASE[n];
  return n >= 3 && n !== 5 && n !== 6 && n !== 7 ? 'working' : 'offline';
}

function label(raw) {
  const p = normalize(raw);
  if (p === 'dyinggasp') return 'Dying Gasp';
  if (p === 'los') return 'LOS';
  if (p === 'working' || p === 'online') return 'Online';
  if (p === 'disabled') return 'Disabled';
  if (p === 'syncmib') return 'SyncMib';
  if (p === 'ranging' || p === 'logging' || p === 'initial') return 'Ranging…';
  if (p === 'offline') return 'Offline';
  return raw ? String(raw) : 'Offline';
}

module.exports = {
  compact,
  normalize,
  isDyingGasp,
  statusFromPhase,
  extractDownCause,
  qualityFor,
  findPhaseToken,
  looksLikeSn,
  fromSnmpCode,
  label,
  ZTE_SNMP_PHASE,
};
