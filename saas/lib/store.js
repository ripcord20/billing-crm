'use strict';

const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

async function ensureSaasAdmins(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS saas_admins (
      id INT NOT NULL AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL,
      password VARCHAR(255) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_login DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY saas_admins_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function seedOwner(sequelize) {
  const [rows] = await sequelize.query('SELECT id FROM saas_admins LIMIT 1');
  if (rows && rows.length) return { seeded: false };
  const email = String(process.env.SAAS_OWNER_EMAIL || 'owner@fiberix.my.id').trim().toLowerCase();
  const password = String(process.env.SAAS_OWNER_PASSWORD || '');
  if (password.length < 8) {
    throw new Error('SAAS_OWNER_PASSWORD wajib diisi (min 8) saat seed admin pertama');
  }
  const hash = await bcrypt.hash(password, 12);
  const now = new Date();
  await sequelize.query(
    `INSERT INTO saas_admins (name, email, password, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
    { replacements: ['Platform Owner', email, hash, now, now] }
  );
  return { seeded: true, email };
}

async function findAdminByEmail(sequelize, email) {
  const [rows] = await sequelize.query(
    'SELECT id, name, email, password, is_active FROM saas_admins WHERE email = ? LIMIT 1',
    { replacements: [String(email || '').trim().toLowerCase()] }
  );
  return rows && rows[0] ? rows[0] : null;
}

async function markLogin(sequelize, id) {
  await sequelize.query('UPDATE saas_admins SET last_login = ?, updated_at = ? WHERE id = ?', {
    replacements: [new Date(), new Date(), id]
  });
}

async function overview(db) {
  const { Tenant, Customer, NasDevice, RadiusServer, sequelize } = db;
  const [tenants, customers, nas, radius, unassigned] = await Promise.all([
    Tenant.count(),
    Customer.count({ where: { tenant_id: { [Op.ne]: null } } }),
    NasDevice.count().catch(() => 0),
    RadiusServer.count({ where: { is_active: true } }).catch(() => 0),
    sequelize.query('SELECT COUNT(*) AS n FROM customers WHERE tenant_id IS NULL', { type: sequelize.QueryTypes.SELECT })
  ]);
  const [active] = await sequelize.query(
    `SELECT SUM(status='active') AS a, SUM(status='suspended') AS s FROM tenants`,
    { type: sequelize.QueryTypes.SELECT }
  );
  return {
    tenants,
    tenants_active: parseInt(active?.a || 0, 10),
    tenants_suspended: parseInt(active?.s || 0, 10),
    customers_bound: customers,
    customers_unassigned: parseInt((Array.isArray(unassigned) ? unassigned[0] : unassigned)?.n || 0, 10),
    nas,
    radius_servers: radius,
    billing_url: process.env.SAAS_BILLING_URL || 'https://app.fiberix.my.id',
    radius_host: process.env.RADIUS_HOST || '192.168.22.9'
  };
}

module.exports = {
  ensureSaasAdmins,
  seedOwner,
  findAdminByEmail,
  markLogin,
  overview
};
