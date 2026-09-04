'use strict';

/**
 * Klasifikasi urutan /radius di CORE vs Fiberix + BillingRadius.
 * RouterOS: Reject dari server pertama menghentikan pencarian;
 * timeout di server pertama baru mencoba server berikutnya.
 */

const DEFAULT_BILLING_HOSTS = ['172.20.1.1'];

function normalizeIp(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s || s === '0.0.0.0' || s === '::' || s === '*') return '';
  const noCidr = s.split('/')[0];
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(noCidr)) return noCidr;
  return noCidr.split('%')[0];
}

function hostSet(list) {
  const set = new Set();
  (Array.isArray(list) ? list : []).forEach((h) => {
    const n = normalizeIp(h);
    if (n) set.add(n);
  });
  return set;
}

function classifyClientRole(entry, fiberixHosts, billingHosts) {
  const addr = normalizeIp(entry && entry.address);
  const comment = String((entry && (entry.comment || entry.name)) || '').toLowerCase();
  if (addr && fiberixHosts.has(addr)) return 'fiberix';
  if (addr && billingHosts.has(addr)) return 'billingradius';
  if (/fiberix|daloradius|\bdalo\b|freeradius/.test(comment) && !/billing/.test(comment)) {
    return 'fiberix';
  }
  if (/billingradius|billing[\s-]?radius/.test(comment)) return 'billingradius';
  return 'other';
}

function isSrcPinned(src) {
  return !!normalizeIp(src);
}

function classifyCoreAlignment(clients, opts = {}) {
  const fiberixHosts = hostSet(opts.fiberixHosts);
  const billingHosts = hostSet([...(opts.billingHosts || []), ...DEFAULT_BILLING_HOSTS]);
  const rows = (Array.isArray(clients) ? clients : [])
    .filter((c) => c && c.disabled !== true && c.disabled !== 'true' && c.disabled !== 'yes')
    .map((c, i) => {
      const src = c.srcAddress || c['src-address'] || '';
      return {
        order: i + 1,
        address: String(c.address || ''),
        comment: String(c.comment || ''),
        timeout: String(c.timeout || ''),
        srcAddress: normalizeIp(src),
        role: classifyClientRole(c, fiberixHosts, billingHosts),
        srcPinned: isSrcPinned(src)
      };
    });

  const issues = [];
  const next = [];
  const hasFx = rows.some((r) => r.role === 'fiberix');
  const hasBr = rows.some((r) => r.role === 'billingradius');
  const first = rows[0] || null;
  const brPinned = rows.filter((r) => r.role === 'billingradius' && r.srcPinned);

  if (brPinned.length) {
    issues.push('src-address BillingRadius ter-pin. Kosongkan (auto) — jangan pakai IP CORE.');
  }
  if (opts.useRadius === false) {
    issues.push('/ppp aaa use-radius=no — auth hanya dari /ppp/secret lokal, bukan RADIUS.');
  }

  if (!rows.length) {
    return {
      phase: 'none',
      status: 'critical',
      title: 'CORE belum punya server RADIUS',
      summary: 'PPPoE tidak bisa auth lewat RADIUS sampai /radius diisi.',
      clients: rows,
      issues,
      next: ['Jangan matikan BillingRadius. Pasang FreeRADIUS Fiberix sebagai cadangan, lalu proxy user yang tidak ada ke BillingRadius sebelum jadi satu-satunya server.']
    };
  }

  let phase = 'unknown';
  let status = 'warn';
  let title = 'Urutan RADIUS belum dikenali';
  let summary = 'Cocokkan IP host di menu RADIUS Fiberix dengan address di CORE /radius.';

  if (hasBr && hasFx && first.role === 'billingradius') {
    phase = 'dual_br_first';
    status = brPinned.length || opts.useRadius === false ? 'critical' : 'warn';
    title = 'Belum selaras: BillingRadius dulu, Fiberix cadangan';
    summary = 'Pelanggan lama (pool 10.2.x) tetap ke BillingRadius. User baru Fiberix hanya tembus jika server pertama timeout — Reject dari BillingRadius menghentikan pencarian.';
    next.push('Jangan pindah Fiberix ke urutan pertama sebelum FreeRADIUS mem-proxy user yang tidak ada di radcheck ke BillingRadius.');
    next.push('Di host FreeRADIUS, proxy notfound ke 172.20.1.1, tes radtest user Fiberix dan user BillingRadius, baru jadikan Fiberix satu-satunya /radius di CORE.');
    next.push('Darurat (user baru harus online hari ini): daftarkan username yang sama di BillingRadius. Jangan matikan 172.20.1.1.');
  } else if (hasBr && hasFx && first.role === 'fiberix') {
    phase = 'dual_fiberix_first';
    status = 'critical';
    title = 'Fiberix di urutan pertama — pelanggan BillingRadius bisa putus';
    summary = 'Kalau Fiberix menjawab Reject untuk user yang hanya ada di BillingRadius, MikroTik tidak mencoba server berikutnya.';
    next.push('Kembalikan BillingRadius ke urutan pertama, atau aktifkan proxy notfound → BillingRadius di FreeRADIUS sebelum urutan ini.');
  } else if (hasFx && !hasBr) {
    phase = 'fiberix_only';
    status = opts.useRadius === false ? 'critical' : 'ok';
    title = 'CORE hanya ke Fiberix';
    summary = 'Selaras hanya jika FreeRADIUS sudah mem-proxy user yang tidak ada di radcheck ke BillingRadius. Tanpa proxy, pelanggan 10.2.x putus saat reconnect.';
    next.push('Pastikan proxy notfound → BillingRadius sudah dites (radtest user lama).');
    next.push('Setelah semua user BillingRadius ada di Fiberix, proxy boleh dimatikan.');
  } else if (hasBr && !hasFx) {
    phase = 'br_only';
    status = brPinned.length || opts.useRadius === false ? 'critical' : 'warn';
    title = 'CORE hanya ke BillingRadius';
    summary = 'User yang hanya ditulis ke radcheck Fiberix tidak akan pernah online.';
    next.push('Tambah FreeRADIUS Fiberix sebagai server kedua (bukan pertama) sampai proxy siap.');
  } else {
    next.push('Isi host FreeRADIUS di Fiberix agar IP-nya bisa dicocokkan otomatis dengan CORE.');
  }

  if (opts.useRadius === false && status !== 'critical') status = 'critical';

  return { phase, status, title, summary, clients: rows, issues, next };
}

function summarizeNetwork(cores) {
  const list = Array.isArray(cores) ? cores : [];
  const reachable = list.filter((c) => c.ok);
  if (!reachable.length) {
    return {
      status: 'warn',
      phase: 'unreachable',
      title: 'CORE tidak terjangkau dari Fiberix',
      summary: 'Urutan /radius tidak bisa dibaca. Cek API MikroTik, bukan tebakan dari menu ini.'
    };
  }
  const worst = reachable.reduce((acc, c) => {
    const rank = { ok: 0, warn: 1, critical: 2 };
    return (rank[c.status] || 0) > (rank[acc] || 0) ? c.status : acc;
  }, 'ok');
  const phases = [...new Set(reachable.map((c) => c.phase))];
  const first = reachable[0];
  return {
    status: worst,
    phase: phases.length === 1 ? phases[0] : 'mixed',
    title: first.title,
    summary: first.summary
  };
}

module.exports = {
  DEFAULT_BILLING_HOSTS,
  normalizeIp,
  classifyClientRole,
  classifyCoreAlignment,
  summarizeNetwork
};
