'use strict';

/**
 * Arah traffic untuk UI Download/Upload.
 *
 * WAN / pppoe-out: RX router = download, TX router = upload.
 * Tunnel pelanggan (<pppoe-user> / pppoe-in): RX router = upload user,
 * TX router = download user. Setelah customerFacingStat(),
 * rx* = download pelanggan, tx* = upload pelanggan.
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

function customerFacingStat(s, type) {
  if (!s) return s;
  if (!isCustomerTunnelIface(s.name, type)) return s;
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

module.exports = { isCustomerTunnelIface, customerFacingStat };
