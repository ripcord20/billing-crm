(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.parseOntLabel = api.parseOntLabel;
    root.normalizeOntMac = api.normalizeMac;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GPON_SN_RE = /\b((?:ZTEG|HWTC|FHTT|ALCL|CMSZ|CIGG|SBEL|FHTC)[0-9A-F]{8})\b/i;
  const GPON_LABELED_RE = /\bGPON[\s\-]*SN\s*[:#]?\s*([A-Z0-9]{8,16})/i;
  const DSN_LABELED_RE = /\bD[\-\s]*SN\s*[:#]?\s*([A-Z0-9]{8,})/i;
  const MAC_LABELED_RE = /\bMAC(?:\s*Address)?\s*[:#]?\s*((?:[0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}|[0-9A-Fa-f]{12})\b/i;
  const MAC_COLON_RE = /\b(?:[0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b/;
  const MAC_COMPACT_RE = /\b[0-9A-Fa-f]{12}\b/;

  function normalizeMac(s) {
    const hex = String(s || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    if (hex.length !== 12) return '';
    return hex.match(/.{2}/g).join(':');
  }

  function cleanToken(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function isGponSn(s) {
    return GPON_SN_RE.test(cleanToken(s));
  }

  function isDeviceSn(s) {
    const u = cleanToken(s);
    if (!u || isGponSn(u)) return false;
    if (/^ZTEE/.test(u)) return true;
    if (/^EN[A-Z0-9]{8,}$/.test(u)) return true;
    return false;
  }

  function pickFromList(values, pred) {
    for (const v of values) {
      if (pred(v)) return v;
    }
    return '';
  }

  function parseOntLabel(text, barcodes) {
    const codes = (Array.isArray(barcodes) ? barcodes : [])
      .filter(Boolean)
      .map((c) => String(c).trim())
      .filter(Boolean);
    const raw = String(text || '').replace(/\r/g, '\n');
    const blobs = codes.concat(raw ? [raw] : []);
    const joined = blobs.join('\n');

    let mac = '';
    const macLabeled = joined.match(MAC_LABELED_RE);
    if (macLabeled) mac = normalizeMac(macLabeled[1]);
    if (!mac) {
      const colon = joined.match(MAC_COLON_RE);
      if (colon) mac = normalizeMac(colon[0]);
    }
    if (!mac) {
      const compact = pickFromList(codes, (c) => normalizeMac(c));
      if (compact) mac = normalizeMac(compact);
    }
    if (!mac) {
      const compactTxt = joined.match(MAC_COMPACT_RE);
      if (compactTxt) mac = normalizeMac(compactTxt[0]);
    }

    let sn = '';
    const gponLabeled = joined.match(GPON_LABELED_RE);
    if (gponLabeled && !isDeviceSn(gponLabeled[1])) sn = cleanToken(gponLabeled[1]);
    if (!sn) {
      const token = joined.match(GPON_SN_RE);
      if (token) sn = token[1].toUpperCase();
    }
    if (!sn) {
      const fromCode = pickFromList(codes, (c) => isGponSn(c));
      if (fromCode) sn = cleanToken(fromCode);
    }

    const dsn = joined.match(DSN_LABELED_RE);
    if (dsn && sn && cleanToken(dsn[1]) === sn) sn = '';
    if (sn && isDeviceSn(sn)) sn = '';
    if (sn && mac && sn.replace(/[^0-9A-F]/g, '') === mac.replace(/[^0-9A-F]/g, '')) sn = '';

    return { sn, mac };
  }

  return { parseOntLabel, normalizeMac, isGponSn, isDeviceSn };
});
