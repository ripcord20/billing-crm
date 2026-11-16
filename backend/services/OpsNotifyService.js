'use strict';

/**
 * Kirim notifikasi operasional ke grup WhatsApp teknisi.
 * Tujuan grup di-pin sekali di Telegram Center (dropdown), bukan per tiket.
 */

const logger = require('../utils/logger');
const {
  truthyFlag,
  shouldNotifyTicketToTechGroup,
  fmtWaktu,
  formatUplinkWaText,
  formatTicketWaText,
} = require('../utils/uplinkOps');

const KEYS = [
  'ops_wa_group_jid',
  'ops_wa_group_name',
  'ops_wa_notify_uplink',
  'ops_wa_notify_ticket',
];

async function _cfg() {
  const { AppSetting } = require('../models');
  const { Op } = require('sequelize');
  const rows = await AppSetting.findAll({ where: { key: { [Op.in]: KEYS } } });
  const cfg = {};
  (rows || []).forEach(r => { cfg[r.key] = r.value; });
  return cfg;
}

async function getConfig() {
  const cfg = await _cfg();
  return {
    group_jid: (cfg.ops_wa_group_jid || '').trim(),
    group_name: (cfg.ops_wa_group_name || '').trim(),
    notify_uplink: truthyFlag(cfg.ops_wa_notify_uplink, true),
    notify_ticket: truthyFlag(cfg.ops_wa_notify_ticket, true),
  };
}

async function saveConfig(body = {}) {
  const { AppSetting } = require('../models');
  const map = {
    ops_wa_group_jid: String(body.group_jid || body.ops_wa_group_jid || '').trim(),
    ops_wa_group_name: String(body.group_name || body.ops_wa_group_name || '').trim(),
    ops_wa_notify_uplink: truthyFlag(body.notify_uplink ?? body.ops_wa_notify_uplink, true) ? '1' : '0',
    ops_wa_notify_ticket: truthyFlag(body.notify_ticket ?? body.ops_wa_notify_ticket, true) ? '1' : '0',
  };
  for (const [key, value] of Object.entries(map)) {
    await AppSetting.upsert({ key, value, type: 'string' });
  }
  return getConfig();
}

async function sendToTechGroup(text) {
  const cfg = await getConfig();
  if (!cfg.group_jid) return { ok: false, reason: 'no_group' };
  const Gateway = require('./GatewayService');
  const session = await Gateway.getDefaultSendingSession();
  if (!session) return { ok: false, reason: 'no_session' };
  try {
    await Gateway.warmSession(session.session_id);
  } catch (_) {}
  if (!Gateway.isConnected(session.session_id)) {
    return { ok: false, reason: 'session_offline' };
  }
  try {
    await Gateway.sendMessage(session.session_id, cfg.group_jid, text, null);
    return { ok: true, group: cfg.group_jid };
  } catch (e) {
    logger.warn('[OpsNotify] kirim grup gagal: ' + e.message);
    return { ok: false, reason: e.message };
  }
}

async function notifyUplink({ event, router, iface, comment }) {
  const cfg = await getConfig();
  if (!cfg.notify_uplink) return { ok: false, reason: 'disabled' };
  const text = formatUplinkWaText({
    event, router, iface, comment, waktu: fmtWaktu(),
  });
  return sendToTechGroup(text);
}

async function notifyTicket(ticketLike = {}) {
  const cfg = await getConfig();
  if (!cfg.notify_ticket) return { ok: false, reason: 'disabled' };
  if (!shouldNotifyTicketToTechGroup(ticketLike)) return { ok: false, reason: 'skipped_type' };
  const TYPE_LABEL = { gangguan: 'Gangguan', request: 'Permintaan', installation: 'Instalasi', maintenance: 'Perawatan' };
  const PRIO_LABEL = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi', critical: 'Kritis' };
  const text = formatTicketWaText({
    event: ticketLike.event || 'created',
    ticketNo: ticketLike.ticketNo,
    subject: ticketLike.subject,
    type: TYPE_LABEL[ticketLike.type] || ticketLike.type,
    priority: PRIO_LABEL[ticketLike.priority] || ticketLike.priority,
    customerName: ticketLike.customerName,
    customerCode: ticketLike.customerCode,
    assignedTo: ticketLike.assignedTo,
    locationNote: ticketLike.locationNote,
    description: ticketLike.description,
    createdBy: ticketLike.createdBy,
    waktu: fmtWaktu(ticketLike.createdAt),
  });
  return sendToTechGroup(text);
}

async function sendTest(kind) {
  const cfg = await getConfig();
  if (!cfg.group_jid) return { ok: false, message: 'Pilih grup teknisi dulu, lalu simpan.' };
  let text;
  if (kind === 'ticket') {
    text = formatTicketWaText({
      event: 'created',
      ticketNo: 'TKT-TES',
      subject: 'Contoh gangguan uplink / ODP',
      type: 'Gangguan',
      priority: 'Tinggi',
      customerName: 'Pelanggan Tes',
      customerCode: 'CST001',
      locationNote: 'ODP-01',
      description: 'Internet putus sejak pagi.',
      createdBy: 'Admin',
    });
  } else {
    text = formatUplinkWaText({
      event: 'down',
      router: 'CORE1',
      iface: 'sfp-sfpplus1',
      comment: 'Uplink ISP',
    });
  }
  const r = await sendToTechGroup(text);
  return {
    ok: !!r.ok,
    message: r.ok
      ? `Tes terkirim ke ${cfg.group_name || cfg.group_jid}`
      : ('Gagal kirim: ' + (r.reason || 'unknown')),
  };
}

module.exports = {
  KEYS,
  getConfig,
  saveConfig,
  sendToTechGroup,
  notifyUplink,
  notifyTicket,
  sendTest,
  shouldNotifyTicketToTechGroup,
};
