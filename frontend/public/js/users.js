// users.js — User Management Frontend

let _roles = [];
let _editUserId = null;

window.openAddUser    = openAddUser;
window.closeUserModal = closeUserModal;
window.saveUser       = saveUser;
window.editUser       = editUser;
window.deleteUser     = deleteUser;
window.toggleStatus   = toggleStatus;

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
  hideUserAssignments();
  const m = document.getElementById('userModal');
  m.style.display = 'flex';
  m.classList.add('open');
}

function closeUserModal() {
  const m = document.getElementById('userModal');
  m.style.display = 'none';
  m.classList.remove('open');
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
  const m = document.getElementById('userModal');
  m.style.display = 'flex';
  m.classList.add('open');
  loadUserAssignments(id);
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

function hideUserAssignments() {
  const wrap = document.getElementById('userAssignWrap');
  if (wrap) wrap.style.display = 'none';
}

function fmtAssignDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function assignBadge(text) {
  return `<span class="assign-badge">${esc(text)}</span>`;
}

const TICKET_STATUS = { open:'Open', in_progress:'Proses', pending:'Pending', resolved:'Selesai', closed:'Ditutup' };
const TODO_STATUS   = { todo:'To Do', in_progress:'Proses', done:'Selesai' };
const WO_STATUS     = { pending:'Pending', assigned:'Ditugaskan', in_progress:'Proses', done:'Selesai', cancelled:'Batal' };
const PRIO_LABEL    = { low:'Rendah', medium:'Sedang', high:'Tinggi', critical:'Kritis' };

function assignEmpty(colspan, text) {
  return `<tr><td colspan="${colspan}" class="assign-empty">${esc(text)}</td></tr>`;
}

function renderAssignCount(id, shown, total, noun) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = total > shown ? `${shown} dari ${total} ${noun}` : `${total} ${noun}`;
}

async function loadUserAssignments(id) {
  const wrap = document.getElementById('userAssignWrap');
  if (!wrap) return;
  wrap.style.display = 'block';
  const ticketBody = document.getElementById('assignTicketBody');
  const todoBody   = document.getElementById('assignTodoBody');
  const woBody     = document.getElementById('assignWoBody');
  if (ticketBody) ticketBody.innerHTML = assignEmpty(4, 'Memuat...');
  if (todoBody)   todoBody.innerHTML   = assignEmpty(4, 'Memuat...');
  if (woBody)     woBody.innerHTML     = assignEmpty(4, 'Memuat...');

  const d = await App.api(`/users/${id}/assignments`);
  if (!d?.success) {
    const msg = d?.message || 'Gagal memuat penugasan';
    if (ticketBody) ticketBody.innerHTML = assignEmpty(4, msg);
    if (todoBody)   todoBody.innerHTML   = assignEmpty(4, msg);
    if (woBody)     woBody.innerHTML     = assignEmpty(4, msg);
    return;
  }

  const tickets = d.data?.tickets || [];
  const todos   = d.data?.todos || [];
  const wos     = d.data?.work_orders || [];
  const totals  = d.data?.totals || {};

  renderAssignCount('assignTicketCount', tickets.length, totals.tickets || tickets.length, 'tiket');
  renderAssignCount('assignTodoCount', todos.length, totals.todos || todos.length, 'to-do');
  renderAssignCount('assignWoCount', wos.length, totals.work_orders || wos.length, 'work order');

  ticketBody.innerHTML = tickets.length
    ? tickets.map((t) => `<tr>
        <td><a href="/tickets/${t.id}">${esc(t.ticket_number || ('#' + t.id))}</a></td>
        <td>${esc(t.title)}${t.customer?.name ? `<div style="font-size:11px;color:#94a3b8;">${esc(t.customer.name)}</div>` : ''}</td>
        <td>${assignBadge(TICKET_STATUS[t.status] || t.status)}</td>
        <td>${fmtAssignDate(t.created_at)}</td>
      </tr>`).join('')
    : assignEmpty(4, 'Belum ada tiket ditugaskan');

  todoBody.innerHTML = todos.length
    ? todos.map((t) => `<tr>
        <td><a href="/todos">${esc(t.title)}</a></td>
        <td>${assignBadge(TODO_STATUS[t.status] || t.status)}</td>
        <td>${esc(PRIO_LABEL[t.priority] || t.priority || '—')}</td>
        <td>${fmtAssignDate(t.due_date)}</td>
      </tr>`).join('')
    : assignEmpty(4, 'Belum ada to-do ditugaskan');

  woBody.innerHTML = wos.length
    ? wos.map((w) => `<tr>
        <td><a href="/work-orders">${esc(w.wo_number || ('#' + w.id))}</a></td>
        <td>${esc(w.title)}${w.customer?.name ? `<div style="font-size:11px;color:#94a3b8;">${esc(w.customer.name)}</div>` : ''}</td>
        <td>${assignBadge(WO_STATUS[w.status] || w.status)}</td>
        <td>${fmtAssignDate(w.scheduled_date || w.created_at)}</td>
      </tr>`).join('')
    : assignEmpty(4, 'Belum ada work order ditugaskan');
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}