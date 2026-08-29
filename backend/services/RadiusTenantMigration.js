'use strict';

const logger = require('../utils/logger');
const { encryptSecret } = require('../utils/secretBox');

function slugify(name) {
  return String(name || 'tenant')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'tenant';
}

async function hasColumn(sequelize, table, col) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    { replacements: [table, col] }
  );
  return rows && rows[0] && parseInt(rows[0].c, 10) > 0;
}

async function addColumn(sequelize, table, col, ddl) {
  if (await hasColumn(sequelize, table, col)) return false;
  await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  logger.info(`Migrated: ${table}.${col} added`);
  return true;
}

async function run(db) {
  const { sequelize } = db;

  if (db.Tenant) await db.Tenant.sync();
  if (db.RadiusServer) await db.RadiusServer.sync();
  if (db.NasDevice) await db.NasDevice.sync();
  if (db.RadiusAccount) await db.RadiusAccount.sync();

  await addColumn(sequelize, 'users', 'tenant_id', 'tenant_id INT NULL');
  await addColumn(sequelize, 'customers', 'tenant_id', 'tenant_id INT NULL');
  await addColumn(sequelize, 'packages', 'tenant_id', 'tenant_id INT NULL');
  await addColumn(sequelize, 'packages', 'radius_group', "radius_group VARCHAR(64) NULL COMMENT 'Nama group FreeRADIUS / daloRADIUS'");
  await addColumn(sequelize, 'invoices', 'tenant_id', 'tenant_id INT NULL');
  await addColumn(sequelize, 'payments', 'tenant_id', 'tenant_id INT NULL');
  await addColumn(sequelize, 'devices', 'tenant_id', 'tenant_id INT NULL');

  // ── NAS: mode koneksi + WireGuard (additive) ─────────────────────────────
  await addColumn(sequelize, 'nas_devices', 'conn_mode', "conn_mode ENUM('public','vpn') NOT NULL DEFAULT 'public'");
  await addColumn(sequelize, 'nas_devices', 'vpn_type', "vpn_type VARCHAR(20) NULL DEFAULT 'wireguard'");
  await addColumn(sequelize, 'nas_devices', 'tunnel_address', 'tunnel_address VARCHAR(64) NULL');
  await addColumn(sequelize, 'nas_devices', 'wg_public_key', 'wg_public_key VARCHAR(128) NULL');
  await addColumn(sequelize, 'nas_devices', 'wg_private_key', 'wg_private_key VARCHAR(256) NULL');
  await addColumn(sequelize, 'nas_devices', 'wg_preshared_key', 'wg_preshared_key VARCHAR(256) NULL');
  await addColumn(sequelize, 'nas_devices', 'wg_endpoint', 'wg_endpoint VARCHAR(160) NULL');
  await addColumn(sequelize, 'nas_devices', 'wg_allowed_ips', 'wg_allowed_ips VARCHAR(255) NULL');
  await addColumn(sequelize, 'nas_devices', 'wg_keepalive', 'wg_keepalive INT NULL DEFAULT 25');
  await addColumn(sequelize, 'nas_devices', 'wg_last_applied_at', 'wg_last_applied_at DATETIME NULL');
  await addColumn(sequelize, 'nas_devices', 'vpn_username', 'vpn_username VARCHAR(120) NULL');
  await addColumn(sequelize, 'nas_devices', 'vpn_password', 'vpn_password VARCHAR(256) NULL');
  await addColumn(sequelize, 'nas_devices', 'vpn_psk', 'vpn_psk VARCHAR(256) NULL');

  // Tabel signup tenant (self-service) — dibuat bila belum ada.
  if (db.TenantSignup) await db.TenantSignup.sync();

  const [defaultTenant] = await db.Tenant.findOrCreate({
    where: { slug: 'default' },
    defaults: {
      name: 'Default',
      slug: 'default',
      company_name: 'Billing Utama',
      status: 'active',
      notes: 'Tenant bawaan untuk data yang sudah ada. Tidak menghapus atau menimpa record lama.'
    }
  });

  const defaultId = defaultTenant.id;

  const backfill = async (table) => {
    try {
      const [r] = await sequelize.query(
        `UPDATE \`${table}\` SET tenant_id = ? WHERE tenant_id IS NULL`,
        { replacements: [defaultId] }
      );
      const changed = r && (r.affectedRows || r.changedRows);
      if (changed) logger.info(`Backfill ${table}.tenant_id → ${defaultId} (${changed} baris)`);
    } catch (e) {
      logger.warn(`Backfill ${table}.tenant_id skipped: ` + e.message);
    }
  };

  await backfill('customers');
  await backfill('packages');
  await backfill('invoices');
  await backfill('payments');
  await backfill('devices');
  await backfill('users');

  await db.Role.findOrCreate({
    where: { name: 'tenant_owner' },
    defaults: {
      name: 'tenant_owner',
      display_name: 'Owner Tenant',
      description: 'Pemilik tenant: dashboard, billing, pelanggan, NAS, dan RADIUS miliknya.',
      is_system: true
    }
  });

  const radiusHost = process.env.RADIUS_HOST || '192.168.22.9';
  const mysqlHost = process.env.RADIUS_MYSQL_HOST || radiusHost;
  const mysqlUser = process.env.RADIUS_MYSQL_USER || 'radius';
  const mysqlDb = process.env.RADIUS_MYSQL_DB || 'radius';
  const mysqlPassRaw = process.env.RADIUS_MYSQL_PASSWORD || '';
  const mysqlPass = mysqlPassRaw ? encryptSecret(mysqlPassRaw) : '';

  const [radiusSrv] = await db.RadiusServer.findOrCreate({
    where: { host: radiusHost, mysql_host: mysqlHost },
    defaults: {
      tenant_id: defaultId,
      name: 'daloRADIUS / FreeRADIUS',
      host: radiusHost,
      auth_port: 1812,
      acct_port: 1813,
      mysql_host: mysqlHost,
      mysql_port: parseInt(process.env.RADIUS_MYSQL_PORT || '3306', 10),
      mysql_database: mysqlDb,
      mysql_user: mysqlUser,
      mysql_password: mysqlPass,
      notes: 'Server RADIUS LAN. Billing di 192.168.22.99. Isi password MySQL radius di modul RADIUS bila masih kosong.',
      is_active: true
    }
  });

  if (!defaultTenant.radius_server_id) {
    await defaultTenant.update({ radius_server_id: radiusSrv.id });
  }

  logger.info('Radius/NAS/tenant migration OK (additive, no destructive ALTER)');
}

module.exports = { run, slugify };
