'use strict';

/**
 * Catat event saat redaman ONT memburuk.
 * Tidak mengubah snapshot ont_signal_history / ont_devices.
 * Semua error ditelan supaya poller lama tidak terganggu.
 */

const { Op } = require('sequelize');
const logger = require('../utils/logger');

const RANK = { good: 0, warning: 1, critical: 2, los: 3 };
const DEDUP_MS = 30 * 60 * 1000;
const DELTA_MIN = 2;

function qualityOf(rx) {
  if (rx == null || !Number.isFinite(rx) || rx <= -40) return 'los';
  if (rx <= -28) return 'critical';
  if (rx <= -25) return 'warning';
  return 'good';
}

function parseRx(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function recordIfWorsened(opts = {}) {
  try {
    const { OntAttenuationEvent, OntDevice, OntSignalHistory } = require('../models');
    if (!OntAttenuationEvent) return null;

    const ontId = opts.ontDeviceId || null;
    const rxNew = parseRx(opts.rxNew);
    let rxOld = parseRx(opts.rxOld);

    if (rxOld == null && ontId) {
      const lastEv = await OntAttenuationEvent.findOne({
        where: { ont_device_id: ontId },
        order: [['created_at', 'DESC']],
        attributes: ['rx_after']
      });
      if (lastEv && lastEv.rx_after != null) rxOld = parseRx(lastEv.rx_after);
      else if (OntSignalHistory) {
        const prev = await OntSignalHistory.findOne({
          where: { ont_device_id: ontId, rx_power: { [Op.ne]: null } },
          order: [['recorded_at', 'DESC']],
          attributes: ['rx_power']
        });
        if (prev) rxOld = parseRx(prev.rx_power);
      }
    }

    if (rxOld == null) return null;

    const qNew = qualityOf(rxNew);
    const qOld = qualityOf(rxOld);
    const delta = (rxNew != null && rxOld != null) ? Math.round((rxOld - rxNew) * 10) / 10 : null;
    const worsenedDb = delta != null && delta >= DELTA_MIN;
    const worseQuality = RANK[qNew] > RANK[qOld];

    if (!worsenedDb && !worseQuality) return null;
    if (qNew === 'good') return null;
    if (qOld === 'los' && qNew === 'los') return null;

    const severity = (qNew === 'los' || qNew === 'critical') ? 'critical' : 'warning';

    if (ontId) {
      const recent = await OntAttenuationEvent.findOne({
        where: {
          ont_device_id: ontId,
          severity,
          created_at: { [Op.gte]: new Date(Date.now() - DEDUP_MS) }
        },
        order: [['created_at', 'DESC']]
      });
      if (recent && !(delta >= 3)) return null;
    }

    let serial = opts.serialNumber || null;
    let customerId = opts.customerId || null;
    if (ontId && (!serial || !customerId)) {
      const ont = await OntDevice.findByPk(ontId, {
        attributes: ['id', 'serial_number', 'customer_id']
      });
      if (ont) {
        serial = serial || ont.serial_number;
        customerId = customerId || ont.customer_id;
      }
    }

    return await OntAttenuationEvent.create({
      ont_device_id: ontId,
      customer_id: customerId || null,
      serial_number: serial || null,
      olt_name: opts.oltName || null,
      onu_if: opts.onuIf || null,
      rx_before: rxOld,
      rx_after: rxNew,
      delta_db: delta,
      quality_before: qOld,
      quality_after: qNew,
      severity,
      source: opts.source || 'snapshot',
      created_at: new Date()
    });
  } catch (e) {
    logger.debug('[AttenuationEvent] ' + (e.message || e));
    return null;
  }
}

async function pruneOlderThan(days = 30) {
  const { OntAttenuationEvent } = require('../models');
  if (!OntAttenuationEvent) return 0;
  const cutoff = new Date(Date.now() - Math.max(1, days) * 86400000);
  return OntAttenuationEvent.destroy({ where: { created_at: { [Op.lt]: cutoff } } });
}

module.exports = {
  recordIfWorsened,
  pruneOlderThan,
  qualityOf
};
