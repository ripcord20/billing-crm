const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const WarehouseMovement = sequelize.define('WarehouseMovement', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    item_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    action: {
      type: DataTypes.ENUM('in', 'checkout', 'install', 'return', 'damage'),
      allowNull: false
    },
    from_status: { type: DataTypes.STRING(20), allowNull: true },
    to_status: { type: DataTypes.STRING(20), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    performed_by: { type: DataTypes.INTEGER, allowNull: true },
    meta: { type: DataTypes.JSON, allowNull: true }
  }, {
    tableName: 'warehouse_movements',
    timestamps: true,
    underscored: true,
    updatedAt: false,
    indexes: [{ fields: ['item_id'] }]
  });
  return WarehouseMovement;
};
