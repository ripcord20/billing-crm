'use strict';

/**
 * Terjemahkan gagal REST MikroTik jadi pesan yang bisa ditindak.
 * RouterOS v6 tidak punya /rest — www membalas HTML 404.
 */

function bodyToText(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (typeof body === 'object') {
    if (body.detail) return String(body.detail);
    if (body.message) return String(body.message);
    if (body.error) return String(body.error);
    try { return JSON.stringify(body); } catch (_) { return String(body); }
  }
  return String(body);
}

function looksLikeHtml(text) {
  return /<\s*(html|head|title|body|h1)\b/i.test(String(text || ''));
}

function compactText(text, max = 220) {
  const one = String(text || '').replace(/\s+/g, ' ').trim();
  if (one.length <= max) return one;
  return one.slice(0, max) + '…';
}

/**
 * @param {number|string} status
 * @param {string|object} body
 * @param {{ host?: string, port?: number|string }} [opts]
 */
function explainRestFailure(status, body, opts = {}) {
  const code = Number(status) || 0;
  const text = bodyToText(body);
  const html = looksLikeHtml(text);
  const notFound = /not\s*found|error\s*404/i.test(text);
  const loc = (opts.host && opts.port != null)
    ? `${opts.host}:${opts.port}`
    : (opts.host || '');

  if (code === 404 && (html || notFound)) {
    return (
      `REST /rest tidak ada di router ini (HTTP 404${loc ? ' di ' + loc : ''}). ` +
      `Ini khas RouterOS v6 — REST hanya ada di v7.1+. ` +
      `Ganti protokol ke API Binary, port 8728, lalu di MikroTik: ` +
      `/ip service enable api  dan izinkan IP server billing di address-list service api.`
    );
  }

  if (html && (code === 404 || notFound)) {
    return (
      `Router membalas HTML 404, bukan REST JSON. ` +
      `RouterOS v6 tidak punya /rest. Pakai API Binary :8728.`
    );
  }

  if (code === 401 || code === 403) {
    return (
      `Login REST ditolak (HTTP ${code}). ` +
      `Cek username/password API. User Winbox belum tentu punya hak REST/API.`
    );
  }

  if (html) {
    return (
      `MikroTik membalas HTML (HTTP ${code || '?'}), bukan REST JSON. ` +
      `Pastikan RouterOS v7.1+ dan /ip service enable www, atau ganti ke API Binary :8728.`
    );
  }

  const detail = compactText(text);
  if (detail) return `MikroTik: ${detail}`;
  return code ? `MikroTik HTTP ${code}` : 'MikroTik REST gagal';
}

function explainApiConnectRefused(host, port) {
  const loc = `${host}:${port}`;
  const p = parseInt(port, 10);
  if (p === 8728 || p === 8729) {
    return (
      `Tidak bisa connect ke ${loc} (connection refused). ` +
      `Aktifkan API Binary di MikroTik: /ip service enable api ` +
      `(port 8728, atau api-ssl 8729) dan izinkan IP server billing.`
    );
  }
  return (
    `Tidak bisa connect ke ${loc} (connection refused). ` +
    `Kalau REST: /ip service enable www. ` +
    `Kalau RouterOS v6: jangan pakai REST — pilih API Binary port 8728.`
  );
}

module.exports = {
  bodyToText,
  looksLikeHtml,
  explainRestFailure,
  explainApiConnectRefused
};
