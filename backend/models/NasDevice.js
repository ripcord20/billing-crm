const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const NasDevice = sequelize.define('NasDevice', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    radius_server_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    device_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Opsional: taut ke tabel devices (MikroTik)'
    },
    nasname: {
      type: DataTypes.STRING(128),
      allowNull: false,
      comment: 'IP NAS (client RADIUS), kolom nas.nasname di FreeRADIUS'
    },
    shortname: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    type: {
      type: DataTypes.STRING(32),
      defaultValue: 'mikrotik'
    },
    // ── Mode koneksi NAS ↔ billing/RADIUS ────────────────────────────────
    // 'public' : MikroTik menjangkau server RADIUS lewat IP publik langsung.
    // 'vpn'    : MikroTik terhubung lewat tunnel (WireGuard). nasname diisi
    //            dengan alamat tunnel MikroTik (peer) supaya cocok dengan IP
    //            yang dilihat FreeRADIUS dari sisi tunnel.
    conn_mode: {
      type: DataTypes.ENUM('public', 'vpn'),
      defaultValue: 'public'
    },
    vpn_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'wireguard'
    },
    // Alamat tunnel milik NAS/MikroTik (peer) di dalam VPN, mis. 10.10.0.2/32.
    tunnel_address: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    // ── WireGuard peer (auto-generate) ───────────────────────────────────
    wg_public_key: {
      type: DataTypes.STRING(128),
      allowNull: true,
      comment: 'Public key peer (MikroTik). Ditaruh sebagai [Peer] di server.'
    },
    wg_private_key: {
      type: DataTypes.STRING(256),
      allowNull: true,
      comment: 'Private key peer (dienkripsi). Dibuat otomatis untuk config klien.'
    },
    wg_preshared_key: {
      type: DataTypes.STRING(256),
      allowNull: true,
      comment: 'Preshared key opsional (dienkripsi).'
    },
    wg_endpoint: {
      type: DataTypes.STRING(160),
      allowNull: true,
      comment: 'Endpoint server WireGuard yang dituju klien, host:port.'
    },
    wg_allowed_ips: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'AllowedIPs yang dirutekan klien ke dalam tunnel.'
    },
    wg_keepalive: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 25
    },
    wg_last_applied_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    ports: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    secret: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    community: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    description: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_sync_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_error: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'nas_devices',
    timestamps: true
  });

  NasDevice.prototype.toJSON = function () {
    const values = Object.assign({}, this.get());
    if (values.secret) values.secret = '********';
    // Jangan pernah bocorkan private/preshared key WireGuard di listing.
    // Config klien (yang memuat private key) dikembalikan hanya sekali lewat
    // endpoint generate/config, bukan lewat toJSON.
    if (values.wg_private_key) values.wg_private_key = '********';
    if (values.wg_preshared_key) values.wg_preshared_key = '********';
    values.wg_configured = !!(this.get('wg_public_key') && this.get('wg_private_key'));
    return values;
  };

  return NasDevice;
};
