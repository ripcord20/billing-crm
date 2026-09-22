'use strict';
const assert = require('assert');
const Module = require('module');
const stubs = {
  '../utils/logger': { info() {}, warn() {}, error() {}, debug() {} },
  'net-snmp': {
    createSession() { return { get() {}, subtree() {}, close() {}, on() {} }; },
    isVarbindError() { return false; },
    Version2c: 1,
  },
};
const orig = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === '../utils/logger' || id.endsWith('/utils/logger')) return stubs['../utils/logger'];
  if (id === 'net-snmp') return stubs['net-snmp'];
  return orig.apply(this, arguments);
};
const Hioso = require('../services/HiosoSnmpService');
const s = new Hioso({ host: '127.0.0.1', name: 'test' });

assert.deepStrictEqual(s._splitIdx('1.3.6.1.4.1.25355.3.2.6.3.2.1.37.1.2.1', '1.3.6.1.4.1.25355.3.2.6.3.2.1.37'), { board: 1, pon: 2, onu: 1, key: '1.2.1' });
assert.strictEqual(s._asMac('e47e9abb66a7'), 'E4:7E:9A:BB:66:A7');
assert.strictEqual(s._asDbm('-18.79'), -18.79);
assert.strictEqual(s._asTxt('"EPON"'), 'EPON');
assert.strictEqual(s._quality(-18.79), 'good');
assert.strictEqual(s._quality(-29), 'critical');
console.log('✓ Hioso SNMP 25355 tests PASS');
