'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { basePath, withBase, slugify } = require('./lib/helpers');
const store = require('./lib/store');

const PORT = parseInt(process.env.SAAS_PORT || '3010', 10);
const COOKIE = 'saas_sid';
const JWT_SECRET = process.env.SAAS_JWT_SECRET || process.env.JWT_SECRET || 'fiberix-saas-dev';
const BASE = basePath();

function signAdmin(admin) {
  return jwt.sign({ sid: admin.id, email: admin.email, name: admin.name, kind: 'saas_owner' }, JWT_SECRET, { expiresIn: '12h' });
}

function readAdmin(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, JWT_SECRET);
    if (p.kind !== 'saas_owner') return null;
    return p;
  } catch (_) {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const admin = readAdmin(req);
  if (!admin) {
    if (req.path.startsWith('/api') || req.xhr) {
      return res.status(401).json({ success: false, message: 'Login platform owner diperlukan' });
    }
    return res.redirect(withBase('/login'));
  }
  req.saas = admin;
  next();
}

async function uniqueSlug(Tenant, name, excludeId) {
  let slug = slugify(name);
  let i = 0;
  while (true) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const where = { slug: candidate };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const exists = await Tenant.findOne({ where });
    if (!exists) return candidate;
    i += 1;
    if (i > 50) return `${slug}-${Date.now()}`;
  }
}

async function main() {
  const db = require('../backend/models');
  await store.ensureSaasAdmins(db.sequelize);
  const seed = await store.seedOwner(db.sequelize);
  if (seed.seeded) console.log('[saas] owner seeded:', seed.email);

  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser());

  const pub = express.static(path.join(__dirname, 'public'));
  if (BASE) app.use(BASE, pub);
  app.use(pub);

  const r = express.Router();

  r.use((req, res, next) => {
    res.locals.base = withBase;
    res.locals.basePath = BASE;
    res.locals.admin = readAdmin(req);
    res.locals.billingUrl = process.env.SAAS_BILLING_URL || 'https://app.fiberix.my.id';
    next();
  });

  r.get('/login', (req, res) => {
    if (readAdmin(req)) return res.redirect(withBase('/'));
    res.render('login', { title: 'Login Platform', error: null });
  });

  r.post('/login', async (req, res) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      const row = await store.findAdminByEmail(db.sequelize, email);
      if (!row || !row.is_active || !(await bcrypt.compare(password, row.password))) {
        return res.status(401).render('login', { title: 'Login Platform', error: 'Email atau password salah' });
      }
      await store.markLogin(db.sequelize, row.id);
      res.cookie(COOKIE, signAdmin(row), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.SAAS_COOKIE_SECURE === '1',
        path: BASE || '/',
        maxAge: 12 * 60 * 60 * 1000
      });
      res.redirect(withBase('/'));
    } catch (e) {
      res.status(500).render('login', { title: 'Login Platform', error: e.message });
    }
  });

  r.post('/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: BASE || '/' });
    res.redirect(withBase('/login'));
  });

  r.get('/', requireAdmin, async (req, res) => {
    const data = await store.overview(db);
    res.render('dashboard', { title: 'Dashboard Platform', admin: req.saas, data });
  });

  r.get('/api/overview', requireAdmin, async (req, res) => {
    try {
      res.json({ success: true, data: await store.overview(db) });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  r.get('/api/tenants', requireAdmin, async (req, res) => {
    try {
      const { Tenant, User, Role, sequelize } = db;
      const rows = await Tenant.findAll({
        include: [{
          model: User,
          as: 'users',
          attributes: ['id', 'name', 'email', 'is_active'],
          include: [{ model: Role, as: 'role', attributes: ['name'] }],
          required: false
        }],
        order: [['created_at', 'DESC']]
      });
      const counts = await sequelize.query(
        'SELECT tenant_id, COUNT(*) AS n FROM customers WHERE tenant_id IS NOT NULL GROUP BY tenant_id',
        { type: sequelize.QueryTypes.SELECT }
      );
      const countMap = {};
      counts.forEach((c) => { countMap[c.tenant_id] = parseInt(c.n || 0, 10); });
      res.json({
        success: true,
        data: rows.map((t) => {
          const json = t.toJSON();
          json.customer_count = countMap[t.id] || 0;
          json.owners = (json.users || []).filter((u) => u.role?.name === 'tenant_owner');
          delete json.users;
          return json;
        })
      });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  r.post('/api/tenants', requireAdmin, async (req, res) => {
    try {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ success: false, message: 'Nama tenant wajib' });
      const tenant = await db.Tenant.create({
        name,
        slug: await uniqueSlug(db.Tenant, req.body.slug || name),
        email: req.body.email || null,
        phone: req.body.phone || null,
        address: req.body.address || null,
        status: 'active'
      });
      res.json({ success: true, message: 'Tenant dibuat', data: tenant });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  r.post('/api/tenants/:id/status', requireAdmin, async (req, res) => {
    try {
      const tenant = await db.Tenant.findByPk(req.params.id);
      if (!tenant) return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
      const status = req.body.status === 'suspended' ? 'suspended' : 'active';
      await tenant.update({ status });
      res.json({ success: true, message: 'Status tenant diperbarui', data: tenant });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  r.post('/api/tenants/:id/owners', requireAdmin, async (req, res) => {
    try {
      const tenant = await db.Tenant.findByPk(req.params.id);
      if (!tenant) return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
      const name = String(req.body.name || '').trim();
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      if (!name || !email || password.length < 8) {
        return res.status(400).json({ success: false, message: 'Nama, email, dan password (min 8) wajib' });
      }
      const exists = await db.User.findOne({ where: { email } });
      if (exists) return res.status(400).json({ success: false, message: 'Email sudah terpakai di billing' });
      const [role] = await db.Role.findOrCreate({
        where: { name: 'tenant_owner' },
        defaults: {
          name: 'tenant_owner',
          display_name: 'Pemilik Tenant',
          description: 'Pemilik usaha tenant',
          is_system: true
        }
      });
      const user = await db.User.create({
        name,
        email,
        password,
        role_id: role.id,
        tenant_id: tenant.id,
        is_active: true
      });
      res.json({
        success: true,
        message: 'Owner penyewa dibuat. Mereka login di billing, bukan di panel ini.',
        data: { id: user.id, email: user.email, billing: process.env.SAAS_BILLING_URL || 'https://app.fiberix.my.id' }
      });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  if (BASE) {
    app.use(BASE, r);
    app.get('/', (req, res) => res.redirect(withBase('/')));
  } else {
    app.use(r);
  }

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[saas] platform owner listening 127.0.0.1:${PORT}${BASE || '/'}`);
  });
}

main().catch((e) => {
  console.error('[saas] fatal', e);
  process.exit(1);
});
