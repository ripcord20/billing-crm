/**
 * PortalOtp — kode OTP login portal pelanggan (email / WhatsApp).
 * Kode disimpan sebagai HMAC, bukan plaintext.
 */
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('PortalOtp', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    channel: {
      type: DataTypes.ENUM('email', 'whatsapp'),
      allowNull: false
    },
    identifier: {
      type: DataTypes.STRING(160),
      allowNull: false
    },
    code_hash: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    attempts: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },
    consumed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ip: {
      type: DataTypes.STRING(64),
      allowNull: true
    }
  }, {
    tableName: 'portal_otps',
    timestamps: true,
    indexes: [
      { fields: ['identifier', 'channel'] },
      { fields: ['customer_id'] },
      { fields: ['createdAt'] }
    ]
  });
};
