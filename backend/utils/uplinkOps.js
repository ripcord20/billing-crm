'use strict';

/**
 * Helpers murni untuk pantauan uplink terpin + notif grup teknisi.
 * Tidak ada I/O — dipakai UplinkMonitorService / OpsNotifyService / tes.
 */

function classifyPinnedIface(iface) {
  if (!iface) return { state: 'missing', isDown: true, label: 'Interface tidak ditemukan' };
  if (iface.disabled) return { state: 'disabled', isDown: true, label: 'Interface disabled' };
  if (iface.running === false) return { state: 'down', isDown: true, label: 'Link down' };
  return { state: 'up', isDown: false, label: 'Up' };
}

function bitsToMbps(bits) {
  const n = Number(bits) || 0;
  return Math.round((n / 1e6) * 100) / 100;
}

function truthyFlag(v, defaultOn) {
  if (v === undefined || v === null || v === '') return !!defaultOn;
  const s = String(v).toLowerCase().trim();
  if (['0', 'false', 'off', 'no'].includes(s)) return false;
  return ['1', 'true', 'on', 'yes'].includes(s);
}

/**
 * Tiket gangguan default ON; jenis lain default OFF.
 * Form boleh override via notify_tech_group.
 */
function shouldNotifyTicketToTechGroup({ type, notify_tech_group } = {}) {
  const t = String(type || 'gangguan').toLowerCase();
  if (notify_tech_group === undefined || notify_tech_group === null || notify_tech_group === '') {
    return t === 'gangguan';
  }
  return truthyFlag(notify_tech_group, t === 'gangguan');
}

function fmtWaktu(d) {
  try {
    return new Date(d || Date.now()).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short'
    });
  } catch (_) {
    return new Date().toISOString();
  }
}

function formatUplinkWaText({ event, router, iface, comment, waktu }) {
  const head = event === 'recover' ? 'UPLINK KEMBALI UP' : 'UPLINK DOWN';
  const lines = [
    `*${head}*`,
    '',
    `Router : ${router || '-'}`,
    `Port   : ${iface || '-'}`,
  ];
  if (comment) lines.push(`Ket    : ${comment}`);
  lines.push(`Waktu  : ${waktu || fmtWaktu()}`);
  if (event !== 'recover') {
    lines.push('', 'Cek kabel/SFP/transceiver di port uplink yang di-pin.');
  }
  return lines.join('\n');
}

function formatTicketWaText({
  event, ticketNo, subject, type, priority, customerName, customerCode,
  assignedTo, locationNote, description, createdBy, waktu,
} = {}) {
  const isDone = event === 'resolved' || event === 'closed';
  const head = isDone
    ? (event === 'closed' ? 'TIKET DITUTUP' : 'TIKET SELESAI')
    : 'TIKET GANGGUAN BARU';
  const desc = description
    ? String(description).replace(/\s+/g, ' ').trim().slice(0, 160)
    : '';
  const lines = [
    `*${head}*`,
    '',
    ticketNo ? `No      : ${ticketNo}` : '',
    subject ? `Perihal : ${subject}` : '',
    type ? `Jenis   : ${type}` : '',
    priority ? `Prioritas : ${priority}` : '',
    (customerName || customerCode)
      ? `Pelanggan : ${customerName || '-'}${customerCode ? ` (${customerCode})` : ''}`
      : '',
    assignedTo ? `Teknisi : ${assignedTo}` : '',
    locationNote ? `Lokasi  : ${locationNote}` : '',
    desc ? `Ket     : ${desc}` : '',
    createdBy ? `Oleh    : ${createdBy}` : '',
    `Waktu   : ${waktu || fmtWaktu()}`,
  ].filter(Boolean);
  return lines.join('\n');
}

function formatUplinkTelegramHtml({ event, router, iface, komentar, waktu }) {
  if (event === 'recover') {
    return `<b>UPLINK KEMBALI UP</b>\n\nRouter: <b>${esc(router)}</b>\nInterface: <code>${esc(iface)}</code>\n${esc(waktu)}`;
  }
  return `<b>UPLINK DOWN</b>\n\nRouter: <b>${esc(router)}</b>\nInterface: <code>${esc(iface)}</code>${komentar ? esc(komentar) : ''}\n${esc(waktu)}`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

function uplinkRefId(deviceId, iface) {
  return `${deviceId}:${String(iface || '').slice(0, 32)}`;
}

module.exports = {
  classifyPinnedIface,
  bitsToMbps,
  truthyFlag,
  shouldNotifyTicketToTechGroup,
  fmtWaktu,
  formatUplinkWaText,
  formatTicketWaText,
  formatUplinkTelegramHtml,
  uplinkRefId,
};
