'use strict';
const assert = require('assert');
const { SessionStore, hashPass } = require('../server/sessions');

const store = new SessionStore();
const { session, password } = store.create();
assert.ok(/^\d{9}$/.test(session.id));
assert.ok(/^\d{4}$/.test(password));
assert.strictEqual(hashPass(password, session.salt), session.passHash);

assert.strictEqual(store.joinViewer(session.id, '0000').error, 'Password salah');
assert.ok(store.joinViewer(session.id, password).session);

const fake = { id: 'ws' };
store.attachHost(session, fake);
assert.strictEqual(session.host, fake);
store.detach(fake);
assert.strictEqual(session.host, null);

assert.ok(store.resumeHost(session.id, session.token));
assert.strictEqual(store.resumeHost(session.id, 'salah'), null);
assert.strictEqual(store.joinViewer('999999999', password).error, 'ID tidak ditemukan');

console.log('session.test.js OK');
