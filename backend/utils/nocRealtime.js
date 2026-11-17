'use strict';

/**
 * Sampling + ring-buffer helpers for the NOC dashboard live charts.
 *
 * monitor-traffic is expensive (~1s per parallel batch). Sampling every
 * physical ether/sfp (up to 16) plus extra VLAN/bridge ifaces made each
 * /realtime tick slower than the UI poll interval, so gauges and
 * timelines felt stuck. Keep the live path to the busiest 1–2 uplinks
 * plus whatever the operator pinned as a monitor.
 */

const HISTORY_MAX = 180;

function isSessionIfaceName(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  if (n.startsWith('<') && n.endsWith('>')) return true;
  return /^(pppoe|l2tp|sstp|pptp|ovpn)-/i.test(n);
}

function byteScore(iface) {
  return (Number(iface.rxByte) || 0) + (Number(iface.txByte) || 0);
}

function isPhysicalType(iface) {
  return /^(ether|sfp|wlan)/i.test(String(iface && iface.type || ''));
}

/** Busiest physical uplinks by cumulative bytes (not live rate). */
function pickUplinkNames(ifaces, limit = 2) {
  const running = (ifaces || []).filter((i) => i && i.running && !i.disabled);
  const phys = running.filter((i) => isPhysicalType(i) && !isSessionIfaceName(i.name));
  phys.sort((a, b) => byteScore(b) - byteScore(a));
  const picked = phys.slice(0, limit).map((i) => i.name).filter(Boolean);
  if (picked.length) return picked;
  return running.filter((i) => isPhysicalType(i)).slice(0, limit).map((i) => i.name);
}

/**
 * Uplinks (for the Bandwidth Now total) + extra monitor-preset ifaces
 * that still need per-iface samples (VLAN, bridge, a quieter ether, …).
 */
function selectSampleIfaces(ifaces, presetNames, opts = {}) {
  const uplinkLimit = opts.uplinkLimit == null ? 1 : opts.uplinkLimit;
  const extraLimit = opts.extraLimit == null ? 8 : opts.extraLimit;
  const uplinkNames = pickUplinkNames(ifaces, uplinkLimit);
  const uplinkSet = new Set(uplinkNames);
  const wanted = new Set(presetNames || []);
  const extraNames = [];
  for (const i of ifaces || []) {
    if (!i || !wanted.has(i.name) || uplinkSet.has(i.name)) continue;
    if (!i.running || i.disabled) continue;
    extraNames.push(i.name);
    if (extraNames.length >= extraLimit) break;
  }
  return {
    uplinkNames,
    extraNames,
    sampleIfaces: [...uplinkNames, ...extraNames],
  };
}

/**
 * Aggregate live rates. Total RX/TX is the *busiest sampled uplink*,
 * not the sum of every ether (that double-counts WAN+LAN+VLAN).
 */
function aggregateSampledTraffic(stats, uplinkNames) {
  const uplinkSet = new Set(uplinkNames || []);
  const perIface = {};
  let best = null;
  let bestSum = -1;
  for (const s of stats || []) {
    if (!s || !s.name) continue;
    const rx = Number(s.rxBitsPerSecond) || 0;
    const tx = Number(s.txBitsPerSecond) || 0;
    perIface[s.name] = {
      rxMbps: Math.round((rx / 1e6) * 100) / 100,
      txMbps: Math.round((tx / 1e6) * 100) / 100,
    };
    if (uplinkSet.size && !uplinkSet.has(s.name)) continue;
    const sum = rx + tx;
    if (sum > bestSum) {
      bestSum = sum;
      best = { rx, tx, name: s.name };
    }
  }
  return {
    rxMbps: best ? Math.round((best.rx / 1e6) * 100) / 100 : 0,
    txMbps: best ? Math.round((best.tx / 1e6) * 100) / 100 : 0,
    perIface,
    uplinkName: best ? best.name : null,
  };
}

function pickBandwidth(sample, selected) {
  if (!selected || !selected.length) {
    return { rx: sample.rxMbps || 0, tx: sample.txMbps || 0 };
  }
  const pi = sample.perIface || {};
  let rx = 0;
  let tx = 0;
  for (const name of selected) {
    if (pi[name]) {
      rx += pi[name].rxMbps || 0;
      tx += pi[name].txMbps || 0;
    }
  }
  return {
    rx: Math.round(rx * 100) / 100,
    tx: Math.round(tx * 100) / 100,
  };
}

function seriesFromHistory(slice, selectedIfaces) {
  const selected = (selectedIfaces && selectedIfaces.length) ? selectedIfaces : null;
  const list = Array.isArray(slice) ? slice : [];
  return {
    cpu:     list.map((s) => ({ x: s.ts, y: s.cpu })),
    mem:     list.map((s) => ({ x: s.ts, y: s.memPct })),
    pppoe:   list.map((s) => ({ x: s.ts, y: s.pppoe })),
    rx_mbps: list.map((s) => ({ x: s.ts, y: pickBandwidth(s, selected).rx })),
    tx_mbps: list.map((s) => ({ x: s.ts, y: pickBandwidth(s, selected).tx })),
  };
}

function ifaceSeriesFromHistory(slice) {
  const list = Array.isArray(slice) ? slice : [];
  const names = new Set();
  for (const s of list) {
    for (const n of Object.keys(s.perIface || {})) names.add(n);
  }
  const out = {};
  for (const n of names) {
    out[n] = {
      rx: list.map((s) => ({
        x: s.ts,
        y: (s.perIface && s.perIface[n] && s.perIface[n].rxMbps) || 0,
      })),
      tx: list.map((s) => ({
        x: s.ts,
        y: (s.perIface && s.perIface[n] && s.perIface[n].txMbps) || 0,
      })),
    };
  }
  return out;
}

function createRingBuffer(max = HISTORY_MAX) {
  const map = new Map();
  return {
    max,
    push(deviceId, sample) {
      if (!deviceId) return;
      const key = Number(deviceId);
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push(sample);
      while (arr.length > max) arr.shift();
    },
    get(deviceId) {
      return map.get(Number(deviceId)) || [];
    },
  };
}

module.exports = {
  HISTORY_MAX,
  isSessionIfaceName,
  pickUplinkNames,
  selectSampleIfaces,
  aggregateSampledTraffic,
  pickBandwidth,
  seriesFromHistory,
  ifaceSeriesFromHistory,
  createRingBuffer,
};
