'use strict';

const METHODS = ['vpn', 'public_ip', 'lan'];

function normalizeMethod(raw) {
  const m = String(raw || 'vpn').toLowerCase();
  if (m === 'public_ip' || m === 'ip_publik' || m === 'public') return 'public_ip';
  if (m === 'lan') return 'lan';
  return 'vpn';
}

function pickNasFields(b) {
  const name = String(b.name || b.shortname || '').trim();
  const method = normalizeMethod(b.connection_method);
  const publicIp = String(b.public_ip || b.lan_ip || b.nasname || '').trim();

  if (!name) return { error: 'Nama NAS wajib diisi' };
  if (method === 'public_ip' && !publicIp) return { error: 'IP publik wajib diisi' };
  if (method === 'lan' && !publicIp) return { error: 'IP LAN wajib diisi' };

  return {
    shortname: name,
    description: b.description ? String(b.description).trim() : null,
    connection_method: method,
    province: b.province ? String(b.province).trim() : null,
    regency: b.regency ? String(b.regency).trim() : null,
    nasname: (method === 'public_ip' || method === 'lan') ? publicIp : (publicIp || name || null),
    secret: (b.secret && b.secret !== '********') ? b.secret : null,
    type: b.type || 'mikrotik',
    is_active: b.is_active !== false
  };
}

function methodLabel(m) {
  if (m === 'public_ip') return 'IP Publik';
  if (m === 'lan') return 'LAN';
  return 'VPN';
}

module.exports = { METHODS, normalizeMethod, pickNasFields, methodLabel };
