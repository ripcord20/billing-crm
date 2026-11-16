'use strict';

/** Relay bawaan — seperti cloud UltraViewer. Pengguna tidak mengisi alamat. */
var DEFAULT_RELAY_HOST = '103.195.65.216:18789';
var DEFAULT_RELAY = 'ws://' + DEFAULT_RELAY_HOST + '/ws';

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_RELAY_HOST: DEFAULT_RELAY_HOST, DEFAULT_RELAY: DEFAULT_RELAY };
}
if (typeof window !== 'undefined') {
  window.FIBERIX_DEFAULT_RELAY = DEFAULT_RELAY_HOST;
}
