const { DataTypes } = require('sequelize');

/**
 * Riwayat injek / koreksi plafon deposit kolektor oleh owner/admin.
 * deposit_limit di CollectorProfile = SUM(amount) injeksi (denormalized).
 */
module.exports = (sequelize) => {
  const CollectorDepositInjection = sequelize.define('CollectorDepositInjection', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    collector_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      comment: 'Positif = injek plafon, negatif = koreksi turun'
    },
    note: { type: DataTypes.STRING(255), allowNull: true },
    injected_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' }
    }
  }, {
    tableName: 'collector_deposit_injections',
    timestamps: true,
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['collector_id'] },
      { fields: ['created_at'] }
    ]
  });

  return CollectorDepositInjection;
};
