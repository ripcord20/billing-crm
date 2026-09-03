'use strict';

/**
 * Pencocokan nama sesi PPP aktif dengan pppoe_username di billing.
 * Username di router kadang "Rossy@0000273" sementara di DB "Rossy".
 */

function normalizePppoeName(name) {
  return String(name || '').trim().toLowerCase();
}

function sessionLookupKeys(name) {
  const n = normalizePppoeName(name);
  if (!n) return [];
  const keys = [n];
  const at = n.indexOf('@');
  if (at > 0) keys.push(n.slice(0, at));
  return keys;
}

function indexSessionsByName(sessions) {
  const map = {};
  (sessions || []).forEach((s) => {
    sessionLookupKeys(s && s.name).forEach((k) => {
      if (!map[k]) map[k] = s;
    });
    if (s && s.address) map['ip:' + s.address] = s;
  });
  return map;
}

function findSession(sessionByName, pppoeUsername, staticIp) {
  const keys = sessionLookupKeys(pppoeUsername);
  for (let i = 0; i < keys.length; i++) {
    if (sessionByName[keys[i]]) return sessionByName[keys[i]];
  }
  if (staticIp && sessionByName['ip:' + staticIp]) return sessionByName['ip:' + staticIp];
  return null;
}

module.exports = {
  normalizePppoeName,
  sessionLookupKeys,
  indexSessionsByName,
  findSession
};
