const assert = require('assert');
const {
  cashRoom, assertCanCollectCash, assertCanCreateSetor, nextDepositLimit
} = require('../utils/collectorCashGuard');

assert.strictEqual(cashRoom(2000000, 500000), 1500000);
assert.strictEqual(cashRoom(0, 0), 0);
assert.strictEqual(cashRoom(100, 200), 0);

let g = assertCanCollectCash({ depositLimit: 0, cashHeld: 0, pendingDeposit: false, amount: 100000 });
assert.strictEqual(g.ok, false);
assert.strictEqual(g.code, 'no_plafon');

g = assertCanCollectCash({ depositLimit: 2000000, cashHeld: 0, pendingDeposit: true, amount: 100000 });
assert.strictEqual(g.code, 'pending_setor');

g = assertCanCollectCash({ depositLimit: 2000000, cashHeld: 1900000, pendingDeposit: false, amount: 200000 });
assert.strictEqual(g.code, 'over_plafon');

g = assertCanCollectCash({ depositLimit: 2000000, cashHeld: 500000, pendingDeposit: false, amount: 100000 });
assert.strictEqual(g.ok, true);
assert.strictEqual(g.room, 1500000);

let s = assertCanCreateSetor({ cashHeld: 0, pendingDeposit: false, hasProof: true });
assert.strictEqual(s.code, 'no_cash');

s = assertCanCreateSetor({ cashHeld: 500000, pendingDeposit: false, hasProof: false });
assert.strictEqual(s.code, 'proof_required');

s = assertCanCreateSetor({ cashHeld: 500000, pendingDeposit: true, hasProof: true });
assert.strictEqual(s.code, 'pending_setor');

s = assertCanCreateSetor({ cashHeld: 500000, pendingDeposit: false, hasProof: true });
assert.strictEqual(s.ok, true);
assert.strictEqual(s.expected, 500000);

const up = nextDepositLimit(1000000, 200000, 500000);
assert.strictEqual(up.ok, true);
assert.strictEqual(up.next, 1500000);

const down = nextDepositLimit(1000000, 800000, -300000);
assert.strictEqual(down.ok, false);

const svc = require('fs').readFileSync(require('path').join(__dirname, '../services/CollectionService.js'), 'utf8');
assert.ok(svc.includes('injectDeposit'), 'CollectionService injek plafon');
assert.ok(svc.includes('assertCashCollect'), 'CollectionService guard tunai');

const field = require('fs').readFileSync(require('path').join(__dirname, '../controllers/CollectorFieldController.js'), 'utf8');
assert.ok(field.includes('assertCashCollect'), 'pay tunai dicek plafon');
assert.ok(field.includes('deposit_limit'), 'me() membawa plafon');

const dep = require('fs').readFileSync(require('path').join(__dirname, '../controllers/CashDepositController.js'), 'utf8');
assert.ok(dep.includes('assertSetorCreate'), 'setor dicek bukti + pending');
assert.ok(dep.includes('confirm_variance'), 'verifikasi selisih wajib konfirmasi');
assert.ok(dep.includes('deposited = expected'), 'setor dikunci ke kas di tangan');
assert.ok(dep.includes('emitCollectorDeposit'), 'verifikasi mendorong status ke app kolektor');

const ui = require('fs').readFileSync(require('path').join(__dirname, '../../frontend/views/pages/collect-field.ejs'), 'utf8');
assert.ok(ui.includes('Foto bukti setor wajib'), 'APK setor menolak tanpa foto');
assert.ok(ui.includes('sPlafon'), 'APK menampilkan plafon');
assert.ok(ui.includes('Plafon deposit masih Rp0'), 'APK menolak tunai tanpa injek');
assert.ok(ui.includes('collect:deposit'), 'APK mendengar status setoran realtime');
assert.ok(ui.includes('await loadMe()'), 'catat bayar refresh status setor sebelum kunci');
assert.ok(ui.includes('Tabel Saldo'), 'APK menampilkan tabel saldo plafon');
assert.ok(ui.includes('Riwayat Injek Saldo'), 'APK menampilkan riwayat injek');
assert.ok(svc.includes('emitCollectorDeposit'), 'injek plafon mendorong saldo ke app kolektor');

const admin = require('fs').readFileSync(require('path').join(__dirname, '../../frontend/public/js/collection-admin.js'), 'utf8');
assert.ok(admin.includes('openInject'), 'admin punya tombol injek');
assert.ok(admin.includes('/collectors/\' + uid + \'/inject'), 'admin memanggil endpoint injek');

const routes = require('fs').readFileSync(require('path').join(__dirname, '../routes/collection.js'), 'utf8');
assert.ok(routes.includes('/collectors/:id/inject'), 'route injek plafon');

const { depositEventPayload, emitCollectorDeposit } = require('../utils/collectDepositEvents');
assert.strictEqual(depositEventPayload({ id: 1, collector_id: 56, deposited_amount: 100, status: 'pending' }).pending_deposit, true);
assert.strictEqual(depositEventPayload({ id: 1, collector_id: 56, deposited_amount: 100, status: 'pending' }, { status: 'verified', pending_deposit: false }).pending_deposit, false);
let emitted = null;
global.__io = {
  to(room) {
    return { emit(ev, payload) { emitted = { room, ev, payload }; } };
  }
};
const pushed = emitCollectorDeposit(
  { id: 1, collector_id: 56, deposited_amount: 1186000, status: 'pending' },
  { status: 'verified', pending_deposit: false, cash_held: 0 }
);
assert.strictEqual(pushed.pending_deposit, false);
assert.strictEqual(pushed.status, 'verified');
assert.strictEqual(emitted.room, 'user_56');
assert.strictEqual(emitted.ev, 'collect:deposit');
assert.strictEqual(emitted.payload.cash_held, 0);
delete global.__io;

console.log('collectorCashGuard.test.js OK');
