'use strict';

function stripCidr(ip) {
  return String(ip || '').split('/')[0].trim();
}

function looksLikeLanDevice(device, tunnelIp) {
  if (!device) return false;
  const ip = stripCidr(device.ip_address);
  if (ip === tunnelIp) return false;
  const notes = String(device.notes || '');
  if (/tunnel WireGuard/i.test(notes)) return false;
  return true;
}

/**
 * Buat / update Device Management yang memakai IP tunnel WireGuard.
 * Tidak menimpa device LAN yang sudah tertaut (GANANET, CORE 1, dll).
 */
async function upsertTunnelDevice(Device, nas) {
  if (!Device || !nas) return null;
  const ip = stripCidr(nas.tunnel_address);
  if (!ip) return null;

  let device = null;
  if (nas.device_id) {
    device = await Device.findByPk(nas.device_id);
    if (looksLikeLanDevice(device, ip)) device = null;
  }
  if (!device) {
    device = await Device.findOne({ where: { ip_address: ip } });
  }

  const name = `${nas.shortname || 'NAS'} (WG)`;
  const notes = 'Dibuat otomatis dari Modul NAS — IP tunnel WireGuard untuk API/Winbox.';
  const patch = {
    ip_address: ip,
    monitoring_type: 'api',
    api_port: device && device.api_port ? device.api_port : 80,
    api_protocol: (device && device.api_protocol) || 'rest-http'
  };
  if (!device || !device.notes) patch.notes = notes;
  if (device && device.winbox_port == null) patch.winbox_port = 8291;

  if (device) {
    await device.update(patch);
  } else {
    const payload = {
      name,
      ip_address: ip,
      type: 'router',
      brand: 'MikroTik',
      monitoring_type: 'api',
      api_port: 80,
      api_protocol: 'rest-http',
      status: 'offline',
      notes,
      winbox_port: 8291
    };
    try {
      device = await Device.create(payload);
    } catch (_) {
      delete payload.winbox_port;
      device = await Device.create(payload);
    }
  }
  if (nas.device_id !== device.id) {
    await nas.update({ device_id: device.id });
  }
  return device;
}

/** nasname RADIUS harus = IP tunnel (sumber paket setelah WG). */
async function applyTunnelNasname(nas) {
  const ip = stripCidr(nas.tunnel_address);
  if (!ip || nas.nasname === ip) return false;
  await nas.update({ nasname: ip });
  return true;
}

module.exports = {
  stripCidr,
  looksLikeLanDevice,
  upsertTunnelDevice,
  applyTunnelNasname
};
