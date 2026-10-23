'use strict';
const assert = require('assert');
const {
  classifyPinnedIface,
  shouldNotifyTicketToTechGroup,
  truthyFlag,
  formatUplinkWaText,
  formatTicketWaText,
  formatUplinkTelegramHtml,
  uplinkRefId,
  bitsToMbps,
} = require('../utils/uplinkOps');

assert.deepStrictEqual(classifyPinnedIface(null), {
  state: 'missing', isDown: true, label: 'Interface tidak ditemukan'
});
assert.strictEqual(classifyPinnedIface({ disabled: true, running: true }).state, 'disabled');
assert.strictEqual(classifyPinnedIface({ disabled: false, running: false }).state, 'down');
assert.strictEqual(classifyPinnedIface({ disabled: false, running: true }).state, 'up');
assert.strictEqual(classifyPinnedIface({ running: true }).isDown, false);

assert.strictEqual(shouldNotifyTicketToTechGroup({ type: 'gangguan' }), true);
assert.strictEqual(shouldNotifyTicketToTechGroup({ type: 'request' }), false);
assert.strictEqual(shouldNotifyTicketToTechGroup({ type: 'installation' }), false);
assert.strictEqual(shouldNotifyTicketToTechGroup({ type: 'gangguan', notify_tech_group: '0' }), false);
assert.strictEqual(shouldNotifyTicketToTechGroup({ type: 'request', notify_tech_group: '1' }), true);
assert.strictEqual(shouldNotifyTicketToTechGroup({ type: 'request', notify_tech_group: false }), false);
assert.strictEqual(shouldNotifyTicketToTechGroup({}), true);

assert.strictEqual(truthyFlag(undefined, true), true);
assert.strictEqual(truthyFlag('', true), true);
assert.strictEqual(truthyFlag('0', true), false);
assert.strictEqual(truthyFlag(false, true), false);
assert.strictEqual(truthyFlag('true', false), true);

const downTxt = formatUplinkWaText({
  event: 'down', router: 'CORE1', iface: 'sfp-sfpplus1', comment: 'ISP', waktu: '1/1/2026',
});
assert.ok(downTxt.includes('UPLINK DOWN'));
assert.ok(downTxt.includes('CORE1'));
assert.ok(downTxt.includes('sfp-sfpplus1'));
assert.ok(!formatUplinkWaText({ event: 'recover', router: 'CORE1', iface: 'ether1' }).includes('Cek kabel'));

const tix = formatTicketWaText({
  event: 'created', ticketNo: 'TKT-1', subject: 'Putus', type: 'Gangguan',
  customerName: 'Budi', description: '   internet   mati  ',
});
assert.ok(tix.includes('TIKET GANGGUAN BARU'));
assert.ok(tix.includes('TKT-1'));
assert.ok(formatTicketWaText({ event: 'resolved' }).includes('TIKET SELESAI'));
assert.ok(formatTicketWaText({ event: 'closed' }).includes('TIKET DITUTUP'));

const html = formatUplinkTelegramHtml({
  event: 'down', router: '<core>', iface: 'sfp&1', komentar: '', waktu: 'now',
});
assert.ok(html.includes('&lt;core&gt;'));
assert.ok(html.includes('sfp&amp;1'));
assert.ok(!html.includes('<core>'));

assert.strictEqual(uplinkRefId(12, 'sfp-sfpplus1'), '12:sfp-sfpplus1');
assert.strictEqual(bitsToMbps(10e6), 10);

console.log('uplinkOps.test.js OK');
