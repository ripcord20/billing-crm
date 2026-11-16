'use strict';

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function normalizeNasname(raw) {
  let s = String(raw == null ? '' : raw).trim();
  s = s.replace(/^https?:\/\//i, '');
  s = s.replace(/\/.*$/, '');
  s = s.replace(/:(\d+)$/, '');
  s = s.replace(/\.$/, '');
  return s;
}

function ipv4Part(value) {
  return String(value || '').split('/')[0].trim();
}

function isIpv4Nasname(value) {
  return IPV4.test(ipv4Part(value));
}

function isHostnameNasname(value) {
  const host = ipv4Part(value);
  if (!host || isIpv4Nasname(host)) return false;
  return HOST.test(host);
}

function isValidNasname(value) {
  return isIpv4Nasname(value) || isHostnameNasname(value);
}

function looksLikeDomainVpn(value) {
  return isHostnameNasname(value);
}

function normalizeVpnType(value, nasname, connMode) {
  const s = String(value == null ? '' : value).toLowerCase().trim();
  if (s === 'domain' || s === 'ddns' || s === 'hostddns' || s === 'hostname' || s === 'dns') return 'domain';
  if (s === 'openvpn') return 'openvpn';
  if (s === 'l2tp' || s === 'l2tp/ipsec' || s === 'ipsec') return 'l2tp';
  if (s === 'wireguard' || s === 'wg') return 'wireguard';
  if (connMode === 'vpn' && looksLikeDomainVpn(nasname)) return 'domain';
  if (connMode === 'vpn') return 'wireguard';
  return null;
}

function isDomainVpnType(value) {
  const s = String(value == null ? '' : value).toLowerCase().trim();
  return s === 'domain' || s === 'ddns' || s === 'hostddns' || s === 'hostname';
}

module.exports = {
  normalizeNasname,
  isIpv4Nasname,
  isHostnameNasname,
  isValidNasname,
  looksLikeDomainVpn,
  normalizeVpnType,
  isDomainVpnType
};
