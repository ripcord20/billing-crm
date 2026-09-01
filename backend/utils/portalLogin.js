'use strict';

/**
 * Identifier yang boleh dipakai login portal pelanggan:
 * ID pelanggan, nomor HP, atau username PPPoE.
 */
function portalLoginKeys(ident) {
  const v = String(ident || '').trim();
  return [
    { customer_id: v },
    { phone: v },
    { pppoe_username: v },
  ];
}

module.exports = { portalLoginKeys };
