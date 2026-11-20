'use strict';

/**
 * Remote GUI modem pelanggan lewat overlay WireGuard.
 *
 * HP/PC teknisi harus sudah join WireGuard Fiberix. Endpoint ini HANYA
 * mengembalikan URL http(s)://<IP privat> — tidak mem-proxy HTTP (hindari SSRF
 * ke IP publik) dan tidak menghapus objek PPP di MikroTik.
 */

const { getMikrotikInstanceByDevice } = require('./MikrotikService');

const DEFAULT_HINT =
  'GUI modem dibuka. Pastikan HP/PC sudah terhubung WireGuard Fiberix.';
const LOOKUP_MS = 8000;

function parseIpv4(ip) {
  const s = String(ip || '').trim().split('/')[0];
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

function isAllowedModemIp(ip) {
  const p = parseIpv4(ip);
  if (!p) return false;
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function sanitizePort(port) {
  const n = parseInt(port, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return 80;
  return n;
}

function sanitizeScheme(scheme) {
  return String(scheme || 'http').toLowerCase() === 'https' ? 'https' : 'http';
}

function normalizeIp(ip) {
  if (!isAllowedModemIp(ip)) return null;
  return String(ip).trim().split('/')[0];
}

function buildModemRemoteUrl({ ip, scheme, port }) {
  const host = normalizeIp(ip);
  if (!host) return null;
  const s = sanitizeScheme(scheme);
  const p = sanitizePort(port);
  if ((s === 'http' && p === 80) || (s === 'https' && p === 443)) {
    return s + '://' + host;
  }
  return s + '://' + host + ':' + p;
}

function pickRemoteIp({ staticIp, liveIp, connectionType }) {
  const live = normalizeIp(liveIp);
  const stat = normalizeIp(staticIp);
  if (String(connectionType || '').toLowerCase() === 'static') {
    return { ip: stat, source: stat ? 'static' : null };
  }
  if (live) return { ip: live, source: 'session' };
  if (stat) return { ip: stat, source: 'static' };
  return { ip: null, source: null };
}

function extractSessionIp(row) {
  if (!row) return null;
  return normalizeIp(row.address || row.ip || '');
}

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function loadRemoteSettings(sequelize) {
  const out = { scheme: 'http', port: 80, hint: DEFAULT_HINT };
  if (!sequelize) return out;
  try {
    const rows = await sequelize.query(
      "SELECT `key`, value FROM app_settings WHERE `key` IN ('modem_remote_scheme','modem_remote_port','modem_remote_hint')",
      { type: sequelize.QueryTypes.SELECT }
    );
    for (const r of rows || []) {
      if (r.key === 'modem_remote_scheme') out.scheme = sanitizeScheme(r.value);
      if (r.key === 'modem_remote_port') out.port = sanitizePort(r.value);
      if (r.key === 'modem_remote_hint' && String(r.value || '').trim()) {
        out.hint = String(r.value);
      }
    }
  } catch (_) { /* tabel/kolom belum ada → default */ }
  return out;
}

async function listRouterIds(preferredId) {
  const ids = [];
  const pref = preferredId ? Number(preferredId) : 0;
  if (pref) ids.push(pref);
  try {
    const { Device } = require('../models');
    const rows = await Device.findAll({
      where: { type: 'router', is_active: true },
      attributes: ['id'],
      order: [['id', 'ASC']]
    });
    for (const d of rows) {
      const id = Number(d.id);
      if (id && !ids.includes(id)) ids.push(id);
    }
  } catch (_) { /* skema device berbeda → pakai preferred saja */ }
  return ids;
}

async function lookupOnNas(mt, username, connectionType) {
  const want = String(username || '').toLowerCase();
  if (!want || !mt) return null;

  const sessions = await withTimeout(
    typeof mt.getPPPoESessions === 'function' ? mt.getPPPoESessions() : Promise.resolve([]),
    LOOKUP_MS
  ).catch(() => []);
  const hit = (sessions || []).find((s) => String(s.name || '').toLowerCase() === want);
  const pppIp = extractSessionIp(hit);
  if (pppIp) return { ip: pppIp, source: 'pppoe' };

  if (String(connectionType || '').toLowerCase() === 'hotspot' && typeof mt.getHotspotActive === 'function') {
    const hs = await withTimeout(mt.getHotspotActive(), LOOKUP_MS).catch(() => []);
    const h = (hs || []).find((s) =>
      String(s.user || s.name || '').toLowerCase() === want
    );
    const hip = extractSessionIp(h);
    if (hip) return { ip: hip, source: 'hotspot' };
  }
  return null;
}

async function findLiveIp(customer, deps = {}) {
  const username = customer && (customer.pppoe_username || customer.hotspot_username);
  if (!username) return null;
  const listIds = deps.listRouterIds || listRouterIds;
  const getMt = deps.getMikrotikInstanceByDevice || getMikrotikInstanceByDevice;
  const ids = await listIds(customer.mikrotik_id);
  if (!ids.length) {
    try {
      const mt = await getMt(null);
      const hit = await lookupOnNas(mt, username, customer.connection_type);
      if (hit) return hit;
    } catch (_) { /* tidak ada NAS default */ }
    return null;
  }
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const mt = await getMt(id);
      return lookupOnNas(mt, username, customer.connection_type);
    })
  );
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && r.value.ip) return r.value;
  }
  return null;
}

async function resolveModemRemote(customer, sequelize, query = {}, deps = {}) {
  if (!customer) {
    return { ok: false, message: 'Customer not found' };
  }
  const settings = await loadRemoteSettings(sequelize);
  if (query && query.scheme) settings.scheme = sanitizeScheme(query.scheme);
  if (query && query.port) settings.port = sanitizePort(query.port);

  const live = await findLiveIp(customer, deps);
  const picked = pickRemoteIp({
    staticIp: customer.static_ip,
    liveIp: live && live.ip,
    connectionType: customer.connection_type
  });
  if (!picked.ip) {
    if (!customer.pppoe_username && !customer.static_ip) {
      return {
        ok: false,
        message: 'IP modem tidak ditemukan. Isi IP statis atau PPPoE username, lalu pastikan pelanggan online.'
      };
    }
    return {
      ok: false,
      message: 'Modem belum online atau IP tidak di jaringan WireGuard/LAN. Coba lagi saat pelanggan terhubung.'
    };
  }

  const url = buildModemRemoteUrl({
    ip: picked.ip,
    scheme: settings.scheme,
    port: settings.port
  });
  if (!url) {
    return { ok: false, message: 'IP modem tidak di jaringan internal (WireGuard / LAN).' };
  }
  return {
    ok: true,
    url,
    ip: picked.ip,
    source: live && live.source ? live.source : picked.source,
    port: settings.port,
    scheme: settings.scheme,
    hint: settings.hint,
    wg_required: true
  };
}

module.exports = {
  DEFAULT_HINT,
  isAllowedModemIp,
  sanitizePort,
  sanitizeScheme,
  normalizeIp,
  buildModemRemoteUrl,
  pickRemoteIp,
  extractSessionIp,
  findLiveIp,
  resolveModemRemote
};
