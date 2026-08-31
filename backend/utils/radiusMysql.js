'use strict';

const crypto = require('crypto');

function localRadiusPassword() {
  if (process.env.RADIUS_MYSQL_PASSWORD) return String(process.env.RADIUS_MYSQL_PASSWORD);
  const seed = process.env.CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fiberix-radius';
  return crypto.createHash('sha256').update('radius-local|' + seed).digest('base64url').slice(0, 24);
}

function describeMysqlError(err, server) {
  const host = `${(server && server.mysql_host) || '?'}:${(server && server.mysql_port) || 3306}`;
  const code = err && err.code;
  if (code === 'ECONNREFUSED') {
    return `MySQL RADIUS menolak koneksi di ${host}. Port 3306 tidak terbuka di host itu (daloRADIUS di 192.168.22.9 biasanya hanya bind 127.0.0.1). Pakai 127.0.0.1 jika schema radius ada di server billing.`;
  }
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return `Host MySQL RADIUS ${host} tidak terjangkau.`;
  }
  if (code === 'ER_ACCESS_DENIED_ERROR') {
    return `User/password MySQL RADIUS ditolak di ${host}. Isi ulang password di modul RADIUS.`;
  }
  if (code === 'ER_BAD_DB_ERROR') {
    return `Database ${(server && server.mysql_database) || 'radius'} tidak ada di ${host}.`;
  }
  return (err && err.message) || 'Koneksi MySQL RADIUS gagal';
}

const FREERADIUS_TABLES = [
  `CREATE TABLE IF NOT EXISTS nas (
    id int(10) NOT NULL AUTO_INCREMENT,
    nasname varchar(128) NOT NULL,
    shortname varchar(32) DEFAULT NULL,
    type varchar(30) DEFAULT 'other',
    ports int(5) DEFAULT NULL,
    secret varchar(60) NOT NULL DEFAULT 'secret',
    server varchar(64) DEFAULT NULL,
    community varchar(50) DEFAULT NULL,
    description varchar(200) DEFAULT 'RADIUS Client',
    PRIMARY KEY (id),
    KEY nasname (nasname)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS radcheck (
    id int(11) unsigned NOT NULL AUTO_INCREMENT,
    username varchar(64) NOT NULL DEFAULT '',
    attribute varchar(64) NOT NULL DEFAULT '',
    op char(2) NOT NULL DEFAULT '==',
    value varchar(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY username (username(32))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS radreply (
    id int(11) unsigned NOT NULL AUTO_INCREMENT,
    username varchar(64) NOT NULL DEFAULT '',
    attribute varchar(64) NOT NULL DEFAULT '',
    op char(2) NOT NULL DEFAULT '==',
    value varchar(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY username (username(32))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS radusergroup (
    id int(11) unsigned NOT NULL AUTO_INCREMENT,
    username varchar(64) NOT NULL DEFAULT '',
    groupname varchar(64) NOT NULL DEFAULT '',
    priority int(11) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY username (username(32))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS radgroupcheck (
    id int(11) unsigned NOT NULL AUTO_INCREMENT,
    groupname varchar(64) NOT NULL DEFAULT '',
    attribute varchar(64) NOT NULL DEFAULT '',
    op char(2) NOT NULL DEFAULT '==',
    value varchar(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY groupname (groupname(32))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS radgroupreply (
    id int(11) unsigned NOT NULL AUTO_INCREMENT,
    groupname varchar(64) NOT NULL DEFAULT '',
    attribute varchar(64) NOT NULL DEFAULT '',
    op char(2) NOT NULL DEFAULT '==',
    value varchar(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY groupname (groupname(32))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS radacct (
    radacctid bigint(21) NOT NULL AUTO_INCREMENT,
    acctsessionid varchar(64) NOT NULL DEFAULT '',
    acctuniqueid varchar(32) NOT NULL DEFAULT '',
    username varchar(64) NOT NULL DEFAULT '',
    realm varchar(64) DEFAULT '',
    nasipaddress varchar(15) NOT NULL DEFAULT '',
    nasportid varchar(32) DEFAULT NULL,
    nasporttype varchar(32) DEFAULT NULL,
    acctstarttime datetime DEFAULT NULL,
    acctupdatetime datetime DEFAULT NULL,
    acctstoptime datetime DEFAULT NULL,
    acctinterval int(12) DEFAULT NULL,
    acctsessiontime int(12) unsigned DEFAULT NULL,
    acctauthentic varchar(32) DEFAULT NULL,
    connectinfo_start varchar(50) DEFAULT NULL,
    connectinfo_stop varchar(50) DEFAULT NULL,
    acctinputoctets bigint(20) DEFAULT NULL,
    acctoutputoctets bigint(20) DEFAULT NULL,
    calledstationid varchar(50) NOT NULL DEFAULT '',
    callingstationid varchar(50) NOT NULL DEFAULT '',
    acctterminatecause varchar(32) NOT NULL DEFAULT '',
    servicetype varchar(32) DEFAULT NULL,
    framedprotocol varchar(32) DEFAULT NULL,
    framedipaddress varchar(15) NOT NULL DEFAULT '',
    framedipv6address varchar(45) NOT NULL DEFAULT '',
    framedipv6prefix varchar(45) NOT NULL DEFAULT '',
    framedinterfaceid varchar(44) NOT NULL DEFAULT '',
    delegatedipv6prefix varchar(45) NOT NULL DEFAULT '',
    PRIMARY KEY (radacctid),
    UNIQUE KEY acctuniqueid (acctuniqueid),
    KEY username (username),
    KEY framedipaddress (framedipaddress),
    KEY acctsessionid (acctsessionid),
    KEY acctsessiontime (acctsessiontime),
    KEY acctstarttime (acctstarttime),
    KEY acctinterval (acctinterval),
    KEY acctstoptime (acctstoptime),
    KEY nasipaddress (nasipaddress)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

module.exports = {
  localRadiusPassword,
  describeMysqlError,
  FREERADIUS_TABLES
};
