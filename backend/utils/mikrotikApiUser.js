'use strict';

/**
 * Hak akses user MikroTik untuk Device Management (REST / API binary).
 *
 * Group `read` cukup untuk grafik & status.
 * Isolir, kick PPPoE, secret, queue, firewall butuh write — paling aman group `full`.
 */

function classifyMikrotikApiGroup(group) {
  const raw = String(group == null ? '' : group).trim();
  const g = raw.toLowerCase();
  if (g === 'full' || g === 'write') {
    return {
      level: 'write',
      ok: true,
      warn: false,
      message: `group ${raw} — isolir, PPPoE, QoS, firewall bisa`
    };
  }
  if (g === 'read') {
    return {
      level: 'read',
      ok: false,
      warn: true,
      message: 'group read — hanya monitor. Isolir, kick PPPoE, QoS, dan firewall tidak jalan. Ganti ke group full.'
    };
  }
  if (raw) {
    return {
      level: 'custom',
      ok: true,
      warn: true,
      message: `group ${raw} — pastikan policy ada write + api/rest-api (bukan read).`
    };
  }
  return { level: 'unknown', ok: true, warn: false, message: null };
}

module.exports = { classifyMikrotikApiGroup };
