// users.js — User Management Frontend

let _roles = [];
let _editUserId = null;

window.openAddUser    = openAddUser;
window.closeUserModal = closeUserModal;
window.saveUser       = saveUser;
window.editUser       = editUser;
window.deleteUser     = deleteUser;
window.toggleStatus   = toggleStatus;
window.showUmTab      = showUmTab;
window.selectRole     = selectRole;
window.toggleSectionModules = toggleSectionModules;
window.toggleAllModules = toggleAllModules;
window.saveRolePermissions = saveRolePermissions;

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadRoles().then(() => loadUsers());
});

// ── LOAD ROLES ───────────────────────────────────────────────
async function loadRoles() {
  const d = await App.api('/roles');
  if (d?.success) _roles = d.data;
}

// ── LOAD USERS ───────────────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById('userTable');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8;">Memuat...</td></tr>';

  const d = await App.api('/users?limit=100');
  if (!d?.success) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#ef4444;">Gagal memuat: ${d?.message || 'error'}</td></tr>`;
    return;
  }

  if (!d.data?.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8;">Belum ada user</td></tr>';
    return;
  }

  tbody.innerHTML = d.data.map(u => {
    const lastLogin = u.last_login ? new Date(u.last_login).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
    const statusBadge = u.is_active
      ? '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;">Aktif</span>'
      : '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;">Nonaktif</span>';

    return `<tr>
      <td>
        <div style="font-weight:500;">${esc(u.name)}</div>
        <div style="font-size:11px;color:#94a3b8;">${esc(u.phone || '')}</div>
      </td>
      <td>${esc(u.email)}</td>
      <td><span style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;">${esc(u.role?.display_name || u.role?.name || '—')}</span></td>
      <td>${statusBadge}</td>
      <td style="font-size:12px;color:#64748b;">${lastLogin}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-secondary" onclick="editUser(${u.id})">Edit</button>
          <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;" onclick="toggleStatus(${u.id}, ${u.is_active})">${u.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id}, '${esc(u.name)}')">Hapus</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── MODAL ────────────────────────────────────────────────────
function openAddUser() {
  _editUserId = null;
  document.getElementById('userModalTitle').textContent = 'Tambah User';
  document.getElementById('userForm').reset();
  document.getElementById('passwordGroup').style.display = 'block';
  document.getElementById('passwordField').required = true;
  document.getElementById('passwordField').placeholder = 'Minimal 6 karakter';
  populateRoleSelect();
  document.getElementById("userModal").style.display = "flex";
}

function closeUserModal() {
  document.getElementById("userModal").style.display = "none";
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
  document.getElementById("userModal").style.display = "flex";
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
  if (!confirm(`Hapus user "${name}"?`)) return;
  const d = await App.api(`/users/${id}`, { method: 'DELETE' });
  if (d?.success) { loadUsers(); App.showToast('User dihapus', 'success'); }
  else App.showToast(d?.message || 'Gagal menghapus', 'error');
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── HAK AKSES ROLE ───────────────────────────────────────────
let _permissions = [];
let _moduleCatalog = [];
let _mobileCatalog = [];
let _selectedRoleId = null;
let _rolesLoadedForPerm = false;

function showUmTab(tab) {
  const usersBtn = document.getElementById('tabUsersBtn');
  const rolesBtn = document.getElementById('tabRolesBtn');
  const panelUsers = document.getElementById('panelUsers');
  const panelRoles = document.getElementById('panelRoles');
  const actions = document.getElementById('userHeaderActions');
  const isRoles = tab === 'roles';
  usersBtn.classList.toggle('active', !isRoles);
  rolesBtn.classList.toggle('active', isRoles);
  panelUsers.classList.toggle('show', !isRoles);
  panelRoles.classList.toggle('show', isRoles);
  if (actions) actions.style.display = isRoles ? 'none' : '';
  if (isRoles) loadRolePermissions();
}

async function loadRolePermissions() {
  const [rolesRes, permRes] = await Promise.all([
    _roles.length ? Promise.resolve({ success: true, data: _roles }) : App.api('/roles'),
    App.api('/permissions')
  ]);
  if (rolesRes?.success) _roles = rolesRes.data || _roles;
  if (permRes?.success) {
    _permissions = permRes.data || [];
    _moduleCatalog = Array.isArray(permRes.modules) && permRes.modules.length
      ? permRes.modules
      : _permissions.filter(p => String(p.name || '').startsWith('module.')).map(p => ({
          key: String(p.name).replace(/^module\./, ''),
          name: p.name,
          display: p.display_name,
          section: p.module,
          href: ''
        }));
    _mobileCatalog = Array.isArray(permRes.mobileModules) ? permRes.mobileModules : [];
  }
  renderRoleList();
  if (_selectedRoleId) selectRole(_selectedRoleId);
  _rolesLoadedForPerm = true;
}

function renderRoleList() {
  const box = document.getElementById('roleList');
  if (!box) return;
  if (!_roles.length) {
    box.innerHTML = '<div class="perm-empty">Belum ada role</div>';
    return;
  }
  box.innerHTML = _roles.map(r => {
    const count = (r.permissions || []).filter(p => String(p.name || '').startsWith('module.')).length;
    const active = r.id == _selectedRoleId ? ' active' : '';
    return `<button type="button" class="perm-role${active}" onclick="selectRole(${r.id})">
      <div class="perm-role-name">${esc(r.display_name || r.name)}</div>
      <div class="perm-role-desc">${esc(r.description || r.name)}</div>
      <div class="perm-role-meta">${count} / ${_moduleCatalog.length} modul</div>
    </button>`;
  }).join('');
}

function selectRole(id) {
  _selectedRoleId = id;
  const role = _roles.find(r => r.id == id);
  renderRoleList();
  const title = document.getElementById('permTitle');
  const saveBtn = document.getElementById('permSaveBtn');
  const body = document.getElementById('permBody');
  if (!role) return;
  title.textContent = 'Hak akses: ' + (role.display_name || role.name);
  saveBtn.disabled = false;
  const granted = new Set((role.permissions || []).filter(p => String(p.name || '').startsWith('module.')).map(p => p.name));
  const bySection = {};
  _moduleCatalog.forEach(m => {
    const sec = m.section || 'LAINNYA';
    if (!bySection[sec]) bySection[sec] = [];
    bySection[sec].push(m);
  });
  if (_mobileCatalog.length) {
    bySection['APP MOBILE'] = _mobileCatalog.map(m => ({
      key: m.key,
      name: m.name || ('module.' + m.key),
      display: m.display,
      section: 'APP MOBILE',
      href: m.href || ''
    }));
  }
  const sections = [];
  if (bySection['APP MOBILE']) sections.push('APP MOBILE');
  Object.keys(bySection).forEach(sec => {
    if (sec !== 'APP MOBILE') sections.push(sec);
  });
  body.innerHTML = sections.map(sec => {
    const items = bySection[sec].map(m => {
      const perm = _permissions.find(p => p.name === m.name);
      const pid = perm ? perm.id : '';
      const checked = granted.has(m.name) ? 'checked' : '';
      return `<label class="perm-item">
        <input type="checkbox" class="perm-cb" data-section="${esc(sec)}" value="${pid}" ${checked} ${pid ? '' : 'disabled'}>
        <span><b>${esc(m.display)}</b><small>${esc(m.href || m.name)}</small></span>
      </label>`;
    }).join('');
    return `<div class="perm-sec" data-sec="${esc(sec)}">
      <div class="perm-sec-h">
        <span>${esc(sec)}</span>
        <button type="button" onclick="toggleSectionModules('${esc(sec)}')">Pilih grup</button>
      </div>
      <div class="perm-grid">${items}</div>
    </div>`;
  }).join('');
  syncSelectAll();
}

function toggleSectionModules(section) {
  const boxes = [...document.querySelectorAll(`.perm-cb[data-section="${CSS.escape(section)}"]`)];
  if (!boxes.length) return;
  const allOn = boxes.every(b => b.checked);
  boxes.forEach(b => { b.checked = !allOn; });
  syncSelectAll();
}

function toggleAllModules(checked) {
  document.querySelectorAll('.perm-cb').forEach(b => { b.checked = checked; });
}

function syncSelectAll() {
  const boxes = [...document.querySelectorAll('.perm-cb')];
  const all = document.getElementById('permSelectAll');
  if (!all || !boxes.length) return;
  all.checked = boxes.every(b => b.checked);
}

async function saveRolePermissions() {
  if (!_selectedRoleId) return;
  const permissions = [...new Set([...document.querySelectorAll('.perm-cb:checked')]
    .map(b => parseInt(b.value, 10))
    .filter(Boolean))];
  const d = await App.api(`/roles/${_selectedRoleId}`, {
    method: 'PUT',
    body: JSON.stringify({ permissions })
  });
  if (d?.success) {
    const idx = _roles.findIndex(r => r.id == _selectedRoleId);
    if (idx >= 0) _roles[idx] = d.data;
    renderRoleList();
    App.showToast('Hak akses role disimpan', 'success');
  } else {
    App.showToast(d?.message || 'Gagal menyimpan hak akses', 'error');
  }
}

document.addEventListener('change', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('perm-cb')) {
    const val = e.target.value;
    document.querySelectorAll('.perm-cb').forEach(b => {
      if (b !== e.target && b.value === val) b.checked = e.target.checked;
    });
    syncSelectAll();
  }
});