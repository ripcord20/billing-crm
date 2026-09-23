'use strict';

/**
 * Kumpulkan ONT/ONU offline dari snapshot OLT Management (olt_mgmt_cache)
 * plus fallback ont_devices. Menyertakan OLT asal, PON, ONU ID, SN, RX.
 */

const fs = require('fs');
const path = require('path');

const MGMT_CONFIG = path.join(__dirname, '../../uploads/olt_mgmt_config.json');
const MGMT_CACHE  = path.join(__dirname, '../../uploads/olt_mgmt_cache.json');

function isOntOffline(status) {
  const st = String(status || '').toLowerCase().trim();
  if (!st) return false;
  if (/offline|los|dying|power.?off|disable|down|inactive|unknown|initial/.test(st)) return true;
  if (/online|working|active|auth|normal|up|sync/.test(st)) return false;
  return true;
}

function normSn(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function loadJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) || fallback;
  } catch (_) {
    return fallback;
  }
}

function loadOltMgmtConfigs() {
  try {
    const ConfigCrypto = require('./ConfigCrypto');
    const rows = ConfigCrypto.load(MGMT_CONFIG, []);
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    const rows = loadJsonFile(MGMT_CONFIG, []);
    return Array.isArray(rows) ? rows : [];
  }
}

function loadOltMgmtCache() {
  const raw = loadJsonFile(MGMT_CACHE, {});
  return raw && typeof raw === 'object' ? raw : {};
}

function collectOfflineFromCache(cache, oltConfigs) {
  const byId = Object.create(null);
  (Array.isArray(oltConfigs) ? oltConfigs : []).forEach((c) => {
    if (c && c.id != null) byId[String(c.id)] = c;
  });
  const rows = [];
  Object.entries(cache || {}).forEach(([id, snap]) => {
    if (!snap || typeof snap !== 'object') return;
    const cfg = byId[id] || {};
    const onus = Array.isArray(snap.onus) ? snap.onus : [];
    onus.forEach((o) => {
      if (!o) return;
      const st = o.status || o.state || o.phase_state || '';
      if (!isOntOffline(st)) return;
      const pon = o.pon != null ? String(o.pon) : (o.port != null ? String(o.port) : null);
      rows.push({
        source: 'olt_mgmt',
        olt_id: cfg.id != null ? cfg.id : id,
        olt_name: cfg.name || cfg.host || ('OLT ' + id),
        olt_host: cfg.host || null,
        olt_brand: cfg.brand || null,
        name: o.name || o.description || null,
        serial_number: o.sn || o.serial || o.serial_number || null,
        pon,
        onu_id: o.onu_id != null ? o.onu_id : null,
        onu_if: o.onu_if || (pon != null && o.onu_id != null ? `${pon}/${o.onu_id}` : null),
        type: o.type || null,
        status: o.status || o.state || 'offline',
        phase_state: o.phase_state || null,
        rx_dbm: o.onu_rx_dbm != null ? o.onu_rx_dbm : (o.signal_strength != null ? o.signal_strength : null),
        tx_dbm: o.onu_tx_dbm != null ? o.onu_tx_dbm : null,
        quality: o.quality || null,
        cached_at: snap.cachedAt || null,
        customer_id: null,
        customer_name: null,
        customer_cid: null,
      });
    });
  });
  return rows;
}

function summarizeFromCache(cache) {
  let online = 0, offline = 0, total = 0;
  Object.values(cache || {}).forEach((snap) => {
    const onus = snap && Array.isArray(snap.onus) ? snap.onus : [];
    onus.forEach((o) => {
      if (!o) return;
      total += 1;
      if (isOntOffline(o.status || o.state || o.phase_state)) offline += 1;
      else online += 1;
    });
  });
  return { online, offline, total };
}

function countByOlt(rows) {
  const map = Object.create(null);
  (rows || []).forEach((r) => {
    const key = r.olt_name || 'OLT';
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

async function attachCustomerInfo(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const sns = [...new Set(list.map((r) => r.serial_number).filter(Boolean))];
  if (!sns.length) return list;
  try {
    const { Customer, OntDevice } = require('../models');
    const { Op } = require('sequelize');
    const [customers, onts] = await Promise.all([
      Customer.findAll({
        where: { ont_sn: { [Op.in]: sns } },
        attributes: ['id', 'name', 'customer_id', 'ont_sn'],
        raw: true,
      }).catch(() => []),
      OntDevice.findAll({
        where: { serial_number: { [Op.in]: sns } },
        attributes: ['serial_number', 'customer_id'],
        include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'customer_id'], required: false }],
      }).catch(() => []),
    ]);
    const bySn = Object.create(null);
    (customers || []).forEach((c) => {
      const k = normSn(c.ont_sn);
      if (k) bySn[k] = { id: c.id, name: c.name, cid: c.customer_id };
    });
    (onts || []).forEach((o) => {
      const k = normSn(o.serial_number);
      if (!k || bySn[k] || !o.customer) return;
      bySn[k] = { id: o.customer.id, name: o.customer.name, cid: o.customer.customer_id };
    });
    list.forEach((r) => {
      const hit = bySn[normSn(r.serial_number)];
      if (!hit) return;
      r.customer_id = hit.id;
      r.customer_name = hit.name;
      r.customer_cid = hit.cid;
    });
  } catch (_) { /* customer match opsional */ }
  return list;
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  (rows || []).forEach((r) => {
    const key = [normSn(r.serial_number), r.olt_id, r.pon, r.onu_id].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  });
  return out;
}

async function collectAllOfflineOnts() {
  const cache = loadOltMgmtCache();
  const cfgs = loadOltMgmtConfigs();
  let rows = collectOfflineFromCache(cache, cfgs);
  rows = dedupeRows(rows);
  rows.sort((a, b) => {
    const olt = String(a.olt_name || '').localeCompare(String(b.olt_name || ''));
    if (olt !== 0) return olt;
    const pa = parseInt(a.pon, 10) || 0;
    const pb = parseInt(b.pon, 10) || 0;
    if (pa !== pb) return pa - pb;
    return (parseInt(a.onu_id, 10) || 0) - (parseInt(b.onu_id, 10) || 0);
  });
  await attachCustomerInfo(rows);
  return {
    rows,
    summary: summarizeFromCache(cache),
    by_olt: countByOlt(rows),
  };
}

module.exports = {
  isOntOffline,
  normSn,
  collectOfflineFromCache,
  summarizeFromCache,
  countByOlt,
  attachCustomerInfo,
  collectAllOfflineOnts,
  loadOltMgmtCache,
  loadOltMgmtConfigs,
};
