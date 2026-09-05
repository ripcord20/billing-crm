'use strict';

const { TIA_COLOR_PALETTE, ALLOWED_CORE_COUNTS } = require('../utils/tiaCableColors');
const CableCoreService = require('../services/CableCoreService');

function fail(res, e) {
  const status = e.status || 500;
  return res.status(status).json({ success: false, message: e.message || 'Server error' });
}

class InfrastructureCoreController {
  palette(_req, res) {
    res.json({
      success: true,
      data: {
        colors: TIA_COLOR_PALETTE,
        allowed_counts: ALLOWED_CORE_COUNTS
      }
    });
  }

  async cables(_req, res) {
    try {
      const data = await CableCoreService.listCables();
      res.json({ success: true, data });
    } catch (e) { fail(res, e); }
  }

  async list(req, res) {
    try {
      const cableId = parseInt(req.query.cable_id, 10);
      if (!cableId) return res.status(400).json({ success: false, message: 'cable_id wajib.' });
      const data = await CableCoreService.listByCable(cableId);
      res.json({ success: true, data });
    } catch (e) { fail(res, e); }
  }

  async generate(req, res) {
    try {
      const { cable_id, total_cores, replace } = req.body || {};
      const data = await CableCoreService.generateForCable(cable_id, total_cores, { replace: !!replace });
      res.json({ success: true, data, message: `${data.length} core siap (TIA/EIA-598).` });
    } catch (e) { fail(res, e); }
  }

  async update(req, res) {
    try {
      const data = await CableCoreService.updateCore(req.params.id, req.body || {});
      res.json({ success: true, data });
    } catch (e) { fail(res, e); }
  }

  async splice(req, res) {
    try {
      const spliced_by = (req.body && req.body.spliced_by)
        || (req.user && (req.user.name || req.user.email))
        || 'Teknisi System';
      const data = await CableCoreService.spliceCores({ ...(req.body || {}), spliced_by });
      res.json({ success: true, data, message: 'Core berhasil disambungkan.' });
    } catch (e) { fail(res, e); }
  }

  async unsplice(req, res) {
    try {
      await CableCoreService.removeConnection(req.params.id);
      res.json({ success: true, message: 'Sambungan dihapus.' });
    } catch (e) { fail(res, e); }
  }

  async assign(req, res) {
    try {
      const data = await CableCoreService.assignSubscriber(req.body || {});
      res.json({ success: true, data, message: 'Core di-assign ke pelanggan.' });
    } catch (e) { fail(res, e); }
  }

  async unassign(req, res) {
    try {
      await CableCoreService.unassignSubscriber(req.params.id);
      res.json({ success: true, message: 'Assignment dilepas.' });
    } catch (e) { fail(res, e); }
  }

  async trace(req, res) {
    try {
      const data = await CableCoreService.trace({
        customer_id: req.query.customer_id || (req.body && req.body.customer_id),
        core_id: req.query.core_id || (req.body && req.body.core_id)
      });
      res.json({ success: true, data });
    } catch (e) { fail(res, e); }
  }
}

module.exports = new InfrastructureCoreController();
