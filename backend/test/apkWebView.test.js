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

assert.strictEqual(homePathForMobileApp('admin', 'Mozilla/5.0 (Linux; Android 13; wv) Chrome/120'), '/mobile');
assert.strictEqual(homePathForMobileApp('superadmin', 'Mozilla/5.0 (Linux; Android 13; wv) Chrome/120'), '/mobile');
assert.strictEqual(homePathForMobileApp('collector', 'Mozilla/5.0 (Linux; Android 13; wv) Chrome/120'), null);
assert.strictEqual(homePathForMobileApp('admin', 'Mozilla/5.0 (Windows NT 10.0; Chrome/120)'), null);
assert.strictEqual(resolveAppHomePath('admin', 'Mozilla/5.0 (Linux; Android 13; wv)', '/dashboard'), '/mobile');
assert.strictEqual(resolveAppHomePath('collector', 'Mozilla/5.0 (Linux; Android 13; wv)', '/collect/field'), '/collect/field');

const paySrc = fs.readFileSync(path.join(__dirname, '../../frontend/views/pages/mobile/payments.ejs'), 'utf8');
assert.ok(!paySrc.includes('id="pnFrame"'), 'Catat Pembayaran APK tidak boleh iframe');
assert.ok(!paySrc.includes("fr.src='/mobile/payment-new'"), 'jangan set iframe src payment-new');
assert.ok(paySrc.includes('href="/mobile/payment-new"'), 'FAB harus navigasi full-page ke /mobile/payment-new');

const newSrc = fs.readFileSync(path.join(__dirname, '../../frontend/views/pages/mobile/payment-new.ejs'), 'utf8');
assert.ok(newSrc.includes('data-m="ntf"'), 'form mobile harus punya opsi NTF');
assert.ok(newSrc.includes("(_method==='ntf')?'transfer':_method") || newSrc.includes('methodCanon'), 'NTF disimpan sebagai transfer');

const loginSrc = fs.readFileSync(path.join(__dirname, '../../frontend/views/pages/login.ejs'), 'utf8');
assert.ok(loginSrc.includes('flynIsAppShell'), 'login harus deteksi Capacitor/WebView');
assert.ok(loginSrc.includes("credentials: 'include'"), 'login fetch harus kirim cookie di WebView');

const serverSrc = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.ok(serverSrc.includes('crossOriginOpenerPolicy: false'), 'matikan COOP supaya WebView tidak ERR_BLOCKED_BY_RESPONSE');
assert.ok(serverSrc.includes('frameguard: false'), 'X-Frame-Options SAMEORIGIN memblokir Capacitor localhost');
assert.ok(serverSrc.includes("validate: { trustProxy: false }"), 'rate limiter tidak boleh throw ERR_ERL_PERMISSIVE_TRUST_PROXY');
assert.ok(serverSrc.includes('frameAncestors'), 'CSP frame-ancestors harus eksplisit');

const portalLogin = fs.readFileSync(path.join(__dirname, '../../frontend/views/portal/login.ejs'), 'utf8');
assert.ok(portalLogin.includes("credentials: 'include'"), 'portal login APK harus kirim cookie');

console.log('apkWebView.test.js OK');
