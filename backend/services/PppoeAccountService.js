'use strict';

/**
 * Satu pintu pembuatan akun PPPoE.
 *
 * Kalau server RADIUS aktif → tulis radcheck/radreply (bukan /ppp/secret).
 * Kalau belum ada RADIUS → fallback ke MikroTik secret seperti sebelumnya.
 */

const logger = require('../utils/logger');

function extractPppoeFields(body) {
  const src = body && typeof body === 'object' ? body : {};
  const username = String(src.pppoe_username || src.username || '').trim();
  const password = src.radius_password || src.pppoe_password || src.password || null;
  const profile = src.pppoe_profile || src.profile || src.groupname || null;
  const backend = String(src.pppoe_backend || src.auth_backend || 'auto').toLowerCase();
  const deviceId = src.mikrotik_id || src.device_id || src.router_id || null;
  const flag = src.create_pppoe === true || src.create_pppoe === 'true' || src.create_pppoe === 1;
  return {
    username,
    password: password ? String(password) : null,
    profile: profile ? String(profile).trim() : null,
    backend: ['radius', 'mikrotik', 'auto'].includes(backend) ? backend : 'auto',
    deviceId: deviceId ? parseInt(deviceId, 10) : null,
    localAddress: String(src.pppoe_local_address || src.localAddress || '').trim() || null,
    remoteAddress: String(src.pppoe_remote_address || src.remoteAddress || src.static_ip || '').trim() || null,
    service: src.pppoe_service || src.service || 'pppoe',
    comment: src.comment || null,
    create: flag || !!(password && username)
  };
}

function stripPppoeFields(body) {
  if (!body || typeof body !== 'object') return body;
  [
    'create_pppoe', 'radius_password', 'pppoe_profile',
    'pppoe_service', 'pppoe_local_address', 'pppoe_remote_address',
    'pppoe_backend', 'auth_backend', 'groupname', 'router_id', 'device_id',
    'sync_pppoe', 'sync_to_router', 'password', 'username', 'profile', 'service',
    'localAddress', 'remoteAddress'
  ].forEach(k => { delete body[k]; });
  return body;
}

function applyRouterAlias(data) {
  if (!data || typeof data !== 'object') return data;
  if (!data.mikrotik_id && (data.router_id || data.device_id)) {
    const n = parseInt(data.router_id || data.device_id, 10);
    if (n) data.mikrotik_id = n;
  }
  return data;
}

function describeMikrotikPppError(err) {
  const msg = String((err && err.message) || err || '');
  if (/\(9\)|not enough permissions/i.test(msg)) {
    return 'User API MikroTik tidak punya izin menulis PPP secret (error 9). '
      + 'Seperti BillingRadius, pelanggan harus didaftarkan ke RADIUS (menu Monitoring → RADIUS) '
      + 'supaya bisa dial tanpa menulis /ppp/secret. Atau ganti group user API di MikroTik ke full.';
  }
  return msg;
}

async function preferRadius(tenantId) {
  try {
    return await require('./RadiusProvisionService').isEnabled(tenantId);
  } catch (_) {
    return false;
  }
}

async function provisionForCustomer(customer, opts = {}) {
  const username = String(opts.username || customer.pppoe_username || '').trim();
  const password = opts.password || customer.pppoe_password;
  const backend = opts.backend || 'auto';
  if (!username) return { success: false, message: 'Username PPPoE wajib diisi' };
  if (!password) return { success: false, message: 'Password PPPoE wajib diisi' };

  const pkgProfile = customer.package && (customer.package.radius_group || customer.package.mikrotik_profile);
  const profile = opts.profile || pkgProfile || null;

  const useRadius = backend === 'radius' || (backend !== 'mikrotik' && await preferRadius(customer.tenant_id));

  if (useRadius) {
    const RadiusProv = require('./RadiusProvisionService');
    const result = await RadiusProv.syncCustomer(customer, {
      username,
      password,
      groupname: profile,
      remoteAddress: opts.remoteAddress,
      requirePassword: true,
      failIfExists: opts.failIfExists
    });
    if (result.skipped && result.reason === 'no_radius_server' && backend !== 'radius') {
      return provisionMikrotik(customer, { ...opts, profile }, username, password);
    }
    if (!result.success) return result;
    return result;
  }

  return provisionMikrotik(customer, { ...opts, profile }, username, password);
}

async function provisionMikrotik(customer, opts, username, password) {
  const deviceId = opts.deviceId || customer.mikrotik_id;
  if (!deviceId) {
    return {
      success: false,
      message: 'Pilih router MikroTik, atau daftarkan server RADIUS di Monitoring → RADIUS (cara BillingRadius: user tidak ditulis ke /ppp/secret).'
    };
  }
  try {
    const { getMikrotikInstanceByDevice } = require('./MikrotikService');
    const mt = await getMikrotikInstanceByDevice(deviceId);
    const profile = opts.profile || 'default';
    const comment = opts.comment || ((customer.customer_id || '') + ' — ' + (customer.name || ''));
    const payload = {
      name: username,
      password,
      profile,
      service: opts.service || 'pppoe',
      localAddress: opts.localAddress || '',
      remoteAddress: opts.remoteAddress || '',
      comment
    };

    let existing = null;
    try {
      const secrets = await mt.getPPPoESecrets();
      existing = (secrets || []).find(s => String(s.name || '').toLowerCase() === username.toLowerCase());
    } catch (_) {}

    if (existing && existing.id) {
      await mt.updatePPPoESecret(existing.id, payload);
      return { success: true, username, backend: 'mikrotik', device_id: deviceId, action: 'updated', profile };
    }

    await mt.createPPPoESecret(payload);
    return { success: true, username, backend: 'mikrotik', device_id: deviceId, action: 'created', profile };
  } catch (e) {
    logger.warn('[PppoeAccount] mikrotik create: ' + e.message);
    return { success: false, message: describeMikrotikPppError(e), backend: 'mikrotik' };
  }
}

async function provisionStandalone(opts = {}) {
  const username = String(opts.username || '').trim();
  const password = opts.password;
  const backend = opts.backend || 'auto';
  if (!username) return { success: false, message: 'Username wajib diisi' };
  if (!password) return { success: false, message: 'Password wajib diisi' };

  const useRadius = backend === 'radius' || (backend !== 'mikrotik' && await preferRadius(opts.tenant_id));
  if (useRadius) {
    const RadiusProv = require('./RadiusProvisionService');
    const result = await RadiusProv.provisionStandalone({
      username,
      password,
      profile: opts.profile,
      groupname: opts.profile,
      remoteAddress: opts.remoteAddress,
      tenant_id: opts.tenant_id,
      failIfExists: opts.failIfExists !== false
    });
    if (result.skipped && result.reason === 'no_radius_server' && backend !== 'radius') {
      return provisionMikrotik({ mikrotik_id: opts.deviceId, name: username, customer_id: '' }, opts, username, password);
    }
    return result;
  }
  return provisionMikrotik({ mikrotik_id: opts.deviceId, name: username, customer_id: '' }, opts, username, password);
}

module.exports = {
  extractPppoeFields,
  stripPppoeFields,
  applyRouterAlias,
  describeMikrotikPppError,
  preferRadius,
  provisionForCustomer,
  provisionStandalone
};
