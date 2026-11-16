'use strict';

/**
 * Sisa hutang / piutang dari catatan cicilan terpisah.
 *
 * Cicilan dicatat sebagai baris baru (kategori/deskripsi mengandung "cicil"),
 * bukan pengurangan amount pinjaman. Nama pihak bisa beda ejaan
 * ("HARIS" vs "PINJAMAN HARIS") jadi dikelompokkan setelah dinormalisasi.
 */

const CICIL_RE = /\bcicil(?:an)?\b/i;
const NOISE_RE = /\b(pinjaman|cicil(?:an)?(?:\s+hutang)?|hutang|piutang|bank|vendor|kredit)\b/gi;

const DEBT_TYPES = new Set(['hutang', 'piutang']);

function isDebtType(type) {
  return DEBT_TYPES.has(String(type || ''));
}

function toNum(n) {
  const v = parseFloat(n);
  return Number.isFinite(v) ? v : 0;
}

function toId(id) {
  const n = parseInt(id, 10);
  return Number.isFinite(n) ? n : id;
}

function isInstallment(row) {
  if (!row || !isDebtType(row.type)) return false;
  const blob = `${row.category || ''} ${row.description || ''} ${row.notes || ''}`;
  return CICIL_RE.test(blob);
}

function normalizeParty(s) {
  return String(s || '')
    .toLowerCase()
    .replace(NOISE_RE, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function debtGroupKey(row) {
  if (!row || !isDebtType(row.type)) return '';
  const fromParty = normalizeParty(row.party_name);
  if (fromParty) return `${row.type}:${fromParty}`;
  const fromDesc = normalizeParty(row.description);
  if (fromDesc) return `${row.type}:${fromDesc}`;
  const fromCat = normalizeParty(row.category);
  if (fromCat) return `${row.type}:${fromCat}`;
  return `${row.type}:id-${toId(row.id)}`;
}

function groupDebts(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!row || !isDebtType(row.type)) continue;
    const key = debtGroupKey(row);
    if (!groups.has(key)) {
      groups.set(key, { key, type: row.type, principals: [], installments: [] });
    }
    const g = groups.get(key);
    if (isInstallment(row)) g.installments.push(row);
    else g.principals.push(row);
  }
  return groups;
}

function summarizeGroup(g) {
  const principalAmount = g.principals.reduce((s, r) => s + toNum(r.amount), 0);
  const paidAmount = g.installments.reduce((s, r) => s + toNum(r.amount), 0);
  const hasPrincipal = g.principals.length > 0;
  const allPrincipalsLunas = hasPrincipal && g.principals.every((r) => r.status === 'lunas');
  const remaining = !hasPrincipal || allPrincipalsLunas
    ? 0
    : Math.max(0, principalAmount - paidAmount);
  return {
    principal_amount: principalAmount,
    paid_amount: paidAmount,
    remaining_amount: remaining,
    is_open: hasPrincipal && remaining > 0 && !allPrincipalsLunas
  };
}

function remainingById(rows) {
  const groups = groupDebts(rows);
  const map = new Map();
  for (const g of groups.values()) {
    const sum = summarizeGroup(g);
    const extras = {
      principal_amount: sum.principal_amount,
      paid_amount: sum.paid_amount,
      remaining_amount: sum.remaining_amount
    };
    for (const r of g.principals) {
      map.set(toId(r.id), Object.assign({}, extras, { is_installment: false }));
    }
    for (const r of g.installments) {
      map.set(toId(r.id), Object.assign({}, extras, { is_installment: true }));
    }
  }
  return map;
}

function attachRemaining(pageRows, allDebtRows) {
  const byId = remainingById(allDebtRows);
  return (pageRows || []).map((row) => {
    const json = row && typeof row.toJSON === 'function' ? row.toJSON() : Object.assign({}, row);
    const extra = byId.get(toId(json.id));
    if (!extra) return json;
    return Object.assign({}, json, extra);
  });
}

function computeOutstanding(allDebtRows) {
  const groups = groupDebts(allDebtRows);
  const out = {
    hutang: { remaining: 0, count: 0 },
    piutang: { remaining: 0, count: 0 }
  };
  for (const g of groups.values()) {
    const sum = summarizeGroup(g);
    if (!sum.is_open) continue;
    const bucket = out[g.type];
    if (!bucket) continue;
    bucket.remaining += sum.remaining_amount;
    bucket.count += 1;
  }
  return out;
}

function suggestPartyName(draft, allDebtRows) {
  if (!draft || !isInstallment(draft) || String(draft.party_name || '').trim()) {
    return draft && draft.party_name ? draft.party_name : null;
  }
  const key = debtGroupKey(draft);
  const match = (allDebtRows || []).find((r) => (
    r && !isInstallment(r) && debtGroupKey(r) === key
  ));
  if (!match) return null;
  return match.party_name || null;
}

module.exports = {
  isDebtType,
  isInstallment,
  normalizeParty,
  debtGroupKey,
  remainingById,
  attachRemaining,
  computeOutstanding,
  suggestPartyName
};
