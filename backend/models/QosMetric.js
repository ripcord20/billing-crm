const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const QosMetric = sequelize.define('QosMetric', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    kind: {
      type: DataTypes.STRING(32),
      allowNull: false
    },
    source: {
      type: DataTypes.STRING(40),
      allowNull: false
    },
    target: {
      type: DataTypes.STRING(160),
      allowNull: true
    },
    value: {
      type: DataTypes.DECIMAL(14, 3),
      allowNull: true
    },
    unit: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ok'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    },
    recorded_at: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    tableName: 'qos_metrics',
    timestamps: false,
    indexes: [
      { fields: ['kind', 'recorded_at'] },
      { fields: ['source', 'target'] },
      { fields: ['recorded_at'] }
    ]
  });

  return QosMetric;
};
