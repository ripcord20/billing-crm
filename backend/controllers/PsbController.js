'use strict';

// Kanban /psb disembunyikan: form pasang baru ada di Sales (registrasi).
// API di bawah tetap ada supaya data lama tidak rusak.

const { Op } = require('sequelize');
const { applyTenantWhere, getTenantId, stampTenant } = require('../utils/tenantScope');
const { generateUniqueCustomerId } = require('../utils/helpers');
const flow = require('../services/PsbFlow');
const occupancy = require('../services/OdpOccupancy');
const stock = require('../services/WarehouseStock');
const { classifyRx } = require('../services/OntRedaman');

function include() {
  const {
    Package, Customer, WorkOrder, Invoice, InfrastructurePoint, WarehouseItem, User
  } = require('../models');
  return [
    { model: Package, as: 'package', attributes: ['id', 'name', 'price', 'speed_down', 'speed_up', 'mikrotik_profile'], required: false },
    { model: Customer, as: 'customer', attributes: ['id', 'customer_id', 'name', 'status', 'ont_sn', 'pppoe_username'], required: false },
    { model: WorkOrder, as: 'workOrder', attributes: ['id', 'wo_number', 'status', 'scheduled_date'], required: false },
    { model: Invoice, as: 'invoice', attributes: ['id', 'invoice_number', 'total', 'status', 'due_date'], required: false },
    { model: InfrastructurePoint, as: 'odp', attributes: ['id', 'name', 'type', 'capacity', 'used_ports'], required: false },
    { model: WarehouseItem, as: 'warehouseItem', attributes: ['id', 'serial_number', 'status', 'item_type', 'name'], required: false },
    { model: User, as: 'creator', attributes: ['id', 'name'], required: false }
  ];
}

async function ensureCustomer(job, extra = {}) {
  const { Customer } = require('../models');
  if (job.customer_id) {
    const c = await Customer.findByPk(job.customer_id);
    if (c) return c;
  }
  const cid = await generateUniqueCustomerId(Customer);
  const customer = await Customer.create(stampTenant({ user: extra.user }, {
    customer_id: cid,
    name: job.name,
    phone: job.phone,
    email: job.email,
    address: job.address,
    latitude: job.latitude,
    longitude: job.longitude,
    package_id: job.package_id,
    status: 'active',
    ont_sn: job.ont_serial || null,
    pppoe_username: job.pppoe_username || null,
    infra_parent_id: job.odp_id || null,
    notes: `PSB ${job.job_number}`
  }));
  await job.update({ customer_id: customer.id });
  try {
    const InfraSync = require('../services/CustomerInfraSyncService');
    await InfraSync.syncCustomerToInfra(customer);
  } catch (_) { /* best effort */ }
  return customer;
}

exports.index = async (req, res) => {
  try {
    const { PsbJob } = require('../models');
    const where = applyTenantWhere(req, {});
    if (req.query.stage) where.stage = req.query.stage;
    if (req.query.search) {
      const q = `%${req.query.search}%`;
      where[Op.or] = [
        { name: { [Op.like]: q } },
        { job_number: { [Op.like]: q } },
        { phone: { [Op.like]: q } },
        { ont_serial: { [Op.like]: q } }
      ];
    }
    const rows = await PsbJob.findAll({
      where,
      include: include(),
      order: [['created_at', 'DESC']],
      limit: 300
    });
    const counts = {};
    for (const s of flow.STAGES) counts[s] = 0;
    counts.cancelled = 0;
    for (const r of rows) counts[r.stage] = (counts[r.stage] || 0) + 1;
    res.json({ success: true, data: rows, counts, stages: flow.STAGES, labels: flow.STAGE_LABEL });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

function denyOtherTenant(req, row) {
  const tid = getTenantId(req);
  return !!(tid && Number(row.tenant_id) !== Number(tid));
}

exports.show = async (req, res) => {
  try {
    const { PsbJob } = require('../models');
    const job = await PsbJob.findByPk(req.params.id, { include: include() });
    if (!job || denyOtherTenant(req, job)) {
      return res.status(404).json({ success: false, message: 'PSB tidak ditemukan' });
    }
    res.json({ success: true, data: job, next: flow.nextStage(job.stage) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.phone || !b.address) {
      return res.status(400).json({ success: false, message: 'Nama, telepon, dan alamat wajib' });
    }
    const { PsbJob } = require('../models');
    const job = await PsbJob.create(stampTenant(req, {
      name: b.name,
      phone: b.phone,
      email: b.email || null,
      address: b.address,
      latitude: b.latitude || null,
      longitude: b.longitude || null,
      package_id: b.package_id || null,
      notes: b.notes || null,
      created_by: req.user?.id || null,
      stage: 'daftar'
    }));
    if (job.latitude && job.longitude) {
      try {
        const CoverageService = require('../services/CoverageService');
        const r = await CoverageService.check(job.latitude, job.longitude);
        if (r.ok && r.nearest_odp) {
          await job.update({ odp_id: r.nearest_odp.id, meta: { coverage: r } });
        }
      } catch (_) { /* coverage optional on create */ }
    }
    const fresh = await PsbJob.findByPk(job.id, { include: include() });
    res.status(201).json({ success: true, data: fresh, message: 'PSB dibuat' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.advance = async (req, res) => {
  try {
    const { PsbJob } = require('../models');
    const job = await PsbJob.findByPk(req.params.id, { include: include() });
    if (!job || denyOtherTenant(req, job)) {
      return res.status(404).json({ success: false, message: 'PSB tidak ditemukan' });
    }
    if (job.stage === 'done' || job.stage === 'cancelled') {
      return res.status(400).json({ success: false, message: 'PSB sudah selesai / batal' });
    }
    const target = req.body.stage || flow.nextStage(job.stage);
    if (!flow.canAdvance(job.stage, target)) {
      return res.status(400).json({ success: false, message: `Tidak bisa loncat ${job.stage} → ${target}` });
    }
    const result = await runStep(job, target, req.body || {}, req);
    if (!result.ok) return res.status(400).json({ success: false, message: result.message, data: result.data });
    await job.update({ stage: target, ...result.patch });
    const fresh = await PsbJob.findByPk(job.id, { include: include() });
    res.json({ success: true, data: fresh, message: result.message || `Tahap ${flow.STAGE_LABEL[target]}` });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.cancel = async (req, res) => {
  try {
    const { PsbJob } = require('../models');
    const job = await PsbJob.findByPk(req.params.id);
    if (!job || denyOtherTenant(req, job)) {
      return res.status(404).json({ success: false, message: 'PSB tidak ditemukan' });
    }
    await job.update({ stage: 'cancelled', notes: [job.notes, req.body.reason].filter(Boolean).join('\n') });
    res.json({ success: true, data: job });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

async function runStep(job, target, body, req) {
  const patch = {};
  if (target === 'survey') {
    const lat = body.latitude || job.latitude;
    const lng = body.longitude || job.longitude;
    if (lat && lng) {
      const CoverageService = require('../services/CoverageService');
      const r = await CoverageService.check(lat, lng);
      patch.latitude = lat;
      patch.longitude = lng;
      if (r.ok && r.nearest_odp) {
        const gate = await occupancy.assertOdpHasPort(r.nearest_odp.id);
        if (!gate.ok) return { ok: false, message: gate.message, data: gate.occupancy };
        patch.odp_id = r.nearest_odp.id;
      }
      patch.meta = Object.assign({}, job.meta || {}, { coverage: r });
    }
    return { ok: true, patch, message: 'Survey / coverage tersimpan' };
  }

  if (target === 'jadwal') {
    const { WorkOrder } = require('../models');
    patch.scheduled_date = body.scheduled_date || job.scheduled_date;
    patch.technician_name = body.technician_name || job.technician_name;
    patch.technician_user_id = body.technician_user_id || job.technician_user_id;
    if (!job.work_order_id) {
      const wo = await WorkOrder.create(stampTenant(req, {
        type: 'installation',
        status: patch.technician_user_id ? 'assigned' : 'pending',
        priority: 'medium',
        title: `PSB ${job.job_number} — ${job.name}`,
        description: job.address,
        assigned_user_id: patch.technician_user_id || null,
        technician_name: patch.technician_name || null,
        scheduled_date: patch.scheduled_date || null,
        location_address: job.address,
        latitude: job.latitude,
        longitude: job.longitude,
        created_by: req.user?.id || null
      }));
      patch.work_order_id = wo.id;
    }
    return { ok: true, patch, message: 'Teknisi dijadwalkan' };
  }

  if (target === 'stok') {
    let item = null;
    if (body.warehouse_item_id) {
      const { WarehouseItem } = require('../models');
      item = await WarehouseItem.findByPk(body.warehouse_item_id);
    } else if (body.serial_number) {
      item = await stock.findAvailableOnt(body.serial_number, getTenantId(req));
    }
    if (!item) return { ok: false, message: 'Pilih ONT dari gudang (serial)' };
    const moved = await stock.move(item.id, item.status === 'in_stock' ? 'checkout' : 'install', {
      technician_name: job.technician_name,
      technician_user_id: job.technician_user_id,
      psb_job_id: job.id,
      note: `Checkout PSB ${job.job_number}`
    }, req.user?.id);
    if (!moved.ok) return moved;
    patch.warehouse_item_id = item.id;
    patch.ont_serial = item.serial_number;
    return { ok: true, patch, message: `Stok ${item.serial_number} diambil` };
  }

  if (target === 'pasang') {
    const customer = await ensureCustomer(job, { user: req.user });
    patch.customer_id = customer.id;
    if (job.work_order_id) {
      const { WorkOrder } = require('../models');
      const wo = await WorkOrder.findByPk(job.work_order_id);
      if (wo && wo.status !== 'done') {
        await wo.update({ status: 'in_progress', customer_id: customer.id, started_at: new Date() });
      }
    }
    return { ok: true, patch, message: 'Pemasangan dicatat' };
  }

  if (target === 'bind') {
    const serial = String(body.ont_serial || job.ont_serial || '').trim();
    if (!serial) return { ok: false, message: 'Serial ONT wajib' };
    const customer = await ensureCustomer(job, { user: req.user });
    await customer.update({ ont_sn: serial, infra_parent_id: job.odp_id || customer.infra_parent_id });
    patch.ont_serial = serial;
    patch.customer_id = customer.id;
    const { OntDevice } = require('../models');
    const ont = await OntDevice.findOne({ where: { serial_number: serial } });
    if (ont) {
      await ont.update({ customer_id: customer.id });
      if (job.warehouse_item_id) {
        await stock.move(job.warehouse_item_id, 'install', {
          customer_id: customer.id,
          ont_device_id: ont.id,
          psb_job_id: job.id
        }, req.user?.id).catch(() => null);
      }
      if (ont.device_id) {
        try {
          const genieacs = require('../services/GenieacsService');
          const vlanSvc = require('../services/GenieacsVlan');
          const fetched = await genieacs.getDevice(ont.device_id);
          const built = vlanSvc.buildBindParameters(fetched.success ? fetched.data : {}, 100);
          if (built.ok && built.parameters.length) {
            await genieacs.setParameterValues(ont.device_id, built.parameters);
            patch.meta = Object.assign({}, job.meta || {}, { vlan_bind: { vlan: 100, queued: true } });
          }
        } catch (e) {
          patch.meta = Object.assign({}, job.meta || {}, { vlan_bind_error: e.message });
        }
      }
    }
    try {
      const InfraSync = require('../services/CustomerInfraSyncService');
      await InfraSync.syncCustomerToInfra(customer);
    } catch (_) { /* */ }
    return { ok: true, patch, message: `ONT ${serial} di-bind` };
  }

  if (target === 'redaman') {
    let rx = body.rx_power != null ? parseFloat(body.rx_power) : job.rx_power;
    if (rx == null && job.ont_serial) {
      const { OntDevice } = require('../models');
      const ont = await OntDevice.findOne({ where: { serial_number: job.ont_serial } });
      if (ont && ont.signal_strength != null) rx = parseFloat(ont.signal_strength);
    }
    if (rx == null) return { ok: false, message: 'Isi RX Power atau tunggu ONT inform' };
    const sev = classifyRx(rx);
    if (sev === 'critical' && !body.force) {
      return { ok: false, message: `Redaman ${rx} dBm kritis. Perbaiki dulu, atau kirim force=true` };
    }
    patch.rx_power = rx;
    patch.meta = Object.assign({}, job.meta || {}, { rx_severity: sev });
    return { ok: true, patch, message: `Redaman ${rx} dBm (${sev})` };
  }

  if (target === 'pppoe') {
    const customer = await ensureCustomer(job, { user: req.user });
    const username = String(body.pppoe_username || job.pppoe_username || customer.pppoe_username || job.phone.replace(/\D/g, '')).trim();
    const password = body.pppoe_password || username;
    await customer.update({ pppoe_username: username, connection_type: 'pppoe' });
    patch.pppoe_username = username;
    patch.customer_id = customer.id;
    const deviceId = body.device_id || customer.mikrotik_id;
    if (deviceId) {
      try {
        const { getMikrotikInstanceByDevice } = require('../services/MikrotikService');
        const mt = await getMikrotikInstanceByDevice(deviceId);
        const pkg = job.package;
        await mt.createPPPoESecret({
          name: username,
          password,
          profile: (pkg && pkg.mikrotik_profile) || 'default',
          comment: `PSB ${job.job_number} ${job.name}`
        });
        await customer.update({ mikrotik_id: deviceId });
        patch.meta = Object.assign({}, job.meta || {}, { pppoe_router: true });
      } catch (e) {
        patch.meta = Object.assign({}, job.meta || {}, { pppoe_router_error: e.message });
      }
    }
    return { ok: true, patch, message: `PPPoE ${username} disimpan` };
  }

  if (target === 'tagihan') {
    const customer = await ensureCustomer(job, { user: req.user });
    if (job.odp_id) {
      const gate = await occupancy.assertOdpHasPort(job.odp_id);
      if (!gate.ok) return { ok: false, message: gate.message, data: gate.occupancy };
      await customer.update({ infra_parent_id: job.odp_id });
      await occupancy.recountOne(job.odp_id);
    }
    const BillingController = require('../controllers/BillingController');
    const now = new Date();
    const result = await BillingController.generateInvoicesForPeriod(now.getMonth() + 1, now.getFullYear(), {
      source: 'psb',
      customerIds: [customer.id]
    });
    patch.customer_id = customer.id;
    if (result && result.created) {
      const { Invoice } = require('../models');
      const inv = await Invoice.findOne({ where: { customer_id: customer.id }, order: [['id', 'DESC']] });
      if (inv) patch.invoice_id = inv.id;
    }
    if (job.work_order_id) {
      const { WorkOrder } = require('../models');
      const wo = await WorkOrder.findByPk(job.work_order_id);
      if (wo) await wo.update({ status: 'done', completed_at: new Date(), customer_id: customer.id });
    }
    return { ok: true, patch, message: result?.created ? 'Tagihan pertama dibuat' : 'Pelanggan aktif (invoice mungkin sudah ada)' };
  }

  return { ok: true, patch: {} };
}

exports.runStep = runStep;
