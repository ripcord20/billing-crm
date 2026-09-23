'use strict';

/**
 * SNMP CPU / memory / uptime reader that works for both RouterOS and SwOS.
 *
 * RouterOS exposes HOST-RESOURCES (hrProcessorLoad + hrStorage index 65536).
 * CSS/SwOS does not: only SNMPv2-MIB system + IF-MIB + limited MIKROTIK-MIB
 * (CPU temperature). Calling RouterOS OIDs on SwOS yields noSuchObject, and
 * a multi-OID SNMPv1 GET that includes those OIDs fails the whole PDU.
 */

const { SNMP_OIDS } = require('../config/constants');

let snmp;
try { snmp = require('net-snmp'); } catch (_) { snmp = null; }

const HR_RAM_TYPE = SNMP_OIDS.HR_STORAGE_RAM_TYPE || '1.3.6.1.2.1.25.2.1.2';

function oidStr(oid) {
  if (Array.isArray(oid)) return oid.join('.');
  return String(oid || '');
}

function vbValue(vb) {
  if (!vb) return null;
  if (Buffer.isBuffer(vb.value)) return vb.value.toString('utf8').replace(/\0/g, '').trim();
  return vb.value;
}

function isVbError(vb) {
  return !vb || (snmp && snmp.isVarbindError && snmp.isVarbindError(vb));
}

function formatUptimeTicks(ticks) {
  const n = Number(ticks);
  if (!Number.isFinite(n) || n < 0) return '';
  const seconds = Math.floor(n / 100);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function firmwareFromDescr(descr) {
  const s = String(descr || '').trim();
  if (!s) return '';
  const swos = s.match(/SwOS\s*v?[\d.]+/i);
  if (swos) return swos[0].replace(/\s+/g, ' ');
  const ros = s.match(/RouterOS\s*v?[\d.]+/i);
  if (ros) return ros[0];
  return s.length > 80 ? s.slice(0, 80) : s;
}

function isCssOrSwos(device, sysDescr) {
  const model = String((device && device.model) || '');
  const fw = String((device && device.firmware) || '');
  const descr = String(sysDescr || '');
  return /^CSS/i.test(model) || /SwOS/i.test(model) || /SwOS/i.test(fw) || /SwOS/i.test(descr);
}

function shouldSkipRouterOsApi(device, sysDescr) {
  if (isCssOrSwos(device, sysDescr)) return true;
  return false;
}

function isRealRouterOsResource(r) {
  if (!r || typeof r !== 'object') return false;
  const total = Number(r.totalMemory) || 0;
  const ver = String(r.version || '').trim();
  const board = String(r.boardName || '').trim();
  const up = String(r.uptime || '').trim();
  if (total > 0) return true;
  if (ver && up && up !== '0s') return true;
  if (board && ver) return true;
  return false;
}

function sessionGet(session, oids) {
  return new Promise((resolve, reject) => {
    if (!oids.length) return resolve([]);
    session.get(oids, (err, vbs) => (err ? reject(err) : resolve(vbs || [])));
  });
}

function sessionSubtree(session, oid, max, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const rows = [];
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(rows);
    };
    const timer = setTimeout(finish, timeoutMs);
    if (!snmp || !session || typeof session.subtree !== 'function') {
      return finish();
    }
    try {
      session.subtree(oid, max, (vb) => {
        if (!isVbError(vb)) rows.push(vb);
      }, () => finish());
    } catch (_) {
      finish();
    }
  });
}

function mapVarbinds(vbs) {
  const map = {};
  for (const vb of vbs || []) {
    if (isVbError(vb)) continue;
    map[oidStr(vb.oid)] = vb;
  }
  return map;
}

function parseTemp(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // MikroTik health OIDs are tenths of a degree (630 → 63.0°C)
  const c = n > 200 ? n / 10 : n;
  if (c < 1 || c > 150) return null;
  return Math.round(c * 10) / 10;
}

async function readMemory(session, firstMap) {
  const totalOid = SNMP_OIDS.MT_TOTAL_MEMORY;
  const usedOid = SNMP_OIDS.MT_USED_MEMORY;
  let total = 0;
  let used = 0;
  if (firstMap[totalOid]) total = parseInt(vbValue(firstMap[totalOid]), 10) || 0;
  if (firstMap[usedOid]) used = parseInt(vbValue(firstMap[usedOid]), 10) || 0;
  if (total > 0) {
    return { memory: Math.round((used / total) * 100), memoryKnown: true, memTotal: total, memUsed: used };
  }

  const rows = await sessionSubtree(session, SNMP_OIDS.HR_STORAGE_TABLE || '1.3.6.1.2.1.25.2.3.1', 80, 2500);
  if (!rows.length) return { memory: 0, memoryKnown: false, memTotal: 0, memUsed: 0 };

  const byIndex = {};
  for (const vb of rows) {
    const oid = oidStr(vb.oid);
    const parts = oid.split('.');
    const idx = parts[parts.length - 1];
    const col = parts[parts.length - 2];
    if (!byIndex[idx]) byIndex[idx] = {};
    byIndex[idx][col] = vbValue(vb);
  }

  let pick = null;
  for (const idx of Object.keys(byIndex)) {
    const row = byIndex[idx];
    const type = oidStr(row['2'] || '');
    const descr = String(row['3'] || '');
    const size = parseInt(row['5'], 10) || 0;
    const usedRow = parseInt(row['6'], 10) || 0;
    if (size <= 0) continue;
    const isRam = type === HR_RAM_TYPE
      || type.endsWith('.2.1.2')
      || /^(memory|ram|heap|main memory)$/i.test(descr.trim());
    if (isRam) { pick = { size, used: usedRow }; break; }
  }
  if (!pick) {
    // RouterOS sometimes only has index 65536 with empty type walk
    const ros = byIndex['65536'];
    if (ros && (parseInt(ros['5'], 10) || 0) > 0) {
      pick = { size: parseInt(ros['5'], 10) || 0, used: parseInt(ros['6'], 10) || 0 };
    }
  }
  if (!pick) return { memory: 0, memoryKnown: false, memTotal: 0, memUsed: 0 };
  return {
    memory: Math.round((pick.used / pick.size) * 100),
    memoryKnown: true,
    memTotal: pick.size,
    memUsed: pick.used
  };
}

async function readCpu(session) {
  const rows = await sessionSubtree(session, SNMP_OIDS.CPU_LOAD, 16, 2500);
  const loads = [];
  for (const vb of rows) {
    const v = parseInt(vbValue(vb), 10);
    if (Number.isFinite(v) && v >= 0 && v <= 100) loads.push(v);
  }
  if (loads.length) {
    return {
      cpu: Math.round(loads.reduce((a, b) => a + b, 0) / loads.length),
      cpuKnown: true
    };
  }
  return { cpu: 0, cpuKnown: false };
}

/**
 * @param {object} device  Sequelize device (ip, community, port, version, model)
 * @param {object} [opts]
 * @param {object} [opts.session] existing net-snmp session (not closed)
 * @returns {Promise<object>}
 */
async function collectSnmpResources(device, opts = {}) {
  const empty = {
    reachable: false,
    cpu: 0,
    memory: 0,
    cpuKnown: false,
    memoryKnown: false,
    uptime: '',
    firmware: '',
    temperature: null,
    sysDescr: '',
    sysName: '',
    memTotal: 0,
    memUsed: 0
  };
  if (!snmp) return empty;

  const own = !opts.session;
  const session = opts.session || snmp.createSession(
    device.ip_address,
    device.snmp_community || 'public',
    {
      port: device.snmp_port || 161,
      version: device.snmp_version === 1 ? snmp.Version1 : snmp.Version2c,
      timeout: opts.timeout || 4000,
      retries: opts.retries != null ? opts.retries : 1
    }
  );

  try {
    const sysOids = [SNMP_OIDS.SYSTEM_UPTIME, SNMP_OIDS.SYSTEM_NAME, SNMP_OIDS.SYSTEM_DESCR];
    let sysMap = {};
    try {
      sysMap = mapVarbinds(await sessionGet(session, sysOids));
    } catch (_) {
      return empty;
    }

    const sysDescr = String(vbValue(sysMap[SNMP_OIDS.SYSTEM_DESCR]) || '');
    const sysName = String(vbValue(sysMap[SNMP_OIDS.SYSTEM_NAME]) || '');
    const uptime = formatUptimeTicks(vbValue(sysMap[SNMP_OIDS.SYSTEM_UPTIME]));
    const swos = isCssOrSwos(device, sysDescr);

    const extraOids = [];
    extraOids.push(SNMP_OIDS.MT_FIRMWARE);
    extraOids.push(SNMP_OIDS.MT_CPU_TEMP);
    if (!swos) {
      extraOids.push(SNMP_OIDS.MT_TOTAL_MEMORY);
      extraOids.push(SNMP_OIDS.MT_USED_MEMORY);
    }

    let extraMap = {};
    try {
      extraMap = mapVarbinds(await sessionGet(session, extraOids));
    } catch (_) {
      extraMap = {};
    }

    const fwVb = extraMap[SNMP_OIDS.MT_FIRMWARE];
    const firmware = (fwVb ? String(vbValue(fwVb) || '') : '') || firmwareFromDescr(sysDescr);
    const temperature = parseTemp(vbValue(extraMap[SNMP_OIDS.MT_CPU_TEMP]));

    let cpu = { cpu: 0, cpuKnown: false };
    let mem = { memory: 0, memoryKnown: false, memTotal: 0, memUsed: 0 };
    if (!swos) {
      cpu = await readCpu(session);
      mem = await readMemory(session, extraMap);
    }

    return {
      reachable: true,
      cpu: cpu.cpu,
      memory: mem.memory,
      cpuKnown: cpu.cpuKnown,
      memoryKnown: mem.memoryKnown,
      uptime,
      firmware,
      temperature,
      sysDescr,
      sysName,
      memTotal: mem.memTotal,
      memUsed: mem.memUsed,
      swos
    };
  } catch (_) {
    return empty;
  } finally {
    if (own) {
      try { session.close(); } catch (_) {}
    }
  }
}

module.exports = {
  collectSnmpResources,
  isCssOrSwos,
  shouldSkipRouterOsApi,
  isRealRouterOsResource,
  formatUptimeTicks,
  firmwareFromDescr
};
