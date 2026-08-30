const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuthFailEvent = sequelize.define('AuthFailEvent', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    source: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'portal'
    },
    identifier: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    user_agent: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    reason: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    tableName: 'auth_fail_events',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['created_at'] },
      { fields: ['ip_address'] },
      { fields: ['source'] }
    ]
  });

  return AuthFailEvent;
};
