'use strict';

const { Op } = require('sequelize');
const { QosAlert, QosMetric, AuthFailEvent } = require('../models');
const QosSlaService = require('../services/QosSlaService');
const { mergeSettings } = require('../utils/qosSla');

class QosSlaController {
  async overview(req, res) {
    try {
      const data = await QosSlaService.overview(req.query.device_id);
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async alerts(req, res) {
    try {
      const where = {};
      if (req.query.status) where.status = req.query.status;
      if (req.query.type) where.type = req.query.type;
      if (req.query.audience) where.audience = req.query.audience;
      if (req.query.device_id) where.device_id = parseInt(req.query.device_id, 10);
      const rows = await QosAlert.findAll({
        where,
        order: [['status', 'ASC'], ['last_seen_at', 'DESC'], ['id', 'DESC']],
        limit: Math.min(parseInt(req.query.limit, 10) || 80, 200)
      });
      res.json({ success: true, data: rows });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async ackAlert(req, res) {
    try {
      const alert = await QosAlert.findByPk(req.params.id);
      if (!alert) return res.status(404).json({ success: false, message: 'Alert tidak ditemukan' });
      await alert.update({
        status: 'acked',
        acked_at: new Date(),
        acked_by: req.user?.id || null
      });
      res.json({ success: true, data: alert });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async metrics(req, res) {
    try {
      const where = {};
      if (req.query.kind) where.kind = req.query.kind;
      if (req.query.source) where.source = req.query.source;
      const sinceMin = Math.min(parseInt(req.query.hours, 10) || 6, 72);
      where.recorded_at = { [Op.gte]: new Date(Date.now() - sinceMin * 60 * 60 * 1000) };
      const rows = await QosMetric.findAll({
        where,
        order: [['recorded_at', 'DESC']],
        limit: Math.min(parseInt(req.query.limit, 10) || 200, 500)
      });
      res.json({ success: true, data: rows });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async authFails(req, res) {
    try {
      const minutes = Math.min(parseInt(req.query.minutes, 10) || 60, 24 * 60);
      const where = { created_at: { [Op.gte]: new Date(Date.now() - minutes * 60 * 1000) } };
      if (req.query.device_id) where.device_id = parseInt(req.query.device_id, 10);
      const rows = await AuthFailEvent.findAll({
        where,
        order: [['id', 'DESC']],
        limit: 200
      });
      res.json({ success: true, data: rows, total: rows.length });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async settings(req, res) {
    try {
      const data = await QosSlaService.loadSettings();
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async saveSettings(req, res) {
    try {
      const data = await QosSlaService.saveSettings(mergeSettings(req.body || {}));
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async runNow(req, res) {
    try {
      const data = await QosSlaService.runCycle();
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }
}

module.exports = new QosSlaController();
