'use strict';

/**
 * Panduan mitra: hubungkan MikroTik tanpa IP public.
 * ROS 7 → WireGuard. ROS 6 → L2TP/IPsec (bawaan, tanpa paket WireGuard).
 * Modul RADIUS (FreeRADIUS SQL) bukan pekerjaan mitra.
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
  'wg_enabled',
  'vpn_server_host'
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

function buildWireguardV7(guide) {
  const endpoint = guide.endpoint_host || 'IP_PUBLIK_FIBERIX';
  const port = guide.endpoint_port || 51820;
  const serverPub = guide.server_public_key || 'SERVER_PUBLIC_KEY';
  const serverIp = stripCidr(guide.server_address || DEFAULT_SERVER_ADDR);
  const radius = guide.radius_host;
  const tunnel = guide.example_tunnel_ip;
  const allowed = `${serverIp}/32,${radius}/32`;
  return [
    '# Fiberix — RouterOS 7 (WireGuard bawaan)',
    '# Ganti MY_PRIVATE_KEY dan RADIUS_SECRET dari owner. Jangan buka Modul RADIUS.',
    `/interface/wireguard/add name=wg-fiberix private-key="${escapeRos('MY_PRIVATE_KEY')}" listen-port=0 comment="FIBERIX"`,
    `/ip/address/add address=${tunnel}/32 interface=wg-fiberix comment="FIBERIX"`,
    `/interface/wireguard/peers/add interface=wg-fiberix \\`,
    `    public-key="${escapeRos(serverPub)}" \\`,
    `    endpoint-address=${endpoint} endpoint-port=${port} \\`,
    `    allowed-address=${allowed} persistent-keepalive=25s comment="FIBERIX"`,
    `/ip/route/add dst-address=${serverIp}/32 gateway=wg-fiberix comment="FIBERIX"`,
    `/ip/route/add dst-address=${radius}/32 gateway=wg-fiberix comment="FIBERIX"`,
    `/radius/add service=ppp,hotspot address=${radius} secret="RADIUS_SECRET" timeout=3s comment="FIBERIX"`,
    '/ppp/aaa/set use-radius=yes accounting=yes interim-update=5m'
  ].join('\n');
}

function buildL2tpV6(guide) {
  const host = guide.l2tp_host || guide.endpoint_host || 'IP_PUBLIK_FIBERIX';
  const radius = guide.radius_host;
  const serverIp = stripCidr(guide.server_address || DEFAULT_SERVER_ADDR);
  return [
    '# Fiberix — RouterOS 6 (L2TP/IPsec bawaan, TANPA WireGuard)',
    '# Ganti L2TP_USER / L2TP_PASS / IPSEC_PSK / RADIUS_SECRET dari owner.',
    `/interface l2tp-client add name=l2tp-fiberix connect-to=${host} \\`,
    '    user=L2TP_USER password=L2TP_PASS \\',
    '    use-ipsec=yes ipsec-secret="IPSEC_PSK" \\',
    '    add-default-route=no disabled=no comment="FIBERIX"',
    `/ip route add dst-address=${serverIp}/32 gateway=l2tp-fiberix comment="FIBERIX"`,
    `/ip route add dst-address=${radius}/32 gateway=l2tp-fiberix comment="FIBERIX"`,
    `/radius add service=ppp,hotspot address=${radius} secret="RADIUS_SECRET" timeout=3s comment="FIBERIX"`,
    '/ppp aaa set use-radius=yes accounting=yes interim-update=5m'
  ].join('\n');
}

function buildMitraMikrotikGuide(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const endpointHost = String(s.wg_endpoint_host || '').trim();
  const l2tpHost = String(s.vpn_server_host || endpointHost || '').trim();
  const endpointPort = parseInt(s.wg_listen_port, 10) || 51820;
  const serverAddress = stripCidr(s.wg_server_address) || DEFAULT_SERVER_ADDR;
  const subnet = s.wg_tunnel_subnet || DEFAULT_SUBNET;
  const serverPublicKey = String(s.wg_server_public_key || '').trim();
  const radiusHost = String(s.radius_host || process.env.RADIUS_HOST || DEFAULT_RADIUS_HOST).trim();
  const wgEnabled = String(s.wg_enabled || '').toLowerCase() === 'true';
  const endpointIsPrivate = isPrivateHost(endpointHost);
  const l2tpIsPrivate = isPrivateHost(l2tpHost);
  const reachableFromInternet = Boolean(endpointHost) && !endpointIsPrivate;
  const l2tpReachable = Boolean(l2tpHost) && !l2tpIsPrivate;

  const guide = {
    title: 'Hubungkan MikroTik',
    show_radius_module: false,
    ros6_method: 'l2tp',
    ros7_method: 'wireguard',
    radius_host: radiusHost,
    endpoint_host: endpointHost,
    endpoint_port: endpointPort,
    endpoint_display: endpointHost ? `${endpointHost}:${endpointPort}` : `IP_PUBLIK_FIBERIX:${endpointPort}`,
    l2tp_host: l2tpHost,
    l2tp_display: l2tpHost ? `${l2tpHost}:1701` : 'IP_PUBLIK_FIBERIX:1701',
    endpoint_is_private: endpointIsPrivate,
    l2tp_is_private: l2tpIsPrivate,
    reachable_from_internet: reachableFromInternet,
    l2tp_reachable_from_internet: l2tpReachable,
    server_address: serverAddress,
    tunnel_subnet: subnet,
    example_tunnel_ip: DEFAULT_TUNNEL_EXAMPLE,
    server_public_key: serverPublicKey,
    wireguard_enabled: wgEnabled,
    api_port: 8728,
    winbox_port: 8291
  };

  guide.scripts = {
    v7: buildWireguardV7(guide),
    v6: buildL2tpV6(guide)
  };
  guide.verify_v7 = [
    '/interface wireguard peers print',
    `/ping ${serverAddress} count=4`,
    `/ping ${radiusHost} count=4`,
    '/radius print'
  ];
  guide.verify_v6 = [
    '/interface l2tp-client print',
    `/ping ${serverAddress} count=4`,
    `/ping ${radiusHost} count=4`,
    '/radius print'
  ];
  guide.verify_commands = guide.verify_v7.concat(['', '# RouterOS 6:'], guide.verify_v6);
  guide.owner_action_needed = !reachableFromInternet && !l2tpReachable;

  const missing = !endpointHost && !l2tpHost;
  if (missing) {
    guide.endpoint_warning = 'Owner belum mengisi host VPN publik. Mitra di internet belum bisa nyambung.';
  } else if (endpointIsPrivate && l2tpIsPrivate) {
    guide.endpoint_warning =
      `Host VPN sekarang masih LAN (${guide.l2tp_display} / ${guide.endpoint_display}). Itu hanya tembus dari jaringan Fiberix. Mitra remote butuh IP/DNS publik + port UDP 51820 (ROS7) atau UDP 1701 + IPsec (ROS6).`;
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
