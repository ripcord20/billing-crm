'use strict';

const Wireguard = require('../services/WireguardService');

function isNasStaff(req) {
  const r = (req.user?.role?.name || '').toLowerCase();
  return ['superadmin', 'admin', 'finance', 'noc'].includes(r);
}

exports.createPhone = async (req, res) => {
  if (!isNasStaff(req)) {
    return res.status(403).json({ success: false, message: 'Hanya staf Fiberix' });
  }
  try {
    const label = String((req.body && req.body.label) || 'HP tes').slice(0, 48);
    const data = await Wireguard.generatePhonePeer({ label });
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Gagal membuat QR WireGuard HP'
    });
  }
};
