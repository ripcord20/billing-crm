'use strict';

const { Op } = require('sequelize');
const { classifyRx } = require('./OntRedaman');
const { alarmFingerprint, parseAlarmTag } = require('./PsbFlow');
const logger = require('../utils/logger');

const OPEN_STATUSES = ['open', 'in_progress', 'pending'];

function ontKind(device) {
  if (!device) return null;
  if (device.status === 'offline') return 'ont_offline';
  const sev = classifyRx(device.signal_strength);
  if (sev === 'critical') return 'ont_critical';
  return null;
}

async function findOpenAlarm(kind, key) {
  const { Ticket } = require('../models');
  const fp = alarmFingerprint(kind, key);
  const rows = await Ticket.findAll({
    where: { status: { [Op.in]: OPEN_STATUSES } },
    attributes: ['id', 'ticket_number', 'title', 'status', 'tags', 'customer_id', 'tenant_id'],
    order: [['created_at', 'DESC']],
    limit: 400
  });
  for (const t of rows) {
    const tag = parseAlarmTag(t.tags);
    if (!tag) continue;
    if (tag.kind === kind && String(tag.key || '').toLowerCase() === String(key).toLowerCase()) return t;
    if (alarmFingerprint(tag.kind, tag.key) === fp) return t;
  }
  return null;
}

async function createAlarmTicket({ kind, key, title, description, customer, priority, assignedTo, tenantId }) {
  const { Ticket, TicketTimeline, WorkOrder, Customer } = require('../models');
  const existing = await findOpenAlarm(kind, key);
  if (existing) {
    if (tenantId && Number(existing.tenant_id) !== Number(tenantId)) {
      return { created: false, ticket: null, reason: 'tenant' };
    }
    return { created: false, ticket: existing, reason: 'open' };
  }

  let cust = customer || null;
  if (!cust && kind.startsWith('pppoe')) {
    cust = await Customer.findOne({ where: { pppoe_username: key } });
  }
  if (!cust && kind.startsWith('ont')) {
    cust = await Customer.findOne({ where: { ont_sn: key } });
  }
  if (tenantId) {
    if (!cust || Number(cust.tenant_id) !== Number(tenantId)) {
      return { created: false, ticket: null, reason: 'tenant' };
    }
  }

  const ticket = await Ticket.create({
    title,
    description,
    type: 'gangguan',
    priority: priority || (kind === 'ont_offline' || kind === 'ont_critical' ? 'critical' : 'high'),
    status: 'open',
    customer_id: cust ? cust.id : null,
    tenant_id: cust ? (cust.tenant_id || null) : null,
    assigned_to: assignedTo || null,
    sla_hours: kind === 'ont_critical' || kind === 'ont_offline' ? 8 : 24,
    tags: { source: 'alarm', kind, key: String(key) }
  });
  await TicketTimeline.create({
    ticket_id: ticket.id,
    user_id: null,
    type: 'system',
    content: `Alarm otomatis ${kind} untuk ${key}`
  });

  let wo = null;
  if (kind === 'ont_offline' || kind === 'ont_critical') {
    wo = await WorkOrder.create({
      type: 'repair',
      status: 'pending',
      priority: ticket.priority,
      title: `Perbaikan ${kind === 'ont_offline' ? 'ONT offline' : 'redaman kritis'} — ${key}`,
      description: description,
      customer_id: ticket.customer_id,
      ticket_id: ticket.id,
      tenant_id: ticket.tenant_id || null
    });
  }
  return { created: true, ticket, work_order: wo };
}

async function scanOntAlarms(opts = {}) {
  const { OntDevice } = require('../models');
  const devices = await OntDevice.findAll({
    attributes: ['id', 'serial_number', 'status', 'signal_strength', 'customer_id', 'last_inform'],
    limit: 5000
  });
  const created = [];
  const skipped = [];
  for (const d of devices) {
    const kind = ontKind(d);
    if (!kind) continue;
    const key = d.serial_number;
    const rx = d.signal_strength != null ? `${d.signal_strength} dBm` : 'n/a';
    const title = kind === 'ont_offline'
      ? `ONT offline ${key}`
      : `Redaman kritis ${key} (${rx})`;
    const description = kind === 'ont_offline'
      ? `ONT ${key} offline. Last inform: ${d.last_inform || '-'}.`
      : `RX Power ${rx} (kritis < −27 dBm). Serial ${key}.`;
    let customer = null;
    if (d.customer_id) {
      const { Customer } = require('../models');
      customer = await Customer.findByPk(d.customer_id);
    }
    const result = await createAlarmTicket({
      kind, key, title, description, customer, tenantId: opts.tenantId
    });
    if (result.reason === 'tenant') continue;
    if (result.created) created.push({ kind, key, ticket_number: result.ticket.ticket_number });
    else skipped.push({ kind, key, ticket_number: result.ticket && result.ticket.ticket_number });
  }
  return { created, skipped, scanned: devices.length };
}

async function scanPppoeDrops(opts = {}) {
  let events = [];
  try {
    const NocAlertsService = require('./NocAlertsService');
    events = NocAlertsService.getRecent(80) || [];
  } catch (_) {
    return { created: [], skipped: [], scanned: 0 };
  }
  const created = [];
  const skipped = [];
  const since = Date.now() - 20 * 60 * 1000;
  for (const ev of events) {
    if (ev.category !== 'pppoe_disconnect' || !ev.username) continue;
    const ts = ev.timestamp ? new Date(ev.timestamp).getTime() : 0;
    if (ts && ts < since) continue;
    const key = ev.username;
    const title = `PPPoE putus: ${key}`;
    const description = ev.detail || `Session ${key} terputus di ${ev.router_name || 'router'}.`;
    const result = await createAlarmTicket({
      kind: 'pppoe_drop',
      key,
      title,
      description,
      priority: 'high',
      tenantId: opts.tenantId
    });
    if (result.reason === 'tenant') continue;
    if (result.created) created.push({ kind: 'pppoe_drop', key, ticket_number: result.ticket.ticket_number });
    else skipped.push({ kind: 'pppoe_drop', key, ticket_number: result.ticket && result.ticket.ticket_number });
  }
  return { created, skipped, scanned: events.length };
}

async function scanAll(opts = {}) {
  const ont = await scanOntAlarms(opts);
  const pppoe = await scanPppoeDrops(opts);
  return {
    ont,
    pppoe,
    created: [...ont.created, ...pppoe.created],
    skipped: [...ont.skipped, ...pppoe.skipped]
  };
}

async function listOpenAlarms(whereExtra = {}) {
  const { Ticket, Customer } = require('../models');
  const rows = await Ticket.findAll({
    where: { status: { [Op.in]: OPEN_STATUSES }, ...whereExtra },
    include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'customer_id', 'phone'], required: false }],
    order: [['created_at', 'DESC']],
    limit: 200
  });
  return rows.filter((t) => parseAlarmTag(t.tags)).map((t) => {
    const tag = parseAlarmTag(t.tags);
    return {
      id: t.id,
      ticket_number: t.ticket_number,
      title: t.title,
      status: t.status,
      priority: t.priority,
      kind: tag.kind,
      key: tag.key,
      customer: t.customer,
      created_at: t.created_at || t.createdAt
    };
  });
}

async function cronTick() {
  try {
    const result = await scanAll();
    if (result.created.length) {
      logger.info(`[NocAlarm] created ${result.created.length} ticket(s)`);
    }
    return result;
  } catch (e) {
    logger.warn('[NocAlarm] scan failed: ' + e.message);
    return { created: [], skipped: [], error: e.message };
  }
}

module.exports = {
  ontKind,
  findOpenAlarm,
  createAlarmTicket,
  scanOntAlarms,
  scanPppoeDrops,
  scanAll,
  listOpenAlarms,
  cronTick
};
