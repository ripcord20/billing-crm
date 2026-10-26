'use strict';
const assert = require('assert');
const {
  toNum,
  formatDurationId,
  formatBytes,
  formatTs,
  normalizeMac,
  escapeLike,
  mapSession
} = require('../utils/radiusAcctFormat');

assert.strictEqual(toNum('123'), 123);
assert.strictEqual(toNum(null), 0);
assert.strictEqual(toNum('69.17'), 69.17);

assert.strictEqual(formatDurationId(0), '0 detik');
assert.strictEqual(formatDurationId(1607), '26 menit 47 detik');
assert.strictEqual(formatDurationId(402247), '4 hari 15 jam 44 menit 7 detik');
assert.strictEqual(formatDurationId(3600), '1 jam');
assert.strictEqual(formatDurationId(59), '59 detik');

assert.strictEqual(formatBytes(0), '0 B');
assert.strictEqual(formatBytes(1023), '1023 B');
assert.strictEqual(formatBytes(1048576), '1 MB');
assert.strictEqual(formatBytes(60.72 * 1024 * 1024), '60.72 MB');
assert.strictEqual(formatBytes(69.17 * 1024 * 1024 * 1024), '69.17 GB');

const ts = formatTs('2026-10-26T11:08:12.000Z', 'Asia/Jakarta');
assert.strictEqual(ts, '2026-10-26 18:08:12');
assert.strictEqual(formatTs(null), null);

assert.strictEqual(normalizeMac('c0fd8435957b'), 'C0:FD:84:35:95:7B');
assert.strictEqual(normalizeMac('C0-FD-84-35-95-7B'), 'C0:FD:84:35:95:7B');
assert.strictEqual(normalizeMac('C0:FD:84:35:95:7B'), 'C0:FD:84:35:95:7B');
assert.strictEqual(escapeLike('a%b_c'), 'a\\%b\\_c');

const mapped = mapSession({
  radacctid: 97802325,
  acctsessionid: 'abc',
  acctuniqueid: 'u1',
  username: 'budi',
  nasipaddress: '192.168.17.1',
  framedipaddress: '10.2.78.208',
  callingstationid: 'c0fd8435957b',
  acctstarttime: '2026-10-26T11:08:12.000Z',
  acctstoptime: '2026-10-26T11:34:59.000Z',
  acctsessiontime: 1607,
  acctinputoctets: 1048576,
  acctoutputoctets: 60.72 * 1024 * 1024,
  acctterminatecause: 'Lost-Carrier'
}, 'Asia/Jakarta');

assert.strictEqual(mapped.id, 97802325);
assert.strictEqual(mapped.online, false);
assert.strictEqual(mapped.start, '2026-10-26 18:08:12');
assert.strictEqual(mapped.uptime, '26 menit 47 detik');
assert.strictEqual(mapped.download, '60.72 MB');
assert.strictEqual(mapped.reason, 'Lost-Carrier');
assert.strictEqual(mapped.mac, 'C0:FD:84:35:95:7B');
assert.strictEqual(mapped.ip, '10.2.78.208');

const live = mapSession({
  radacctid: 1,
  username: 'ani',
  acctstoptime: null,
  acctsessiontime: 12,
  acctinputoctets: 0,
  acctoutputoctets: 0,
  callingstationid: '',
  framedipaddress: '10.0.0.2'
});
assert.strictEqual(live.online, true);
assert.strictEqual(live.reason, 'Online');
assert.strictEqual(live.stop, null);

const pkt = require('../utils/radiusAcctPacket');
const secret = 'testingsecret';
const req = pkt.buildAccountingRequest({
  username: 'budi',
  nasIp: '192.168.17.1',
  framedIp: '10.2.78.208',
  mac: 'C0:FD:84:35:95:7B',
  sessionId: 'sess-1',
  status: pkt.STATUS.Stop,
  sessionTime: 1607,
  inputOctets: 1048576,
  outputOctets: 63678054,
  terminateCauseCode: 2
}, secret, 9);
assert.strictEqual(pkt.requestAuthenticatorValid(req, secret), true);
assert.strictEqual(pkt.requestAuthenticatorValid(req, 'wrong'), false);
const parsed = pkt.parseAccountingRequest(req);
assert.ok(parsed);
assert.strictEqual(parsed.username, 'budi');
assert.strictEqual(parsed.statusName, 'Stop');
assert.strictEqual(parsed.terminateCause, 'Lost-Carrier');
assert.strictEqual(parsed.framedIp, '10.2.78.208');
assert.strictEqual(parsed.sessionTime, 1607);
assert.strictEqual(pkt.findMatchingSecret(req, ['nope', secret]), secret);
const resp = pkt.buildAccountingResponse(req, secret);
assert.strictEqual(resp[0], pkt.CODE_ACCOUNTING_RESPONSE);
assert.strictEqual(resp[1], 9);
assert.strictEqual(resp.length, 20);

console.log('✓ radiusAcct formatter tests PASS');
