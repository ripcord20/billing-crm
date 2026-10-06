'use strict';

/**
 * Status pelunasan pelanggan untuk badge di modul Customer.
 *
 * Overdue = ada invoice unpaid/overdue yang due_date-nya sudah lewat.
 * Setelah semua invoice lunas, pelanggan TIDAK overdue — meskipun
 * customers.due_date masih tanggal lama (itu yang bikin bingung pelunasan).
 */

function startOfDay(input) {
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDay(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return startOfDay(value);
  }
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function toYmd(value) {
  const d = parseDay(value);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isOpenInvoice(inv) {
  const st = String(inv && inv.status ? inv.status : '').toLowerCase();
  return st === 'unpaid' || st === 'overdue';
}

/**
 * @param {object} opts
 * @param {Array<{status?:string, due_date?:string}>} [opts.unpaidInvoices]
 * @param {string|Date|null} [opts.customerDueDate]
 * @param {Date|string} [opts.today]
 * @returns {{ status: 'overdue'|'unpaid'|'paid'|null, invoice: object|null, dueDate: string|null }}
 */
function computeCustomerDueStatus({ unpaidInvoices = [], customerDueDate = null, today = new Date() } = {}) {
  const todayDate = startOfDay(today);
  const unpaid = (unpaidInvoices || []).filter(isOpenInvoice).slice().sort((a, b) =>
    String(a.due_date || '').localeCompare(String(b.due_date || ''))
  );
  const invoice = unpaid[0] || null;
  if (invoice) {
    const dd = parseDay(invoice.due_date) || parseDay(customerDueDate);
    const status = dd && dd < todayDate ? 'overdue' : 'unpaid';
    return { status, invoice, dueDate: toYmd(invoice.due_date) || toYmd(customerDueDate) };
  }
  // Tidak ada tagihan terbuka = pelunasan selesai (bukan overdue).
  if (customerDueDate) return { status: 'paid', invoice: null, dueDate: toYmd(customerDueDate) };
  return { status: null, invoice: null, dueDate: null };
}

function isDueSoon(dueStatus, dueDate, today = new Date(), withinDays = 3) {
  if (dueStatus !== 'unpaid' || !dueDate) return false;
  const todayDate = startOfDay(today);
  const dd = parseDay(dueDate);
  if (!dd) return false;
  const end = startOfDay(todayDate);
  end.setDate(end.getDate() + withinDays);
  return dd >= todayDate && dd <= end;
}

function serializeOutstanding(inv) {
  if (!inv) return null;
  return {
    id: inv.id,
    invoice_number: inv.invoice_number || null,
    status: inv.status,
    due_date: toYmd(inv.due_date),
    total: inv.total != null ? parseFloat(inv.total) : null,
    period_month: inv.period_month != null ? parseInt(inv.period_month, 10) : null,
    period_year: inv.period_year != null ? parseInt(inv.period_year, 10) : null
  };
}

module.exports = {
  computeCustomerDueStatus,
  isDueSoon,
  serializeOutstanding,
  parseDay,
  toYmd
};
