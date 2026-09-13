#!/usr/bin/env node
/**
 * create-admin.js — Bootstrap an initial superadmin account for local/dev.
 *
 * The app auto-creates supporting roles (finance, noc, sales, tenant_owner)
 * on boot but has no seeder for the first login account. This idempotent
 * helper ensures a `superadmin` role and a single admin user exist so a fresh
 * database is immediately usable.
 *
 * Credentials come from env with sensible dev defaults:
 *   ADMIN_EMAIL     (default: admin@ispnetops.local)
 *   ADMIN_PASSWORD  (default: admin12345)
 *   ADMIN_NAME      (default: Super Admin)
 *
 * Usage: node backend/scripts/create-admin.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const db = require('../models');

const EMAIL = process.env.ADMIN_EMAIL || 'admin@ispnetops.local';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin12345';
const NAME = process.env.ADMIN_NAME || 'Super Admin';

(async () => {
  try {
    await db.sequelize.authenticate();

    // Ensure the tables this script touches exist, so it can run against a
    // fresh database independently of the main server boot. Order respects
    // foreign keys: roles and tenants before users.
    await db.Role.sync();
    await db.Tenant.sync();
    await db.User.sync();

    const [role] = await db.Role.findOrCreate({
      where: { name: 'superadmin' },
      defaults: {
        name: 'superadmin',
        display_name: 'Super Administrator',
        description: 'Full system access.',
        is_system: true
      }
    });

    const existing = await db.User.findOne({ where: { email: EMAIL } });
    if (existing) {
      existing.role_id = role.id;
      existing.is_active = true;
      existing.password = PASSWORD; // re-hashed by beforeUpdate hook
      await existing.save();
      console.log(`Updated existing admin user: ${EMAIL}`);
    } else {
      await db.User.create({
        name: NAME,
        email: EMAIL,
        password: PASSWORD, // hashed by beforeCreate hook
        role_id: role.id,
        is_active: true
      });
      console.log(`Created admin user: ${EMAIL}`);
    }

    console.log(`\nLogin with:\n  email:    ${EMAIL}\n  password: ${PASSWORD}\n`);
    await db.sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('Failed to create admin:', err.message || err);
    process.exit(1);
  }
})();
