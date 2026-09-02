'use strict';

function describeMysqlError(err, server) {
  const host = `${(server && server.mysql_host) || '?'}:${(server && server.mysql_port) || 3306}`;
  const code = err && err.code;
  if (code === 'ECONNREFUSED') {
    return `MySQL RADIUS menolak koneksi di ${host}. Pastikan port 3306 terbuka dari server billing, atau isi host 127.0.0.1 jika schema radius ada di server yang sama.`;
  }
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return `Host MySQL RADIUS ${host} tidak terjangkau.`;
  }
  if (code === 'ER_ACCESS_DENIED_ERROR') {
    return `User/password MySQL RADIUS ditolak di ${host}. Isi ulang password di modul RADIUS.`;
  }
  if (code === 'ER_BAD_DB_ERROR') {
    return `Database ${(server && server.mysql_database) || 'radius'} tidak ada di ${host}.`;
  }
  return (err && err.message) || 'Koneksi MySQL RADIUS gagal';
}

function isIpv4(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(value || '').trim());
}

function rateLimitFromPackage(pkg) {
  if (!pkg) return null;
  const down = parseInt(pkg.speed_down, 10) || 0;
  const up = parseInt(pkg.speed_up, 10) || 0;
  if (!down && !up) return null;
  const rx = (up || down) + 'M';
  const tx = (down || up) + 'M';
  return rx + '/' + tx;
}

module.exports = {
  describeMysqlError,
  isIpv4,
  rateLimitFromPackage
};
