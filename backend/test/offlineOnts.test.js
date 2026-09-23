'use strict';
const assert = require('assert');
const {
  isOntOffline,
  collectOfflineFromCache,
  summarizeFromCache,
  countByOlt,
} = require('../utils/offlineOnts');

assert.strictEqual(isOntOffline('offline'), true);
assert.strictEqual(isOntOffline('LOS'), true);
assert.strictEqual(isOntOffline('online'), false);
assert.strictEqual(isOntOffline('working'), false);
assert.strictEqual(isOntOffline(''), false);

const cache = {
  '1': {
    cachedAt: '2026-09-23T13:00:00.000Z',
    onus: [
      { name: 'ALFIN', sn: 'ZTEGC86447CB', pon: '2', onu_id: 6, status: 'offline', onu_rx_dbm: null },
      { name: 'ERNI', sn: 'HWTC111', pon: '1', onu_id: 8, status: 'online', onu_rx_dbm: -21.8 },
    ],
  },
  '2': {
    cachedAt: '2026-09-23T13:00:00.000Z',
    onus: [
      { name: 'NOVI', sn: 'HWTC75f6149d', pon: 1, onu_id: 5, status: 'offline' },
      { name: 'PETAK', sn: '78:D7:52:75:E3:8B', pon: 1, onu_id: 8, status: 'offline' },
    ],
  },
};
const cfgs = [
  { id: 1, name: 'POPMDR C-DATA', host: '192.168.93.10', brand: 'cdata' },
  { id: 2, name: 'HSGQ-G04ID', host: '192.168.94.29', brand: 'hsgq' },
];

const rows = collectOfflineFromCache(cache, cfgs);
assert.strictEqual(rows.length, 3);
assert.strictEqual(rows[0].olt_name, 'POPMDR C-DATA');
assert.strictEqual(rows[0].serial_number, 'ZTEGC86447CB');
assert.strictEqual(rows[0].pon, '2');
assert.strictEqual(rows[0].onu_id, 6);
assert.ok(rows.some((r) => r.olt_name === 'HSGQ-G04ID' && r.name === 'NOVI'));

const sum = summarizeFromCache(cache);
assert.strictEqual(sum.total, 4);
assert.strictEqual(sum.offline, 3);
assert.strictEqual(sum.online, 1);

const by = countByOlt(rows);
assert.strictEqual(by['POPMDR C-DATA'], 1);
assert.strictEqual(by['HSGQ-G04ID'], 2);

console.log('offlineOnts.test.js OK');
