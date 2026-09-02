'use strict';

/**
 * Satu script tempel MikroTik (mirip "Lihat Detail" BillingRadius),
 * tapi target FreeRADIUS sendiri (default 192.168.22.9) dan comment FIBERIX
 * supaya tidak menghapus object BILLINGRADIUS yang masih dipakai.
 */

const DEFAULT_RADIUS_HOST = process.env.RADIUS_HOST || '192.168.22.9';
const EXPIRED_POOL = '10.200.200.2-10.200.201.254';
const EXPIRED_GW = '10.200.200.1';
const EXPIRED_NET = '10.200.200.0/23';
const DEFAULT_PPP_POOL = '10.20.0.2-10.20.0.254';
const DEFAULT_PPP_LOCAL = '10.20.0.1';

function escapeRos(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function stripCidr(ip) {
  return String(ip || '').split('/')[0];
}

function formatIdDate(d) {
  const dt = d instanceof Date ? d : new Date();
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(dt);
  } catch (_) {
    return dt.toISOString();
  }
}

function buildCleanup(version) {
  const foreach = [
    ':foreach i in=[/interface wireguard find where comment~"FIBERIX"] do={/interface wireguard remove $i}',
    ':foreach i in=[/interface l2tp-client find where comment~"FIBERIX"] do={/interface l2tp-client remove $i}',
    ':foreach i in=[/ip address find where comment~"FIBERIX"] do={/ip address remove $i}',
    ':foreach i in=[/ip route find where comment~"FIBERIX"] do={/ip route remove $i}',
    ':foreach i in=[/radius find where comment~"FIBERIX"] do={/radius remove $i}',
    ':foreach i in=[/ip pool find where name~"FIBERIX"] do={/ip pool remove $i}',
    ':foreach i in=[/ppp profile find where name~"FIBERIX"] do={/ppp profile remove $i}',
    ':foreach i in=[/ip proxy access find where comment~"FIBERIX"] do={/ip proxy access remove $i}',
    ':foreach i in=[/ip firewall address-list find where comment~"FIBERIX"] do={/ip firewall address-list remove $i}',
    ':foreach i in=[/ip firewall filter find where comment~"FIBERIX"] do={/ip firewall filter remove $i}',
    ':foreach i in=[/ip firewall nat find where comment~"FIBERIX"] do={/ip firewall nat remove $i}'
  ];
  if (version === 'v7') {
    return [
      ':foreach i in=[/interface/wireguard/find where comment~"FIBERIX"] do={/interface/wireguard/remove $i}',
      ':foreach i in=[/interface/l2tp-client/find where comment~"FIBERIX"] do={/interface/l2tp-client/remove $i}',
      ':foreach i in=[/ip/address/find where comment~"FIBERIX"] do={/ip/address/remove $i}',
      ':foreach i in=[/ip/route/find where comment~"FIBERIX"] do={/ip/route/remove $i}',
      ':foreach i in=[/radius/find where comment~"FIBERIX"] do={/radius/remove $i}',
      ':foreach i in=[/ip/pool/find where name~"FIBERIX"] do={/ip/pool/remove $i}',
      ':foreach i in=[/ppp/profile/find where name~"FIBERIX"] do={/ppp/profile/remove $i}',
      ':foreach i in=[/ip/proxy/access/find where comment~"FIBERIX"] do={/ip/proxy/access/remove $i}',
      ':foreach i in=[/ip/firewall/address-list/find where comment~"FIBERIX"] do={/ip/firewall/address-list/remove $i}',
      ':foreach i in=[/ip/firewall/filter/find where comment~"FIBERIX"] do={/ip/firewall/filter/remove $i}',
      ':foreach i in=[/ip/firewall/nat/find where comment~"FIBERIX"] do={/ip/firewall/nat/remove $i}'
    ];
  }
  return foreach;
}

function buildPppProfile(version, pool, local) {
  const ranges = String(pool || '').trim();
  const gw = String(local || '').trim();
  if (!ranges || !gw) return [];
  if (version === 'v7') {
    return [
      `/ip/pool/add name=FIBERIX ranges=${ranges} comment="FIBERIX"`,
      `/ppp/profile/add name=FIBERIX local-address=${gw} remote-address=FIBERIX comment="FIBERIX"`
    ];
  }
  return [
    `/ip pool add name=FIBERIX ranges=${ranges} comment="FIBERIX"`,
    `/ppp profile add name=FIBERIX local-address=${gw} remote-address=FIBERIX comment="FIBERIX"`
  ];
}

function buildWireguardBlock(version, wg) {
  if (!wg || !wg.privateKey || !wg.serverPublicKey || !wg.endpointHost) return [];
  const addr = stripCidr(wg.tunnelAddress);
  const bits = String(wg.tunnelAddress || '').split('/')[1] || '32';
  const pskLine = wg.presharedKey ? `    preshared-key="${escapeRos(wg.presharedKey)}" \\` : null;
  const firstHop = String(wg.allowedIps || '').split(',')[0].trim() || '10.10.0.1/32';
  if (version === 'v7') {
    return [
      `/interface/wireguard/add name=wg-fiberix private-key="${escapeRos(wg.privateKey)}" listen-port=0 comment="FIBERIX"`,
      `/ip/address/add address=${addr}/${bits} interface=wg-fiberix comment="FIBERIX"`,
      `/interface/wireguard/peers/add interface=wg-fiberix \\`,
      `    public-key="${escapeRos(wg.serverPublicKey)}" \\`,
      pskLine,
      `    endpoint-address=${wg.endpointHost} endpoint-port=${wg.endpointPort || 51820} \\`,
      `    allowed-address=${wg.allowedIps} persistent-keepalive=${wg.keepalive || 25}s comment="FIBERIX"`,
      `/ip/route/add dst-address=${firstHop} gateway=wg-fiberix comment="FIBERIX"`
    ].filter(Boolean);
  }
  return [
    `/interface wireguard add name=wg-fiberix private-key="${escapeRos(wg.privateKey)}" listen-port=0 comment="FIBERIX"`,
    `/ip address add address=${addr}/${bits} interface=wg-fiberix comment="FIBERIX"`,
    `/interface wireguard peers add interface=wg-fiberix \\`,
    `    public-key="${escapeRos(wg.serverPublicKey)}" \\`,
    pskLine,
    `    endpoint-address=${wg.endpointHost} endpoint-port=${wg.endpointPort || 51820} \\`,
    `    allowed-address=${wg.allowedIps} persistent-keepalive=${wg.keepalive || 25}s comment="FIBERIX"`,
    `/ip route add dst-address=${firstHop} gateway=wg-fiberix comment="FIBERIX"`
  ].filter(Boolean);
}

function buildL2tpBlock(version, l2tp) {
  if (!l2tp || !l2tp.host || !l2tp.username) return [];
  const psk = l2tp.psk ? ` use-ipsec=yes ipsec-secret="${escapeRos(l2tp.psk)}"` : ' use-ipsec=no';
  if (version === 'v7') {
    return [
      `/interface/l2tp-client/add name=l2tp-fiberix connect-to=${l2tp.host} user=${escapeRos(l2tp.username)} password="${escapeRos(l2tp.password || '')}"${psk} add-default-route=no disabled=no comment="FIBERIX"`
    ];
  }
  return [
    `/interface l2tp-client add name=l2tp-fiberix connect-to=${l2tp.host} user=${escapeRos(l2tp.username)} password="${escapeRos(l2tp.password || '')}"${psk} add-default-route=no disabled=no comment="FIBERIX"`
  ];
}

function buildRadiusAndIsolir(version, radiusHost, secret) {
  const sec = escapeRos(secret);
  if (version === 'v7') {
    return [
      `/radius/add service=ppp,hotspot address=${radiusHost} secret="${sec}" timeout=3s comment="FIBERIX"`,
      '/radius/incoming/set accept=yes',
      '/ppp/aaa/set use-radius=yes accounting=yes interim-update=5m',
      `/ip/pool/add name=EXPIRED_FIBERIX ranges=${EXPIRED_POOL} comment="FIBERIX"`,
      `/ppp/profile/add name=EXPIRED_FIBERIX local-address=${EXPIRED_GW} remote-address=EXPIRED_FIBERIX comment="FIBERIX"`,
      `/ip/firewall/address-list/add list=EXPIRED address=${EXPIRED_NET} comment="FIBERIX"`,
      '/ip/firewall/filter/add chain=forward src-address-list=EXPIRED protocol=tcp dst-port=!53,80,443 action=drop comment="FIBERIX"'
    ];
  }
  return [
    `/radius add service=ppp,hotspot address=${radiusHost} secret="${sec}" timeout=3s comment="FIBERIX"`,
    '/radius incoming set accept=yes',
    '/ppp aaa set use-radius=yes accounting=yes interim-update=5m',
    `/ip pool add name=EXPIRED_FIBERIX ranges=${EXPIRED_POOL} comment="FIBERIX"`,
    `/ppp profile add name=EXPIRED_FIBERIX local-address=${EXPIRED_GW} remote-address=EXPIRED_FIBERIX comment="FIBERIX"`,
    `/ip firewall address-list add list=EXPIRED address=${EXPIRED_NET} comment="FIBERIX"`,
    '/ip firewall filter add chain=forward src-address-list=EXPIRED protocol=tcp dst-port=!53,80,443 action=drop comment="FIBERIX"'
  ];
}

function isPrivateHost(host) {
  const h = String(host || '');
  if (!h) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function buildPortForwardExample(opts) {
  const rawHost = opts.vpsHost || opts.wgEndpointHost || opts.serverHost || '';
  const tunnel = stripCidr(opts.tunnelAddress || opts.nasname || '10.10.0.2');
  const lanMode = opts.connMode === 'public' || opts.vpnType === 'public' || !opts.vpnType;
  const lanOnly = opts.skipPortForward === true || lanMode || isPrivateHost(rawHost);
  if (lanOnly) {
    return {
      applied: false,
      skipped: true,
      note: 'Port-forward tidak diperlukan: server Fiberix di LAN. Hubungkan MikroTik langsung ke IP server (bukan lewat internet).',
      vps_host: rawHost || null,
      server_host: rawHost || null,
      tunnel_ip: tunnel,
      rules: [],
      nft_example: ''
    };
  }
  const host = rawHost;
  const id = parseInt(opts.nasId, 10) || 1;
  const apiPub = 28000 + (id % 1000);
  const winboxPub = 29000 + (id % 1000);
  return {
    applied: false,
    skipped: false,
    note: 'Contoh lanjutan — belum dipasang. Pakai hanya jika Winbox/API tidak tembus dari internet. Bukan langkah wajib.',
    vps_host: host,
    server_host: host,
    tunnel_ip: tunnel,
    rules: [
      { use: 'API RouterOS', public: `${host}:${apiPub}`, internal: `${tunnel}:8728` },
      { use: 'Winbox', public: `${host}:${winboxPub}`, internal: `${tunnel}:8291` }
    ],
    nft_example: [
      `# di server Fiberix (nftables/iptables) — JANGAN dijalankan otomatis`,
      `iptables -t nat -A PREROUTING -p tcp --dport ${apiPub} -j DNAT --to-destination ${tunnel}:8728`,
      `iptables -t nat -A PREROUTING -p tcp --dport ${winboxPub} -j DNAT --to-destination ${tunnel}:8291`,
      `iptables -A FORWARD -p tcp -d ${tunnel} --dport 8728 -j ACCEPT`,
      `iptables -A FORWARD -p tcp -d ${tunnel} --dport 8291 -j ACCEPT`
    ].join('\n')
  };
}

function buildNasRouterOsScript(opts) {
  const name = opts.shortname || opts.nasname || 'NAS';
  const radiusHost = opts.radiusHost || DEFAULT_RADIUS_HOST;
  const secret = opts.secret || '';
  const tunnel = stripCidr(opts.tunnelAddress || '');
  const connMode = opts.connMode === 'vpn' || opts.vpnType === 'wireguard' || opts.vpnType === 'l2tp' || opts.vpnType === 'openvpn'
    ? 'vpn'
    : 'public';
  const modeLabel = connMode === 'vpn' ? 'VPN / tunnel' : 'LAN';
  const pppPool = (opts.pppPool || opts.ppp_pool_ranges || '').trim();
  const pppLocal = (opts.pppLocal || opts.ppp_local_address || '').trim();
  const stamped = formatIdDate(opts.now);

  function assemble(version) {
    const verLabel = version === 'v7' ? 'v7' : 'v6';
    const header = [
      `# Script RouterOS ${verLabel} untuk NAS ${name}`,
      `# Mode: ${modeLabel}`,
      `# Tanggal: ${stamped}`,
      `# Radius: ${radiusHost}  comment=FIBERIX`,
      '# Tidak menghapus object BILLINGRADIUS. Disable radius sewa secara manual jika auth hanya mau lewat Fiberix.',
      tunnel
        ? `# IP tunnel WireGuard router ini: ${tunnel}  ← pakai ini untuk API/sync jika mode tunnel.`
        : '# Mode LAN / langsung: RADIUS lewat IP lokal. WireGuard tidak wajib.',
      ''
    ];
    const body = [
      '# 1) Hapus object FIBERIX lama',
      ...buildCleanup(version),
      ''
    ];
    if (opts.vpnType === 'wireguard' && opts.wireguard) {
      body.push('# 2) WireGuard ke server billing Fiberix (bukan L2TP)');
      body.push(...buildWireguardBlock(version, opts.wireguard));
      body.push('');
    } else if (opts.vpnType === 'l2tp' && opts.l2tp) {
      body.push('# 2) L2TP ke server VPN Anda');
      body.push(...buildL2tpBlock(version, opts.l2tp));
      body.push('');
    } else {
      body.push('# 2) Tunnel dilewati (mode LAN / langsung — disarankan jika satu jaringan)');
      body.push('');
    }
    if (pppPool && pppLocal) {
      body.push('# 3) Pool + profile PPP Fiberix');
      body.push(...buildPppProfile(version, pppPool, pppLocal));
      body.push('');
      body.push('# 4) RADIUS Fiberix + PPP AAA + profile isolir');
    } else {
      body.push('# 3) RADIUS Fiberix + PPP AAA + profile isolir');
    }
    body.push(...buildRadiusAndIsolir(version, radiusHost, secret));
    body.push('');
    body.push('# Cek: /radius print  dan  /ppp aaa print');
    return [...header, ...body.filter((l) => l != null)].join('\n');
  }

  const usage = [
    'Script di atas disesuaikan dengan NAS Anda dan halaman isolir Fiberix.',
    'Pilih versi RouterOS, lalu Salin dan tempel di New Terminal MikroTik.',
    'RouterOS v7 memakai path /radius/add (dan action-data jika ada proxy). RouterOS v6 memakai /radius add.',
    'Mode LAN: tidak ada L2TP/PPTP ke server cloud. RADIUS langsung ke IP server Fiberix.',
    'Object comment=BILLINGRADIUS tidak disentuh.'
  ];

  const notes = [
    'Tempel di New Terminal MikroTik (RouterOS v7 atau v6 sesuai tab).',
    'Jika MikroTik dan Fiberix satu jaringan, mode LAN cukup — WireGuard tidak wajib.',
    'IP tunnel hanya dipakai jika mode tunnel (mis. 10.10.0.2). Bukan sewa server cloud.',
    'nas.nasname di billing harus sama dengan IP sumber yang dilihat FreeRADIUS (LAN atau IP tunnel).',
    'Object comment=BILLINGRADIUS tidak disentuh.'
  ];

  const portForward = buildPortForwardExample({
    vpsHost: opts.vpsHost,
    wgEndpointHost: opts.wireguard && opts.wireguard.endpointHost,
    serverHost: opts.serverHost,
    skipPortForward: opts.skipPortForward,
    connMode: opts.connMode,
    vpnType: opts.vpnType,
    tunnelAddress: opts.tunnelAddress,
    nasname: opts.nasname,
    nasId: opts.nasId
  });

  return {
    radius_host: radiusHost,
    tunnel_address: tunnel || null,
    recommended_api_host: tunnel || opts.nasname || null,
    recommended_api_port: 8728,
    skip_port_forward: !!portForward.skipped,
    mode_label: modeLabel,
    ppp_pool_ranges: pppPool || null,
    ppp_local_address: pppLocal || null,
    v7: assemble('v7'),
    v6: assemble('v6'),
    notes,
    usage,
    port_forward_example: portForward
  };
}

function radiusAllowedIps(serverAddress, radiusHost) {
  const parts = [];
  if (serverAddress) parts.push(String(serverAddress).includes('/') ? serverAddress : `${stripCidr(serverAddress)}/32`);
  if (radiusHost && stripCidr(radiusHost) !== stripCidr(serverAddress)) {
    parts.push(`${stripCidr(radiusHost)}/32`);
  }
  return parts.join(',') || '10.10.0.1/32';
}

module.exports = {
  DEFAULT_RADIUS_HOST,
  DEFAULT_PPP_POOL,
  DEFAULT_PPP_LOCAL,
  EXPIRED_NET,
  buildNasRouterOsScript,
  buildPortForwardExample,
  radiusAllowedIps,
  isPrivateHost,
  escapeRos,
  stripCidr
};
