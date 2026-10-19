const { DataTypes } = require('sequelize');

/**
 * FieldIncentive — hak insentif teknisi/kolektor.
 *
 * kind:
 *   tagihan  → Rp 5.000 / invoice biasa yang lunas di lapangan
 *   sisa     → Rp 15.000 / invoice pemakaian akhir pelanggan berhenti
 *   router   → Rp 15.000 / pengambilan perangkat
 *   oli      → botol oli per periode 2 bulan
 *
 * Unique (kind, source_type, source_id) mencegah dobel.
 */
module.exports = (sequelize) => {
  const FieldIncentive = sequelize.define('FieldIncentive', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },

    kind: {
      type: DataTypes.ENUM('tagihan', 'sisa', 'router', 'oli'),
      allowNull: false
    },

    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Rupiah (0 untuk oli)'
    },
    qty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Jumlah botol untuk oli; 1 untuk fee uang'
    },
    unit: {
      type: DataTypes.ENUM('rp', 'botol'),
      allowNull: false,
      defaultValue: 'rp'
    },

    period_key: {
      type: DataTypes.STRING(21),
      allowNull: false,
      comment: 'YYYY-MM untuk uang, YYYY-MM_YYYY-MM untuk oli'
    },

    source_type: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'manual'
    },
    source_id: {
      type: DataTypes.STRING(64),
      allowNull: false
    },

    invoice_id:  { type: DataTypes.INTEGER, allowNull: true },
    customer_id: { type: DataTypes.INTEGER, allowNull: true },

    earned_at: { type: DataTypes.DATEONLY, allowNull: false },

    status: {
      type: DataTypes.ENUM('earned', 'paid', 'void'),
      allowNull: false,
      defaultValue: 'earned'
    },
    paid_at: { type: DataTypes.DATE, allowNull: true },
    paid_by: { type: DataTypes.INTEGER, allowNull: true },
    notes:   { type: DataTypes.STRING(255), allowNull: true },

    router_type: { type: DataTypes.STRING(80), allowNull: true, comment: 'Tipe/merk router yang diambil' },
    router_sn:   { type: DataTypes.STRING(80), allowNull: true, comment: 'Serial number' },
    router_mac:  { type: DataTypes.STRING(32), allowNull: true, comment: 'MAC address' }
  }, {
    tableName: 'field_incentives',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['kind', 'source_type', 'source_id'], name: 'uq_field_incentive_source' },
      { fields: ['user_id', 'period_key', 'kind'] },
      { fields: ['status'] },
      { fields: ['earned_at'] }
    ]
  });

  return FieldIncentive;
};
