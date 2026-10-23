'use strict';

/**
 * Filter interface untuk grafik traffic dashboard.
 * Menjumlahkan semua interface (WAN + LAN + sesi PPPoE) menghitung
 * paket yang sama berkali-kali, sehingga MAX RX/TX jadi ~2× uplink asli.
 */

function isSessionIfaceName(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  if (n.startsWith('<') && n.endsWith('>')) return true;
  return /^(pppoe|l2tp|sstp|pptp|ovpn)-/i.test(n);
}

function byteScore(iface) {
  return (Number(iface.rxByte) || 0) + (Number(iface.txByte) || 0);
}

function rateScore(sample) {
  return (Number(sample.rxBitsPerSecond) || 0) + (Number(sample.txBitsPerSecond) || 0);
}

/** Interface fisik/uplink yang running, diurut dari traffic kumulatif terbesar. */
function pickUplinkInterfaces(ifaces, limit = 8) {
  const running = (ifaces || []).filter((i) => i && i.running && !i.disabled);
  const phys = running.filter((i) => !isSessionIfaceName(i.name));
  phys.sort((a, b) => byteScore(b) - byteScore(a));
  const picked = phys.slice(0, limit);
  if (picked.length) return picked;
  return running.slice(0, limit);
}

/** Satu sample untuk chart "Auto": interface non-sesi dengan (rx+tx) live terbesar. */
function pickBusiestSample(samples) {
  const list = Array.isArray(samples) ? samples : [];
  let best = null;
  let bestSum = -1;
  for (const s of list) {
    if (!s || isSessionIfaceName(s.name)) continue;
    const sum = rateScore(s);
    if (sum > bestSum) {
      bestSum = sum;
      best = s;
    }
  }
  if (best) return best;
  for (const s of list) {
    if (!s) continue;
    const sum = rateScore(s);
    if (sum > bestSum) {
      bestSum = sum;
      best = s;
    }
  }
  return best;
}

function avgSeries(vals) {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function maxSeries(vals) {
  if (!vals.length) return 0;
  return Math.max(...vals);
}

module.exports = {
  isSessionIfaceName,
  pickUplinkInterfaces,
  pickBusiestSample,
  avgSeries,
  maxSeries
};
