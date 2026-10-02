'use strict';
/**
 * Slim cache RAM: thumbnail WA dibuang, dump CLI OLT tidak masuk cache.
 * Jalankan: node test/memorySlim.test.js
 */
const assert = require('assert');
const { slimWaMessage, stripRawFields } = require('../utils/memorySlim');
const MemoryGuard = require('../utils/memoryGuard');

// ── slimWaMessage ────────────────────────────────────────────────────
const fat = {
  conversation: 'halo',
  imageMessage: {
    mimetype: 'image/jpeg',
    caption: 'foto',
    mediaKey: Buffer.alloc(32, 7),
    fileSha256: Buffer.alloc(32, 8),
    fileEncSha256: Buffer.alloc(32, 9),
    jpegThumbnail: Buffer.alloc(8000, 1),
    waveform: Buffer.alloc(4000, 2),
    url: 'https://mmg.whatsapp.net/x',
  },
  contextInfo: {
    quotedMessage: { imageMessage: { jpegThumbnail: Buffer.alloc(4000, 3) } },
    stanzaId: 'ABC',
  },
};

const slim = slimWaMessage(fat);
assert.strictEqual(slim.conversation, 'halo');
assert.strictEqual(slim.imageMessage.caption, 'foto');
assert.strictEqual(slim.imageMessage.mimetype, 'image/jpeg');
assert.ok(Buffer.isBuffer(slim.imageMessage.mediaKey));
assert.strictEqual(slim.imageMessage.mediaKey.length, 32);
assert.strictEqual(slim.imageMessage.jpegThumbnail, undefined);
assert.strictEqual(slim.imageMessage.waveform, undefined);
assert.strictEqual(slim.contextInfo.quotedMessage, undefined);
assert.strictEqual(slim.contextInfo.stanzaId, 'ABC');

const jsonBuf = slimWaMessage({
  imageMessage: {
    mediaKey: { type: 'Buffer', data: Array(32).fill(1) },
    jpegThumbnail: { type: 'Buffer', data: Array(2000).fill(2) },
  },
});
assert.ok(jsonBuf.imageMessage.mediaKey);
assert.strictEqual(jsonBuf.imageMessage.jpegThumbnail, undefined);

// ── stripRawFields ───────────────────────────────────────────────────
const cached = stripRawFields({
  onus: [
    { onu_id: 1, name: 'Agus pasar', phase_state: 'dyinggasp', quality: 'dyinggasp', raw: 'ONU 1 dying-gasp '.repeat(80) },
    { onu_id: 2, name: 'Elisa', phase_state: 'los', quality: 'los', raw: 'LOS dump' },
  ],
  system: { model: 'C-DATA', raw: 'sysDescr dump' },
  ports: [{ port: '1', total: 2, online: 0, offline: 2 }],
});
assert.strictEqual(cached.onus[0].name, 'Agus pasar');
assert.strictEqual(cached.onus[0].phase_state, 'dyinggasp');
assert.strictEqual(cached.onus[0].raw, undefined);
assert.strictEqual(cached.onus[1].raw, undefined);
assert.strictEqual(cached.system.model, 'C-DATA');
assert.strictEqual(cached.system.raw, undefined);
assert.strictEqual(cached.ports[0].total, 2);

// ── MemoryGuard register + run ───────────────────────────────────────
let hits = 0;
MemoryGuard.register('testPruner', () => { hits++; return { ok: true }; });
const snap = MemoryGuard.run();
assert.strictEqual(hits, 1);
assert.strictEqual(snap.pruned.testPruner.ok, true);
assert.ok(typeof snap.after.heapUsedMb === 'number');
assert.ok(typeof snap.after.rssMb === 'number');

console.log('memorySlim.test.js OK');
