/**
 * IsolirPPPoE.js
 * ────────────────────────────────────────────────────────────────────
 * Isolir untuk pelanggan PPPoE — Profile switch + kick session.
 *
 * Strategi:
 *   1. Backup profile asli dari /ppp/secret/print
 *   2. Set profile=isolir-profile (rate-limit rendah, IP dari pool isolir)
 *   3. Kick session aktif /ppp/active/remove → user disconnect & reconnect
 *      dengan profile baru → dapat IP dari pool isolir → DST-NAT redirect bekerja
 *
 * Restore:
 *   1. Set profile kembali ke original (dari customers.pppoe_profile_original)
 *   2. Kick session lagi → reconnect dengan profile normal
 *
 * Setup MikroTik (auto saat Setup Firewall):
 *   pool BILLINGRADIUS          10.2.64.2-10.2.79.254
 *   pool EXPIRED_BILLINGRADIUS  10.200.200.2-10.200.201.254
 *   profile EXPIRED_BILLINGRADIUS local-address=10.200.200.1 rate-limit=128k/128k
 *   address-list EXPIRED = 10.200.200.0/23
 * ────────────────────────────────────────────────────────────────────
 */

const {
  isolirPppoeDefaults,
} = require('../utils/isolirMikrotikDefaults');

const _d = isolirPppoeDefaults();
const DEFAULT_ISOLIR_PROFILE = _d.profileName;
const DEFAULT_ISOLIR_POOL    = _d.poolName;
const DEFAULT_POOL_RANGES    = _d.poolRange;
const DEFAULT_LOCAL_ADDR     = _d.localAddr;
const DEFAULT_RATE_LIMIT     = _d.rateLimit;

// Runner dengan retry (sama seperti di IsolirFirewallV2)
async function runWithRetry(api, words, maxRetry = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const result = await api.run(words);
      await new Promise(r => setTimeout(r, 80));
      return result;
    } catch (e) {
      lastErr = e;
      const isTransient = /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|ECONNREFUSED/i.test(e.message || '');
      if (isTransient && attempt < maxRetry) {
        await new Promise(r => setTimeout(r, attempt === 0 ? 300 : 800));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/**
 * Ambil setting isolir profile/pool dari app_settings dengan fallback default.
 */
async function getPPPoESettings(sequelize) {
  const rows = await sequelize.query(
    `SELECT \`key\`, value FROM app_settings
      WHERE \`key\` IN ('isolir_pppoe_profile_name','isolir_pppoe_pool_name',
                        'isolir_pppoe_pool_range','isolir_pppoe_local_addr',
                        'isolir_pppoe_rate_limit','isolir_pppoe_list_name',
                        'isolir_pppoe_list_cidr','isolir_pppoe_list_bypass',
                        'isolir_pppoe_pool_active_name','isolir_pppoe_pool_active_range')`,
    { type: sequelize.QueryTypes.SELECT }
  ).catch(() => []);
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  const d = isolirPppoeDefaults();
  return {
    profileName:    map.isolir_pppoe_profile_name    || d.profileName,
    poolName:       map.isolir_pppoe_pool_name       || d.poolName,
    poolRange:      map.isolir_pppoe_pool_range      || d.poolRange,
    localAddr:      map.isolir_pppoe_local_addr      || d.localAddr,
    rateLimit:      map.isolir_pppoe_rate_limit      || d.rateLimit,
    listName:       map.isolir_pppoe_list_name       || d.listName,
    listCidr:       map.isolir_pppoe_list_cidr       || d.listCidr,
    listBypass:     map.isolir_pppoe_list_bypass     || d.listBypass,
    pppoePoolName:  map.isolir_pppoe_pool_active_name  || d.pppoePoolName,
    pppoePoolRange: map.isolir_pppoe_pool_active_range || d.pppoePoolRange,
  };
}

/**
 * Setup IP pool & PPP profile isolir di MikroTik. Idempotent.
 * Dipanggil dari setupFirewallV2.
 */
async function ensurePool(api, name, ranges, results) {
  const existing = await runWithRetry(api, ['/ip/pool/print', '?name=' + name]);
  if (existing.length === 0) {
    await runWithRetry(api, ['/ip/pool/add', '=name=' + name, '=ranges=' + ranges]);
    results.push(`✓ IP pool "${name}" dibuat (${ranges})`);
    return;
  }
  const curRanges = String(existing[0].ranges || '').trim();
  if (curRanges !== ranges && existing[0]['.id']) {
    await runWithRetry(api, [
      '/ip/pool/set', '=.id=' + existing[0]['.id'], '=ranges=' + ranges
    ]);
    results.push(`✓ IP pool "${name}" range disamakan ke ${ranges}`);
  } else {
    results.push(`• IP pool "${name}" sudah ada (${curRanges || ranges})`);
  }
}

async function ensureListAddress(api, list, address, comment, results) {
  const existing = await runWithRetry(api, [
    '/ip/firewall/address-list/print', '?list=' + list, '?address=' + address
  ]);
  if (existing.length > 0) {
    results.push(`• Address-list ${list} sudah berisi ${address}`);
    return;
  }
  await runWithRetry(api, [
    '/ip/firewall/address-list/add',
    '=list=' + list,
    '=address=' + address,
    '=comment=' + comment
  ]);
  results.push(`✓ Address-list ${list} + ${address}`);
}

async function setupIsolirProfile(api, sequelize) {
  const cfg = await getPPPoESettings(sequelize);
  const results = [];

  try {
    await ensurePool(api, cfg.pppoePoolName, cfg.pppoePoolRange, results);
  } catch (e) {
    return { success: false, error: `Pool PPPoE: ${e.message}`, details: results };
  }

  try {
    await ensurePool(api, cfg.poolName, cfg.poolRange, results);
  } catch (e) {
    return { success: false, error: `Pool isolir: ${e.message}`, details: results };
  }

  try {
    await ensureListAddress(api, cfg.listName, cfg.listCidr, 'FIBERIX-ISOLIR-SUBNET', results);
    await ensureListAddress(api, cfg.listBypass, cfg.localAddr, 'FIBERIX-ISOLIR-GW', results);
  } catch (e) {
    results.push(`⚠ Address-list: ${e.message}`);
  }

  try {
    const existing = await runWithRetry(api, ['/ppp/profile/print', '?name=' + cfg.profileName]);
    const profileArgs = [
      '=name=' + cfg.profileName,
      '=local-address=' + cfg.localAddr,
      '=remote-address=' + cfg.poolName,
      '=rate-limit=' + cfg.rateLimit
    ];
    if (existing.length === 0) {
      await runWithRetry(api, ['/ppp/profile/add', ...profileArgs]);
      results.push(`✓ PPP profile "${cfg.profileName}" dibuat`);
    } else if (existing[0]['.id']) {
      await runWithRetry(api, [
        '/ppp/profile/set',
        '=.id=' + existing[0]['.id'],
        '=local-address=' + cfg.localAddr,
        '=remote-address=' + cfg.poolName,
        '=rate-limit=' + cfg.rateLimit
      ]);
      results.push(`• PPP profile "${cfg.profileName}" sudah ada (pool + rate-limit sinkron)`);
    }
  } catch (e) {
    return { success: false, error: `Profile: ${e.message}`, details: results };
  }

  return { success: true, details: results };
}

/**
 * Isolir customer PPPoE: backup profile asli → switch ke isolir-profile → kick.
 *
 * @param {object} api - MikroTik API client
 * @param {string} pppoeUsername - nama PPP secret
 * @param {object} sequelize - untuk read settings + update customer.pppoe_profile_original
 * @param {number} customerId - untuk update DB
 * @returns {object} { success, originalProfile, message }
 */
async function isolirPPPoEUser(api, pppoeUsername, sequelize, customerId) {
  if (!pppoeUsername) throw new Error('PPPoE username kosong');
  const cfg = await getPPPoESettings(sequelize);

  // ── 1. Ambil profile asli dari /ppp/secret ──
  const secrets = await runWithRetry(api, ['/ppp/secret/print', '?name=' + pppoeUsername]);
  if (secrets.length === 0) {
    throw new Error(`PPP secret "${pppoeUsername}" tidak ditemukan di MikroTik`);
  }
  const secret = secrets[0];
  const originalProfile = String(secret.profile || 'default');

  // Hindari self-overwrite kalau sudah ter-isolir (re-isolir)
  if (originalProfile !== cfg.profileName) {
    // Backup ke DB SEBELUM switch — supaya restore selalu punya referensi
    await sequelize.query(
      'UPDATE customers SET pppoe_profile_original=? WHERE id=?',
      { replacements: [originalProfile, customerId] }
    );
  }

  // ── 2. Switch profile ke isolir-profile ──
  if (!secret['.id']) throw new Error('PPP secret tidak punya ID');
  await runWithRetry(api, [
    '/ppp/secret/set',
    '=.id=' + secret['.id'],
    '=profile=' + cfg.profileName
  ]);

  // ── 3. Kick session aktif (kalau ada) → user reconnect dengan profile baru ──
  let kicked = 0;
  try {
    const active = await runWithRetry(api, ['/ppp/active/print', '?name=' + pppoeUsername]);
    for (const sess of active) {
      if (sess['.id']) {
        await runWithRetry(api, ['/ppp/active/remove', '=.id=' + sess['.id']]);
        kicked++;
      }
    }
  } catch (_) { /* kick gagal tidak fatal */ }

  return {
    success: true,
    originalProfile,
    kicked,
    message: `Profile diubah ke "${cfg.profileName}", ${kicked} session di-kick`
  };
}

/**
 * Restore customer PPPoE: kembalikan profile asli + kick session.
 *
 * @param {object} api - MikroTik API client
 * @param {string} pppoeUsername - nama PPP secret
 * @param {string} originalProfile - dari customers.pppoe_profile_original
 * @returns {object} { success, kicked, message }
 */
async function restorePPPoEUser(api, pppoeUsername, originalProfile) {
  if (!pppoeUsername) throw new Error('PPPoE username kosong');
  const targetProfile = originalProfile || 'default';

  const secrets = await runWithRetry(api, ['/ppp/secret/print', '?name=' + pppoeUsername]);
  if (secrets.length === 0) {
    throw new Error(`PPP secret "${pppoeUsername}" tidak ditemukan di MikroTik`);
  }
  const secret = secrets[0];
  if (!secret['.id']) throw new Error('PPP secret tidak punya ID');

  // Restore profile
  await runWithRetry(api, [
    '/ppp/secret/set',
    '=.id=' + secret['.id'],
    '=profile=' + targetProfile
  ]);

  // Kick session aktif → reconnect dengan profile normal
  let kicked = 0;
  try {
    const active = await runWithRetry(api, ['/ppp/active/print', '?name=' + pppoeUsername]);
    for (const sess of active) {
      if (sess['.id']) {
        await runWithRetry(api, ['/ppp/active/remove', '=.id=' + sess['.id']]);
        kicked++;
      }
    }
  } catch (_) { /* kick gagal tidak fatal */ }

  return {
    success: true,
    kicked,
    message: `Profile dipulihkan ke "${targetProfile}", ${kicked} session di-kick`
  };
}

module.exports = {
  DEFAULT_ISOLIR_PROFILE,
  DEFAULT_ISOLIR_POOL,
  getPPPoESettings,
  setupIsolirProfile,
  isolirPPPoEUser,
  restorePPPoEUser,
};
