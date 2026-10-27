'use strict';
const assert = require('assert');
const H = require('../../frontend/public/js/olt-cli-hints.js');

function want(typed, expected) {
  const h = H.hint(typed);
  if (expected == null) {
    assert.strictEqual(h, null, 'expected no hint for: ' + JSON.stringify(typed) + ' got ' + JSON.stringify(h));
    return;
  }
  assert.ok(h, 'expected hint for: ' + JSON.stringify(typed));
  assert.strictEqual(h.correct, expected, typed + ' → ' + h.correct + ' (want ' + expected + ') | ' + h.reason);
}

function wantHigh(typed, expected) {
  want(typed, expected);
  const h = H.hint(typed);
  assert.ok(h.highConfidence, typed + ' should be high confidence: ' + h.reason);
}

(function () {
  // Screenshot C300: urutan + kata salah
  wantHigh('show onu gpon unconf', 'show gpon onu uncfg');
  wantHigh('sshow onu gpon uncfg', 'show gpon onu uncfg');
  wantHigh('show gpon onu unconf', 'show gpon onu uncfg');
  wantHigh('show onu gpon uncfg', 'show gpon onu uncfg');
  wantHigh('sshow onu gpon unconf', 'show gpon onu uncfg');

  // Perintah benar — jangan mengganggu
  want('show gpon onu uncfg', null);
  want('SHOW GPON ONU UNCFG', null);
  want('  show   gpon  onu  uncfg  ', null);
  want('show card', null);
  want('show gpon onu state gpon-olt_1/1/1', null);
  want('conf t', null);
  want('configure terminal', null);
  want('terminal length 0', null);
  want('end', null);

  // Typo / alias lain
  wantHigh('sshow card', 'show card');
  wantHigh('show gpon onu status', 'show gpon onu state');
  wantHigh('show onu uncfg', 'show gpon onu uncfg');
  wantHigh('gpon onu uncfg', 'show gpon onu uncfg');
  want('display ont autofind', 'show gpon onu uncfg');
  want('display ont autofind all', 'show gpon onu uncfg');

  // Satu kata khas — petunjuk, jangan auto-kirim
  (function () {
    const h = H.hint('unconf');
    assert.ok(h, 'unconf should hint');
    assert.strictEqual(h.correct, 'show gpon onu uncfg');
    assert.strictEqual(h.highConfidence, false);
  })();

  // Jangan salah tebak config / sampah
  want('interface gpon-olt_1/1/1', null);
  want('pon-onu-mng gpon-onu_1/1/1:1', null);
  want('asdf qwer zxcv', null);
  want('show', null);
  want('', null);

  // Pertahankan argumen interface
  wantHigh('show onu gpon unconf gpon-olt_1/2/1', 'show gpon onu uncfg gpon-olt_1/2/1');

  console.log('✓ oltCliHints tests PASS');
})();
