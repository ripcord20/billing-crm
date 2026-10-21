const { User, Role, Permission, RolePermission } = require('../models');
const { Op } = require('sequelize');
const { paginateResponse } = require('../utils/helpers');
const { SIDEBAR_MODULES, MOBILE_DRAWER_MODULES, ACTION_PERMISSIONS, accountModuleForm, ALL_KEYS } = require('../config/sidebarModules');

function sanitizeModuleAccess(raw) {
  if (raw == null || raw === '') return null;
  let data = raw;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (_) { return null; }
  }
  const allowedMod = new Set(ALL_KEYS);
  const allowedAct = new Set(ACTION_PERMISSIONS.map(a => a.name));
  const modules = (Array.isArray(data.modules) ? data.modules : Array.isArray(data) ? data : [])
    .map(String)
    .filter(k => allowedMod.has(k));
  const actions = (Array.isArray(data.actions) ? data.actions : [])
    .map(String)
    .filter(k => allowedAct.has(k));
  return { modules, actions };
}

class UserController {
  // List users
  async index(req, res) {
    try {
      const { page = 1, limit = 20, search, role } = req.query;
      const where = {};
      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } }
        ];
      }
      if (role) where.role_id = role;

      const offset = (page - 1) * limit;
      const { count, rows } = await User.findAndCountAll({
        where,
        include: [{ model: Role, as: 'role' }],
        offset,
        limit: parseInt(limit),
        order: [['created_at', 'DESC']]
      });

      res.json({ success: true, ...paginateResponse(rows, count, page, limit) });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Create user
  async create(req, res) {
    try {
      const { name, email, password, role_id, phone, module_access } = req.body;
      const user = await User.create({
        name, email, password, role_id, phone,
        module_access: sanitizeModuleAccess(module_access)
      });
      const fullUser = await User.findByPk(user.id, {
        include: [{ model: Role, as: 'role' }]
      });
      res.status(201).json({ success: true, data: fullUser });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Get user
  async show(req, res) {
    try {
      const user = await User.findByPk(req.params.id, {
        include: [{
          model: Role,
          as: 'role',
          include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }]
        }]
      });
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Update user
  async update(req, res) {
    try {
      const user = await User.findByPk(req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const { name, email, role_id, phone, is_active, password, module_access } = req.body;

      // Build payload: hanya include field yang relevan.
      // PENTING: password hanya di-include kalau diisi (non-empty), supaya admin
      // bisa edit field lain tanpa harus re-input password lama. Hash dilakukan
      // otomatis di hook `beforeUpdate` di User model (lihat models/User.js).
      const payload = { name, email, role_id, phone, is_active };
      if (module_access !== undefined) payload.module_access = sanitizeModuleAccess(module_access);
      if (password && String(password).trim()) {
        const pwd = String(password);
        if (pwd.length < 6) {
          return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
        }
        payload.password = pwd; // raw — hook beforeUpdate akan bcrypt.hash secara otomatis
      }

      await user.update(payload);

      const updated = await User.findByPk(user.id, {
        include: [{ model: Role, as: 'role' }]
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Delete user
  async destroy(req, res) {
    try {
      const user = await User.findByPk(req.params.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      if (user.id === req.user.id) {
        return res.status(400).json({ success: false, message: 'Cannot delete yourself' });
      }
      await user.destroy();
      res.json({ success: true, message: 'User deleted' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ===== Role Management =====
  async getRoles(req, res) {
    try {
      const roles = await Role.findAll({
        include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }],
        order: [['id', 'ASC']]
      });
      res.json({ success: true, data: roles });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async createRole(req, res) {
    try {
      const { name, display_name, description, permissions } = req.body;
      const role = await Role.create({ name, display_name, description });
      if (permissions && permissions.length > 0) {
        const rolePerms = permissions.map(pid => ({ role_id: role.id, permission_id: pid }));
        await RolePermission.bulkCreate(rolePerms);
      }
      const full = await Role.findByPk(role.id, {
        include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }]
      });
      res.status(201).json({ success: true, data: full });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateRole(req, res) {
    try {
      const role = await Role.findByPk(req.params.id);
      if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

      const { display_name, description, permissions } = req.body;
      const patch = {};
      if (typeof display_name === 'string' && display_name.trim()) patch.display_name = display_name.trim();
      if (typeof description === 'string') patch.description = description;
      if (Object.keys(patch).length) await role.update(patch);

      if (Array.isArray(permissions)) {
        const modulePerms = await Permission.findAll({
          where: { name: { [Op.like]: 'module.%' } },
          attributes: ['id']
        });
        const moduleIds = modulePerms.map(p => p.id);
        const allowed = new Set(moduleIds);
        const selected = [...new Set(permissions.map(Number).filter(id => allowed.has(id)))];

        if (moduleIds.length) {
          await RolePermission.destroy({
            where: { role_id: role.id, permission_id: { [Op.in]: moduleIds } }
          });
        }
        if (selected.length) {
          await RolePermission.bulkCreate(
            selected.map(pid => ({ role_id: role.id, permission_id: pid })),
            { ignoreDuplicates: true }
          );
        }
      }

      const full = await Role.findByPk(role.id, {
        include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }]
      });
      res.json({ success: true, data: full });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteRole(req, res) {
    try {
      const role = await Role.findByPk(req.params.id);
      if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
      if (role.is_system) return res.status(400).json({ success: false, message: 'Cannot delete system role' });

      const userCount = await User.count({ where: { role_id: role.id } });
      if (userCount > 0) {
        return res.status(400).json({ success: false, message: 'Role has assigned users' });
      }

      await RolePermission.destroy({ where: { role_id: role.id } });
      await role.destroy();
      res.json({ success: true, message: 'Role deleted' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async getPermissions(req, res) {
    try {
      const permissions = await Permission.findAll({ order: [['module', 'ASC'], ['name', 'ASC']] });
      res.json({
        success: true,
        data: permissions,
        modules: SIDEBAR_MODULES.map(m => ({
          key: m.key,
          name: m.name,
          display: m.display,
          section: m.section,
          href: m.href
        })),
        mobileModules: MOBILE_DRAWER_MODULES.map(m => ({
          key: m.key,
          name: m.name,
          display: m.display,
          section: 'APP MOBILE',
          group: m.group,
          href: m.href
        })),
        accountModules: accountModuleForm(),
        actionPermissions: ACTION_PERMISSIONS
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new UserController();