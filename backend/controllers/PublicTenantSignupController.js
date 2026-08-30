'use strict';

const jwt = require('jsonwebtoken');
const { ActivityLog } = require('../models');
const logger = require('../utils/logger');
const { homePathForRole } = require('../utils/tenantScope');
const {
  validateTenantSignup,
  createMitraTenant,
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
          message: 'Pendaftaran mitra di Fiberix ditutup. Daftar di https://app.fiberix.my.id/register'
        });
      }

      const parsed = validateTenantSignup(req.body);
      if (!parsed.ok) {
        return res.status(parsed.status || 400).json({ success: false, message: parsed.message });
      }

      let created;
      try {
        created = await createMitraTenant(parsed.data, {
          notes: 'Daftar mandiri dari halaman publik'
        });
      } catch (err) {
        if (err.status === 400) {
          return res.status(400).json({ success: false, message: err.message });
        }
        throw err;
      }

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
