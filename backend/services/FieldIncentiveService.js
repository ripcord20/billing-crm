'use strict';

const { Op } = require('sequelize');
const rules = require('../utils/fieldIncentiveRules');

const SETTING_KEY = 'field_incentive_rules';
const FIELD_ROLES = ['collector', 'technician'];

async function getSettings() {
  const { AppSetting } = require('../models');
  const row = await AppSetting.findOne({ where: { key: SETTING_KEY } });
  let parsed = {};
  if (row && row.value) {
    try { parsed = JSON.parse(row.value); } catch (_) { parsed = {}; }
  }
  return rules.normalizeSettings(parsed);
}

async function saveSettings(body, { description } = {}) {
  const { AppSetting } = require('../models');
  const next = rules.normalizeSettings(body);
  const [row] = await AppSetting.findOrCreate({
    where: { key: SETTING_KEY },
    defaults: { key: SETTING_KEY, value: JSON.stringify(next), type: 'json', description: description || 'Aturan insentif teknisi & kolektor' }
  });
  await row.update({ value: JSON.stringify(next), type: 'json' });
  return next;
}

async function _accrue(fields) {
  const { FieldIncentive } = require('../models');
  const existing = await FieldIncentive.findOne({
    where: {
      kind: fields.kind,
      source_type: fields.source_type,
      source_id: String(fields.source_id)
    }
  });
  if (existing) {
    if (existing.status === 'void') return existing;
    return existing;
  }
  try {
    return await FieldIncentive.create(fields);
  } catch (e) {
    if (String(e.message || '').includes('uq_field_incentive_source') || e.name === 'SequelizeUniqueConstraintError') {
      return FieldIncentive.findOne({
        where: { kind: fields.kind, source_type: fields.source_type, source_id: String(fields.source_id) }
      });
    }
    throw e;
  }
}

async function accrueFromPayment(payment, extras = {}) {
  const collectedBy = payment.collected_by || extras.collectedBy;
  if (!collectedBy) return null;
  const { Invoice, Customer } = require('../models');
  const invoice = extras.invoice || await Invoice.findByPk(payment.invoice_id);
  const customer = extras.customer || (invoice ? await Customer.findByPk(invoice.customer_id) : null);
  const kind = rules.classifyPayment({
    collectedBy,
    invoiceIsStopFinal: !!(invoice && (invoice.is_stop_final || invoice.get && invoice.get('is_stop_final'))),
    customerStoppedAt: customer && customer.stopped_at,
    paymentDate: payment.payment_date
  });
  if (!kind) return null;
  const settings = extras.settings || await getSettings();
  const earned = String(payment.payment_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  return _accrue({
    user_id: collectedBy,
    kind,
    amount: rules.feeForKind(kind, settings),
    qty: 1,
    unit: 'rp',
    period_key: rules.monthPeriodKey(earned),
    source_type: 'payment',
    source_id: String(payment.id),
    invoice_id: payment.invoice_id || null,
    customer_id: invoice ? invoice.customer_id : null,
    earned_at: earned,
    status: 'earned',
    notes: extras.notes || null
  });
}

async function accrueRouter({ userId, customerId, sourceType, sourceId, earnedAt, notes, settings }) {
  if (!userId || !sourceId) return null;
  const s = settings || await getSettings();
  const earned = String(earnedAt || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return _accrue({
    user_id: userId,
    kind: 'router',
    amount: rules.feeForKind('router', s),
    qty: 1,
    unit: 'rp',
    period_key: rules.monthPeriodKey(earned),
    source_type: sourceType || 'manual',
    source_id: String(sourceId),
    customer_id: customerId || null,
    earned_at: earned,
    status: 'earned',
    notes: notes || null
  });
}

async function accrueSisa({ userId, customerId, invoiceId, sourceType, sourceId, earnedAt, notes, settings }) {
  if (!userId || !sourceId) return null;
  const s = settings || await getSettings();
  const earned = String(earnedAt || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return _accrue({
    user_id: userId,
    kind: 'sisa',
    amount: rules.feeForKind('sisa', s),
    qty: 1,
    unit: 'rp',
    period_key: rules.monthPeriodKey(earned),
    source_type: sourceType || 'manual',
    source_id: String(sourceId),
    invoice_id: invoiceId || null,
    customer_id: customerId || null,
    earned_at: earned,
    status: 'earned',
    notes: notes || null
  });
}

async function ensureOilForUser(userId, periodKey, { settings, earnedAt, notes } = {}) {
  if (!userId || !periodKey) return null;
  const s = settings || await getSettings();
  const earned = String(earnedAt || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return _accrue({
    user_id: userId,
    kind: 'oli',
    amount: 0,
    qty: s.oli_qty,
    unit: 'botol',
    period_key: periodKey,
    source_type: 'oil_period',
    source_id: `${userId}:${periodKey}`,
    earned_at: earned,
    status: 'earned',
    notes: notes || 'Oli periode 2 bulan'
  });
}

async function fieldStaffIds() {
  const { User, Role } = require('../models');
  const users = await User.findAll({
    include: [{ model: Role, as: 'role', attributes: ['name'], required: false }],
    attributes: ['id', 'name', 'is_active']
  });
  return users.filter(u => {
    const n = (u.role && u.role.name) ? String(u.role.name).toLowerCase() : '';
    return FIELD_ROLES.includes(n) && u.is_active !== false;
  });
}

async function backfillMonth(year, month) {
  const { Payment, Invoice, Customer } = require('../models');
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const start = `${ym}-01`;
  const endM = month === 12 ? 1 : month + 1;
  const endY = month === 12 ? year + 1 : year;
  const end = `${endY}-${String(endM).padStart(2, '0')}-01`;
  const pays = await Payment.findAll({
    where: {
      collected_by: { [Op.ne]: null },
      payment_date: { [Op.gte]: start, [Op.lt]: end }
    }
  });
  const settings = await getSettings();
  let created = 0;
  for (const p of pays) {
    const before = await require('../models').FieldIncentive.count({
      where: { kind: { [Op.in]: ['tagihan', 'sisa'] }, source_type: 'payment', source_id: String(p.id) }
    });
    const inv = await Invoice.findByPk(p.invoice_id);
    const cust = inv ? await Customer.findByPk(inv.customer_id) : null;
    await accrueFromPayment(p, { invoice: inv, customer: cust, settings });
    const after = await require('../models').FieldIncentive.count({
      where: { kind: { [Op.in]: ['tagihan', 'sisa'] }, source_type: 'payment', source_id: String(p.id) }
    });
    if (after > before) created++;
  }
  const { WorkOrder } = require('../models');
  const wos = await WorkOrder.findAll({
    where: {
      type: 'dismantle',
      status: 'done',
      completed_at: { [Op.gte]: start, [Op.lt]: end }
    }
  });
  let routers = 0;
  for (const wo of wos) {
    if (!wo.assigned_user_id) continue;
    const beforeR = await require('../models').FieldIncentive.count({
      where: { kind: 'router', source_type: 'work_order', source_id: String(wo.id) }
    });
    const earnedAt = wo.completed_at
      ? String(wo.completed_at).slice(0, 10)
      : start;
    await accrueRouter({
      userId: wo.assigned_user_id,
      customerId: wo.customer_id,
      sourceType: 'work_order',
      sourceId: wo.id,
      earnedAt,
      notes: wo.wo_number || 'Pengambilan router',
      settings
    });
    const afterR = await require('../models').FieldIncentive.count({
      where: { kind: 'router', source_type: 'work_order', source_id: String(wo.id) }
    });
    if (afterR > beforeR) routers++;
  }

  const staff = await fieldStaffIds();
  const oilKey = rules.oilPeriodKey(start);
  for (const u of staff) {
    await ensureOilForUser(u.id, oilKey, { settings, earnedAt: start });
  }
  return {
    scanned: pays.length,
    created,
    routers_scanned: wos.length,
    routers_created: routers,
    oil_period: oilKey,
    staff: staff.length
  };
}

async function staffList() {
  const users = await fieldStaffIds();
  return users.map(u => ({
    id: u.id,
    name: u.name,
    role: (u.role && u.role.name) || ''
  })).sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

async function summary(year, month) {
  const { FieldIncentive, User, Role } = require('../models');
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const oilKey = rules.oilPeriodKey(ym + '-01');
  const settings = await getSettings();

  const staff = await fieldStaffIds();
  for (const u of staff) {
    await ensureOilForUser(u.id, oilKey, { settings, earnedAt: ym + '-01' });
  }

  const rows = await FieldIncentive.findAll({
    where: {
      [Op.or]: [
        { unit: 'rp', period_key: ym },
        { kind: 'oli', period_key: oilKey }
      ],
      status: { [Op.ne]: 'void' }
    }
  });

  const byUser = new Map();
  const addUser = (id, name, role) => {
    if (!byUser.has(id)) {
      byUser.set(id, {
        user_id: id,
        name: name || ('User #' + id),
        role: role || '',
        tagihan_count: 0, tagihan_amount: 0,
        sisa_count: 0, sisa_amount: 0,
        router_count: 0, router_amount: 0,
        oli_qty: 0, oli_status: null,
        money_earned: 0, money_paid: 0, money_open: 0,
        status_money: 'earned'
      });
    }
    return byUser.get(id);
  };

  const ids = new Set(staff.map(u => u.id));
  rows.forEach(r => ids.add(r.user_id));
  const users = await User.findAll({
    where: { id: { [Op.in]: Array.from(ids) } },
    include: [{ model: Role, as: 'role', attributes: ['name'], required: false }],
    attributes: ['id', 'name']
  });
  users.forEach(u => addUser(u.id, u.name, u.role && u.role.name));
  staff.forEach(u => addUser(u.id, u.name, u.role && u.role.name));

  for (const r of rows) {
    const rec = addUser(r.user_id);
    const amt = parseFloat(r.amount || 0);
    const qty = parseInt(r.qty || 0, 10) || 0;
    if (r.kind === 'tagihan') {
      rec.tagihan_count += 1;
      rec.tagihan_amount += amt;
    } else if (r.kind === 'sisa') {
      rec.sisa_count += 1;
      rec.sisa_amount += amt;
    } else if (r.kind === 'router') {
      rec.router_count += 1;
      rec.router_amount += amt;
    } else if (r.kind === 'oli') {
      rec.oli_qty += qty;
      rec.oli_status = r.status;
    }
    if (r.unit === 'rp') {
      rec.money_earned += amt;
      if (r.status === 'paid') rec.money_paid += amt;
      else rec.money_open += amt;
    }
  }

  const people = Array.from(byUser.values()).map(p => {
    p.status_money = p.money_earned <= 0 ? 'none' : (p.money_open <= 0 ? 'paid' : 'earned');
    return p;
  }).sort((a, b) => a.name.localeCompare(b.name, 'id'));

  const totals = people.reduce((t, p) => {
    t.tagihan_count += p.tagihan_count;
    t.sisa_count += p.sisa_count;
    t.router_count += p.router_count;
    t.oli_qty += p.oli_qty;
    t.money_open += p.money_open;
    t.money_paid += p.money_paid;
    t.money_earned += p.money_earned;
    return t;
  }, { tagihan_count: 0, sisa_count: 0, router_count: 0, oli_qty: 0, money_open: 0, money_paid: 0, money_earned: 0 });

  return {
    period: ym,
    oil_period: oilKey,
    oil_label: rules.oilPeriodLabel(oilKey),
    settings,
    people,
    totals
  };
}

async function listForUser(userId, year, month) {
  const { FieldIncentive, Customer, Invoice } = require('../models');
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const oilKey = rules.oilPeriodKey(ym + '-01');
  return FieldIncentive.findAll({
    where: {
      user_id: userId,
      status: { [Op.ne]: 'void' },
      [Op.or]: [
        { unit: 'rp', period_key: ym },
        { kind: 'oli', period_key: oilKey }
      ]
    },
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'customer_id'], required: false },
      { model: Invoice, as: 'invoice', attributes: ['id', 'invoice_number', 'total'], required: false }
    ],
    order: [['earned_at', 'DESC'], ['id', 'DESC']]
  });
}

async function markMoneyPaid(userId, year, month, paidBy, note) {
  const { FieldIncentive } = require('../models');
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const rows = await FieldIncentive.findAll({
    where: { user_id: userId, unit: 'rp', period_key: ym, status: 'earned' }
  });
  const now = new Date();
  let amount = 0;
  for (const r of rows) {
    amount += parseFloat(r.amount || 0);
    await r.update({ status: 'paid', paid_at: now, paid_by: paidBy || null, notes: note || r.notes });
  }
  return { count: rows.length, amount };
}

async function markOilPaid(userId, periodKey, paidBy, note) {
  const { FieldIncentive } = require('../models');
  const rows = await FieldIncentive.findAll({
    where: { user_id: userId, kind: 'oli', period_key: periodKey, status: 'earned' }
  });
  const now = new Date();
  let qty = 0;
  for (const r of rows) {
    qty += parseInt(r.qty || 0, 10) || 0;
    await r.update({ status: 'paid', paid_at: now, paid_by: paidBy || null, notes: note || r.notes });
  }
  return { count: rows.length, qty };
}

async function voidRow(id) {
  const { FieldIncentive } = require('../models');
  const row = await FieldIncentive.findByPk(id);
  if (!row) return null;
  await row.update({ status: 'void' });
  return row;
}

async function voidByPayment(paymentId) {
  if (!paymentId) return 0;
  const { FieldIncentive } = require('../models');
  const rows = await FieldIncentive.findAll({
    where: {
      source_type: 'payment',
      source_id: String(paymentId),
      status: 'earned'
    }
  });
  for (const r of rows) await r.update({ status: 'void' });
  return rows.length;
}

module.exports = {
  getSettings,
  saveSettings,
  accrueFromPayment,
  accrueRouter,
  accrueSisa,
  ensureOilForUser,
  fieldStaffIds,
  staffList,
  backfillMonth,
  summary,
  listForUser,
  markMoneyPaid,
  markOilPaid,
  voidRow,
  voidByPayment,
  SETTING_KEY,
};
