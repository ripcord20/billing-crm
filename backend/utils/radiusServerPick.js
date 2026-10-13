'use strict';

/** Baris server yang dipakai ulang. Jangan cocokkan mysql_host: bootstrap
 *  mengubah 192.168.22.9 → 127.0.0.1, lalu findOrCreate bikin baris baru tiap restart. */
function pickExistingRadiusServer(rows, radiusHost) {
  const list = Array.isArray(rows) ? rows : [];
  return list.find((r) => r && r.host === radiusHost) || list[0] || null;
}

function duplicateServerIds(rows) {
  const keep = new Set();
  const drop = [];
  for (const r of rows || []) {
    const key = [r.host, r.mysql_host, r.mysql_database].join('|');
    if (!keep.has(key)) keep.add(key);
    else drop.push(r.id);
  }
  return drop;
}

function shouldSkipLocalMysqlRewrite(row) {
  if (!row) return true;
  return row.mysql_host === '192.168.22.9' || row.host === '192.168.22.9';
}

module.exports = {
  pickExistingRadiusServer,
  duplicateServerIds,
  shouldSkipLocalMysqlRewrite
};
