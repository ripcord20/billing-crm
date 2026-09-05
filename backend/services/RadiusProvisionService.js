'use strict';

const { RadiusAccount, RadiusServer, Package } = require('../models');
const RadiusSQL = require('./RadiusSqlService');
const logger = require('../utils/logger');
const { isIpv4, rateLimitFromPackage } = require('../utils/radiusMysql');

async function resolveServer(hint, tenantId) {
  if (hint && typeof hint === 'object' && hint.id && hint.mysql_host) return hint;
  const id = hint && typeof hint === 'object' ? hint.id : hint;
  if (id) {
    const byId = await RadiusServer.findByPk(id);
    if (byId) return byId;
  }
  const tid = tenantId || null;
  if (tid) {
    const scoped = await RadiusServer.findOne({ where: { tenant_id: tid, is_active: true }, order: [['id', 'ASC']] });
    if (scoped) return scoped;
  }
  return RadiusServer.findOne({ where: { is_active: true }, order: [['id', 'ASC']] });
}

async function isEnabled(tenantId) {
  const server = await resolveServer(null, tenantId);
  return !!server;
}

async function hasAccount(customerId) {
  const row = await RadiusAccount.findOne({ where: { customer_id: customerId } });
  return !!row;
}

async function upsertLocalAccount(customer, server, { username, groupname, nasId }) {
  const status = customer.isolir_status === 'isolated' ? 'isolated' : 'active';
  const [acc] = await RadiusAccount.findOrCreate({
    where: customer.id ? { customer_id: customer.id } : { username },
    defaults: {
      tenant_id: customer.tenant_id || null,
      customer_id: customer.id || null,
      radius_server_id: server.id,
      nas_id: nasId || null,
      username,
      groupname: groupname || null,
      status,
      last_sync_at: new Date(),
      last_error: null
    }
  });
  await acc.update({
    username,
    radius_server_id: server.id,
    groupname: groupname || acc.groupname,
    nas_id: nasId || acc.nas_id,
    last_sync_at: new Date(),
    last_error: null,
    status
  });
  return acc;
}

async function syncCustomer(customer, opts = {}) {
  const username = String(opts.username || customer.pppoe_username || '').trim();
  if (!username) return { skipped: true, reason: 'no_username', message: 'Username PPPoE wajib diisi' };

  const password = opts.password || opts.radius_password || null;
  if (!password && opts.requirePassword) {
    return { skipped: true, reason: 'no_password', message: 'Password PPPoE wajib diisi' };
  }

  const server = await resolveServer(opts.server, customer.tenant_id);
  if (!server) return { skipped: true, reason: 'no_radius_server', message: 'Server RADIUS belum dikonfigurasi' };

  let pkg = customer.package;
  if (!pkg && customer.package_id) {
    pkg = await Package.findByPk(customer.package_id);
  }
  const groupname = opts.groupname || pkg?.radius_group || pkg?.mikrotik_profile || null;
  const rateLimit = opts.rateLimit || rateLimitFromPackage(pkg);
  const remote = String(opts.framedIp || opts.remoteAddress || customer.static_ip || '').trim();
  const framedIp = isIpv4(remote) ? remote : null;
  const framedPool = (!framedIp && remote) ? remote : (opts.framedPool || null);

  try {
    if (password) {
      const exists = await RadiusSQL.userExists(server, username);
      if (exists && opts.failIfExists) {
        return { success: false, message: `User RADIUS "${username}" sudah ada` };
      }
      await RadiusSQL.provisionUser(server, { username, password, groupname, rateLimit, framedIp, framedPool });
    } else if (groupname || rateLimit || framedIp || framedPool) {
      await RadiusSQL.provisionUser(server, { username, groupname, rateLimit, framedIp, framedPool });
    }

    if (customer && customer.id) {
      await upsertLocalAccount(customer, server, { username, groupname, nasId: opts.nas_id });
    }

    if (customer && customer.isolir_status === 'isolated') {
      await RadiusSQL.isolateUser(server, username);
    }

    return { success: true, username, server_id: server.id, backend: 'radius', groupname };
  } catch (e) {
    logger.warn('[RadiusProvision] syncCustomer: ' + e.message);
    try {
      if (customer && customer.id) {
        const acc = await RadiusAccount.findOne({ where: { customer_id: customer.id } });
        if (acc) await acc.update({ last_error: e.message.slice(0, 250) });
      }
    } catch (_) {}
    return { success: false, message: e.message, backend: 'radius' };
  }
}

async function provisionStandalone(opts = {}) {
  const username = String(opts.username || '').trim();
  const password = opts.password;
  if (!username) return { success: false, message: 'Username wajib diisi' };
  if (!password) return { success: false, message: 'Password wajib diisi' };

  const server = await resolveServer(opts.server, opts.tenant_id);
  if (!server) return { skipped: true, reason: 'no_radius_server', message: 'Server RADIUS belum dikonfigurasi' };

  const remote = String(opts.framedIp || opts.remoteAddress || '').trim();
  const framedIp = isIpv4(remote) ? remote : null;
  const framedPool = (!framedIp && remote) ? remote : (opts.framedPool || null);

  try {
    const exists = await RadiusSQL.userExists(server, username);
    if (exists && opts.failIfExists !== false) {
      return { success: false, message: `User RADIUS "${username}" sudah ada` };
    }
    await RadiusSQL.provisionUser(server, {
      username,
      password,
      groupname: opts.groupname || opts.profile || null,
      rateLimit: opts.rateLimit || null,
      framedIp,
      framedPool
    });
    await RadiusAccount.findOrCreate({
      where: { username },
      defaults: {
        tenant_id: opts.tenant_id || null,
        customer_id: opts.customer_id || null,
        radius_server_id: server.id,
        username,
        groupname: opts.groupname || opts.profile || null,
        status: 'active',
        last_sync_at: new Date()
      }
    });
    return { success: true, username, server_id: server.id, backend: 'radius' };
  } catch (e) {
    logger.warn('[RadiusProvision] standalone: ' + e.message);
    return { success: false, message: e.message, backend: 'radius' };
  }
}

async function isolir(customer) {
  const username = String(customer.pppoe_username || '').trim();
  const acc = customer.id ? await RadiusAccount.findOne({ where: { customer_id: customer.id } }) : null;
  const user = username || acc?.username;
  if (!user) return { success: false, skipped: true, message: 'Tidak ada akun RADIUS' };

  const server = await resolveServer(acc?.radius_server_id, customer.tenant_id);
  if (!server) return { success: false, message: 'Server RADIUS belum dikonfigurasi' };

  await RadiusSQL.isolateUser(server, user);
  if (acc) await acc.update({ status: 'isolated', last_sync_at: new Date(), last_error: null });
  else if (customer.id) {
    await RadiusAccount.create({
      tenant_id: customer.tenant_id || null,
      customer_id: customer.id,
      radius_server_id: server.id,
      username: user,
      status: 'isolated',
      last_sync_at: new Date()
    });
  }
  return { success: true, username: user, method: 'radius', backend: 'radius' };
}

async function restore(customer) {
  const acc = customer.id ? await RadiusAccount.findOne({ where: { customer_id: customer.id } }) : null;
  const username = String(customer.pppoe_username || acc?.username || '').trim();
  if (!username) return { success: false, skipped: true, message: 'Tidak ada akun RADIUS' };

  const server = await resolveServer(acc?.radius_server_id, customer.tenant_id);
  if (!server) return { success: false, message: 'Server RADIUS belum dikonfigurasi' };

  await RadiusSQL.restoreUser(server, username);
  if (acc) await acc.update({ status: 'active', last_sync_at: new Date(), last_error: null });
  return { success: true, username, method: 'radius', backend: 'radius' };
}

async function rename(customer, oldUsername, newUsername) {
  const acc = customer.id ? await RadiusAccount.findOne({ where: { customer_id: customer.id } }) : null;
  const from = String(oldUsername || acc?.username || '').trim();
  const to = String(newUsername || '').trim();
  if (!from) return { success: false, skipped: true, message: 'Tidak ada username lama di RADIUS' };

  const server = await resolveServer(acc?.radius_server_id, customer.tenant_id);
  if (!server) return { success: false, message: 'Server RADIUS belum dikonfigurasi' };

  if (!to) {
    await RadiusSQL.deleteUser(server, from);
    if (acc) await acc.destroy();
    return { success: true, deleted: true, backend: 'radius' };
  }

  await RadiusSQL.renameUser(server, from, to);
  if (acc) await acc.update({ username: to, last_sync_at: new Date(), last_error: null });
  return { success: true, username: to, backend: 'radius' };
}

async function remove(customer) {
  const acc = customer.id ? await RadiusAccount.findOne({ where: { customer_id: customer.id } }) : null;
  const username = String(customer.pppoe_username || acc?.username || '').trim();
  if (!username) return { success: true, skipped: true };

  const server = await resolveServer(acc?.radius_server_id, customer.tenant_id);
  if (!server) return { success: false, message: 'Server RADIUS belum dikonfigurasi' };

  await RadiusSQL.deleteUser(server, username);
  if (acc) await acc.destroy();
  return { success: true, username, backend: 'radius' };
}

module.exports = {
  resolveServer,
  isEnabled,
  hasAccount,
  syncCustomer,
  provisionStandalone,
  isolir,
  restore,
  rename,
  remove,
  rateLimitFromPackage
};
