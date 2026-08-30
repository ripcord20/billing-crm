'use strict';

const { ActivityLog } = require('../models');
const logger = require('../utils/logger');
const {
  validateTenantSignup,
  createMitraTenant,
  listMitraTenants,
  provisionKeyMatches
} = require('../utils/tenantSignup');

function loginBase() {
  return String(process.env.APP_URL || 'https://fiberix.my.id').replace(/\/$/, '');
}

class InternalProvisionController {
  requireKey(req, res) {
    const ok = provisionKeyMatches(
      req.get('X-Provision-Key') || req.get('x-provision-key'),
      process.env.FIBERIX_PROVISION_KEY
    );
    if (ok) return true;
    res.status(401).json({ success: false, message: 'Provision key tidak valid' });
    return false;
  }

  async health(req, res) {
    if (!this.requireKey(req, res)) return;
    res.json({
      success: true,
      service: 'fiberix-billing',
      login_url: `${loginBase()}/login`,
      dashboard_url: `${loginBase()}/dashboard`
    });
  }

  async summary(req, res) {
    try {
      if (!this.requireKey(req, res)) return;
      const tenants = await listMitraTenants();
      res.json({
        success: true,
        data: {
          mitra_count: tenants.length,
          tenants
        }
      });
    } catch (error) {
      logger.error('Internal mitra summary error:', error);
      res.status(500).json({ success: false, message: 'Gagal membaca ringkasan mitra' });
    }
  }

  async provision(req, res) {
    try {
      if (!this.requireKey(req, res)) return;

      const parsed = validateTenantSignup({
        company_name: req.body.company_name || req.body.tenantName,
        owner_name: req.body.owner_name || req.body.fullName || req.body.tenantName,
        email: req.body.email,
        password: req.body.password,
        phone: req.body.phone,
        website: req.body.website
      });
      if (!parsed.ok) {
        return res.status(parsed.status || 400).json({ success: false, message: parsed.message });
      }

      let created;
      try {
        created = await createMitraTenant({
          ...parsed.data,
          slug: req.body.tenantSlug || req.body.slug
        }, {
          notes: 'Provisioned from SAAS app.fiberix.my.id'
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
          action: 'tenant_provision_saas',
          module: 'auth',
          description: `Mitra ${created.tenant.name} diprovision dari SAAS`,
          target_type: 'tenant',
          target_id: created.tenant.id,
          ip_address: req.ip,
          user_agent: req.get && req.get('User-Agent')
        });
      } catch (_) { /* audit must not block provision */ }

      res.status(201).json({
        success: true,
        message: 'Tenant billing Fiberix dibuat',
        data: {
          tenant: {
            id: created.tenant.id,
            name: created.tenant.name,
            slug: created.tenant.slug,
            email: created.tenant.email,
            status: created.tenant.status
          },
          user: {
            id: created.user.id,
            email: created.user.email,
            name: created.user.name
          },
          login_url: `${loginBase()}/login`,
          home_path: '/dashboard',
          dashboard_url: `${loginBase()}/dashboard`
        }
      });
    } catch (error) {
      logger.error('Internal tenant provision error:', error);
      res.status(500).json({ success: false, message: 'Provision billing gagal' });
    }
  }
}

module.exports = new InternalProvisionController();
