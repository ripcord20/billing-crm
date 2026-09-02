'use strict';

const DEFAULT_WINBOX_PORT = 8291;

function parseWinboxPort(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return DEFAULT_WINBOX_PORT;
  return n;
}

function winboxUrl(host, port) {
  const ip = String(host || '').trim();
  if (!ip) return '';
  return `winbox://${ip}:${parseWinboxPort(port)}`;
}

module.exports = {
  DEFAULT_WINBOX_PORT,
  parseWinboxPort,
  winboxUrl
};
