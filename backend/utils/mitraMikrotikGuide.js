'use strict';

/**
 * Panduan mitra ISP: hubungkan MikroTik ke billing Fiberix
 * tanpa IP public di sisi mitra (hanya outbound WireGuard).
 */

const DEFAULT_RADIUS_HOST = process.env.RADIUS_HOST || '192.168.22.9';
const DEFAULT_SERVER_ADDR = '10.10.0.1';
const DEFAULT_SUBNET = '10.10.0.0/24';
const DEFAULT_TUNNEL_EXAMPLE = '10.10.0.10';
const SETTING_KEYS = [
  'wg_endpoint_host',
  'wg_listen_port',
  'wg_server_address',
  'wg_tunnel_subnet',
  'wg_server_public_key',
  'wg_enabled'
];

function isPrivateHost(host) {
  const h = String(host || '').trim();
  if (!h) return true;
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h) && !/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = +m[1];
  const b = +m[2];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function stripCidr(ip) {
  return String(ip || '').split('/')[0];
}

function escapeRos(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildExampleScripts(guide) {
  const endpoint = guide.endpoint_host || 'IP_PUBLIK_FIBERIX';
  const port = guide.endpoint_port || 51820;
  const serverPub = guide.server_public_key || 'SERVER_PUBLIC_KEY';
  const serverIp = stripCidr(guide.server_address || DEFAULT_SERVER_ADDR);
  const radius = guide.radius_host || DEFAULT_RADIUS_HOST;
  const tunnel = guide.example_tunnel_ip;
  const allowed = `${serverIp}/32,${radius}/32`;

  const header = [
    '# FIBERIX — contoh script mitra TANPA IP public',
    '# Ganti MY_PRIVATE_KEY dan RADIUS_SECRET dengan nilai dari owner Fiberix.',
    `# Endpoint: ${endpoint}:${port}`,
    `# IP tunnel router ini (contoh): ${tunnel}`,
    '# Jangan tempel sebelum key peer dibuat — handshake akan gagal.',
    ''
  ];

  const v7 = [
    ...header,
    `/interface/wireguard/add name=wg-fiberix private-key="MY_PRIVATE_KEY" listen-port=0 comment="FIBERIX"`,
    `/ip/address/add address=${tunnel}/32 interface=wg-fiberix comment="FIBERIX"`,
    `/interface/wireguard/peers/add interface=wg-fiberix \\`,
    `    public-key="${escapeRos(serverPub)}" \\`,
    `    endpoint-address=${endpoint} endpoint-port=${port} \\`,
    `    allowed-address=${allowed} persistent-keepalive=25s comment="FIBERIX"`,
    `/ip/route/add dst-address=${serverIp}/32 gateway=wg-fiberix comment="FIBERIX"`,
    `/ip/route/add dst-address=${radius}/32 gateway=wg-fiberix comment="FIBERIX"`,
    `/radius/add service=ppp,hotspot address=${radius} secret="RADIUS_SECRET" timeout=3s comment="FIBERIX"`,
    '/radius/incoming/set accept=yes',
    '/ppp/aaa/set use-radius=yes accounting=yes interim-update=5m'
  ].join('\n');

  const v6 = [
    ...header,
    `/interface wireguard add name=wg-fiberix private-key="MY_PRIVATE_KEY" listen-port=0 comment="FIBERIX"`,
    `/ip address add address=${tunnel}/32 interface=wg-fiberix comment="FIBERIX"`,
    `/interface wireguard peers add interface=wg-fiberix \\`,
    `    public-key="${escapeRos(serverPub)}" \\`,
    `    endpoint-address=${endpoint} endpoint-port=${port} \\`,
    `    allowed-address=${allowed} persistent-keepalive=25s comment="FIBERIX"`,
    `/ip route add dst-address=${serverIp}/32 gateway=wg-fiberix comment="FIBERIX"`,
    `/ip route add dst-address=${radius}/32 gateway=wg-fiberix comment="FIBERIX"`,
    `/radius add service=ppp,hotspot address=${radius} secret="RADIUS_SECRET" timeout=3s comment="FIBERIX"`,
    '/radius incoming set accept=yes',
    '/ppp aaa set use-radius=yes accounting=yes interim-update=5m'
  ].join('\n');

  return { v7, v6 };
}

function buildVerifyCommands(guide) {
  const serverIp = stripCidr(guide.server_address || DEFAULT_SERVER_ADDR);
  const radius = guide.radius_host || DEFAULT_RADIUS_HOST;
  return [
    '/interface wireguard peers print',
    `/ping ${serverIp} count=4`,
    `/ping ${radius} count=4`,
    '/radius print',
    '/ppp aaa print'
  ];
}

function buildMitraMikrotikGuide(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const endpointHost = String(s.wg_endpoint_host || '').trim();
  const endpointPort = parseInt(s.wg_listen_port, 10) || 51820;
  const serverAddress = stripCidr(s.wg_server_address) || DEFAULT_SERVER_ADDR;
  const subnet = s.wg_tunnel_subnet || DEFAULT_SUBNET;
  const serverPublicKey = String(s.wg_server_public_key || '').trim();
  const radiusHost = String(s.radius_host || process.env.RADIUS_HOST || DEFAULT_RADIUS_HOST).trim();
  const wgEnabled = String(s.wg_enabled || '').toLowerCase() === 'true';
  const endpointIsPrivate = isPrivateHost(endpointHost);
  const reachableFromInternet = Boolean(endpointHost) && !endpointIsPrivate;

  const guide = {
    title: 'Hubungkan MikroTik tanpa IP public',
    radius_host: radiusHost,
    endpoint_host: endpointHost,
    endpoint_port: endpointPort,
    endpoint_display: endpointHost ? `${endpointHost}:${endpointPort}` : `IP_PUBLIK_FIBERIX:${endpointPort}`,
    endpoint_is_private: endpointIsPrivate,
    reachable_from_internet: reachableFromInternet,
    server_address: serverAddress,
    tunnel_subnet: subnet,
    example_tunnel_ip: DEFAULT_TUNNEL_EXAMPLE,
    server_public_key: serverPublicKey,
    wireguard_enabled: wgEnabled,
    api_port: 8728,
    winbox_port: 8291
  };

  guide.scripts = buildExampleScripts(guide);
  guide.verify_commands = buildVerifyCommands(guide);
  guide.owner_action_needed = !reachableFromInternet;

  if (!endpointHost) {
    guide.endpoint_warning = 'Endpoint WireGuard belum diisi. Owner Fiberix harus mengisi IP/DNS publik di pengaturan WireGuard Server.';
  } else if (endpointIsPrivate) {
    guide.endpoint_warning =
      `Endpoint sekarang ${guide.endpoint_display} (alamat LAN). Ini hanya tembus dari jaringan yang sama dengan server Fiberix. Mitra di internet tidak akan handshake sebelum endpoint diganti ke IP/DNS publik dan UDP ${endpointPort} dibuka.`;
  } else {
    guide.endpoint_warning = null;
  }

  return guide;
}

module.exports = {
  SETTING_KEYS,
  DEFAULT_RADIUS_HOST,
  DEFAULT_SERVER_ADDR,
  isPrivateHost,
  stripCidr,
  buildMitraMikrotikGuide
};
