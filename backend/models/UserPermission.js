const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserPermission = sequelize.define('UserPermission', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    permission_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'permissions', key: 'id' }
    }
  }, {
    tableName: 'user_permissions',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['user_id', 'permission_id'] }
    ]
  });

  return UserPermission;
};
