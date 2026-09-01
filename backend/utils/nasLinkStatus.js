'use strict';

const net = require('net');
const { execFile } = require('child_process');

const HANDSHAKE_UP_SEC = 180;
const PROBE_TIMEOUT_MS = 700;
const PROBE_PORTS = [8728, 8291, 80, 443, 22];

function stripHost(ip) {
  return String(ip || '').split('/')[0].trim();
}

function handshakeAgeSec(handshakeUnix, nowMs = Date.now()) {
  const hs = parseInt(handshakeUnix, 10) || 0;
  if (hs <= 0) return null;
  return Math.max(0, Math.floor(nowMs / 1000) - hs);
}

function formatAgeLabel(sec) {
  if (sec == null || sec < 0) return '';
  if (sec < 60) return `${sec} dtk lalu`;
  if (sec < 3600) return `${Math.round(sec / 60)} mnt lalu`;
  return `${Math.round(sec / 3600)} jam lalu`;
}

function classifyNasLink({
  connMode,
  wgConfigured,
  deviceStatus,
  handshakeUnix,
  reachable
} = {}) {
  const vpn = connMode === 'vpn';
  const age = handshakeAgeSec(handshakeUnix);
  const handshakeUp = age != null && age <= HANDSHAKE_UP_SEC;
  const deviceUp = deviceStatus === 'online' || deviceStatus === 'warning';

  if (handshakeUp) {
    return {
      state: 'up',
      label: 'Terhubung',
      reason: 'handshake',
      age_sec: age,
      age_label: formatAgeLabel(age)
    };
  }
  if (deviceUp) {
    return {
      state: 'up',
      label: 'Terhubung',
      reason: 'device',
      age_sec: age,
      age_label: age != null ? formatAgeLabel(age) : ''
    };
  }
  if (reachable === true) {
    return {
      state: 'up',
      label: 'Terhubung',
      reason: 'ping',
      age_sec: age,
      age_label: ''
    };
  }
  if (vpn && !wgConfigured) {
    return {
      state: 'pending',
      label: 'Belum generate',
      reason: 'keys',
      age_sec: null,
      age_label: ''
    };
  }
  return {
    state: 'down',
    label: 'Belum terhubung',
    reason: age != null ? 'stale' : 'none',
    age_sec: age,
    age_label: age != null ? formatAgeLabel(age) : ''
  };
}

function tcpProbeHost(host, ports = PROBE_PORTS, timeoutMs = PROBE_TIMEOUT_MS) {
  const ip = stripHost(host);
  if (!ip) return Promise.resolve(false);
  return Promise.all(ports.map((port) => new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch (_) {}
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    try { socket.connect(parseInt(port, 10), ip); } catch (_) { finish(false); }
  }))).then((rows) => rows.some(Boolean));
}

function icmpProbeHost(host, timeoutMs = PROBE_TIMEOUT_MS) {
  const ip = stripHost(host);
  if (!ip) return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile('ping', ['-c', '1', '-W', '1', ip], { timeout: timeoutMs + 400 }, (err) => {
      resolve(!err);
    });
  });
}

async function probeReachable(host) {
  if (!stripHost(host)) return false;
  const tcp = await tcpProbeHost(host);
  if (tcp) return true;
  return icmpProbeHost(host);
}

function probeTargetForNas(json) {
  if (json.conn_mode === 'vpn' && json.tunnel_address) return stripHost(json.tunnel_address);
  return stripHost(json.nasname);
}

/**
 * @param {object} dumpMap Map pubkey → { handshake }
 */
async function attachNasLinkStatus(rows, dumpMap = new Map()) {
  const list = Array.isArray(rows) ? rows : [];
  const jsons = list.map((row) => (typeof row.toJSON === 'function' ? row.toJSON() : { ...row }));

  const needProbe = [];
  jsons.forEach((j, idx) => {
    const peer = j.wg_public_key ? dumpMap.get(j.wg_public_key) : null;
    const handshakeUnix = peer && peer.handshake ? peer.handshake : 0;
    const deviceStatus = j.device && j.device.status ? j.device.status : null;
    const draft = classifyNasLink({
      connMode: j.conn_mode,
      wgConfigured: !!j.wg_configured,
      deviceStatus,
      handshakeUnix,
      reachable: null
    });
    j.link = draft;
    if (draft.state !== 'up' && draft.state !== 'pending') needProbe.push(idx);
  });

  await Promise.all(needProbe.map(async (idx) => {
    const j = jsons[idx];
    const host = probeTargetForNas(j);
    let reachable = false;
    try { reachable = await probeReachable(host); } catch (_) { reachable = false; }
    const peer = j.wg_public_key ? dumpMap.get(j.wg_public_key) : null;
    j.link = classifyNasLink({
      connMode: j.conn_mode,
      wgConfigured: !!j.wg_configured,
      deviceStatus: j.device && j.device.status ? j.device.status : null,
      handshakeUnix: peer && peer.handshake ? peer.handshake : 0,
      reachable
    });
  }));

  return jsons;
}

module.exports = {
  HANDSHAKE_UP_SEC,
  handshakeAgeSec,
  formatAgeLabel,
  classifyNasLink,
  tcpProbeHost,
  probeReachable,
  probeTargetForNas,
  attachNasLinkStatus
};
