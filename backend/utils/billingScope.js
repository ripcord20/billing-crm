'use strict';

const { Op } = require('sequelize');

/**
 * Parse daftar ID dari body/query: array, "1,2,3", atau nilai tunggal.
 * Buang duplikat, nol, NaN, dan negatif. Null = tidak ada filter.
 */
function parseIdList(raw) {
  if (raw == null || raw === '') return null;
  const arr = Array.isArray(raw) ? raw : String(raw).split(',');
  const ids = [...new Set(arr.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  return ids.length ? ids : null;
}

/**
 * Tambahkan filter pelanggan tertentu dan/atau wilayah operasional (kampung)
 * ke objek `where` Sequelize. Mutasi in-place, return `where` yang sama.
 */
function applyCustomerScope(where, opts = {}) {
  const ids = parseIdList(opts.customerIds);
  const wids = parseIdList(opts.wilayahIds);
  if (ids) where.id = { [Op.in]: ids };
  if (wids) where.wilayah_id = { [Op.in]: wids };
  return where;
}

module.exports = { parseIdList, applyCustomerScope };
