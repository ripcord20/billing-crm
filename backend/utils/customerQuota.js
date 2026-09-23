'use strict';

/**
 * Lampirkan kuota terpakai (byte upload/download/total) ke record customer
 * dari snapshot CustomerTrafficPoller (Simple Queue + interface PPPoE).
 *
 * bytesDown = download pelanggan, bytesUp = upload pelanggan.
 *
 * Queue dynamic PPPoE sering 0/0 bila accounting ada di parent queue tree.
 * Fallback: counter interface <pppoe-USER> (tx-byte = download, rx-byte = upload).
 */

function parsePppoeKey(name) {
  const stripped = String(name || '').toLowerCase().replace(/^</, '').replace(/>$/, '');
  const m = stripped.match(/^pppoe-(.+?)(?:-\d+)?$/);
  return m ? m[1] : null;
}

function indexPppoeInterfaces(ifaceList) {
  const byUser = Object.create(null);
  (Array.isArray(ifaceList) ? ifaceList : []).forEach((ifc) => {
    const key = parsePppoeKey(ifc && ifc.name);
    if (!key) return;
    const rx = parseInt(ifc['rx-byte'] ?? ifc.rxByte ?? ifc.rx ?? 0, 10) || 0;
    const tx = parseInt(ifc['tx-byte'] ?? ifc.txByte ?? ifc.tx ?? 0, 10) || 0;
    if (!byUser[key]) byUser[key] = { rx: 0, tx: 0, name: ifc.name };
    byUser[key].rx += rx;
    byUser[key].tx += tx;
  });
  return byUser;
}

function resolveUsedBytes(queue, iface) {
  const qDown = queue ? (parseInt(queue.bytesIn, 10) || 0) : 0;
  const qUp = queue ? (parseInt(queue.bytesOut, 10) || 0) : 0;
  const iDown = iface ? (parseInt(iface.tx ?? iface['tx-byte'] ?? iface.txByte, 10) || 0) : 0;
  const iUp = iface ? (parseInt(iface.rx ?? iface['rx-byte'] ?? iface.rxByte, 10) || 0) : 0;
  return { download: qDown || iDown, upload: qUp || iUp };
}

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

module.exports = {
  attachCustomerQuota,
  snapshotFromPoller,
  parsePppoeKey,
  indexPppoeInterfaces,
  resolveUsedBytes,
};
