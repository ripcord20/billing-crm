'use strict';

/**
 * Nama ONU sesuai yang terpasang di OLT (KAN / deskripsi),
 * diutamakan dari cache OLT Management, lalu ont_devices.model.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CACHE = path.join(__dirname, '../../uploads/olt_mgmt_cache.json');
const CACHE_TTL_MS = 30 * 1000;

let _memo = { at: 0, path: '', map: new Map() };

function snKey(sn) {
  return String(sn || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isPlaceholderName(name, serial) {
  const n = String(name || '').trim();
  if (!n || n === '-' || n === '—') return true;
  if (serial && snKey(n) === snKey(serial)) return true;
  if (/^HSGQ-P\d+O\d+$/i.test(n)) return true;
  if (/^ONU-P\d+[/.]\d+$/i.test(n)) return true;
  return false;
}

function pickName(...cands) {
  for (const c of cands) {
    const n = String(c == null ? '' : c).trim();
    if (n) return n;
  }
  return '';
}

function loadCacheMap(cachePath) {
  const file = cachePath || DEFAULT_CACHE;
  const now = Date.now();
  if (_memo.map.size && _memo.path === file && now - _memo.at < CACHE_TTL_MS) {
    return _memo.map;
  }
  const map = new Map();
  try {
    const all = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    for (const payload of Object.values(all)) {
      for (const o of (payload && payload.onus) || []) {
        const sn = o.sn || o.serial_number;
        const name = pickName(o.name, o.description);
        if (!sn || !name || isPlaceholderName(name, sn)) continue;
        map.set(snKey(sn), name);
      }
    }
  } catch (_) { /* cache belum ada / rusak */ }
  _memo = { at: now, path: file, map };
  return map;
}

function nameFromCache(serial, cachePath) {
  if (!serial) return '';
  return loadCacheMap(cachePath).get(snKey(serial)) || '';
}

function nameFromOnt(ont, serial) {
  if (!ont) return '';
  const n = pickName(ont.description, ont.model, ont.name);
  return isPlaceholderName(n, serial || ont.serial_number) ? '' : n;
}

function displayOnuName(opts = {}) {
  const serial = opts.serial || (opts.ont && opts.ont.serial_number) || '';
  const cached = opts.cachedName != null ? opts.cachedName : nameFromCache(serial, opts.cachePath);
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
  const cache = loadCacheMap(cachePath);
  const missing = [];
  for (const r of plains) {
    const n = cache.get(snKey(r.serial_number));
    if (n && !isPlaceholderName(n, r.serial_number)) {
      r.onu_name = n;
    } else {
      missing.push(r);
    }
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
    const bySn = new Map(onts.map((o) => [snKey(o.serial_number), o]));
    for (const r of missing) {
      const ont = (r.ont_device_id && byId.get(r.ont_device_id))
        || bySn.get(snKey(r.serial_number));
      const n = nameFromOnt(ont, r.serial_number);
      if (n) r.onu_name = n;
      r.display_name = r.onu_name || r.serial_number || 'ONT';
    }
  } catch (_) { /* jangan gagalkan daftar event */ }
  return plains;
}

function resetCacheMemo() {
  _memo = { at: 0, path: '', map: new Map() };
}

module.exports = {
  snKey,
  isPlaceholderName,
  nameFromCache,
  nameFromOnt,
  displayOnuName,
  enrichAttenuationRows,
  resetCacheMemo,
  loadCacheMap,
};
