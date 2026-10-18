'use strict';
const assert = require('assert');
const {
  ISOLIR_METHOD_ENUM_SQL,
  fullRadiusEnabled,
  detectIsolirMethod,
  pppoeUsesRadiusIsolir,
  mikrotikSecretFallbackAllowed,
  canNetworkIsolir
} = require('../utils/isolirRadius');

assert.ok(ISOLIR_METHOD_ENUM_SQL.includes("'radius'"), 'enum harus berisi radius');
assert.ok(ISOLIR_METHOD_ENUM_SQL.includes("'pppoe'"));
assert.ok(ISOLIR_METHOD_ENUM_SQL.includes("'hotspot_binding'"));
assert.ok(!ISOLIR_METHOD_ENUM_SQL.includes("ENUM('static','pppoe','hotspot_binding')") ||
  ISOLIR_METHOD_ENUM_SQL.includes("'radius'"));

assert.strictEqual(fullRadiusEnabled({}), false);
assert.strictEqual(fullRadiusEnabled({ FIBERIX_FULL_RADIUS: '1' }), true);
assert.strictEqual(fullRadiusEnabled({ FIBERIX_FULL_RADIUS: '0' }), false);

assert.strictEqual(
  detectIsolirMethod({ connection_type: 'pppoe', pppoe_username: 'andi' }, { FIBERIX_FULL_RADIUS: '1' }),
  'radius'
);
assert.strictEqual(
  detectIsolirMethod({ connection_type: 'pppoe', pppoe_username: 'andi' }, {}),
  'pppoe'
);
assert.strictEqual(
  detectIsolirMethod({ connection_type: 'hotspot', mac_address: 'AA:BB' }, { FIBERIX_FULL_RADIUS: '1' }),
  'hotspot_binding'
);
assert.strictEqual(
  detectIsolirMethod({ connection_type: 'static', static_ip: '10.1.1.2' }, { FIBERIX_FULL_RADIUS: '1' }),
  'static'
);

assert.strictEqual(pppoeUsesRadiusIsolir('pppoe', true), true);
assert.strictEqual(pppoeUsesRadiusIsolir('radius', true), true);
assert.strictEqual(pppoeUsesRadiusIsolir('pppoe', false), false);
assert.strictEqual(pppoeUsesRadiusIsolir('static', true), false);
assert.strictEqual(mikrotikSecretFallbackAllowed('pppoe', true), false);
assert.strictEqual(mikrotikSecretFallbackAllowed('pppoe', false), true);
assert.strictEqual(mikrotikSecretFallbackAllowed('hotspot_binding', true), true);

assert.strictEqual(
  canNetworkIsolir({ pppoe_username: 'andi' }, 'radius', { FIBERIX_FULL_RADIUS: '1' }),
  true
);
assert.strictEqual(
  canNetworkIsolir({ pppoe_username: 'andi', mikrotik_id: 9 }, 'pppoe', {}),
  true
);
assert.strictEqual(
  canNetworkIsolir({ static_ip: '10.1.1.2' }, 'static', { FIBERIX_FULL_RADIUS: '1' }),
  false,
  'static tanpa MikroTik tidak bisa diisolir'
);

console.log('isolirRadius.test.js ok');
