'use strict';

/**
 * Agregasi pemakaian bandwidth pelanggan dari beberapa sumber MikroTik.
 *
 * Sumber (per router):
 *   1. /queue/simple        — kumulatif paling andal jika queue persist
 *   2. /interface           — rx/tx-byte pada interface sesi (pppoe-in, l2tp-in, …)
 *   3. /ppp/active          — bytes-in/out sesi (reset saat reconnect)
 *   4. /ip/hotspot/active   — bytes-in/out hotspot
 *
 * Jangan SUM queue + interface untuk pelanggan yang sama (double-count).
 * Di satu router: ambil MAX bytes & MAX rate. Antar-router: SUM (pelanggan split).
 *
 * Arah byte interface / PPP / hotspot:
 *   Router tx / bytes-out = download pelanggan
 *   Router rx / bytes-in  = upload pelanggan
 */

const CUSTOMER_IFACE_TYPES = new Set([
  'pppoe-in', 'l2tp-in', 'sstp-in', 'pptp-in', 'ovpn-in', 'ike2'
]);

const SESSION_NAME_RE = /^<?(pppoe|l2tp|sstp|pptp|ovpn)-/i;

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseSessionUsername(name) {
  let s = String(name || '').trim();
  if (!s) return '';
  s = s.replace(/^<|>$/g, '');
  s = s.replace(/^(pppoe|l2tp|sstp|pptp|ovpn)-/i, '');
  return s.toLowerCase();
}

function firstIp(target) {
  if (!target) return '';
  return String(target).split('/')[0].split(',')[0].trim();
}

function isCustomerInterface(iface) {
  if (!iface) return false;
  const type = String(iface.type || '').toLowerCase();
  const name = String(iface.name || '');
  const bare = name.replace(/^<|>$/g, '');
  if (type.endsWith('-out')) return false;
  if (/^(pppoe|l2tp|sstp|pptp|ovpn)-out/i.test(bare)) return false;
  if (CUSTOMER_IFACE_TYPES.has(type)) return true;
  if (SESSION_NAME_RE.test(name)) return true;
  return false;
}

function ifaceSource(iface) {
  const type = String(iface.type || '').toLowerCase();
  if (type.startsWith('l2tp')) return 'l2tp';
  if (type.startsWith('sstp')) return 'sstp';
  if (type.startsWith('pptp')) return 'pptp';
  if (type.startsWith('ovpn')) return 'ovpn';
  const name = String(iface.name || '').toLowerCase();
  if (name.includes('l2tp')) return 'l2tp';
  if (name.includes('sstp')) return 'sstp';
  return 'pppoe';
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** RouterOS uptime: "1w2d3h4m5s" / "4h12m" → detik. */
function parseUptimeSeconds(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || s === 'never') return 0;
  const take = (re, mul) => {
    const m = s.match(re);
    return m ? parseInt(m[1], 10) * mul : 0;
  };
  return take(/(\d+)\s*w/, 604800)
    + take(/(\d+)\s*d/, 86400)
    + take(/(\d+)\s*h/, 3600)
    + take(/(\d+)\s*m/, 60)
    + take(/(\d+)\s*s/, 1);
}

function gb(bytes) {
  return (num(bytes) / 1073741824).toFixed(2);
}

function mbpsFromBytes(bytes, uptimeSec) {
  if (!uptimeSec || uptimeSec <= 0) return 0;
  return (num(bytes) * 8) / uptimeSec / 1e6;
}

function buildIndex(customers) {
  const byPppoe = new Map();
  const byIp = new Map();
  const byName = new Map();
  for (const c of customers || []) {
    if (c.pppoe_username) byPppoe.set(String(c.pppoe_username).toLowerCase(), c);
    if (c.static_ip) byIp.set(String(c.static_ip).trim(), c);
    if (c.name) byName.set(norm(c.name), c);
    if (c.customer_id) byName.set(norm(c.customer_id), c);
  }
  return { byPppoe, byIp, byName };
}

function matchByName(index, rawName) {
  const n = norm(rawName);
  if (!n) return null;
  if (index.byName.has(n)) return index.byName.get(n);
  for (const [key, cust] of index.byName) {
    if (key.length >= 4 && n.includes(key)) return cust;
  }
  return null;
}

function matchCustomer(index, hints = {}) {
  const { name, username, address, target, allowFuzzyName = true } = hints;
  const uname = String(username || '').toLowerCase();
  if (uname && index.byPppoe.has(uname)) return index.byPppoe.get(uname);

  const parsed = parseSessionUsername(name || username || '');
  if (parsed && index.byPppoe.has(parsed)) return index.byPppoe.get(parsed);

  if (name) {
    const nl = String(name).toLowerCase();
    if (index.byPppoe.has(nl)) return index.byPppoe.get(nl);
  }

  const ip = firstIp(address || target);
  if (ip && index.byIp.has(ip)) return index.byIp.get(ip);

  if (name && allowFuzzyName) return matchByName(index, name);
  return null;
}

function looksLikeSessionName(name) {
  return SESSION_NAME_RE.test(String(name || ''));
}

/** Pelanggan sintetis dari username sesi/queue, dipakai kalau belum ada di CRM. */
function syntheticCustomer(username, extra = {}) {
  const user = String(username || '').trim();
  if (!user) return null;
  const key = user.toLowerCase();
  return {
    id: 'u:' + key,
    customer_id: extra.customer_id || user,
    name: extra.name || user,
    pppoe_username: user,
    static_ip: extra.static_ip || extra.address || null,
    package: null,
    unmatched: true
  };
}

function resolveCustomer(index, hints = {}, { allowSynthetic = false } = {}) {
  const matched = matchCustomer(index, hints);
  if (matched) return matched;
  if (!allowSynthetic) return null;
  const parsed = parseSessionUsername(hints.username || hints.name || hints.user || '');
  if (!parsed) return null;
  if (!looksLikeSessionName(hints.name || hints.username) && !hints.forceSynthetic) return null;
  const display = String(hints.username || hints.name || hints.user || parsed)
    .replace(/^<|>$/g, '')
    .replace(/^(pppoe|l2tp|sstp|pptp|ovpn)-/i, '');
  return syntheticCustomer(parsed, {
    name: display || parsed,
    customer_id: display || parsed,
    address: firstIp(hints.address || hints.target)
  });
}

function emptyRow(customer) {
  return {
    customer,
    bytes: 0,
    download: 0,
    upload: 0,
    rateIn: 0,
    rateOut: 0,
    uptimeSec: 0,
    sources: new Set()
  };
}

function addUsage(byId, customer, usage) {
  if (!customer || customer.id == null) return;
  let prev = byId.get(customer.id);
  if (!prev) {
    prev = emptyRow(customer);
    byId.set(customer.id, prev);
  }
  const download = num(usage.download);
  const upload = num(usage.upload);
  const rateIn = num(usage.rateIn);
  const rateOut = num(usage.rateOut);
  const uptimeSec = num(usage.uptimeSec);
  if (usage.source) prev.sources.add(usage.source);
  // Download dan upload di-MAX terpisah — jangan gabung jadi satu angka.
  if (download > prev.download) prev.download = download;
  if (upload > prev.upload) prev.upload = upload;
  prev.bytes = prev.download + prev.upload;
  if (rateIn > prev.rateIn) prev.rateIn = rateIn;
  if (rateOut > prev.rateOut) prev.rateOut = rateOut;
  if (uptimeSec > prev.uptimeSec) prev.uptimeSec = uptimeSec;
}

function mergeAcrossRouters(acc, perRouter) {
  for (const [id, row] of perRouter) {
    const prev = acc.get(id);
    if (!prev) {
      acc.set(id, {
        customer: row.customer,
        bytes: row.bytes,
        download: row.download,
        upload: row.upload,
        rateIn: row.rateIn,
        rateOut: row.rateOut,
        uptimeSec: row.uptimeSec || 0,
        sources: new Set(row.sources)
      });
      continue;
    }
    prev.download += row.download;
    prev.upload += row.upload;
    prev.bytes = prev.download + prev.upload;
    prev.rateIn += row.rateIn;
    prev.rateOut += row.rateOut;
    if ((row.uptimeSec || 0) > prev.uptimeSec) prev.uptimeSec = row.uptimeSec;
    row.sources.forEach((s) => prev.sources.add(s));
  }
  return acc;
}

function mergeSnapshot(index, snap = {}) {
  const byId = new Map();

  for (const q of snap.queues || []) {
    const customer = resolveCustomer(index, {
      name: q.name,
      username: q.name,
      target: q.target,
      allowFuzzyName: true
    }, { allowSynthetic: looksLikeSessionName(q.name) });
    if (!customer) continue;
    const download = num(q.bytesIn);
    const upload = num(q.bytesOut);
    addUsage(byId, customer, {
      bytes: download + upload,
      download,
      upload,
      rateIn: num(q.rateIn),
      rateOut: num(q.rateOut),
      source: 'queue'
    });
  }

  for (const iface of snap.interfaces || []) {
    if (iface.disabled === true || iface.disabled === 'true') continue;
    if (!isCustomerInterface(iface)) continue;
    const customer = resolveCustomer(index, {
      name: iface.name,
      username: parseSessionUsername(iface.name),
      allowFuzzyName: false
    }, { allowSynthetic: true });
    if (!customer) continue;
    const download = num(iface.txByte);
    const upload = num(iface.rxByte);
    addUsage(byId, customer, {
      bytes: download + upload,
      download,
      upload,
      rateIn: 0,
      rateOut: 0,
      source: ifaceSource(iface)
    });
  }

  for (const sess of snap.sessions || []) {
    const customer = resolveCustomer(index, {
      name: sess.name,
      username: sess.name,
      address: sess.address,
      allowFuzzyName: false,
      forceSynthetic: true
    }, { allowSynthetic: true });
    if (!customer) continue;
    const upload = num(sess.bytesIn);
    const download = num(sess.bytesOut);
    const svc = String(sess.service || 'pppoe').toLowerCase();
    addUsage(byId, customer, {
      bytes: download + upload,
      download,
      upload,
      rateIn: 0,
      rateOut: 0,
      uptimeSec: parseUptimeSeconds(sess.uptime),
      source: svc === 'pppoe' ? 'pppoe' : svc
    });
  }

  for (const hs of snap.hotspot || []) {
    const customer = resolveCustomer(index, {
      name: hs.user,
      username: hs.user,
      address: hs.address,
      allowFuzzyName: false,
      forceSynthetic: true
    }, { allowSynthetic: true });
    if (!customer) continue;
    const upload = num(hs.bytesIn);
    const download = num(hs.bytesOut);
    addUsage(byId, customer, {
      bytes: download + upload,
      download,
      upload,
      rateIn: 0,
      rateOut: 0,
      uptimeSec: parseUptimeSeconds(hs.uptime),
      source: 'hotspot'
    });
  }

  return byId;
}

async function collectLiveSnapshot(mt) {
  const tasks = [
    typeof mt.getQueueStats === 'function' ? mt.getQueueStats() : Promise.resolve([]),
    typeof mt.getInterfaces === 'function' ? mt.getInterfaces() : Promise.resolve([]),
    typeof mt.getPPPoESessions === 'function' ? mt.getPPPoESessions() : Promise.resolve([]),
    typeof mt.getHotspotActive === 'function' ? mt.getHotspotActive() : Promise.resolve([])
  ];
  const settled = await Promise.allSettled(tasks);
  const val = (i) => (
    settled[i].status === 'fulfilled' && Array.isArray(settled[i].value)
      ? settled[i].value
      : []
  );
  return {
    queues: val(0),
    interfaces: val(1),
    sessions: val(2),
    hotspot: val(3)
  };
}

async function collectFromDevices(index, deviceIds, getMt) {
  const acc = new Map();
  for (const devId of deviceIds) {
    let mt;
    try {
      mt = await getMt(devId);
    } catch (e) {
      console.log(`[TopCustomers] Router ${devId || 'default'} tidak terjangkau: ${e.message}`);
      continue;
    }
    if (!mt) continue;
    let snap;
    try {
      snap = await collectLiveSnapshot(mt);
    } catch (e) {
      console.log(`[TopCustomers] Poll ${devId || 'default'} gagal: ${e.message}`);
      continue;
    }
    mergeAcrossRouters(acc, mergeSnapshot(index, snap));
  }
  return acc;
}

function formatRows(acc, { limit = 10, sortBy = 'bytes' } = {}) {
  const rows = Array.from(acc.values()).map((row) => {
    const speedDown = num(row.customer.package?.speed_down);
    const liveDown = row.rateIn / 1e6;
    const liveUp = row.rateOut / 1e6;
    const avgDown = mbpsFromBytes(row.download, row.uptimeSec);
    const avgUp = mbpsFromBytes(row.upload, row.uptimeSec);
    const downMbps = liveDown > 0 ? liveDown : avgDown;
    const upMbps = liveUp > 0 ? liveUp : avgUp;
    const rateSource = (liveDown > 0 || liveUp > 0) ? 'live' : (row.uptimeSec > 0 ? 'session' : 'none');
    return {
      id: row.customer.id,
      customer_id: row.customer.customer_id,
      name: row.customer.name,
      pppoe_username: row.customer.pppoe_username,
      package_name: row.customer.package?.name || '-',
      speed_down: speedDown,
      speed_up: num(row.customer.package?.speed_up),
      download_gb: gb(row.download),
      upload_gb: gb(row.upload),
      total_gb: gb(row.download + row.upload),
      avg_download_mbps: downMbps.toFixed(2),
      avg_upload_mbps: upMbps.toFixed(2),
      peak_download_mbps: downMbps.toFixed(2),
      rate_source: rateSource,
      usage_percent: speedDown ? ((downMbps / speedDown) * 100).toFixed(1) : 0,
      sources: Array.from(row.sources),
      unmatched: !!row.customer.unmatched
    };
  }).filter((r) => (
    parseFloat(r.download_gb) > 0
    || parseFloat(r.upload_gb) > 0
    || parseFloat(r.avg_download_mbps) > 0
    || parseFloat(r.avg_upload_mbps) > 0
  ));

  const score = sortBy === 'rate'
    ? (r) => parseFloat(r.avg_download_mbps) + parseFloat(r.avg_upload_mbps)
    : (r) => parseFloat(r.total_gb);
  rows.sort((a, b) => score(b) - score(a));
  return rows.slice(0, limit);
}

module.exports = {
  CUSTOMER_IFACE_TYPES,
  norm,
  parseSessionUsername,
  firstIp,
  isCustomerInterface,
  ifaceSource,
  buildIndex,
  matchCustomer,
  addUsage,
  mergeSnapshot,
  mergeAcrossRouters,
  collectLiveSnapshot,
  collectFromDevices,
  formatRows,
  looksLikeSessionName,
  syntheticCustomer,
  resolveCustomer,
  parseUptimeSeconds,
  mbpsFromBytes
};
