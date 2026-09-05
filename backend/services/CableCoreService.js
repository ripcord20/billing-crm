'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  InfrastructureCableCore,
  InfrastructureCoreConnection,
  InfrastructureSubscriberCore,
  InfrastructureLink,
  InfrastructurePoint,
  Customer
} = require('../models');
const { generateCableCores, ALLOWED_CORE_COUNTS } = require('../utils/tiaCableColors');

const CORE_STATUSES = ['active', 'idle', 'damaged', 'reserved'];

function serializeCore(row) {
  if (!row) return null;
  const j = row.toJSON ? row.toJSON() : row;
  return {
    ...j,
    attenuation_db: j.attenuation_db != null ? Number(j.attenuation_db) : null
  };
}

async function generateForCable(cableId, totalCores, { replace = false } = {}) {
  const link = await InfrastructureLink.findByPk(cableId);
  if (!link) {
    const err = new Error('Kabel (infrastructure_links) tidak ditemukan.');
    err.status = 404;
    throw err;
  }
  const total = Number(totalCores);
  if (!ALLOWED_CORE_COUNTS.includes(total)) {
    const err = new Error('Kapasitas core harus 1, 2, 4, 8, 12, 24, atau 48.');
    err.status = 400;
    throw err;
  }

  const existing = await InfrastructureCableCore.findAll({
    where: { cable_id: cableId },
    order: [['core_number', 'ASC']]
  });

  if (existing.length && !replace) {
    if (existing.length === total) return existing.map(serializeCore);
    if (existing.length > total) {
      const err = new Error(`Kabel ini sudah punya ${existing.length} core. Gunakan replace=true untuk generate ulang.`);
      err.status = 409;
      throw err;
    }
    const have = new Set(existing.map((c) => c.core_number));
    const all = generateCableCores(cableId, total);
    const missing = all.filter((r) => !have.has(r.core_number));
    if (missing.length) await InfrastructureCableCore.bulkCreate(missing);
  } else if (!existing.length) {
    await InfrastructureCableCore.bulkCreate(generateCableCores(cableId, total));
  } else if (replace) {
    await InfrastructureCoreConnection.destroy({
      where: {
        [Op.or]: [
          { source_core_id: existing.map((c) => c.id) },
          { target_core_id: existing.map((c) => c.id) }
        ]
      }
    });
    await InfrastructureSubscriberCore.destroy({
      where: { core_id: existing.map((c) => c.id) }
    });
    await InfrastructureCableCore.destroy({ where: { cable_id: cableId } });
    await InfrastructureCableCore.bulkCreate(generateCableCores(cableId, total));
  }

  const meta = (link.metadata && typeof link.metadata === 'object') ? { ...link.metadata } : {};
  meta.core_count = total;
  await link.update({ metadata: meta });

  const rows = await InfrastructureCableCore.findAll({
    where: { cable_id: cableId },
    order: [['core_number', 'ASC']]
  });
  return rows.map(serializeCore);
}

async function listByCable(cableId) {
  const cores = await InfrastructureCableCore.findAll({
    where: { cable_id: cableId },
    order: [['core_number', 'ASC']]
  });
  const ids = cores.map((c) => c.id);
  const [conns, drops] = await Promise.all([
    ids.length ? InfrastructureCoreConnection.findAll({
      where: { [Op.or]: [{ source_core_id: ids }, { target_core_id: ids }] }
    }) : [],
    ids.length ? InfrastructureSubscriberCore.findAll({ where: { core_id: ids } }) : []
  ]);
  return {
    cores: cores.map(serializeCore),
    connections: conns,
    subscriber_cores: drops
  };
}

async function updateCore(id, patch) {
  const core = await InfrastructureCableCore.findByPk(id);
  if (!core) {
    const err = new Error('Core tidak ditemukan.');
    err.status = 404;
    throw err;
  }
  const next = {};
  if (patch.status != null) {
    if (!CORE_STATUSES.includes(patch.status)) {
      const err = new Error('Status core tidak valid.');
      err.status = 400;
      throw err;
    }
    next.status = patch.status;
  }
  if (patch.attenuation_db !== undefined) {
    next.attenuation_db = patch.attenuation_db === '' || patch.attenuation_db == null
      ? null
      : Number(patch.attenuation_db);
  }
  if (patch.notes !== undefined) next.notes = patch.notes;
  await core.update(next);
  return serializeCore(core);
}

async function spliceCores({ source_core_id, target_core_id, target_device_type, target_device_id, target_port, connection_kind, spliced_by }) {
  if (!source_core_id) {
    const err = new Error('Core asal wajib diisi.');
    err.status = 400;
    throw err;
  }
  if (!target_core_id && !target_device_type) {
    const err = new Error('Isi core tujuan atau port perangkat tujuan.');
    err.status = 400;
    throw err;
  }
  if (target_core_id && Number(source_core_id) === Number(target_core_id)) {
    const err = new Error('Core tidak dapat disambungkan ke dirinya sendiri.');
    err.status = 400;
    throw err;
  }

  const trx = await sequelize.transaction();
  try {
    const sourceCore = await InfrastructureCableCore.findByPk(source_core_id, { transaction: trx });
    if (!sourceCore) {
      await trx.rollback();
      const err = new Error('Core asal tidak ditemukan.');
      err.status = 404;
      throw err;
    }
    if (sourceCore.status === 'damaged') {
      await trx.rollback();
      const err = new Error('Gagal splicing: core asal rusak (damaged).');
      err.status = 400;
      throw err;
    }

    let targetCore = null;
    if (target_core_id) {
      targetCore = await InfrastructureCableCore.findByPk(target_core_id, { transaction: trx });
      if (!targetCore) {
        await trx.rollback();
        const err = new Error('Core tujuan tidak ditemukan.');
        err.status = 404;
        throw err;
      }
      if (targetCore.status === 'damaged') {
        await trx.rollback();
        const err = new Error('Gagal splicing: core tujuan rusak (damaged).');
        err.status = 400;
        throw err;
      }
    }

    const connection = await InfrastructureCoreConnection.create({
      source_core_id,
      target_core_id: target_core_id || null,
      target_device_type: target_device_type || null,
      target_device_id: target_device_id || null,
      target_port: target_port || null,
      connection_kind: connection_kind || (target_core_id ? 'splice' : 'patch'),
      spliced_by: spliced_by || 'Teknisi System',
      splice_date: new Date()
    }, { transaction: trx });

    const toActivate = [sourceCore.id];
    if (targetCore) toActivate.push(targetCore.id);
    await InfrastructureCableCore.update(
      { status: 'active' },
      { where: { id: toActivate }, transaction: trx }
    );

    await trx.commit();
    return connection;
  } catch (e) {
    if (!trx.finished) await trx.rollback();
    throw e;
  }
}

async function removeConnection(id) {
  const conn = await InfrastructureCoreConnection.findByPk(id);
  if (!conn) {
    const err = new Error('Sambungan tidak ditemukan.');
    err.status = 404;
    throw err;
  }
  const coreIds = [conn.source_core_id, conn.target_core_id].filter(Boolean);
  await conn.destroy();
  for (const cid of coreIds) {
    const leftover = await InfrastructureCoreConnection.count({
      where: { [Op.or]: [{ source_core_id: cid }, { target_core_id: cid }] }
    });
    const drop = await InfrastructureSubscriberCore.count({ where: { core_id: cid } });
    if (!leftover && !drop) {
      await InfrastructureCableCore.update({ status: 'idle' }, { where: { id: cid, status: 'active' } });
    }
  }
  return true;
}

async function assignSubscriber({ core_id, subscriber_id, odp_port_number }) {
  const core = await InfrastructureCableCore.findByPk(core_id);
  if (!core) {
    const err = new Error('Core tidak ditemukan.');
    err.status = 404;
    throw err;
  }
  if (core.status === 'damaged') {
    const err = new Error('Core rusak tidak bisa di-assign ke pelanggan.');
    err.status = 400;
    throw err;
  }
  const customer = await Customer.findByPk(subscriber_id);
  if (!customer) {
    const err = new Error('Pelanggan tidak ditemukan.');
    err.status = 404;
    throw err;
  }
  const existing = await InfrastructureSubscriberCore.findOne({ where: { core_id } });
  if (existing) {
    await existing.update({ subscriber_id, odp_port_number: odp_port_number || null, assigned_at: new Date() });
    await core.update({ status: 'active' });
    return existing;
  }
  const row = await InfrastructureSubscriberCore.create({
    core_id,
    subscriber_id,
    odp_port_number: odp_port_number || null,
    assigned_at: new Date()
  });
  await core.update({ status: 'active' });
  return row;
}

async function unassignSubscriber(id) {
  const row = await InfrastructureSubscriberCore.findByPk(id);
  if (!row) {
    const err = new Error('Assignment tidak ditemukan.');
    err.status = 404;
    throw err;
  }
  const coreId = row.core_id;
  await row.destroy();
  const leftover = await InfrastructureCoreConnection.count({
    where: { [Op.or]: [{ source_core_id: coreId }, { target_core_id: coreId }] }
  });
  if (!leftover) {
    await InfrastructureCableCore.update({ status: 'idle' }, { where: { id: coreId, status: 'active' } });
  }
  return true;
}

async function loadCoreContext(coreId) {
  const core = await InfrastructureCableCore.findByPk(coreId);
  if (!core) return null;
  const link = await InfrastructureLink.findByPk(core.cable_id, {
    include: [
      { model: InfrastructurePoint, as: 'fromPoint' },
      { model: InfrastructurePoint, as: 'toPoint' }
    ]
  });
  return { core: serializeCore(core), link };
}

async function trace({ customer_id, core_id }) {
  let startCoreId = core_id ? Number(core_id) : null;
  let customer = null;
  if (customer_id) {
    customer = await Customer.findByPk(customer_id);
    if (!customer) {
      const err = new Error('Pelanggan tidak ditemukan.');
      err.status = 404;
      throw err;
    }
    const drop = await InfrastructureSubscriberCore.findOne({
      where: { subscriber_id: customer_id },
      order: [['assigned_at', 'DESC']]
    });
    if (drop) startCoreId = drop.core_id;
    else if (customer.infra_parent_id && !startCoreId) {
      const err = new Error('Pelanggan belum terhubung ke dropcore. Assign core ODP dulu.');
      err.status = 404;
      throw err;
    }
  }
  if (!startCoreId) {
    const err = new Error('Isi customer_id atau core_id untuk tracing.');
    err.status = 400;
    throw err;
  }

  const hops = [];
  const seenCores = new Set();
  const queue = [startCoreId];
  while (queue.length) {
    const cid = queue.shift();
    if (seenCores.has(cid)) continue;
    seenCores.add(cid);
    const ctx = await loadCoreContext(cid);
    if (!ctx) continue;
    hops.push(ctx);
    const conns = await InfrastructureCoreConnection.findAll({
      where: { [Op.or]: [{ source_core_id: cid }, { target_core_id: cid }] }
    });
    for (const c of conns) {
      hops[hops.length - 1].connections = hops[hops.length - 1].connections || [];
      hops[hops.length - 1].connections.push(c);
      if (c.source_core_id && !seenCores.has(c.source_core_id)) queue.push(c.source_core_id);
      if (c.target_core_id && !seenCores.has(c.target_core_id)) queue.push(c.target_core_id);
    }
  }

  const drop = startCoreId
    ? await InfrastructureSubscriberCore.findOne({ where: { core_id: startCoreId } })
    : null;
  if (!customer && drop) customer = await Customer.findByPk(drop.subscriber_id);

  const path = hops.map((h) => {
    const from = h.link && h.link.fromPoint;
    const to = h.link && h.link.toPoint;
    return {
      core: h.core,
      cable: h.link ? {
        id: h.link.id,
        name: h.link.name,
        from_point: from ? { id: from.id, name: from.name, type: from.type } : null,
        to_point: to ? { id: to.id, name: to.name, type: to.type } : null
      } : null,
      connections: h.connections || []
    };
  });

  const summary = [];
  if (customer) summary.push(`Pelanggan ${customer.name || customer.customer_id || customer.id}`);
  for (const step of path) {
    const c = step.core;
    const cable = step.cable;
    const ends = [cable && cable.from_point, cable && cable.to_point].filter(Boolean);
    const label = ends.map((p) => `${(p.type || '').toUpperCase()} ${p.name}`).join(' ↔ ');
    summary.push(`Core ${c.core_number} ${c.color_code} · ${label || 'Kabel #' + c.cable_id}`);
    for (const conn of step.connections) {
      if (conn.target_device_type) {
        summary.push(`${conn.target_device_type}${conn.target_port ? ' ' + conn.target_port : ''}`);
      }
    }
  }

  return {
    customer: customer ? {
      id: customer.id,
      customer_id: customer.customer_id,
      name: customer.name,
      infra_parent_id: customer.infra_parent_id
    } : null,
    subscriber_core: drop,
    hops: path,
    trail: summary
  };
}

async function listCables() {
  const links = await InfrastructureLink.findAll({
    where: { link_type: { [Op.in]: ['fiber', 'trunk'] } },
    include: [
      { model: InfrastructurePoint, as: 'fromPoint', attributes: ['id', 'name', 'type'] },
      { model: InfrastructurePoint, as: 'toPoint', attributes: ['id', 'name', 'type'] }
    ],
    order: [['updated_at', 'DESC']]
  });
  const counts = await InfrastructureCableCore.findAll({
    attributes: [
      'cable_id',
      [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN status='active' THEN 1 ELSE 0 END")), 'active'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN status='idle' THEN 1 ELSE 0 END")), 'idle'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN status='damaged' THEN 1 ELSE 0 END")), 'damaged'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN status='reserved' THEN 1 ELSE 0 END")), 'reserved']
    ],
    group: ['cable_id'],
    raw: true
  });
  const byCable = {};
  for (const r of counts) {
    byCable[r.cable_id] = {
      total: Number(r.total) || 0,
      active: Number(r.active) || 0,
      idle: Number(r.idle) || 0,
      damaged: Number(r.damaged) || 0,
      reserved: Number(r.reserved) || 0
    };
  }
  return links.map((l) => {
    const meta = l.metadata && typeof l.metadata === 'object' ? l.metadata : {};
    return {
      id: l.id,
      name: l.name,
      link_type: l.link_type,
      status: l.status,
      from_point: l.fromPoint,
      to_point: l.toPoint,
      core_count: byCable[l.id]?.total || meta.core_count || 0,
      cores: byCable[l.id] || { total: 0, active: 0, idle: 0, damaged: 0, reserved: 0 }
    };
  });
}

module.exports = {
  generateForCable,
  listByCable,
  updateCore,
  spliceCores,
  removeConnection,
  assignSubscriber,
  unassignSubscriber,
  trace,
  listCables,
  ALLOWED_CORE_COUNTS,
  CORE_STATUSES
};
