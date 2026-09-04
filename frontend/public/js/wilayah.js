/**
 * wilayah.js — Modul Wilayah (disconnect + isolir per area)
 */
const TOKEN = localStorage.getItem('token');
const API = '/api';
const root = document.getElementById('wlRoot');
const IS_ADMIN = root && root.dataset.admin === '1';
const APP_NAME = (root && root.dataset.app) || 'Skynet';
const LOGO_URL = (root && root.dataset.logo) || '';

function authH() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN };
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtRp(v) {
  return 'Rp ' + (parseFloat(v) || 0).toLocaleString('id-ID');
}
function showToast(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(function () { el.style.display = 'none'; }, 3800);
}
function showOk(msg) { showToast('toastOk', '✓ ' + msg); }
function showErr(msg) { showToast('toastErr', '✕ ' + msg); }

async function api(path, opts) {
  const res = await fetch(API + path, Object.assign({ headers: authH() }, opts || {}));
  const json = await res.json().catch(function () { return {}; });
  if (!res.ok || json.success === false) throw new Error(json.message || 'Gagal');
  return json;
}

const icUser = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const icMoney = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>';
const icWork = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>';
const icPin = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const icPhone = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></svg>';

let cache = [];
let detailFilter = 'offline';

async function loadWilayah() {
  try {
    const json = await api('/wilayah');
    cache = json.data || [];
    const meta = json.meta || { total: cache.length, active: cache.filter(function (w) { return w.status === 'active'; }).length };
    document.getElementById('wlSub').textContent = meta.total + ' total  ' + meta.active + ' aktif';
    const tog = document.getElementById('wlInvToggle');
    if (tog) tog.checked = !!json.include_invoice;
    renderGrid();
  } catch (e) {
    showErr(e.message);
  }
}

function brandHtml() {
  if (LOGO_URL) return '<div class="wl-brand"><img src="' + esc(LOGO_URL) + '" alt=""><span>' + esc(APP_NAME) + '</span></div>';
  return '<div class="wl-brand"><span>' + esc(APP_NAME) + '</span></div>';
}

function geoLine(label, val) {
  return '<div class="wl-geo">' + icPin + '<div><b>' + label + '</b> ' + esc(val || '—') + '</div></div>';
}

function renderGrid() {
  const grid = document.getElementById('wlGrid');
  const empty = document.getElementById('wlEmpty');
  if (!cache.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = cache.map(function (w) {
    const active = w.status !== 'inactive';
    const badge = active
      ? '<span class="wl-badge on">Aktif</span>'
      : '<span class="wl-badge off">Nonaktif</span>';
    const bulk = active
      ? '<button type="button" class="wl-danger" onclick="event.stopPropagation();confirmIsolir(' + w.id + ')">Nonaktifkan Wilayah</button>'
      : '<button type="button" class="wl-restore" onclick="event.stopPropagation();confirmRestore(' + w.id + ')">Aktifkan Wilayah</button>';
    const adminBtns = IS_ADMIN
      ? ('<div class="wl-icons">' +
        '<button type="button" class="wl-iconbtn" title="Edit" onclick="event.stopPropagation();openForm(' + w.id + ')">' +
        '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>' +
        '<button type="button" class="wl-iconbtn del" title="Hapus" onclick="event.stopPropagation();confirmDel(' + w.id + ')">' +
        '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button></div>')
      : '';
    return '<article class="wl-card' + (active ? '' : ' inactive') + '">' +
      '<div class="wl-card-head" onclick="openDetail(' + w.id + ')">' +
        '<div><div class="wl-name">' + esc(w.name) + '</div><div class="wl-pills"><span class="wl-code">' + esc(w.code) + '</span>' + badge + '</div></div>' +
        brandHtml() +
      '</div>' +
      '<div class="wl-body" onclick="openDetail(' + w.id + ')">' +
        '<div class="wl-stat">' + icUser + (w.customer_count || 0) + ' Pelanggan</div>' +
        '<div>' + geoLine('Provinsi', w.province) + '</div>' +
        '<div class="wl-stat">' + icMoney + fmtRp(w.revenue) + '</div>' +
        '<div>' + geoLine('Kota', w.regency) + '</div>' +
        '<div class="wl-stat">' + icWork + (w.worker_count || 0) + ' Pekerja</div>' +
        '<div>' + geoLine('Kecamatan', w.district) + '</div>' +
        '<div class="wl-stat" style="color:#64748b;font-weight:600">' + (w.offline_count || 0) + ' offline · ' + (w.isolir_count || 0) + ' isolir</div>' +
        '<div>' + geoLine('Desa/Kel', w.village) + '</div>' +
        '<div></div><div class="wl-geo">' + icPhone + '<div><b>Telepon</b> ' + esc(w.phone || '—') + '</div></div>' +
      '</div>' +
      '<div class="wl-foot">' +
        '<div class="wl-foot-row"><span style="font-size:12.5px;color:#64748b">' + (w.active_count || 0) + ' pelanggan aktif</span>' + adminBtns + '</div>' +
        (IS_ADMIN ? bulk : '') +
      '</div></article>';
  }).join('');
}

function openInfo() { document.getElementById('infoModal').classList.add('active'); }
function closeInfo() { document.getElementById('infoModal').classList.remove('active'); }

function openForm(id) {
  document.getElementById('wlId').value = id || '';
  document.getElementById('formTitle').textContent = id ? 'Edit Wilayah' : 'Tambah Wilayah';
  const w = cache.find(function (x) { return Number(x.id) === Number(id); }) || {};
  document.getElementById('wlName').value = w.name || '';
  document.getElementById('wlCode').value = w.code || '';
  document.getElementById('wlProv').value = w.province || 'JAWA TIMUR';
  document.getElementById('wlReg').value = w.regency || 'KABUPATEN BANYUWANGI';
  document.getElementById('wlDist').value = w.district || 'BANYUWANGI';
  document.getElementById('wlVil').value = w.village || '';
  document.getElementById('wlPhone').value = w.phone || '';
  document.getElementById('formModal').classList.add('active');
}
function closeForm() { document.getElementById('formModal').classList.remove('active'); }

async function saveForm() {
  const id = document.getElementById('wlId').value;
  const body = {
    name: document.getElementById('wlName').value,
    code: document.getElementById('wlCode').value,
    province: document.getElementById('wlProv').value,
    regency: document.getElementById('wlReg').value,
    district: document.getElementById('wlDist').value,
    village: document.getElementById('wlVil').value,
    phone: document.getElementById('wlPhone').value
  };
  try {
    if (id) await api('/wilayah/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/wilayah', { method: 'POST', body: JSON.stringify(body) });
    closeForm();
    showOk('Wilayah disimpan');
    loadWilayah();
  } catch (e) { showErr(e.message); }
}

async function saveInvToggle() {
  try {
    const on = document.getElementById('wlInvToggle').checked;
    await api('/wilayah/settings', { method: 'PUT', body: JSON.stringify({ include_invoice: on }) });
    showOk(on ? 'Wilayah akan tercantum di invoice' : 'Wilayah tidak disertakan ke invoice');
  } catch (e) {
    showErr(e.message);
    loadWilayah();
  }
}

async function openDetail(id) {
  try {
    const json = await api('/wilayah/' + id);
    window._wlDetail = json.data;
    detailFilter = 'offline';
    document.getElementById('detTitle').textContent = json.data.name + ' · ' + json.data.code;
    renderDetail();
    document.getElementById('detailModal').classList.add('active');
  } catch (e) { showErr(e.message); }
}
function closeDetail() { document.getElementById('detailModal').classList.remove('active'); }

function renderDetail() {
  const d = window._wlDetail;
  if (!d) return;
  const tabs = [
    ['offline', 'Disconnect (' + (d.offline_count || 0) + ')'],
    ['isolir', 'Isolir (' + (d.isolir_count || 0) + ')'],
    ['online', 'Terhubung (' + (d.online_count || 0) + ')'],
    ['all', 'Semua (' + (d.customer_count || 0) + ')']
  ];
  document.getElementById('detTabs').innerHTML = tabs.map(function (t) {
    return '<button type="button" class="tab' + (detailFilter === t[0] ? ' on' : '') + '" onclick="detailFilter=\'' + t[0] + '\';renderDetail()">' + t[1] + '</button>';
  }).join('');
  const rows = (d.customers || []).filter(function (c) {
    if (detailFilter === 'all') return true;
    return c.connection === detailFilter;
  });
  if (!rows.length) {
    document.getElementById('detList').innerHTML = '<p style="color:#64748b;font-size:13px">Tidak ada pelanggan pada filter ini.</p>';
    return;
  }
  document.getElementById('detList').innerHTML = rows.map(function (c) {
    const chip = c.connection === 'online' ? '<span class="chip chip-on">Terhubung</span>'
      : c.connection === 'isolir' ? '<span class="chip chip-iso">Isolir</span>'
      : '<span class="chip chip-off">Offline</span>';
    return '<div class="wl-user"><div><div style="font-weight:800;color:#0f172a">' + esc(c.name) + '</div>' +
      '<div style="font-size:12px;color:#64748b">' + esc(c.customer_id) + (c.pppoe_username ? ' · ' + esc(c.pppoe_username) : '') + '</div></div>' +
      '<div style="text-align:right">' + chip +
      '<div><a href="/customers/profile/' + c.id + '" style="font-size:12px">Profil</a></div></div></div>';
  }).join('');
}

function closeConfirm() { document.getElementById('confirmModal').classList.remove('active'); }
function askConfirm(title, msg, fn, okColor) {
  document.getElementById('cfTitle').textContent = title;
  document.getElementById('cfMsg').textContent = msg;
  const btn = document.getElementById('cfOk');
  btn.style.background = okColor || '#e11d48';
  btn.onclick = function () { closeConfirm(); fn(); };
  document.getElementById('confirmModal').classList.add('active');
}

function confirmIsolir(id) {
  const w = cache.find(function (x) { return Number(x.id) === Number(id); });
  askConfirm('Nonaktifkan Wilayah', 'Isolir semua pelanggan di ' + (w ? w.name : 'wilayah ini') + ' (' + (w ? w.customer_count : 0) + ' akun). Lanjut?', async function () {
    try {
      const r = await api('/wilayah/' + id + '/isolir', { method: 'POST' });
      showOk(r.message || 'Isolir wilayah selesai');
      loadWilayah();
    } catch (e) { showErr(e.message); }
  });
}
function confirmRestore(id) {
  const w = cache.find(function (x) { return Number(x.id) === Number(id); });
  askConfirm('Aktifkan Wilayah', 'Pulihkan isolir pelanggan di ' + (w ? w.name : 'wilayah ini') + '?', async function () {
    try {
      const r = await api('/wilayah/' + id + '/restore', { method: 'POST' });
      showOk(r.message || 'Wilayah diaktifkan');
      loadWilayah();
    } catch (e) { showErr(e.message); }
  }, '#16a34a');
}
function confirmDel(id) {
  const w = cache.find(function (x) { return Number(x.id) === Number(id); });
  askConfirm('Hapus Wilayah', 'Hapus ' + (w ? w.name : 'wilayah') + '? Pelanggan tidak dihapus, tautan wilayah dilepas.', async function () {
    try {
      await api('/wilayah/' + id, { method: 'DELETE' });
      showOk('Wilayah dihapus');
      loadWilayah();
    } catch (e) { showErr(e.message); }
  });
}

if (!IS_ADMIN) {
  const add = document.getElementById('btnAddWl');
  if (add) add.style.display = 'none';
  const tog = document.getElementById('wlInvToggle');
  if (tog) tog.disabled = true;
}

loadWilayah();
