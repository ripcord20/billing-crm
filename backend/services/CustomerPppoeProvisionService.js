/**
 * Auto-provision PPP secret from a customer record.
 * Best-effort: gagal sync tidak membatalkan simpan customer.
 */
const { getMikrotikInstanceByDevice } = require('./MikrotikService');
const logger = require('../utils/logger');

const PROFILE_FALLBACKS = ['RADIUS 100', 'BILLINGRADIUS', 'default'];

function norm(s) {
  return String(s || '').trim();
}

async function pickProfile(mt, preferred) {
  let names = [];
  try {
    const profiles = await mt.getPPPoEProfiles();
    names = (profiles || []).map(p => p.name).filter(Boolean);
  } catch (e) {
    logger.warn('[PppoeProvision] gagal baca profile: ' + (e.message || e));
  }
  const pref = norm(preferred);
  if (pref && (names.length === 0 || names.includes(pref))) return pref;
  for (const cand of PROFILE_FALLBACKS) {
    if (names.includes(cand)) return cand;
  }
  return names[0] || pref || 'default';
}

/**
 * @param {object} customer  Sequelize instance atau plain object
 * @param {object} [opts]
 * @param {string} [opts.profile]  override profile
 * @returns {Promise<{status: string, message: string, profile?: string, device_id?: number}>}
 */
async function syncCustomerSecret(customer, opts = {}) {
  const username = norm(customer.pppoe_username);
  const password = norm(customer.pppoe_password);
  const deviceId = customer.mikrotik_id ? parseInt(customer.mikrotik_id, 10) : 0;
  const pkgProfile = customer.package && customer.package.mikrotik_profile
    ? customer.package.mikrotik_profile
    : null;

  if (!username) {
    return { status: 'skipped', message: 'Username PPPoE kosong' };
  }
  if (!password) {
    return { status: 'skipped', message: 'Password PPPoE kosong — isi password lalu simpan lagi' };
  }
  if (!deviceId) {
    return { status: 'skipped', message: 'Router belum dipilih' };
  }

  let mt;
  try {
    mt = await getMikrotikInstanceByDevice(deviceId);
  } catch (e) {
    return { status: 'failed', message: 'Tidak bisa hubungi router: ' + (e.message || e) };
  }
  if (!mt) {
    return { status: 'failed', message: 'Router tidak ditemukan / API tidak siap' };
  }

  const profile = await pickProfile(mt, opts.profile || pkgProfile);
  const comment = [customer.customer_id, customer.name].filter(Boolean).join(' — ');

  try {
    const secrets = await mt.getPPPoESecrets();
    const existing = (secrets || []).find(s =>
      String(s.name || '').toLowerCase() === username.toLowerCase()
    );

    if (existing && existing.id) {
      await mt.updatePPPoESecret(existing.id, {
        name: username,
        password,
        service: 'pppoe',
        profile,
        comment
      });
      logger.info(`[PppoeProvision] updated secret ${username} on device ${deviceId} profile=${profile}`);
      return {
        status: 'updated',
        message: `Akun PPPoE di-update di router (profile ${profile})`,
        profile,
        device_id: deviceId
      };
    }

    await mt.createPPPoESecret({
      name: username,
      password,
      service: 'pppoe',
      profile,
      comment
    });
    logger.info(`[PppoeProvision] created secret ${username} on device ${deviceId} profile=${profile}`);
    return {
      status: 'created',
      message: `Akun PPPoE dibuat di router (profile ${profile})`,
      profile,
      device_id: deviceId
    };
  } catch (e) {
    const msg = e.message || String(e);
    logger.warn(`[PppoeProvision] sync failed for ${username}: ${msg}`);
    return { status: 'failed', message: 'Gagal buat/update akun di router: ' + msg };
  }
}

module.exports = { syncCustomerSecret, pickProfile };
