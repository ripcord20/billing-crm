'use strict';

const WilayahService = require('../services/WilayahService');

function isAdmin(req) {
  const r = (req.user?.role?.name || '').toLowerCase();
  return r === 'superadmin' || r === 'admin';
}

class WilayahController {
  async index(req, res) {
    try {
      try {
        const { Wilayah } = require('../models');
        if (Wilayah && (await Wilayah.count()) === 0) await WilayahService.seedFromCustomers();
      } catch (_) {}
      const data = await WilayahService.listWithStats();
      const includeInvoice = await WilayahService.getIncludeInvoice();
      const total = data.length;
      const active = data.filter((w) => w.status === 'active').length;
      res.json({ success: true, data, include_invoice: includeInvoice, meta: { total, active } });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async settings(req, res) {
    try {
      const includeInvoice = await WilayahService.getIncludeInvoice();
      res.json({ success: true, data: { include_invoice: includeInvoice } });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async saveSettings(req, res) {
    try {
      if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Hanya admin yang dapat mengubah pengaturan wilayah' });
      const includeInvoice = await WilayahService.setIncludeInvoice(!!req.body.include_invoice);
      res.json({ success: true, data: { include_invoice: includeInvoice } });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async show(req, res) {
    try {
      const data = await WilayahService.detail(req.params.id);
      if (!data) return res.status(404).json({ success: false, message: 'Wilayah tidak ditemukan' });
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async create(req, res) {
    try {
      if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Hanya admin yang dapat menambah wilayah' });
      const data = await WilayahService.createWilayah(req.body || {});
      res.status(201).json({ success: true, data, message: 'Wilayah ditambahkan' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async update(req, res) {
    try {
      if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Hanya admin yang dapat mengubah wilayah' });
      const data = await WilayahService.updateWilayah(req.params.id, req.body || {});
      if (!data) return res.status(404).json({ success: false, message: 'Wilayah tidak ditemukan' });
      res.json({ success: true, data, message: 'Wilayah diperbarui' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async destroy(req, res) {
    try {
      if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Hanya admin yang dapat menghapus wilayah' });
      const ok = await WilayahService.destroyWilayah(req.params.id);
      if (!ok) return res.status(404).json({ success: false, message: 'Wilayah tidak ditemukan' });
      res.json({ success: true, message: 'Wilayah dihapus' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async isolir(req, res) {
    try {
      if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Hanya admin yang dapat isolir per wilayah' });
      const data = await WilayahService.bulkIsolir(req.params.id, req.user?.id || null);
      res.json({ success: true, ...data, message: `Isolir wilayah: ${data.isolir_ok}/${data.total} pelanggan` });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async restore(req, res) {
    try {
      if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Hanya admin yang dapat mengaktifkan wilayah' });
      const data = await WilayahService.bulkRestore(req.params.id, req.user?.id || null);
      res.json({ success: true, ...data, message: `Aktifkan wilayah: ${data.restore_ok}/${data.total} pelanggan` });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async relink(req, res) {
    try {
      if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Hanya admin yang dapat menautkan ulang' });
      const seed = await WilayahService.seedFromCustomers();
      res.json({ success: true, data: seed, message: 'Wilayah ditautkan ulang ke pelanggan' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}

module.exports = new WilayahController();
