'use strict';
const assert = require('assert');
const {
  normalizeNasname,
  isValidNasname,
  isHostnameNasname,
  isIpv4Nasname,
  looksLikeDomainVpn,
  normalizeVpnType,
  isDomainVpnType
} = require('../utils/nasHost');
const { generateNasSecret, resolveNasSecret } = require('../utils/nasSecret');

assert.strictEqual(normalizeNasname(' https://cabang.tunnel.web.id:443/path '), 'cabang.tunnel.web.id');
assert.strictEqual(normalizeNasname('router.hostddns.net.'), 'router.hostddns.net');
assert.strictEqual(normalizeNasname('10.201.0.2'), '10.201.0.2');
assert.strictEqual(normalizeNasname('10.201.0.2/32'), '10.201.0.2');
assert.ok(isIpv4Nasname('192.168.22.1'));
assert.ok(isHostnameNasname('cabang.tunnel.web.id'));
assert.ok(isHostnameNasname('naga.hostddns.net'));
assert.ok(isValidNasname('cabang.tunnel.web.id'));
assert.ok(!isValidNasname('bukan domain'));
assert.ok(!isValidNasname('vpn'));
assert.ok(looksLikeDomainVpn('a.tunnel.web.id'));
assert.ok(!looksLikeDomainVpn('10.201.0.2'));
assert.strictEqual(normalizeVpnType('', 'cabang.tunnel.web.id', 'vpn'), 'domain');
assert.strictEqual(normalizeVpnType('', '10.201.0.2', 'vpn'), 'wireguard');
assert.strictEqual(normalizeVpnType('hostddns', 'x.y.id', 'vpn'), 'domain');
assert.ok(isDomainVpnType('domain'));
assert.ok(isDomainVpnType('ddns'));

const a = generateNasSecret();
const b = generateNasSecret();
assert.ok(/^fx[a-f0-9]{20}$/.test(a));
assert.notStrictEqual(a, b);
assert.strictEqual(resolveNasSecret('********').slice(0, 2), 'fx');
assert.strictEqual(resolveNasSecret('keep-me'), 'keep-me');

console.log('nasHost.test.js OK');
