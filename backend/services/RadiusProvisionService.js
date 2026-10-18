'use strict';

const { Op } = require('sequelize');
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
      if (opts.failIfExists) {
        const pool = await RadiusSQL.getPool(server);
        const [exists] = await pool.query('SELECT id FROM radcheck WHERE username = ? LIMIT 1', [username]);
        if (exists.length) {
          return { success: false, message: `User RADIUS "${username}" sudah ada`, backend: 'radius' };
        }
      }
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

    return { success: true, username, server_id: server.id, backend: 'radius', groupname };
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

async function isEnabled(tenantId) {
  try {
    if (require('../utils/isolirRadius').fullRadiusEnabled()) return true;
    if (tenantId) {
      const scoped = await RadiusServer.findOne({ where: { tenant_id: tenantId, is_active: true } });
      if (scoped) return true;
    }
    const any = await RadiusServer.findOne({ where: { is_active: true }, order: [['id', 'ASC']] });
    return !!any;
  } catch (_) {
    return require('../utils/isolirRadius').fullRadiusEnabled();
  }
}

async function provisionStandalone(opts = {}) {
  const username = String(opts.username || '').trim();
  const password = opts.password;
  if (!username) return { success: false, message: 'Username wajib diisi' };
  if (!password) return { success: false, message: 'Password wajib diisi' };
  const server = await resolveServer(opts.server);
  if (!server) return { skipped: true, reason: 'no_radius_server', message: 'Server RADIUS belum dikonfigurasi' };
  try {
    if (opts.failIfExists !== false) {
      const pool = await RadiusSQL.getPool(server);
      const [exists] = await pool.query('SELECT id FROM radcheck WHERE username = ? LIMIT 1', [username]);
      if (exists.length) {
        return { success: false, message: `User RADIUS "${username}" sudah ada`, backend: 'radius' };
      }
    }
    await RadiusSQL.provisionUser(server, {
      username,
      password,
      groupname: opts.groupname || opts.profile || null,
      rateLimit: opts.rateLimit || null
    });
    return { success: true, username, server_id: server.id, backend: 'radius' };
  } catch (e) {
    logger.warn('[RadiusProvision] standalone: ' + e.message);
    return { success: false, message: e.message, backend: 'radius' };
  }
}

async function listGroups() {
  const server = await resolveServer();
  if (!server) return [];
  try {
    const pool = await RadiusSQL.getPool(server);
    const names = new Set();
    try {
      const [a] = await pool.query('SELECT DISTINCT groupname FROM radgroupreply WHERE groupname != ""');
      a.forEach(r => { if (r.groupname) names.add(r.groupname); });
    } catch (_) {}
    try {
      const [b] = await pool.query('SELECT DISTINCT groupname FROM radusergroup WHERE groupname != ""');
      b.forEach(r => { if (r.groupname) names.add(r.groupname); });
    } catch (_) {}
    return Array.from(names).sort();
  } catch (_) {
    return [];
  }
}

async function rename(customer, oldUsername, newUsername) {
  const acc = customer && customer.id
    ? await RadiusAccount.findOne({ where: { customer_id: customer.id } })
    : null;
  const from = String(oldUsername || (acc && acc.username) || '').trim();
  const to = String(newUsername || '').trim();
  if (!from) return { success: false, skipped: true, message: 'Tidak ada username lama di RADIUS' };

  const server = await resolveServer(acc && acc.radius_server_id);
  if (!server) return { success: false, skipped: true, message: 'Server RADIUS belum dikonfigurasi' };

  if (!to) {
    await RadiusSQL.deleteUser(server, from);
    if (acc) await acc.destroy();
    return { success: true, deleted: true, backend: 'radius' };
  }

  if (typeof RadiusSQL.renameUser === 'function') {
    await RadiusSQL.renameUser(server, from, to);
  } else {
    const pool = await RadiusSQL.getPool(server);
    await pool.query('UPDATE radcheck SET username = ? WHERE username = ?', [to, from]);
    await pool.query('UPDATE radreply SET username = ? WHERE username = ?', [to, from]);
    await pool.query('UPDATE radusergroup SET username = ? WHERE username = ?', [to, from]);
  }
  if (acc) await acc.update({ username: to, last_sync_at: new Date(), last_error: null });
  return { success: true, username: to, backend: 'radius' };
}

/** Samakan radius_accounts dengan username yang sudah ada di radcheck 22.9. Tidak menyalin password. */
async function linkCustomersToRadcheck() {
  const server = await resolveServer();
  if (!server) return { linked: 0, skipped: true, reason: 'no_server' };
  const pool = await RadiusSQL.getPool(server);
  const [users] = await pool.query("SELECT DISTINCT username FROM radcheck WHERE username != ''");
  const names = new Set(users.map((u) => String(u.username || '').trim()).filter(Boolean));
  const customers = await Customer.findAll({
    attributes: ['id', 'pppoe_username', 'tenant_id', 'isolir_status'],
    where: { pppoe_username: { [Op.ne]: null } }
  });
  let linked = 0;
  let missing = 0;
  for (const c of customers) {
    const u = String(c.pppoe_username || '').trim();
    if (!u) continue;
    if (!names.has(u)) {
      missing += 1;
      continue;
    }
    const [acc, created] = await RadiusAccount.findOrCreate({
      where: { customer_id: c.id, username: u },
      defaults: {
        tenant_id: c.tenant_id || getTenantId() || null,
        radius_server_id: server.id,
        status: c.isolir_status === 'isolated' ? 'isolated' : 'active',
        last_sync_at: new Date()
      }
    });
    if (!created) {
      await acc.update({ radius_server_id: server.id, last_sync_at: new Date() });
    }
    linked += 1;
  }
  return { linked, missing, radcheck: names.size };
}

module.exports = {
  resolveServer,
  hasAccount,
  isEnabled,
  syncCustomer,
  provisionStandalone,
  listGroups,
  isolir,
  restore,
  rename,
  linkCustomersToRadcheck,
  rateLimitFromPackage
};
