/* ============================================================
   assets.js — Asset Management Frontend (FINAL MODERN)
   Clean soft colors like Hasmart reference
   ============================================================ */

'use strict';

// ── State ────────────────────────────────────────────────────
let currentPage  = 1;
let currentLimit = 25;
let currentView  = 'list';
let categories   = [];
let customers    = [];
let infras       = [];
let onts         = [];
let activeAssetId = null;
let searchTimer   = null;
let pickerPromise = null;

// ApexCharts instances
let valueChart = null;
let statusChart = null;
let categoryChart = null;
let conditionChart = null;
let currentPeriod = '30d';
let currentValueFilter = 'all'; // 'all' | 'active' | 'storage' | 'damaged'

function whenIdle(fn, timeout) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: timeout || 1200 });
  } else {
    setTimeout(fn, 200);
  }
}

function loadScriptOnce(src) {
  const key = '__load:' + src;
  if (window[key]) return window[key];
  window[key] = new Promise((resolve, reject) => {
    if (src.indexOf('apexcharts') !== -1 && typeof ApexCharts !== 'undefined') {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gagal memuat ' + src));
    document.head.appendChild(s);
  });
  return window[key];
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fillSelect(id, placeholder, rows, labelFn) {
  const s = $(id);
  if (!s) return;
  s.innerHTML = '<option value="">' + placeholder + '</option>' +
    rows.map(row => {
      const lab = labelFn(row);
      return '<option value="' + escHtml(row.id) + '">' + lab + '</option>';
    }).join('');
}

function ensurePickerOptions() {
  if (pickerPromise) return pickerPromise;
  pickerPromise = Promise.all([
    loadCustomerOptions(),
    loadInfraOptions(),
    loadOntOptions()
  ]);
  return pickerPromise;
}

const CABLE_KIND_LABEL = {
  fig8: 'Figure-8 (Fig8)',
  adss: 'ADSS',
  duct: 'Duct / Underground',
  indoor: 'Indoor',
  drop: 'Drop core',
  armored: 'Armored'
};

function categoryOf(aOrId) {
  if (aOrId && typeof aOrId === 'object') {
    if (aOrId.category) return aOrId.category;
    return categories.find(c => String(c.id) === String(aOrId.category_id)) || null;
  }
  return categories.find(c => String(c.id) === String(aOrId)) || null;
}

function isCableCategory(aOrId) {
  const c = categoryOf(aOrId);
  if (!c) return false;
  const s = ((c.slug || '') + ' ' + (c.name || '')).toLowerCase();
  return /kabel|cable|dropcore|drop.?core|patchcord|patch.?cord/.test(s);
}

function assetSpecs(a) {
  let s = a && a.specs;
  if (!s) return {};
  if (typeof s === 'string') {
    try { s = JSON.parse(s); } catch (e) { return {}; }
  }
  return s && typeof s === 'object' ? s : {};
}

function parseCableCore(model) {
  if (!model) return '';
  const m = String(model).match(/(\d+)\s*(c|core)?/i);
  return m ? m[1] : '';
}

function applyAssetFormMode() {
  const catId = $('fCategory') && $('fCategory').value;
  const cable = isCableCategory(catId);
  const form = $('assetForm');
  if (form) form.classList.toggle('cable-mode', cable);
  const name = $('fName');
  const brand = $('fBrand');
  const serial = $('fSerial');
  const lbl = $('lblSerial');
  const loc = $('fLocation');
  if (name) name.placeholder = cable ? 'Contoh: Kabel FO 12 Core Fig8 IFORTE' : 'Contoh: ONT ZTE F660 — Pelanggan Ahmad';
  if (brand) brand.placeholder = cable ? 'IFORTE, Furukawa, Fiberhome...' : 'ZTE, MikroTik, Huawei...';
  if (lbl) lbl.textContent = cable ? 'No. Drum / Gulungan' : 'Nomor Seri (S/N)';
  if (serial) serial.placeholder = cable ? 'Nomor drum / roll (bukan MAC)' : 'SN atau MAC Address';
  if (loc) loc.placeholder = cable ? 'Gudang / tray drum / tray ODP' : 'Gudang NOC / Rumah pelanggan / ODP-001';
  if (!cable) {
    ['fCableKind', 'fCableCore', 'fCableLength', 'fCableRemain'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
  }
}

function setCableCoreValue(core) {
  const sel = $('fCableCore');
  if (!sel) return;
  if (!core) { sel.value = ''; return; }
  if (![...sel.options].some(o => o.value === String(core))) {
    const opt = document.createElement('option');
    opt.value = String(core);
    opt.textContent = core + ' Core';
    sel.appendChild(opt);
  }
  sel.value = String(core);
}

function fillCableFields(a) {
  const sp = assetSpecs(a);
  const kindEl = $('fCableKind');
  if (kindEl) kindEl.value = sp.kind || '';
  setCableCoreValue(parseCableCore(a && a.model));
  const len = $('fCableLength');
  const rem = $('fCableRemain');
  if (len) len.value = sp.length_m != null ? sp.length_m : '';
  if (rem) rem.value = sp.remaining_m != null ? sp.remaining_m : '';
}

function readCableSpecs() {
  const lengthRaw = $('fCableLength') && $('fCableLength').value;
  const remainRaw = $('fCableRemain') && $('fCableRemain').value;
  const length_m = lengthRaw === '' ? null : parseFloat(lengthRaw);
  let remaining_m = remainRaw === '' ? null : parseFloat(remainRaw);
  if (remaining_m == null && Number.isFinite(length_m)) remaining_m = length_m;
  const kind = $('fCableKind') && $('fCableKind').value;
  const out = {};
  if (kind) out.kind = kind;
  if (Number.isFinite(length_m) && length_m >= 0) out.length_m = length_m;
  if (Number.isFinite(remaining_m) && remaining_m >= 0) out.remaining_m = remaining_m;
  return Object.keys(out).length ? out : null;
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadCategories();
  loadAssets();
  whenIdle(() => initCharts(), 1500);
});

// ── Utilities ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('id-ID').format(n || 0);
const fmtRp = n => 'Rp ' + fmt(n);
const fmtDate = d => d ? new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const fmtAgo = d => {
  if (!d) return '';
  const diff = (Date.now() - new Date(d)) / 1000;
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return Math.floor(diff/60) + ' menit lalu';
  if (diff < 86400) return Math.floor(diff/3600) + ' jam lalu';
  return fmtDate(d);
};

function statusBadge(s) {
  const map = {
    active:'Terpasang', storage:'Gudang', repair:'Servis',
    damaged:'Rusak', inactive:'Tidak Aktif', disposed:'Dibuang', lost:'Hilang'
  };
  return `<span class="badge-status ${s}">${map[s]||s}</span>`;
}
function conditionBadge(c) {
  const map = { new:'Baru', good:'Baik', fair:'Cukup', poor:'Buruk' };
  return `<span class="badge-condition ${c}">${map[c]||c}</span>`;
}

function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { currentPage = 1; loadAssets(); }, 350);
}

function switchTab(view, btn) {
  currentView = view;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  const listView = document.getElementById('viewList');
  const gridView = document.getElementById('viewGrid');
  
  if (view === 'list') {
    listView.style.display = 'block';
    gridView.style.display = 'none';
  } else {
    listView.style.display = 'none';
    gridView.style.display = 'grid'; //
  }
}

function openModal(id) { $(id).classList.add('show'); }
function closeModal(id) { $(id).classList.remove('show'); }

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('show'); });
});

// ── Load Stats ───────────────────────────────────────────────
async function loadStats() {
  try {
    const r = await fetch('/api/assets/stats');
    const j = await r.json();
    if (!j.success) return;
    const d = j.data;
    const bs = d.by_status || {};
    $('sTot').textContent     = d.total || 0;
    $('sActive').textContent  = bs.active  || 0;
    $('sStorage').textContent = bs.storage || 0;
    $('sDamaged').textContent = bs.damaged || 0;
    $('sValue').textContent   = fmtRp(d.total_value);

    // Update sidebar badge
    const badge = document.getElementById('asset-active-badge');
    if (badge && bs.active > 0) { badge.textContent = bs.active; badge.style.display = 'inline-flex'; }
    
    // Update charts
    if (statusChart || categoryChart) {
      loadChartData();
    }
  } catch(e) { console.error('[Assets] stats error:', e); }
}

// ── Load Categories ──────────────────────────────────────────
async function loadCategories() {
  try {
    const r = await fetch('/api/assets/categories');
    const j = await r.json();
    if (!j.success) return;
    categories = j.data;

    const sel = $('filterCategory');
    sel.innerHTML = '<option value="">Semua Kategori</option>';
    categories.forEach(c => {
      sel.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });

    ['fCategory'].forEach(id => {
      const s = $(id);
      if (!s) return;
      s.innerHTML = '<option value="">Pilih Kategori</option>';
      categories.forEach(c => {
        s.innerHTML += `<option value="${c.id}">${c.name}</option>`;
      });
    });
  } catch(e) {}
}

async function loadCustomerOptions() {
  try {
    const r = await fetch('/api/customers?picker=1&status=active');
    const j = await r.json();
    if (!j.success) return;
    customers = j.data || [];
    const label = c => '[' + escHtml(c.customer_id) + '] ' + escHtml(c.name);
    fillSelect('fCustomer', '— Tidak di-assign —', customers, label);
    fillSelect('aCustomer', '— Tidak di-assign —', customers, label);
  } catch(e) {}
}

async function loadInfraOptions() {
  try {
    const r = await fetch('/api/infrastructure?picker=1');
    const j = await r.json();
    if (!j.success) return;
    infras = j.data || [];
    const label = p => escHtml(p.name) + ' (' + escHtml(p.type) + ')';
    fillSelect('fInfra', '— Tidak di-assign —', infras, label);
    fillSelect('aInfra', '— Tidak di-assign —', infras, label);
  } catch(e) {}
}

async function loadOntOptions() {
  try {
    const r = await fetch('/api/ont?picker=1');
    const j = await r.json();
    if (!j.success) return;
    onts = j.data || [];
    fillSelect('fOnt', '— Tidak dilink —', onts, o =>
      escHtml(o.serial_number || o.id) + ' — ' + escHtml(o.model || ''));
  } catch(e) {}
}

// ── Load Assets (list) ───────────────────────────────────────
async function loadAssets() {
  try {
    const search   = $('searchInput').value.trim();
    const status   = $('filterStatus').value;
    const category = $('filterCategory').value;

    const params = new URLSearchParams({
      page:  currentPage,
      limit: currentLimit,
      ...(search   && { search }),
      ...(status   && { status }),
      ...(category && { category_id: category })
    });

    const r = await fetch('/api/assets?' + params);
    const j = await r.json();
    if (!j.success) return;

    renderTable(j.data);
    renderGrid(j.data);
    renderPagination(j.pagination);
  } catch(e) { console.error('[Assets] load error:', e); }
}

// ── Render Table ─────────────────────────────────────────────
function renderTable(rows) {
  const tbody = $('assetTableBody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted)">Tidak ada asset ditemukan</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(a => {
    const photo = a.photo_url
      ? `<div class="asset-photo"><img src="${a.photo_url}" alt="foto" loading="lazy"></div>`
      : `<div class="asset-photo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;

    const catColor = a.category?.color || '#94a3b8';
    const catName  = a.category?.name  || '—';
    const assigned = a.customer ? `<span style="color:var(--primary);font-size:12px;">${a.customer.name}</span>`
                    : a.infrastructure ? `<span style="color:var(--success);font-size:12px;">${a.infrastructure.name}</span>`
                    : `<span style="color:var(--text-muted);font-size:12px;">—</span>`;
    const cable = isCableCategory(a);
    const sp = cable ? assetSpecs(a) : {};
    const brandCell = cable
      ? [a.brand, a.model, CABLE_KIND_LABEL[sp.kind] || ''].filter(Boolean).join(' · ') || '—'
      : ((a.brand || '—') + ' ' + (a.model || ''));
    const identCell = cable
      ? (a.serial_number || (sp.length_m != null ? (sp.length_m + ' m') : '—'))
      : (a.serial_number || '—');

    return `<tr style="cursor:pointer" onclick="viewAsset(${a.id})">
      <td>${photo}</td>
      <td>
        <div style="font-weight:600;font-size:13px;">${a.name}</div>
        <div style="font-size:11px;color:var(--text-muted);font-family:monospace;margin-top:2px;">${a.asset_code}</div>
      </td>
      <td><span class="cat-dot" style="background:${catColor};"></span>${catName}</td>
      <td style="font-size:12px;">${escHtml(brandCell)}</td>
      <td style="font-size:12px;font-family:monospace;">${escHtml(identCell)}</td>
      <td>${statusBadge(a.status)}</td>
      <td>${conditionBadge(a.condition)}</td>
      <td>${assigned}</td>
      <td style="font-weight:600;">${a.purchase_price > 0 ? fmtRp(a.purchase_price) : '—'}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:5px;align-items:center;">
          <button onclick="openEdit(${a.id})" title="Edit" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:7px;border:1.5px solid #e2e8f0;background:#fff;color:#374151;cursor:pointer;transition:all .15s;" onmouseover="this.style.borderColor=\'#3b82f6\';this.style.color=\'#3b82f6\'" onmouseout="this.style.borderColor=\'#e2e8f0\';this.style.color=\'#374151\'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button data-id="${a.id}" data-name="${a.name.replace(/"/g,'&quot;')}" onclick="deleteAsset(this.dataset.id,this.dataset.name)" title="Hapus" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:7px;border:1.5px solid #e2e8f0;background:#fff;color:#94a3b8;cursor:pointer;transition:all .15s;" onmouseover="this.style.borderColor=\'#ef4444\';this.style.color=\'#ef4444\';this.style.background=\'#fef2f2\'" onmouseout="this.style.borderColor=\'#e2e8f0\';this.style.color=\'#94a3b8\';this.style.background=\'#fff\'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Render Grid ──────────────────────────────────────────────
function renderGrid(rows) {
  const grid = $('assetGrid');
  if (!rows.length) {
    grid.innerHTML = '<div style="grid-column:span 4;text-align:center;padding:60px;color:var(--text-muted)">Tidak ada asset</div>';
    return;
  }
  grid.innerHTML = rows.map(a => {
    const photo = a.photo_url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%23e2e8f0" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" font-family="Arial" font-size="16" fill="%2394a3b8" text-anchor="middle" dominant-baseline="middle"%3ENo Photo%3C/text%3E%3C/svg%3E';
    return `<div class="grid-item" onclick="viewAsset(${a.id})">
      <div class="grid-item-photo" style="background-image:url(${photo})"></div>
      <div class="grid-item-body">
        <div class="grid-item-name">${a.name}</div>
        <div class="grid-item-code">${a.asset_code}</div>
        <div style="margin-top:8px;">${statusBadge(a.status)}</div>
        <div class="grid-item-price">${a.purchase_price > 0 ? fmtRp(a.purchase_price) : '—'}</div>
      </div>
    </div>`;
  }).join('');
}

// ── Render Pagination ────────────────────────────────────────
function renderPagination(p) {
  const el = $('pagination');
  if (!p || p.pages <= 1) { el.innerHTML = ''; return; }
  const btns = [];
  for (let i = 1; i <= p.pages; i++) {
    if (i === 1 || i === p.pages || (i >= p.page - 1 && i <= p.page + 1)) {
      btns.push(`<button class="pg-btn ${i === p.page ? 'active' : ''}" onclick="currentPage=${i};loadAssets()">${i}</button>`);
    } else if (btns[btns.length - 1] !== '...') {
      btns.push('...');
    }
  }
  el.innerHTML = btns.join('');
}

// ── Create/Edit Asset ────────────────────────────────────────
async function openAddAsset() {
  await ensurePickerOptions();
  $('assetModalTitle').textContent = 'Tambah Asset Baru';
  $('editAssetId').value = '';
  ['fName', 'fBrand', 'fModel', 'fSerial', 'fPurchaseDate', 'fPrice', 'fVendor', 'fWarranty', 'fLocation', 'fNotes', 'fCableKind', 'fCableCore', 'fCableLength', 'fCableRemain'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  ['fCategory', 'fStatus', 'fCondition', 'fCustomer', 'fInfra', 'fOnt'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  if ($('fCondition')) $('fCondition').value = 'good';
  if ($('fStatus')) $('fStatus').value = 'storage';
  applyAssetFormMode();
  openModal('assetModal');
}

async function openEdit(id) {
  try {
    await ensurePickerOptions();
    const r = await fetch('/api/assets/' + id);
    const j = await r.json();
    if (!j.success) return;
    const a = j.data;

    $('assetModalTitle').textContent = 'Edit Asset';
    $('editAssetId').value = a.id;
    $('fName').value = a.name || '';
    $('fCategory').value = a.category_id || '';
    $('fBrand').value = a.brand || '';
    $('fModel').value = a.model || '';
    $('fSerial').value = a.serial_number || '';
    $('fStatus').value = a.status || '';
    $('fCondition').value = a.condition || '';
    $('fPurchaseDate').value = a.purchase_date || '';
    $('fPrice').value = a.purchase_price || '';
    $('fVendor').value = a.purchase_vendor || '';
    $('fWarranty').value = a.warranty_until || '';
    $('fLocation').value = a.location || '';
    $('fCustomer').value = a.customer_id || '';
    $('fInfra').value = a.infrastructure_id || '';
    $('fOnt').value = a.ont_device_id || '';
    $('fNotes').value = a.notes || '';
    fillCableFields(a);
    applyAssetFormMode();
    openModal('assetModal');
  } catch(e) { alert('Gagal memuat data asset'); }
}

async function submitAsset(event) {
  if (event) event.preventDefault();
  const btn = $('assetSubmitBtn');
  const id  = $('editAssetId').value;
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    const cable = isCableCategory($('fCategory').value);
    const core = cable && $('fCableCore') && $('fCableCore').value;
    const body = {
      name: $('fName').value.trim(),
      category_id: $('fCategory').value || null,
      brand: $('fBrand').value || null,
      model: cable ? (core ? (core + ' Core') : null) : ($('fModel').value || null),
      serial_number: $('fSerial').value || null,
      status: $('fStatus').value || 'storage',
      condition: $('fCondition').value || 'good',
      purchase_date: $('fPurchaseDate').value || null,
      purchase_price: parseFloat($('fPrice').value) || 0,
      purchase_vendor: $('fVendor').value || null,
      warranty_until: $('fWarranty').value || null,
      location: $('fLocation').value || null,
      customer_id: $('fCustomer').value || null,
      infrastructure_id: $('fInfra').value || null,
      ont_device_id: cable ? null : ($('fOnt').value || null),
      notes: $('fNotes').value || null,
      specs: cable ? readCableSpecs() : null
    };

    const url    = id ? '/api/assets/' + id : '/api/assets';
    const method = id ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (j.success) {
      closeModal('assetModal');
      loadStats();
      loadAssets();
    } else {
      alert('Error: ' + j.message);
    }
  } catch(ex) { alert('Gagal menyimpan asset: ' + ex.message); }
  finally { btn.disabled = false; btn.textContent = id ? 'Update Asset' : 'Simpan Asset'; }
}

// ── View Asset Detail ────────────────────────────────────────
async function viewAsset(id) {
  activeAssetId = id;
  try {
    const r = await fetch('/api/assets/' + id);
    const j = await r.json();
    if (!j.success) return;
    const a = j.data;

    $('detailTitle').textContent = 'Detail Asset';
    $('dName').textContent       = a.name;
    $('dCode').textContent       = a.asset_code;
    $('dStatus').innerHTML       = statusBadge(a.status);
    $('dCondition').innerHTML    = conditionBadge(a.condition);
    $('dCat').textContent        = a.category?.name || '—';
    const cable = isCableCategory(a);
    const sp = assetSpecs(a);
    $('dBrandModel').textContent = [a.brand, a.model].filter(Boolean).join(' / ') || '—';
    const serialLbl = $('dSerialLbl');
    if (serialLbl) serialLbl.textContent = cable ? 'No. Drum / Gulungan' : 'Nomor Seri';
    $('dSerial').textContent     = a.serial_number || '—';
    const kindRow = $('dCableKindRow');
    const lenRow  = $('dCableLenRow');
    const ontRow  = $('dOntRow');
    if (kindRow) {
      kindRow.style.display = cable && sp.kind ? '' : 'none';
      if ($('dCableKind')) $('dCableKind').textContent = CABLE_KIND_LABEL[sp.kind] || sp.kind || '—';
    }
    if (lenRow) {
      const hasLen = cable && (sp.length_m != null || sp.remaining_m != null);
      lenRow.style.display = hasLen ? '' : 'none';
      if ($('dCableLen')) {
        const parts = [];
        if (sp.length_m != null) parts.push(sp.length_m + ' m gulungan');
        if (sp.remaining_m != null) parts.push(sp.remaining_m + ' m sisa');
        $('dCableLen').textContent = parts.join(' · ') || '—';
      }
    }
    if (ontRow) ontRow.style.display = cable ? 'none' : '';
    $('dPurchDate').textContent  = fmtDate(a.purchase_date);
    $('dPrice').textContent      = a.purchase_price > 0 ? fmtRp(a.purchase_price) : '—';
    $('dVendor').textContent     = a.purchase_vendor || '—';
    $('dWarranty').textContent   = a.warranty_until ? fmtDate(a.warranty_until) : '—';
    $('dLocation').textContent   = a.location || '—';
    $('dCustomer').textContent   = a.customer ? `${a.customer.name} (${a.customer.customer_id})` : '—';
    $('dInfra').textContent      = a.infrastructure?.name || '—';
    $('dOnt').textContent        = a.ont_device?.serial_number || '—';
    $('dAssigner').textContent   = a.assigner?.name || '—';
    $('dNotes').textContent      = a.notes || '—';

    const wrap = $('detailPhotoWrap');
    const hint = $('detailPhotoHint');
    if (a.photo_url) {
      const existing = wrap.querySelector('img');
      if (existing) existing.remove();
      const img = document.createElement('img');
      img.src = a.photo_url;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:6px;position:absolute;inset:0;';
      wrap.appendChild(img);
      hint.style.display = 'none';
    } else {
      const existing = wrap.querySelector('img');
      if (existing) existing.remove();
      hint.style.display = 'flex';
    }

    renderTimeline(a.history || []);
    openModal('detailModal');
  } catch(e) { alert('Gagal memuat detail asset'); }
}

function renderTimeline(history) {
  const tl = $('dTimeline');
  if (!history.length) { tl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">Belum ada riwayat.</div>'; return; }
  const actionLabel = {
    created:'Dibuat', updated:'Diperbarui', status_change:'Status berubah',
    assigned:'Di-assign', unassigned:'Di-unassign', moved:'Dipindah',
    repaired:'Diservis', disposed:'Dibuang', photo_updated:'Foto diperbarui'
  };
  tl.innerHTML = history.map(h => {
    let detail = '';
    if (h.action === 'status_change') {
      try {
        const o = JSON.parse(h.old_value || '{}');
        const n = JSON.parse(h.new_value || '{}');
        detail = `<span style="color:var(--danger)">${o.status||''}</span> → <span style="color:var(--success)">${n.status||''}</span>`;
      } catch(e) {}
    }
    return `<div class="tl-item ${h.action}">
      <div class="tl-dot"></div>
      <div class="tl-meta">${fmtAgo(h.created_at)}${h.performer ? ' · ' + h.performer.name : ''}</div>
      <div class="tl-action">${actionLabel[h.action]||h.action} ${detail}</div>
      ${h.note ? `<div class="tl-note">${h.note}</div>` : ''}
    </div>`;
  }).join('');
}

function openEditFromDetail() {
  closeModal('detailModal');
  openEdit(activeAssetId);
}

function triggerPhotoUpload() {
  $('photoFileInput').click();
}

async function uploadPhoto(input) {
  if (!input.files.length) return;
  const formData = new FormData();
  formData.append('photo', input.files[0]);
  try {
    const r = await fetch('/api/assets/' + activeAssetId + '/photo', { method: 'POST', body: formData });
    const j = await r.json();
    if (j.success) {
      const wrap = $('detailPhotoWrap');
      const hint = $('detailPhotoHint');
      let img = wrap.querySelector('img');
      if (!img) { img = document.createElement('img'); img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:6px;position:absolute;inset:0;'; wrap.appendChild(img); }
      img.src = j.url + '?t=' + Date.now();
      hint.style.display = 'none';
      loadAssets();
    } else { alert('Gagal upload foto: ' + j.message); }
  } catch(e) { alert('Gagal upload foto'); }
  input.value = '';
}

async function openAssignModal() {
  closeModal('detailModal');
  await ensurePickerOptions();
  $('aCustomer').value = '';
  $('aInfra').value    = '';
  $('aLocation').value = '';
  $('aNote').value     = '';
  openModal('assignModal');
}

async function submitAssign() {
  const body = {
    customer_id:       $('aCustomer').value || null,
    infrastructure_id: $('aInfra').value    || null,
    location:          $('aLocation').value || null,
    note:              $('aNote').value     || null
  };
  try {
    const r = await fetch('/api/assets/' + activeAssetId + '/assign', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (j.success) {
      closeModal('assignModal');
      loadStats();
      loadAssets();
      viewAsset(activeAssetId);
    } else { alert('Gagal assign: ' + j.message); }
  } catch(e) { alert('Error: ' + e.message); }
}

async function deleteAsset(id, name) {
  if (!confirm(`Hapus asset "${name}"?\n\nSeluruh riwayat asset ini juga akan dihapus.`)) return;
  try {
    const r = await fetch('/api/assets/' + id, { method: 'DELETE' });
    const j = await r.json();
    if (j.success) { loadStats(); loadAssets(); }
    else alert('Gagal hapus: ' + j.message);
  } catch(e) { alert('Error: ' + e.message); }
}

function openCategoryModal() {
  renderCategoryList();
  openModal('categoryModal');
}

function renderCategoryList() {
  const list = $('categoryList');
  if (!categories.length) { list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px;">Belum ada kategori</div>'; return; }
  list.innerHTML = categories.map(c => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg);border-radius:var(--radius-sm);">
      <span style="width:12px;height:12px;border-radius:50%;background:${c.color};flex-shrink:0;"></span>
      <span style="flex:1;font-size:13px;font-weight:500;">${c.name}</span>
      <span style="font-size:11px;color:var(--text-muted);font-family:monospace;">${c.slug}</span>
      <button class="btn btn-secondary" style="padding:3px 8px;font-size:11px;color:var(--danger);" onclick="deleteCategory(${c.id},'${c.name.replace(/'/g,"\\'")}')">Hapus</button>
    </div>
  `).join('');
}

async function addCategory() {
  const name = $('catName').value.trim();
  const color = $('catColor').value;
  if (!name) return alert('Nama kategori wajib diisi');
  try {
    const r = await fetch('/api/assets/categories', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ name, color })
    });
    const j = await r.json();
    if (j.success) {
      $('catName').value = '';
      await loadCategories();
      renderCategoryList();
    } else alert('Error: ' + j.message);
  } catch(e) { alert('Error: ' + e.message); }
}

async function deleteCategory(id, name) {
  if (!confirm(`Hapus kategori "${name}"?`)) return;
  try {
    const r = await fetch('/api/assets/categories/' + id, { method: 'DELETE' });
    const j = await r.json();
    if (j.success) { await loadCategories(); renderCategoryList(); }
    else alert('Gagal: ' + j.message);
  } catch(e) { alert('Error: ' + e.message); }
}

// ── ApexCharts ──────────────────────────────────────────────
const APEX_COLORS = {
  blue:   '#1e78ff',
  green:  '#4ADE80',
  orange: '#FB923C',
  red:    '#F87171',
  gray:   '#94A3B8',
  teal:   '#2DD4BF',
  dark:   '#1e293b'
};

const apexBase = {
  chart:  { toolbar: { show: false }, fontFamily: 'DM Sans, sans-serif', animations: { enabled: false } },
  grid:   { borderColor: '#f1f5f9', strokeDashArray: 4, xaxis: { lines: { show: false } } },
  tooltip: { theme: 'dark', style: { fontSize: '12px' } },
  dataLabels: { enabled: false }
};

async function initCharts() {
  if (typeof ApexCharts === 'undefined') {
    try { await loadScriptOnce('/vendor/apexcharts/apexcharts.min.js'); }
    catch (e) { console.warn('[Assets] ApexCharts tidak termuat', e); return; }
  }
  if (typeof ApexCharts === 'undefined') return;
  const valueEl = document.getElementById('valueChart');
  if (!valueEl || valueChart) return;

  // ── 1. Total Nilai Asset (Area chart, 3 series by status) ──
  valueChart = new ApexCharts(valueEl, {
    ...apexBase,
    chart: { ...apexBase.chart, type: 'area', height: 280 },
    series: [
      { name: 'Terpasang', data: [] },
      { name: 'Gudang', data: [] },
      { name: 'Rusak', data: [] }
    ],
    colors: ['#16a34a', '#64748b', '#dc2626'],
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.02, stops: [0, 90] }
    },
    stroke: { curve: 'smooth', width: 2.5 },
    xaxis: { type: 'category', labels: { style: { fontSize: '10px', colors: '#94a3b8' }, rotate: -20 }, axisBorder: { show: false }, axisTicks: { show: false }, tickAmount: 7 },
    yaxis: { labels: { style: { fontSize: '10px', colors: '#94a3b8' }, formatter: function(v){ return 'Rp ' + (v/1000).toFixed(0) + 'K'; } } },
    legend: { position: 'bottom', fontSize: '11px', markers: { width: 8, height: 8, radius: 8 }, itemMargin: { horizontal: 12 } },
    tooltip: { ...apexBase.tooltip, y: { formatter: function(v){ return 'Rp ' + new Intl.NumberFormat('id-ID').format(v); } } }
  });
  valueChart.render();

  // ── 2. Status Distribution (Semi-donut) ────────────────────
  statusChart = new ApexCharts(document.getElementById('statusChart'), {
    ...apexBase,
    chart: { ...apexBase.chart, type: 'donut', height: 280 },
    series: [0, 0, 0, 0],
    labels: ['Terpasang', 'Gudang', 'Servis', 'Rusak'],
    colors: [APEX_COLORS.blue, APEX_COLORS.gray, APEX_COLORS.orange, APEX_COLORS.red],
    plotOptions: {
      pie: {
        startAngle: -90, endAngle: 90, offsetY: 20,
        donut: {
          size: '72%',
          labels: {
            show: true,
            total: {
              show: true, showAlways: true,
              label: 'Total Asset',
              fontSize: '11px', color: '#94a3b8', fontWeight: '600',
              formatter: w => w.globals.seriesTotals.reduce((a, b) => a + b, 0)
            },
            value: { fontSize: '22px', fontWeight: '800', color: '#1e293b', offsetY: -4 }
          }
        }
      }
    },
    legend: { position: 'bottom', fontSize: '11px', markers: { width: 8, height: 8, radius: 8 }, itemMargin: { horizontal: 10 } },
    grid: { padding: { bottom: -60 } },
    responsive: [{ breakpoint: 480, options: { chart: { height: 240 } } }]
  });
  statusChart.render();

  // ── 3. Assets by Category (Bar) ───────────────────────────
  categoryChart = new ApexCharts(document.getElementById('categoryChart'), {
    ...apexBase,
    chart: { ...apexBase.chart, type: 'bar', height: 280 },
    series: [{ name: 'Jumlah Asset', data: [] }],
    colors: [APEX_COLORS.blue],
    plotOptions: {
      bar: { borderRadius: 6, columnWidth: '50%', distributed: true }
    },
    colors: [APEX_COLORS.blue, APEX_COLORS.teal, APEX_COLORS.green, APEX_COLORS.orange, APEX_COLORS.red, APEX_COLORS.gray],
    xaxis: { categories: [], labels: { style: { fontSize: '11px', colors: '#64748b' }, rotate: -20 }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { fontSize: '10px', colors: '#94a3b8' } }, tickAmount: 4 },
    legend: { show: false },
    tooltip: { ...apexBase.tooltip, y: { formatter: v => v + ' asset' } }
  });
  categoryChart.render();

  // ── 4. Asset Condition (Horizontal Bar) ───────────────────
  conditionChart = new ApexCharts(document.getElementById('conditionChart'), {
    ...apexBase,
    chart: { ...apexBase.chart, type: 'bar', height: 280 },
    series: [{ name: 'Jumlah', data: [0, 0, 0, 0] }],
    plotOptions: {
      bar: { borderRadius: 6, horizontal: true, barHeight: '45%', distributed: true }
    },
    colors: [APEX_COLORS.blue, APEX_COLORS.green, APEX_COLORS.orange, APEX_COLORS.red],
    xaxis: { categories: ['Baru', 'Baik', 'Cukup', 'Buruk'], labels: { style: { fontSize: '11px', colors: '#94a3b8' } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { fontSize: '12px', colors: '#64748b', fontWeight: '600' } } },
    legend: { show: false },
    tooltip: { ...apexBase.tooltip, y: { formatter: v => v + ' asset' } }
  });
  conditionChart.render();

  loadChartData();
}

async function loadChartData() {
  try {
    const r = await fetch('/api/assets/stats');
    const j = await r.json();
    if (!j.success) return;

    const d   = j.data;
    const bs  = d.by_status      || {};
    const bc  = d.by_category    || [];
    const vbs = d.value_by_status || {};

    // 1. Total Nilai Asset — per status with filter
    var valActive  = vbs.active  || 0;
    var valStorage = vbs.storage || 0;
    var valDamaged = vbs.damaged || 0;
    var valRepair  = vbs.repair  || 0;
    var valTotal   = d.total_value || 0;

    // Determine which base value to use based on filter
    var filterMap = {
      'all':     valTotal,
      'active':  valActive,
      'storage': valStorage,
      'damaged': valDamaged + valRepair
    };
    var baseValue = filterMap[currentValueFilter] || valTotal;

    var days = currentPeriod === '7d' ? 7 : currentPeriod === '90d' ? 90 : currentPeriod === '1y' ? 365 : 30;
    var dates = [], vals = [];
    for (var i = days - 1; i >= 0; i--) {
      var dt = new Date(); dt.setDate(dt.getDate() - i);
      dates.push(dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
      var v = Math.max(0, baseValue + (Math.random() - 0.5) * baseValue * 0.08);
      vals.push(Math.round(v));
    }

    // Build series based on filter
    var series = [];
    var filterLabel = {all:'Total Nilai', active:'Terpasang', storage:'Gudang', damaged:'Rusak'};
    var filterColor = {all:'#3b82f6', active:'#16a34a', storage:'#64748b', damaged:'#dc2626'};
    var lbl = filterLabel[currentValueFilter] || 'Total Nilai';
    var col = filterColor[currentValueFilter] || '#3b82f6';

    if (currentValueFilter === 'all') {
      // Show all 3 lines
      var dActive = [], dStorage = [], dDamaged = [];
      for (var k = days - 1; k >= 0; k--) {
        dActive.push(Math.round(Math.max(0, valActive + (Math.random() - 0.5) * valActive * 0.08)));
        dStorage.push(Math.round(Math.max(0, valStorage + (Math.random() - 0.5) * valStorage * 0.08)));
        dDamaged.push(Math.round(Math.max(0, (valDamaged+valRepair) + (Math.random() - 0.5) * (valDamaged+valRepair) * 0.08)));
      }
      series = [
        { name: 'Terpasang', data: dActive },
        { name: 'Gudang',    data: dStorage },
        { name: 'Rusak',     data: dDamaged }
      ];
      valueChart.updateOptions({
        xaxis: { categories: dates },
        colors: ['#16a34a', '#64748b', '#dc2626']
      }, false, false);
    } else {
      series = [{ name: lbl, data: vals }];
      valueChart.updateOptions({
        xaxis: { categories: dates },
        colors: [col]
      }, false, false);
    }
    valueChart.updateSeries(series, true);

    // 2. Status semi-donut
    statusChart.updateSeries([
      bs.active  || 0,
      bs.storage || 0,
      bs.repair  || 0,
      bs.damaged || 0
    ], false);

    // 3. Category bar
    if (bc.length > 0) {
      categoryChart.updateOptions({ xaxis: { categories: bc.map(function(c){ return c.category?.name || '?'; }) } }, false, false);
      categoryChart.updateSeries([{ name: 'Jumlah Asset', data: bc.map(function(c){ return parseInt(c.count) || 0; }) }], false);
    }

    // 4. Condition horizontal bar — use real by_status data
    conditionChart.updateSeries([{
      name: 'Jumlah',
      data: [
        bs.active  || 0,
        bs.storage || 0,
        bs.repair  || 0,
        bs.damaged || 0
      ]
    }], false);

  } catch(e) {
    console.error('[Charts] load error:', e);
  }
}

function updateChart(period, btn) {
  currentPeriod = period;
  document.querySelectorAll('.chart-period:first-child .period-btn, .period-btn[onclick*="updateChart"]').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  loadChartData();
}

function filterValueChart(filter, btn) {
  currentValueFilter = filter;
  var btns = document.getElementById('statusFilterBtns');
  if (btns) btns.querySelectorAll('.period-btn').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  loadChartData();
}