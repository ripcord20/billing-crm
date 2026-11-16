'use strict';

const { RadiusAccount, RadiusServer, NasDevice, Tenant, Customer, Package } = require('../models');
const RadiusSQL = require('./RadiusSqlService');
const { getTenantId } = require('../middleware/tenantContext');
const logger = require('../utils/logger');

function rateLimitFromPackage(pkg) {
  if (!pkg) return null;
  const down = parseInt(pkg.speed_down, 10) || 0;
  const up = parseInt(pkg.speed_up, 10) || 0;
  if (!down && !up) return null;
  // MikroTik-Rate-Limit: rx/tx e.g. 10M/10M
  const rx = (up || down) + 'M';
  const tx = (down || up) + 'M';
  return rx + '/' + tx;
}

async function resolveServer(hint) {
  if (hint && hint.id) return hint;
  const tid = getTenantId();
  if (hint) {
    const byId = await RadiusServer.findByPk(hint);
    if (byId) return byId;
  }
  if (tid) {
    const tenant = await Tenant.findByPk(tid);
    if (tenant?.radius_server_id) {
      const s = await RadiusServer.findByPk(tenant.radius_server_id);
      if (s) return s;
    }
    const scoped = await RadiusServer.findOne({ where: { tenant_id: tid, is_active: true } });
    if (scoped) return scoped;
  }
  return RadiusServer.findOne({ where: { is_active: true }, order: [['id', 'ASC']] });
}

async function hasAccount(customerId) {
  const row = await RadiusAccount.findOne({ where: { customer_id: customerId } });
  return !!row;
}

async function syncCustomer(customer, opts = {}) {
  const username = String(opts.username || customer.pppoe_username || '').trim();
  if (!username) return { skipped: true, reason: 'no_username' };

  const password = opts.password || opts.radius_password;
  if (!password && opts.requirePassword) {
    return { skipped: true, reason: 'no_password' };
  }

  const server = await resolveServer(opts.server || customer.tenant_id);
  if (!server) return { skipped: true, reason: 'no_radius_server' };

  let pkg = customer.package;
  if (!pkg && customer.package_id) {
    pkg = await Package.findByPk(customer.package_id);
  }
  const groupname = opts.groupname || pkg?.radius_group || pkg?.mikrotik_profile || null;
  const rateLimit = rateLimitFromPackage(pkg);

  try {
    if (password) {
      await RadiusSQL.provisionUser(server, { username, password, groupname, rateLimit });
    } else if (groupname || rateLimit) {
      // Password sudah ada di RADIUS — hanya update group/rate bila perlu via provisionUser butuh password.
      // Tanpa password baru, skip rewrite Cleartext-Password.
      const pool = await RadiusSQL.getPool(server);
      if (groupname) {
        await pool.query(
          `INSERT INTO radusergroup (username, groupname, priority)
           VALUES (?, ?, 1)
           ON DUPLICATE KEY UPDATE groupname = VALUES(groupname)`,
          [username, groupname]
        ).catch(async () => {
          await pool.query('DELETE FROM radusergroup WHERE username = ?', [username]);
          await pool.query('INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)', [username, groupname]);
        });
      }
    }

    const [acc] = await RadiusAccount.findOrCreate({
      where: { customer_id: customer.id, username },
      defaults: {
        tenant_id: customer.tenant_id || getTenantId() || null,
        customer_id: customer.id,
        radius_server_id: server.id,
        nas_id: opts.nas_id || null,
        username,
        groupname,
        status: customer.isolir_status === 'isolated' ? 'isolated' : 'active'
      }
    });
    await acc.update({
      radius_server_id: server.id,
      groupname,
      last_sync_at: new Date(),
      last_error: null,
      status: customer.isolir_status === 'isolated' ? 'isolated' : 'active'
    });

    if (customer.isolir_status === 'isolated') {
      await RadiusSQL.isolateUser(server, username);
    }

    return { success: true, username, server_id: server.id };
  } catch (e) {
    logger.warn('[RadiusProvision] syncCustomer: ' + e.message);
    try {
      const acc = await RadiusAccount.findOne({ where: { customer_id: customer.id } });
      if (acc) await acc.update({ last_error: e.message.slice(0, 250) });
    } catch (_) {}
    return { success: false, message: e.message };
  }
}

async function isolir(customer) {
  const username = String(customer.pppoe_username || '').trim();
  const acc = await RadiusAccount.findOne({ where: { customer_id: customer.id } });
  const user = username || acc?.username;
  if (!user) return { success: false, skipped: true, message: 'Tidak ada akun RADIUS' };

  const server = await resolveServer(acc?.radius_server_id);
  if (!server) return { success: false, message: 'Server RADIUS belum dikonfigurasi' };

  await RadiusSQL.isolateUser(server, user);
  if (acc) await acc.update({ status: 'isolated', last_sync_at: new Date(), last_error: null });
  else {
    await RadiusAccount.create({
      tenant_id: customer.tenant_id || getTenantId() || null,
      customer_id: customer.id,
      radius_server_id: server.id,
      username: user,
      status: 'isolated',
      last_sync_at: new Date()
    });
  }
  return { success: true, username: user, method: 'radius' };
}

async function restore(customer) {
  const acc = await RadiusAccount.findOne({ where: { customer_id: customer.id } });
  const username = String(customer.pppoe_username || acc?.username || '').trim();
  if (!username) return { success: false, skipped: true, message: 'Tidak ada akun RADIUS' };

  const server = await resolveServer(acc?.radius_server_id);
  if (!server) return { success: false, message: 'Server RADIUS belum dikonfigurasi' };

  await RadiusSQL.restoreUser(server, username);
  if (acc) await acc.update({ status: 'active', last_sync_at: new Date(), last_error: null });
  return { success: true, username, method: 'radius' };
}

module.exports = {
  resolveServer,
  hasAccount,
  syncCustomer,
  isolir,
  restore,
  rateLimitFromPackage
};
