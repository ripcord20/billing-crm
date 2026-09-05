const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('InfrastructureSubscriberCore', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    core_id: { type: DataTypes.INTEGER, allowNull: false },
    subscriber_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'FK ke customers.id'
    },
    odp_port_number: { type: DataTypes.INTEGER, allowNull: true },
    assigned_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'infrastructure_subscriber_cores',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['core_id'], name: 'unique_active_core' },
      { fields: ['subscriber_id'] }
    ]
  });
};
