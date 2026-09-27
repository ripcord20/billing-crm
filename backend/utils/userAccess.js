'use strict';

const { Op } = require('sequelize');

/**
 * Izin tambahan yang melekat ke role tanpa harus seed role_permissions.
 * Dipakai di hasPermission dan pre-check form hak akses user.
 */
const ROLE_GRANTS = {
  finance: ['customer_view', 'customer_create', 'customer_update', 'customer_delete'],
  tenant_owner: [
    'customer_view', 'customer_create', 'customer_update',
    'device_create', 'device_update', 'device_delete',
    'infra_create', 'infra_update', 'infra_delete',
  ],
  noc: ['customer_view', 'customer_create', 'customer_update'],
  sales: [
    'ticket_view', 'ticket_create', 'ticket_update',
    'todo_view', 'todo_create', 'todo_update',
    'work_order_view', 'work_order_create', 'work_order_update',
  ],
  technician: [
    'ticket_view', 'ticket_update',
    'todo_view', 'todo_update',
    'work_order_view', 'work_order_update',
  ],
};

const MODULE_LABELS = {
  dashboard: 'Dashboard',
  customer: 'Pelanggan',
  billing: 'Billing',
  device: 'Perangkat',
  infrastructure: 'Infrastruktur',
  ont: 'ONT',
  ticket: 'Tiket',
  todo: 'To Do List',
  work_order: 'Work Order',
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
  ticket_view: 'Lihat',
  ticket_create: 'Tambah',
  ticket_update: 'Edit',
  ticket_delete: 'Hapus',
  todo_view: 'Lihat',
  todo_create: 'Tambah',
  todo_update: 'Edit',
  todo_delete: 'Hapus',
  work_order_view: 'Lihat',
  work_order_create: 'Tambah',
  work_order_update: 'Edit',
  work_order_delete: 'Hapus',
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
  'infrastructure', 'ont', 'ticket', 'todo', 'work_order',
  'collection', 'system',
];

const OPS_PERMISSIONS = [
  { name: 'ticket_view', display_name: 'View Tickets', module: 'ticket', description: 'Lihat tiket' },
  { name: 'ticket_create', display_name: 'Create Ticket', module: 'ticket', description: 'Tambah tiket' },
  { name: 'ticket_update', display_name: 'Update Ticket', module: 'ticket', description: 'Edit tiket' },
  { name: 'ticket_delete', display_name: 'Delete Ticket', module: 'ticket', description: 'Hapus tiket' },
  { name: 'todo_view', display_name: 'View Todos', module: 'todo', description: 'Lihat to-do list' },
  { name: 'todo_create', display_name: 'Create Todo', module: 'todo', description: 'Tambah to-do' },
  { name: 'todo_update', display_name: 'Update Todo', module: 'todo', description: 'Edit to-do' },
  { name: 'todo_delete', display_name: 'Delete Todo', module: 'todo', description: 'Hapus to-do' },
  { name: 'work_order_view', display_name: 'View Work Orders', module: 'work_order', description: 'Lihat work order' },
  { name: 'work_order_create', display_name: 'Create Work Order', module: 'work_order', description: 'Tambah work order' },
  { name: 'work_order_update', display_name: 'Update Work Order', module: 'work_order', description: 'Edit work order' },
  { name: 'work_order_delete', display_name: 'Delete Work Order', module: 'work_order', description: 'Hapus work order' },
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
      'View Tickets': 'Lihat',
      'Create Ticket': 'Tambah',
      'Update Ticket': 'Edit',
      'Delete Ticket': 'Hapus',
      'View Todos': 'Lihat',
      'Create Todo': 'Tambah',
      'Update Todo': 'Edit',
      'Delete Todo': 'Hapus',
      'View Work Orders': 'Lihat',
      'Create Work Order': 'Tambah',
      'Update Work Order': 'Edit',
      'Delete Work Order': 'Hapus',
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

async function ensureOpsPermissions() {
  const models = require('../models');
  const { Permission, Role, RolePermission } = models;
  if (!Permission) return;
  for (const row of OPS_PERMISSIONS) {
    const [perm] = await Permission.findOrCreate({
      where: { name: row.name },
      defaults: row,
    });
    if (perm.module !== row.module || perm.display_name !== row.display_name) {
      await perm.update({ module: row.module, display_name: row.display_name, description: row.description });
    }
  }
  if (!Role || !RolePermission) return;
  const names = OPS_PERMISSIONS.map((p) => p.name);
  const perms = await Permission.findAll({ where: { name: names } });
  const roles = await Role.findAll({ where: { name: ['superadmin', 'admin'] } });
  for (const role of roles) {
    for (const perm of perms) {
      await RolePermission.findOrCreate({
        where: { role_id: role.id, permission_id: perm.id },
        defaults: { role_id: role.id, permission_id: perm.id },
      });
    }
  }
}

async function getAccessCatalog() {
  const models = require('../models');
  const { Permission, Role, Wilayah } = models;
  await ensureOpsPermissions();
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
  ensureOpsPermissions,
  mergePermissionNames,
  roleNameOf,
};
