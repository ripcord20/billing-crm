'use strict';

/** RouterOS REST often sends "true"; binary API sends boolean true. */
function rosTrue(v) {
  return v === true || v === 'true' || v === 'yes' || v === 1 || v === '1';
}

function parseCounter(v) {
  const n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** RouterOS REST/API kadang `rx-byte`, kadang `rx-bytes`, kadang camelCase. */
function ifaceRxTxBytes(i) {
  const row = i && typeof i === 'object' ? i : {};
  const rx = parseCounter(row['rx-byte'] ?? row['rx-bytes'] ?? row.rxByte);
  const tx = parseCounter(row['tx-byte'] ?? row['tx-bytes'] ?? row.txByte);
  if (rx > 0 || tx > 0) return { rx, tx };
  return {
    rx: parseCounter(row['fp-rx-byte'] ?? row.fpRxByte),
    tx: parseCounter(row['fp-tx-byte'] ?? row.fpTxByte)
  };
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
  ifaceRxTxBytes,
  combineMonitorBits,
  rateFromDelta
};
