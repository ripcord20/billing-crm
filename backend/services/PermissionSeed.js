'use strict';

const { Permission, Role, RolePermission, AppSetting } = require('../models');
const { SIDEBAR_MODULES, DEFAULT_ROLE_MODULES, ENSURE_ROLE_MODULES, ACTION_PERMISSIONS } = require('../config/sidebarModules');
const logger = require('../utils/logger');

const SEED_FLAG = 'sidebar_module_perms_seeded';

async function seedSidebarPermissions() {
  const permissionByName = {};
  const newlyCreated = [];

  for (const mod of SIDEBAR_MODULES) {
    const [row, created] = await Permission.findOrCreate({
      where: { name: mod.name },
      defaults: {
        name: mod.name,
        display_name: mod.display,
        module: mod.section,
        description: `Akses menu ${mod.display} (${mod.href})`
      }
    });
    if (row.display_name !== mod.display || row.module !== mod.section) {
      await row.update({
        display_name: mod.display,
        module: mod.section,
        description: `Akses menu ${mod.display} (${mod.href})`
      });
    }
    permissionByName[mod.name] = row;
    if (created) newlyCreated.push(row);
  }

  for (const act of ACTION_PERMISSIONS) {
    const [row, created] = await Permission.findOrCreate({
      where: { name: act.name },
      defaults: {
        name: act.name,
        display_name: act.display_name,
        module: act.module,
        description: `Aksi ${act.display_name}`
      }
    });
    permissionByName[act.name] = row;
    if (created) newlyCreated.push(row);
  }

  const [flag] = await AppSetting.findOrCreate({
    where: { key: SEED_FLAG },
    defaults: { key: SEED_FLAG, value: '0', type: 'string', description: 'Flag seed hak akses modul sidebar' }
  });
  const alreadySeeded = String(flag.value) === '1';
  const roles = await Role.findAll();

  for (const role of roles) {
    const existing = await RolePermission.findAll({
      where: { role_id: role.id },
      attributes: ['permission_id']
    });
    const existingIds = new Set(existing.map(r => r.permission_id));
    let keys;
    if (!alreadySeeded) {
      keys = DEFAULT_ROLE_MODULES[role.name] || [];
    } else if (role.name === 'superadmin' || role.name === 'admin') {
      keys = newlyCreated.map(p => p.name.replace(/^module\./, ''));
    } else {
      keys = [];
    }
    const extra = ENSURE_ROLE_MODULES[role.name] || [];
    if (extra.length) keys = [...new Set([...keys, ...extra])];

    const toCreate = [];
    for (const key of keys) {
      const perm = permissionByName['module.' + key];
      if (!perm || existingIds.has(perm.id)) continue;
      toCreate.push({ role_id: role.id, permission_id: perm.id });
    }
    if (toCreate.length) {
      await RolePermission.bulkCreate(toCreate, { ignoreDuplicates: true });
    }
  }

  if (!alreadySeeded) {
    await flag.update({ value: '1' });
  }

  logger.info(`Ensured ${SIDEBAR_MODULES.length} sidebar module permissions`);
}

module.exports = { seedSidebarPermissions };
