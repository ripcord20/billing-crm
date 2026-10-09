'use strict';

const MAX_DEFER_DAYS = 365;
const MAX_BULK_ITEMS = 200;
const BULK_METHOD_ALIASES = { ntf: 'transfer', tf: 'transfer', tunai: 'cash' };
const BULK_METHODS = ['cash', 'transfer', 'dana', 'ovo', 'gopay', 'qris', 'field_collection', 'other'];

function canonBulkMethod(method) {
  const key = String(method || '').trim().toLowerCase();
  if (BULK_METHOD_ALIASES[key]) return BULK_METHOD_ALIASES[key];
  if (BULK_METHODS.includes(key)) return key;
  return 'cash';
}

function composeBulkNotes(methodRaw, notes) {
  const n = String(notes || '').trim();
  if (n) return n;
  const raw = String(methodRaw || '').trim().toLowerCase();
  if (raw === 'ntf') return 'Setor massal · NTF';
  if (raw === 'cash' || canonBulkMethod(raw) === 'cash') return 'Setor massal · Cash';
  return 'Setor massal';
}

function toDate(input) {
  if (!input) return new Date();
  if (input instanceof Date) return new Date(input.getTime());
  const s = String(input);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date) {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

function diffDays(later, earlier) {
  return Math.round((startOfDay(later) - startOfDay(earlier)) / 86400000);
}

function todayYmd() {
  return toYmd(new Date());
}

/**
 * Hitung tanggal janji bayar dari durasi (hari), fleksibel 1–365.
 */
function computePromiseDate(durationDays, fromDate) {
  const days = parseInt(durationDays, 10);
  if (!Number.isFinite(days) || days < 1 || days > MAX_DEFER_DAYS) return null;
  const base = toDate(fromDate);
  if (!base) return null;
  const next = startOfDay(base);
  next.setDate(next.getDate() + days);
  return toYmd(next);
}

/**
 * Resolve janji bayar dari tanggal ATAU durasi (tanggal menang jika valid).
 */
function resolvePromiseDate({ promise_date, duration_days }, fromDate) {
  const today = startOfDay(toDate(fromDate) || new Date());
  if (promise_date && /^\d{4}-\d{2}-\d{2}$/.test(String(promise_date))) {
    const d = toDate(promise_date);
    if (!d) return { error: 'Tanggal janji tidak valid' };
    if (startOfDay(d) < today) return { error: 'Tanggal janji tidak boleh di masa lalu' };
    const days = Math.max(1, diffDays(d, today));
    if (days > MAX_DEFER_DAYS) return { error: `Maksimal ${MAX_DEFER_DAYS} hari` };
    return { promise_date: toYmd(d), duration_days: days };
  }
  const computed = computePromiseDate(duration_days, today);
  if (!computed) return { error: `Durasi janji tidak valid (1–${MAX_DEFER_DAYS} hari) atau isi tanggal janji` };
  return { promise_date: computed, duration_days: parseInt(duration_days, 10) };
}

/**
 * Normalisasi payload setor massal.
 */
function normalizeBulkPayload(body) {
  if (!body || typeof body !== 'object') return { error: 'Payload tidak valid' };
  let items = [];
  if (Array.isArray(body.items)) {
    items = body.items.map((it) => {
      const methodRaw = (it && it.method) || body.method || 'cash';
      const noteSrc = it && it.notes != null ? it.notes : body.notes;
      return {
        customer_id: parseInt(it && (it.customer_id || it.id), 10),
        amount: it && it.amount != null ? parseFloat(String(it.amount).replace(/[^\d.]/g, '')) : null,
        period_month: it && it.period_month ? parseInt(it.period_month, 10) : null,
        period_year: it && it.period_year ? parseInt(it.period_year, 10) : null,
        method: canonBulkMethod(methodRaw),
        method_raw: String(methodRaw || '').trim().toLowerCase(),
        notes: composeBulkNotes(methodRaw, noteSrc)
      };
    });
  } else if (Array.isArray(body.customer_ids)) {
    items = body.customer_ids.map((id) => {
      const methodRaw = body.method || 'cash';
      return {
        customer_id: parseInt(id, 10),
        amount: null,
        period_month: null,
        period_year: null,
        method: canonBulkMethod(methodRaw),
        method_raw: String(methodRaw || '').trim().toLowerCase(),
        notes: composeBulkNotes(methodRaw, body.notes)
      };
    });
  }
  items = items.filter((it) => Number.isFinite(it.customer_id) && it.customer_id > 0);
  const seen = new Set();
  items = items.filter((it) => {
    if (seen.has(it.customer_id)) return false;
    seen.add(it.customer_id);
    return true;
  });
  if (!items.length) return { error: 'Pilih minimal 1 pelanggan' };
  if (items.length > MAX_BULK_ITEMS) return { error: `Maksimal ${MAX_BULK_ITEMS} pelanggan per setor` };
  const now = new Date();
  return {
    items,
    method: canonBulkMethod(body.method || 'cash'),
    payment_date: body.payment_date || todayYmd(),
    period_month: parseInt(body.period_month, 10) || (now.getMonth() + 1),
    period_year: parseInt(body.period_year, 10) || now.getFullYear(),
    notes: composeBulkNotes(body.method || 'cash', body.notes),
    send_wa: !!body.send_wa,
    bank: body.bank || '',
    reference_no: body.reference_no || ''
  };
}

module.exports = {
  MAX_DEFER_DAYS,
  MAX_BULK_ITEMS,
  canonBulkMethod,
  composeBulkNotes,
  computePromiseDate,
  resolvePromiseDate,
  normalizeBulkPayload
};
