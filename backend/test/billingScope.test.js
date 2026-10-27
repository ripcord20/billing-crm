'use strict';
/**
 * Filter cakupan generate invoice (pelanggan tertentu / per wilayah).
 * Jalankan: node test/billingScope.test.js
 */
const assert = require('assert');
const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'sequelize') return { Op: { in: Symbol.for('op.in') } };
  return origRequire.apply(this, arguments);
};

const { Op } = require('sequelize');
const { parseIdList, applyCustomerScope } = require('../utils/billingScope');

assert.strictEqual(parseIdList(null), null);
assert.strictEqual(parseIdList(undefined), null);
assert.strictEqual(parseIdList(''), null);
assert.strictEqual(parseIdList([]), null);
assert.strictEqual(parseIdList('0,-1,foo'), null);

assert.deepStrictEqual(parseIdList('1, 2, 2, 3'), [1, 2, 3]);
assert.deepStrictEqual(parseIdList([1, '2', 2, 'x', 0, 4]), [1, 2, 4]);
assert.deepStrictEqual(parseIdList(9), [9]);

const whereAll = applyCustomerScope({ status: 'active' }, {});
assert.deepStrictEqual(whereAll, { status: 'active' });

const whereCust = applyCustomerScope({}, { customerIds: '10,11' });
assert.deepStrictEqual(whereCust.id, { [Op.in]: [10, 11] });
assert.strictEqual(whereCust.wilayah_id, undefined);

const whereArea = applyCustomerScope({ status: 'active' }, { wilayahIds: [3, 3, 5] });
assert.strictEqual(whereArea.status, 'active');
assert.deepStrictEqual(whereArea.wilayah_id, { [Op.in]: [3, 5] });

const whereBoth = applyCustomerScope({}, { customerIds: [1], wilayahIds: [8] });
assert.deepStrictEqual(whereBoth.id, { [Op.in]: [1] });
assert.deepStrictEqual(whereBoth.wilayah_id, { [Op.in]: [8] });

console.log('billingScope.test.js OK');
