'use strict';

/**
 * VpnProvisionService
 * ──────────────────────────────────────────────────────────────────────────
 * Dispatcher generate config VPN untuk modul NAS, mendukung 3 tipe:
 *   - wireguard : delegasi ke WireguardService (keypair + peer).
 *   - l2tp      : L2TP/IPsec — generate username/password + PSK IPsec.
 *   - openvpn   : OpenVPN — generate username/password + skeleton .ovpn.
 *
 * Semua tipe memakai alamat tunnel dari pool yang sama (subnet WireGuard),
 * dan endpoint host bersama (setting VPN server / fallback endpoint WireGuard).
 * Output diseragamkan supaya UI bisa menampilkan blok yang relevan saja.
 */

const crypto = require('crypto');
const Wireguard = require('./WireguardService');
const { AppSetting } = require('../models');
const { encryptSecret } = require('../utils/secretBox');

async function getSetting(key, fallback = '') {
  try {
    const s = await AppSetting.findOne({ where: { key } });
    return s && s.value != null ? s.value : fallback;
  } catch (_) { return fallback; }
}

function randToken(len = 12) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += abc[buf[i] % abc.length];
  return out;
}

function usernameFor(nas) {
  const base = (nas.shortname || nas.nasname || ('nas' + nas.id))
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  return (base || ('nas' + nas.id));
}

async function resolveServer() {
  const wg = await Wireguard.getServerConfig();
  const host = (await getSetting('vpn_server_host', '')) || wg.endpointHost;
  return {
    host,
    serverAddress: wg.serverAddress,
    l2tpDefaultPsk: await getSetting('vpn_l2tp_psk', ''),
    ovpnPort: parseInt(await getSetting('vpn_openvpn_port', '1194'), 10) || 1194,
    ovpnProto: (await getSetting('vpn_openvpn_proto', 'udp')) || 'udp'
  };
}

// ── L2TP / IPsec ────────────────────────────────────────────────────────────
async function generateL2tp(nas, opts) {
  const srv = await resolveServer();
  if (!srv.host) throw new Error('Host server VPN belum diatur. Isi endpoint di pengaturan WireGuard/VPN server.');
  let tunnelAddress = nas.tunnel_address;
  if (!tunnelAddress || opts.reallocate) tunnelAddress = await Wireguard.allocateTunnelIp(nas.id);
  const username = usernameFor(nas);
  const password = randToken(14);
  const psk = srv.l2tpDefaultPsk || randToken(20);
  const remoteIp = String(tunnelAddress).split('/')[0];

  await nas.update({
    conn_mode: 'vpn', vpn_type: 'l2tp', tunnel_address: tunnelAddress,
    vpn_username: username, vpn_password: encryptSecret(password), vpn_psk: encryptSecret(psk),
    wg_endpoint: `${srv.host}:1701`
  });

  const clientCommands = [
    '# MikroTik (router cabang) — L2TP/IPsec client:',
    `/interface/l2tp-client/add name=l2tp-billing connect-to=${srv.host} \\`,
    `    user=${username} password=${password} \\`,
    `    use-ipsec=yes ipsec-secret="${psk}" \\`,
    '    add-default-route=no disabled=no'
  ].join('\n');

  const serverProvisioning = [
    '# Di server VPN (MikroTik) — buat PPP secret + aktifkan L2TP/IPsec:',
    `/ppp/secret/add name=${username} password=${password} service=l2tp \\`,
    `    local-address=${srv.serverAddress} remote-address=${remoteIp}`,
    '/interface/l2tp-server/server/set enabled=yes use-ipsec=required \\',
    `    ipsec-secret="${psk}" default-profile=default-encryption`
  ].join('\n');

  const clientConfig = [
    'L2TP/IPsec — parameter koneksi',
    `Server     : ${srv.host}`,
    `Username   : ${username}`,
    `Password   : ${password}`,
    `IPsec PSK  : ${psk}`,
    `Tunnel IP  : ${tunnelAddress}`
  ].join('\n');

  return {
    vpn_type: 'l2tp', tunnel_address: tunnelAddress,
    username, password, psk,
    client_config: clientConfig, mikrotik_commands: clientCommands, server_provisioning: serverProvisioning
  };
}

// ── OpenVPN ─────────────────────────────────────────────────────────────────
async function generateOpenVpn(nas, opts) {
  const srv = await resolveServer();
  if (!srv.host) throw new Error('Host server VPN belum diatur. Isi endpoint di pengaturan WireGuard/VPN server.');
  let tunnelAddress = nas.tunnel_address;
  if (!tunnelAddress || opts.reallocate) tunnelAddress = await Wireguard.allocateTunnelIp(nas.id);
  const username = usernameFor(nas);
  const password = randToken(14);

  await nas.update({
    conn_mode: 'vpn', vpn_type: 'openvpn', tunnel_address: tunnelAddress,
    vpn_username: username, vpn_password: encryptSecret(password), vpn_psk: null,
    wg_endpoint: `${srv.host}:${srv.ovpnPort}`
  });

  const clientConfig = [
    'client',
    'dev tun',
    `proto ${srv.ovpnProto}`,
    `remote ${srv.host} ${srv.ovpnPort}`,
    'resolv-retry infinite',
    'nobind',
    'persist-key',
    'persist-tun',
    'auth-user-pass',
    'auth SHA1',
    'cipher AES-256-CBC',
    'verb 3',
    '# Ganti blok <ca> berikut dengan CA server OpenVPN Anda:',
    '<ca>',
    '-----BEGIN CERTIFICATE-----',
    '... (isi sertifikat CA server OpenVPN) ...',
    '-----END CERTIFICATE-----',
    '</ca>',
    `# Kredensial (auth-user-pass): ${username} / ${password}`
  ].join('\n');

  const clientCommands = [
    '# MikroTik (router cabang) — OpenVPN client:',
    `/interface/ovpn-client/add name=ovpn-billing connect-to=${srv.host} port=${srv.ovpnPort} \\`,
    `    user=${username} password=${password} mode=ip \\`,
    '    auth=sha1 cipher=aes256 add-default-route=no disabled=no',
    '# Impor CA server ke: /certificate import (file CA OpenVPN)'
  ].join('\n');

  const serverProvisioning = [
    '# Di server OpenVPN — buat user (mis. via user/pass plugin atau /etc/openvpn):',
    `#   username: ${username}`,
    `#   password: ${password}`,
    `# Assign IP tunnel (ifconfig-push): ${String(tunnelAddress).split('/')[0]} 255.255.255.0`,
    '# Berikan sertifikat CA server ke config klien di atas.'
  ].join('\n');

  return {
    vpn_type: 'openvpn', tunnel_address: tunnelAddress,
    username, password, psk: null,
    client_config: clientConfig, mikrotik_commands: clientCommands, server_provisioning: serverProvisioning
  };
}

// ── Dispatcher ───────────────────────────────────────────────────────────────
async function generate(nas, opts = {}) {
  const type = (opts.vpn_type || nas.vpn_type || 'wireguard').toLowerCase();
  if (type === 'wireguard') {
    const wg = await Wireguard.generatePeerForNas(nas, opts);
    return { vpn_type: 'wireguard', ...wg };
  }
  if (type === 'l2tp') return generateL2tp(nas, opts);
  if (type === 'openvpn') return generateOpenVpn(nas, opts);
  throw new Error('Tipe VPN tidak dikenal: ' + type);
}

module.exports = { generate, generateL2tp, generateOpenVpn, usernameFor };
