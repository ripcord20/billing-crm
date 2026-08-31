'use strict';
const assert = require('assert');
const { findManagedDevice, normalize } = require('../utils/nasDeviceLink');

assert.strictEqual(normalize('  GANANET '), 'GANANET');

const ganet = { id: 1, name: 'GANANET', ip_address: '192.168.61.2' };
const Device = {
  async findByPk(id) { return id === 1 ? ganet : null; },
  async findOne({ where }) {
    if (where.ip_address === '192.168.61.2') return ganet;
    if (where.name === 'GANANET') return ganet;
    return null;
  }
};

(async () => {
  const byIp = await findManagedDevice(Device, { nasname: '192.168.61.2', shortname: 'x' });
  assert.strictEqual(byIp.id, 1);
  const byName = await findManagedDevice(Device, { nasname: '10.0.0.1', shortname: 'GANANET' });
  assert.strictEqual(byName.ip_address, '192.168.61.2');
  const miss = await findManagedDevice(Device, { nasname: '1.1.1.1', shortname: 'other' });
  assert.strictEqual(miss, null);
  console.log('nasDeviceLink.test.js OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
