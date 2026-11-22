'use strict';
const assert = require('assert');
const {
  isAssignedIpv4,
  normalizeIp,
  findDuplicateSecrets,
  findDuplicateSessions,
  findDuplicateCustomers,
  findRemoteAddressClash,
  clashMessage
} = require('../utils/pppoeDuplicateIp');

assert.strictEqual(isAssignedIpv4('10.10.10.2'), true);
assert.strictEqual(isAssignedIpv4('10.10.10.2/32'), true);
assert.strictEqual(isAssignedIpv4('pppoe-pool'), false);
assert.strictEqual(isAssignedIpv4('isolir-pool'), false);
assert.strictEqual(isAssignedIpv4('10.10.10.0/24'), false);
assert.strictEqual(isAssignedIpv4('10.0.0.2-10.0.0.10'), false);
assert.strictEqual(isAssignedIpv4(''), false);
assert.strictEqual(isAssignedIpv4(null), false);
assert.strictEqual(isAssignedIpv4('256.1.1.1'), false);

assert.strictEqual(normalizeIp(' 10.10.010.002 '), '10.10.10.2');
assert.strictEqual(normalizeIp('10.10.10.2/32'), '10.10.10.2');

const secrets = [
  { id: '*1', name: 'andi', remoteAddress: '10.8.0.10', disabled: false },
  { id: '*2', name: 'budi', remoteAddress: '10.8.0.10', disabled: false },
  { id: '*3', name: 'cia', remoteAddress: 'pppoe-pool', disabled: false },
  { id: '*4', name: 'doni', remoteAddress: 'pppoe-pool', disabled: false },
  { id: '*5', name: 'eka', remoteAddress: '10.8.0.11', disabled: false },
  { id: '*6', name: 'ANDI', remoteAddress: '10.8.0.12', disabled: false },
  { id: '*7', name: 'fani', remoteAddress: '10.8.0.11', disabled: true },
  { id: '*8', name: 'andi', remoteAddress: '10.8.0.99', disabled: false },
  { id: '*9', name: 'ANDI', remoteAddress: '10.8.0.99', disabled: false } // username sama (case) ≠ 2 user
];

const secretDupes = findDuplicateSecrets(secrets);
assert.strictEqual(secretDupes.length, 2);
assert.ok(!secretDupes.some((g) => g.ip === '10.8.0.99'), 'username sama (beda kapital) bukan 2 user');
assert.strictEqual(secretDupes[0].ip, '10.8.0.10');
assert.strictEqual(secretDupes[0].count, 2);
assert.deepStrictEqual(secretDupes[0].users.map((u) => u.name).sort(), ['andi', 'budi']);
assert.strictEqual(secretDupes[1].ip, '10.8.0.11');
assert.strictEqual(secretDupes[1].count, 2);

const sessions = [
  { id: '*a', name: 'andi', address: '10.8.0.10' },
  { id: '*b', name: 'budi', address: '10.8.0.10' },
  { id: '*c', name: 'cia', address: '10.8.0.20' }
];
const sessDupes = findDuplicateSessions(sessions);
assert.strictEqual(sessDupes.length, 1);
assert.strictEqual(sessDupes[0].ip, '10.8.0.10');
assert.strictEqual(sessDupes[0].count, 2);

const customers = [
  { id: 1, customer_id: 'C001', name: 'Andi', pppoe_username: 'andi', static_ip: '10.9.0.5' },
  { id: 2, customer_id: 'C002', name: 'Budi', pppoe_username: 'budi', static_ip: '10.9.0.5' },
  { id: 3, customer_id: 'C003', name: 'Cia', pppoe_username: 'cia', static_ip: '' },
  { id: 4, customer_id: 'C004', name: 'Doni', pppoe_username: 'doni', static_ip: '10.9.0.6' }
];
const custDupes = findDuplicateCustomers(customers);
assert.strictEqual(custDupes.length, 1);
assert.strictEqual(custDupes[0].ip, '10.9.0.5');
assert.strictEqual(custDupes[0].count, 2);

const clash = findRemoteAddressClash(secrets, '10.8.0.10', { excludeName: 'andi' });
assert.ok(clash);
assert.strictEqual(clash.name, 'budi');
assert.strictEqual(findRemoteAddressClash(secrets, '10.8.0.12', { excludeName: 'andi' }), null);
assert.strictEqual(findRemoteAddressClash(secrets, 'pppoe-pool', { excludeName: 'cia' }), null);
assert.strictEqual(clashMessage('10.8.0.10', 'budi'), 'IP 10.8.0.10 sudah dipakai user PPPoE "budi"');

console.log('pppoeDuplicateIp.test.js OK');
