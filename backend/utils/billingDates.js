'use strict';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Tanggal jatuh tempo untuk periode (tahun, bulan) dengan hari yang diklem
 * ke hari terakhir bulan itu. Mencegah overflow '2026-02-31' → 3 Maret.
 *
 * @param {number} year
 * @param {number} month  1-12
 * @param {number} day    1-31
 * @returns {string|null} 'YYYY-MM-DD'
 */
function clampPeriodDueDate(year, month, day) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (!y || m < 1 || m > 12 || !d || d < 1) return null;
  const last = new Date(y, m, 0).getDate();
  const clamped = Math.min(d, last);
  return `${y}-${pad2(m)}-${pad2(clamped)}`;
}

/**
 * Due date invoice untuk satu pelanggan di periode target.
 * Hari diambil dari customer.due_date, fallback billing_date, lalu 10.
 */
function periodDueDateForCustomer(customer, targetMonth, targetYear) {
  let day = 10;
  if (customer && customer.due_date) {
    const parts = String(customer.due_date).slice(0, 10).split('-');
    const parsed = parseInt(parts[2], 10);
    if (parsed >= 1 && parsed <= 31) day = parsed;
  } else if (customer && customer.billing_date) {
    const bd = parseInt(customer.billing_date, 10);
    if (bd >= 1 && bd <= 31) day = bd;
  }
  return clampPeriodDueDate(targetYear, targetMonth, day);
}

/**
 * +1 bulan, pertahankan hari, clamp ke akhir bulan tujuan
 * (31 Jan → 28/29 Feb, bukan overflow ke Maret).
 */
function addOneMonthKeepDay(dateInput) {
  if (!dateInput) return null;
  const parts = String(dateInput).slice(0, 10).split('-').map(Number);
  const y = parts[0], m = parts[1], d = parts[2];
  if (!y || !m || !d) return null;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return clampPeriodDueDate(nextY, nextM, d);
}

module.exports = { clampPeriodDueDate, periodDueDateForCustomer, addOneMonthKeepDay };
