'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  isMobileAppUserAgent,
  homePathForMobileApp,
  resolveAppHomePath
} = require('../utils/mobileApp');

assert.strictEqual(isMobileAppUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'), false);
assert.strictEqual(isMobileAppUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.43 Mobile Safari/537.36'), true);
assert.strictEqual(isMobileAppUserAgent('Mozilla/5.0 (Linux; Android 13) Capacitor/5.0.0'), true);
assert.strictEqual(isMobileAppUserAgent('Fiberix/1.0 Android'), true);
assert.strictEqual(isMobileAppUserAgent('Mozilla/5.0 FiberixBilling/2.1'), true);

assert.strictEqual(homePathForMobileApp('admin', 'Mozilla/5.0 (Linux; Android 13; wv) Chrome/120'), null);
assert.strictEqual(homePathForMobileApp('superadmin', 'Mozilla/5.0 (Linux; Android 13; wv) Chrome/120'), null);
assert.strictEqual(resolveAppHomePath('admin', 'Mozilla/5.0 (Linux; Android 13; wv)', '/dashboard'), '/dashboard');
assert.strictEqual(resolveAppHomePath('collector', 'Mozilla/5.0 (Linux; Android 13; wv)', '/collect/field'), '/collect/field');

const paySrc = fs.readFileSync(path.join(__dirname, '../../frontend/views/pages/mobile/payments.ejs'), 'utf8');
assert.ok(!paySrc.includes('id="pnFrame"'), 'Catat Pembayaran APK tidak boleh iframe');
assert.ok(!paySrc.includes("fr.src='/mobile/payment-new'"), 'jangan set iframe src payment-new');
assert.ok(paySrc.includes('href="/mobile/payment-new"'), 'FAB harus navigasi full-page ke /mobile/payment-new');

const newSrc = fs.readFileSync(path.join(__dirname, '../../frontend/views/pages/mobile/payment-new.ejs'), 'utf8');
assert.ok(newSrc.includes('data-m="ntf"'), 'form mobile harus punya opsi NTF');
assert.ok(newSrc.includes("(_method==='ntf')?'transfer':_method") || newSrc.includes('methodCanon'), 'NTF disimpan sebagai transfer');

const loginSrc = fs.readFileSync(path.join(__dirname, '../../frontend/views/pages/login.ejs'), 'utf8');
assert.ok(!loginSrc.includes("return '/mobile'"), 'login APK tidak boleh memaksa /mobile');
assert.ok(loginSrc.includes("removeItem('flyn_prefer_mobile')"), 'hapus preferensi /mobile yang tertinggal di APK');
assert.ok(loginSrc.includes("credentials: 'include'"), 'login fetch harus kirim cookie di WebView');

const serverSrc = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.ok(serverSrc.includes('crossOriginOpenerPolicy: false'), 'matikan COOP supaya WebView tidak ERR_BLOCKED_BY_RESPONSE');
assert.ok(serverSrc.includes('frameguard: false'), 'X-Frame-Options SAMEORIGIN memblokir Capacitor localhost');
assert.ok(serverSrc.includes("validate: { trustProxy: false }"), 'rate limiter tidak boleh throw ERR_ERL_PERMISSIVE_TRUST_PROXY');
assert.ok(serverSrc.includes('frameAncestors'), 'CSP frame-ancestors harus eksplisit');

const portalLogin = fs.readFileSync(path.join(__dirname, '../../frontend/views/portal/login.ejs'), 'utf8');
assert.ok(portalLogin.includes("credentials: 'include'"), 'portal login APK harus kirim cookie');

const inputPay = fs.readFileSync(path.join(__dirname, '../../frontend/views/pages/payments.ejs'), 'utf8');
assert.ok(inputPay.includes("repeat(2, minmax(0,1fr))") || inputPay.includes('repeat(2, minmax(0, 1fr))'), 'metode Input Payment 2 kolom, tidak geser samping');
assert.ok(!/method-grid \{[^}]*repeat\(3/.test(inputPay), 'jangan 3 kolom yang potong Transfer di APK');
assert.ok(inputPay.includes("selectMethod(this,'transfer')"), 'tombol Transfer tetap ada');

console.log('apkWebView.test.js OK');
