'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  timestampColumnPlan,
  timestampAlterSql,
  columnNamesFromRows
} = require('../utils/ensureTableTimestamps');

assert.deepStrictEqual(timestampColumnPlan(['id', 'amount', 'created_at', 'updated_at']), []);

assert.deepStrictEqual(timestampColumnPlan(['id', 'amount']), [
  { action: 'add', column: 'created_at' },
  { action: 'add', column: 'updated_at' }
]);

assert.deepStrictEqual(timestampColumnPlan(['id', 'createdAt', 'updatedAt']), [
  { action: 'rename', from: 'createdAt', to: 'created_at' },
  { action: 'rename', from: 'updatedAt', to: 'updated_at' }
]);

assert.deepStrictEqual(timestampColumnPlan(['id', 'created_at', 'updatedAt']), [
  { action: 'rename', from: 'updatedAt', to: 'updated_at' }
]);

const addSql = timestampAlterSql('commission_payments', { action: 'add', column: 'created_at' });
assert.ok(addSql.includes('ADD COLUMN `created_at`'));
assert.ok(addSql.includes('commission_payments'));
assert.ok(!addSql.includes('; DROP'));

const renameSql = timestampAlterSql('commission_payments', { action: 'rename', from: 'createdAt', to: 'created_at' });
assert.ok(renameSql.includes('CHANGE COLUMN `createdAt` `created_at`'));

assert.deepStrictEqual(
  columnNamesFromRows([{ n: 'created_at' }, { COLUMN_NAME: 'updated_at' }]),
  ['created_at', 'updated_at']
);

const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.ok(server.includes('ensureUnderscoredTimestamps'), 'boot memastikan timestamps commission_payments');
assert.ok(server.includes("ensureUnderscoredTimestamps(db.sequelize, 'commission_payments')"));

const svc = fs.readFileSync(path.join(__dirname, '../services/CollectionService.js'), 'utf8');
assert.ok(!/attributes:\s*\[[^\]]*createdAt/.test(svc), 'collectorReport tidak SELECT createdAt yang bisa pecah');

const ctrl = fs.readFileSync(path.join(__dirname, '../controllers/CollectionController.js'), 'utf8');
assert.ok(ctrl.includes('CommissionPayment.create'), 'Tandai Dibayar menulis commission_payments');

console.log('ensureTableTimestamps.test.js OK');
