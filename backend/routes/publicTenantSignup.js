/**
 * publicTenantSignup.js
 * ──────────────────────────────────────────────────────────────────
 * Route PUBLIK (tanpa login) untuk pendaftaran tenant self-service.
 *
 * Mounted di server.js:
 *   app.use('/daftar-tenant', pageRouter)      → halaman form + status
 *   app.use('/pub/tenant-signup', apiRouter)   → endpoint JSON + webhook
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const Ctrl = require('../controllers/TenantSignupController');

const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' }
});
const readLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak permintaan. Coba lagi nanti.' }
});

// ── Halaman ───────────────────────────────────────────────────────
const pageRouter = express.Router();
pageRouter.get('/', readLimiter, (r, s, n) => Ctrl.renderPage(r, s, n));
pageRouter.get('/status/:code', readLimiter, (r, s, n) => Ctrl.renderStatus(r, s, n));

// ── API publik ────────────────────────────────────────────────────
const apiRouter = express.Router();
apiRouter.get('/plans', readLimiter, (r, s) => Ctrl.plans(r, s));
apiRouter.post('/', submitLimiter, (r, s) => Ctrl.create(r, s));
apiRouter.post('/:code/pay', submitLimiter, (r, s) => Ctrl.pay(r, s));
apiRouter.get('/:code/status', readLimiter, (r, s) => Ctrl.status(r, s));

// Webhook gateway (verifikasi signature di controller).
apiRouter.post('/webhook/midtrans', (r, s) => Ctrl.webhookMidtrans(r, s));
apiRouter.post('/webhook/duitku', (r, s) => Ctrl.webhookDuitku(r, s));
apiRouter.post('/webhook/tripay', (r, s) => Ctrl.webhookTripay(r, s));

module.exports = { pageRouter, apiRouter };
