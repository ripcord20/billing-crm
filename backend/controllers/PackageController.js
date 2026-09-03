const { Package, Customer, Wilayah } = require('../models');

// Allowed fields untuk create/update
const ALLOWED = ['name', 'speed_down', 'speed_up', 'price', 'description', 'category', 'is_active', 'wilayah_id'];

function pickFields(body) {
  const out = {};
  ALLOWED.forEach((k) => { if (k in body) out[k] = body[k]; });
  if ('wilayah_id' in out) {
    const v = out.wilayah_id;
    if (v === '' || v === undefined || v === null || v === 'null' || v === 0 || v === '0') {
      out.wilayah_id = null;
    } else {
      const n = parseInt(v, 10);
      out.wilayah_id = Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return out;
}

function wilayahInclude() {
  if (!Wilayah) return [];
  return [{ model: Wilayah, as: 'wilayah', attributes: ['id', 'name', 'code', 'status'], required: false }];
}

function customerInclude(attrs) {
  return [{ model: Customer, as: 'customers', attributes: attrs }];
}

async function findPackages(extra = {}) {
  const include = customerInclude(extra.customerAttrs || ['id']).concat(wilayahInclude());
  try {
    return await Package.findAll({ order: [['price', 'ASC']], include });
  } catch (_) {
    return await Package.findAll({
      order: [['price', 'ASC']],
      include: customerInclude(extra.customerAttrs || ['id'])
    });
  }
}

async function findPackageById(id, customerAttrs) {
  const include = customerInclude(customerAttrs || ['id', 'name']).concat(wilayahInclude());
  try {
    return await Package.findByPk(id, { include });
  } catch (_) {
    return await Package.findByPk(id, { include: customerInclude(customerAttrs || ['id', 'name']) });
  }
}

async function backfillCustomersFromPackage(pkg) {
  if (!pkg || !pkg.id || !pkg.wilayah_id) return;
  try {
    await Customer.update(
      { wilayah_id: pkg.wilayah_id },
      { where: { package_id: pkg.id, wilayah_id: null } }
    );
  } catch (_) {}
}

class PackageController {
  async index(req, res) {
    try {
      const packages = await findPackages();

      const data = packages.map((pkg) => ({
        ...pkg.toJSON(),
        customer_count: pkg.customers?.length || 0
      }));

      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async stats(req, res) {
    try {
      const packages = await findPackages();
      const active    = packages.filter((p) => p.is_active).length;
      const totalCust = packages.reduce((a, p) => a + (p.customers?.length || 0), 0);
      const maxSpeed  = packages.length ? Math.max(...packages.map((p) => p.speed_down || 0)) : 0;
      res.json({ success: true, data: { total: packages.length, active, totalCust, maxSpeed } });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async create(req, res) {
    try {
      const fields = pickFields(req.body);
      if (!fields.name)       return res.status(400).json({ success: false, message: 'Nama paket wajib diisi' });
      if (!fields.speed_down) return res.status(400).json({ success: false, message: 'Kecepatan download wajib diisi' });
      if (!fields.speed_up)   return res.status(400).json({ success: false, message: 'Kecepatan upload wajib diisi' });
      if (!fields.price)      return res.status(400).json({ success: false, message: 'Harga wajib diisi' });
      const pkg = await Package.create(fields);
      await backfillCustomersFromPackage(pkg);
      const fresh = await findPackageById(pkg.id, ['id']);
      res.status(201).json({ success: true, data: fresh || pkg, message: 'Paket berhasil dibuat' });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async show(req, res) {
    try {
      const pkg = await findPackageById(req.params.id, ['id', 'name']);
      if (!pkg) return res.status(404).json({ success: false, message: 'Paket tidak ditemukan' });
      res.json({ success: true, data: { ...pkg.toJSON(), customer_count: pkg.customers?.length || 0 } });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async update(req, res) {
    try {
      const pkg = await Package.findByPk(req.params.id);
      if (!pkg) return res.status(404).json({ success: false, message: 'Paket tidak ditemukan' });
      const fields = pickFields(req.body);
      await pkg.update(fields);
      await backfillCustomersFromPackage(pkg);
      const fresh = await findPackageById(pkg.id, ['id']);
      res.json({ success: true, data: fresh || pkg, message: 'Paket berhasil diperbarui' });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async destroy(req, res) {
    try {
      const pkg = await Package.findByPk(req.params.id);
      if (!pkg) return res.status(404).json({ success: false, message: 'Paket tidak ditemukan' });

      const customerCount = await Customer.count({ where: { package_id: pkg.id } });
      if (customerCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Paket masih digunakan oleh ${customerCount} pelanggan. Pindahkan pelanggan terlebih dahulu.`
        });
      }

      await pkg.destroy();
      res.json({ success: true, message: 'Paket berhasil dihapus' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new PackageController();
