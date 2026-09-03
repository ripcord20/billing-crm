'use strict';

/**
 * Hub WireGuard untuk MikroTik di luar LAN: CORE 1 interface wg-core2.
 * Bukan tunnel Fiberix (10.10.0.0/24, UDP 51820).
 */

const { escapeRos, stripCidr, DEFAULT_PPP_POOL, DEFAULT_PPP_LOCAL, DEFAULT_RADIUS_HOST } = require('./nasRouterOsScript');

const CORE1_HUB = {
  deviceName: 'CORE 1',
  deviceIp: '192.168.91.1',
  iface: 'wg-core2',
  listenPort: 51823,
  endpointHost: '103.195.65.216',
  serverTunnelIp: '10.202.0.1',
  subnet: '10.202.0.0/24',
  fallbackPublicKey: 'wpS/pSEUnACQEkEeS7lzNh4IDxSsoOW+ZdWP2ehi1DA=',
  clientIface: 'wg-core1',
  clientAllowedAddress: '10.202.0.1/32,192.168.22.99/32,192.168.22.9/32,192.168.91.1/32',
  keepalive: '25s',
  fiberixLan: '192.168.22.99',
  radiusHost: DEFAULT_RADIUS_HOST
};

function getHubConfig(env = process.env) {
  const deviceId = parseInt(env.CORE1_DEVICE_ID, 10);
  const listenPort = parseInt(env.CORE1_WG_PORT, 10);
  return {
    ...CORE1_HUB,
    endpointHost: env.CORE1_WG_ENDPOINT || CORE1_HUB.endpointHost,
    listenPort: listenPort > 0 ? listenPort : CORE1_HUB.listenPort,
    iface: env.CORE1_WG_IFACE || CORE1_HUB.iface,
    deviceId: deviceId > 0 ? deviceId : null
  };
}

function hostsFromText(text) {
  const out = [];
  const re = /10\.202\.0\.(\d+)/g;
  const s = String(text || '');
  let m;
  while ((m = re.exec(s))) {
    const n = Number(m[1]);
    if (n >= 0 && n <= 255) out.push(n);
  }
  return out;
}

function collectUsedHosts({ nasRows = [], devices = [], peers = [] } = {}) {
  const hosts = new Set([0, 1, 255]);
  const addFrom = (value) => {
    for (const h of hostsFromText(value)) hosts.add(h);
  };
  for (const n of nasRows) {
    addFrom(n && n.nasname);
    addFrom(n && n.tunnel_address);
  }
  for (const d of devices) addFrom(d && d.ip_address);
  for (const p of asList(peers)) addFrom(peerAllowed(p));
  return hosts;
}

function nextTunnelIp(usedHosts) {
  const used = usedHosts instanceof Set ? usedHosts : new Set([...usedHosts].map(Number));
  used.add(0);
  used.add(1);
  used.add(255);
  for (let i = 2; i <= 254; i++) {
    if (!used.has(i)) return `10.202.0.${i}`;
  }
  throw new Error('Pool tunnel 10.202.0.0/24 penuh');
}

function asList(raw) {
  if (raw == null || raw === '') return [];
  return Array.isArray(raw) ? raw : [raw];
}

function peerPublicKey(p) {
  return String((p && (p['public-key'] || p.publicKey)) || '');
}

function peerAllowed(p) {
  return String((p && (p['allowed-address'] || p.allowedAddress)) || '');
}

function peerComment(p) {
  return String((p && p.comment) || '');
}

function ifaceByName(ifaces, name) {
  return asList(ifaces).find((i) => i && i.name === name) || null;
}

function ifacePublicKey(iface) {
  return String((iface && (iface['public-key'] || iface.publicKey)) || '');
}

function findExistingPeer(peers, { publicKey, allowedHost, comment } = {}) {
  const list = asList(peers);
  if (publicKey) {
    const byKey = list.find((p) => peerPublicKey(p) === publicKey);
    if (byKey) return byKey;
  }
  if (allowedHost) {
    const needle = stripCidr(allowedHost);
    const byAddr = list.find((p) => hostsFromText(peerAllowed(p)).some((h) => `10.202.0.${h}` === needle));
    if (byAddr) return byAddr;
  }
  if (comment) {
    const byComment = list.find((p) => peerComment(p) === comment);
    if (byComment) return byComment;
  }
  return null;
}

function rosSafeName(name) {
  return String(name || 'CABANG').replace(/[\r\n"]+/g, ' ').trim().slice(0, 60) || 'CABANG';
}

function isCore1TunnelHost(ip) {
  const m = String(stripCidr(ip) || '').match(/^10\.202\.0\.(\d+)$/);
  if (!m) return false;
  const n = Number(m[1]);
  return n >= 2 && n <= 254;
}

function buildCore1RemoteClientScript(opts) {
  const hub = opts.hub || getHubConfig();
  const name = rosSafeName(opts.name);
  const comment = escapeRos(name);
  const iface = opts.clientIface || hub.clientIface;
  const tunnelIp = stripCidr(opts.tunnelIp);
  const tunnelCidr = opts.tunnelCidr || `${tunnelIp}/24`;
  const privateKey = escapeRos(opts.privateKey);
  const serverPublicKey = escapeRos(opts.serverPublicKey || hub.fallbackPublicKey);
  const endpointHost = opts.endpointHost || hub.endpointHost;
  const endpointPort = opts.endpointPort || hub.listenPort;
  const allowed = opts.allowedAddress || hub.clientAllowedAddress;
  const keepalive = opts.keepalive || hub.keepalive;
  const radiusHost = opts.radiusHost || hub.radiusHost;
  const secret = opts.secret ? escapeRos(opts.secret) : '';
  const pppPool = String(opts.pppPool || '').trim();
  const pppLocal = String(opts.pppLocal || '').trim();
  const fiberixLan = hub.fiberixLan;
  const hubIp = hub.serverTunnelIp;

  const lines = [
    `# Fiberix — cabang remote ${name} ke CORE 1`,
    `# IP tunnel: ${tunnelCidr}  (nasname RADIUS = ${tunnelIp})`,
    `# Peer di CORE 1 ${hub.iface} sudah dibuat otomatis. Tempel script ini di New Terminal MikroTik cabang.`,
    `# Jangan generate VPN Fiberix (bukan tunnel 10.10 di server billing).`,
    '',
    ':put "Hapus wg-core1 lama jika ada..."',
    `:if ([:len [/interface wireguard find where name="${iface}"]] > 0) do={`,
    `  /interface wireguard remove [find where name="${iface}"]`,
    '}',
    ':foreach i in=[/ip firewall filter find where comment="CORE1-API"] do={/ip firewall filter remove $i}',
    '',
    `/interface wireguard add name=${iface} listen-port=0 private-key="${privateKey}" comment="${comment}"`,
    `/ip address add address=${tunnelCidr} interface=${iface} comment="CORE1"`,
    `/interface wireguard peers add interface=${iface} \\`,
    `    public-key="${serverPublicKey}" \\`,
    `    endpoint-address=${endpointHost} endpoint-port=${endpointPort} \\`,
    `    allowed-address=${allowed} \\`,
    `    persistent-keepalive=${keepalive} comment="CORE1"`,
    '',
    `# Izinkan API/Winbox dari CORE 1 dan Fiberix`,
    `/ip firewall filter add chain=input action=accept protocol=tcp dst-port=80,443,8088,8728,8729,8291 src-address=${hubIp} comment="CORE1-API"`,
    `/ip firewall filter add chain=input action=accept protocol=tcp dst-port=80,443,8088,8728,8729,8291 src-address=${fiberixLan} comment="CORE1-API"`
  ];

  if (secret) {
    lines.push(
      '',
      `# RADIUS Fiberix (paket keluar lewat tunnel, sumber = ${tunnelIp})`,
      `/radius add service=ppp,hotspot address=${radiusHost} secret="${secret}" timeout=3s comment="FIBERIX"`,
      '/radius incoming set accept=yes',
      '/ppp aaa set use-radius=yes accounting=yes interim-update=00:04:00'
    );
  }
  if (pppPool && pppLocal) {
    lines.push(
      `/ip pool add name=FIBERIX ranges=${pppPool} comment="FIBERIX"`,
      `/ppp profile add name=FIBERIX local-address=${pppLocal} remote-address=FIBERIX comment="FIBERIX"`
    );
  }

  lines.push(
    '',
    `:put "Selesai. Cek handshake: /interface wireguard peers print"`,
    `:put "Ping CORE 1: /ping ${hubIp} count=5"`
  );
  return lines.join('\n');
}

module.exports = {
  CORE1_HUB,
  DEFAULT_PPP_POOL,
  DEFAULT_PPP_LOCAL,
  getHubConfig,
  hostsFromText,
  collectUsedHosts,
  nextTunnelIp,
  asList,
  peerPublicKey,
  peerAllowed,
  peerComment,
  ifaceByName,
  ifacePublicKey,
  findExistingPeer,
  rosSafeName,
  isCore1TunnelHost,
  buildCore1RemoteClientScript
};
