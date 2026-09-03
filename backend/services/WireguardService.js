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
const fs = require('fs');
const path = require('path');
const { AppSetting } = require('../models');
const { encryptSecret, decryptSecret } = require('../utils/secretBox');
const logger = require('../utils/logger');

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
async function allocateTunnelIp(excludeNasId = null) {
  const { NasDevice } = require('../models');
  const cfg = await getServerConfig();
  const { network, broadcast } = parseCidr(cfg.tunnelSubnet);
  const serverInt = ipToInt(cfg.serverAddress);

  const rows = await NasDevice.findAll({
    where: {},
    attributes: ['id', 'tunnel_address']
  });
  const used = new Set();
  for (const r of rows) {
    if (excludeNasId && r.id === excludeNasId) continue;
    if (r.tunnel_address) {
      try { used.add(ipToInt(stripCidr(r.tunnel_address))); } catch (_) {}
    }
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

// ── Best-effort apply ke interface wg lokal ─────────────────────────────────
function hasWgBinary() {
  return new Promise((resolve) => {
    execFile('sh', ['-c', 'command -v wg'], (err, stdout) => {
      resolve(!err && !!String(stdout).trim());
    });
  });
}

function runFile(cmd, args, timeout = 12000) {
  return new Promise((resolve) => {
    execFile(cmd, args, {
      timeout,
      env: {
        ...process.env,
        PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      }
    }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim(),
        message: err ? String((stderr || err.message || '')).slice(0, 240) : ''
      });
    });
  });
}

async function probeInterface(ifaceName) {
  let iface = ifaceName;
  if (!iface) {
    try {
      const cfg = await getServerConfig();
      iface = cfg.iface || 'wg_fiberix';
    } catch (_) {
      iface = 'wg_fiberix';
    }
  }
  const hasBin = await hasWgBinary();
  const show = await runFile('ip', ['-brief', 'link', 'show', iface]);
  const up = show.ok && /\bUP\b/.test(show.stdout);
  let listenPort = null;
  if (hasBin) {
    const wg = await runFile('wg', ['show', iface, 'listen-port']);
    if (wg.ok) listenPort = parseInt(wg.stdout, 10) || null;
  }
  return {
    iface,
    has_binary: hasBin,
    up,
    listen_port: listenPort,
    message: hasBin
      ? (up ? 'Interface WireGuard hidup' : 'Interface belum UP')
      : 'Paket wireguard-tools belum terpasang di server Fiberix'
  };
}

/**
 * Hidupkan interface WireGuard di server Fiberix ini (idempotent).
 * Node billing di produksi jalan sebagai root, jadi ip/wg bisa dipanggil langsung.
 */
async function ensureServerInterface() {
  const cfg = await getServerConfig();
  if (!cfg.enabled) {
    return { ok: false, skipped: true, message: 'WireGuard server nonaktif di pengaturan' };
  }
  if (!cfg.serverPrivateKey) {
    await ensureServerKeys();
  }
  const server = await getServerConfig();
  if (!server.serverPrivateKey) {
    return { ok: false, message: 'Kunci server WireGuard belum ada — generate keys dulu.' };
  }
  const iface = server.iface || 'wg_fiberix';
  const listen = server.listenPort || 51820;
  const cidrBits = String(server.tunnelSubnet || '10.10.0.0/24').split('/')[1] || '24';
  const addr = `${stripCidr(server.serverAddress)}/${cidrBits}`;

  await runFile('modprobe', ['wireguard']);
  if (!(await hasWgBinary())) {
    return { ok: false, message: 'Install paket wireguard-tools di server Fiberix, lalu klik Aktifkan interface.' };
  }

  const exists = await runFile('ip', ['link', 'show', 'dev', iface]);
  if (!exists.ok) {
    const add = await runFile('ip', ['link', 'add', 'dev', iface, 'type', 'wireguard']);
    if (!add.ok) {
      return { ok: false, message: 'Gagal membuat interface: ' + add.message };
    }
  }

  const keyDir = '/etc/wireguard';
  try { fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 }); } catch (_) {}
  const keyPath = path.join(keyDir, `${iface}.pkey`);
  try {
    fs.writeFileSync(keyPath, `${server.serverPrivateKey}\n`, { mode: 0o600 });
  } catch (e) {
    return { ok: false, message: 'Tidak bisa menulis kunci: ' + e.message };
  }

  const set = await runFile('wg', ['set', iface, 'listen-port', String(listen), 'private-key', keyPath]);
  if (!set.ok) return { ok: false, message: 'wg set gagal: ' + set.message };

  const hasAddr = await runFile('ip', ['-4', 'addr', 'show', 'dev', iface]);
  if (!hasAddr.stdout.includes(stripCidr(server.serverAddress))) {
    const addIp = await runFile('ip', ['address', 'add', addr, 'dev', iface]);
    if (!addIp.ok && !/File exists/i.test(addIp.message)) {
      logger.warn('[WireGuard] add address: ' + addIp.message);
    }
  }
  const up = await runFile('ip', ['link', 'set', 'dev', iface, 'up']);
  if (!up.ok) return { ok: false, message: 'Gagal UP interface: ' + up.message };

  await runFile('sysctl', ['-w', 'net.ipv4.ip_forward=1']);

  try {
    const { NasDevice } = require('../models');
    if (NasDevice) {
      const rows = await NasDevice.findAll({ where: { conn_mode: 'vpn' } });
      for (const row of rows) {
        if (!row.wg_public_key || !row.tunnel_address) continue;
        await wgSetPeer(iface, row.wg_public_key, '', row.tunnel_address);
      }
    }
  } catch (e) {
    logger.warn('[WireGuard] sync peer: ' + (e.message || e));
  }

  logger.info(`[WireGuard] interface ${iface} UP ${addr} udp/${listen}`);
  return { ok: true, iface, listen_port: listen, address: addr };
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
 * `wg show <iface> dump` — baris 1 interface, baris berikutnya peer:
 * public-key, psk, endpoint, allowed-ips, latest-handshake, rx, tx, keepalive
 */
function parseWgDump(text) {
  const map = new Map();
  const lines = String(text || '').trim().split('\n');
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 5) continue;
    const pub = cols[0];
    if (!pub) continue;
    map.set(pub, {
      endpoint: cols[2] && cols[2] !== '(none)' ? cols[2] : '',
      handshake: parseInt(cols[4], 10) || 0,
      rx: parseInt(cols[5], 10) || 0,
      tx: parseInt(cols[6], 10) || 0
    });
  }
  return map;
}

async function dumpPeerMap(iface) {
  let name = iface;
  if (!name) {
    try {
      const cfg = await getServerConfig();
      name = cfg.iface || 'wg0';
    } catch (_) {
      name = 'wg0';
    }
  }
  if (!(await hasWgBinary())) return new Map();
  return new Promise((resolve) => {
    execFile('wg', ['show', name, 'dump'], { timeout: 2500 }, (err, stdout) => {
      if (err) return resolve(new Map());
      resolve(parseWgDump(stdout));
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

  // Hidupkan interface server lalu pasang peer (best-effort).
  let applied = { attempted: false };
  const iface = await ensureServerInterface();
  if (iface.ok && (await hasWgBinary())) {
    applied = { attempted: true, ...(await wgSetPeer(server.iface, kp.publicKey, psk, tunnelAddress)) };
    if (applied.ok) await nas.update({ wg_last_applied_at: new Date() });
  } else if (!iface.ok && !iface.skipped) {
    applied = { attempted: true, ok: false, message: iface.message };
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
    server_peer_block: serverPeerBlock,
    mikrotik_commands: mikrotikCommands,
    applied
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
  removePeerForNas,
  parseWgDump,
  dumpPeerMap,
  ensureServerInterface,
  probeInterface,
  // exported for tests
  _ipToInt: ipToInt,
  _intToIp: intToIp,
  _parseCidr: parseCidr
};
