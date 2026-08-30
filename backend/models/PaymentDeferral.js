const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentDeferral = sequelize.define('PaymentDeferral', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'customers', key: 'id' }
    },
    invoice_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'invoices', key: 'id' }
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    promise_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    duration_days: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('open', 'paid', 'cancelled'),
      allowNull: false,
      defaultValue: 'open'
    },
    period_month: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    period_year: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' }
    },
    settled_payment_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'payments', key: 'id' }
    },
    settled_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'payment_deferrals',
    timestamps: true,
    indexes: [
      { fields: ['customer_id'] },
      { fields: ['status'] },
      { fields: ['promise_date'] },
      { fields: ['period_month', 'period_year'] }
    ]
  });

  return PaymentDeferral;
};
