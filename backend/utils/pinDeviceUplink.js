'use strict';

const { pickActiveDefaultRouteIface } = require('./deviceMetrics');

function mikrotikForDevice(device) {
  if (!device || !device.ip_address) return null;
  const { MikrotikService, getMikrotikInstanceByDevice } = require('../services/MikrotikService');
  if (device.api_username && device.api_port) {
    return new MikrotikService({
      host: device.ip_address,
      port: device.api_port,
      username: device.api_username,
      password: device.api_password || '',
      api_protocol: device.api_protocol || null,
      useSSL: parseInt(device.api_port, 10) === 443
    });
  }
  return getMikrotikInstanceByDevice(device.id);
}

/**
 * If uplink_iface is empty, detect the default-route interface and persist it.
 * New devices skip the pin form → LAN+WAN totals look symmetric until this runs.
 */
async function pinDeviceUplinkIfEmpty(device, mt, fallbackName) {
  if (!device) return null;
  const current = String(device.uplink_iface || '').trim();
  if (current) return current;

  let name = null;
  const client = mt || await Promise.resolve(mikrotikForDevice(device)).catch(() => null);
  if (client && typeof client.getDefaultRouteIface === 'function') {
    name = String(await client.getDefaultRouteIface().catch(() => '') || '').trim();
  }
  if (!name) name = String(fallbackName || '').trim();
  if (!name) return null;

  try {
    await device.update({ uplink_iface: name });
  } catch (_) { /* column missing / race */ }
  return name;
}

async function pinDeviceUplinkWithTimeout(device, ms) {
  const timeout = Math.max(500, parseInt(ms, 10) || 4000);
  return Promise.race([
    pinDeviceUplinkIfEmpty(device),
    new Promise((resolve) => setTimeout(() => resolve(null), timeout))
  ]);
}

module.exports = {
  mikrotikForDevice,
  pinDeviceUplinkIfEmpty,
  pinDeviceUplinkWithTimeout,
  pickActiveDefaultRouteIface
};
