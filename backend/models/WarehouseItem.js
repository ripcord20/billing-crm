const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const WarehouseItem = sequelize.define('WarehouseItem', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: true },
    item_type: {
      type: DataTypes.ENUM('ont', 'adaptor', 'kabel', 'other'),
      defaultValue: 'ont',
      allowNull: false
    },
    serial_number: { type: DataTypes.STRING(80), allowNull: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    brand: { type: DataTypes.STRING(80), allowNull: true },
    model: { type: DataTypes.STRING(80), allowNull: true },
    length_m: { type: DataTypes.INTEGER, allowNull: true },
    qty: { type: DataTypes.INTEGER, defaultValue: 1 },
    status: {
      type: DataTypes.ENUM('in_stock', 'checked_out', 'installed', 'returned', 'damaged'),
      defaultValue: 'in_stock',
      allowNull: false
    },
    technician_user_id: { type: DataTypes.INTEGER, allowNull: true },
    technician_name: { type: DataTypes.STRING(150), allowNull: true },
    customer_id: { type: DataTypes.INTEGER, allowNull: true },
    psb_job_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    ont_device_id: { type: DataTypes.INTEGER, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    tableName: 'warehouse_items',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['item_type'] },
      { fields: ['status'] },
      { fields: ['tenant_id'] },
      { fields: ['serial_number'] },
      { fields: ['customer_id'] }
    ]
  });
  return WarehouseItem;
};
