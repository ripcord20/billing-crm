'use strict';

/**
 * customers.mikrotik_id dipakai dua arti:
 *   - devices.id          (PPPoE / Device.findByPk / getMikrotikInstanceByDevice)
 *   - mikrotik_devices.id (dropdown Isolir)
 *
 * Di production angka bisa tabrakan: devices.id=5 adalah ACS (switch),
 * mikrotik_devices.id=5 adalah CORE 1. Form isolir menyimpan 5 (=CORE 1),
 * lalu UI Device.findByPk(5) menampilkan ACS.
 *
 * Aturan: kalau id itu ada di mikrotik_devices DAN baris devices-nya
 * bukan router PPPoE (switch / ACS), pakai device_id hasil mapping.
 */

function resolveDevicesIdFromMaps(rawId, maps = {}) {
  const id = parseInt(rawId, 10);
  if (!id) return null;
  const devices = maps.devices || new Map();
  const extensions = maps.extensions || new Map();
  const mapped = extensions.has(id) ? parseInt(extensions.get(id), 10) : null;
  const asDevice = devices.get(id) || null;
  if (mapped && (!asDevice || asDevice.type !== 'router')) return mapped;
  if (asDevice) return asDevice.id;
  return mapped || id;
}

async function loadRouterMaps(sequelize) {
  const seq = sequelize || require('../models').sequelize;
  const devices = new Map();
  const extensions = new Map();
  const [devRows] = await seq.query('SELECT id, name, type FROM devices');
  (devRows || []).forEach((d) => {
    devices.set(Number(d.id), { id: Number(d.id), name: d.name, type: d.type });
  });
  try {
    const [mdRows] = await seq.query('SELECT id, device_id FROM mikrotik_devices');
    (mdRows || []).forEach((m) => {
      extensions.set(Number(m.id), Number(m.device_id));
    });
  } catch (_) { /* tabel isolir belum ada */ }
  return { devices, extensions };
}

async function resolveDevicesId(rawId, sequelize) {
  const id = parseInt(rawId, 10);
  if (!id) return null;
  const maps = await loadRouterMaps(sequelize);
  return resolveDevicesIdFromMaps(id, maps);
}

async function normalizeCustomerMikrotikId(data, sequelize) {
  if (!data || data.mikrotik_id == null || data.mikrotik_id === '') return data;
  const resolved = await resolveDevicesId(data.mikrotik_id, sequelize);
  if (resolved) data.mikrotik_id = resolved;
  return data;
}

module.exports = {
  resolveDevicesIdFromMaps,
  resolveDevicesId,
  normalizeCustomerMikrotikId
};
