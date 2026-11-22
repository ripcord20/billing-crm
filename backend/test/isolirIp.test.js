'use strict';
const assert = require('assert');
const IsolirPPPoE = require('../services/IsolirPPPoE');

function fakeSequelize(overrides = {}) {
  const map = {
    isolir_pppoe_profile_name: overrides.profileName,
    isolir_pppoe_pool_name: overrides.poolName,
    isolir_pppoe_pool_range: overrides.poolRange,
    isolir_pppoe_local_addr: overrides.localAddr,
    isolir_pppoe_rate_limit: overrides.rateLimit,
  };
  return {
    QueryTypes: { SELECT: 'SELECT' },
    async query() {
      return Object.entries(map)
        .filter(([, v]) => v != null && v !== '')
        .map(([key, value]) => ({ key, value }));
    }
  };
}

class FakeApi {
  constructor({ supportDummy = true, interfaces = [], addresses = [], pools = [], profiles = [] } = {}) {
    this.supportDummy = supportDummy;
    this.skipIsolirDelay = true;
    this.interfaces = interfaces.map(x => ({ ...x }));
    this.addresses = addresses.map(x => ({ ...x }));
    this.pools = pools.map(x => ({ ...x }));
    this.profiles = profiles.map(x => ({ ...x }));
    this.calls = [];
    this._n = 1;
  }

  nextId() { return '*' + (this._n++); }

  async run(words) {
    this.calls.push(words.slice());
    const cmd = words[0];
    const args = {};
    const filters = {};
    for (const a of words.slice(1)) {
      if (a.startsWith('?')) {
        const eq = a.indexOf('=', 1);
        filters[a.slice(1, eq)] = a.slice(eq + 1);
      } else if (a.startsWith('=')) {
        const eq = a.indexOf('=', 1);
        args[a.slice(1, eq)] = a.slice(eq + 1);
      }
    }

    if (cmd === '/interface/print') {
      return this.interfaces.filter(i => !filters.name || i.name === filters.name);
    }
    if (cmd === '/interface/dummy/add') {
      if (!this.supportDummy) throw new Error('no such command prefix');
      this.interfaces.push({
        name: args.name, type: 'dummy', comment: args.comment, '.id': this.nextId()
      });
      return [{ '.id': this.interfaces[this.interfaces.length - 1]['.id'] }];
    }
    if (cmd === '/interface/bridge/add') {
      this.interfaces.push({
        name: args.name, type: 'bridge', comment: args.comment, '.id': this.nextId()
      });
      return [{ '.id': this.interfaces[this.interfaces.length - 1]['.id'] }];
    }
    if (cmd === '/ip/address/print') return this.addresses.slice();
    if (cmd === '/ip/address/add') {
      this.addresses.push({
        address: args.address, interface: args.interface, comment: args.comment, '.id': this.nextId()
      });
      return [{ '.id': this.addresses[this.addresses.length - 1]['.id'] }];
    }
    if (cmd === '/ip/pool/print') {
      return this.pools.filter(p => !filters.name || p.name === filters.name);
    }
    if (cmd === '/ip/pool/add') {
      this.pools.push({ name: args.name, ranges: args.ranges, '.id': this.nextId() });
      return [{}];
    }
    if (cmd === '/ip/pool/set') {
      const p = this.pools.find(x => x['.id'] === args['.id']);
      if (p && args.ranges) p.ranges = args.ranges;
      return [{}];
    }
    if (cmd === '/ppp/profile/print') {
      return this.profiles.filter(p => !filters.name || p.name === filters.name);
    }
    if (cmd === '/ppp/profile/add') {
      this.profiles.push({
        name: args.name,
        'local-address': args['local-address'],
        'remote-address': args['remote-address'],
        'address-list': args['address-list'],
        'rate-limit': args['rate-limit'],
        '.id': this.nextId()
      });
      return [{}];
    }
    if (cmd === '/ppp/profile/set') {
      const p = this.profiles.find(x => x['.id'] === args['.id']);
      if (p) {
        if (args['local-address']) p['local-address'] = args['local-address'];
        if (args['remote-address']) p['remote-address'] = args['remote-address'];
        if (args['rate-limit']) p['rate-limit'] = args['rate-limit'];
      }
      return [{}];
    }
    throw new Error('unexpected command ' + cmd);
  }
}

const good = IsolirPPPoE.validateIsolirNetwork({
  localAddr: '10.255.255.1',
  poolRange: '10.255.255.2-10.255.255.254',
  profileName: 'isolir-profile',
  poolName: 'isolir-pool',
  rateLimit: '128k/128k',
});
assert.strictEqual(good.ok, true);
assert.strictEqual(good.cidr, '10.255.255.1/24');
assert.strictEqual(good.network, '10.255.255.0/24');
assert.strictEqual(good.iface, 'fiberix-isolir');
assert.strictEqual(IsolirPPPoE.slash24Cidr('10.255.255.1'), '10.255.255.0/24');
assert.strictEqual(IsolirPPPoE.gatewayAddressCidr('10.255.255.1'), '10.255.255.1/24');

assert.strictEqual(IsolirPPPoE.validateIsolirNetwork({
  localAddr: '10.10.0.1',
  poolRange: '10.10.0.2-10.10.0.254',
  profileName: 'isolir-profile',
  poolName: 'isolir-pool',
  rateLimit: '128k/128k',
}).ok, false, 'WireGuard overlay must be rejected');

assert.strictEqual(IsolirPPPoE.validateIsolirNetwork({
  localAddr: '8.8.8.8',
  poolRange: '8.8.8.9-8.8.8.10',
  profileName: 'isolir-profile',
  poolName: 'isolir-pool',
  rateLimit: '128k/128k',
}).ok, false, 'public IP must be rejected');

assert.ok(IsolirPPPoE.validateIsolirNetwork({
  localAddr: '10.255.255.1',
  poolRange: '10.255.255.1-10.255.255.254',
  profileName: 'isolir-profile',
  poolName: 'isolir-pool',
  rateLimit: '128k/128k',
}).error.includes('tidak boleh masuk'));

assert.ok(IsolirPPPoE.validateIsolirNetwork({
  localAddr: '10.255.255.1',
  poolRange: '10.255.254.2-10.255.254.254',
  profileName: 'isolir-profile',
  poolName: 'isolir-pool',
  rateLimit: '128k/128k',
}).error.includes('/24'));

assert.strictEqual(IsolirPPPoE.validateIsolirNetwork({
  localAddr: '10.255.255.1',
  poolRange: '10.255.255.2-10.255.255.254',
  profileName: 'isolir-profile',
  poolName: 'isolir-pool',
  rateLimit: 'cepat',
}).ok, false);

(async () => {
  const ros7 = new FakeApi({ supportDummy: true });
  const created = await IsolirPPPoE.setupIsolirIp(ros7, fakeSequelize());
  assert.strictEqual(created.success, true, created.error);
  assert.ok(ros7.interfaces.some(i => i.name === 'fiberix-isolir' && i.type === 'dummy'));
  assert.ok(ros7.addresses.some(a => a.address === '10.255.255.1/24' && a.interface === 'fiberix-isolir'));
  assert.ok(ros7.pools.some(p => p.name === 'isolir-pool' && p.ranges === '10.255.255.2-10.255.255.254'));
  assert.ok(ros7.profiles.some(p => p.name === 'isolir-profile' && p['local-address'] === '10.255.255.1'));
  assert.strictEqual(ros7.addresses.length, 1);

  const again = await IsolirPPPoE.setupIsolirIp(ros7, fakeSequelize());
  assert.strictEqual(again.success, true, again.error);
  assert.strictEqual(ros7.interfaces.length, 1);
  assert.strictEqual(ros7.addresses.length, 1);
  assert.strictEqual(ros7.pools.length, 1);
  assert.strictEqual(ros7.profiles.length, 1);

  const ros6 = new FakeApi({ supportDummy: false });
  const bridged = await IsolirPPPoE.setupIsolirIp(ros6, fakeSequelize());
  assert.strictEqual(bridged.success, true, bridged.error);
  assert.ok(ros6.interfaces.some(i => i.name === 'fiberix-isolir' && i.type === 'bridge'));
  assert.ok(bridged.details.some(d => /bridge/i.test(d)));

  const reuse = new FakeApi({
    supportDummy: true,
    interfaces: [{ name: 'loopback', type: 'bridge' }],
    addresses: [{ address: '10.255.255.1/24', interface: 'loopback', '.id': '*9' }]
  });
  const reused = await IsolirPPPoE.setupIsolirIp(reuse, fakeSequelize());
  assert.strictEqual(reused.success, true, reused.error);
  assert.strictEqual(reuse.addresses.length, 1);
  assert.strictEqual(reuse.addresses[0].interface, 'loopback');
  assert.ok(reused.details.some(d => /tidak dipindah/.test(d)));

  const inspect = await IsolirPPPoE.inspectIsolirIp(ros7, fakeSequelize());
  assert.strictEqual(inspect.success, true);
  assert.strictEqual(inspect.ready, true);
  assert.strictEqual(inspect.data.address.address, '10.255.255.1/24');

  const blocked = await IsolirPPPoE.setupIsolirIp(new FakeApi(), fakeSequelize({
    localAddr: '10.10.0.1',
    poolRange: '10.10.0.2-10.10.0.254'
  }));
  assert.strictEqual(blocked.success, false);
  assert.ok(/WireGuard/i.test(blocked.error));

  console.log('isolirIp.test.js OK');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
