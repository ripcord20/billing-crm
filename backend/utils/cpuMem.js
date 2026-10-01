'use strict';

/**
 * Pemakaian CPU & RAM yang nyata dari /proc (Linux).
 * CPU: delta jiffies /proc/stat — % busy (user+nice+system+irq+softirq+steal),
 *      bukan load-average/ncpu yang bisa >100% saat antrian I/O.
 * RAM: MemTotal - MemAvailable (cache yang bisa di-reclaim tidak dihitung "penuh").
 */

const fs = require('fs');
const os = require('os');

let prevCpu = null;

function parseProcStat(text) {
  const line = String(text).split('\n').find(l => l.startsWith('cpu '));
  if (!line) return null;
  const p = line.trim().split(/\s+/).slice(1).map(n => parseInt(n, 10) || 0);
  const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = p;
  const busy = user + nice + system + irq + softirq + steal;
  const idleAll = idle + iowait;
  return { user, nice, system, idle, iowait, irq, softirq, steal, busy, idleAll, total: busy + idleAll };
}

function readProcStat() {
  try {
    return parseProcStat(fs.readFileSync('/proc/stat', 'utf8'));
  } catch (_) {
    return null;
  }
}

function pct(part, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

/**
 * Hitung % CPU sejak sampel sebelumnya. Kalau belum ada sampel, ambil dua
 * snapshot berjarak sampleMs supaya request pertama tidak 0.
 */
function cpuUsageSync(sampleMs = 120) {
  const cur = readProcStat();
  if (!cur) {
    const loadAvg = os.loadavg();
    const n = os.cpus().length || 1;
    return {
      cpuPercent: Math.max(0, Math.min(100, Math.round((loadAvg[0] / n) * 100))),
      ioWaitPercent: 0,
      idlePercent: 0,
      loadAvg: loadAvg.map(v => Number(v.toFixed(2))),
      cpuCount: n
    };
  }

  let prev = prevCpu;
  if (!prev || cur.total <= prev.total) {
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sampleMs);
    } catch (_) {
      const t0 = Date.now();
      while (Date.now() - t0 < sampleMs) { /* fallback sample window */ }
    }
    const next = readProcStat() || cur;
    prev = cur;
    prevCpu = next;
    const dTotal = next.total - cur.total;
    const dBusy = next.busy - cur.busy;
    const dIo = next.iowait - cur.iowait;
    const dIdle = next.idle - cur.idle;
    return {
      cpuPercent: pct(dBusy, dTotal),
      ioWaitPercent: pct(dIo, dTotal),
      idlePercent: pct(dIdle, dTotal),
      loadAvg: os.loadavg().map(v => Number(v.toFixed(2))),
      cpuCount: os.cpus().length || 1
    };
  }

  const dTotal = cur.total - prev.total;
  const dBusy = cur.busy - prev.busy;
  const dIo = cur.iowait - prev.iowait;
  const dIdle = cur.idle - prev.idle;
  prevCpu = cur;
  return {
    cpuPercent: pct(dBusy, dTotal),
    ioWaitPercent: pct(dIo, dTotal),
    idlePercent: pct(dIdle, dTotal),
    loadAvg: os.loadavg().map(v => Number(v.toFixed(2))),
    cpuCount: os.cpus().length || 1
  };
}

function parseMeminfo(text) {
  const map = {};
  for (const line of String(text).split('\n')) {
    const m = line.match(/^(\w+):\s+(\d+)/);
    if (m) map[m[1]] = parseInt(m[2], 10) * 1024;
  }
  return map;
}

function memoryUsage() {
  let total = os.totalmem();
  let available = os.freemem();
  try {
    const info = parseMeminfo(fs.readFileSync('/proc/meminfo', 'utf8'));
    if (info.MemTotal) total = info.MemTotal;
    if (info.MemAvailable) available = info.MemAvailable;
    else if (info.MemFree != null) {
      available = info.MemFree + (info.Buffers || 0) + (info.Cached || 0);
    }
  } catch (_) { /* fallback os.* */ }
  const used = Math.max(0, total - available);
  return {
    totalMemory: total,
    freeMemory: available,
    usedMemory: used,
    memoryUsagePercent: total > 0 ? Math.round((used / total) * 100) : 0
  };
}

function collectServerResources() {
  const cpu = cpuUsageSync();
  const mem = memoryUsage();
  const uptimeSec = os.uptime();
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  return {
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.arch()}`,
    nodeVersion: process.version,
    uptime: `${days}d ${hours}h ${minutes}m`,
    uptimeSeconds: uptimeSec,
    cpuCount: cpu.cpuCount,
    cpuPercent: cpu.cpuPercent,
    cpuLoadPercent: cpu.cpuPercent,
    ioWaitPercent: cpu.ioWaitPercent,
    idlePercent: cpu.idlePercent,
    loadAvg: cpu.loadAvg,
    ...mem
  };
}

module.exports = {
  parseProcStat,
  parseMeminfo,
  cpuUsageSync,
  memoryUsage,
  collectServerResources
};
