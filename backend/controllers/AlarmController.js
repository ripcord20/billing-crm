'use strict';

const alarm = require('../services/NocAlarmService');
const { applyTenantWhere, getTenantId } = require('../utils/tenantScope');

exports.scan = async (req, res) => {
  try {
    const data = await alarm.scanAll({ tenantId: getTenantId(req) });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.open = async (req, res) => {
  try {
    const data = await alarm.listOpenAlarms(applyTenantWhere(req, {}));
    res.json({ success: true, data, total: data.length });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
