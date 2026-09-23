'use strict';

const { DataTypes } = require('sequelize');

/**
 * Event naiknya redaman ONT (bukan snapshot berkala).
 * Disimpan 30 hari lalu dihapus otomatis (lihat Cron + DatabaseCleanup).
 */
module.exports = (sequelize) => {
  const OntAttenuationEvent = sequelize.define('OntAttenuationEvent', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    ont_device_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'ont_devices', key: 'id' },
      onDelete: 'CASCADE'
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    serial_number: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    olt_name: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    onu_if: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    rx_before: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    rx_after: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    delta_db: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'rx_before - rx_after; positif = redaman naik (sinyal lebih jelek)'
    },
    quality_before: {
      type: DataTypes.STRING(16),
      allowNull: true
    },
    quality_after: {
      type: DataTypes.STRING(16),
      allowNull: true
    },
    severity: {
      type: DataTypes.ENUM('warning', 'critical'),
      allowNull: false,
      defaultValue: 'warning'
    },
    source: {
      type: DataTypes.STRING(32),
      allowNull: true,
      comment: 'snapshot | genieacs | tr069 | olt'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'ont_attenuation_events',
    timestamps: false,
    indexes: [
      { fields: ['created_at'] },
      { fields: ['ont_device_id', 'created_at'] },
      { fields: ['serial_number', 'created_at'] },
      { fields: ['severity', 'created_at'] }
    ]
  });

  return OntAttenuationEvent;
};
