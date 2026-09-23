'use strict';

/**
 * Lampirkan kuota terpakai (byte upload/download/total) ke record customer
 * dari snapshot CustomerTrafficPoller (Simple Queue MikroTik).
 *
 * bytesDown = download pelanggan, bytesUp = upload pelanggan.
 */
function attachCustomerQuota(rows, snapshotData) {
  const list = Array.isArray(rows) ? rows : [];
  const byId = Object.create(null);
  (Array.isArray(snapshotData) ? snapshotData : []).forEach((d) => {
    if (d && d.id != null) byId[d.id] = d;
  });
  list.forEach((c) => {
    const t = byId[c.id];
    const download = t ? (parseInt(t.bytesDown, 10) || 0) : 0;
    const upload = t ? (parseInt(t.bytesUp, 10) || 0) : 0;
    c.quota_used = {
      download,
      upload,
      total: download + upload,
      has_data: !!(t && (t.queueName || download > 0 || upload > 0)),
    };
  });
  return list;
}

function snapshotFromPoller() {
  try {
    const poller = require('../services/CustomerTrafficPoller');
    const snap = poller.getSnapshot && poller.getSnapshot();
    return (snap && Array.isArray(snap.data)) ? snap.data : [];
  } catch (_) {
    return [];
  }
}

module.exports = { attachCustomerQuota, snapshotFromPoller };
