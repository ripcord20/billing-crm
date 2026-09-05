const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('InfrastructureCableCore', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cable_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'FK ke infrastructure_links.id (kabel fisik existing)'
    },
    core_number: { type: DataTypes.INTEGER, allowNull: false },
    tube_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    tube_color: { type: DataTypes.STRING(30), allowNull: true },
    color_code: { type: DataTypes.STRING(30), allowNull: false },
    hex_code: { type: DataTypes.STRING(16), allowNull: true },
    status: {
      type: DataTypes.ENUM('active', 'idle', 'damaged', 'reserved'),
      allowNull: false,
      defaultValue: 'idle'
    },
    attenuation_db: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true }
  }, {
    tableName: 'infrastructure_cable_cores',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['cable_id', 'core_number'], name: 'unique_cable_core' },
      { fields: ['status'] }
    ]
  });
};
