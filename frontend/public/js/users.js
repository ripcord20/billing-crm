// users.js — User Management Frontend

let _roles = [];
let _editUserId = null;

window.openAddUser    = openAddUser;
window.closeUserModal = closeUserModal;
window.saveUser       = saveUser;
window.editUser       = editUser;
window.deleteUser     = deleteUser;
window.toggleStatus   = toggleStatus;

document.addEventListener('DOMContentLoaded', () => {
  loadRoles().then(() => loadUsers());
});

async function loadRoles() {
  const d = await App.api('/roles');
  if (d?.success) _roles = d.data;
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

function openAddUser() {
  _editUserId = null;
  document.getElementById('userModalTitle').textContent = 'Tambah User';
  document.getElementById('userForm').reset();
  document.getElementById('passwordGroup').style.display = 'block';
  document.getElementById('passwordField').required = true;
  document.getElementById('passwordField').placeholder = 'Minimal 6 karakter';
  populateRoleSelect();
  document.getElementById('userModal').style.display = 'flex';
}

function closeUserModal() {
  document.getElementById('userModal').style.display = 'none';
}

async function editUser(id) {
  const d = await App.api(`/users/${id}`);
  if (!d?.success) { App.showToast('Gagal load user', 'error'); return; }
  const u = d.data;
  _editUserId = id;
  document.getElementById('userModalTitle').textContent = 'Edit User';
  document.getElementById('userName').value    = u.name;
  document.getElementById('userEmail').value   = u.email;
  document.getElementById('userPhone').value   = u.phone || '';
  document.getElementById('passwordGroup').style.display = 'block';
  document.getElementById('passwordField').required = false;
  document.getElementById('passwordField').placeholder = 'Kosongkan jika tidak diubah';
  document.getElementById('passwordField').value = '';
  populateRoleSelect(u.role_id);
  document.getElementById('userModal').style.display = 'flex';
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

  const payload = { name, email, phone, role_id: parseInt(role_id) };
  if (password) payload.password = password;

  const url    = _editUserId ? `/users/${_editUserId}` : '/users';
  const method = _editUserId ? 'PUT' : 'POST';

  const d = await App.api(url, { method, body: JSON.stringify(payload) });
  if (d?.success) {
    closeUserModal();
    loadUsers();
    App.showToast(_editUserId ? 'User diperbarui' : 'User ditambahkan', 'success');
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
