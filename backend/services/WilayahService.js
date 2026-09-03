'use strict';

const { sequelize, Customer, Package, CollectorProfile, AppSetting } = require('../models');
const { Op } = require('sequelize');
const IsolirService = require('./IsolirService');
const {
  generateCode,
  prettyVillageName,
  pickWilayahForCustomer
} = require('../utils/wilayahMatch');

const SETTING_KEY = 'wilayah_include_invoice';

function safeWilayah() {
  try {
    return require('../models').Wilayah;
  } catch (_) {
    return null;
  }
}

async function getIncludeInvoice() {
  try {
    const row = await AppSetting.findOne({ where: { key: SETTING_KEY } });
    return row && String(row.value) === '1';
  } catch (_) {
    return false;
  }
}

async function setIncludeInvoice(enabled) {
  const value = enabled ? '1' : '0';
  const [row] = await AppSetting.findOrCreate({
    where: { key: SETTING_KEY },
    defaults: { key: SETTING_KEY, value, type: 'boolean', description: 'Sertakan nama wilayah ke alamat invoice' }
  });
  if (row.value !== value) await row.update({ value });
  return value === '1';
}

async function liveByCustomerId() {
  const map = {};
  try {
    const snap = require('./CustomerTrafficPoller').getSnapshot();
    const list = (snap && snap.data) || [];
    for (const r of list) {
      if (r && r.id != null) map[Number(r.id)] = r;
    }
  } catch (_) {}
  return map;
}

function connStatus(customer, live) {
  const isolir = customer.isolir_status === 'isolated' || customer.status === 'isolated';
  if (isolir) return 'isolir';
  if (live && live.online === true) return 'online';
  if (live && live.online === false) return 'offline';
  return 'offline';
}

async function workerCountFor(wilayah) {
  try {
    if (!CollectorProfile) return 0;
    const rows = await CollectorProfile.findAll({
      where: { is_active: true },
      attributes: ['id', 'region']
    });
    const needle = String(wilayah.name || '').toUpperCase();
    const code = String(wilayah.code || '').toUpperCase();
    const village = String(wilayah.village || '').toUpperCase();
    return rows.filter((p) => {
      const r = String(p.region || '').toUpperCase();
      if (!r) return false;
      return r.includes(needle) || (code && r.includes(code)) || (village && r.includes(village));
    }).length;
  } catch (_) {
    return 0;
  }
}

async function customersOf(wilayahId) {
  const include = [{ model: Package, as: 'package', required: false, attributes: ['id', 'name', 'price'] }];
  return Customer.findAll({
    where: { wilayah_id: wilayahId },
    include,
    order: [['name', 'ASC']]
  });
}

async function decorateWilayah(row, liveMap) {
  const w = row.toJSON ? row.toJSON() : { ...row };
  const customers = await customersOf(w.id);
  let revenue = 0;
  let activeBilling = 0;
  let online = 0;
  let offline = 0;
  let isolir = 0;
  for (const c of customers) {
    const price = parseFloat(c.package?.price || 0) || 0;
    revenue += price;
    if (c.status === 'active' && c.isolir_status !== 'isolated') activeBilling += 1;
    const st = connStatus(c, liveMap[c.id]);
    if (st === 'online') online += 1;
    else if (st === 'isolir') isolir += 1;
    else offline += 1;
  }
  w.customer_count = customers.length;
  w.active_count = activeBilling;
  w.online_count = online;
  w.offline_count = offline;
  w.isolir_count = isolir;
  w.revenue = revenue;
  w.worker_count = await workerCountFor(w);
  return w;
}

async function listWithStats() {
  const Wilayah = safeWilayah();
  if (!Wilayah) return [];
  const liveMap = await liveByCustomerId();
  const rows = await Wilayah.findAll({ order: [['name', 'ASC']] });
  const out = [];
  for (const row of rows) out.push(await decorateWilayah(row, liveMap));
  return out;
}

async function detail(id) {
  const Wilayah = safeWilayah();
  if (!Wilayah) return null;
  const row = await Wilayah.findByPk(id);
  if (!row) return null;
  const liveMap = await liveByCustomerId();
  const stats = await decorateWilayah(row, liveMap);
  const customers = await customersOf(id);
  stats.customers = customers.map((c) => {
    const json = c.toJSON();
    const live = liveMap[c.id];
    const connection = connStatus(c, live);
    return {
      id: json.id,
      customer_id: json.customer_id,
      name: json.name,
      phone: json.phone,
      pppoe_username: json.pppoe_username,
      status: json.status,
      isolir_status: json.isolir_status,
      package_name: json.package?.name || null,
      package_price: json.package?.price || 0,
      mikrotik_id: json.mikrotik_id,
      connection,
      online: connection === 'online',
      uptime: live?.uptime || null
    };
  });
  return stats;
}

function pickFields(body) {
  const out = {};
  ['name', 'code', 'status', 'province', 'regency', 'district', 'village', 'phone', 'notes'].forEach((k) => {
    if (k in body) out[k] = body[k];
  });
  if (out.name) out.name = String(out.name).trim().toUpperCase();
  if (out.code) out.code = String(out.code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (out.village) out.village = String(out.village).trim().toUpperCase();
  if (out.status && !['active', 'inactive'].includes(out.status)) delete out.status;
  return out;
}

async function createWilayah(body) {
  const Wilayah = safeWilayah();
  const fields = pickFields(body);
  if (!fields.name) throw new Error('Nama wilayah wajib diisi');
  if (!fields.code) fields.code = generateCode(fields.name);
  if (!fields.village) fields.village = fields.name;
  const created = await Wilayah.create(fields);
  await autoLinkAll();
  return detail(created.id);
}

async function updateWilayah(id, body) {
  const Wilayah = safeWilayah();
  const row = await Wilayah.findByPk(id);
  if (!row) return null;
  const fields = pickFields(body);
  await row.update(fields);
  await autoLinkAll();
  return detail(id);
}

async function destroyWilayah(id) {
  const Wilayah = safeWilayah();
  const row = await Wilayah.findByPk(id);
  if (!row) return false;
  await sequelize.query('UPDATE customers SET wilayah_id = NULL WHERE wilayah_id = ?', {
    replacements: [id]
  });
  await row.destroy();
  return true;
}

async function assignCustomer(customer) {
  const Wilayah = safeWilayah();
  if (!Wilayah || !customer) return null;
  const list = await Wilayah.findAll();
  const hit = pickWilayahForCustomer(customer, list.map((w) => w.toJSON()));
  if (!hit) return null;
  if (Number(customer.wilayah_id) === Number(hit.id)) return hit;
  await Customer.update({ wilayah_id: hit.id }, { where: { id: customer.id } });
  return hit;
}

async function autoLinkAll() {
  const Wilayah = safeWilayah();
  if (!Wilayah) return { linked: 0 };
  const list = await Wilayah.findAll();
  if (!list.length) return { linked: 0 };
  const customers = await Customer.findAll({
    attributes: ['id', 'name', 'village', 'district', 'address', 'wilayah_id']
  });
  let linked = 0;
  for (const c of customers) {
    const hit = pickWilayahForCustomer(c, list.map((w) => w.toJSON()));
    if (hit && Number(c.wilayah_id) !== Number(hit.id)) {
      await c.update({ wilayah_id: hit.id });
      linked += 1;
    }
  }
  return { linked };
}

async function seedFromCustomers() {
  const Wilayah = safeWilayah();
  if (!Wilayah) return { created: 0, linked: 0 };
  const rows = await sequelize.query(
    `SELECT village, province, regency, district, COUNT(*) AS n
       FROM customers
      WHERE village IS NOT NULL AND village != ''
      GROUP BY village, province, regency, district`,
    { type: sequelize.QueryTypes.SELECT }
  );
  let created = 0;
  for (const row of rows) {
    const name = prettyVillageName(row.village);
    const code = generateCode(name);
    const exists = await Wilayah.findOne({
      where: {
        [Op.or]: [
          { code },
          { village: String(row.village).toUpperCase() },
          { name }
        ]
      }
    });
    if (exists) continue;
    await Wilayah.create({
      name,
      code,
      status: 'active',
      province: row.province || null,
      regency: row.regency || null,
      district: row.district || null,
      village: String(row.village || name).toUpperCase()
    });
    created += 1;
  }
  const linked = await autoLinkAll();
  return { created, linked: linked.linked };
}

async function bulkIsolir(wilayahId, adminUserId) {
  const customers = await Customer.findAll({ where: { wilayah_id: wilayahId } });
  const results = [];
  for (const c of customers) {
    if (c.isolir_status === 'isolated') {
      results.push({ id: c.id, name: c.name, success: true, skipped: true, message: 'Sudah diisolir' });
      continue;
    }
    try {
      const r = await IsolirService.isolirCustomer(c.id, 'wilayah', adminUserId);
      results.push({ id: c.id, name: c.name, success: !!r.success, skipped: !!r.skipped, message: r.message || r.error || null });
    } catch (e) {
      results.push({ id: c.id, name: c.name, success: false, message: e.message });
    }
  }
  const Wilayah = safeWilayah();
  if (Wilayah) await Wilayah.update({ status: 'inactive' }, { where: { id: wilayahId } });
  const ok = results.filter((r) => r.success).length;
  return { success: true, isolir_ok: ok, total: results.length, results };
}

async function bulkRestore(wilayahId, adminUserId) {
  const customers = await Customer.findAll({ where: { wilayah_id: wilayahId } });
  const results = [];
  for (const c of customers) {
    if (c.isolir_status !== 'isolated') {
      results.push({ id: c.id, name: c.name, success: true, skipped: true, message: 'Tidak diisolir' });
      continue;
    }
    try {
      const r = await IsolirService.restoreCustomer(c.id, 'wilayah', adminUserId);
      results.push({ id: c.id, name: c.name, success: !!r.success, skipped: !!r.skipped, message: r.message || r.error || null });
    } catch (e) {
      results.push({ id: c.id, name: c.name, success: false, message: e.message });
    }
  }
  const Wilayah = safeWilayah();
  if (Wilayah) await Wilayah.update({ status: 'active' }, { where: { id: wilayahId } });
  const ok = results.filter((r) => r.success).length;
  return { success: true, restore_ok: ok, total: results.length, results };
}

async function formatInvoiceAddress(address, customer) {
  const base = address || customer?.address || '';
  try {
    const on = await getIncludeInvoice();
    if (!on || !customer) return base;
    const Wilayah = safeWilayah();
    if (!Wilayah) return base;
    if (!w && customer.wilayah_id) w = await Wilayah.findByPk(customer.wilayah_id);
    if (!w && customer.id) {
      const full = await Customer.findByPk(customer.id, { attributes: ['id', 'wilayah_id'] });
      if (full?.wilayah_id) w = await Wilayah.findByPk(full.wilayah_id);
    }
    if (!w && customer.customer_id) {
      const full = await Customer.findOne({ where: { customer_id: customer.customer_id }, attributes: ['id', 'wilayah_id'] });
      if (full?.wilayah_id) w = await Wilayah.findByPk(full.wilayah_id);
    }
    if (!w) return base;
    const label = [w.name, w.code ? `(${w.code})` : ''].filter(Boolean).join(' ');
    if (!base) return 'Wilayah: ' + label;
    if (String(base).toUpperCase().includes(String(w.name).toUpperCase())) return base;
    return String(base).trim() + '\nWilayah: ' + label;
  } catch (_) {
    return base;
  }
}

module.exports = {
  SETTING_KEY,
  getIncludeInvoice,
  setIncludeInvoice,
  listWithStats,
  detail,
  createWilayah,
  updateWilayah,
  destroyWilayah,
  assignCustomer,
  autoLinkAll,
  seedFromCustomers,
  bulkIsolir,
  bulkRestore,
  formatInvoiceAddress
};
