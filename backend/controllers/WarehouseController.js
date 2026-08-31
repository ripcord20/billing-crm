'use strict';

const { Op } = require('sequelize');
const { applyTenantWhere, stampTenant, getTenantId } = require('../utils/tenantScope');

function denyOtherTenant(req, row) {
  const tid = getTenantId(req);
  return !!(tid && Number(row.tenant_id) !== Number(tid));
}
const stock = require('../services/WarehouseStock');

const INC = () => {
  const { Customer, User, WarehouseMovement } = require('../models');
  return [
    { model: Customer, as: 'customer', attributes: ['id', 'name', 'customer_id'], required: false },
    { model: User, as: 'creator', attributes: ['id', 'name'], required: false }
  ];
};

exports.index = async (req, res) => {
  try {
    const { WarehouseItem } = require('../models');
    const where = applyTenantWhere(req, {});
    if (req.query.status) where.status = req.query.status;
    if (req.query.item_type) where.item_type = req.query.item_type;
    if (req.query.search) {
      const q = `%${req.query.search}%`;
      where[Op.or] = [
        { serial_number: { [Op.like]: q } },
        { name: { [Op.like]: q } },
        { brand: { [Op.like]: q } },
        { model: { [Op.like]: q } }
      ];
    }
    const rows = await WarehouseItem.findAll({
      where,
      include: INC(),
      order: [['created_at', 'DESC']],
      limit: 500
    });
    const stats = { in_stock: 0, checked_out: 0, installed: 0, returned: 0, damaged: 0, ont: 0, adaptor: 0, kabel: 0 };
    for (const r of rows) {
      if (stats[r.status] != null) stats[r.status] += 1;
      if (stats[r.item_type] != null) stats[r.item_type] += 1;
    }
    res.json({ success: true, data: rows, stats });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const result = await stock.receive(stampTenant(req, req.body || {}), req.user?.id);
    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    res.status(201).json({ success: true, data: result.item });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.show = async (req, res) => {
  try {
    const { WarehouseItem, WarehouseMovement, User } = require('../models');
    const item = await WarehouseItem.findByPk(req.params.id, { include: INC() });
    if (!item || denyOtherTenant(req, item)) {
      return res.status(404).json({ success: false, message: 'Barang tidak ditemukan' });
    }
    const moves = await WarehouseMovement.findAll({
      where: { item_id: item.id },
      include: [{ model: User, as: 'actor', attributes: ['id', 'name'], required: false }],
      order: [['created_at', 'DESC']],
      limit: 50
    });
    res.json({ success: true, data: item, movements: moves });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.move = async (req, res) => {
  try {
    const action = req.body.action;
    if (!action) return res.status(400).json({ success: false, message: 'action wajib' });
    const { WarehouseItem } = require('../models');
    const item = await WarehouseItem.findByPk(req.params.id);
    if (!item || denyOtherTenant(req, item)) {
      return res.status(404).json({ success: false, message: 'Barang tidak ditemukan' });
    }
    const result = await stock.move(req.params.id, action, req.body, req.user?.id);
    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    res.json({ success: true, data: result.item });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};
