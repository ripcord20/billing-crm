'use strict';
/**
 * Pool & list isolir diselaraskan dengan BillingRadius di CORE 1:
 *   PPPoE aktif  → pool BILLINGRADIUS        10.2.64.2-10.2.79.254
 *   Isolir       → pool EXPIRED_BILLINGRADIUS 10.200.200.2-10.200.201.254
 *   List sumber  → EXPIRED = 10.200.200.0/23
 *   List bypass  → EXPIRED_PAGE (halaman bayar / DNS / billing)
 *
 * Halaman isolir Fiberix: GET /p/isolir (publik, tanpa login).
 */
const PPPOE_POOL_NAME  = 'BILLINGRADIUS';
const PPPOE_POOL_RANGE = '10.2.64.2-10.2.79.254';

const ISOLIR_PROFILE_NAME = 'EXPIRED_BILLINGRADIUS';
const ISOLIR_POOL_NAME    = 'EXPIRED_BILLINGRADIUS';
const ISOLIR_POOL_RANGE   = '10.200.200.2-10.200.201.254';
const ISOLIR_LOCAL_ADDR   = '10.200.200.1';
const ISOLIR_RATE_LIMIT   = '128k/128k';

const LIST_ISOLIR = 'EXPIRED';
const LIST_BYPASS = 'EXPIRED_PAGE';
const LIST_CIDR   = '10.200.200.0/23';

const PROXY_PORT = 3128;
const PAGE_PATH  = '/p/isolir';
const PAGE_URL   = 'http://192.168.22.99:3003/p/isolir';

function isolirPppoeDefaults() {
  return {
    pppoePoolName:    PPPOE_POOL_NAME,
    pppoePoolRange:   PPPOE_POOL_RANGE,
    profileName:      ISOLIR_PROFILE_NAME,
    poolName:         ISOLIR_POOL_NAME,
    poolRange:        ISOLIR_POOL_RANGE,
    localAddr:        ISOLIR_LOCAL_ADDR,
    rateLimit:        ISOLIR_RATE_LIMIT,
    listName:         LIST_ISOLIR,
    listBypass:       LIST_BYPASS,
    listCidr:         LIST_CIDR,
    proxyPort:        PROXY_PORT,
    pageUrl:          PAGE_URL,
    pagePath:         PAGE_PATH,
  };
}

function isPlaceholderIsolirRange(range) {
  const s = String(range || '').trim();
  return !s || s.startsWith('10.255.');
}

module.exports = {
  PPPOE_POOL_NAME, PPPOE_POOL_RANGE,
  ISOLIR_PROFILE_NAME, ISOLIR_POOL_NAME, ISOLIR_POOL_RANGE,
  ISOLIR_LOCAL_ADDR, ISOLIR_RATE_LIMIT,
  LIST_ISOLIR, LIST_BYPASS, LIST_CIDR,
  PROXY_PORT, PAGE_PATH, PAGE_URL,
  isolirPppoeDefaults, isPlaceholderIsolirRange,
};
