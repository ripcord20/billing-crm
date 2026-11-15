'use strict';

/**
 * Hub WireGuard untuk MikroTik di luar LAN: VPS Nevacloud wg0.
 * Bukan tunnel Fiberix Ubuntu (10.10.0.0/24) dan bukan CORE 1 wg-core2 (10.202.0.0/24).
 */

const { escapeRos, stripCidr, DEFAULT_PPP_POOL, DEFAULT_PPP_LOCAL, DEFAULT_RADIUS_HOST } = require('./nasRouterOsScript');

const CORE1_HUB = {
  deviceName: 'VPS Nevacloud',
  deviceIp: '103.169.206.24',
  iface: 'wg0',
  listenPort: 51820,
  endpointHost: '103.169.206.24',
  serverTunnelIp: '10.201.0.1',
  subnet: '10.201.0.0/24',
  subnetOctetPrefix: '10.201.0.',
  fallbackPublicKey: 'm0lijnuhLy91YcnDNrnqavNti9X5s9AO7jtu07LIS3g=',
  clientIface: 'wg-neva',
  clientAllowedAddress: '10.201.0.0/24,192.168.22.99/32,192.168.22.9/32,192.168.91.1/32,192.168.81.0/24,192.168.94.0/24,192.168.53.0/24,192.168.99.0/24,192.168.93.0/24',
  keepalive: '25s',
  fiberixLan: '192.168.22.99',
  radiusHost: DEFAULT_RADIUS_HOST,
  // .1 hub, .2 CORE 2, .19 CORE 1 sebagai peer VPS, .22 HP RBN
  reservedHosts: [1, 2, 19, 22],
  sshUser: 'root',
  sshHost: '103.169.206.24',
  sshKey: '/home/skynet/.ssh/id_ed25519'
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

function hostsFromText(text, prefix = CORE1_HUB.subnetOctetPrefix) {
  const out = [];
  const esc = String(prefix || '10.201.0.').replace(/\./g, '\\.');
  const re = new RegExp(esc + '(\\d+)', 'g');
  const s = String(text || '');
  let m;
  while ((m = re.exec(s))) {
    const n = Number(m[1]);
    if (n >= 0 && n <= 255) out.push(n);
  }
  return out;
}

function collectUsedHosts({ nasRows = [], devices = [], peers = [] } = {}) {
  const hosts = new Set([0, 1, 255, ...(CORE1_HUB.reservedHosts || [])]);
  const addFrom = (value) => {
    for (const h of hostsFromText(value)) hosts.add(h);
    for (const h of hostsFromText(value, '10.202.0.')) hosts.add(h);
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
  for (const h of CORE1_HUB.reservedHosts || []) used.add(h);
  for (let i = 2; i <= 254; i++) {
    if (!used.has(i)) return `${CORE1_HUB.subnetOctetPrefix}${i}`;
  }
  throw new Error(`Pool tunnel ${CORE1_HUB.subnet} penuh`);
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

function restId(row) {
  return (row && (row['.id'] || row.id || row['.ret'])) || null;
}

function findTunnelAddress(addrs, hubIp) {
  const ip = stripCidr(hubIp);
  if (!ip) return null;
  return asList(addrs).find((a) => a && stripCidr(a.address) === ip) || null;
}

function addressOnHub(addr, hubIface) {
  if (!addr) return false;
  return String(addr.interface || '') === String(hubIface);
}

function isFilterEnabled(row) {
  const d = row && row.disabled;
  return d !== true && d !== 'true' && d !== 'yes';
}

function hasUdpInputAccept(filters, port) {
  const want = String(port);
  return asList(filters).some((r) => {
    if (!r || r.chain !== 'input') return false;
    if (r.action !== 'accept') return false;
    if (!isFilterEnabled(r)) return false;
    const proto = String(r.protocol || '').toLowerCase();
    if (proto && proto !== 'udp') return false;
    const dst = String(r['dst-port'] || r.dstPort || '');
    return dst.split(',').map((p) => p.trim()).includes(want);
  });
}

function planHubEnsure({ ifaces, addrs, filters, hub }) {
  const ifaceName = hub.iface;
  const iface = ifaceByName(ifaces, ifaceName);
  const addr = findTunnelAddress(addrs, hub.serverTunnelIp);
  return {
    createIface: !iface,
    createAddress: !addr,
    moveAddress: !!(addr && !addressOnHub(addr, ifaceName)),
    addressId: addr ? restId(addr) : null,
    addFirewall: !hasUdpInputAccept(filters, hub.listenPort)
  };
}

function findExistingPeer(peers, { publicKey, allowedHost, comment } = {}) {
  const list = asList(peers);
  if (publicKey) {
    const byKey = list.find((p) => peerPublicKey(p) === publicKey);
    if (byKey) return byKey;
  }
  if (allowedHost) {
    const needle = stripCidr(allowedHost);
    const byAddr = list.find((p) => hostsFromText(peerAllowed(p)).some((h) => `${CORE1_HUB.subnetOctetPrefix}${h}` === needle));
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
  const host = String(stripCidr(ip) || '');
  const m = host.match(/^10\.201\.0\.(\d+)$/) || host.match(/^10\.202\.0\.(\d+)$/);
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
    `# Fiberix — cabang remote ${name} ke VPS Nevacloud`,
    `# IP tunnel: ${tunnelCidr}  (nasname RADIUS = ${tunnelIp})`,
    `# Hub: ${endpointHost}:${endpointPort} iface ${hub.iface}. Tempel di New Terminal MikroTik cabang.`,
    `# Jangan generate VPN Fiberix (bukan tunnel 10.10 di server billing).`,
    '',
    ':put "Hapus wg-neva / wg-core1 lama jika ada..."',
    `:if ([:len [/interface wireguard find where name="${iface}"]] > 0) do={`,
    `  /interface wireguard remove [find where name="${iface}"]`,
    '}',
    `:if ([:len [/interface wireguard find where name="wg-core1"]] > 0) do={`,
    '  /interface wireguard remove [find where name="wg-core1"]',
    '}',
    ':foreach i in=[/ip firewall filter find where comment="CORE1-API"] do={/ip firewall filter remove $i}',
    '',
    `/interface wireguard add name=${iface} listen-port=0 private-key="${privateKey}" comment="${comment}"`,
    `/ip address add address=${tunnelCidr} interface=${iface} comment="NEVA-WG"`,
    `/interface wireguard peers add interface=${iface} \\`,
    `    public-key="${serverPublicKey}" \\`,
    `    endpoint-address=${endpointHost} endpoint-port=${endpointPort} \\`,
    `    allowed-address=${allowed} \\`,
    `    persistent-keepalive=${keepalive} comment="NEVA-VPS"`,
    '',
    `# Izinkan API/Winbox dari hub VPS dan Fiberix`,
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
      `:if ([:len [/ip pool find where name="BILLINGRADIUS"]] = 0) do={ /ip pool add name=BILLINGRADIUS ranges=${pppPool} comment="FIBERIX" }`,
      `:if ([:len [/ppp profile find where name="BILLINGRADIUS"]] = 0) do={ /ppp profile add name=BILLINGRADIUS local-address=${pppLocal} remote-address=BILLINGRADIUS comment="FIBERIX" }`
    );
  }

  lines.push(
    '',
    `:put "Selesai. Cek handshake: /interface wireguard peers print"`,
    `:put "Ping hub VPS: /ping ${hubIp} count=5"`
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
  restId,
  findTunnelAddress,
  addressOnHub,
  hasUdpInputAccept,
  planHubEnsure,
  findExistingPeer,
  rosSafeName,
  isCore1TunnelHost,
  buildCore1RemoteClientScript
};
