'use strict';

const { Device } = require('../models');
const RadiusProv = require('./RadiusProvisionService');
const { getMikrotikInstanceByDevice } = require('./MikrotikService');
const {
  DEFAULT_BILLING_HOSTS,
  classifyCoreAlignment,
  summarizeNetwork
} = require('../utils/radiusAlignment');
const logger = require('../utils/logger');

function looksLikeCore(name) {
  return /core|bras|pppoe.?server/i.test(String(name || ''));
}

async function pickCoreDevices() {
  const routers = await Device.findAll({
    where: { type: 'router', is_active: true },
    order: [['id', 'ASC']],
    attributes: ['id', 'name', 'ip_address']
  });
  const cores = routers.filter((d) => looksLikeCore(d.name));
  return (cores.length ? cores : routers).map((d) => ({
    id: d.id,
    name: d.name,
    ip: d.ip_address
  }));
}

async function inspectDevice(device, opts) {
  try {
    const mt = await getMikrotikInstanceByDevice(device.id);
    const [clients, aaa] = await Promise.all([
      mt.getRadiusClients(),
      mt.getPppAaa().catch(() => ({ useRadius: null }))
    ]);
    const classified = classifyCoreAlignment(clients, {
      fiberixHosts: opts.fiberixHosts,
      billingHosts: opts.billingHosts,
      useRadius: aaa.useRadius
    });
    return {
      ok: true,
      device_id: device.id,
      name: device.name,
      ip: device.ip,
      use_radius: aaa.useRadius,
      ...classified
    };
  } catch (e) {
    logger.warn('[RadiusAlign] ' + device.name + ': ' + e.message);
    return {
      ok: false,
      device_id: device.id,
      name: device.name,
      ip: device.ip,
      phase: 'unreachable',
      status: 'warn',
      title: 'API CORE tidak terjangkau',
      summary: e.message,
      clients: [],
      issues: [e.message],
      next: [],
      use_radius: null
    };
  }
}

async function inspect(tenantId) {
  const server = await RadiusProv.resolveServer(null, tenantId);
  const fiberixHosts = [];
  if (server && server.host) fiberixHosts.push(server.host);
  const devices = await pickCoreDevices();
  const cores = [];
  for (const device of devices) {
    cores.push(await inspectDevice(device, {
      fiberixHosts,
      billingHosts: DEFAULT_BILLING_HOSTS
    }));
  }
  const network = summarizeNetwork(cores);
  return {
    fiberix: server
      ? { id: server.id, name: server.name, host: server.host, auth_port: server.auth_port || 1812 }
      : null,
    billingradius: { host: DEFAULT_BILLING_HOSTS[0], auth_port: 1812 },
    network,
    cores,
    playbook: 'deploy/freeradius-proxy/'
  };
}

module.exports = { inspect, pickCoreDevices, looksLikeCore };
