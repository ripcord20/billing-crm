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
    'create_pppoe', 'radius_password', 'pppoe_password', 'pppoe_profile',
    'pppoe_service', 'pppoe_local_address', 'pppoe_remote_address',
    'pppoe_backend', 'auth_backend', 'groupname', 'router_id', 'device_id'
  ].forEach(k => { delete body[k]; });
  return body;
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
  const password = opts.password;
  const backend = opts.backend || 'auto';
  if (!username) return { success: false, message: 'Username PPPoE wajib diisi' };
  if (!password) return { success: false, message: 'Password PPPoE wajib diisi' };

  const useRadius = backend === 'radius' || (backend !== 'mikrotik' && await preferRadius(customer.tenant_id));

  if (useRadius) {
    const RadiusProv = require('./RadiusProvisionService');
    const result = await RadiusProv.syncCustomer(customer, {
      username,
      password,
      groupname: opts.profile,
      remoteAddress: opts.remoteAddress,
      requirePassword: true,
      failIfExists: opts.failIfExists
    });
    if (result.skipped && result.reason === 'no_radius_server' && backend !== 'radius') {
      return provisionMikrotik(customer, opts, username, password);
    }
    if (!result.success) return result;
    return result;
  }

  return provisionMikrotik(customer, opts, username, password);
}

async function provisionMikrotik(customer, opts, username, password) {
  const deviceId = opts.deviceId || customer.mikrotik_id;
  if (!deviceId) {
    return { success: false, message: 'Pilih router MikroTik untuk membuat secret PPPoE' };
  }
  try {
    const { getMikrotikInstanceByDevice } = require('./MikrotikService');
    const mt = await getMikrotikInstanceByDevice(deviceId);
    await mt.createPPPoESecret({
      name: username,
      password,
      profile: opts.profile || 'default',
      service: opts.service || 'pppoe',
      localAddress: opts.localAddress || '',
      remoteAddress: opts.remoteAddress || '',
      comment: opts.comment || ((customer.customer_id || '') + ' — ' + (customer.name || ''))
    });
    return { success: true, username, backend: 'mikrotik', device_id: deviceId };
  } catch (e) {
    logger.warn('[PppoeAccount] mikrotik create: ' + e.message);
    return { success: false, message: e.message, backend: 'mikrotik' };
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
  preferRadius,
  provisionForCustomer,
  provisionStandalone
};
