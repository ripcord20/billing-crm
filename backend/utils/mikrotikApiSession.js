'use strict';

/**
 * Aturan sesi API Binary (RouterOS v6/v7 port 8728).
 * v6 mencatat SETIAP login/logout di /log — jangan buka-tutup socket tiap poll.
 */

const BINARY_MIN_POLL_MS = 15000;
const BINARY_KEEPALIVE_MS = 40000;

function isBinaryProtocol(apiProtocol) {
  return apiProtocol === 'api-plain' || apiProtocol === 'api-ssl' || apiProtocol === 'api-binary';
}

function isBinaryInstance(inst) {
  return !!(inst && inst._apiClient);
}

/** Router SNMP-only tidak boleh di-poll lewat API (itu sumber log "dial terus"). */
function shouldApiPollDevice(device) {
  if (!device || !device.api_username) return false;
  const mon = device.monitoring_type || 'snmp';
  return mon === 'api' || mon === 'both';
}

/**
 * Interval minimum fetch live untuk transport binary.
 * REST boleh 2s (HTTP, tidak ada log account). Binary paling cepat 15s,
 * atau poll_interval device kalau lebih lambat.
 */
function binaryApiMinPollMs(pollIntervalSec) {
  const sec = parseInt(pollIntervalSec, 10);
  const fromDevice = Number.isFinite(sec) && sec > 0 ? sec * 1000 : BINARY_MIN_POLL_MS;
  return Math.max(BINARY_MIN_POLL_MS, fromDevice);
}

function startBinaryKeepalive(inst, runKeepalive) {
  if (!isBinaryInstance(inst) || inst._keepTimer) return;
  const tick = typeof runKeepalive === 'function'
    ? runKeepalive
    : () => {
      const cli = inst._apiClient;
      if (!cli) return;
      if (!cli._connected) {
        cli.connect().catch(() => {});
        return;
      }
      cli.run(['/system/identity/print'], 4000).catch(() => {});
    };
  inst._keepTimer = setInterval(tick, BINARY_KEEPALIVE_MS);
  if (typeof inst._keepTimer.unref === 'function') inst._keepTimer.unref();
}

function stopBinaryKeepalive(inst) {
  if (!inst || !inst._keepTimer) return;
  clearInterval(inst._keepTimer);
  inst._keepTimer = null;
}

module.exports = {
  BINARY_MIN_POLL_MS,
  BINARY_KEEPALIVE_MS,
  isBinaryProtocol,
  isBinaryInstance,
  shouldApiPollDevice,
  binaryApiMinPollMs,
  startBinaryKeepalive,
  stopBinaryKeepalive
};
