'use strict';

const { occupancyLevel } = require('./PsbFlow');

function customerIdFromMeta(meta) {
  let m = meta;
  if (typeof m === 'string') {
    try { m = JSON.parse(m); } catch (_) { return null; }
  }
  if (!m || m.customer_id == null) return null;
  const n = Number(m.customer_id);
  return Number.isFinite(n) ? n : null;
}

function countUsed(odpId, points, customers) {
  const usedIds = new Set();
  for (const pt of points) {
    if (Number(pt.parent_id) !== Number(odpId)) continue;
    if (pt.type === 'customer') {
      const cid = customerIdFromMeta(pt.metadata);
      usedIds.add(cid != null ? `c:${cid}` : `p:${pt.id}`);
    } else if (pt.type === 'ont') {
      usedIds.add(`ont:${pt.id}`);
    }
  }
  for (const c of customers) {
    if (Number(c.infra_parent_id) === Number(odpId)) usedIds.add(`c:${c.id}`);
  }
  return usedIds.size;
}

function summarizeOdp(odp, used) {
  const capacity = odp.capacity == null ? null : Number(odp.capacity);
  const usedN = Number(used || 0);
  const free = capacity == null ? null : Math.max(0, capacity - usedN);
  const level = occupancyLevel(usedN, capacity);
  const pct = capacity ? Math.min(100, Math.round((usedN / capacity) * 100)) : null;
  return {
    id: odp.id,
    name: odp.name,
    type: odp.type,
    latitude: odp.latitude != null ? Number(odp.latitude) : null,
    longitude: odp.longitude != null ? Number(odp.longitude) : null,
    status: odp.status,
    capacity,
    used: usedN,
    free,
    level,
    pct
  };
}

async function recountAll(where = {}) {
  const { InfrastructurePoint, Customer } = require('../models');
  const { Op } = require('sequelize');
  const points = await InfrastructurePoint.findAll({
    where,
    attributes: ['id', 'name', 'type', 'parent_id', 'capacity', 'used_ports', 'status', 'latitude', 'longitude', 'metadata']
  });
  const custWhere = { infra_parent_id: { [Op.ne]: null } };
  if (where.tenant_id) custWhere.tenant_id = where.tenant_id;
  const customers = await Customer.findAll({
    attributes: ['id', 'infra_parent_id'],
    where: custWhere
  });
  const odps = points.filter((p) => p.type === 'odp' || p.type === 'odc');
  const out = [];
  for (const odp of odps) {
    const used = countUsed(odp.id, points, customers);
    if (Number(odp.used_ports || 0) !== used) {
      await odp.update({ used_ports: used });
    }
    out.push(summarizeOdp(odp, used));
  }
  out.sort((a, b) => {
    const rank = { full: 0, warning: 1, ok: 2, unknown: 3 };
    return (rank[a.level] - rank[b.level]) || String(a.name).localeCompare(String(b.name));
  });
  return out;
}

async function recountOne(odpId) {
  if (!odpId) return null;
  const { InfrastructurePoint, Customer } = require('../models');
  const { Op } = require('sequelize');
  const odp = await InfrastructurePoint.findByPk(odpId);
  if (!odp || (odp.type !== 'odp' && odp.type !== 'odc')) return null;
  const children = await InfrastructurePoint.findAll({
    where: { parent_id: odp.id },
    attributes: ['id', 'type', 'parent_id', 'metadata']
  });
  const customers = await Customer.findAll({
    where: { infra_parent_id: odp.id },
    attributes: ['id', 'infra_parent_id']
  });
  const used = countUsed(odp.id, children, customers);
  if (Number(odp.used_ports || 0) !== used) await odp.update({ used_ports: used });
  return summarizeOdp(odp, used);
}

async function assertOdpHasPort(odpId) {
  const row = await recountOne(odpId);
  if (!row) return { ok: false, message: 'ODP tidak ditemukan' };
  if (row.level === 'full') {
    return { ok: false, message: `ODP ${row.name} penuh (${row.used}/${row.capacity})`, occupancy: row };
  }
  return { ok: true, occupancy: row };
}

module.exports = {
  countUsed,
  summarizeOdp,
  recountAll,
  recountOne,
  assertOdpHasPort,
  customerIdFromMeta
};
