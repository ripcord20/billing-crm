// users.js — User Management: role + hak akses modul Fiberix + wilayah
let _roles = [];
let _editUserId = null;
let _catalog = { wilayah: [], modules: [], role_defaults: {} };
let _selectedWilayah = new Set();
let _selectedPerms = new Set();
let _applyingRoleDefaults = false;

window.openAddUser     = openAddUser;
window.closeUserModal  = closeUserModal;
window.saveUser        = saveUser;
window.editUser        = editUser;
window.deleteUser      = deleteUser;
window.toggleStatus    = toggleStatus;
window.selectAllWilayah = selectAllWilayah;
window.clearAllWilayah  = clearAllWilayah;

document.addEventListener('DOMContentLoaded', () => {
  loadRoles().then(() => loadUsers());
  loadCatalog();
  const roleSel = document.getElementById('userRole');
  if (roleSel) roleSel.addEventListener('change', onRoleChanged);
});

async function loadRoles() {
  const d = await App.api('/roles');
  if (d?.success) _roles = d.data;
}

async function loadCatalog() {
  const d = await App.api('/users/access-catalog');
  if (d?.success && d.data) {
    _catalog = d.data;
    renderWilayahList();
    renderPermModules();
  }
}

function statusBadge(active) {
  return active
    ? '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;">Aktif</span>'
    : '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;">Nonaktif</span>';
}

function roleBadge(u) {
  return `<span style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;">${esc(u.role?.display_name || u.role?.name || '—')}</span>`;
}

function fmtLogin(u) {
  return u.last_login
    ? new Date(u.last_login).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : '—';
}

function actionButtons(u, wide) {
  const self = Number(u.id) === Number(window.ME_USER_ID);
  const del = self
    ? ''
    : `<button type="button" class="btn btn-sm btn-del" onclick="deleteUser(${u.id}, '${esc(u.name).replace(/'/g, '&#39;')}')">Hapus</button>`;
  const cls = wide ? 'ucard-act' : 'users-actions';
  return `<div class="${cls}">
    <button type="button" class="btn btn-sm btn-secondary" onclick="editUser(${u.id})">Edit</button>
    <button type="button" class="btn btn-sm btn-secondary" onclick="toggleStatus(${u.id}, ${u.is_active})">${u.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
    ${del}
  </div>`;
}

async function loadUsers() {
  const tbody = document.getElementById('userTable');
  const cards = document.getElementById('userCards');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8;">Memuat...</td></tr>';
  if (cards) cards.innerHTML = '';

  const d = await App.api('/users?limit=100');
  if (!d?.success) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#ef4444;">Gagal memuat: ${d?.message || 'error'}</td></tr>`;
    return;
  }

  if (!d.data?.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8;">Belum ada user</td></tr>';
    return;
  }

  tbody.innerHTML = d.data.map(u => `<tr>
      <td>
        <div style="font-weight:500;">${esc(u.name)}</div>
        <div style="font-size:11px;color:#94a3b8;">${esc(u.phone || '')}</div>
      </td>
      <td>${esc(u.email)}</td>
      <td>${roleBadge(u)}</td>
      <td>${statusBadge(u.is_active)}</td>
      <td style="font-size:12px;color:#64748b;">${fmtLogin(u)}</td>
      <td>${actionButtons(u, false)}</td>
    </tr>`).join('');

  if (cards) {
    cards.innerHTML = d.data.map(u => `<article class="ucard">
      <div class="ucard-top">
        <div>
          <div class="ucard-name">${esc(u.name)}</div>
          <div class="ucard-sub">${esc(u.phone || '')}</div>
        </div>
        ${statusBadge(u.is_active)}
      </div>
      <div class="ucard-email">${esc(u.email)}</div>
      <div class="ucard-meta">${roleBadge(u)}</div>
      <div class="ucard-login">Last login: ${fmtLogin(u)}</div>
      ${actionButtons(u, true)}
    </article>`).join('');
  }
}

function renderWilayahList() {
  const box = document.getElementById('wilayahList');
  if (!box) return;
  const rows = _catalog.wilayah || [];
  if (!rows.length) {
    box.innerHTML = '<div style="padding:12px;color:#94a3b8;font-size:12px;">Belum ada data wilayah operasional.</div>';
    updateWilayahCount();
    return;
  }
  box.innerHTML = rows.map(w => `
    <label class="acc-item">
      <input type="checkbox" value="${w.id}" ${ _selectedWilayah.has(Number(w.id)) ? 'checked' : '' } onchange="toggleWilayah(${w.id}, this.checked)">
      <span>${esc(w.name)}</span>
    </label>
  `).join('');
  updateWilayahCount();
}

window.toggleWilayah = function(id, on) {
  const n = Number(id);
  if (on) _selectedWilayah.add(n); else _selectedWilayah.delete(n);
  updateWilayahCount();
};

function updateWilayahCount() {
  const el = document.getElementById('wilayahCount');
  const total = (_catalog.wilayah || []).length;
  if (el) el.textContent = `${_selectedWilayah.size}/${total} dipilih`;
}

function selectAllWilayah() {
  (_catalog.wilayah || []).forEach(w => _selectedWilayah.add(Number(w.id)));
  renderWilayahList();
}

function clearAllWilayah() {
  _selectedWilayah = new Set();
  renderWilayahList();
}

function renderPermModules() {
  const box = document.getElementById('permModules');
  if (!box) return;
  const mods = _catalog.modules || [];
  if (!mods.length) {
    box.innerHTML = '<div style="padding:12px;color:#94a3b8;font-size:12px;">Belum ada daftar hak akses modul.</div>';
    updatePermCount();
    return;
  }
  box.innerHTML = mods.map(mod => `
    <div class="perm-mod">
      <h4>${esc(mod.label || mod.module)} <span style="font-weight:500;color:#94a3b8;">${(mod.permissions||[]).filter(p => _selectedPerms.has(Number(p.id))).length}/${(mod.permissions||[]).length}</span></h4>
      <div class="perm-grid">
        ${(mod.permissions || []).map(p => `
          <label class="perm-chip">
            <input type="checkbox" value="${p.id}" ${ _selectedPerms.has(Number(p.id)) ? 'checked' : '' } onchange="togglePerm(${p.id}, this.checked)">
            ${esc(p.label || p.display_name || p.name)}
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');
  updatePermCount();
}

window.togglePerm = function(id, on) {
  const n = Number(id);
  if (on) _selectedPerms.add(n); else _selectedPerms.delete(n);
  if (!_applyingRoleDefaults) renderPermModules();
  else updatePermCount();
};

function updatePermCount() {
  const el = document.getElementById('permCount');
  if (el) el.textContent = `${_selectedPerms.size} dipilih`;
}

function applyRoleDefaults(roleId, extraIds) {
  const def = _catalog.role_defaults && _catalog.role_defaults[roleId];
  const ids = new Set((def?.permission_ids || []).map(Number));
  (extraIds || []).forEach(id => ids.add(Number(id)));
  _selectedPerms = ids;
  renderPermModules();
}

function onRoleChanged() {
  const roleId = document.getElementById('userRole').value;
  if (!roleId) return;
  applyRoleDefaults(roleId, []);
}

function openModal() {
  const m = document.getElementById('userModal');
  m.style.display = 'flex';
  m.classList.add('open');
}

function closeUserModal() {
  const m = document.getElementById('userModal');
  m.style.display = 'none';
  m.classList.remove('open');
}

function openAddUser() {
  _editUserId = null;
  document.getElementById('userModalTitle').textContent = 'Tambah Akun Baru';
  document.getElementById('userForm').reset();
  document.getElementById('passwordGroup').style.display = 'block';
  document.getElementById('passwordField').required = true;
  document.getElementById('passwordField').placeholder = 'Minimal 6 karakter';
  _selectedWilayah = new Set();
  _selectedPerms = new Set();
  populateRoleSelect();
  renderWilayahList();
  renderPermModules();
  openModal();
}

async function editUser(id) {
  const d = await App.api(`/users/${id}`);
  if (!d?.success) { App.showToast('Gagal load user', 'error'); return; }
  const u = d.data;
  _editUserId = id;
  document.getElementById('userModalTitle').textContent = 'Edit Akun';
  document.getElementById('userName').value    = u.name;
  document.getElementById('userEmail').value   = u.email;
  document.getElementById('userPhone').value   = u.phone || '';
  document.getElementById('passwordGroup').style.display = 'block';
  document.getElementById('passwordField').required = false;
  document.getElementById('passwordField').placeholder = 'Kosongkan jika tidak diubah';
  document.getElementById('passwordField').value = '';
  populateRoleSelect(u.role_id);
  _selectedWilayah = new Set((u.wilayah_ids || []).map(Number));
  const extras = (u.permission_ids || []).map(Number);
  applyRoleDefaults(u.role_id, extras);
  renderWilayahList();
  openModal();
}

function populateRoleSelect(selectedId = null) {
  const sel = document.getElementById('userRole');
  sel.innerHTML = '<option value="">-- Pilih Role --</option>' +
    _roles.map(r => `<option value="${r.id}" ${r.id == selectedId ? 'selected' : ''}>${esc(r.display_name || r.name)}</option>`).join('');
}

async function saveUser() {
  const name     = document.getElementById('userName').value.trim();
  const email    = document.getElementById('userEmail').value.trim();
  const phone    = document.getElementById('userPhone').value.trim();
  const password = document.getElementById('passwordField').value;
  const role_id  = document.getElementById('userRole').value;

  if (!name || !email || !role_id) { App.showToast('Nama, email, dan role wajib diisi', 'error'); return; }
  if (!_editUserId && !password)   { App.showToast('Password wajib untuk user baru', 'error'); return; }

  const payload = {
    name,
    email,
    phone,
    role_id: parseInt(role_id),
    wilayah_ids: Array.from(_selectedWilayah),
    permission_ids: Array.from(_selectedPerms),
  };
  if (password) payload.password = password;

  const url    = _editUserId ? `/users/${_editUserId}` : '/users';
  const method = _editUserId ? 'PUT' : 'POST';

  const d = await App.api(url, { method, body: JSON.stringify(payload) });
  if (d?.success) {
    closeUserModal();
    loadUsers();
    App.showToast(_editUserId ? 'Akun diperbarui' : 'Akun ditambahkan', 'success');
  } else {
    App.showToast(d?.message || 'Gagal menyimpan', 'error');
  }
}

async function toggleStatus(id, currentStatus) {
  const d = await App.api(`/users/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: !currentStatus }) });
  if (d?.success) { loadUsers(); App.showToast('Status diperbarui', 'success'); }
  else App.showToast(d?.message || 'Gagal', 'error');
}

async function deleteUser(id, name) {
  if (Number(id) === Number(window.ME_USER_ID)) {
    App.showToast('Tidak bisa menghapus akun sendiri', 'error');
    return;
  }
  if (!confirm(`Hapus user "${name}"? Data akun ini tidak bisa dikembalikan.`)) return;
  const d = await App.api(`/users/${id}`, { method: 'DELETE' });
  if (d?.success) { loadUsers(); App.showToast(d.message || 'User dihapus', 'success'); }
  else App.showToast(d?.message || 'Gagal menghapus', 'error');
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
