const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('InfrastructureCoreConnection', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    source_core_id: { type: DataTypes.INTEGER, allowNull: false },
    target_core_id: { type: DataTypes.INTEGER, allowNull: true },
    target_device_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'OLT_PORT | ODC_SPLITTER | ODP_PORT | POP_PORT'
    },
    target_device_id: { type: DataTypes.INTEGER, allowNull: true },
    target_port: { type: DataTypes.STRING(40), allowNull: true },
    connection_kind: {
      type: DataTypes.STRING(30),
      allowNull: true,
      comment: 'splice | patch | feeder_in | distribution | drop'
    },
    spliced_by: { type: DataTypes.STRING(100), allowNull: true },
    splice_date: { type: DataTypes.DATEONLY, allowNull: true }
  }, {
    tableName: 'infrastructure_core_connections',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['source_core_id'] },
      { fields: ['target_core_id'] }
    ]
  });
};
