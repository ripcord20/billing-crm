/**
 * backend/seeds/index.js — Bootstrap seed.
 * ─────────────────────────────────────────────────────────────────────────────
 * Membuat data minimum agar aplikasi bisa dipakai setelah instalasi baru:
 *   - Role `superadmin` (akses penuh)
 *   - User admin pertama
 *
 * Idempotent — aman dijalankan berkali-kali (pakai findOrCreate). Jalankan
 * dengan: `npm run seed`.
 *
 * Kredensial admin bisa dioverride via .env:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const db = require('../models');
const { Role, User } = db;

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@flaynet.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin12345';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Super Admin';

async function seed() {
  await db.sequelize.authenticate();
  // Pastikan skema tabel ada sebelum seeding (idempotent, tidak destruktif).
  // Aman dipanggil berulang; membuat tabel yang belum ada tanpa meng-ALTER.
  await db.sequelize.sync();

  const [role] = await Role.findOrCreate({
    where: { name: 'superadmin' },
    defaults: {
      name: 'superadmin',
      display_name: 'Super Admin',
      description: 'Akses penuh ke seluruh modul dan pengaturan sistem.',
      is_system: true
    }
  });

  const [user, created] = await User.findOrCreate({
    where: { email: ADMIN_EMAIL },
    defaults: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD, // di-hash otomatis oleh hook beforeCreate
      role_id: role.id,
      is_active: true
    }
  });

  if (created) {
    console.log(`✓ Admin user dibuat: ${ADMIN_EMAIL} (password: ${ADMIN_PASSWORD})`);
  } else {
    console.log(`• Admin user sudah ada: ${ADMIN_EMAIL} (tidak diubah)`);
  }
  console.log(`✓ Role superadmin siap (id=${role.id}).`);
}

seed()
  .then(() => { console.log('Seed selesai.'); process.exit(0); })
  .catch((err) => { console.error('Seed gagal:', err); process.exit(1); });
