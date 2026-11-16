'use strict';

function normalizeConnMode(value) {
  const s = String(value == null ? '' : value).toLowerCase().trim();
  if (s === 'vpn' || s === 'wireguard' || s === 'tunnel' || s === 'wg') return 'vpn';
  if (
    s === 'public'
    || s === 'ip'
    || s === 'ip_public'
    || s === 'ip-public'
    || s === 'ip-publik'
    || s === 'ip publik'
    || s === 'publik'
  ) return 'public';
  if (s === 'lan' || s === 'local' || s === 'langsung' || s === 'direct') return 'lan';
  return 'lan';
}

function connModeLabel(value) {
  const m = normalizeConnMode(value);
  if (m === 'vpn') return 'VPN';
  if (m === 'public') return 'IP Publik';
  return 'LAN';
}

function isVpnConnMode(value) {
  return normalizeConnMode(value) === 'vpn';
}

module.exports = {
  normalizeConnMode,
  connModeLabel,
  isVpnConnMode
};
