const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RadiusAccount = sequelize.define('RadiusAccount', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    radius_server_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    nas_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    username: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    groupname: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'isolated', 'disabled'),
      defaultValue: 'active'
    },
    last_sync_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_error: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'radius_accounts',
    timestamps: true,
    indexes: [
      { fields: ['username'] },
      { fields: ['customer_id'] }
    ]
  });

  return RadiusAccount;
};
