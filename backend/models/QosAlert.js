const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const QosAlert = sequelize.define('QosAlert', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    type: {
      type: DataTypes.STRING(40),
      allowNull: false
    },
    audience: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'tech'
    },
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
      allowNull: false,
      defaultValue: 'warning'
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    target_key: {
      type: DataTypes.STRING(160),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('open', 'acked'),
      allowNull: false,
      defaultValue: 'open'
    },
    hit_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    last_seen_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    acked_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    acked_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    tableName: 'qos_alerts',
    timestamps: true,
    indexes: [
      { fields: ['type', 'status'] },
      { fields: ['audience', 'status'] },
      { fields: ['target_key'] },
      { fields: ['created_at'] }
    ]
  });

  return QosAlert;
};
