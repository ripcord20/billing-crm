'use strict';

const assert = require('assert');
const {
  normalizeIp,
  classifyClientRole,
  classifyCoreAlignment,
  summarizeNetwork
} = require('../utils/radiusAlignment');

assert.strictEqual(normalizeIp('192.168.91.1/24'), '192.168.91.1');
assert.strictEqual(normalizeIp('0.0.0.0'), '');
assert.strictEqual(normalizeIp(''), '');

const fx = new Set(['192.168.22.9']);
const br = new Set(['172.20.1.1']);
assert.strictEqual(classifyClientRole({ address: '192.168.22.9' }, fx, br), 'fiberix');
assert.strictEqual(classifyClientRole({ address: '172.20.1.1' }, fx, br), 'billingradius');
assert.strictEqual(classifyClientRole({ address: '10.1.1.1', comment: 'FIBERIX' }, fx, br), 'fiberix');
assert.strictEqual(classifyClientRole({ address: '10.1.1.1', comment: 'BILLINGRADIUS' }, fx, br), 'billingradius');

const dual = classifyCoreAlignment([
  { address: '172.20.1.1', comment: 'BILLINGRADIUS', timeout: '300ms', srcAddress: '' },
  { address: '192.168.22.9', comment: 'FIBERIX', timeout: '3s', srcAddress: '192.168.91.1' }
], { fiberixHosts: ['192.168.22.9'] });
assert.strictEqual(dual.phase, 'dual_br_first');
assert.strictEqual(dual.status, 'warn');
assert.ok(dual.clients[0].role === 'billingradius');
assert.ok(dual.clients[1].srcPinned);
assert.ok(dual.next.some((s) => /proxy/i.test(s)));

const pinned = classifyCoreAlignment([
  { address: '172.20.1.1', comment: 'BILLINGRADIUS', srcAddress: '192.168.91.1' },
  { address: '192.168.22.9', comment: 'FIBERIX' }
], { fiberixHosts: ['192.168.22.9'] });
assert.strictEqual(pinned.status, 'critical');
assert.ok(pinned.issues.some((s) => /src-address/i.test(s)));

const fxFirst = classifyCoreAlignment([
  { address: '192.168.22.9', comment: 'FIBERIX' },
  { address: '172.20.1.1', comment: 'BILLINGRADIUS' }
], { fiberixHosts: ['192.168.22.9'] });
assert.strictEqual(fxFirst.phase, 'dual_fiberix_first');
assert.strictEqual(fxFirst.status, 'critical');

const onlyFx = classifyCoreAlignment([
  { address: '192.168.22.9', comment: 'FIBERIX' }
], { fiberixHosts: ['192.168.22.9'] });
assert.strictEqual(onlyFx.phase, 'fiberix_only');
assert.strictEqual(onlyFx.status, 'ok');

const onlyBr = classifyCoreAlignment([
  { address: '172.20.1.1', comment: 'BILLINGRADIUS' }
], { fiberixHosts: ['192.168.22.9'] });
assert.strictEqual(onlyBr.phase, 'br_only');
assert.strictEqual(onlyBr.status, 'warn');

const none = classifyCoreAlignment([]);
assert.strictEqual(none.phase, 'none');
assert.strictEqual(none.status, 'critical');

const disabled = classifyCoreAlignment([
  { address: '172.20.1.1', comment: 'BILLINGRADIUS', disabled: true }
]);
assert.strictEqual(disabled.phase, 'none');

const noRadius = classifyCoreAlignment([
  { address: '172.20.1.1', comment: 'BILLINGRADIUS' }
], { fiberixHosts: ['192.168.22.9'], useRadius: false });
assert.strictEqual(noRadius.status, 'critical');
assert.ok(noRadius.issues.some((s) => /use-radius/i.test(s)));

const net = summarizeNetwork([
  { ok: true, status: 'warn', phase: 'dual_br_first', title: 'A', summary: 'B' },
  { ok: true, status: 'critical', phase: 'dual_fiberix_first', title: 'C', summary: 'D' }
]);
assert.strictEqual(net.status, 'critical');
assert.strictEqual(net.phase, 'mixed');

const down = summarizeNetwork([{ ok: false, status: 'warn' }]);
assert.strictEqual(down.phase, 'unreachable');

console.log('✓ RADIUS alignment classifier tests PASS');
