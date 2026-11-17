'use strict';

/**
 * Pantauan KHUSUS port uplink yang di-pin di Device Management.
 * Tidak memantau ether LAN / PPPoE / keyword komentar.
 */

const logger = require('../utils/logger');
const Store = require('./MonitorStateStore');
const {
  classifyPinnedIface,
  bitsToMbps,
  truthyFlag,
  fmtWaktu,
  formatUplinkTelegramHtml,
  uplinkRefId,
} = require('../utils/uplinkOps');

const POLL_MS = 30 * 1000;
const FLAP_SEC = 20;

let _snapshot = [];
let _pollHandle = null;
let _io = null;
let _busy = false;
let _started = false;

function getSnapshot() {
  return _snapshot.slice();
}

function downCount() {
  return _snapshot.filter(r => r.isDown && r.state !== 'unknown').length;
}

async function _telegramOn() {
  try {
    const Telegram = require('./TelegramService');
    const cfg = await Telegram._getConfig();
    if (!Telegram.isEnabled(cfg)) return { on: false, cfg };
    return { on: truthyFlag(cfg.telegram_notif_uplink, true), cfg };
  } catch (_) {
    return { on: false, cfg: {} };
  }
}

async function _notify(event, row) {
  const waktu = fmtWaktu();
  const komentar = row.comment ? ` (${row.comment})` : '';

  try {
    const tg = await _telegramOn();
    if (tg.on) {
      const Notifier = require('./MonitorNotifier');
      const html = formatUplinkTelegramHtml({
        event, router: row.router_name, iface: row.iface, komentar, waktu,
      });
      await Notifier.sendOne(tg.cfg, {
        kind: 'uplink',
        event,
        refId: row.ref_id,
        title: `${row.router_name} · ${row.iface}`,
        detail: row.comment || row.iface,
        text: html,
      });
    }
  } catch (e) {
    logger.warn('[Uplink] telegram notif gagal: ' + e.message);
  }

  try {
    await require('./OpsNotifyService').notifyUplink({
      event,
      router: row.router_name,
      iface: row.iface,
      comment: row.comment,
    });
  } catch (e) {
    logger.warn('[Uplink] WA grup notif gagal: ' + e.message);
  }
}

async function pollOnce() {
  const { Device } = require('../models');
  const { Op } = require('sequelize');
  const { getMikrotikInstanceByDevice } = require('./MikrotikService');

  let devices = [];
  try {
    devices = await Device.findAll({
      where: {
        is_active: true,
        type: 'router',
        uplink_iface: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
      },
      attributes: ['id', 'name', 'ip_address', 'uplink_iface', 'status'],
      order: [['name', 'ASC']],
    });
  } catch (e) {
    if (/unknown column|uplink_iface/i.test(e.message || '')) {
      _snapshot = [];
      return _snapshot;
    }
    throw e;
  }

  const next = [];
  for (const d of devices) {
    const ifaceName = String(d.uplink_iface || '').trim();
    if (!ifaceName) continue;
    const base = {
      device_id: d.id,
      router_name: d.name || ('Router #' + d.id),
      router_ip: d.ip_address || '',
      iface: ifaceName,
      comment: '',
      rx_mbps: 0,
      tx_mbps: 0,
      ref_id: uplinkRefId(d.id, ifaceName),
      polled_at: new Date().toISOString(),
    };

    let ifaces;
    try {
      const mt = await getMikrotikInstanceByDevice(d.id);
      ifaces = await mt.getInterfaces();
    } catch (e) {
      next.push({
        ...base,
        state: 'unknown',
        isDown: false,
        label: 'Router tidak terjangkau',
        error: e.message,
      });
      continue;
    }

    const iface = (ifaces || []).find(i => i && i.name === ifaceName) || null;
    const cls = classifyPinnedIface(iface);
    let rx = 0, tx = 0;
    if (iface && !cls.isDown) {
      try {
        const mt = await getMikrotikInstanceByDevice(d.id);
        const st = await mt.getInterfaceStats(ifaceName);
        rx = bitsToMbps(st && st.rxBitsPerSecond);
        tx = bitsToMbps(st && st.txBitsPerSecond);
      } catch (_) {}
    }

    const row = {
      ...base,
      comment: (iface && iface.comment) || '',
      rx_mbps: rx,
      tx_mbps: tx,
      state: cls.state,
      isDown: cls.isDown,
      label: cls.label,
      running: !!(iface && iface.running),
      disabled: !!(iface && iface.disabled),
    };

    const tr = Store.evaluate('uplink', row.ref_id, cls.isDown, {
      isBaseline: false,
      flapGuardSec: FLAP_SEC,
    });
    if (tr === 'down' || tr === 'recover') {
      setImmediate(() => {
        _notify(tr, row).catch(e => logger.warn('[Uplink] notify: ' + e.message));
      });
    }
    next.push(row);
  }

  _snapshot = next;
  if (_io) {
    try { _io.emit('uplink:snapshot', next); } catch (_) {}
  }
  return next;
}

async function _tick() {
  if (_busy) return;
  _busy = true;
  try {
    await pollOnce();
  } catch (e) {
    logger.error('[Uplink] poll error: ' + e.message);
  } finally {
    _busy = false;
  }
}

function start(io) {
  if (_started) return;
  _started = true;
  _io = io || null;
  setImmediate(() => _tick());
  _pollHandle = setInterval(_tick, POLL_MS);
  logger.info(`[UplinkMonitor] started — every ${POLL_MS / 1000}s, pin-only`);
}

function stop() {
  if (_pollHandle) {
    clearInterval(_pollHandle);
    _pollHandle = null;
  }
  _started = false;
}

async function sendTestNotif() {
  const Telegram = require('./TelegramService');
  const Notifier = require('./MonitorNotifier');
  const cfg = await Telegram._getConfig();
  if (!Telegram.isEnabled(cfg)) {
    return { ok: false, message: 'Telegram belum aktif.' };
  }
  const html = '<i>[CONTOH]</i> ' + formatUplinkTelegramHtml({
    event: 'down',
    router: 'CORE1',
    iface: 'sfp-sfpplus1',
    komentar: ' (Uplink ISP)',
    waktu: fmtWaktu(),
  });
  const res = await Notifier.sendOne(cfg, {
    kind: 'uplink', event: 'down', refId: null,
    title: 'CORE1 · sfp-sfpplus1', detail: 'Uplink ISP', text: html,
  });
  return {
    ok: !!res.ok,
    message: res.ok
      ? `Contoh uplink terkirim (${res.okCount}/${res.total} chat)`
      : 'Gagal kirim contoh uplink.',
  };
}

const TPL_DEFAULTS = {
  uplink_down: '<b>UPLINK DOWN</b>\n\nRouter: <b>{router}</b>\nInterface: <code>{iface}</code>{komentar}\n{waktu}',
  uplink_recover: '<b>UPLINK KEMBALI UP</b>\n\nRouter: <b>{router}</b>\nInterface: <code>{iface}</code>\n{waktu}',
};

module.exports = {
  start,
  stop,
  pollOnce,
  getSnapshot,
  downCount,
  sendTestNotif,
  TPL_DEFAULTS,
  POLL_MS,
  FLAP_SEC,
};
