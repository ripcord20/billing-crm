'use strict';
/**
 * Pastikan satu invoice aktif per (customer_id, period_month, period_year).
 * Idempotent: dedup dulu, baru pasang unique index.
 */
const logger = require('./logger');

const INDEX_NAME = 'uq_invoice_customer_period';

async function indexExists(sequelize, table, name) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(1) AS c FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    { replacements: [table, name] }
  );
  return rows && rows[0] && Number(rows[0].c) > 0;
}

function rankStatus(status) {
  if (status === 'paid') return 0;
  if (status === 'overdue') return 1;
  if (status === 'unpaid') return 2;
  return 3;
}

async function reassignFks(sequelize, fromId, toId) {
  const stmts = [
    'UPDATE payments SET invoice_id=? WHERE invoice_id=?',
    'UPDATE reminder_logs SET invoice_id=? WHERE invoice_id=?',
    'UPDATE collection_assignments SET invoice_id=? WHERE invoice_id=?',
    'UPDATE payment_deferrals SET invoice_id=? WHERE invoice_id=?'
  ];
  for (const sql of stmts) {
    try {
      await sequelize.query(sql, { replacements: [toId, fromId] });
    } catch (_) { /* tabel/kolom mungkin belum ada */ }
  }
}

async function dedupePeriodInvoices(sequelize) {
  const groups = await sequelize.query(
    `SELECT customer_id, period_month, period_year, COUNT(*) AS c
       FROM invoices
      GROUP BY customer_id, period_month, period_year
     HAVING c > 1`,
    { type: sequelize.QueryTypes.SELECT }
  );
  if (!groups.length) return 0;

  let removed = 0;
  for (const g of groups) {
    const rows = await sequelize.query(
      `SELECT id, status FROM invoices
        WHERE customer_id=? AND period_month=? AND period_year=?
        ORDER BY id ASC`,
      {
        replacements: [g.customer_id, g.period_month, g.period_year],
        type: sequelize.QueryTypes.SELECT
      }
    );
    rows.sort((a, b) => rankStatus(a.status) - rankStatus(b.status) || a.id - b.id);
    const survivor = rows[0];
    for (const loser of rows.slice(1)) {
      await reassignFks(sequelize, loser.id, survivor.id);
      await sequelize.query('DELETE FROM invoices WHERE id=?', { replacements: [loser.id] });
      removed++;
    }
  }
  return removed;
}

async function ensureInvoicePeriodUnique(sequelize) {
  if (await indexExists(sequelize, 'invoices', INDEX_NAME)) {
    return { skipped: true, reason: 'index_exists' };
  }

  const removed = await dedupePeriodInvoices(sequelize);
  if (removed > 0) {
    logger.info(`[Billing] Dedup invoice periode: hapus ${removed} duplikat`);
  }

  await sequelize.query(
    `ALTER TABLE invoices ADD UNIQUE INDEX ${INDEX_NAME} (customer_id, period_month, period_year)`
  );
  logger.info(`[Billing] Unique index ${INDEX_NAME} dipasang`);
  return { skipped: false, removed };
}

module.exports = { ensureInvoicePeriodUnique, INDEX_NAME };
