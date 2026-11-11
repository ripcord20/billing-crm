const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RadiusServer = sequelize.define('RadiusServer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    host: {
      type: DataTypes.STRING(120),
      allowNull: false,
      comment: 'IP/host daemon FreeRADIUS (auth 1812)'
    },
    auth_port: {
      type: DataTypes.INTEGER,
      defaultValue: 1812
    },
    acct_port: {
      type: DataTypes.INTEGER,
      defaultValue: 1813
    },
    mysql_host: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    mysql_port: {
      type: DataTypes.INTEGER,
      defaultValue: 3306
    },
    mysql_database: {
      type: DataTypes.STRING(80),
      allowNull: false,
      defaultValue: 'radius'
    },
    mysql_user: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    mysql_password: {
      type: DataTypes.STRING(512),
      allowNull: true
    },
    default_nas_secret: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_ok_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_error: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'radius_servers',
    timestamps: true
  });

  RadiusServer.prototype.toJSON = function () {
    const values = Object.assign({}, this.get());
    if (values.mysql_password) values.mysql_password = '********';
    return values;
  };

  return RadiusServer;
};
