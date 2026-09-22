'use strict';

const { Op } = require('sequelize');

/**
 * Izin tambahan yang melekat ke role tanpa harus seed role_permissions.
 * Dipakai di hasPermission dan pre-check form hak akses user.
 */
const ROLE_GRANTS = {
  finance: ['customer_view', 'customer_create', 'customer_update', 'customer_delete'],
  tenant_owner: ['customer_view', 'customer_create', 'customer_update'],
  noc: ['customer_view', 'customer_create', 'customer_update'],
};

const MODULE_LABELS = {
  dashboard: 'Dashboard',
  customer: 'Pelanggan',
  billing: 'Billing',
  device: 'Perangkat',
  infrastructure: 'Infrastruktur',
  ont: 'ONT',
  system: 'Sistem',
  collection: 'Collection',
};

const PERMISSION_LABELS = {
  dashboard_view: 'Lihat',
  customer_view: 'Lihat',
  customer_create: 'Tambah',
  customer_update: 'Edit',
  customer_delete: 'Hapus',
  billing_view: 'Lihat',
  billing_generate: 'Generate Tagihan',
  billing_payment: 'Catat Pembayaran',
  device_view: 'Lihat',
  device_create: 'Tambah',
  device_update: 'Edit',
  device_delete: 'Hapus',
  infra_view: 'Lihat',
  infra_create: 'Tambah',
  infra_update: 'Edit',
  infra_delete: 'Hapus',
  ont_view: 'Lihat',
  ont_reboot: 'Reboot',
  ont_sync: 'Sinkron',
  user_manage: 'Kelola User',
  role_manage: 'Kelola Role',
  settings_manage: 'Kelola Pengaturan',
  logs_view: 'Lihat Log',
  'collection.view': 'Lihat',
  'collection.assign': 'Assign Kolektor',
  'collection.collect': 'Tagih Lapangan',
  'collection.deposit': 'Setor Kas',
  'collection.verify': 'Verifikasi Setoran',
  'collection.commission': 'Komisi Kolektor',
};

const MODULE_ORDER = [
  'dashboard', 'customer', 'billing', 'device',
  'infrastructure', 'ont', 'collection', 'system',
];

function unique(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function roleNameOf(reqOrUser) {
  if (!reqOrUser) return '';
  const role = reqOrUser.role?.name || reqOrUser.user?.role?.name || '';
  return String(role || '').toLowerCase();
}

function grantsForRole(roleName) {
  return ROLE_GRANTS[String(roleName || '').toLowerCase()] || [];
}

function isUnrestrictedRole(roleName) {
  const r = String(roleName || '').toLowerCase();
  return r === 'superadmin';
}

function toIdList(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return unique(arr.map((v) => parseInt(v, 10)).filter((n) => Number.isFinite(n) && n > 0));
}

function labelForPermission(perm) {
  if (!perm) return '';
  if (PERMISSION_LABELS[perm.name]) return PERMISSION_LABELS[perm.name];
  const dn = String(perm.display_name || '').trim();
  if (dn) {
    const mapped = {
      'View Customers': 'Lihat',
      'Create Customer': 'Tambah',
      'Update Customer': 'Edit',
      'Delete Customer': 'Hapus',
      'View Billing': 'Lihat',
      'Generate Invoices': 'Generate Tagihan',
      'Record Payment': 'Catat Pembayaran',
      'View Devices': 'Lihat',
      'Create Device': 'Tambah',
      'Update Device': 'Edit',
      'Delete Device': 'Hapus',
      'View Infrastructure': 'Lihat',
      'Create Infrastructure': 'Tambah',
      'Update Infrastructure': 'Edit',
      'Delete Infrastructure': 'Hapus',
      'View ONT': 'Lihat',
      'Reboot ONT': 'Reboot',
      'Sync ONT': 'Sinkron',
      'View Dashboard': 'Lihat',
      'Manage Users': 'Kelola User',
      'Manage Roles': 'Kelola Role',
      'Manage Settings': 'Kelola Pengaturan',
      'View Logs': 'Lihat Log',
      'Lihat Collection': 'Lihat',
    };
    if (mapped[dn]) return mapped[dn];
    return dn;
  }
  return perm.name;
}

function groupPermissions(rows) {
  const groups = {};
  for (const perm of rows || []) {
    const moduleKey = String(perm.module || 'lainnya').toLowerCase();
    if (!groups[moduleKey]) {
      groups[moduleKey] = {
        module: moduleKey,
        label: MODULE_LABELS[moduleKey] || moduleKey,
        permissions: [],
      };
    }
    groups[moduleKey].permissions.push({
      id: perm.id,
      name: perm.name,
      label: labelForPermission(perm),
      display_name: perm.display_name,
    });
  }
  const ordered = MODULE_ORDER
    .filter((k) => groups[k])
    .map((k) => groups[k]);
  for (const key of Object.keys(groups)) {
    if (!MODULE_ORDER.includes(key)) ordered.push(groups[key]);
  }
  return ordered;
}

function wilayahIdsFromUser(user) {
  const rows = user?.wilayah_akses || user?.user_wilayah || [];
  const ids = toIdList(rows.map((w) => w.id || w.wilayah_id));
  return ids;
}

function extraPermissionNamesFromUser(user) {
  const rows = user?.extra_permissions || [];
  return unique(rows.map((p) => p.name).filter(Boolean));
}

function mergePermissionNames(rolePerms, roleName, extraPerms) {
  return unique([
    ...(rolePerms || []),
    ...grantsForRole(roleName),
    ...(extraPerms || []),
  ]);
}

/**
 * Attach req.userPermissions + req.userWilayahIds.
 * userWilayahIds = null artinya akses ke SEMUA wilayah.
 */
function attachUserAccess(req, user) {
  const roleName = (user?.role?.name || '').toLowerCase();
  const rolePerms = (user?.role?.permissions || []).map((p) => p.name);
  const extraPerms = extraPermissionNamesFromUser(user);
  req.userPermissions = mergePermissionNames(rolePerms, roleName, extraPerms);

  if (isUnrestrictedRole(roleName)) {
    req.userWilayahIds = null;
    req.userWilayahAll = true;
    return;
  }
  const ids = wilayahIdsFromUser(user);
  if (!ids.length) {
    req.userWilayahIds = null;
    req.userWilayahAll = true;
  } else {
    req.userWilayahIds = ids;
    req.userWilayahAll = false;
  }
}

function applyWilayahScope(req, where) {
  const next = where && typeof where === 'object' ? where : {};
  const ids = req?.userWilayahIds;
  if (!ids || !ids.length) return next;
  next.wilayah_id = { [Op.in]: ids };
  return next;
}

function applyWilayahSql(req, alias) {
  const ids = req?.userWilayahIds;
  if (!ids || !ids.length) return { sql: '', replacements: {} };
  const col = (alias ? alias + '.' : '') + 'wilayah_id';
  return {
    sql: ` AND ${col} IN (:_wilayahIds)`,
    replacements: { _wilayahIds: ids },
  };
}

function assertCustomerWilayah(req, customer) {
  const ids = req?.userWilayahIds;
  if (!ids || !ids.length) return true;
  if (!customer) return false;
  const wid = parseInt(customer.wilayah_id, 10);
  return Number.isFinite(wid) && ids.includes(wid);
}

async function syncUserWilayah(userId, wilayahIds) {
  const models = require('../models');
  const UserWilayah = models.UserWilayah;
  if (!UserWilayah) return [];
  const ids = toIdList(wilayahIds);
  await UserWilayah.destroy({ where: { user_id: userId } });
  if (ids.length) {
    await UserWilayah.bulkCreate(ids.map((wilayah_id) => ({ user_id: userId, wilayah_id })));
  }
  return ids;
}

async function syncUserPermissions(userId, permissionIds) {
  const models = require('../models');
  const UserPermission = models.UserPermission;
  if (!UserPermission) return [];
  const ids = toIdList(permissionIds);
  await UserPermission.destroy({ where: { user_id: userId } });
  if (ids.length) {
    await UserPermission.bulkCreate(ids.map((permission_id) => ({ user_id: userId, permission_id })));
  }
  return ids;
}

async function loadUserAccessPayload(userId) {
  const models = require('../models');
  const { User, Role, Permission, Wilayah } = models;
  const include = [{ model: Role, as: 'role' }];
  if (Wilayah && User.associations?.wilayah_akses) {
    include.push({ model: Wilayah, as: 'wilayah_akses', through: { attributes: [] }, required: false });
  }
  if (Permission && User.associations?.extra_permissions) {
    include.push({ model: Permission, as: 'extra_permissions', through: { attributes: [] }, required: false });
  }
  let user;
  try {
    user = await User.findByPk(userId, { include });
  } catch (_) {
    user = await User.findByPk(userId, { include: [{ model: Role, as: 'role' }] });
  }
  if (!user) return null;
  const json = user.toJSON();
  json.wilayah_ids = (json.wilayah_akses || []).map((w) => w.id);
  json.permission_ids = (json.extra_permissions || []).map((p) => p.id);
  return json;
}

async function getAccessCatalog() {
  const models = require('../models');
  const { Permission, Role, Wilayah } = models;
  const [permissions, roles] = await Promise.all([
    Permission.findAll({ order: [['module', 'ASC'], ['id', 'ASC']] }),
    Role.findAll({
      include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }],
      order: [['id', 'ASC']],
    }),
  ]);

  let wilayah = [];
  if (Wilayah) {
    try {
      wilayah = await Wilayah.findAll({
        where: { status: 'active' },
        order: [['name', 'ASC']],
        attributes: ['id', 'name', 'code', 'status'],
      });
    } catch (_) {
      try {
        wilayah = await Wilayah.findAll({
          order: [['name', 'ASC']],
          attributes: ['id', 'name', 'code', 'status'],
        });
      } catch (e) {
        wilayah = [];
      }
    }
  }

  const roleDefaults = {};
  for (const role of roles) {
    const names = (role.permissions || []).map((p) => p.name);
    const extra = grantsForRole(role.name);
    const merged = unique([...names, ...extra]);
    const ids = permissions
      .filter((p) => merged.includes(p.name))
      .map((p) => p.id);
    roleDefaults[role.id] = {
      name: role.name,
      display_name: role.display_name,
      permission_ids: ids,
      permission_names: merged,
    };
  }

  return {
    wilayah: (wilayah || []).map((w) => (w.toJSON ? w.toJSON() : w)),
    modules: groupPermissions(permissions),
    role_defaults: roleDefaults,
  };
}

module.exports = {
  ROLE_GRANTS,
  MODULE_LABELS,
  PERMISSION_LABELS,
  grantsForRole,
  isUnrestrictedRole,
  toIdList,
  groupPermissions,
  attachUserAccess,
  applyWilayahScope,
  applyWilayahSql,
  assertCustomerWilayah,
  syncUserWilayah,
  syncUserPermissions,
  loadUserAccessPayload,
  getAccessCatalog,
  mergePermissionNames,
  roleNameOf,
};
