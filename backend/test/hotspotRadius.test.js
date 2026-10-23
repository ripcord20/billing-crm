'use strict';
/**
 * Hotspot full RADIUS — mapping, collision guard, no dual-write ke /ip/hotspot/user.
 * Jalankan: node backend/test/hotspotRadius.test.js
 */
const assert = require('assert');
const {
  ISOLIR,
  isIsolirHotspotUser,
  isIsolirHotspotProfile,
  parseMtTimeToSeconds,
  formatSecondsToMt,
  mapUserToRadiusAttrs,
  mergeRadiusService,
  shouldAddHotspotToRadiusClient,
  canEnableHotspotRadius,
  mergeUsage,
  toApiUser,
  collisionError,
  normalizeUserPayload,
  normalizeVoucherCharset,
  clampVoucherLength,
  randomVoucherToken,
  normalizeVoucherPrefix,
  parseSamePassword,
  buildVoucherUsername
} = require('../utils/hotspotRadius');
const HotspotRadiusStore = require('../services/HotspotRadiusStore');
const HotspotService = require('../services/HotspotService');

// ── helpers ──────────────────────────────────────────────────
assert.strictEqual(isIsolirHotspotUser({ name: 'isolir-guest' }), true);
assert.strictEqual(isIsolirHotspotUser({ profile: 'flaynet-isolir-user' }), true);
assert.strictEqual(isIsolirHotspotUser({ comment: 'FLAYNET-ISOLIR-HS-TAG' }), true);
assert.strictEqual(isIsolirHotspotUser({ name: 'vc-abc', profile: '1hari' }), false);
assert.strictEqual(isIsolirHotspotProfile({ name: 'flaynet-isolir-profile' }), true);
assert.strictEqual(isIsolirHotspotProfile({ htmlDirectory: 'flaynet-isolir' }), true);
assert.strictEqual(isIsolirHotspotProfile({ name: 'hsprof-wlan1' }), false);
assert.ok(ISOLIR.user === 'isolir-guest');

assert.strictEqual(parseMtTimeToSeconds('1d'), 86400);
assert.strictEqual(parseMtTimeToSeconds('1h30m'), 5400);
assert.strictEqual(parseMtTimeToSeconds('7d'), 604800);
assert.strictEqual(parseMtTimeToSeconds(''), 0);
assert.strictEqual(formatSecondsToMt(86400), '1d');
assert.strictEqual(formatSecondsToMt(90), '1m30s');
assert.strictEqual(formatSecondsToMt(0), '0s');

const mapped = mapUserToRadiusAttrs({
  name: 'vc-abc',
  password: 'secret',
  profile: '1hari',
  limitUptime: '1d',
  limitBytesTotal: 1048576,
  macAddress: 'AA:BB:CC:DD:EE:FF',
  disabled: false
});
assert.strictEqual(mapped.username, 'vc-abc');
assert.strictEqual(mapped.groupname, '1hari');
assert.ok(mapped.checks.some((c) => c.attribute === 'Cleartext-Password' && c.value === 'secret'));
assert.ok(mapped.checks.some((c) => c.attribute === 'Calling-Station-Id' && c.op === '=='));
assert.ok(!mapped.checks.some((c) => c.attribute === 'Auth-Type'));
assert.ok(!mapped.checks.some((c) => /^Fiberix-/.test(c.attribute)), 'jangan taruh check attr kustom');
assert.ok(mapped.replies.some((r) => r.attribute === 'Mikrotik-Group' && r.value === '1hari'));
assert.ok(mapped.replies.some((r) => r.attribute === 'Session-Timeout' && r.value === '86400'));
assert.ok(mapped.replies.some((r) => r.attribute === 'Mikrotik-Total-Limit' && r.value === '1048576'));

const disabledMap = mapUserToRadiusAttrs({ name: 'vc-x', password: 'p', disabled: true, profile: '1hari' });
assert.ok(disabledMap.checks.some((c) => c.attribute === 'Auth-Type' && c.value === 'Reject'));

assert.strictEqual(mergeRadiusService('ppp'), 'ppp,hotspot');
assert.strictEqual(mergeRadiusService('ppp,hotspot'), 'ppp,hotspot');
assert.strictEqual(shouldAddHotspotToRadiusClient({ service: 'ppp' }), true);
assert.strictEqual(shouldAddHotspotToRadiusClient({ service: 'ppp,hotspot' }), false);
assert.strictEqual(shouldAddHotspotToRadiusClient({ service: 'login' }), false, 'jangan sentuh entry RADIUS non-PPP');
assert.strictEqual(
  shouldAddHotspotToRadiusClient({ service: 'ppp', comment: 'BILLINGRADIUS' }),
  false,
  'jangan ubah client sewa BillingRadius'
);
assert.strictEqual(canEnableHotspotRadius([{ service: 'ppp' }]), true);
assert.strictEqual(canEnableHotspotRadius([{ service: 'login' }]), false);
assert.strictEqual(canEnableHotspotRadius([{ service: 'ppp', comment: 'BILLINGRADIUS' }]), false);
assert.strictEqual(canEnableHotspotRadius([]), false);

assert.strictEqual(normalizeVoucherCharset('az'), 'az');
assert.strictEqual(normalizeVoucherCharset('nope'), 'azAZ09');
assert.strictEqual(clampVoucherLength(3, 'az'), 6);
assert.strictEqual(clampVoucherLength(12, 'az'), 10);
assert.strictEqual(clampVoucherLength(6, '09'), 9);
assert.strictEqual(randomVoucherToken(6, 'az', () => 0), 'aaaaaa');
assert.ok(/^[0-9]{9}$/.test(randomVoucherToken(4, '09')));
assert.ok(/^[A-Z]{6}$/.test(randomVoucherToken(6, 'AZ', () => 0)));
assert.strictEqual(normalizeVoucherPrefix(' vc-1 '), 'vc1');
assert.strictEqual(normalizeVoucherPrefix(''), '');
assert.strictEqual(buildVoucherUsername('vc', 'a8k2p1'), 'vca8k2p1');
assert.strictEqual(buildVoucherUsername('', 'a8k2p1'), 'a8k2p1');
assert.strictEqual(parseSamePassword('same'), true);
assert.strictEqual(parseSamePassword('diff'), false);
assert.strictEqual(parseSamePassword(true), true);

const usage = mergeUsage({ bytesIn: 10, bytesOut: 2, uptimeSec: 30 }, { bytesIn: 50, bytesOut: 1, uptime: '1m' });
assert.strictEqual(usage.bytesIn, 50);
assert.strictEqual(usage.uptimeSec, 60);

const api = toApiUser({
  id: 9, username: 'vc-a', password: 'pw', profile: '1hari', server: 'all',
  address: '', mac_address: '', limit_uptime: '1d', limit_bytes_in: 0,
  limit_bytes_out: 0, limit_bytes_total: 0, disabled: 0, comment: 'Generated 01/01/2026'
}, usage);
assert.strictEqual(api.id, '9');
assert.strictEqual(api.name, 'vc-a');
assert.strictEqual(api.bytesIn, 50);
assert.match(collisionError('andi').message, /PPPoE/);

const payload = normalizeUserPayload({ name: 'vc-z', password: 'x', profile: '1jam' }, null);
assert.strictEqual(payload.username, 'vc-z');
assert.strictEqual(payload.profile, '1jam');

// ── in-memory RADIUS + model ─────────────────────────────────
function memoryModel(seed = []) {
  let rows = seed.map((r, i) => ({ id: r.id || i + 1, ...r }));
  let seq = rows.reduce((m, r) => Math.max(m, r.id || 0), 0);
  const wrap = (r) => {
    const obj = { ...r };
    obj.update = async (fields) => {
      Object.assign(obj, fields);
      const i = rows.findIndex((x) => x.id === obj.id);
      if (i >= 0) rows[i] = { ...rows[i], ...fields, id: obj.id };
      return obj;
    };
    obj.destroy = async () => { rows = rows.filter((x) => x.id !== obj.id); };
    return obj;
  };
  return {
    findAll: async ({ where, attributes } = {}) => {
      let list = rows;
      if (where && where.profile) list = list.filter((r) => r.profile === where.profile);
      if (where && where.username) list = list.filter((r) => r.username === where.username);
      if (attributes && attributes[0] === 'username') return list.map((r) => ({ username: r.username }));
      return list.map(wrap);
    },
    findByPk: async (id) => {
      const r = rows.find((x) => x.id === Number(id));
      return r ? wrap(r) : null;
    },
    findOne: async ({ where }) => {
      const r = rows.find((x) => x.username === where.username);
      return r ? wrap(r) : null;
    },
    create: async (fields) => {
      seq += 1;
      const row = { id: seq, ...fields };
      rows.push(row);
      return wrap(row);
    }
  };
}

function memoryRadius(extraCheckUsers = []) {
  const tables = {
    radcheck: extraCheckUsers.map((u, i) => ({
      id: i + 1, username: u, attribute: 'Cleartext-Password', op: ':=', value: 'pppoe-secret'
    })),
    radreply: [],
    radusergroup: [],
    radacct: []
  };
  let id = 100;
  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('CREATE TABLE')) return [[]];
    if (s.startsWith('SELECT id FROM radcheck WHERE username')) {
      return [tables.radcheck.filter((r) => r.username === params[0]).slice(0, 1)];
    }
    if (s.startsWith('DELETE FROM radcheck')) {
      tables.radcheck = tables.radcheck.filter((r) => r.username !== params[0]);
      return [[]];
    }
    if (s.startsWith('DELETE FROM radreply')) {
      tables.radreply = tables.radreply.filter((r) => r.username !== params[0]);
      return [[]];
    }
    if (s.startsWith('DELETE FROM radusergroup')) {
      tables.radusergroup = tables.radusergroup.filter((r) => r.username !== params[0]);
      return [[]];
    }
    if (s.startsWith('INSERT INTO radcheck')) {
      tables.radcheck.push({ id: id++, username: params[0], attribute: params[1], op: params[2], value: params[3] });
      return [[]];
    }
    if (s.startsWith('INSERT INTO radreply')) {
      tables.radreply.push({ id: id++, username: params[0], attribute: params[1], op: params[2], value: params[3] });
      return [[]];
    }
    if (s.startsWith('INSERT INTO radusergroup')) {
      tables.radusergroup.push({ id: id++, username: params[0], groupname: params[1], priority: params[2] });
      return [[]];
    }
    if (s.includes('FROM radacct')) {
      const names = params.slice();
      const grouped = {};
      for (const row of tables.radacct) {
        if (!names.includes(row.username)) continue;
        if (!grouped[row.username]) grouped[row.username] = { username: row.username, uptime_sec: 0, bytes_in: 0, bytes_out: 0 };
        grouped[row.username].uptime_sec += row.acctsessiontime || 0;
        grouped[row.username].bytes_in += row.acctinputoctets || 0;
        grouped[row.username].bytes_out += row.acctoutputoctets || 0;
      }
      return [Object.values(grouped)];
    }
    throw new Error('unhandled sql: ' + s);
  }
  return { query, tables };
}

async function testStoreCollisionAndProvision() {
  const rad = memoryRadius(['andi-pppoe']);
  const store = new HotspotRadiusStore({ query: rad.query, model: memoryModel() });

  await assert.rejects(() => store.create({ name: 'andi-pppoe', password: 'x', profile: '1hari' }), /PPPoE|bukan user hotspot/);
  assert.strictEqual(rad.tables.radcheck.filter((r) => r.username === 'andi-pppoe').length, 1, 'PPPoE radcheck tidak diubah');
  assert.strictEqual(rad.tables.radcheck.find((r) => r.username === 'andi-pppoe').value, 'pppoe-secret');

  await assert.rejects(() => store.create({ name: 'isolir-guest', password: 'x' }), /isolir-guest/);

  const row = await store.create({
    name: 'vc-ok', password: 'pwd', profile: '1hari', limitUptime: '1d', comment: 'Generated 01/01/2026'
  });
  assert.ok(row.id);
  assert.ok(rad.tables.radcheck.some((r) => r.username === 'vc-ok' && r.attribute === 'Cleartext-Password'));
  assert.ok(rad.tables.radreply.some((r) => r.username === 'vc-ok' && r.attribute === 'Mikrotik-Group' && r.value === '1hari'));
  assert.ok(rad.tables.radusergroup.some((r) => r.username === 'vc-ok' && r.groupname === '1hari'));

  await store.setDisabled(row.id, true);
  assert.ok(rad.tables.radcheck.some((r) => r.username === 'vc-ok' && r.attribute === 'Auth-Type' && r.value === 'Reject'));
  assert.ok(rad.tables.radcheck.some((r) => r.username === 'vc-ok' && r.attribute === 'Cleartext-Password'), 'password tetap saat disable');

  await store.setDisabled(row.id, false);
  assert.ok(!rad.tables.radcheck.some((r) => r.username === 'vc-ok' && r.attribute === 'Auth-Type'));

  await store.remove(row.id);
  assert.ok(!rad.tables.radcheck.some((r) => r.username === 'vc-ok'));
  assert.ok(!rad.tables.radreply.some((r) => r.username === 'vc-ok'));
  assert.strictEqual(rad.tables.radcheck.filter((r) => r.username === 'andi-pppoe').length, 1);
}

async function testHotspotServiceNoDualWrite() {
  HotspotService.resetHotspotRadiusCacheForTests();
  const rad = memoryRadius(['andi-pppoe']);
  const store = new HotspotRadiusStore({ query: rad.query, model: memoryModel() });
  const calls = [];
  const state = {
    users: [
      { '.id': '*10', name: 'vc-old', password: 'a1', profile: '1hari', comment: 'Generated 02/02/2026', disabled: 'false' },
      { '.id': '*11', name: 'isolir-guest', password: 'isolir-guest', profile: 'flaynet-isolir-user', comment: 'FLAYNET-ISOLIR-HS-TAG' }
    ]
  };
  const mt = {
    host: '10.1.1.1',
    deviceId: 7,
    get: async (path) => {
      calls.push(['GET', path]);
      if (path === '/radius') return [{ '.id': '*r1', service: 'ppp' }];
      if (path === '/ip/hotspot/profile') {
        return [
          { '.id': '*p1', name: 'hsprof', 'html-directory': 'hotspot', 'use-radius': 'no' },
          { '.id': '*p2', name: 'flaynet-isolir-profile', 'html-directory': 'flaynet-isolir', 'use-radius': 'no' }
        ];
      }
      if (path === '/ip/hotspot/user') return state.users;
      if (path === '/ip/hotspot/active') return [];
      return [];
    },
    patch: async (path, body) => { calls.push(['PATCH', path, body]); },
    put: async (path, body) => { calls.push(['PUT', path, body]); },
    delete: async (path) => {
      calls.push(['DELETE', path]);
      state.users = state.users.filter((u) => `/ip/hotspot/user/${u['.id']}` !== path);
    },
    post: async (path, body) => { calls.push(['POST', path, body]); }
  };

  const svc = new HotspotService(mt, { radiusStore: store });
  const users = await svc.getUsers();
  const names = users.map((u) => u.name);
  assert.ok(names.includes('vc-old'), 'voucher lokal diimpor ke RADIUS');
  assert.ok(!names.includes('isolir-guest'), 'isolir-guest tidak dipindah ke RADIUS');
  assert.ok(!state.users.some((u) => u.name === 'vc-old'), 'voucher lokal dihapus dari MikroTik');
  assert.ok(state.users.some((u) => u.name === 'isolir-guest'), 'isolir-guest tetap di MikroTik');

  const radiusPatch = calls.filter((c) => c[0] === 'PATCH' && String(c[1]).startsWith('/radius/'));
  assert.strictEqual(radiusPatch.length, 1);
  assert.strictEqual(radiusPatch[0][2].service, 'ppp,hotspot');

  const isolirProfilePatch = calls.filter((c) => c[0] === 'PATCH' && String(c[1]).includes('*p2'));
  assert.strictEqual(isolirProfilePatch.length, 0, 'profile isolir tidak di-set use-radius');

  const hsProfilePatch = calls.filter((c) => c[0] === 'PATCH' && String(c[1]).includes('*p1'));
  assert.ok(hsProfilePatch.some((c) => c[2]['use-radius'] === 'yes'));

  const created = await svc.createUser({ name: 'vc-new', password: 'zz', profile: '1hari' });
  assert.strictEqual(created.name, 'vc-new');
  const putUser = calls.filter((c) => c[0] === 'PUT' && String(c[1]).startsWith('/ip/hotspot/user'));
  assert.strictEqual(putUser.length, 0, 'createUser tidak dual-write ke /ip/hotspot/user');

  const gen = await svc.generateVouchers({ count: 2, profile: '1hari', prefix: 'vc', passwordLength: 4 });
  assert.strictEqual(gen.success, 2);
  assert.notStrictEqual(gen.vouchers[0].username, gen.vouchers[1].username, 'tiap voucher username unik');
  assert.ok(gen.vouchers[0].username.startsWith('vc'));
  assert.notStrictEqual(gen.vouchers[0].username, gen.vouchers[0].password, 'default username ≠ password');
  assert.strictEqual(calls.filter((c) => c[0] === 'PUT' && String(c[1]).startsWith('/ip/hotspot/user')).length, 0);

  const genSame = await svc.generateVouchers({
    count: 2, profile: '1hari', prefix: 'ab', passwordLength: 6, samePassword: true
  });
  assert.strictEqual(genSame.success, 2);
  assert.ok(genSame.vouchers.every((v) => v.username === v.password), 'username = password');
  assert.notStrictEqual(genSame.vouchers[0].username, genSame.vouchers[1].username);

  await assert.rejects(
    () => svc.createUser({ name: 'andi-pppoe', password: 'x', profile: '1hari' }),
    /PPPoE|bukan user hotspot/
  );
  assert.strictEqual(rad.tables.radcheck.find((r) => r.username === 'andi-pppoe').value, 'pppoe-secret');
}

async function testNoRadiusClientLeavesIsolirAlone() {
  HotspotService.resetHotspotRadiusCacheForTests();
  const store = new HotspotRadiusStore({ query: memoryRadius().query, model: memoryModel() });
  const mt = {
    host: '10.2.2.2',
    get: async (path) => {
      if (path === '/radius') return [];
      if (path === '/ip/hotspot/profile') return [{ '.id': '*iso', name: 'flaynet-isolir-profile', 'html-directory': 'flaynet-isolir' }];
      return [];
    },
    patch: async () => { throw new Error('should not patch'); },
    put: async () => { throw new Error('should not put'); },
    delete: async () => { throw new Error('should not delete'); }
  };
  const svc = new HotspotService(mt, { radiusStore: store });
  const listed = await svc.getUsers();
  assert.deepStrictEqual(listed, [], 'list tidak boleh error kalau router belum punya /radius');
  await assert.rejects(() => svc.createUser({ name: 'vc-x', password: 'p' }), /RADIUS client belum ada/);
}

(async () => {
  await testStoreCollisionAndProvision();
  await testHotspotServiceNoDualWrite();
  await testNoRadiusClientLeavesIsolirAlone();
  console.log('hotspotRadius.test.js OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
