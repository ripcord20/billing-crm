'use strict';
/**
 * Tes helper OTP portal (tanpa DB / SMTP / WA).
 * Jalankan: node backend/test/portalOtp.test.js
 */
const assert = require('assert');
const otp = require('../utils/portalOtp');

assert.strictEqual(otp.digitsOnly('+62 812-3456-7890'), '6281234567890');
assert.strictEqual(otp.to62('081234567890'), '6281234567890');
assert.strictEqual(otp.to62('6281234567890'), '6281234567890');
assert.strictEqual(otp.to62('81234567890'), '6281234567890');
assert.strictEqual(otp.to08('6281234567890'), '081234567890');

const variants = otp.phoneLookupVariants('0812-3456-7890');
assert.ok(variants.includes('081234567890'));
assert.ok(variants.includes('6281234567890'));
assert.ok(otp.phonesMatch('081234567890', '6281234567890'));
assert.ok(otp.phonesMatch('+62 812 3456 7890', '081234567890'));
assert.ok(!otp.phonesMatch('081111111111', '081234567890'));
assert.ok(!otp.phonesMatch('', '081234567890'));

assert.strictEqual(otp.normalizeEmail('  Ada.Email@Example.COM '), 'ada.email@example.com');
assert.ok(otp.isValidEmail('user@fiberix.my.id'));
assert.ok(!otp.isValidEmail('bukan-email'));
assert.ok(otp.isValidPhone('081234567890'));
assert.ok(otp.isValidPhone('6281234567890'));
assert.ok(!otp.isValidPhone('123'));
assert.ok(!otp.isValidPhone('abc'));

assert.strictEqual(otp.identifierKey('email', 'A@B.com'), 'a@b.com');
assert.strictEqual(otp.identifierKey('whatsapp', '081234567890'), '6281234567890');

const secret = 'unit-test-secret';
const code = '123456';
const hash = otp.hashOtp(code, secret);
assert.ok(otp.verifyOtpHash('123456', hash, secret));
assert.ok(!otp.verifyOtpHash('000000', hash, secret));
assert.ok(!otp.verifyOtpHash('123456', hash, 'lain'));

const gen = otp.generateOtpCode();
assert.ok(/^\d{6}$/.test(gen));

assert.strictEqual(otp.maskEmail('budi@fiberix.my.id'), 'bu***@fiberix.my.id');
assert.strictEqual(otp.maskPhone('081234567890'), '0812****890');
assert.strictEqual(otp.maskDestination('email', 'x@y.com'), 'x***@y.com');

const now = Date.parse('2026-09-03T00:10:00Z');
assert.strictEqual(otp.requestGate({ recentCount: 0, lastCreatedAt: null, now }).ok, true);
assert.strictEqual(otp.requestGate({ recentCount: 3, lastCreatedAt: null, now }).ok, false);
const cool = otp.requestGate({
  recentCount: 1,
  lastCreatedAt: new Date(now - 20 * 1000),
  now
});
assert.strictEqual(cool.ok, false);
assert.strictEqual(cool.reason, 'cooldown');
assert.ok(cool.wait >= 1);
assert.strictEqual(otp.requestGate({
  recentCount: 1,
  lastCreatedAt: new Date(now - 61 * 1000),
  now
}).ok, true);

console.log('portalOtp.test.js OK');
