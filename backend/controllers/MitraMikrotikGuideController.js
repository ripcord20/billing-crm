'use strict';

const { Op } = require('sequelize');
const { SETTING_KEYS, buildMitraMikrotikGuide } = require('../utils/mitraMikrotikGuide');

async function loadGuide() {
  const { AppSetting } = require('../models');
  const rows = await AppSetting.findAll({ where: { key: { [Op.in]: SETTING_KEYS } } });
  const map = {};
  for (const row of rows) map[row.key] = row.value;
  return buildMitraMikrotikGuide(map);
}

exports.loadGuide = loadGuide;

exports.show = async (req, res) => {
  try {
    const data = await loadGuide();
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Gagal memuat panduan'
    });
  }
};
