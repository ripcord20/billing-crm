'use strict';

const { Op } = require('sequelize');
const { NasDevice, Device } = require('../models');
const Wireguard = require('./WireguardService');
const RadiusProv = require('./RadiusProvisionService');
const RadiusSQL = require('./RadiusSqlService');
const { getMikrotikInstanceByDevice } = require('./MikrotikService');
const { encryptSecret, decryptSecret } = require('../utils/secretBox');
const { getTenantId } = require('../middleware/tenantContext');
const logger = require('../utils/logger');
const {
  CORE1_HUB,
  DEFAULT_PPP_POOL,
  DEFAULT_PPP_LOCAL,
  getHubConfig,
  collectUsedHosts,
  nextTunnelIp,
  asList,
  ifaceByName,
  ifacePublicKey,
  findExistingPeer,
  rosSafeName,
  isCore1TunnelHost,
  buildCore1RemoteClientScript
} = require('../utils/core1RemoteWg');
const { stripCidr } = require('../utils/nasRouterOsScript');

async function findCore1Device(hub = getHubConfig()) {
  if (hub.deviceId) {
    const byId = await Device.findByPk(hub.deviceId);
    if (byId) return byId;
  }
  const exact = await Device.findOne({ where: { name: hub.deviceName } });
  if (exact) return exact;
  const byIp = await Device.findOne({ where: { ip_address: hub.deviceIp } });
  if (byIp) return byIp;
  const like = await Device.findOne({
    where: { name: { [Op.like]: '%CORE 1%' } }
  });
  if (like) return like;
  throw new Error('Device CORE 1 tidak ditemukan di Device Management. Tambah dulu router CORE 1.');
}

async function core1Mikrotik(hub = getHubConfig()) {
  const device = await findCore1Device(hub);
  const mt = await getMikrotikInstanceByDevice(device.id);
  if (!mt) throw new Error('Tidak bisa membuat koneksi API ke CORE 1');
  return { device, mt };
}

async function listHubIfaces(mt) {
  return asList(await mt.get('/interface/wireguard'));
}

async function listHubPeers(mt) {
  return asList(await mt.get('/interface/wireguard/peers'));
}

async function readHubInterface(mt, hub = getHubConfig()) {
  const iface = ifaceByName(await listHubIfaces(mt), hub.iface);
  if (!iface) {
    throw new Error(`Interface ${hub.iface} tidak ada di CORE 1. Buat dulu WireGuard hub di CORE 1.`);
  }
  return iface;
}

function peerRestId(peer) {
  return peer && (peer['.id'] || peer.id || peer['.ret'] || null);
}

async function addPeerOnHub(mt, { iface, publicKey, allowedAddress, comment, keepalive }) {
  const peers = (await listHubPeers(mt)).filter((p) => (p.interface || '') === iface);
  const existing = findExistingPeer(peers, { publicKey, allowedHost: allowedAddress });
  if (existing) {
    return { created: false, existing: true, peer: existing };
  }
  await mt.put('/interface/wireguard/peers', {
    interface: iface,
    'public-key': publicKey,
    'allowed-address': allowedAddress,
    'persistent-keepalive': keepalive || '25s',
    comment
  });
  return { created: true, existing: false };
}

async function removePeerByPublicKey(publicKey) {
  if (!publicKey) return { removed: false };
  const hub = getHubConfig();
  const { mt } = await core1Mikrotik(hub);
  const peers = (await listHubPeers(mt)).filter((p) => (p.interface || '') === hub.iface);
  const peer = findExistingPeer(peers, { publicKey });
  const id = peerRestId(peer);
  if (!id) return { removed: false };
  await mt.delete(`/interface/wireguard/peers/${encodeURIComponent(id)}`);
  return { removed: true };
}

async function usedHostsFromDbAndHub(mt) {
  const hub = getHubConfig();
  const [nasRows, devices, peers] = await Promise.all([
    NasDevice.findAll({ attributes: ['nasname', 'tunnel_address'] }),
    Device.findAll({ attributes: ['ip_address'] }),
    mt ? listHubPeers(mt).then((rows) => rows.filter((p) => (p.interface || '') === hub.iface)) : Promise.resolve([])
  ]);
  return collectUsedHosts({
    nasRows: nasRows.map((r) => r.get({ plain: true })),
    devices: devices.map((r) => r.get({ plain: true })),
    peers
  });
}

async function createLinkedDevice({ name, tunnelIp, location, apiPort, apiUsername, apiPassword }) {
  const fields = {
    name: `${name} (WG)`,
    ip_address: tunnelIp,
    type: 'router',
    brand: 'MikroTik',
    monitoring_type: 'api',
    api_port: apiPort,
    api_protocol: 'rest-http',
    api_username: apiUsername || 'admin',
    api_password: apiPassword || '',
    status: 'offline',
    is_active: true,
    location: location || null,
    notes: `Tunnel CORE 1 ${CORE1_HUB.iface} — IP ${tunnelIp}. Jangan generate VPN Fiberix.`
  };
  try {
    return await Device.create({ ...fields, winbox_port: 8291 });
  } catch (_) {
    return Device.create(fields);
  }
}

async function pushNasRow(row) {
  try {
    const server = await RadiusProv.resolveServer(row.radius_server_id);
    if (!server) return { success: false, message: 'Server RADIUS belum dikonfigurasi' };
    await RadiusSQL.upsertNas(server, {
      nasname: row.nasname,
      shortname: row.shortname,
      type: row.type,
      ports: row.ports,
      secret: row.secret,
      community: row.community,
      description: row.description
    });
    const patch = { last_sync_at: new Date(), last_error: null };
    if (!row.radius_server_id && server.id) patch.radius_server_id = server.id;
    await row.update(patch);
    return { success: true, server_id: server.id };
  } catch (e) {
    await row.update({ last_error: String(e.message).slice(0, 250) });
    return { success: false, message: e.message };
  }
}

function buildScriptFor({
  name, privateKey, serverPublicKey, tunnelIp, endpointHost, endpointPort, secret, pppPool, pppLocal, hub
}) {
  return buildCore1RemoteClientScript({
    hub,
    name,
    privateKey,
    serverPublicKey,
    tunnelIp,
    endpointHost,
    endpointPort,
    secret,
    pppPool,
    pppLocal
  });
}

async function provision(input = {}) {
  const hub = getHubConfig();
  const name = rosSafeName(input.name);
  const secret = String(input.secret || '').trim();
  if (!input.name || !String(input.name).trim()) {
    throw new Error('Nama cabang wajib');
  }
  if (!secret || secret === '********') {
    throw new Error('Secret RADIUS wajib');
  }

  const existingName = await NasDevice.findOne({
    where: { shortname: name }
  });
  if (existingName) {
    throw new Error(`NAS dengan nama "${name}" sudah ada (id ${existingName.id})`);
  }

  const apiPort = parseInt(input.apiPort, 10) || 80;
  const location = String(input.location || '').trim() || null;
  const apiUsername = String(input.apiUsername || 'admin').trim() || 'admin';
  const apiPassword = String(input.apiPassword || '');
  const pppPool = String(input.pppPool || DEFAULT_PPP_POOL).trim();
  const pppLocal = String(input.pppLocal || DEFAULT_PPP_LOCAL).trim();

  const { device: hubDevice, mt } = await core1Mikrotik(hub);
  const hubIface = await readHubInterface(mt, hub);
  const serverPublicKey = ifacePublicKey(hubIface) || hub.fallbackPublicKey;
  if (!serverPublicKey) {
    throw new Error('Public key CORE 1 wg-core2 kosong');
  }
  const liveListen = parseInt(hubIface['listen-port'] || hubIface.listenPort, 10);
  const endpointPort = liveListen > 0 ? liveListen : hub.listenPort;

  const used = await usedHostsFromDbAndHub(mt);
  const tunnelIp = nextTunnelIp(used);
  if (!isCore1TunnelHost(tunnelIp)) {
    throw new Error('Alokasi IP tunnel tidak valid');
  }

  const takenNas = await NasDevice.findOne({ where: { nasname: tunnelIp } });
  if (takenNas) {
    throw new Error(`IP tunnel ${tunnelIp} sudah dipakai NAS id ${takenNas.id}`);
  }

  const kp = Wireguard.generateKeypair();
  const comment = name;
  let peerResult = { created: false };
  try {
    peerResult = await addPeerOnHub(mt, {
      iface: hub.iface,
      publicKey: kp.publicKey,
      allowedAddress: `${tunnelIp}/32`,
      comment,
      keepalive: hub.keepalive
    });
  } catch (e) {
    logger.warn(`[core1-wg] gagal pasang peer CORE 1: ${e.message}`);
    throw new Error(`Gagal pasang peer di CORE 1: ${e.message}`);
  }

  let row;
  let device;
  try {
    row = await NasDevice.create({
      tenant_id: input.tenantId || getTenantId() || null,
      nasname: tunnelIp,
      shortname: name,
      type: 'mikrotik',
      conn_mode: 'public',
      vpn_type: null,
      tunnel_address: `${tunnelIp}/32`,
      ppp_pool_ranges: pppPool || null,
      ppp_local_address: pppLocal || null,
      secret,
      description: `Remote WG CORE 1 ${hub.iface} ${tunnelIp}`,
      is_active: true,
      wg_public_key: kp.publicKey,
      wg_private_key: encryptSecret(kp.privateKey),
      wg_endpoint: `${hub.endpointHost}:${endpointPort}`,
      wg_allowed_ips: hub.clientAllowedAddress,
      wg_keepalive: 25,
      wg_last_applied_at: new Date()
    });
    device = await createLinkedDevice({
      name,
      tunnelIp,
      location,
      apiPort,
      apiUsername,
      apiPassword
    });
    await row.update({ device_id: device.id });
  } catch (e) {
    if (peerResult.created) {
      try { await removePeerByPublicKey(kp.publicKey); } catch (_) {}
    }
    throw e;
  }

  const radiusSync = await pushNasRow(row);
  await row.reload();

  const script = buildScriptFor({
    name,
    privateKey: kp.privateKey,
    serverPublicKey,
    tunnelIp,
    endpointHost: hub.endpointHost,
    endpointPort,
    secret,
    pppPool,
    pppLocal,
    hub
  });

  logger.info(`[core1-wg] cabang ${name} tunnel=${tunnelIp} nas=${row.id} device=${device.id} hub_peer=${peerResult.created ? 'created' : 'exists'} hub_device=${hubDevice.id}`);

  return {
    nas_id: row.id,
    device_id: device.id,
    device_name: device.name,
    tunnel_ip: tunnelIp,
    tunnel_address: `${tunnelIp}/32`,
    endpoint: `${hub.endpointHost}:${endpointPort}`,
    hub_iface: hub.iface,
    hub_peer_created: !!peerResult.created,
    hub_public_key: serverPublicKey,
    radius_sync: radiusSync,
    mikrotik_script: script,
    notes: [
      'Tempel script di New Terminal MikroTik cabang (sekali). Private key hanya tampil sekarang.',
      `Peer CORE 1 ${hub.iface} ${peerResult.created ? 'sudah ditambah' : 'sudah ada'} untuk ${tunnelIp}/32.`,
      'Mode NAS = LAN / langsung. Jangan tombol VPN Fiberix.',
      'Script isolir/proxy lengkap: buka Detail NAS setelah handshake.'
    ]
  };
}

async function scriptForNas(row) {
  if (!row) throw new Error('NAS tidak ditemukan');
  if (!isCore1TunnelHost(row.nasname) && !isCore1TunnelHost(row.tunnel_address)) {
    throw new Error('NAS ini bukan cabang remote CORE 1 (10.202.0.x)');
  }
  if (!row.wg_private_key || !row.wg_public_key) {
    throw new Error('Kunci tunnel tidak tersimpan. Buat ulang dari tombol Cabang remote.');
  }
  const hub = getHubConfig();
  let serverPublicKey = hub.fallbackPublicKey;
  let endpointPort = hub.listenPort;
  try {
    const { mt } = await core1Mikrotik(hub);
    const hubIface = await readHubInterface(mt, hub);
    serverPublicKey = ifacePublicKey(hubIface) || serverPublicKey;
    const liveListen = parseInt(hubIface['listen-port'] || hubIface.listenPort, 10);
    if (liveListen > 0) endpointPort = liveListen;
  } catch (_) {
    const ep = String(row.wg_endpoint || '');
    const port = parseInt(ep.split(':')[1], 10);
    if (port > 0) endpointPort = port;
  }
  const privateKey = decryptSecret(row.wg_private_key);
  const tunnelIp = stripCidr(row.tunnel_address || row.nasname);
  return {
    nas_id: row.id,
    tunnel_ip: tunnelIp,
    endpoint: `${hub.endpointHost}:${endpointPort}`,
    hub_public_key: serverPublicKey,
    mikrotik_script: buildScriptFor({
      name: row.shortname || 'CABANG',
      privateKey,
      serverPublicKey,
      tunnelIp,
      endpointHost: hub.endpointHost,
      endpointPort,
      secret: row.secret,
      pppPool: row.ppp_pool_ranges,
      pppLocal: row.ppp_local_address,
      hub
    }),
    notes: [
      'Private key diambil dari data NAS yang tersimpan (terenkripsi).',
      'Tempel di New Terminal MikroTik cabang.'
    ]
  };
}

module.exports = {
  findCore1Device,
  addPeerOnHub,
  removePeerByPublicKey,
  provision,
  scriptForNas,
  listHubPeers,
  readHubInterface
};
