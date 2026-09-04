const { DataTypes } = require('sequelize');

/**
 * Wilayah operasional ISP (desa/kampung) untuk monitoring disconnect
 * dan isolir massal per area. Tidak mengganti kolom alamat pelanggan.
 */
module.exports = (sequelize) => {
  const Wilayah = sequelize.define('Wilayah', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    code: {
      type: DataTypes.STRING(12),
      allowNull: false,
      unique: true
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active'
    },
    province: { type: DataTypes.STRING(100), allowNull: true },
    regency:  { type: DataTypes.STRING(100), allowNull: true },
    district: { type: DataTypes.STRING(100), allowNull: true },
    village:  { type: DataTypes.STRING(100), allowNull: true },
    phone:    { type: DataTypes.STRING(30),  allowNull: true },
    notes:    { type: DataTypes.TEXT,        allowNull: true }
  }, {
    tableName: 'wilayah',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['code'] },
      { fields: ['status'] },
      { fields: ['village'] }
    ]
  });

  return Wilayah;
};
