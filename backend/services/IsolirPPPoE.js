/**
 * IsolirPPPoE.js
 * ────────────────────────────────────────────────────────────────────
 * Isolir untuk pelanggan PPPoE — Profile switch + kick session.
 *
 * Strategi:
 *   1. Backup profile asli dari /ppp/secret/print
 *   2. Set profile=SKYNET-ISOLIR (rate-limit rendah, IP dari pool isolir)
 *   3. Kick session aktif /ppp/active/remove → user disconnect & reconnect
 *      dengan profile baru → dapat IP dari pool isolir → DST-NAT redirect bekerja
 *
 * Restore:
 *   1. Set profile kembali ke original (dari customers.pppoe_profile_original)
 *   2. Kick session lagi → reconnect dengan profile normal
 *
 * Setup MikroTik (auto saat Setup Firewall, dan saat isolir PPPoE pertama):
 *
 * Isolir PPPoE — 10.255.0.0/24
 *   /ip pool add name=isolir-pool ranges=10.255.0.2-10.255.0.254
 *   /ppp profile add name=SKYNET-ISOLIR
 *     local-address=10.255.0.1
 *     remote-address=isolir-pool
 *     address-list=SKYNET-ISOLIR
 *
 * Klien PPPoE aktif — 10.2.64.2-10.2.79.254
 *   /ip pool add name=pppoe-pool ranges=10.2.64.2-10.2.79.254
 *   /ppp profile add name=SKYNET
 *     local-address=10.2.64.1
 *     remote-address=pppoe-pool
 * ────────────────────────────────────────────────────────────────────
 */

// Isolir PPPoE — 10.255.0.0/24
const DEFAULT_ISOLIR_PROFILE = 'SKYNET-ISOLIR';
const DEFAULT_ISOLIR_POOL    = 'isolir-pool';
const ISOLIR_NETWORK_CIDR    = '10.255.0.0/24';
const DEFAULT_POOL_RANGES    = '10.255.0.2-10.255.0.254';
const DEFAULT_LOCAL_ADDR     = '10.255.0.1';
const DEFAULT_RATE_LIMIT     = '128k/128k';
const LIST_ISOLIR            = 'SKYNET-ISOLIR';
const POOL_COMMENT           = 'SKYNET-ISOLIR-PPP /24';
const LEGACY_ISOLIR_PROFILES = ['isolir-profile'];

// Range isolir lama yang harus dinaikkan/diturunkan ke 10.255.0.0/24.
const LEGACY_POOL_RANGES = [
  '10.255.255.2-10.255.255.254',
  '10.255.0.2-10.255.255.254',
];
const LEGACY_LOCAL_ADDR  = '10.255.255.1';

// Klien PPPoE aktif (bukan isolir)
const DEFAULT_CLIENT_PROFILE = 'SKYNET';
const DEFAULT_CLIENT_POOL    = 'pppoe-pool';
const LEGACY_CLIENT_PROFILES = ['pppoe-client'];
const CLIENT_NETWORK_CIDR    = '10.2.64.0/20';
const DEFAULT_CLIENT_RANGES  = '10.2.64.2-10.2.79.254';
const DEFAULT_CLIENT_LOCAL   = '10.2.64.1';
const CLIENT_POOL_COMMENT    = 'SKYNET-PPPOE-CLIENT 10.2.64.2-10.2.79.254';

function normalizePoolRange(range) {
  const v = String(range || '').trim();
  if (!v || LEGACY_POOL_RANGES.includes(v)) return DEFAULT_POOL_RANGES;
  return v;
}

function normalizeLocalAddr(addr) {
  const v = String(addr || '').trim();
  if (!v || v === LEGACY_LOCAL_ADDR) return DEFAULT_LOCAL_ADDR;
  return v;
}

function normalizeIsolirProfileName(name) {
  const v = String(name || '').trim();
  if (!v || LEGACY_ISOLIR_PROFILES.includes(v)) return DEFAULT_ISOLIR_PROFILE;
  return v;
}

function normalizeClientProfileName(name) {
  const v = String(name || '').trim();
  if (!v || LEGACY_CLIENT_PROFILES.includes(v)) return DEFAULT_CLIENT_PROFILE;
  return v;
}

function isIsolirProfileName(name, currentIsolirName) {
  const v = String(name || '').trim();
  return v === currentIsolirName || LEGACY_ISOLIR_PROFILES.includes(v);
}

function mapOriginalProfileForRestore(originalProfile) {
  const v = String(originalProfile || '').trim();
  if (!v) return DEFAULT_CLIENT_PROFILE;
  if (LEGACY_CLIENT_PROFILES.includes(v) || LEGACY_ISOLIR_PROFILES.includes(v)) {
    return DEFAULT_CLIENT_PROFILE;
  }
  return v;
}

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

async function ensureIpPool(api, { name, ranges, comment }) {
  const existing = await runWithRetry(api, ['/ip/pool/print', '?name=' + name]);
  if (existing.length === 0) {
    const args = ['/ip/pool/add', '=name=' + name, '=ranges=' + ranges];
    if (comment) args.push('=comment=' + comment);
    await runWithRetry(api, args);
    return { created: true, updated: false };
  }
  const patch = [];
  if (String(existing[0].ranges || '').trim() !== ranges) patch.push('=ranges=' + ranges);
  if (comment && String(existing[0].comment || '') !== comment) patch.push('=comment=' + comment);
  if (patch.length && existing[0]['.id']) {
    await runWithRetry(api, ['/ip/pool/set', '=.id=' + existing[0]['.id'], ...patch]);
    return { created: false, updated: true };
  }
  return { created: false, updated: false };
}

async function ensurePppProfile(api, { name, localAddr, poolName, addressList, rateLimit }) {
  const existing = await runWithRetry(api, ['/ppp/profile/print', '?name=' + name]);
  const fields = [
    '=local-address=' + localAddr,
    '=remote-address=' + poolName,
  ];
  if (addressList) fields.push('=address-list=' + addressList);
  if (rateLimit) fields.push('=rate-limit=' + rateLimit);
  if (existing.length === 0) {
    await runWithRetry(api, ['/ppp/profile/add', '=name=' + name, ...fields]);
    return { created: true, updated: false };
  }
  if (existing[0]['.id']) {
    await runWithRetry(api, ['/ppp/profile/set', '=.id=' + existing[0]['.id'], ...fields]);
    return { created: false, updated: true };
  }
  return { created: false, updated: false };
}

async function reassignPppoeServerDefault(api, fromName, toName) {
  if (!fromName || fromName === toName) return 0;
  const servers = await runWithRetry(api, ['/interface/pppoe-server/server/print']).catch(() => []);
  let n = 0;
  for (const s of servers) {
    const cur = String(s['default-profile'] || s.defaultProfile || '').trim();
    if (cur === fromName && s['.id']) {
      await runWithRetry(api, [
        '/interface/pppoe-server/server/set',
        '=.id=' + s['.id'],
        '=default-profile=' + toName
      ]);
      n++;
    }
  }
  return n;
}

/**
 * Pindahkan secret + default-profile PPPoE server dari nama lama, lalu hapus profile lama.
 * Tidak me-kick session (reconnect berikutnya sudah pakai nama baru).
 */
async function migrateLegacyPppProfile(api, fromNames, toName) {
  const notes = [];
  for (const fromName of fromNames) {
    if (!fromName || fromName === toName) continue;
    const existing = await runWithRetry(api, ['/ppp/profile/print', '?name=' + fromName]).catch(() => []);
    if (!existing.length) continue;

    let moved = 0;
    const secrets = await runWithRetry(api, ['/ppp/secret/print', '?profile=' + fromName]).catch(() => []);
    for (const s of secrets) {
      if (!s['.id']) continue;
      try {
        await runWithRetry(api, ['/ppp/secret/set', '=.id=' + s['.id'], '=profile=' + toName]);
        moved++;
      } catch (e) {
        notes.push(`⚠ Gagal pindah secret "${s.name || s['.id']}" ${fromName} → ${toName}: ${e.message}`);
      }
    }

    let servers = 0;
    try {
      servers = await reassignPppoeServerDefault(api, fromName, toName);
    } catch (e) {
      notes.push(`⚠ Gagal update PPPoE server default-profile ${fromName}: ${e.message}`);
    }

    const leftover = await runWithRetry(api, ['/ppp/secret/print', '?profile=' + fromName]).catch(() => []);
    if (leftover.length === 0 && existing[0]['.id']) {
      try {
        await runWithRetry(api, ['/ppp/profile/remove', '=.id=' + existing[0]['.id']]);
        notes.push(`✓ PPP profile "${fromName}" → "${toName}" (${moved} secret${servers ? ', ' + servers + ' PPPoE server' : ''})`);
      } catch (e) {
        notes.push(`⚠ Profile "${fromName}" masih ada (tidak bisa dihapus): ${e.message}`);
        if (moved) notes.push(`✓ ${moved} secret dipindah ${fromName} → ${toName}`);
      }
    } else if (moved) {
      notes.push(`✓ ${moved} secret dipindah ${fromName} → ${toName} (${leftover.length} masih di nama lama)`);
    }
  }
  return notes;
}

/**
 * Ambil setting isolir profile/pool dari app_settings dengan fallback default.
 */
async function getPPPoESettings(sequelize) {
  const rows = await sequelize.query(
    `SELECT \`key\`, value FROM app_settings
      WHERE \`key\` IN ('isolir_pppoe_profile_name','isolir_pppoe_pool_name',
                        'isolir_pppoe_pool_range','isolir_pppoe_local_addr',
                        'isolir_pppoe_rate_limit',
                        'pppoe_client_profile_name','pppoe_client_pool_name',
                        'pppoe_client_pool_range','pppoe_client_local_addr')`,
    { type: sequelize.QueryTypes.SELECT }
  ).catch(() => []);
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return {
    profileName: normalizeIsolirProfileName(map.isolir_pppoe_profile_name),
    poolName:    map.isolir_pppoe_pool_name    || DEFAULT_ISOLIR_POOL,
    poolRange:   normalizePoolRange(map.isolir_pppoe_pool_range),
    localAddr:   normalizeLocalAddr(map.isolir_pppoe_local_addr),
    rateLimit:   map.isolir_pppoe_rate_limit   || DEFAULT_RATE_LIMIT,
    networkCidr: ISOLIR_NETWORK_CIDR,
    clientProfileName: normalizeClientProfileName(map.pppoe_client_profile_name),
    clientPoolName:    map.pppoe_client_pool_name    || DEFAULT_CLIENT_POOL,
    clientPoolRange:   String(map.pppoe_client_pool_range || '').trim() || DEFAULT_CLIENT_RANGES,
    clientLocalAddr:   String(map.pppoe_client_local_addr || '').trim() || DEFAULT_CLIENT_LOCAL,
    clientNetworkCidr: CLIENT_NETWORK_CIDR,
  };
}

/**
 * Setup IP pool /24 + PPP profile isolir. Idempotent (auto-create).
 */
async function setupIsolirProfile(api, sequelize) {
  const cfg = await getPPPoESettings(sequelize);
  const results = [];

  try {
    const pool = await ensureIpPool(api, {
      name: cfg.poolName, ranges: cfg.poolRange, comment: POOL_COMMENT
    });
    if (pool.created) results.push(`✓ IP pool "${cfg.poolName}" auto-create ${ISOLIR_NETWORK_CIDR} (${cfg.poolRange})`);
    else if (pool.updated) results.push(`✓ IP pool "${cfg.poolName}" diupdate ke ${ISOLIR_NETWORK_CIDR} (${cfg.poolRange})`);
    else results.push(`• IP pool "${cfg.poolName}" sudah ${ISOLIR_NETWORK_CIDR}`);
  } catch (e) {
    return { success: false, error: `Pool isolir: ${e.message}`, details: results };
  }

  try {
    const prof = await ensurePppProfile(api, {
      name: cfg.profileName,
      localAddr: cfg.localAddr,
      poolName: cfg.poolName,
      addressList: LIST_ISOLIR,
      rateLimit: cfg.rateLimit,
    });
    if (prof.created) results.push(`✓ PPP profile "${cfg.profileName}" auto-create (gateway ${cfg.localAddr}, ${ISOLIR_NETWORK_CIDR})`);
    else results.push(`• PPP profile "${cfg.profileName}" sinkron (gateway ${cfg.localAddr}, ${ISOLIR_NETWORK_CIDR})`);
  } catch (e) {
    return { success: false, error: `Profile isolir: ${e.message}`, details: results };
  }

  try {
    const migrated = await migrateLegacyPppProfile(api, LEGACY_ISOLIR_PROFILES, cfg.profileName);
    results.push(...migrated);
  } catch (e) {
    results.push(`⚠ Migrasi profile isolir lama: ${e.message}`);
  }

  return { success: true, details: results };
}

/**
 * Auto-create pool + PPP profile klien PPPoE (10.2.64.2-10.2.79.254).
 */
async function setupClientPppoeProfile(api, sequelize) {
  const cfg = await getPPPoESettings(sequelize);
  const results = [];

  try {
    const pool = await ensureIpPool(api, {
      name: cfg.clientPoolName, ranges: cfg.clientPoolRange, comment: CLIENT_POOL_COMMENT
    });
    if (pool.created) results.push(`✓ IP pool "${cfg.clientPoolName}" auto-create klien (${cfg.clientPoolRange})`);
    else if (pool.updated) results.push(`✓ IP pool "${cfg.clientPoolName}" diupdate ke ${cfg.clientPoolRange}`);
    else results.push(`• IP pool "${cfg.clientPoolName}" sudah ${cfg.clientPoolRange}`);
  } catch (e) {
    return { success: false, error: `Pool klien: ${e.message}`, details: results };
  }

  try {
    const prof = await ensurePppProfile(api, {
      name: cfg.clientProfileName,
      localAddr: cfg.clientLocalAddr,
      poolName: cfg.clientPoolName,
    });
    if (prof.created) results.push(`✓ PPP profile "${cfg.clientProfileName}" auto-create (gateway ${cfg.clientLocalAddr})`);
    else results.push(`• PPP profile "${cfg.clientProfileName}" sinkron (gateway ${cfg.clientLocalAddr})`);
  } catch (e) {
    return { success: false, error: `Profile klien: ${e.message}`, details: results };
  }

  try {
    const migrated = await migrateLegacyPppProfile(api, LEGACY_CLIENT_PROFILES, cfg.clientProfileName);
    results.push(...migrated);
  } catch (e) {
    results.push(`⚠ Migrasi profile klien lama: ${e.message}`);
  }

  return { success: true, details: results };
}

/**
 * Isolir customer PPPoE: backup profile asli → switch ke SKYNET-ISOLIR → kick.
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

  // Auto-create pool /24 + SKYNET-ISOLIR kalau belum ada di router.
  try {
    await setupIsolirProfile(api, sequelize);
  } catch (e) {
    console.warn('[IsolirPPPoE] auto-create pool/profile:', e.message);
  }

  // ── 1. Ambil profile asli dari /ppp/secret ──
  const secrets = await runWithRetry(api, ['/ppp/secret/print', '?name=' + pppoeUsername]);
  if (secrets.length === 0) {
    throw new Error(`PPP secret "${pppoeUsername}" tidak ditemukan di MikroTik`);
  }
  const secret = secrets[0];
  const originalProfile = String(secret.profile || 'default');

  // Hindari self-overwrite kalau sudah ter-isolir (re-isolir), termasuk nama lama isolir-profile.
  if (!isIsolirProfileName(originalProfile, cfg.profileName)) {
    // Backup ke DB SEBELUM switch — supaya restore selalu punya referensi
    await sequelize.query(
      'UPDATE customers SET pppoe_profile_original=? WHERE id=?',
      { replacements: [mapOriginalProfileForRestore(originalProfile), customerId] }
    );
  }

  // ── 2. Switch profile ke SKYNET-ISOLIR ──
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
  const targetProfile = mapOriginalProfileForRestore(originalProfile);

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
  DEFAULT_POOL_RANGES,
  DEFAULT_LOCAL_ADDR,
  ISOLIR_NETWORK_CIDR,
  DEFAULT_CLIENT_PROFILE,
  DEFAULT_CLIENT_POOL,
  DEFAULT_CLIENT_RANGES,
  DEFAULT_CLIENT_LOCAL,
  CLIENT_NETWORK_CIDR,
  LEGACY_ISOLIR_PROFILES,
  LEGACY_CLIENT_PROFILES,
  getPPPoESettings,
  setupIsolirProfile,
  setupClientPppoeProfile,
  isolirPPPoEUser,
  restorePPPoEUser,
};
