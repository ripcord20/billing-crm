'use strict';

/**
 * TenantSignupService
 * ──────────────────────────────────────────────────────────────────────────
 * Logika bisnis pendaftaran tenant self-service:
 *   - Daftar paket langganan (dari app_settings, dengan default masuk akal).
 *   - Buat signup baru (status pending_payment).
 *   - Aktivasi idempotent: buat Tenant + user owner (role tenant_owner),
 *     tautkan, set status 'active'. Dipanggil setelah pembayaran sukses.
 */

const crypto = require('crypto');
const axios = require('axios');
const { TenantSignup, Tenant, User, Role, AppSetting } = require('../models');
const { slugify } = require('./RadiusTenantMigration');
const { encryptSecret } = require('../utils/secretBox');
const logger = require('../utils/logger');

const DEFAULT_PLANS = [
  { code: 'starter', name: 'Starter', price: 150000, desc: 'Sampai 100 pelanggan' },
  { code: 'pro', name: 'Pro', price: 350000, desc: 'Sampai 500 pelanggan' },
  { code: 'unlimited', name: 'Unlimited', price: 750000, desc: 'Pelanggan tak terbatas' }
];

async function getSetting(key, fallback = null) {
  try {
    const s = await AppSetting.findOne({ where: { key } });
    return s && s.value != null ? s.value : fallback;
  } catch (_) {
    return fallback;
  }
}

async function getPlans() {
  const raw = await getSetting('tenant_signup_plans', '');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (_) { /* fallthrough to default */ }
  }
  return DEFAULT_PLANS;
}

async function findPlan(code) {
  const plans = await getPlans();
  return plans.find((p) => p.code === code) || null;
}

function genPassword() {
  // 10 char, mudah dibaca (tanpa karakter ambigu), tetap acak.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function uniqueSlug(base) {
  let slug = slugify(base);
  let n = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await Tenant.findOne({ where: { slug } })) {
    n += 1;
    slug = slugify(base) + '-' + n;
  }
  return slug;
}

async function createSignup(data = {}) {
  const { name, email, phone } = data;
  if (!name || !email || !phone) {
    const err = new Error('Nama, email, dan nomor HP wajib diisi');
    err.status = 400;
    throw err;
  }
  const plan = await findPlan(data.plan_code);
  if (!plan) {
    const err = new Error('Paket tidak valid');
    err.status = 400;
    throw err;
  }
  // Cegah duplikat email yang masih pending/aktif.
  const existing = await TenantSignup.findOne({
    where: { email: String(email).trim().toLowerCase() }
  });
  if (existing && ['pending_payment', 'paid', 'active'].includes(existing.status)) {
    return existing; // idempotent-ish: kembalikan yang ada, jangan buat ganda
  }

  const row = await TenantSignup.create({
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    phone: String(phone).trim(),
    company_name: data.company_name || null,
    address: data.address || null,
    requested_slug: data.requested_slug ? slugify(data.requested_slug) : null,
    plan_code: plan.code,
    plan_name: plan.name,
    amount: plan.price,
    status: 'pending_payment'
  });
  return row;
}

/**
 * Aktivasi idempotent. Membuat Tenant + owner bila belum ada.
 * @returns {{ signup, tenant, owner, tempPassword|null }}
 */
async function activate(signup) {
  if (signup.status === 'active' && signup.tenant_id && signup.owner_user_id) {
    const tenant = await Tenant.findByPk(signup.tenant_id);
    const owner = await User.findByPk(signup.owner_user_id);
    return { signup, tenant, owner, tempPassword: null };
  }

  const role = await Role.findOne({ where: { name: 'tenant_owner' } });
  if (!role) throw new Error('Role tenant_owner belum ada — jalankan migrasi tenant dulu');

  // Guard email owner unik.
  const dupUser = await User.findOne({ where: { email: signup.email } });
  if (dupUser) {
    throw new Error('Email sudah dipakai user lain — tidak bisa membuat owner tenant');
  }

  const slug = await uniqueSlug(signup.requested_slug || signup.company_name || signup.name);
  const tenant = await Tenant.create({
    name: signup.company_name || signup.name,
    slug,
    company_name: signup.company_name || null,
    phone: signup.phone || null,
    email: signup.email || null,
    address: signup.address || null,
    status: 'active',
    notes: `Dibuat otomatis dari signup ${signup.signup_code}`
  });

  const tempPassword = genPassword();
  const owner = await User.create({
    name: signup.name,
    email: signup.email,
    password: tempPassword, // di-hash oleh hook User.beforeCreate
    phone: signup.phone || null,
    role_id: role.id,
    tenant_id: tenant.id,
    is_active: true
  });

  await tenant.update({ owner_user_id: owner.id });
  await signup.update({
    status: 'active',
    tenant_id: tenant.id,
    owner_user_id: owner.id,
    temp_password: encryptSecret(tempPassword),
    activated_at: new Date()
  });

  logger.info(`[TenantSignup] Activated ${signup.signup_code} → tenant#${tenant.id} owner#${owner.id}`);
  return { signup, tenant, owner, tempPassword };
}

/** Tandai lunas lalu aktifkan (idempotent). */
async function markPaidAndActivate(signup, { gateway, ref } = {}) {
  if (signup.status === 'pending_payment') {
    await signup.update({
      status: 'paid',
      gateway: gateway || signup.gateway,
      gateway_ref: ref || signup.gateway_ref,
      paid_at: new Date()
    });
  }
  return activate(signup);
}

// ── Gateway pembayaran (TSU-{id}-{ts}) ──────────────────────────────────────
// Mirror ringkas dari PublicVoucherService: Midtrans/Duitku/Tripay. Webhook
// khusus di /pub/tenant-signup/webhook/{provider} akan meng-aktivasi otomatis.
function mapErr(name, e) {
  if (e.response) {
    const d = e.response.data;
    const msg = d?.message || d?.Message || (d?.error_messages?.join(', ')) || e.message;
    logger.error(`[TenantSignup] ${name} ${e.response.status}: ${JSON.stringify(d)}`);
    return { success: false, http: 400, message: `${name}: ${msg}` };
  }
  logger.error(`[TenantSignup] ${name} error: ${e.message}`);
  return { success: false, http: 502, message: `Tidak bisa terhubung ke ${name}` };
}

async function createGatewayTxn({ signup, tripayMethod, baseUrl }) {
  const gwEnabled = await getSetting('payment_gateway_enabled', 'false');
  if (!(gwEnabled === 'true' || gwEnabled === '1')) {
    return { success: false, http: 400, message: 'Pembayaran online belum aktif. Gunakan transfer manual / hubungi admin.' };
  }
  const provider    = await getSetting('payment_gateway_provider', 'midtrans');
  const gwKey       = await getSetting('payment_gateway_server_key', '');
  const gwClientKey = await getSetting('payment_gateway_client_key', '');
  if (!gwKey) return { success: false, http: 400, message: 'Pembayaran online belum dikonfigurasi.' };

  const amount = Math.round(Number(signup.amount));
  if (!(amount > 0)) return { success: false, http: 400, message: 'Nominal paket belum diatur.' };
  const refBase = `TSU-${signup.id}-${Date.now()}`;
  const finishUrl = `${baseUrl}/daftar-tenant/status/${signup.signup_code}`;
  const itemName = `Langganan Billing — ${signup.plan_name || signup.plan_code}`.slice(0, 50);
  const parts = String(signup.name || 'Pendaftar').trim().split(/\s+/);
  const firstName = parts[0] || 'Pendaftar';
  const lastName = parts.slice(1).join(' ');
  const email = signup.email || 'noreply@example.com';
  const phone = String(signup.phone || '').replace(/[^0-9]/g, '');

  if (provider === 'midtrans') {
    const isProd = (await getSetting('payment_gateway_env', 'sandbox')) === 'production';
    const snapUrl = isProd
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
    const payload = {
      transaction_details: { order_id: refBase, gross_amount: amount },
      customer_details: { first_name: firstName, last_name: lastName || undefined, email, phone: phone || undefined },
      item_details: [{ id: `plan-${signup.plan_code}`, price: amount, quantity: 1, name: itemName }],
      callbacks: { finish: finishUrl }
    };
    const auth = Buffer.from(gwKey + ':').toString('base64');
    let snap;
    try {
      snap = await axios.post(snapUrl, payload, { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, timeout: 15000 });
    } catch (e) { return mapErr('Midtrans', e); }
    if (!snap?.data?.token) return { success: false, http: 502, message: 'Midtrans: snap_token kosong' };
    await signup.update({ gateway: 'midtrans', gateway_ref: refBase, payment_url: snap.data.redirect_url || null });
    return { success: true, mode: 'midtrans', snap_token: snap.data.token, snap_url: snap.data.redirect_url, client_key: gwClientKey, env: isProd ? 'production' : 'sandbox' };
  }

  if (provider === 'duitku') {
    const merchantCode = await getSetting('payment_gateway_merchant_code', '');
    if (!merchantCode) return { success: false, http: 400, message: 'Merchant Code Duitku belum diisi.' };
    const isProd = (await getSetting('payment_gateway_env', 'sandbox')) === 'production';
    const inquiryUrl = isProd
      ? 'https://api-prod.duitku.com/api/merchant/createInvoice'
      : 'https://api-sandbox.duitku.com/api/merchant/createInvoice';
    const billingAddress = { firstName, lastName: lastName || '', address: 'N/A', city: 'Indonesia', postalCode: '00000', phone: phone || '', countryCode: 'ID' };
    const payload = {
      paymentAmount: amount, merchantOrderId: refBase, productDetails: itemName, email, phoneNumber: phone || '',
      customerVaName: firstName.slice(0, 20), callbackUrl: `${baseUrl}/pub/tenant-signup/webhook/duitku`,
      returnUrl: finishUrl, expiryPeriod: 1440,
      customerDetail: { firstName, lastName: lastName || '', email, phoneNumber: phone || '', billingAddress, shippingAddress: billingAddress },
      itemDetails: [{ name: itemName, price: amount, quantity: 1 }]
    };
    const ts = Date.now().toString();
    const sig = crypto.createHash('sha256').update(merchantCode + ts + gwKey).digest('hex');
    let duk;
    try {
      duk = await axios.post(inquiryUrl, payload, { headers: { 'Content-Type': 'application/json', 'x-duitku-merchantcode': merchantCode, 'x-duitku-timestamp': ts, 'x-duitku-signature': sig }, timeout: 15000 });
    } catch (e) { return mapErr('Duitku', e); }
    const d = duk?.data || {};
    if (d.statusCode && d.statusCode !== '00') return { success: false, http: 400, message: `Duitku: ${d.statusMessage || 'gagal'} (${d.statusCode})` };
    if (!d.paymentUrl) return { success: false, http: 502, message: 'Duitku response tidak valid' };
    await signup.update({ gateway: 'duitku', gateway_ref: refBase, payment_url: d.paymentUrl });
    return { success: true, mode: 'duitku', payment_url: d.paymentUrl };
  }

  if (provider === 'tripay') {
    const merchantCode = await getSetting('payment_gateway_merchant_code', '');
    const privateKey   = await getSetting('payment_gateway_private_key', '');
    if (!merchantCode || !privateKey) return { success: false, http: 400, message: 'Merchant/Private Key Tripay belum diisi.' };
    const method = (tripayMethod || '').toString().trim();
    if (!method) return { success: false, http: 400, code: 'TRIPAY_METHOD_REQUIRED', message: 'Pilih metode pembayaran dahulu.' };
    const isProd = (await getSetting('payment_gateway_env', 'sandbox')) === 'production';
    const apiBase = isProd ? 'https://tripay.co.id/api' : 'https://tripay.co.id/api-sandbox';
    const signature = crypto.createHmac('sha256', privateKey).update(merchantCode + refBase + amount).digest('hex');
    const payload = {
      method, merchant_ref: refBase, amount,
      customer_name: String(signup.name || 'Pendaftar').slice(0, 50), customer_email: email, customer_phone: phone || '',
      order_items: [{ sku: `PLAN-${signup.plan_code}`, name: itemName, price: amount, quantity: 1 }],
      callback_url: `${baseUrl}/pub/tenant-signup/webhook/tripay`, return_url: finishUrl,
      expired_time: Math.floor(Date.now() / 1000) + 86400, signature
    };
    let trx;
    try {
      trx = await axios.post(`${apiBase}/transaction/create`, payload, { headers: { Authorization: `Bearer ${gwKey}`, 'Content-Type': 'application/json' }, timeout: 15000 });
    } catch (e) { return mapErr('Tripay', e); }
    const tBody = trx?.data || {};
    if (!tBody.success || !tBody.data?.checkout_url) return { success: false, http: 400, message: `Tripay: ${tBody.message || 'gagal'}` };
    await signup.update({ gateway: 'tripay', gateway_ref: refBase, payment_url: tBody.data.checkout_url });
    return { success: true, mode: 'tripay', payment_url: tBody.data.checkout_url };
  }

  return { success: false, http: 400, message: 'Provider gateway tidak dikenali' };
}

module.exports = {
  DEFAULT_PLANS,
  getSetting,
  getPlans,
  findPlan,
  createSignup,
  activate,
  markPaidAndActivate,
  createGatewayTxn,
  genPassword,
  uniqueSlug
};
