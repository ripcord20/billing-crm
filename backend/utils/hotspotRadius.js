'use strict';

/**
 * Helper murni untuk hotspot full RADIUS.
 * Tidak menyentuh PPPoE, isolir captive portal, atau user isolir-guest.
 */

const ISOLIR = {
  user: 'isolir-guest',
  userProfile: 'flaynet-isolir-user',
  profile: 'flaynet-isolir-profile',
  htmlDir: 'flaynet-isolir',
  tag: 'FLAYNET-ISOLIR-HS-TAG'
};

function isIsolirHotspotUser(u) {
  const name = String((u && (u.name || u.username)) || '').trim();
  const profile = String((u && u.profile) || '').trim();
  const comment = String((u && u.comment) || '');
  if (name === ISOLIR.user) return true;
  if (profile === ISOLIR.userProfile) return true;
  if (comment.includes(ISOLIR.tag) || comment.includes('FLAYNET-ISOLIR')) return true;
  return false;
}

function isIsolirHotspotProfile(p) {
  const name = String((p && p.name) || '').trim();
  const html = String((p && (p['html-directory'] || p.htmlDirectory)) || '').trim();
  if (name === ISOLIR.profile) return true;
  if (html === ISOLIR.htmlDir) return true;
  return false;
}

function parseMtTimeToSeconds(s) {
  if (s == null) return 0;
  const str = String(s).trim().toLowerCase();
  if (!str || str === '0' || str === '0s' || str === 'none') return 0;
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  const units = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
  const re = /(\d+)([wdhms])/g;
  let total = 0;
  let matched = false;
  let m;
  while ((m = re.exec(str)) !== null) {
    matched = true;
    total += parseInt(m[1], 10) * (units[m[2]] || 0);
  }
  return matched ? total : 0;
}

function formatSecondsToMt(sec) {
  let n = Math.max(0, parseInt(sec, 10) || 0);
  if (!n) return '0s';
  const w = Math.floor(n / 604800); n %= 604800;
  const d = Math.floor(n / 86400); n %= 86400;
  const h = Math.floor(n / 3600); n %= 3600;
  const m = Math.floor(n / 60); n %= 60;
  let out = '';
  if (w) out += w + 'w';
  if (d) out += d + 'd';
  if (h) out += h + 'h';
  if (m) out += m + 'm';
  if (n) out += n + 's';
  return out || '0s';
}

/**
 * Attribute RADIUS untuk user hotspot.
 * Jangan taruh check attribute kustom (Fiberix-*) — FreeRADIUS akan
 * mencocokkannya ke Access-Request dan auth gagal.
 */
function mapUserToRadiusAttrs(data) {
  const checks = [];
  const replies = [];
  const password = data && data.password != null ? String(data.password) : '';
  if (password !== '') {
    checks.push({ attribute: 'Cleartext-Password', op: ':=', value: password });
  }
  if (data && data.disabled) {
    checks.push({ attribute: 'Auth-Type', op: ':=', value: 'Reject' });
  }
  const mac = String((data && (data.macAddress || data['mac-address'])) || '').trim();
  if (mac) {
    checks.push({ attribute: 'Calling-Station-Id', op: '==', value: mac });
  }

  const profile = String((data && data.profile) || '').trim();
  if (profile) {
    replies.push({ attribute: 'Mikrotik-Group', op: ':=', value: profile });
  }

  const sessionSec = parseMtTimeToSeconds((data && (data.limitUptime || data['limit-uptime'])) || '');
  if (sessionSec > 0) {
    replies.push({ attribute: 'Session-Timeout', op: ':=', value: String(sessionSec) });
  }

  const bytesTotal = parseInt((data && (data.limitBytesTotal || data['limit-bytes-total'])) || 0, 10) || 0;
  if (bytesTotal > 0) {
    replies.push({ attribute: 'Mikrotik-Total-Limit', op: ':=', value: String(bytesTotal) });
  }
  const bytesIn = parseInt((data && (data.limitBytesIn || data['limit-bytes-in'])) || 0, 10) || 0;
  if (bytesIn > 0) {
    replies.push({ attribute: 'Mikrotik-Recv-Limit', op: ':=', value: String(bytesIn) });
  }
  const bytesOut = parseInt((data && (data.limitBytesOut || data['limit-bytes-out'])) || 0, 10) || 0;
  if (bytesOut > 0) {
    replies.push({ attribute: 'Mikrotik-Xmit-Limit', op: ':=', value: String(bytesOut) });
  }

  const address = String((data && data.address) || '').trim();
  if (address) {
    replies.push({ attribute: 'Framed-IP-Address', op: ':=', value: address });
  }

  return {
    username: String((data && (data.name || data.username)) || '').trim(),
    groupname: profile || '',
    checks,
    replies
  };
}

function splitRadiusServices(service) {
  return String(service || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeRadiusService(existing) {
  const parts = splitRadiusServices(existing);
  if (!parts.includes('hotspot')) parts.push('hotspot');
  return parts.join(',');
}

/** Hanya sentuh client RADIUS PPPoE Fiberix. Jangan ubah entry BILLINGRADIUS/sewa. */
function shouldAddHotspotToRadiusClient(entry) {
  const comment = String((entry && entry.comment) || '').toUpperCase();
  if (comment.includes('BILLINGRADIUS')) return false;
  const parts = splitRadiusServices(entry && entry.service);
  if (parts.includes('hotspot')) return false;
  return parts.includes('ppp');
}

function canEnableHotspotRadius(radiusEntries) {
  const list = Array.isArray(radiusEntries) ? radiusEntries : [];
  return list.some((r) => {
    const parts = splitRadiusServices(r && r.service);
    if (parts.includes('hotspot')) return true;
    return shouldAddHotspotToRadiusClient(r);
  });
}

function mergeUsage(acct, active) {
  const a = acct || {};
  const live = active || {};
  const bytesIn = Math.max(parseInt(a.bytesIn || 0, 10) || 0, parseInt(live.bytesIn || 0, 10) || 0);
  const bytesOut = Math.max(parseInt(a.bytesOut || 0, 10) || 0, parseInt(live.bytesOut || 0, 10) || 0);
  const uptimeSec = Math.max(
    parseInt(a.uptimeSec || 0, 10) || 0,
    parseMtTimeToSeconds(live.uptime || 0)
  );
  return { bytesIn, bytesOut, uptime: formatSecondsToMt(uptimeSec), uptimeSec };
}

function toApiUser(row, usage) {
  const u = usage || {};
  return {
    id: String(row.id),
    name: row.username,
    password: row.password || '',
    profile: row.profile || 'default',
    server: row.server || 'all',
    address: row.address || '',
    macAddress: row.mac_address || '',
    limitUptime: row.limit_uptime || '',
    limitBytesIn: parseInt(row.limit_bytes_in, 10) || 0,
    limitBytesOut: parseInt(row.limit_bytes_out, 10) || 0,
    limitBytesTotal: parseInt(row.limit_bytes_total, 10) || 0,
    bytesIn: u.bytesIn || 0,
    bytesOut: u.bytesOut || 0,
    uptime: u.uptime || '0s',
    disabled: !!row.disabled,
    comment: row.comment || ''
  };
}

function collisionError(username) {
  return new Error(
    'Username "' + username + '" sudah ada di RADIUS (bukan user hotspot). ' +
    'Tidak diubah supaya akun PPPoE/lain tetap jalan. Pilih nama lain.'
  );
}

function normalizeUserPayload(data, fallback) {
  const src = data || {};
  const prev = fallback || {};
  const password = src.password !== undefined ? src.password : prev.password;
  return {
    name: String(src.name || src.username || prev.username || '').trim(),
    username: String(src.name || src.username || prev.username || '').trim(),
    password: password == null ? '' : String(password),
    profile: String(src.profile !== undefined ? src.profile : (prev.profile || 'default')).trim() || 'default',
    server: String(src.server !== undefined ? src.server : (prev.server || 'all')).trim() || 'all',
    address: String(src.address !== undefined ? src.address : (prev.address || '')).trim(),
    macAddress: String(src.macAddress !== undefined ? src.macAddress : (prev.mac_address || '')).trim(),
    limitUptime: String(src.limitUptime !== undefined ? src.limitUptime : (prev.limit_uptime || '')).trim(),
    limitBytesIn: parseInt(src.limitBytesIn !== undefined ? src.limitBytesIn : (prev.limit_bytes_in || 0), 10) || 0,
    limitBytesOut: parseInt(src.limitBytesOut !== undefined ? src.limitBytesOut : (prev.limit_bytes_out || 0), 10) || 0,
    limitBytesTotal: parseInt(src.limitBytesTotal !== undefined ? src.limitBytesTotal : (prev.limit_bytes_total || 0), 10) || 0,
    comment: String(src.comment !== undefined ? src.comment : (prev.comment || '')),
    disabled: src.disabled !== undefined ? !!src.disabled : !!prev.disabled,
    deviceId: src.deviceId !== undefined ? src.deviceId : (prev.device_id != null ? prev.device_id : null)
  };
}

function rowFromPayload(payload) {
  return {
    username: payload.username,
    password: payload.password || '',
    profile: payload.profile || 'default',
    server: payload.server || 'all',
    address: payload.address || '',
    mac_address: payload.macAddress || '',
    limit_uptime: payload.limitUptime || '',
    limit_bytes_in: payload.limitBytesIn || 0,
    limit_bytes_out: payload.limitBytesOut || 0,
    limit_bytes_total: payload.limitBytesTotal || 0,
    comment: payload.comment || '',
    disabled: !!payload.disabled,
    device_id: payload.deviceId != null ? payload.deviceId : null
  };
}

module.exports = {
  ISOLIR,
  isIsolirHotspotUser,
  isIsolirHotspotProfile,
  parseMtTimeToSeconds,
  formatSecondsToMt,
  mapUserToRadiusAttrs,
  splitRadiusServices,
  mergeRadiusService,
  shouldAddHotspotToRadiusClient,
  canEnableHotspotRadius,
  mergeUsage,
  toApiUser,
  collisionError,
  normalizeUserPayload,
  rowFromPayload
};
