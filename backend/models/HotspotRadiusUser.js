'use strict';

/**
 * Metadata voucher/user hotspot yang auth-nya di FreeRADIUS (radcheck).
 * Tabel ini sumber kebenaran "username ini milik modul hotspot", supaya
 * CRUD hotspot tidak pernah menimpa radcheck PPPoE.
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HotspotRadiusUser = sequelize.define('HotspotRadiusUser', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    password: { type: DataTypes.STRING(64), allowNull: false, defaultValue: '' },
    profile: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'default' },
    server: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'all' },
    address: { type: DataTypes.STRING(64), allowNull: true, defaultValue: '' },
    mac_address: { type: DataTypes.STRING(32), allowNull: true, defaultValue: '' },
    limit_uptime: { type: DataTypes.STRING(32), allowNull: true, defaultValue: '' },
    limit_bytes_in: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    limit_bytes_out: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    limit_bytes_total: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    comment: { type: DataTypes.TEXT, allowNull: true },
    disabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    device_id: { type: DataTypes.INTEGER, allowNull: true }
  }, {
    tableName: 'hotspot_radius_users',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['username'] },
      { fields: ['profile'] },
      { fields: ['device_id'] }
    ]
  });

  return HotspotRadiusUser;
};
