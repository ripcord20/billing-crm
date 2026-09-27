'use strict';

/**
 * Nama ONU + OLT sesuai KAN di perangkat.
 * SN bisa masih terdaftar di OLT lama sebagai ONT01/xxx — utamakan
 * OLT yang punya nama pelanggan asli, jangan campur nama dari satu
 * OLT dengan label OLT lain.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CACHE = path.join(__dirname, '../../uploads/olt_mgmt_cache.json');
const CONFIG_PATH = path.join(__dirname, '../../uploads/olt_mgmt_config.json');
const CACHE_TTL_MS = 30 * 1000;

let _memo = { at: 0, key: '', bySn: new Map() };

function snKey(sn) {
  return String(sn || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isPlaceholderName(name, serial) {
  const n = String(name || '').trim();
  if (!n || n === '-' || n === '—') return true;
  if (serial && snKey(n) === snKey(serial)) return true;
  if (/^HSGQ-P\d+O\d+$/i.test(n)) return true;
  if (/^ONU-P\d+[/.]\d+$/i.test(n)) return true;
  if (/^ONT\d+[\/._-]\d+$/i.test(n)) return true;
  if (/^ONU\d+[\/._-]\d+$/i.test(n)) return true;
  return false;
}

function pickName(...cands) {
  for (const c of cands) {
    const n = String(c == null ? '' : c).trim();
    if (n) return n;
  }
  return '';
}

function cleanSystemModel(payload) {
  const sys = (payload && payload.system) || {};
  const m = sys.model || sys.system_name || sys.name;
  if (!m) return '';
  const s = String(m).replace(/["']/g, '').trim();
  if (!s || /^epon$/i.test(s) || /^csm\b/i.test(s)) return '';
  return s;
}

function toNameMap(oltNames) {
  if (!oltNames) return null;
  if (oltNames instanceof Map) return oltNames;
  return new Map(Object.entries(oltNames).map(([k, v]) => [String(k), v]));
}

function loadOltNamesById() {
  try {
    const ConfigCrypto = require('./ConfigCrypto');
    const list = ConfigCrypto.load(CONFIG_PATH, []);
    const map = new Map();
    for (const c of list || []) {
      if (c && c.id && c.name) map.set(String(c.id), String(c.name));
    }
    return map;
  } catch (_) {
    return new Map();
  }
}

function scoreEntry(e) {
  let s = 0;
  if (e.name && !isPlaceholderName(e.name, e.sn)) s += 100;
  if (e.status === 'online') s += 5;
  if (e.onuIf) s += 1;
  return s;
}

function pickBest(entries, hintOlt) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!list.length) return null;
  const named = list.filter((e) => e.name && !isPlaceholderName(e.name, e.sn));
  const pool = named.length ? named : list;
  if (hintOlt && !named.length) {
    const hint = snKey(hintOlt);
    const match = pool.find((e) => snKey(e.oltName) === hint || snKey(e.oltId) === hint);
    if (match) return match;
  }
  return pool.slice().sort((a, b) => scoreEntry(b) - scoreEntry(a))[0];
}

function loadCacheEntries(cachePath, oltNames) {
  const file = cachePath || DEFAULT_CACHE;
  const namesById = toNameMap(oltNames) || loadOltNamesById();
  const nameKey = [...namesById.entries()].map(([k, v]) => `${k}=${v}`).sort().join('|');
  const key = file + '::' + nameKey;
  const now = Date.now();
  if (_memo.bySn.size && _memo.key === key && now - _memo.at < CACHE_TTL_MS) {
    return _memo.bySn;
  }
  const bySn = new Map();
  try {
    const all = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    for (const [oid, payload] of Object.entries(all)) {
      const oltName = namesById.get(String(oid)) || cleanSystemModel(payload) || '';
      for (const o of (payload && payload.onus) || []) {
        const sn = o.sn || o.serial_number;
        if (!sn) continue;
        const entry = {
          sn,
          name: pickName(o.name, o.description),
          oltId: String(oid),
          oltName,
          onuIf: o.onu_if || null,
          status: o.status || '',
        };
        const k = snKey(sn);
        if (!bySn.has(k)) bySn.set(k, []);
        bySn.get(k).push(entry);
      }
    }
  } catch (_) { /* cache belum ada / rusak */ }
  _memo = { at: now, key, bySn };
  return bySn;
}

function loadCacheMap(cachePath, oltNames) {
  const map = new Map();
  for (const [k, entries] of loadCacheEntries(cachePath, oltNames)) {
    const best = pickBest(entries);
    if (best && best.name && !isPlaceholderName(best.name, best.sn)) {
      map.set(k, best.name);
    }
  }
  return map;
}

function resolveOnuFromCache(serial, opts = {}) {
  if (!serial) return null;
  const entries = loadCacheEntries(opts.cachePath, opts.oltNames).get(snKey(serial)) || [];
  return pickBest(entries, opts.hintOlt) || null;
}

function nameFromCache(serial, cachePath) {
  const hit = resolveOnuFromCache(serial, { cachePath });
  return hit && hit.name && !isPlaceholderName(hit.name, serial) ? hit.name : '';
}

function nameFromOnt(ont, serial) {
  if (!ont) return '';
  const n = pickName(ont.description, ont.model, ont.name);
  return isPlaceholderName(n, serial || ont.serial_number) ? '' : n;
}

function displayOnuName(opts = {}) {
  const serial = opts.serial || (opts.ont && opts.ont.serial_number) || '';
  const cached = opts.cachedName != null
    ? opts.cachedName
    : nameFromCache(serial, opts.cachePath);
  const fromOnt = nameFromOnt(opts.ont, serial);
  for (const n of [cached, fromOnt]) {
    if (n && !isPlaceholderName(n, serial)) return String(n).trim();
  }
  return '';
}

function toPlain(row) {
  if (!row) return {};
  if (typeof row.toJSON === 'function') return row.toJSON();
  return { ...row };
}

async function enrichAttenuationRows(rows, opts = {}) {
  const plains = (Array.isArray(rows) ? rows : []).map(toPlain);
  if (!plains.length) return plains;
  const cachePath = opts.cachePath;
  const oltNames = opts.oltNames;
  const missing = [];
  for (const r of plains) {
    const best = resolveOnuFromCache(r.serial_number, {
      cachePath,
      oltNames,
      hintOlt: r.olt_name,
    });
    if (best) {
      if (best.name) r.onu_name = best.name;
      if (best.oltName) r.olt_name = best.oltName;
      if (best.onuIf && !r.onu_if) r.onu_if = best.onuIf;
    }
    if (!r.onu_name) missing.push(r);
    r.display_name = r.onu_name || r.serial_number || 'ONT';
  }
  if (!missing.length) return plains;

  try {
    const { Op } = require('sequelize');
    const { OntDevice } = require('../models');
    if (!OntDevice) return plains;
    const sns = [...new Set(missing.map((r) => r.serial_number).filter(Boolean))];
    const ids = [...new Set(missing.map((r) => r.ont_device_id).filter(Boolean))];
    const where = [];
    if (sns.length) where.push({ serial_number: { [Op.in]: sns } });
    if (ids.length) where.push({ id: { [Op.in]: ids } });
    if (!where.length) return plains;
    const onts = await OntDevice.findAll({
      where: { [Op.or]: where },
      attributes: ['id', 'serial_number', 'model'],
    });
    const byId = new Map(onts.map((o) => [o.id, o]));
    const bySerial = new Map(onts.map((o) => [snKey(o.serial_number), o]));
    for (const r of missing) {
      const ont = (r.ont_device_id && byId.get(r.ont_device_id))
        || bySerial.get(snKey(r.serial_number));
      const n = nameFromOnt(ont, r.serial_number);
      if (n) r.onu_name = n;
      r.display_name = r.onu_name || r.serial_number || 'ONT';
    }
  } catch (_) { /* jangan gagalkan daftar event */ }
  return plains;
}

function resetCacheMemo() {
  _memo = { at: 0, key: '', bySn: new Map() };
}

module.exports = {
  snKey,
  isPlaceholderName,
  nameFromCache,
  nameFromOnt,
  displayOnuName,
  enrichAttenuationRows,
  resolveOnuFromCache,
  pickBest,
  resetCacheMemo,
  loadCacheMap,
};
