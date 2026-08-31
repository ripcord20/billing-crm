'use strict';

function normalize(s) {
  return String(s || '').trim();
}

/**
 * Cari device Device Management yang sama dengan NAS (IP atau identity/nama).
 * GANANET di /devices harus ketemu dari nasname 192.168.61.2 atau shortname GANANET.
 */
async function findManagedDevice(Device, { nasname, shortname, device_id } = {}) {
  if (!Device) return null;
  if (device_id) {
    const byId = await Device.findByPk(device_id);
    if (byId) return byId;
  }
  const ip = normalize(nasname);
  const ident = normalize(shortname);
  if (ip) {
    const byIp = await Device.findOne({ where: { ip_address: ip } });
    if (byIp) return byIp;
  }
  if (ident) {
    const byName = await Device.findOne({ where: { name: ident } });
    if (byName) return byName;
  }
  return null;
}

module.exports = { findManagedDevice, normalize };
