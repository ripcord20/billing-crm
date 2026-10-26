'use strict';

/**
 * Formatter riwayat accounting RADIUS (radacct) untuk UI Log Radius.
 * Download = octet ke user (acctoutputoctets), Upload = octet dari user.
 */

function toNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDurationId(seconds) {
  let s = Math.max(0, Math.floor(toNum(seconds)));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const parts = [];
  if (d) parts.push(d + ' hari');
  if (h) parts.push(h + ' jam');
  if (m) parts.push(m + ' menit');
  if (s || !parts.length) parts.push(s + ' detik');
  return parts.join(' ');
}

function formatBytes(n) {
  n = Math.max(0, toNum(n));
  if (n < 1024) return n + ' B';
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  if (Math.abs(v - Math.round(v)) < 1e-9) return Math.round(v) + ' ' + units[i];
  return v.toFixed(2) + ' ' + units[i];
}

function formatTs(d, tz) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  const zone = tz || process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Jakarta';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const hh = parts.hour === '24' ? '00' : parts.hour;
    return `${parts.year}-${parts.month}-${parts.day} ${hh}:${parts.minute}:${parts.second}`;
  } catch (_) {
    return date.toISOString().replace('T', ' ').slice(0, 19);
  }
}

function normalizeMac(raw) {
  const hex = String(raw || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== 12) return String(raw || '').trim();
  return hex.match(/.{2}/g).join(':');
}

function escapeLike(s) {
  return String(s || '').replace(/[\\%_]/g, '\\$&');
}

function mapSession(row, tz) {
  const stop = row.acctstoptime || null;
  const seconds = toNum(row.acctsessiontime);
  const upload = toNum(row.acctinputoctets);
  const download = toNum(row.acctoutputoctets);
  return {
    id: row.radacctid,
    sessionId: row.acctsessionid || '',
    uniqueId: row.acctuniqueid || '',
    username: row.username || '',
    online: !stop,
    start: formatTs(row.acctstarttime, tz),
    stop: stop ? formatTs(stop, tz) : null,
    uptime: formatDurationId(seconds),
    uptimeSeconds: seconds,
    download: formatBytes(download),
    upload: formatBytes(upload),
    downloadBytes: download,
    uploadBytes: upload,
    reason: stop ? (row.acctterminatecause || '—') : 'Online',
    mac: normalizeMac(row.callingstationid),
    ip: row.framedipaddress || '',
    nas: row.nasipaddress || ''
  };
}

module.exports = {
  toNum,
  formatDurationId,
  formatBytes,
  formatTs,
  normalizeMac,
  escapeLike,
  mapSession
};
