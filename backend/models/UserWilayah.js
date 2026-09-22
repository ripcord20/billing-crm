const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserWilayah = sequelize.define('UserWilayah', {
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
    wilayah_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'user_wilayah',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['user_id', 'wilayah_id'] }
    ]
  });

  return UserWilayah;
};
