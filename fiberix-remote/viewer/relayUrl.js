'use strict';

/**
 * Normalisasi alamat relay ke URL WebSocket .../ws
 * Terima: 192.168.1.1:18789 | http://host:18789 | ws://host:18789/ws
 */
function normalizeRelay(raw, locationLike) {
  const loc = locationLike || (typeof location !== 'undefined' ? location : null);
  let v = String(raw || '').trim();
  if (!v && loc && loc.protocol && loc.protocol !== 'file:' && loc.host) {
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + loc.host + '/ws';
  }
  if (!v) return '';
  v = v.replace(/\/+$/, '');
  if (v.startsWith('http://')) v = 'ws://' + v.slice('http://'.length);
  else if (v.startsWith('https://')) v = 'wss://' + v.slice('https://'.length);
  else if (!/^wss?:\/\//i.test(v)) v = 'ws://' + v;
  if (!/\/ws$/i.test(v)) v += '/ws';
  return v;
}

function displayRelay(wsUrl) {
  return String(wsUrl || '')
    .replace(/^wss:\/\//i, '')
    .replace(/^ws:\/\//i, '')
    .replace(/\/ws$/i, '');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeRelay, displayRelay };
}
if (typeof window !== 'undefined') {
  window.normalizeRelay = normalizeRelay;
  window.displayRelay = displayRelay;
}
