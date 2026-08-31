'use strict';

const { warehouseNextStatus } = require('./PsbFlow');

async function logMove(item, action, toStatus, note, userId, meta) {
  const { WarehouseMovement } = require('../models');
  await WarehouseMovement.create({
    item_id: item.id,
    action,
    from_status: item.status,
    to_status: toStatus,
    note: note || null,
    performed_by: userId || null,
    meta: meta || null
  });
}

async function receive(payload, userId) {
  const { WarehouseItem } = require('../models');
  const serial = payload.serial_number ? String(payload.serial_number).trim() : null;
  if (serial) {
    const dup = await WarehouseItem.findOne({ where: { serial_number: serial } });
    if (dup) return { ok: false, message: `Serial ${serial} sudah ada di gudang` };
  }
  if (payload.item_type !== 'kabel' && !serial && payload.item_type === 'ont') {
    return { ok: false, message: 'ONT wajib punya serial number' };
  }
  const item = await WarehouseItem.create({
    item_type: payload.item_type || 'ont',
    serial_number: serial,
    name: payload.name || (payload.item_type === 'ont' ? `ONT ${serial}` : payload.item_type),
    brand: payload.brand || null,
    model: payload.model || null,
    length_m: payload.length_m || null,
    qty: payload.qty || 1,
    status: 'in_stock',
    notes: payload.notes || null,
    tenant_id: payload.tenant_id || null,
    created_by: userId || null
  });
  await logMove(item, 'in', 'in_stock', 'Masuk gudang', userId);
  return { ok: true, item };
}

async function move(itemId, action, extra = {}, userId) {
  const { WarehouseItem } = require('../models');
  const item = await WarehouseItem.findByPk(itemId);
  if (!item) return { ok: false, message: 'Barang tidak ditemukan' };
  const next = warehouseNextStatus(item.status, action);
  if (!next) return { ok: false, message: `Tidak bisa ${action} dari status ${item.status}` };
  const patch = {
    status: next,
    technician_user_id: extra.technician_user_id !== undefined ? extra.technician_user_id : item.technician_user_id,
    technician_name: extra.technician_name !== undefined ? extra.technician_name : item.technician_name,
    customer_id: extra.customer_id !== undefined ? extra.customer_id : item.customer_id,
    psb_job_id: extra.psb_job_id !== undefined ? extra.psb_job_id : item.psb_job_id,
    ont_device_id: extra.ont_device_id !== undefined ? extra.ont_device_id : item.ont_device_id
  };
  if (action === 'return') {
    patch.technician_user_id = null;
    patch.technician_name = null;
    patch.customer_id = null;
    patch.psb_job_id = null;
  }
  await logMove(item, action, next, extra.note, userId, extra.meta);
  await item.update(patch);
  return { ok: true, item };
}

async function findAvailableOnt(serial, tenantId) {
  const { WarehouseItem } = require('../models');
  const { Op } = require('sequelize');
  const where = {
    item_type: 'ont',
    serial_number: String(serial).trim(),
    status: { [Op.in]: ['in_stock', 'checked_out'] }
  };
  if (tenantId) where.tenant_id = tenantId;
  return WarehouseItem.findOne({ where });
}

module.exports = { receive, move, findAvailableOnt, logMove };
