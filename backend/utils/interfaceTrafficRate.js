'use strict';

/** RouterOS REST often sends "true"; binary API sends boolean true. */
function rosTrue(v) {
  return v === true || v === 'true' || v === 'yes' || v === 1 || v === '1';
}

function parseCounter(v) {
  const n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Winbox Traffic = slow-path + fast-path. FastTrack/PPPoE sering hanya
 * muncul di fp-*-bits-per-second; kalau diabaikan RX≈TX (kecil/sama).
 */
function combineMonitorBits(sample) {
  const s = sample && typeof sample === 'object' ? sample : {};
  const rx = parseCounter(s['rx-bits-per-second']) + parseCounter(s['fp-rx-bits-per-second']);
  const tx = parseCounter(s['tx-bits-per-second']) + parseCounter(s['fp-tx-bits-per-second']);
  return { rxBitsPerSecond: Math.round(rx), txBitsPerSecond: Math.round(tx) };
}

function rateFromDelta(prev, next, nowMs) {
  if (!prev || !next) return { rxBps: 0, txBps: 0, ok: false };
  const at = Number(prev.at);
  const sec = (Number(nowMs) - at) / 1000;
  if (!Number.isFinite(sec) || sec < 0.3 || sec > 180) {
    return { rxBps: 0, txBps: 0, ok: false };
  }
  const dRx = next.rx - prev.rx;
  const dTx = next.tx - prev.tx;
  if (dRx < 0 || dTx < 0) return { rxBps: 0, txBps: 0, ok: false };
  return {
    rxBps: Math.round((dRx * 8) / sec),
    txBps: Math.round((dTx * 8) / sec),
    ok: true
  };
}

module.exports = {
  rosTrue,
  parseCounter,
  combineMonitorBits,
  rateFromDelta
};
