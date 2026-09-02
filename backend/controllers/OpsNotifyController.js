'use strict';

const Ops = require('../services/OpsNotifyService');
const Gateway = require('../services/GatewayService');
const logger = require('../utils/logger');

exports.config = async (req, res) => {
  try {
    const cfg = await Ops.getConfig();
    res.json({ success: true, data: cfg });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.save = async (req, res) => {
  try {
    const cfg = await Ops.saveConfig(req.body || {});
    res.json({ success: true, data: cfg, message: 'Grup teknisi disimpan' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.groups = async (req, res) => {
  try {
    const session = await Gateway.getDefaultSendingSession();
    if (!session) {
      return res.json({ success: true, data: [], message: 'Tidak ada sesi WA terhubung' });
    }
    const list = await Gateway.listGroups(session.session_id);
    res.json({ success: true, data: list || [], session_id: session.session_id });
  } catch (e) {
    logger.warn('[OpsNotify] list groups: ' + e.message);
    res.status(500).json({ success: false, message: e.message, data: [] });
  }
};

exports.test = async (req, res) => {
  try {
    const kind = (req.body && req.body.kind) || 'uplink';
    const out = await Ops.sendTest(kind === 'ticket' ? 'ticket' : 'uplink');
    res.json({ success: !!out.ok, message: out.message });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.uplinkStatus = async (req, res) => {
  try {
    const Uplink = require('../services/UplinkMonitorService');
    const data = Uplink.getSnapshot();
    res.json({
      success: true,
      data,
      down: Uplink.downCount(),
      total: data.length,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.uplinkRefresh = async (req, res) => {
  try {
    const Uplink = require('../services/UplinkMonitorService');
    const data = await Uplink.pollOnce();
    res.json({ success: true, data, down: Uplink.downCount(), total: data.length });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
