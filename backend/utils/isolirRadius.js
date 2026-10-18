'use strict';

/** Nilai ENUM isolir_logs.isolir_method — termasuk 'radius'. */
const ISOLIR_METHOD_ENUM_SQL = "ENUM('static','pppoe','hotspot_binding','radius')";

function fullRadiusEnabled(env = process.env) {
  return String(env.FIBERIX_FULL_RADIUS || '') === '1';
}

function detectIsolirMethod(row, env = process.env) {
  const ct = String((row && row.connection_type) || '').toLowerCase();
  const hasStatic = !!(row && row.static_ip);
  const hasPPPoE = !!(row && row.pppoe_username);
  const hasHotspot = ct === 'hotspot' && !!(row.mac_address || hasStatic);
  if (hasHotspot) return 'hotspot_binding';
  if (ct === 'pppoe' && hasPPPoE) return fullRadiusEnabled(env) ? 'radius' : 'pppoe';
  if (ct === 'static' && hasStatic) return 'static';
  if (hasStatic) return 'static';
  if (hasPPPoE) return fullRadiusEnabled(env) ? 'radius' : 'pppoe';
  return 'unknown';
}

/** PPPoE + RADIUS: isolir lewat radcheck Auth-Type Reject, bukan /ppp/secret. */
function pppoeUsesRadiusIsolir(method, radiusOn) {
  return (method === 'pppoe' || method === 'radius') && !!radiusOn;
}

function mikrotikSecretFallbackAllowed(method, radiusOn) {
  return !pppoeUsesRadiusIsolir(method, radiusOn);
}

function canNetworkIsolir(row, method, env = process.env) {
  if (!method || method === 'unknown') return false;
  if (row && row.mikrotik_id) return true;
  return !!(row && row.pppoe_username) &&
    (method === 'pppoe' || method === 'radius') &&
    fullRadiusEnabled(env);
}

module.exports = {
  ISOLIR_METHOD_ENUM_SQL,
  fullRadiusEnabled,
  detectIsolirMethod,
  pppoeUsesRadiusIsolir,
  mikrotikSecretFallbackAllowed,
  canNetworkIsolir
};
