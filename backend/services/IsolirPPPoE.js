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
 * Setup MikroTik (auto saat Setup Firewall / tombol Buat IP Isolir):
 *   /interface dummy|bridge add name=fiberix-isolir
 *   /ip address add address=10.255.255.1/24 interface=fiberix-isolir
 *   /ip pool add name=isolir-pool ranges=10.255.255.2-10.255.255.254
 *   /ppp profile add name=isolir-profile
 *     local-address=10.255.255.1
 *     remote-address=isolir-pool
 *     address-list=FLAYNET-ISOLIR
 *     rate-limit=128k/128k
 * ────────────────────────────────────────────────────────────────────
 */

// Default nama profile & pool isolir. Bisa di-override via app_settings.
const DEFAULT_ISOLIR_PROFILE = 'isolir-profile';
const DEFAULT_ISOLIR_POOL    = 'isolir-pool';
const DEFAULT_POOL_RANGES    = '10.255.255.2-10.255.255.254';
const DEFAULT_LOCAL_ADDR     = '10.255.255.1';
const DEFAULT_RATE_LIMIT     = '128k/128k';
const DEFAULT_ISOLIR_IFACE   = 'fiberix-isolir';
const ISOLIR_IFACE_COMMENT   = 'FIBERIX isolir gateway';
const ISOLIR_PREFIX_LEN      = 24;
// Overlay WireGuard Fiberix — jangan dipakai sebagai subnet isolir.
const BLOCKED_ISOLIR_NETS    = ['10.10.0.0/24'];

// Runner dengan retry (sama seperti di IsolirFirewallV2)
async function runWithRetry(api, words, maxRetry = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const result = await api.run(words);
      if (!api.skipIsolirDelay) {
        await new Promise(r => setTimeout(r, 80));
      }
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
                        'isolir_pppoe_rate_limit')`,
    { type: sequelize.QueryTypes.SELECT }
  ).catch(() => []);
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return {
    profileName: map.isolir_pppoe_profile_name || DEFAULT_ISOLIR_PROFILE,
    poolName:    map.isolir_pppoe_pool_name    || DEFAULT_ISOLIR_POOL,
    poolRange:   map.isolir_pppoe_pool_range   || DEFAULT_POOL_RANGES,
    localAddr:   map.isolir_pppoe_local_addr   || DEFAULT_LOCAL_ADDR,
    rateLimit:   map.isolir_pppoe_rate_limit   || DEFAULT_RATE_LIMIT,
  };
}

function ipv4ToInt(ip) {
  const m = String(ip || '').trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const oct = m.slice(1).map(Number);
  if (oct.some(n => n > 255)) return null;
  return ((oct[0] << 24) >>> 0) + (oct[1] << 16) + (oct[2] << 8) + oct[3];
}

function intToIpv4(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function parseCidr(cidr) {
  const [net, bitsStr] = String(cidr || '').split('/');
  const bits = Number(bitsStr);
  const netInt = ipv4ToInt(net);
  if (netInt == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { netInt: netInt & mask, bits, mask };
}

function ipInCidr(ip, cidr) {
  const ipInt = typeof ip === 'number' ? ip : ipv4ToInt(ip);
  const parsed = parseCidr(cidr);
  if (ipInt == null || !parsed) return false;
  return (ipInt & parsed.mask) === parsed.netInt;
}

function isPrivateRfc1918(ipInt) {
  return ipInCidr(ipInt, '10.0.0.0/8')
    || ipInCidr(ipInt, '172.16.0.0/12')
    || ipInCidr(ipInt, '192.168.0.0/16');
}

function parsePoolRange(range) {
  const m = String(range || '').trim().match(
    /^(\d{1,3}(?:\.\d{1,3}){3})\s*-\s*(\d{1,3}(?:\.\d{1,3}){3})$/
  );
  if (!m) return null;
  const start = ipv4ToInt(m[1]);
  const end = ipv4ToInt(m[2]);
  if (start == null || end == null) return null;
  return { startIp: m[1], endIp: m[2], start, end };
}

function slash24Cidr(localAddr) {
  const ipInt = ipv4ToInt(localAddr);
  if (ipInt == null) return null;
  return intToIpv4(ipInt & 0xffffff00) + '/' + ISOLIR_PREFIX_LEN;
}

function gatewayAddressCidr(localAddr) {
  return String(localAddr || '').trim() + '/' + ISOLIR_PREFIX_LEN;
}

function addressHost(address) {
  return String(address || '').split('/')[0].trim();
}

function isSafeMikrotikName(name) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(String(name || '').trim());
}

function isSafeRateLimit(rate) {
  return /^\d+(?:[kmg])?\/\d+(?:[kmg])?$/i.test(String(rate || '').trim());
}

/**
 * Validasi gateway + pool isolir. Dipakai di save settings dan sebelum push ke MikroTik.
 */
function validateIsolirNetwork(cfg = {}) {
  const localAddr = String(cfg.localAddr || '').trim();
  const poolRange = String(cfg.poolRange || '').trim();
  const profileName = String(cfg.profileName || '').trim();
  const poolName = String(cfg.poolName || '').trim();
  const rateLimit = String(cfg.rateLimit || '').trim();

  if (profileName && !isSafeMikrotikName(profileName)) {
    return { ok: false, error: 'Nama PPP profile isolir tidak valid' };
  }
  if (poolName && !isSafeMikrotikName(poolName)) {
    return { ok: false, error: 'Nama IP pool isolir tidak valid' };
  }
  if (rateLimit && !isSafeRateLimit(rateLimit)) {
    return { ok: false, error: 'Rate-limit isolir harus format rx/tx, contoh 128k/128k' };
  }

  const gwInt = ipv4ToInt(localAddr);
  if (gwInt == null) {
    return { ok: false, error: 'Gateway isolir harus IPv4, contoh 10.255.255.1' };
  }
  if (!isPrivateRfc1918(gwInt)) {
    return { ok: false, error: 'Gateway isolir harus IP private (RFC1918), bukan IP publik' };
  }
  const hostOctet = gwInt & 255;
  if (hostOctet === 0 || hostOctet === 255) {
    return { ok: false, error: 'Gateway isolir tidak boleh alamat jaringan (.0) atau broadcast (.255)' };
  }
  for (const net of BLOCKED_ISOLIR_NETS) {
    if (ipInCidr(gwInt, net)) {
      return { ok: false, error: `Gateway isolir bentrok dengan ${net} (overlay WireGuard Fiberix)` };
    }
  }

  const pool = parsePoolRange(poolRange);
  if (!pool) {
    return { ok: false, error: 'Range pool isolir harus format start-end, contoh 10.255.255.2-10.255.255.254' };
  }
  if (pool.start > pool.end) {
    return { ok: false, error: 'Range pool isolir: IP awal harus lebih kecil dari IP akhir' };
  }
  const net24 = slash24Cidr(localAddr);
  if (!ipInCidr(pool.start, net24) || !ipInCidr(pool.end, net24)) {
    return { ok: false, error: `Pool isolir harus satu subnet /24 dengan gateway (${net24})` };
  }
  if (gwInt >= pool.start && gwInt <= pool.end) {
    return { ok: false, error: 'Gateway isolir tidak boleh masuk ke range pool pelanggan' };
  }
  for (const net of BLOCKED_ISOLIR_NETS) {
    if (ipInCidr(pool.start, net) || ipInCidr(pool.end, net)) {
      return { ok: false, error: `Pool isolir bentrok dengan ${net}` };
    }
  }

  return {
    ok: true,
    localAddr,
    poolRange: pool.startIp + '-' + pool.endIp,
    cidr: gatewayAddressCidr(localAddr),
    network: net24,
    iface: DEFAULT_ISOLIR_IFACE,
  };
}

function findAddressRow(rows, localAddr) {
  const host = String(localAddr || '').trim();
  return (rows || []).find(r => addressHost(r.address) === host) || null;
}

async function findNamedInterface(api, name) {
  try {
    const rows = await runWithRetry(api, ['/interface/print', '?name=' + name]);
    return rows[0] || null;
  } catch (_) {
    return null;
  }
}

/**
 * Pastikan interface fiberix-isolir ada. Dummy (ROS7) dulu, fallback bridge (ROS6/7).
 */
async function ensureIsolirInterface(api, results) {
  const existing = await findNamedInterface(api, DEFAULT_ISOLIR_IFACE);
  if (existing) {
    const type = String(existing.type || existing['type'] || '').toLowerCase() || 'interface';
    results.push(`• Interface "${DEFAULT_ISOLIR_IFACE}" sudah ada (${type})`);
    return { ok: true, name: DEFAULT_ISOLIR_IFACE, created: false, type };
  }

  try {
    await runWithRetry(api, [
      '/interface/dummy/add',
      '=name=' + DEFAULT_ISOLIR_IFACE,
      '=comment=' + ISOLIR_IFACE_COMMENT
    ]);
    results.push(`✓ Interface dummy "${DEFAULT_ISOLIR_IFACE}" dibuat`);
    return { ok: true, name: DEFAULT_ISOLIR_IFACE, created: true, type: 'dummy' };
  } catch (dummyErr) {
    try {
      await runWithRetry(api, [
        '/interface/bridge/add',
        '=name=' + DEFAULT_ISOLIR_IFACE,
        '=protocol-mode=none',
        '=comment=' + ISOLIR_IFACE_COMMENT
      ]);
      results.push(`✓ Interface bridge "${DEFAULT_ISOLIR_IFACE}" dibuat (RouterOS tanpa dummy)`);
      return { ok: true, name: DEFAULT_ISOLIR_IFACE, created: true, type: 'bridge' };
    } catch (bridgeErr) {
      return {
        ok: false,
        error: `Gagal buat interface ${DEFAULT_ISOLIR_IFACE}: dummy=${dummyErr.message}; bridge=${bridgeErr.message}`
      };
    }
  }
}

/**
 * Pasang 10.255.255.1/24 di fiberix-isolir. Tidak memindah IP yang sudah ada di interface lain.
 */
async function ensureIsolirGateway(api, cfg, results) {
  const iface = await ensureIsolirInterface(api, results);
  if (!iface.ok) return iface;

  let addrs = [];
  try {
    addrs = await runWithRetry(api, ['/ip/address/print']);
  } catch (e) {
    return { ok: false, error: 'Gagal baca /ip address: ' + e.message };
  }

  const match = findAddressRow(addrs, cfg.localAddr);
  const cidr = gatewayAddressCidr(cfg.localAddr);
  if (match) {
    const onIface = String(match.interface || '');
    if (onIface && onIface !== DEFAULT_ISOLIR_IFACE) {
      results.push(`• IP ${match.address} sudah ada di interface "${onIface}" — tidak dipindah`);
    } else {
      results.push(`• IP ${match.address} sudah ada di "${DEFAULT_ISOLIR_IFACE}"`);
    }
    return { ok: true, address: match.address, interface: onIface || DEFAULT_ISOLIR_IFACE, created: false };
  }

  try {
    await runWithRetry(api, [
      '/ip/address/add',
      '=address=' + cidr,
      '=interface=' + DEFAULT_ISOLIR_IFACE,
      '=comment=' + ISOLIR_IFACE_COMMENT
    ]);
    results.push(`✓ IP ${cidr} dipasang di "${DEFAULT_ISOLIR_IFACE}"`);
    return { ok: true, address: cidr, interface: DEFAULT_ISOLIR_IFACE, created: true };
  } catch (e) {
    return { ok: false, error: 'Gagal pasang IP isolir: ' + e.message };
  }
}

async function inspectIsolirIp(api, sequelize) {
  const cfg = await getPPPoESettings(sequelize);
  const data = {
    cfg,
    interface: { name: DEFAULT_ISOLIR_IFACE, exists: false, type: null },
    address: { address: null, interface: null, exists: false },
    pool: { name: cfg.poolName, ranges: null, exists: false },
    profile: { name: cfg.profileName, localAddress: null, remoteAddress: null, exists: false },
  };

  const iface = await findNamedInterface(api, DEFAULT_ISOLIR_IFACE);
  if (iface) {
    data.interface.exists = true;
    data.interface.type = String(iface.type || '') || null;
  }

  try {
    const addrs = await runWithRetry(api, ['/ip/address/print']);
    const match = findAddressRow(addrs, cfg.localAddr);
    if (match) {
      data.address.exists = true;
      data.address.address = match.address || null;
      data.address.interface = match.interface || null;
    }
  } catch (_) { /* inspect best-effort */ }

  try {
    const pools = await runWithRetry(api, ['/ip/pool/print', '?name=' + cfg.poolName]);
    if (pools[0]) {
      data.pool.exists = true;
      data.pool.ranges = pools[0].ranges || null;
    }
  } catch (_) { /* inspect best-effort */ }

  try {
    const profiles = await runWithRetry(api, ['/ppp/profile/print', '?name=' + cfg.profileName]);
    if (profiles[0]) {
      data.profile.exists = true;
      data.profile.localAddress = profiles[0]['local-address'] || profiles[0].localAddress || null;
      data.profile.remoteAddress = profiles[0]['remote-address'] || profiles[0].remoteAddress || null;
      data.profile.rateLimit = profiles[0]['rate-limit'] || profiles[0].rateLimit || null;
    }
  } catch (_) { /* inspect best-effort */ }

  const ready = data.address.exists && data.pool.exists && data.profile.exists;
  return { success: true, ready, data };
}

/**
 * Buat IP isolir lengkap: interface + gateway + pool + PPP profile. Idempotent.
 * Tidak menyentuh firewall/NAT (itu Setup Firewall).
 */
async function setupIsolirIp(api, sequelize) {
  const cfg = await getPPPoESettings(sequelize);
  const valid = validateIsolirNetwork(cfg);
  if (!valid.ok) {
    return { success: false, error: valid.error, details: [] };
  }

  const results = [];
  const gw = await ensureIsolirGateway(api, cfg, results);
  if (!gw.ok) {
    return { success: false, error: gw.error, details: results };
  }

  const ppp = await setupIsolirProfile(api, sequelize);
  results.push(...(ppp.details || []));
  if (!ppp.success) {
    return { success: false, error: ppp.error, details: results };
  }

  let inspect = null;
  try {
    inspect = await inspectIsolirIp(api, sequelize);
  } catch (_) { /* inspect tidak wajib */ }

  results.push(`✓ IP Isolir siap — gateway ${cfg.localAddr}/24, pool ${cfg.poolRange}`);
  return {
    success: true,
    details: results,
    cfg,
    inspect: inspect && inspect.data ? inspect.data : null,
  };
}

/**
 * Setup IP pool & PPP profile isolir di MikroTik. Idempotent.
 * Dipanggil dari setupFirewallV2 dan setupIsolirIp.
 */
async function setupIsolirProfile(api, sequelize) {
  const cfg = await getPPPoESettings(sequelize);
  const results = [];

  // ── 1. Pool ──
  try {
    const existing = await runWithRetry(api, ['/ip/pool/print', '?name=' + cfg.poolName]);
    if (existing.length === 0) {
      await runWithRetry(api, [
        '/ip/pool/add',
        '=name=' + cfg.poolName,
        '=ranges=' + cfg.poolRange
      ]);
      results.push(`✓ IP pool "${cfg.poolName}" dibuat (${cfg.poolRange})`);
    } else {
      // Update ranges kalau berbeda
      const curRanges = String(existing[0].ranges || '').trim();
      if (curRanges !== cfg.poolRange && existing[0]['.id']) {
        await runWithRetry(api, [
          '/ip/pool/set',
          '=.id=' + existing[0]['.id'],
          '=ranges=' + cfg.poolRange
        ]);
        results.push(`✓ IP pool "${cfg.poolName}" range diupdate ke ${cfg.poolRange}`);
      } else {
        results.push(`• IP pool "${cfg.poolName}" sudah ada`);
      }
    }
  } catch (e) {
    return { success: false, error: `Pool: ${e.message}`, details: results };
  }

  // ── 2. PPP Profile ──
  try {
    const existing = await runWithRetry(api, ['/ppp/profile/print', '?name=' + cfg.profileName]);
    const profileArgs = [
      '=name=' + cfg.profileName,
      '=local-address=' + cfg.localAddr,
      '=remote-address=' + cfg.poolName,
      '=address-list=FLAYNET-ISOLIR',
      '=rate-limit=' + cfg.rateLimit
    ];
    if (existing.length === 0) {
      await runWithRetry(api, ['/ppp/profile/add', ...profileArgs]);
      results.push(`✓ PPP profile "${cfg.profileName}" dibuat`);
    } else if (existing[0]['.id']) {
      // Update existing untuk memastikan semua field sinkron
      await runWithRetry(api, [
        '/ppp/profile/set',
        '=.id=' + existing[0]['.id'],
        '=local-address=' + cfg.localAddr,
        '=remote-address=' + cfg.poolName,
        '=address-list=FLAYNET-ISOLIR',
        '=rate-limit=' + cfg.rateLimit
      ]);
      results.push(`• PPP profile "${cfg.profileName}" sudah ada (sinkron field)`);
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
  DEFAULT_POOL_RANGES,
  DEFAULT_LOCAL_ADDR,
  DEFAULT_RATE_LIMIT,
  DEFAULT_ISOLIR_IFACE,
  getPPPoESettings,
  validateIsolirNetwork,
  slash24Cidr,
  gatewayAddressCidr,
  setupIsolirProfile,
  setupIsolirIp,
  inspectIsolirIp,
  isolirPPPoEUser,
  restorePPPoEUser,
};
