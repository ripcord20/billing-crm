'use strict';

/**
 * MemoryGuard — prune berkala + log heap.
 * Tidak memaksa GC. Hanya memanggil pruner yang didaftarkan layanan
 * (WA msgstore, traffic poller, NOC alerts) supaya cache tidak menumpuk.
 */

const logger = require('./logger');

const INTERVAL_MS = parseInt(process.env.MEMORY_GUARD_INTERVAL_MS || String(5 * 60 * 1000), 10);

const _pruners = [];
let _timer = null;
let _started = false;

function register(name, fn) {
  if (!name || typeof fn !== 'function') return;
  const i = _pruners.findIndex(p => p.name === name);
  if (i >= 0) _pruners[i] = { name, fn };
  else _pruners.push({ name, fn });
}

function snapshot() {
  const mu = process.memoryUsage();
  const mb = (n) => +(n / 1024 / 1024).toFixed(1);
  return {
    rssMb: mb(mu.rss),
    heapUsedMb: mb(mu.heapUsed),
    heapTotalMb: mb(mu.heapTotal),
    externalMb: mb(mu.external),
    arrayBuffersMb: mb(mu.arrayBuffers || 0),
  };
}

function _registerDefaults() {
  try {
    const WA = require('../services/WAService');
    if (typeof WA.pruneMsgStore === 'function') register('waMsgStore', () => WA.pruneMsgStore());
  } catch (_) { /* modul belum siap */ }
  try {
    const poller = require('../services/CustomerTrafficPoller');
    if (typeof poller.pruneCaches === 'function') register('trafficPoller', () => poller.pruneCaches());
  } catch (_) { /* modul belum siap */ }
  try {
    const noc = require('../services/NocAlertsService');
    if (typeof noc.pruneEvents === 'function') register('nocAlerts', () => noc.pruneEvents());
  } catch (_) { /* modul belum siap */ }
}

function run() {
  const before = snapshot();
  const pruned = {};
  for (const p of _pruners) {
    try { pruned[p.name] = p.fn() || true; }
    catch (e) { pruned[p.name] = { error: e.message }; }
  }
  const after = snapshot();
  logger.info('[MemoryGuard] heap ' + after.heapUsedMb + 'MB rss ' + after.rssMb + 'MB'
    + ' (sebelum ' + before.heapUsedMb + 'MB)');
  return { before, after, pruned };
}

function start() {
  if (_timer) return;
  if (!_started) {
    _registerDefaults();
    _started = true;
  }
  _timer = setInterval(() => {
    try { run(); } catch (_) { /* jangan jatuhkan proses */ }
  }, Math.max(30 * 1000, INTERVAL_MS));
  if (_timer.unref) _timer.unref();
  logger.info('[MemoryGuard] started interval=' + INTERVAL_MS + 'ms');
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop, run, snapshot, register };
