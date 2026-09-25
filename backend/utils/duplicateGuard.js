'use strict';
/**
 * Tolak data ganda customer & lead.
 *
 * Nomor HP/WA di Indonesia sering tersimpan beda format
 * (08…, 62…, +62…, 8…). Semua dicek sebagai satu identitas.
 * NIK / No. KTP ikut ditolak kalau sudah terpakai.
 */
const OPEN_LEAD_STATUSES = [
  'lead', 'survey_request', 'surveyed', 'approved', 'installing'
];

function digitsOnly(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

function normalizePhone(phone) {
  let p = digitsOnly(phone);
  if (!p) return '';
  if (p.startsWith('0')) p = '62' + p.slice(1);
  else if (p.startsWith('8') && p.length >= 9) p = '62' + p;
  return p;
}

function phoneTail(phone) {
  const canon = normalizePhone(phone);
  if (!canon) return '';
  return canon.startsWith('62') ? canon.slice(2) : canon.replace(/^0/, '');
}

function phoneVariants(phone) {
  const raw = digitsOnly(phone);
  if (!raw) return [];
  const set = new Set([raw]);
  if (raw.startsWith('0')) {
    set.add('62' + raw.slice(1));
    set.add(raw.slice(1));
  }
  if (raw.startsWith('62')) {
    set.add('0' + raw.slice(2));
    set.add(raw.slice(2));
  }
  if (raw.startsWith('8')) {
    set.add('0' + raw);
    set.add('62' + raw);
  }
  const canon = normalizePhone(raw);
  if (canon) {
    set.add(canon);
    if (canon.startsWith('62')) {
      set.add('0' + canon.slice(2));
      set.add(canon.slice(2));
    }
  }
  return [...set].filter(v => v.length >= 7);
}

function normalizeNik(nik) {
  const d = digitsOnly(nik);
  return d.length >= 8 ? d : '';
}

function phoneWhere(phone) {
  const { Op } = require('sequelize');
  const variants = phoneVariants(phone);
  if (!variants.length) return null;
  const tail = phoneTail(phone);
  const or = [{ phone: { [Op.in]: variants } }];
  if (tail && tail.length >= 9) {
    or.push({ phone: { [Op.like]: '%' + tail } });
  }
  return { [Op.or]: or };
}

function nikWhere(nik, field) {
  const { Op } = require('sequelize');
  const d = normalizeNik(nik);
  if (!d) return null;
  const variants = new Set([d]);
  const raw = String(nik || '').trim();
  if (raw) variants.add(raw);
  return { [field]: { [Op.in]: [...variants] } };
}

function models() {
  return require('../models');
}

function matchedField(hit, data) {
  const inPppoe = String(data.pppoe_username || '').trim();
  if (inPppoe && hit.pppoe_username && String(hit.pppoe_username).trim() === inPppoe) {
    return 'pppoe';
  }
  const hitNik = normalizeNik(hit.nik || hit.id_card_number);
  const inNik = normalizeNik(data.nik || data.id_card_number);
  if (hitNik && inNik && hitNik === inNik) return 'nik';
  return 'phone';
}

function customerDupMessage(hit, field) {
  const id = hit.customer_id || hit.id;
  const name = hit.name || 'pelanggan';
  if (field === 'pppoe') {
    return `Username PPPoE sudah dipakai customer ${id} (${name}). Data ganda ditolak.`;
  }
  if (field === 'nik') {
    return `NIK sudah terdaftar pada customer ${id} (${name}). Data ganda ditolak.`;
  }
  return `Nomor WhatsApp/HP sudah terdaftar pada customer ${id} (${name}). Data ganda ditolak.`;
}

function leadDupMessage(hit, field) {
  const num = hit.reg_number || hit.id;
  const name = hit.name || 'lead';
  if (field === 'nik') {
    return `NIK sudah ada di pipeline (${num} — ${name}). Data ganda ditolak.`;
  }
  return `Nomor WhatsApp sudah ada di pipeline (${num} — ${name}, status ${hit.status}). Data ganda ditolak.`;
}

function dupError(message, code, extra) {
  const err = new Error(message);
  err.status = 409;
  err.code = code;
  err.duplicate = extra;
  return err;
}

async function findCustomerByPhoneOrNik({
  phone, nik, pppoe_username, tenant_id, excludeId, transaction
} = {}) {
  const { Customer } = models();
  const or = [];
  const pw = phoneWhere(phone);
  if (pw) or.push(pw);
  const nw = nikWhere(nik, 'nik');
  if (nw) or.push(nw);
  const pppoe = String(pppoe_username || '').trim();
  if (pppoe) or.push({ pppoe_username: pppoe });
  if (!or.length) return null;

  const { Op } = require('sequelize');
  const where = { [Op.or]: or };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  if (tenant_id) where.tenant_id = tenant_id;

  const opts = {
    where,
    attributes: ['id', 'customer_id', 'name', 'phone', 'nik', 'pppoe_username', 'status']
  };
  if (transaction) opts.transaction = transaction;
  return Customer.findOne(opts);
}

async function findOpenLead({ phone, id_card_number, excludeId, transaction } = {}) {
  const { RegistrationRequest } = models();
  const or = [];
  const pw = phoneWhere(phone);
  if (pw) or.push(pw);
  const nw = nikWhere(id_card_number, 'id_card_number');
  if (nw) or.push(nw);
  if (!or.length) return null;

  const { Op } = require('sequelize');
  const where = {
    [Op.or]: or,
    status: { [Op.in]: OPEN_LEAD_STATUSES }
  };
  if (excludeId) where.id = { [Op.ne]: excludeId };

  const opts = {
    where,
    attributes: ['id', 'reg_number', 'name', 'phone', 'id_card_number', 'status']
  };
  if (transaction) opts.transaction = transaction;
  return RegistrationRequest.findOne(opts);
}

async function assertUniqueCustomer(data, opts = {}) {
  const hit = await findCustomerByPhoneOrNik({
    phone: data.phone,
    nik: data.nik,
    pppoe_username: data.pppoe_username,
    tenant_id: opts.tenant_id,
    excludeId: opts.excludeId,
    transaction: opts.transaction
  });
  if (!hit) return null;
  throw dupError(
    customerDupMessage(hit, matchedField(hit, data)),
    'DUPLICATE_CUSTOMER',
    { type: 'customer', id: hit.id, customer_id: hit.customer_id, name: hit.name }
  );
}

async function assertUniqueLead(data, opts = {}) {
  const cust = await findCustomerByPhoneOrNik({
    phone: data.phone,
    nik: data.id_card_number || data.nik,
    tenant_id: opts.tenant_id,
    transaction: opts.transaction
  });
  if (cust) {
    throw dupError(
      `Nomor/NIK ini sudah menjadi pelanggan ${cust.customer_id} (${cust.name}). Data ganda ditolak.`,
      'DUPLICATE_CUSTOMER',
      { type: 'customer', id: cust.id, customer_id: cust.customer_id, name: cust.name }
    );
  }

  const lead = await findOpenLead({
    phone: data.phone,
    id_card_number: data.id_card_number || data.nik,
    excludeId: opts.excludeId,
    transaction: opts.transaction
  });
  if (!lead) return null;
  throw dupError(
    leadDupMessage(lead, matchedField(lead, data)),
    'DUPLICATE_LEAD',
    { type: 'lead', id: lead.id, reg_number: lead.reg_number, name: lead.name, status: lead.status }
  );
}

function sendDuplicate(res, err) {
  if (err && (err.status === 409 || err.code === 'DUPLICATE_CUSTOMER' || err.code === 'DUPLICATE_LEAD')) {
    res.status(409).json({
      success: false,
      message: err.message,
      code: err.code,
      duplicate: err.duplicate || null
    });
    return true;
  }
  return false;
}

module.exports = {
  OPEN_LEAD_STATUSES,
  digitsOnly,
  normalizePhone,
  phoneTail,
  phoneVariants,
  normalizeNik,
  phoneWhere,
  findCustomerByPhoneOrNik,
  findOpenLead,
  assertUniqueCustomer,
  assertUniqueLead,
  sendDuplicate,
  customerDupMessage,
  leadDupMessage
};
