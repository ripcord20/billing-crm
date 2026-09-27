'use strict';

/**
 * Arah traffic untuk UI Download/Upload (sudut pelanggan).
 *
 * WAN / uplink / pppoe-out: RX = download, TX = upload.
 * Tunnel pelanggan + port downlink (ether ke switch, sfp DOWNLINK, VLAN GPON):
 *   TX router = download pelanggan, RX router = upload pelanggan.
 * Setelah customerFacingStat(), rx* = download, tx* = upload.
 */

function isCustomerTunnelIface(name, type) {
  const n = String(name || '').toLowerCase();
  const t = String(type || '').toLowerCase();
  if (/-(out)\d*$/.test(n) || t === 'pppoe-out' || /pppoe-out|l2tp-out|pptp-out|sstp-out|ovpn-out/.test(n)) {
    return false;
  }
  if ((n.startsWith('<') && n.endsWith('>')) || t === 'pppoe-in' || t.endsWith('-in')) return true;
  return n.includes('<pppoe') || n.startsWith('pppoe-') || n.startsWith('pppoe<');
}

function isUplinkFacing(name, type, comment) {
  const n = String(name || '').toLowerCase();
  const t = String(type || '').toLowerCase();
  const blob = `${n} ${String(comment || '').toLowerCase()}`;
  if (/-(out)\d*$/.test(n) || t === 'pppoe-out' || /pppoe-out|l2tp-out|pptp-out|sstp-out|ovpn-out/.test(n)) {
    return true;
  }
  return /uplink|\bwan\b|\binet\b|internet|innercity/.test(blob);
}

function isCustomerFacingIface(name, type, comment) {
  if (isUplinkFacing(name, type, comment)) return false;
  if (isCustomerTunnelIface(name, type)) return true;
  const blob = `${String(name || '')} ${String(comment || '')}`.toLowerCase();
  return /downlink|crs\d*|gpon|olt|pelanggan|hsgq|hioso|c-data|cdata|hisos|hisfocus/.test(blob);
}

function customerFacingStat(s, type, comment) {
  if (!s) return s;
  if (!isCustomerFacingIface(s.name, type, comment)) return s;
  return {
    ...s,
    rxBitsPerSecond: s.txBitsPerSecond || 0,
    txBitsPerSecond: s.rxBitsPerSecond || 0,
    rxPacketsPerSecond: s.txPacketsPerSecond || 0,
    txPacketsPerSecond: s.rxPacketsPerSecond || 0,
    fpRxBitsPerSecond: s.fpTxBitsPerSecond || 0,
    fpTxBitsPerSecond: s.fpRxBitsPerSecond || 0,
  };
}

module.exports = {
  isCustomerTunnelIface,
  isUplinkFacing,
  isCustomerFacingIface,
  customerFacingStat,
};
