'use strict';

/**
 * Shared helpers for device CPU/memory/traffic.
 *
 * Traffic totals MUST use a single uplink. Summing LAN+WAN (or every ether)
 * always looks symmetric because bytes that enter WAN leave on LAN.
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

function normalizeCpuPercent(raw) {
  const n = toNum(raw);
  if (n == null || n < 0) return 0;
  if (n <= 100) return Math.round(n * 10) / 10;
  if (looksLikeCpuMhz(n)) return 0;
  return 100;
}

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

/** PPPoE/L2TP/PPTP/OVPN client toward upstream (WAN), e.g. pppoe-out1. */
function isIspClientIface(name, type) {
  const n = ifaceName(name);
  const t = ifaceType(type);
  if (/-(out)\d*$/.test(n)) return true;
  return t === 'pppoe-out' || /pppoe-out|l2tp-out|pptp-out|sstp-out|ovpn-out/.test(n);
}

/** Dynamic customer tunnels (<pppoe-user>), not ISP WAN client. */
function isCustomerTunnelIface(name, type) {
  if (isIspClientIface(name, type)) return false;
  const n = ifaceName(name);
  const t = ifaceType(type);
  if (n.startsWith('<') && n.endsWith('>')) return true;
  if (/pppoe|pptp|l2tp|sstp|ovpn|openvpn|wireguard/.test(t) && !isIspClientIface(name, type)) {
    return true;
  }
  return (
    n.includes('<pppoe')
    || n.startsWith('pppoe-')
    || n.startsWith('pppoe<')
    || /pppoe|l2tp|pptp|sstp|ovpn|openvpn|wireguard/.test(n)
    || /^<?wg[-<]/.test(n)
  );
}

function isDdosWatchIface(name, type) {
  if (isCustomerTunnelIface(name, type) || isVirtualSwitchIface(name, type)) return false;
  return /wan|sfp|combo|qsfp/.test(ifaceName(name)) || isIspClientIface(name, type);
}

function isVirtualSwitchIface(name, type) {
  const n = ifaceName(name);
  const t = ifaceType(type);
  if (['bridge', 'vlan', 'vrrp', 'loopback'].includes(t)) return true;
  return /^(lo|loopback|bridge|vlan|vrrp)([.-]|$)/.test(n) || n === 'lo';
}

function isUplinkIface(name, type) {
  if (isCustomerTunnelIface(name, type) || isVirtualSwitchIface(name, type)) return false;
  if (isIspClientIface(name, type)) return true;
  const n = ifaceName(name);
  const t = ifaceType(type);
  if (/wan|sfp|combo|qsfp/.test(n)) return true;
  return ['ether', 'sfp-sfpplus', 'sfpplus', 'qsfpplus', 'qsfp', 'bonding', 'wlan'].includes(t)
    || /^(ether|sfp|combo|qsfp|bonding)/.test(n);
}

function pppoeIfaceMatchesUsername(ifaceNameRaw, username) {
  const n = ifaceName(ifaceNameRaw).replace(/^<|>$/g, '');
  const u = String(username || '').toLowerCase().trim();
  if (!u || u.length < 2) return false;
  return n === `pppoe-${u}` || n === u || ifaceName(ifaceNameRaw) === `<pppoe-${u}>` || ifaceName(ifaceNameRaw) === `<${u}>`;
}

function ifaceRateMbps(i) {
  const rx = Number(i && i.rxMbps);
  const tx = Number(i && i.txMbps);
  if (Number.isFinite(rx) || Number.isFinite(tx)) {
    return (Number.isFinite(rx) ? rx : 0) + (Number.isFinite(tx) ? tx : 0);
  }
  const rxBps = Number(i && i.rxBitsPerSecond) || 0;
  const txBps = Number(i && i.txBitsPerSecond) || 0;
  return (rxBps + txBps) / 1e6;
}

function ifaceRxMbps(i) {
  const rx = Number(i && i.rxMbps);
  if (Number.isFinite(rx)) return rx;
  return (Number(i && i.rxBitsPerSecond) || 0) / 1e6;
}

function ifaceTxMbps(i) {
  const tx = Number(i && i.txMbps);
  if (Number.isFinite(tx)) return tx;
  return (Number(i && i.txBitsPerSecond) || 0) / 1e6;
}

/** Parse RouterOS immediate-gw "1.2.3.4%ether1" / "pppoe-out1". */
function parseRouteGatewayIface(route) {
  if (!route || typeof route !== 'object') return null;
  const gw = String(route['immediate-gw'] || route['immediate-gateway'] || route.gateway || '');
  const pct = gw.lastIndexOf('%');
  if (pct >= 0) {
    const iface = gw.slice(pct + 1).trim();
    return iface || null;
  }
  const gwHost = gw.split('/')[0].trim();
  if (gwHost && /[a-zA-Z_]/.test(gwHost) && !/^\d+\.\d+\.\d+\.\d+$/.test(gwHost)) {
    return gwHost;
  }
  const named = String(route['vrf-interface'] || route.interface || '').trim();
  return named || null;
}

function pickActiveDefaultRouteIface(routes) {
  const list = Array.isArray(routes) ? routes : [];
  const active = list.filter((r) => {
    if (!r) return false;
    const dst = String(r['dst-address'] || r.dstAddress || '');
    const act = r.active === true || r.active === 'true';
    return act && (dst === '0.0.0.0/0' || dst === '::/0');
  }).sort((a, b) => (parseInt(a.distance, 10) || 1) - (parseInt(b.distance, 10) || 1));
  return parseRouteGatewayIface(active[0] || null);
}

/**
 * Always return 0 or 1 interface for device totals.
 * Pin (Device.uplink_iface) wins, then default-route iface, then heuristic.
 * Never sum LAN+WAN — that is why new devices look RX≈TX.
 */
function pickTrafficIfaces(interfaces, pinnedName) {
  const list = (interfaces || []).filter((i) => i && i.name);
  const running = list.filter((i) => i.running !== false && i.disabled !== true);
  const pin = String(pinnedName || '').trim();
  if (pin) {
    const exact = running.find((i) => i.name === pin) || list.find((i) => i.name === pin);
    if (exact) return [exact];
  }

  const prefer = running.filter((i) => {
    if (isCustomerTunnelIface(i.name, i.type) || isVirtualSwitchIface(i.name, i.type)) return false;
    const n = ifaceName(i.name);
    const comment = String(i.comment || '').toLowerCase();
    return isIspClientIface(i.name, i.type)
      || /wan/.test(n)
      || /wan|uplink|internet/.test(comment)
      || /sfp|combo|qsfp/.test(n);
  });

  const phys = running.filter((i) => isUplinkIface(i.name, i.type));
  const pool = prefer.length ? prefer : (phys.length ? phys : running.filter((i) =>
    !isCustomerTunnelIface(i.name, i.type) && !isVirtualSwitchIface(i.name, i.type)
  ));
  if (!pool.length) return running.slice(0, 1);

  const scored = pool.map((i) => ({ iface: i, rate: ifaceRateMbps(i) }))
    .sort((a, b) => b.rate - a.rate);

  if (scored[0] && scored[0].rate > 0 && scored.length > 1) {
    const top = scored.filter((s) => s.rate >= scored[0].rate * 0.8);
    const wanLike = top.find((s) => ifaceRxMbps(s.iface) > ifaceTxMbps(s.iface) * 1.3);
    if (wanLike) return [wanLike.iface];
    const named = top.find((s) => isIspClientIface(s.iface.name, s.iface.type)
      || /wan|sfp|combo|qsfp/.test(ifaceName(s.iface.name)));
    if (named) return [named.iface];
  }
  return [scored[0].iface];
}

function bpsToMbps(bps) {
  return Math.round((Number(bps) || 0) / 1e3) / 1e3;
}

function mergeIfaceRates(ifaces, stats) {
  const byName = new Map();
  for (const s of stats || []) {
    if (s && s.name) byName.set(s.name, s);
  }
  return (ifaces || []).map((i) => {
    const s = byName.get(i.name);
    const rxBps = s ? Number(s.rxBitsPerSecond) || 0 : Number(i.rxBitsPerSecond) || 0;
    const txBps = s ? Number(s.txBitsPerSecond) || 0 : Number(i.txBitsPerSecond) || 0;
    return {
      ...i,
      rxBitsPerSecond: rxBps,
      txBitsPerSecond: txBps,
      rxMbps: bpsToMbps(rxBps),
      txMbps: bpsToMbps(txBps)
    };
  });
}

function aggregateDeviceTraffic(interfaces, pinnedName) {
  const use = pickTrafficIfaces(interfaces, pinnedName).slice(0, 1);
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
    trafficScope: use.length ? use[0].name : 'none'
  };
}

function scopeDeviceTraffic(ifaces, stats, pinnedName) {
  const merged = mergeIfaceRates(ifaces, stats);
  const agg = aggregateDeviceTraffic(merged, pinnedName);
  const pick = new Set(agg.trafficIfaces);
  return {
    interfaces: merged.map((i) => ({ ...i, include_in_total: pick.has(i.name) })),
    totalRxBps: Math.round((agg.totalRxMbps || 0) * 1e6),
    totalTxBps: Math.round((agg.totalTxMbps || 0) * 1e6),
    ...agg
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
  isIspClientIface,
  isVirtualSwitchIface,
  isUplinkIface,
  isDdosWatchIface,
  pppoeIfaceMatchesUsername,
  parseRouteGatewayIface,
  pickActiveDefaultRouteIface,
  pickTrafficIfaces,
  mergeIfaceRates,
  scopeDeviceTraffic,
  bpsToMbps,
  aggregateDeviceTraffic,
  latestUniqueBy,
  presentDeviceMetrics
};
