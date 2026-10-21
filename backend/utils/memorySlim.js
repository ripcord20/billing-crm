'use strict';

/**
 * Pembuangan field berat dari objek in-memory / cache disk.
 * Dipakai WA msgstore (thumbnail media) dan cache discover OLT (dump CLI).
 */

const FAT_MEDIA_KEYS = new Set([
  'jpegThumbnail',
  'thumbnailDirectPath',
  'thumbnailSha256',
  'thumbnailEncSha256',
  'waveform',
  'scansSidecar',
  'firstScanSidecar',
  'scanLengths',
  'midQualityFileSha256',
]);

// Kunci kripto kecil yang tetap dibutuhkan Baileys untuk retry-receipt media.
const KEEP_BUFFERS = new Set(['mediaKey', 'fileSha256', 'fileEncSha256', 'messageSecret']);

function isBinary(v) {
  return Buffer.isBuffer(v) || (typeof Uint8Array !== 'undefined' && v instanceof Uint8Array);
}

/**
 * Salin proto pesan WA tanpa thumbnail / waveform / quoted bersarang.
 * Teks + kunci media tetap utuh supaya getMessage() masih bisa layani retry.
 */
function slimWaMessage(content) {
  if (content == null || typeof content !== 'object') return content;
  if (isBinary(content)) return content;
  if (Array.isArray(content)) return content.map(slimWaMessage);

  const out = {};
  for (const k of Object.keys(content)) {
    if (FAT_MEDIA_KEYS.has(k) || k === 'quotedMessage') continue;
    const v = content[k];
    if (isBinary(v)) {
      if (!KEEP_BUFFERS.has(k) && v.length > 64) continue;
      out[k] = v;
      continue;
    }
    if (v && typeof v === 'object') {
      // Bentuk { type:'Buffer', data: [...] } dari JSON.stringify(Buffer)
      if (v.type === 'Buffer' && (Array.isArray(v.data) || typeof v.data === 'string')) {
        if (!KEEP_BUFFERS.has(k) && (
          (Array.isArray(v.data) && v.data.length > 64) ||
          (typeof v.data === 'string' && v.data.length > 128)
        )) continue;
        out[k] = v;
        continue;
      }
      out[k] = slimWaMessage(v);
      continue;
    }
    out[k] = v;
  }
  return out;
}

/** Buang key `raw` (dump CLI/SNMP) secara rekursif — tidak dipakai UI cache. */
function stripRawFields(value) {
  if (Array.isArray(value)) return value.map(stripRawFields);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      if (k === 'raw') continue;
      out[k] = stripRawFields(value[k]);
    }
    return out;
  }
  return value;
}

module.exports = { slimWaMessage, stripRawFields, FAT_MEDIA_KEYS, KEEP_BUFFERS };
