'use strict';

const jwt = require('jsonwebtoken');
const { User, Tenant, ActivityLog, sequelize } = require('../models');
const logger = require('../utils/logger');
const { homePathForRole } = require('../utils/tenantScope');
const {
  validateTenantSignup,
  uniqueSlug,
  ensureTenantOwnerRole,
  publicSignupEnabled
} = require('../utils/tenantSignup');

const REGULAR_JWT_EXPIRY = process.env.JWT_EXPIRY || '30d';
const REGULAR_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

class PublicTenantSignupController {
  async signup(req, res) {
    try {
      if (!publicSignupEnabled()) {
        return res.status(403).json({
          success: false,
          message: 'Pendaftaran mitra ditutup. Hubungi admin untuk dibuatkan akun.'
        });
      }

      const parsed = validateTenantSignup(req.body);
      if (!parsed.ok) {
        return res.status(parsed.status || 400).json({ success: false, message: parsed.message });
      }

      const { company_name, owner_name, email, password, phone } = parsed.data;

      const exists = await User.findOne({ where: { email } });
      if (exists) {
        return res.status(400).json({ success: false, message: 'Email sudah terpakai' });
      }

      const role = await ensureTenantOwnerRole();
      const slug = await uniqueSlug(company_name);

      const created = await sequelize.transaction(async (t) => {
        const tenant = await Tenant.create({
          name: company_name,
          slug,
          email,
          phone,
          status: 'active',
          notes: 'Daftar mandiri dari halaman publik'
        }, { transaction: t });

        const user = await User.create({
          name: owner_name,
          email,
          password,
          phone,
          role_id: role.id,
          tenant_id: tenant.id,
          is_active: true
        }, { transaction: t });

        return { tenant, user };
      });

      try {
        await ActivityLog.create({
          user_id: created.user.id,
          action: 'tenant_signup',
          module: 'auth',
          description: `Mitra ${created.tenant.name} didaftarkan oleh ${created.user.name}`,
          target_type: 'tenant',
          target_id: created.tenant.id,
          ip_address: req.ip,
          user_agent: req.get && req.get('User-Agent')
        });
      } catch (_) { /* audit must not block signup */ }

      if (!process.env.JWT_SECRET) {
        return res.status(500).json({ success: false, message: 'Konfigurasi server tidak lengkap' });
      }

      const token = jwt.sign(
        { id: created.user.id, email: created.user.email, role: 'tenant_owner', isDemo: false },
        process.env.JWT_SECRET,
        { expiresIn: REGULAR_JWT_EXPIRY }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: !!req.secure,
        sameSite: 'lax',
        maxAge: REGULAR_COOKIE_MAX_AGE
      });

      const redirect = homePathForRole('tenant_owner');
      res.json({
        success: true,
        message: 'Akun mitra dibuat. Mengalihkan ke dashboard…',
        data: {
          user: created.user.toJSON(),
          tenant: { id: created.tenant.id, name: created.tenant.name, slug: created.tenant.slug },
          token,
          redirect
        }
      });
    } catch (error) {
      logger.error('Public tenant signup error:', error);
      res.status(500).json({ success: false, message: 'Pendaftaran gagal. Coba lagi nanti.' });
    }
  }
}

module.exports = new PublicTenantSignupController();
