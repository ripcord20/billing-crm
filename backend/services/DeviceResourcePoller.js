'use strict';

/**
 * DeviceResourcePoller — CPU & memory saja, tanpa traffic/log.
 *
 * Device Management sebelumnya hanya menampilkan angka dari tabel devices
 * yang di-refresh 30 detik, sementara poller SNMP/API sering 60 detik.
 * Poller ini mengambil /system/resource (atau SNMP CPU/RAM) lalu broadcast
 * lewat Socket.IO. Cepat (5s) hanya saat ada admin di halaman Device
 * Management; idle 30s supaya tidak membebani router.
 */

const logger = require('../utils/logger');

const FAST_MS = 5000;
const IDLE_MS = 30000;
const BATCH = 3;

let _io = null;
let _timer = null;
let _subscribers = 0;
let _running = false;
let _mode = null;

function attachIo(io) {
  _io = io;
}

function subscriberCount() {
  return _subscribers;
}

function addSubscriber() {
  _subscribers += 1;
  if (_subscribers === 1) setMode('fast');
  tick().catch(() => {});
}

function removeSubscriber() {
  _subscribers = Math.max(0, _subscribers - 1);
  if (_subscribers === 0) setMode('idle');
}

function setMode(mode) {
  if (_mode === mode && _timer) return;
  _mode = mode;
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  const ms = mode === 'fast' ? FAST_MS : IDLE_MS;
  _timer = setInterval(() => { tick().catch(() => {}); }, ms);
  logger.info(`[ResourcePoller] mode=${mode} interval=${ms}ms`);
}

function start(io) {
  attachIo(io);
  setMode('idle');
  tick().catch(() => {});
}

function stop() {
  if (_timer) clearInterval(_timer);
  _timer = null;
  _mode = null;
}

async function tick() {
  if (_running) return;
  _running = true;
  try {
    const { Device } = require('../models');
    const devices = await Device.findAll({
      where: { is_active: true },
      attributes: [
        'id', 'name', 'ip_address', 'type', 'brand', 'monitoring_type',
        'snmp_community', 'snmp_port', 'snmp_version',
        'api_username', 'api_password', 'api_port', 'api_protocol',
        'cpu_load', 'memory_usage', 'status', 'uptime'
      ]
    });
    for (let i = 0; i < devices.length; i += BATCH) {
      const batch = devices.slice(i, i + BATCH);
      await Promise.all(batch.map((device) => pollOne(device).catch((e) => {
        logger.debug(`[ResourcePoller] ${device.name}: ${e.message}`);
      })));
    }
  } catch (e) {
    logger.warn('[ResourcePoller] ' + (e.message || e));
  } finally {
    _running = false;
  }
}

async function pollOne(device) {
  const canApi = !!(device.api_username && ['router', 'olt', 'switch'].includes(device.type));
  let metrics = null;
  if (canApi) {
    try { metrics = await pollMikrotik(device); } catch (_) { metrics = null; }
  }
  if (!metrics) {
    try { metrics = await pollSnmp(device); } catch (_) { metrics = null; }
  }
  if (!metrics) return;

  await device.update({
    cpu_load: metrics.cpu,
    memory_usage: metrics.memory,
    uptime: metrics.uptime || device.uptime,
    status: metrics.status,
    last_polled: new Date()
  });

  emit(device, metrics);
}

function emit(device, metrics) {
  if (!_io) return;
  const payload = {
    device_id: device.id,
    name: device.name,
    status: metrics.status,
    cpu_load: metrics.cpu,
    memory_usage: metrics.memory,
    uptime: metrics.uptime || null,
    last_polled: new Date(),
    timestamp: new Date()
  };
  _io.to('device_management').emit('devices:metrics', payload);
  _io.emit('monitoring:update', payload);
}

async function pollMikrotik(device) {
  const { MikrotikService } = require('./MikrotikService');
  const mt = new MikrotikService({
    host: device.ip_address,
    port: device.api_port || 80,
    username: device.api_username,
    password: device.api_password || '',
    api_protocol: device.api_protocol || null,
    timeout: 4000
  });
  const r = await mt.getSystemResource();
  const total = Number(r.totalMemory) || 0;
  const free = Number(r.freeMemory) || 0;
  const memory = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
  return {
    cpu: Number(r.cpuLoad) || 0,
    memory,
    uptime: r.uptime || '',
    status: 'online'
  };
}

async function pollSnmp(device) {
  let snmp;
  try { snmp = require('net-snmp'); } catch (_) { return null; }
  const { SNMP_OIDS } = require('../config/constants');

  const session = snmp.createSession(device.ip_address, device.snmp_community || 'public', {
    port: device.snmp_port || 161,
    version: device.snmp_version === 1 ? snmp.Version1 : snmp.Version2c,
    timeout: 3000,
    retries: 0
  });

  const oids = [SNMP_OIDS.MT_CPU_LOAD, SNMP_OIDS.MT_TOTAL_MEMORY, SNMP_OIDS.MT_USED_MEMORY];
  try {
    const varbinds = await new Promise((resolve, reject) => {
      session.get(oids, (err, vbs) => (err ? reject(err) : resolve(vbs || [])));
    });
    let cpu = 0;
    let total = 0;
    let used = 0;
    for (const vb of varbinds) {
      if (snmp.isVarbindError && snmp.isVarbindError(vb)) continue;
      const oid = vb.oid.join ? vb.oid.join('.') : String(vb.oid);
      const val = parseInt(vb.value, 10) || 0;
      if (oid === SNMP_OIDS.MT_CPU_LOAD) cpu = val;
      else if (oid === SNMP_OIDS.MT_TOTAL_MEMORY) total = val;
      else if (oid === SNMP_OIDS.MT_USED_MEMORY) used = val;
    }
    const memory = total > 0 ? Math.round((used / total) * 100) : 0;
    return { cpu, memory, uptime: '', status: 'online' };
  } finally {
    try { session.close(); } catch (_) {}
  }
}

module.exports = {
  start,
  stop,
  attachIo,
  addSubscriber,
  removeSubscriber,
  subscriberCount
};
