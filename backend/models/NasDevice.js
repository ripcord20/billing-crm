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
    return values;
  };

  return NasDevice;
};
