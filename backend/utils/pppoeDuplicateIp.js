/**
 * Deteksi IP yang dipakai lebih dari satu user PPPoE.
 *
 * Hanya IP IPv4 murni yang dihitung. Nilai remote-address berupa NAMA POOL
 * (mis. "pppoe-pool", "isolir-pool") sengaja diabaikan — itu memang dipakai
 * bersama banyak user.
 */

function stripCidrHost(value) {
  return String(value || '').trim().replace(/\/32$/i, '');
}

function normalizeIp(value) {
  const s = stripCidrHost(value);
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return s;
  return m.slice(1).map((n) => String(parseInt(n, 10))).join('.');
}

function isAssignedIpv4(value) {
  const s = stripCidrHost(value);
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return false;
  return m.slice(1).every((n) => {
    const v = parseInt(n, 10);
    return v >= 0 && v <= 255;
  });
}

/**
 * Kelompokkan entri yang berbagi IP IPv4, lalu kembalikan hanya grup
 * dengan ≥ 2 user berbeda (case-insensitive).
 *
 * @param {object[]} entries
 * @param {(entry: object) => string} getIp
 * @param {(entry: object) => string} getUserKey
 * @returns {{ ip: string, count: number, users: object[] }[]}
 */
function groupByAssignedIp(entries, getIp, getUserKey) {
  const map = new Map();
  for (const entry of entries || []) {
    const ip = normalizeIp(getIp(entry));
    if (!isAssignedIpv4(ip)) continue;
    if (!map.has(ip)) map.set(ip, []);
    map.get(ip).push(entry);
  }

  const dupes = [];
  for (const [ip, users] of map) {
    const keys = new Set(
      users
        .map((u) => String(getUserKey(u) || '').trim().toLowerCase())
        .filter(Boolean)
    );
    if (keys.size >= 2) {
      dupes.push({ ip, count: keys.size, users });
    }
  }

  dupes.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
  return dupes;
}

function findDuplicateSecrets(secrets) {
  return groupByAssignedIp(
    secrets,
    (s) => s.remoteAddress || s.remote_address || '',
    (s) => s.name || s.username || ''
  );
}

function findDuplicateSessions(sessions) {
  return groupByAssignedIp(
    sessions,
    (s) => s.address || '',
    (s) => s.name || s.user || ''
  );
}

function findDuplicateCustomers(customers) {
  return groupByAssignedIp(
    customers,
    (c) => c.static_ip || '',
    (c) => c.pppoe_username || c.customer_id || String(c.id || '')
  );
}

/**
 * Cari secret lain yang sudah memakai IP yang sama.
 * @returns {object|null} secret yang bentrok, atau null
 */
function findRemoteAddressClash(secrets, ip, opts = {}) {
  const norm = normalizeIp(ip);
  if (!isAssignedIpv4(norm)) return null;
  const excludeId = opts.excludeId != null ? String(opts.excludeId) : null;
  const excludeName = opts.excludeName ? String(opts.excludeName).toLowerCase() : '';
  for (const s of secrets || []) {
    if (!isAssignedIpv4(s.remoteAddress || s.remote_address)) continue;
    if (normalizeIp(s.remoteAddress || s.remote_address) !== norm) continue;
    if (excludeId && String(s.id) === excludeId) continue;
    if (excludeName && String(s.name || '').toLowerCase() === excludeName) continue;
    return s;
  }
  return null;
}

function clashMessage(ip, otherName) {
  return `IP ${normalizeIp(ip)} sudah dipakai user PPPoE "${otherName}"`;
}

module.exports = {
  isAssignedIpv4,
  normalizeIp,
  groupByAssignedIp,
  findDuplicateSecrets,
  findDuplicateSessions,
  findDuplicateCustomers,
  findRemoteAddressClash,
  clashMessage
};
