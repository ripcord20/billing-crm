'use strict';

/**
 * Shared helpers for device CPU/memory/traffic.
 * MikroTik cpu-load is 0–100. Values like 1400 are almost always
 * cpu-frequency (MHz) or a bad SNMP OID, not utilization.
 */

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function unwrapRos(raw) {
  if (Array.isArray(raw)) return raw[0] && typeof raw[0] === 'object' ? raw[0] : {};
  return raw && typeof raw === 'object' ? raw : {};
}

function looksLikeCpuMhz(n) {
  return n > 100 && n >= 200 && n <= 8000;
}

/** Persist-safe CPU percent. Garbage (MHz / summed cores) becomes 0, never 1400. */
function normalizeCpuPercent(raw) {
  const n = toNum(raw);
  if (n == null || n < 0) return 0;
  if (n <= 100) return Math.round(n * 10) / 10;
  if (looksLikeCpuMhz(n)) return 0;
  return 100;
}

/** Display CPU: hide MHz-style garbage so the UI does not show 1400%. */
function displayCpuPercent(raw) {
  const n = toNum(raw);
  if (n == null || n < 0) return null;
  if (n <= 100) return Math.round(n);
  return null;
}

function normalizeMemPercent(raw) {
  const n = toNum(raw);
  if (n == null || n < 0) return 0;
  if (n <= 100) return Math.round(n * 10) / 10;
  return 100;
}

function displayMemPercent(raw) {
  const n = toNum(raw);
  if (n == null || n < 0) return null;
  if (n <= 100) return Math.round(n);
  return null;
}

function ifaceName(name) {
  return String(name || '').toLowerCase();
}

function ifaceType(type) {
  return String(type || '').toLowerCase();
}

function isCustomerTunnelIface(name, type) {
  const n = ifaceName(name);
  const t = ifaceType(type);
  if (/pppoe|pptp|l2tp|sstp|ovpn|openvpn|wireguard/.test(t)) return true;
  return (
    n.includes('<pppoe')
    || n.startsWith('pppoe-')
    || n.startsWith('pppoe<')
    || /^<?(l2tp|pptp|sstp|ovpn|wg)[-<]/.test(n)
    || n.includes('wireguard')
    || n.startsWith('<l2tp')
    || n.startsWith('<pptp')
    || n.startsWith('<sstp')
    || n.startsWith('<ovpn')
  );
}

function isVirtualSwitchIface(name, type) {
  const n = ifaceName(name);
  const t = ifaceType(type);
  if (['bridge', 'vlan', 'vrrp', 'loopback'].includes(t)) return true;
  return /^(lo|loopback|bridge|vlan|vrrp)([.-]|$)/.test(n) || n === 'lo';
}

function isUplinkIface(name, type) {
  if (isCustomerTunnelIface(name, type) || isVirtualSwitchIface(name, type)) return false;
  const n = ifaceName(name);
  const t = ifaceType(type);
  if (/wan|sfp|combo|qsfp/.test(n)) return true;
  return ['ether', 'sfp-sfpplus', 'sfpplus', 'qsfpplus', 'qsfp', 'bonding', 'wlan'].includes(t)
    || /^(ether|sfp|combo|qsfp|bonding)/.test(n);
}

/**
 * Exact PPPoE server name match. Do not use substring includes — that
 * flags every customer when the username is a short token.
 */
function pppoeIfaceMatchesUsername(ifaceNameRaw, username) {
  const n = ifaceName(ifaceNameRaw).replace(/^<|>$/g, '');
  const u = String(username || '').toLowerCase().trim();
  if (!u || u.length < 2) return false;
  return n === `pppoe-${u}` || n === u || ifaceName(ifaceNameRaw) === `<pppoe-${u}>` || ifaceName(ifaceNameRaw) === `<${u}>`;
}

function pickTrafficIfaces(interfaces) {
  const list = (interfaces || []).filter((i) => i && i.name);
  const running = list.filter((i) => i.running !== false && i.disabled !== true);
  const namedWan = running.filter((i) => {
    const n = ifaceName(i.name);
    const comment = String(i.comment || '').toLowerCase();
    return !isCustomerTunnelIface(i.name, i.type)
      && !isVirtualSwitchIface(i.name, i.type)
      && (/wan/.test(n) || /wan|uplink|internet/.test(comment) || /sfp|combo|qsfp/.test(n));
  });
  if (namedWan.length) return namedWan;

  const phys = running.filter((i) => isUplinkIface(i.name, i.type));
  if (!phys.length) {
    return running.filter((i) => !isCustomerTunnelIface(i.name, i.type) && !isVirtualSwitchIface(i.name, i.type));
  }

  const scored = phys.map((i) => ({
    iface: i,
    rate: (Number(i.rxMbps) || 0) + (Number(i.txMbps) || 0)
  })).sort((a, b) => b.rate - a.rate);

  // One busy WAN is typical. Summing every ether (LAN+WAN) or WAN+PPPoE
  // makes RX/TX look symmetric.
  if (scored[0] && scored[0].rate > 0) return [scored[0].iface];
  return phys.slice(0, 2);
}

function aggregateDeviceTraffic(interfaces) {
  const use = pickTrafficIfaces(interfaces);
  let rx = 0;
  let tx = 0;
  for (const i of use) {
    rx += Number(i.rxMbps) || 0;
    tx += Number(i.txMbps) || 0;
  }
  return {
    totalRxMbps: Math.round(rx * 1000) / 1000,
    totalTxMbps: Math.round(tx * 1000) / 1000,
    trafficIfaces: use.map((i) => i.name),
    trafficScope: use.length === 1 ? use[0].name : (use.length ? `uplink (${use.length})` : 'none')
  };
}

function latestUniqueBy(rows, keyFn) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const key = keyFn(row);
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function presentDeviceMetrics(device) {
  const j = device && typeof device.toJSON === 'function' ? device.toJSON() : { ...(device || {}) };
  const cpu = displayCpuPercent(j.cpu_load);
  const mem = displayMemPercent(j.memory_usage);
  j.cpu_load = cpu == null ? 0 : cpu;
  j.memory_usage = mem == null ? 0 : mem;
  j.cpu_display = cpu;
  j.memory_display = mem;
  return j;
}

module.exports = {
  toNum,
  unwrapRos,
  looksLikeCpuMhz,
  normalizeCpuPercent,
  displayCpuPercent,
  normalizeMemPercent,
  displayMemPercent,
  isCustomerTunnelIface,
  isVirtualSwitchIface,
  isUplinkIface,
  pppoeIfaceMatchesUsername,
  pickTrafficIfaces,
  aggregateDeviceTraffic,
  latestUniqueBy,
  presentDeviceMetrics
};
