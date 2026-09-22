const { User, Role, Permission, RolePermission } = require('../models');
const { Op } = require('sequelize');
const { paginateResponse } = require('../utils/helpers');
const {
  getAccessCatalog,
  loadUserAccessPayload,
  syncUserWilayah,
  syncUserPermissions,
  toIdList,
} = require('../utils/userAccess');

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

  // Katalog hak akses: modul Fiberix + daftar wilayah operasional
  async accessCatalog(req, res) {
    try {
      const data = await getAccessCatalog();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // Create user
  async create(req, res) {
    try {
      const { name, email, password, role_id, phone, wilayah_ids, permission_ids } = req.body;
      const user = await User.create({ name, email, password, role_id, phone });
      await syncUserWilayah(user.id, wilayah_ids);
      await syncUserPermissions(user.id, permission_ids);
      const fullUser = await loadUserAccessPayload(user.id);
      res.status(201).json({ success: true, data: fullUser });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Get user
  async show(req, res) {
    try {
      const user = await loadUserAccessPayload(req.params.id);
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

      const { name, email, role_id, phone, is_active, password, wilayah_ids, permission_ids } = req.body;

      const payload = {};
      if (name !== undefined) payload.name = name;
      if (email !== undefined) payload.email = email;
      if (role_id !== undefined) payload.role_id = role_id;
      if (phone !== undefined) payload.phone = phone;
      if (is_active !== undefined) payload.is_active = is_active;
      if (password && String(password).trim()) {
        const pwd = String(password);
        if (pwd.length < 6) {
          return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
        }
        payload.password = pwd;
      }

      await user.update(payload);

      if (wilayah_ids !== undefined) {
        await syncUserWilayah(user.id, toIdList(wilayah_ids));
      }
      if (permission_ids !== undefined) {
        await syncUserPermissions(user.id, toIdList(permission_ids));
      }

      const updated = await loadUserAccessPayload(user.id);
      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // Delete user
  async destroy(req, res) {
    try {
      const user = await User.findByPk(req.params.id, {
        include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }]
      });
      if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
      if (user.id === req.user.id) {
        return res.status(400).json({ success: false, message: 'Tidak bisa menghapus akun sendiri' });
      }
      const targetRole = (user.role?.name || '').toLowerCase();
      const actorRole = (req.user?.role?.name || '').toLowerCase();
      if (targetRole === 'superadmin' && actorRole !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'Hanya superadmin yang bisa menghapus superadmin' });
      }
      try {
        const { UserWilayah, UserPermission } = require('../models');
        if (UserWilayah) await UserWilayah.destroy({ where: { user_id: user.id } });
        if (UserPermission) await UserPermission.destroy({ where: { user_id: user.id } });
      } catch (_) { /* tables may not exist yet */ }
      await user.destroy();
      res.json({ success: true, message: `User ${user.name} dihapus` });
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
      if (role.is_system) return res.status(400).json({ success: false, message: 'Cannot edit system role' });

      const { display_name, description, permissions } = req.body;
      await role.update({ display_name, description });

      if (permissions) {
        await RolePermission.destroy({ where: { role_id: role.id } });
        const rolePerms = permissions.map(pid => ({ role_id: role.id, permission_id: pid }));
        await RolePermission.bulkCreate(rolePerms);
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
      res.json({ success: true, data: permissions });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new UserController();
