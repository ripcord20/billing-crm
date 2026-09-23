'use strict';

/**
 * DeviceResourcePoller — CPU & memory saja, tanpa traffic/log.
 *
 * Device Management menampilkan angka dari tabel devices. Poller ini
 * mengambil /system/resource (RouterOS) atau SNMP (termasuk CSS/SwOS)
 * lalu broadcast lewat Socket.IO. Cepat (5s) hanya saat ada admin di
 * halaman Device Management; idle 30s supaya tidak membebani perangkat.
 *
 * CSS/SwOS tidak punya REST /system/resource. Jangan anggap response
 * kosong sebagai sukses (itu yang menulis CPU/mem/uptime 0).
 */

const logger = require('../utils/logger');
const {
  collectSnmpResources,
  shouldSkipRouterOsApi,
  isRealRouterOsResource
} = require('../utils/snmpDeviceMetrics');

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
        'id', 'name', 'ip_address', 'type', 'brand', 'model', 'firmware',
        'monitoring_type',
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
  const canApi = !!(device.api_username && ['router', 'olt', 'switch'].includes(device.type))
    && !shouldSkipRouterOsApi(device);
  let metrics = null;
  if (canApi) {
    try { metrics = await pollMikrotik(device); } catch (_) { metrics = null; }
  }
  if (!metrics) {
    try { metrics = await pollSnmp(device); } catch (_) { metrics = null; }
  }
  if (!metrics) return;

  const patch = {
    status: metrics.status,
    last_polled: new Date()
  };
  if (metrics.uptime) patch.uptime = metrics.uptime;
  if (metrics.firmware) patch.firmware = metrics.firmware;
  if (metrics.cpuKnown) patch.cpu_load = metrics.cpu;
  if (metrics.memoryKnown) patch.memory_usage = metrics.memory;
  await device.update(patch);

  emit(device, metrics);
}

function emit(device, metrics) {
  if (!_io) return;
  const payload = {
    device_id: device.id,
    name: device.name,
    status: metrics.status,
    cpu_load: metrics.cpuKnown ? metrics.cpu : null,
    memory_usage: metrics.memoryKnown ? metrics.memory : null,
    cpu_known: !!metrics.cpuKnown,
    memory_known: !!metrics.memoryKnown,
    uptime: metrics.uptime || null,
    firmware: metrics.firmware || null,
    temperature: metrics.temperature != null ? metrics.temperature : null,
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
  if (!isRealRouterOsResource(r)) return null;
  const total = Number(r.totalMemory) || 0;
  const free = Number(r.freeMemory) || 0;
  const memory = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
  return {
    cpu: Number(r.cpuLoad) || 0,
    memory,
    cpuKnown: true,
    memoryKnown: total > 0,
    uptime: r.uptime && r.uptime !== '0s' ? r.uptime : '',
    firmware: r.version || '',
    temperature: null,
    status: 'online'
  };
}

async function pollSnmp(device) {
  const data = await collectSnmpResources(device, { timeout: 3000, retries: 0 });
  if (!data.reachable) return null;
  return {
    cpu: data.cpu,
    memory: data.memory,
    cpuKnown: data.cpuKnown,
    memoryKnown: data.memoryKnown,
    uptime: data.uptime || '',
    firmware: data.firmware || '',
    temperature: data.temperature,
    status: 'online'
  };
}

module.exports = {
  start,
  stop,
  attachIo,
  addSubscriber,
  removeSubscriber,
  subscriberCount
};
