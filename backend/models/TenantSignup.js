const { DataTypes } = require('sequelize');

/**
 * TenantSignup
 * ──────────────────────────────────────────────────────────────────────────
 * Pendaftaran self-service untuk ISP/reseller yang ingin MEMAKAI billing ini
 * sebagai tenant baru. Alur:
 *   pending_payment → (bayar via gateway / konfirmasi) → paid → active
 * Saat 'active', tenant + user owner (role tenant_owner) dibuat otomatis dan
 * ditaut lewat tenant_id / owner_user_id.
 *
 * Berbeda dari RegistrationRequest yang untuk PELANGGAN internet (end user).
 */
module.exports = (sequelize) => {
  const TenantSignup = sequelize.define('TenantSignup', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    signup_code: {
      type: DataTypes.STRING(25),
      unique: true,
      comment: 'Auto-generated: TSU-YYMMDD-XXXX'
    },

    // ── Data pendaftar / calon tenant ────────────────────────────
    name:         { type: DataTypes.STRING(150), allowNull: false, comment: 'Nama PIC/owner' },
    email:        { type: DataTypes.STRING(150), allowNull: false },
    phone:        { type: DataTypes.STRING(30),  allowNull: false },
    company_name: { type: DataTypes.STRING(150), allowNull: true },
    address:      { type: DataTypes.TEXT, allowNull: true },
    requested_slug: { type: DataTypes.STRING(80), allowNull: true },

    // ── Paket langganan billing ──────────────────────────────────
    plan_code:  { type: DataTypes.STRING(40),  allowNull: true },
    plan_name:  { type: DataTypes.STRING(100), allowNull: true },
    amount:     { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },

    // ── Status & pembayaran ──────────────────────────────────────
    status: {
      type: DataTypes.ENUM('pending_payment', 'paid', 'active', 'rejected', 'cancelled'),
      defaultValue: 'pending_payment',
      allowNull: false
    },
    gateway:      { type: DataTypes.STRING(20),  allowNull: true },
    gateway_ref:  { type: DataTypes.STRING(120), allowNull: true },
    payment_url:  { type: DataTypes.TEXT, allowNull: true },
    paid_at:      { type: DataTypes.DATE, allowNull: true },

    // ── Hasil provisioning ───────────────────────────────────────
    tenant_id:      { type: DataTypes.INTEGER, allowNull: true },
    owner_user_id:  { type: DataTypes.INTEGER, allowNull: true },
    temp_password:  { type: DataTypes.STRING(255), allowNull: true, comment: 'Password owner (dienkripsi), ditampilkan sekali.' },
    activated_at:   { type: DataTypes.DATE, allowNull: true },

    notes: { type: DataTypes.TEXT, allowNull: true }
  }, {
    tableName: 'tenant_signups',
    timestamps: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['email'] },
      { fields: ['signup_code'] }
    ],
    hooks: {
      beforeCreate: async (row) => {
        if (!row.signup_code) {
          const d = new Date();
          const yy = String(d.getFullYear()).slice(-2);
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const count = await sequelize.models.TenantSignup
            .count({ where: sequelize.literal(`DATE(created_at) = CURDATE()`) })
            .catch(() => 0);
          const rand = String(Math.floor(Math.random() * 90) + 10);
          row.signup_code = `TSU-${yy}${mm}${dd}-${String(count + 1).padStart(4, '0')}${rand}`;
        }
      }
    }
  });

  // Sembunyikan password terenkripsi dari serialisasi default.
  TenantSignup.prototype.toJSON = function () {
    const values = Object.assign({}, this.get());
    if (values.temp_password) values.temp_password = '********';
    return values;
  };

  return TenantSignup;
};
