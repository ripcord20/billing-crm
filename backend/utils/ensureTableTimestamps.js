'use strict';

/**
 * Pastikan tabel punya kolom created_at / updated_at (underscored).
 *
 * Tabel lama kadang dibuat tanpa timestamps, atau dengan camelCase
 * (createdAt/updatedAt). Sequelize timestamps:true + underscored:true
 * SELECT created_at → "Unknown column 'created_at' in 'SELECT'".
 */

function timestampColumnPlan(existingColumns) {
  const have = new Set((existingColumns || []).map((c) => String(c)));
  const stmts = [];
  for (const [snake, camel] of [['created_at', 'createdAt'], ['updated_at', 'updatedAt']]) {
    if (have.has(snake)) continue;
    if (have.has(camel)) {
      stmts.push({ action: 'rename', from: camel, to: snake });
      have.add(snake);
      continue;
    }
    stmts.push({ action: 'add', column: snake });
    have.add(snake);
  }
  return stmts;
}

function timestampAlterSql(table, stmt) {
  const t = String(table).replace(/[^A-Za-z0-9_]/g, '');
  if (stmt.action === 'rename') {
    const from = String(stmt.from).replace(/[^A-Za-z0-9_]/g, '');
    const to = String(stmt.to).replace(/[^A-Za-z0-9_]/g, '');
    return `ALTER TABLE \`${t}\` CHANGE COLUMN \`${from}\` \`${to}\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP`;
  }
  const col = String(stmt.column).replace(/[^A-Za-z0-9_]/g, '');
  return `ALTER TABLE \`${t}\` ADD COLUMN \`${col}\` DATETIME NULL DEFAULT CURRENT_TIMESTAMP`;
}

function columnNamesFromRows(rows) {
  return (rows || []).map((r) => r.n || r.N || r.column_name || r.COLUMN_NAME).filter(Boolean);
}

async function ensureUnderscoredTimestamps(sequelize, table) {
  const [rows] = await sequelize.query(
    `SELECT column_name AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ?`,
    { replacements: [table] }
  );
  const cols = columnNamesFromRows(rows);
  if (!cols.length) return { skipped: true, added: [] };
  const plan = timestampColumnPlan(cols);
  for (const stmt of plan) {
    await sequelize.query(timestampAlterSql(table, stmt));
  }
  return { skipped: false, added: plan };
}

module.exports = {
  timestampColumnPlan,
  timestampAlterSql,
  columnNamesFromRows,
  ensureUnderscoredTimestamps
};
