const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PsbJob = sequelize.define('PsbJob', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    job_number: { type: DataTypes.STRING(24), unique: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: true },
    stage: {
      type: DataTypes.ENUM(
        'daftar', 'survey', 'jadwal', 'stok', 'pasang',
        'bind', 'redaman', 'pppoe', 'tagihan', 'done', 'cancelled'
      ),
      defaultValue: 'daftar',
      allowNull: false
    },
    name: { type: DataTypes.STRING(150), allowNull: false },
    phone: { type: DataTypes.STRING(20), allowNull: false },
    email: { type: DataTypes.STRING(150), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: false },
    latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
    package_id: { type: DataTypes.INTEGER, allowNull: true },
    customer_id: { type: DataTypes.INTEGER, allowNull: true },
    registration_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    work_order_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    ticket_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    odp_id: { type: DataTypes.INTEGER, allowNull: true },
    technician_user_id: { type: DataTypes.INTEGER, allowNull: true },
    technician_name: { type: DataTypes.STRING(150), allowNull: true },
    scheduled_date: { type: DataTypes.DATEONLY, allowNull: true },
    warehouse_item_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    ont_serial: { type: DataTypes.STRING(64), allowNull: true },
    rx_power: { type: DataTypes.FLOAT, allowNull: true },
    pppoe_username: { type: DataTypes.STRING(100), allowNull: true },
    invoice_id: { type: DataTypes.INTEGER, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    meta: { type: DataTypes.JSON, allowNull: true }
  }, {
    tableName: 'psb_jobs',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['stage'] },
      { fields: ['tenant_id'] },
      { fields: ['customer_id'] },
      { fields: ['odp_id'] }
    ],
    hooks: {
      beforeCreate: async (job) => {
        if (!job.job_number) {
          const d = new Date();
          const yy = String(d.getFullYear()).slice(-2);
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const count = await sequelize.models.PsbJob
            .count({ where: sequelize.literal('DATE(created_at) = CURDATE()') })
            .catch(() => 0);
          job.job_number = `PSB-${yy}${mm}${dd}-${String(count + 1).padStart(4, '0')}`;
        }
      }
    }
  });
  return PsbJob;
};
