'use strict';

/**
 * WireguardService
 * ──────────────────────────────────────────────────────────────────────────
 * Integrasi VPN WireGuard untuk modul NAS. Fungsi utama:
 *   - Simpan/ambil konfigurasi server WireGuard (di app_settings).
 *   - Generate keypair WireGuard (Curve25519) murni pakai Node crypto — tidak
 *     butuh binari `wg` terpasang, jadi bisa jalan di mana saja.
 *   - Alokasi alamat tunnel (IP) berikutnya yang bebas dari subnet.
 *   - Auto-create peer untuk sebuah NAS + generate config klien (siap tempel
 *     ke MikroTik) dan blok [Peer] untuk sisi server.
 *   - Best-effort apply/remove peer ke interface `wg` lokal bila `wg` tersedia
 *     (kalau tidak ada, peer tetap tersimpan di billing untuk dipasang manual).
 *
 * Catatan kunci WireGuard: private key = 32 byte acak yang di-"clamp", public
 * key = X25519(base, private). Node `generateKeyPairSync('x25519')` sudah
 * meng-clamp private key, jadi ekspor 32 byte mentahnya valid untuk WireGuard.
 */

const crypto = require('crypto');
const { execFile } = require('child_process');
const QRCode = require('qrcode');
const { AppSetting } = require('../models');
const { encryptSecret, decryptSecret } = require('../utils/secretBox');
const logger = require('../utils/logger');
const { isPrivateHost } = require('../utils/mitraMikrotikGuide');

const PHONE_PEERS_KEY = 'wg_phone_peers';
const DEFAULT_RADIUS_HOST = process.env.RADIUS_HOST || '192.168.22.9';

// ── Settings helpers ────────────────────────────────────────────────────────
async function getSetting(key, fallback = null) {
  try {
    const s = await AppSetting.findOne({ where: { key } });
    return s && s.value != null ? s.value : fallback;
  } catch (_) {
    return fallback;
  }
}

async function setSetting(key, value, type = 'string') {
  const [row, created] = await AppSetting.findOrCreate({
    where: { key },
    defaults: { key, value: value == null ? null : String(value), type }
  });
  if (!created) await row.update({ value: value == null ? null : String(value) });
  return row;
}

// ── Key generation (Curve25519 / WireGuard format) ───────────────────────────
function generateKeypair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('x25519');
  const priv = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  const pub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return {
    privateKey: priv.toString('base64'),
    publicKey: pub.toString('base64')
  };
}

function generatePresharedKey() {
  return crypto.randomBytes(32).toString('base64');
}

// ── IPv4 helpers (tanpa dependency) ─────────────────────────────────────────
function ipToInt(ip) {
  const parts = String(ip).trim().split('.').map((n) => parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    throw new Error('IPv4 tidak valid: ' + ip);
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function intToIp(int) {
  return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
}

function parseCidr(cidr) {
  const [addr, bitsRaw] = String(cidr).trim().split('/');
  const bits = parseInt(bitsRaw, 10);
  if (Number.isNaN(bits) || bits < 0 || bits > 32) throw new Error('CIDR tidak valid: ' + cidr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const network = (ipToInt(addr) & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { network, broadcast, bits, mask };
}

function stripCidr(ip) {
  return String(ip || '').split('/')[0].trim();
}

// ── WireGuard server config ─────────────────────────────────────────────────
const DEFAULTS = {
  wg_tunnel_subnet: '10.10.0.0/24',
  wg_server_address: '10.10.0.1',
  wg_listen_port: '51820',
  wg_keepalive: '25',
  wg_interface: 'wg0'
};

async function getServerConfig() {
  const [
    enabled, endpointHost, listenPort, serverPub, serverPrivEnc,
    subnet, serverAddr, dns, iface, keepalive
  ] = await Promise.all([
    getSetting('wg_enabled', 'false'),
    getSetting('wg_endpoint_host', ''),
    getSetting('wg_listen_port', DEFAULTS.wg_listen_port),
    getSetting('wg_server_public_key', ''),
    getSetting('wg_server_private_key', ''),
    getSetting('wg_tunnel_subnet', DEFAULTS.wg_tunnel_subnet),
    getSetting('wg_server_address', DEFAULTS.wg_server_address),
    getSetting('wg_dns', ''),
    getSetting('wg_interface', DEFAULTS.wg_interface),
    getSetting('wg_keepalive', DEFAULTS.wg_keepalive)
  ]);
  return {
    enabled: String(enabled) === 'true',
    endpointHost: endpointHost || '',
    listenPort: parseInt(listenPort, 10) || 51820,
    serverPublicKey: serverPub || '',
    serverPrivateKey: serverPrivEnc ? decryptSecret(serverPrivEnc) : '',
    hasServerKeys: !!(serverPub && serverPrivEnc),
    tunnelSubnet: subnet || DEFAULTS.wg_tunnel_subnet,
    serverAddress: stripCidr(serverAddr) || DEFAULTS.wg_server_address,
    dns: dns || '',
    iface: iface || DEFAULTS.wg_interface,
    keepalive: parseInt(keepalive, 10) || 25
  };
}

/** Config server yang aman untuk dikirim ke frontend (tanpa private key). */
async function getServerConfigPublic() {
  const c = await getServerConfig();
  return {
    enabled: c.enabled,
    endpointHost: c.endpointHost,
    listenPort: c.listenPort,
    serverPublicKey: c.serverPublicKey,
    hasServerKeys: c.hasServerKeys,
    tunnelSubnet: c.tunnelSubnet,
    serverAddress: c.serverAddress,
    dns: c.dns,
    iface: c.iface,
    keepalive: c.keepalive
  };
}

async function saveServerConfig(patch = {}) {
  const map = {
    enabled: ['wg_enabled', (v) => (v ? 'true' : 'false')],
    endpointHost: ['wg_endpoint_host', (v) => String(v || '')],
    listenPort: ['wg_listen_port', (v) => String(parseInt(v, 10) || 51820)],
    tunnelSubnet: ['wg_tunnel_subnet', (v) => String(v || DEFAULTS.wg_tunnel_subnet)],
    serverAddress: ['wg_server_address', (v) => stripCidr(v) || DEFAULTS.wg_server_address],
    dns: ['wg_dns', (v) => String(v || '')],
    iface: ['wg_interface', (v) => String(v || DEFAULTS.wg_interface)],
    keepalive: ['wg_keepalive', (v) => String(parseInt(v, 10) || 25)]
  };
  for (const [field, [key, norm]] of Object.entries(map)) {
    if (patch[field] !== undefined) await setSetting(key, norm(patch[field]));
  }
  return getServerConfigPublic();
}

/** Buat keypair server bila belum ada (idempotent). */
async function ensureServerKeys() {
  const pub = await getSetting('wg_server_public_key', '');
  const priv = await getSetting('wg_server_private_key', '');
  if (pub && priv) return { created: false, publicKey: pub };
  const kp = generateKeypair();
  await setSetting('wg_server_public_key', kp.publicKey);
  await setSetting('wg_server_private_key', encryptSecret(kp.privateKey));
  logger.info('[WireGuard] Server keypair generated');
  return { created: true, publicKey: kp.publicKey };
}

// ── Alokasi alamat tunnel ────────────────────────────────────────────────────
/**
 * Cari IP tunnel bebas berikutnya dalam subnet. Melewati network, broadcast,
 * alamat server, dan semua tunnel_address NAS yang sudah terpakai.
 */
async function listPhonePeers() {
  const raw = await getSetting(PHONE_PEERS_KEY, '[]');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

async function savePhonePeers(list) {
  await setSetting(PHONE_PEERS_KEY, JSON.stringify(list));
  return list;
}

async function allocateTunnelIp(excludeNasId = null) {
  const cfg = await getServerConfig();
  const { network, broadcast } = parseCidr(cfg.tunnelSubnet);
  const serverInt = ipToInt(cfg.serverAddress);

  const used = new Set();
  try {
    const { NasDevice } = require('../models');
    if (NasDevice) {
      const rows = await NasDevice.findAll({
        where: {},
        attributes: ['id', 'tunnel_address']
      });
      for (const r of rows) {
        if (excludeNasId && r.id === excludeNasId) continue;
        if (r.tunnel_address) {
          try { used.add(ipToInt(stripCidr(r.tunnel_address))); } catch (_) {}
        }
      }
    }
  } catch (_) { /* model NAS belum ada di cabang ini */ }

  const phones = await listPhonePeers();
  for (const p of phones) {
    if (!p || !p.tunnelAddress) continue;
    try { used.add(ipToInt(stripCidr(p.tunnelAddress))); } catch (_) {}
  }

  for (let ip = network + 1; ip < broadcast; ip++) {
    if (ip === serverInt) continue;
    if (used.has(ip)) continue;
    return intToIp(ip) + '/32';
  }
  throw new Error('Subnet tunnel penuh — tidak ada IP bebas di ' + cfg.tunnelSubnet);
}

// ── Config generation ────────────────────────────────────────────────────────
/**
 * Blok [Peer] untuk ditaruh di konfigurasi server WireGuard.
 */
function buildServerPeerBlock({ publicKey, presharedKey, tunnelAddress, shortname }) {
  const lines = [];
  if (shortname) lines.push(`# ${shortname}`);
  lines.push('[Peer]');
  lines.push(`PublicKey = ${publicKey}`);
  if (presharedKey) lines.push(`PresharedKey = ${presharedKey}`);
  lines.push(`AllowedIPs = ${stripCidr(tunnelAddress)}/32`);
  return lines.join('\n');
}

/**
 * Config wg-quick untuk sisi klien (MikroTik/router). Berisi private key peer.
 */
function buildClientConfig({
  privateKey, tunnelAddress, dns,
  serverPublicKey, presharedKey, endpoint, allowedIps, keepalive
}) {
  const lines = ['[Interface]'];
  lines.push(`PrivateKey = ${privateKey}`);
  lines.push(`Address = ${tunnelAddress}`);
  if (dns) lines.push(`DNS = ${dns}`);
  lines.push('');
  lines.push('[Peer]');
  lines.push(`PublicKey = ${serverPublicKey}`);
  if (presharedKey) lines.push(`PresharedKey = ${presharedKey}`);
  lines.push(`Endpoint = ${endpoint}`);
  lines.push(`AllowedIPs = ${allowedIps}`);
  lines.push(`PersistentKeepalive = ${keepalive || 25}`);
  return lines.join('\n');
}

/**
 * Perintah setara untuk MikroTik RouterOS (interface wireguard + peer).
 */
function buildMikrotikCommands({
  ifaceName, privateKey, tunnelAddress, serverPublicKey,
  presharedKey, endpointHost, endpointPort, allowedIps, keepalive
}) {
  const addr = stripCidr(tunnelAddress);
  const bits = (String(tunnelAddress).split('/')[1] || '32');
  const cmds = [
    `/interface/wireguard/add name=${ifaceName} private-key="${privateKey}"`,
    `/ip/address/add address=${addr}/${bits} interface=${ifaceName}`,
    `/interface/wireguard/peers/add interface=${ifaceName} \\`,
    `    public-key="${serverPublicKey}" \\`,
    (presharedKey ? `    preshared-key="${presharedKey}" \\` : null),
    `    endpoint-address=${endpointHost} endpoint-port=${endpointPort} \\`,
    `    allowed-address=${allowedIps} persistent-keepalive=${keepalive || 25}s`
  ].filter(Boolean);
  return cmds.join('\n');
}

/** QR PNG (data URL) untuk aplikasi WireGuard HP. Bukan barcode MikroTik. */
async function toQrDataUrl(clientConfig) {
  const text = String(clientConfig || '').trim();
  if (!text) throw new Error('Config WireGuard kosong');
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    type: 'image/png'
  });
}

function phoneAllowedIps(serverAddress, radiusHost) {
  const server = stripCidr(serverAddress || '10.10.0.1');
  const radius = stripCidr(radiusHost || DEFAULT_RADIUS_HOST);
  if (radius && radius !== server) return `${server}/32,${radius}/32`;
  return `${server}/32`;
}

// ── Best-effort apply ke interface wg lokal ─────────────────────────────────
function hasWgBinary() {
  return new Promise((resolve) => {
    execFile('sh', ['-c', 'command -v wg'], (err, stdout) => {
      resolve(!err && !!String(stdout).trim());
    });
  });
}

function wgSetPeer(iface, publicKey, presharedKey, allowedIp) {
  return new Promise((resolve) => {
    const args = ['set', iface, 'peer', publicKey, 'allowed-ips', `${stripCidr(allowedIp)}/32`];
    // presharedKey via file dihindari; jalankan tanpa PSK di apply otomatis.
    execFile('wg', args, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, message: String(stderr || err.message) });
      resolve({ ok: true });
    });
  });
}

function wgRemovePeer(iface, publicKey) {
  return new Promise((resolve) => {
    execFile('wg', ['set', iface, 'peer', publicKey, 'remove'], (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, message: String(stderr || err.message) });
      resolve({ ok: true });
    });
  });
}

/**
 * Generate (atau regenerate) peer WireGuard untuk sebuah NAS. Menyimpan kunci
 * & alamat tunnel di record NAS, mengembalikan config klien lengkap (sekali
 * tampil) beserta blok server & perintah MikroTik.
 */
async function generatePeerForNas(nas, opts = {}) {
  const cfg = await getServerConfig();
  if (!cfg.endpointHost) {
    throw new Error('Endpoint server WireGuard belum diatur. Isi dulu di pengaturan WireGuard (endpoint host).');
  }
  await ensureServerKeys();
  const server = await getServerConfig();

  const kp = generateKeypair();
  const psk = opts.usePresharedKey === false ? '' : generatePresharedKey();

  // Alamat tunnel: pertahankan yang lama bila regenerate & sudah ada, else alokasi.
  let tunnelAddress = nas.tunnel_address;
  if (!tunnelAddress || opts.reallocate) {
    tunnelAddress = await allocateTunnelIp(nas.id);
  }

  const endpoint = `${server.endpointHost}:${server.listenPort}`;
  // Klien merutekan ke IP tunnel server (agar RADIUS/billing terjangkau lewat tunnel).
  const allowedIps = opts.allowedIps || `${server.serverAddress}/32`;

  await nas.update({
    conn_mode: 'vpn',
    vpn_type: 'wireguard',
    tunnel_address: tunnelAddress,
    wg_public_key: kp.publicKey,
    wg_private_key: encryptSecret(kp.privateKey),
    wg_preshared_key: psk ? encryptSecret(psk) : null,
    wg_endpoint: endpoint,
    wg_allowed_ips: allowedIps,
    wg_keepalive: server.keepalive
  });

  // Best-effort apply peer ke interface lokal (kalau server ini yang jadi WG server).
  let applied = { attempted: false };
  if (await hasWgBinary()) {
    applied = { attempted: true, ...(await wgSetPeer(server.iface, kp.publicKey, psk, tunnelAddress)) };
    if (applied.ok) await nas.update({ wg_last_applied_at: new Date() });
  }

  const [endpointHost, endpointPort] = endpoint.split(':');
  const clientConfig = buildClientConfig({
    privateKey: kp.privateKey,
    tunnelAddress,
    dns: server.dns,
    serverPublicKey: server.serverPublicKey,
    presharedKey: psk,
    endpoint,
    allowedIps,
    keepalive: server.keepalive
  });
  const serverPeerBlock = buildServerPeerBlock({
    publicKey: kp.publicKey,
    presharedKey: psk,
    tunnelAddress,
    shortname: nas.shortname || nas.nasname
  });
  const mikrotikCommands = buildMikrotikCommands({
    ifaceName: 'wg-billing',
    privateKey: kp.privateKey,
    tunnelAddress,
    serverPublicKey: server.serverPublicKey,
    presharedKey: psk,
    endpointHost,
    endpointPort,
    allowedIps,
    keepalive: server.keepalive
  });

  return {
    tunnel_address: tunnelAddress,
    public_key: kp.publicKey,
    endpoint,
    allowed_ips: allowedIps,
    client_config: clientConfig,
    qr_data_url: await toQrDataUrl(clientConfig),
    endpoint_is_private: isPrivateHost(server.endpointHost),
    server_peer_block: serverPeerBlock,
    mikrotik_commands: mikrotikCommands,
    applied
  };
}

/**
 * Peer khusus HP (bukan MikroTik). Kunci berbeda supaya tidak bentrok dengan
 * router yang sudah handshake. Private key hanya dikembalikan sekali (QR).
 */
async function generatePhonePeer(opts = {}) {
  const cfg = await getServerConfig();
  if (!cfg.endpointHost) {
    throw new Error('Endpoint server WireGuard belum diatur. Isi dulu di pengaturan WireGuard (endpoint host).');
  }
  await ensureServerKeys();
  const server = await getServerConfig();
  const kp = generateKeypair();
  const psk = opts.usePresharedKey === false ? '' : generatePresharedKey();
  const tunnelAddress = await allocateTunnelIp(null);
  const endpoint = `${server.endpointHost}:${server.listenPort}`;
  const allowedIps = opts.allowedIps || phoneAllowedIps(server.serverAddress, DEFAULT_RADIUS_HOST);
  const label = String(opts.label || 'HP tes').trim().slice(0, 48) || 'HP tes';

  const clientConfig = buildClientConfig({
    privateKey: kp.privateKey,
    tunnelAddress,
    dns: '',
    serverPublicKey: server.serverPublicKey,
    presharedKey: psk,
    endpoint,
    allowedIps,
    keepalive: server.keepalive
  });
  const serverPeerBlock = buildServerPeerBlock({
    publicKey: kp.publicKey,
    presharedKey: psk,
    tunnelAddress,
    shortname: label
  });

  let applied = { attempted: false };
  if (await hasWgBinary()) {
    applied = { attempted: true, ...(await wgSetPeer(server.iface, kp.publicKey, psk, tunnelAddress)) };
  }

  const peers = await listPhonePeers();
  peers.push({
    label,
    publicKey: kp.publicKey,
    tunnelAddress,
    endpoint,
    createdAt: new Date().toISOString()
  });
  await savePhonePeers(peers);

  return {
    label,
    tunnel_address: tunnelAddress,
    public_key: kp.publicKey,
    endpoint,
    allowed_ips: allowedIps,
    client_config: clientConfig,
    qr_data_url: await toQrDataUrl(clientConfig),
    server_peer_block: serverPeerBlock,
    endpoint_is_private: isPrivateHost(server.endpointHost),
    applied,
    filename: 'fiberix-hp.conf'
  };
}

/** Hapus peer dari interface lokal (best-effort) saat NAS dihapus/di-reset. */
async function removePeerForNas(nas) {
  if (!nas || !nas.wg_public_key) return { attempted: false };
  const cfg = await getServerConfig();
  if (await hasWgBinary()) {
    return { attempted: true, ...(await wgRemovePeer(cfg.iface, nas.wg_public_key)) };
  }
  return { attempted: false };
}

module.exports = {
  getSetting,
  setSetting,
  generateKeypair,
  generatePresharedKey,
  getServerConfig,
  getServerConfigPublic,
  saveServerConfig,
  ensureServerKeys,
  allocateTunnelIp,
  buildServerPeerBlock,
  buildClientConfig,
  buildMikrotikCommands,
  generatePeerForNas,
  generatePhonePeer,
  toQrDataUrl,
  phoneAllowedIps,
  listPhonePeers,
  removePeerForNas,
  // exported for tests
  _ipToInt: ipToInt,
  _intToIp: intToIp,
  _parseCidr: parseCidr
};
