'use strict';

/**
 * Pencocokan pelanggan ↔ wilayah (tanpa I/O).
 * Dipakai auto-link Modul Wilayah: desa, prefix kode (MDR-), dan alamat.
 */

const KNOWN_CODES = {
  MANDAR: 'MDR',
  KAMPUNGMANDAR: 'MDR',
  LATENG: 'LTG',
  BULUSAN: 'BLSN',
  KARANGREJO: 'KRJ',
  MELAYU: 'MLY',
  KAMPUNGMELAYU: 'MLY',
  UJUNG: 'UJG',
  KAMPUNGUJUNG: 'UJG'
};

function normalize(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/KELURAHAN|\bKEL\b|\bDESA\b|\bKAMPUNG\b/g, ' ')
    .replace(/[^A-Z0-9]/g, '');
}

function compact(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateCode(name) {
  const raw = compact(name);
  const stripped = normalize(name);
  if (KNOWN_CODES[raw]) return KNOWN_CODES[raw];
  if (KNOWN_CODES[stripped]) return KNOWN_CODES[stripped];
  const letters = (stripped || raw).replace(/[^A-Z]/g, '');
  if (!letters) return 'WLH';
  if (letters.length <= 4) return letters;
  const cons = letters.replace(/[AEIOU]/g, '');
  return (cons.slice(0, 4) || letters.slice(0, 4)).toUpperCase();
}

function prettyVillageName(name) {
  const compactName = compact(name);
  if (compactName === 'KAMPUNGMANDAR' || normalize(name) === 'MANDAR') return 'KAMPUNG MANDAR';
  if (compactName === 'KAMPUNGMELAYU' || normalize(name) === 'MELAYU') return 'KAMPUNG MELAYU';
  if (compactName === 'KAMPUNGUJUNG' || normalize(name) === 'UJUNG') return 'KAMPUNG UJUNG';
  const spaced = String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.replace(/\s+/g, ' ').trim().toUpperCase();
}

function customerMatchesWilayah(customer, wilayah) {
  if (!customer || !wilayah) return false;
  const code = String(wilayah.code || '').toUpperCase().trim();
  const custName = String(customer.name || '').toUpperCase().trim();
  if (code && (custName.startsWith(code + '-') || custName.startsWith(code + ' '))) return true;

  const wVillage = normalize(wilayah.village || wilayah.name);
  const wCompact = compact(wilayah.village || wilayah.name);
  const cVillage = normalize(customer.village);
  const cCompact = compact(customer.village);
  if (wVillage && cVillage && (cVillage === wVillage || cVillage.includes(wVillage) || wVillage.includes(cVillage))) {
    return true;
  }
  if (wCompact && cCompact && (cCompact === wCompact || cCompact.includes(wCompact) || wCompact.includes(cCompact))) {
    return true;
  }

  const addr = compact(customer.address);
  if (wCompact && addr && addr.includes(wCompact)) return true;
  if (wVillage && addr && addr.includes(wVillage)) return true;
  return false;
}

function pickWilayahForCustomer(customer, wilayahList) {
  const list = Array.isArray(wilayahList) ? wilayahList : [];
  const prefixed = list.find((w) => {
    const code = String(w.code || '').toUpperCase().trim();
    const custName = String(customer.name || '').toUpperCase().trim();
    return code && (custName.startsWith(code + '-') || custName.startsWith(code + ' '));
  });
  if (prefixed) return prefixed;
  return list.find((w) => customerMatchesWilayah(customer, w)) || null;
}

module.exports = {
  KNOWN_CODES,
  normalize,
  compact,
  generateCode,
  prettyVillageName,
  customerMatchesWilayah,
  pickWilayahForCustomer
};
