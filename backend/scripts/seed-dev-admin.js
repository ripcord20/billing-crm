/**
 * seed-dev-admin.js — Idempotent seeder for a local development admin account.
 *
 * Creates (or ensures) a `superadmin` role and a single admin user so the app
 * can be logged into on a fresh development database. Superadmin bypasses all
 * permission checks (see middleware/auth.js), giving full access to the UI.
 *
 * Credentials can be overridden via env vars:
 *   SEED_ADMIN_EMAIL     (default: admin@flaynet.local)
 *   SEED_ADMIN_PASSWORD  (default: admin12345)
 *   SEED_ADMIN_NAME      (default: Administrator)
 *
 * Safe to run repeatedly — it only creates missing rows and never overwrites
 * an existing admin's password.
 *
 * Usage: node backend/scripts/seed-dev-admin.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const db = require('../models');
const { Role, User } = db;

const EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@flaynet.local';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin12345';
const NAME = process.env.SEED_ADMIN_NAME || 'Administrator';

(async () => {
  try {
    await db.sequelize.authenticate();

    // Ensure the tables this seeder touches exist, so it can run on a fresh
    // database before the full server has synced the whole schema. Order
    // matters: users has FKs to tenants and roles.
    await db.Tenant.sync();
    await db.Role.sync();
    await User.sync();

    const [role] = await Role.findOrCreate({
      where: { name: 'superadmin' },
      defaults: {
        name: 'superadmin',
        display_name: 'Super Admin',
        description: 'Full system access (bypasses all permission checks).',
        is_system: true
      }
    });

    const [user, created] = await User.findOrCreate({
      where: { email: EMAIL },
      defaults: {
        name: NAME,
        email: EMAIL,
        password: PASSWORD, // hashed by the model beforeCreate hook
        role_id: role.id,
        is_active: true
      }
    });

    if (created) {
      console.log(`[seed-dev-admin] Created superadmin user: ${EMAIL} / ${PASSWORD}`);
    } else {
      // Ensure the account stays usable without clobbering a changed password.
      await user.update({ role_id: role.id, is_active: true });
      console.log(`[seed-dev-admin] Admin already exists, ensured active: ${EMAIL}`);
    }

    await db.sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('[seed-dev-admin] Failed:', err.message || err);
    process.exit(1);
  }
})();
