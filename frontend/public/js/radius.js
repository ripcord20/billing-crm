function esc(s) {
  return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function loadServers() {
  const d = await App.api('/radius/servers');
  const tb = document.getElementById('srvTable');
  if (!d?.success) {
    tb.innerHTML = `<tr><td colspan="5" style="color:#dc2626;">${esc(d?.message)}</td></tr>`;
    return;
  }
  if (!d.data.length) {
    tb.innerHTML = '<tr><td colspan="5" style="color:#94a3b8;padding:16px;">Belum ada server. Klik + Server dan isi MySQL schema radius.</td></tr>';
    return;
  }
  window.__radiusServers = d.data;
  tb.innerHTML = d.data.map(s => `<tr>
    <td>${esc(s.name)}${s.is_active === false ? ' <span style="color:#94a3b8;">(nonaktif)</span>' : ''}</td>
    <td class="mono">${esc(s.host)}:${s.auth_port || 1812}</td>
    <td class="mono">${esc(s.mysql_user)}@${esc(s.mysql_host)}/${esc(s.mysql_database)}</td>
    <td>${s.last_error ? `<span style="color:#dc2626;">${esc(s.last_error)}</span>` : (s.last_ok_at ? 'OK' : 'belum dites')}</td>
    <td style="white-space:nowrap;">
      <button class="rd-btn rd-btn-outline" onclick="editSrv(${s.id})">Edit</button>
      <button class="rd-btn rd-btn-outline" onclick="testSrv(${s.id})">Tes</button>
      <button class="rd-btn rd-btn-outline" onclick="delSrv(${s.id})">Hapus</button>
    </td>
  </tr>`).join('');
}

let editingSrvId = null;

window.openSrv = () => {
  editingSrvId = null;
  document.getElementById('sName').value = 'FreeRADIUS';
  document.getElementById('sHost').value = '';
  document.getElementById('sMysql').value = '127.0.0.1';
  document.getElementById('sDb').value = 'radius';
  document.getElementById('sUser').value = 'radius';
  document.getElementById('sPass').value = '';
  document.getElementById('srvModal').classList.add('show');
};

window.closeSrv = () => document.getElementById('srvModal').classList.remove('show');

window.editSrv = (id) => {
  const row = (window.__radiusServers || []).find(s => s.id === id);
  if (!row) return;
  editingSrvId = id;
  document.getElementById('sName').value = row.name || '';
  document.getElementById('sHost').value = row.host || '';
  document.getElementById('sMysql').value = row.mysql_host || '127.0.0.1';
  document.getElementById('sDb').value = row.mysql_database || 'radius';
  document.getElementById('sUser').value = row.mysql_user || 'radius';
  document.getElementById('sPass').value = '';
  document.getElementById('srvModal').classList.add('show');
};

window.saveSrv = async () => {
  const body = {
    name: document.getElementById('sName').value.trim(),
    host: document.getElementById('sHost').value.trim(),
    mysql_host: document.getElementById('sMysql').value.trim(),
    mysql_database: document.getElementById('sDb').value.trim(),
    mysql_user: document.getElementById('sUser').value.trim(),
    mysql_password: document.getElementById('sPass').value
  };
  const r = editingSrvId
    ? await App.api('/radius/servers/' + editingSrvId, { method: 'PUT', body: JSON.stringify(body) })
    : await App.api('/radius/servers', { method: 'POST', body: JSON.stringify(body) });
  if (!r?.success) return App.showToast(r?.message || 'Gagal', 'error');
  closeSrv();
  App.showToast('Server disimpan', 'success');
  loadServers();
};

window.delSrv = async (id) => {
  const row = (window.__radiusServers || []).find(s => s.id === id);
  const name = row && row.name ? row.name : ('#' + id);
  if (!confirm('Hapus server "' + name + '" dari daftar? Daemon FreeRADIUS tidak dihapus.')) return;
  const r = await App.api('/radius/servers/' + id, { method: 'DELETE' });
  App.showToast(r?.message || (r?.success ? 'Terhapus' : 'Gagal'), r?.success ? 'success' : 'error');
  if (r?.success) loadServers();
};

window.testSrv = async (id) => {
  const r = await App.api('/radius/servers/' + id + '/test', { method: 'POST' });
  App.showToast(r?.message || (r?.success ? 'OK' : 'Gagal'), r?.success ? 'success' : 'error');
  loadServers();
  if (r?.success) { loadSessions(); loadUsers(); }
};

window.loadSessions = async () => {
  const d = await App.api('/radius/sessions');
  const tb = document.getElementById('sessTable');
  if (!d?.success) {
    tb.innerHTML = `<tr><td colspan="4" style="color:#dc2626;">${esc(d?.message)}</td></tr>`;
    return;
  }
  if (!d.data.length) {
    tb.innerHTML = '<tr><td colspan="4" style="padding:16px;color:#94a3b8;">Tidak ada sesi online</td></tr>';
    return;
  }
  tb.innerHTML = d.data.map(s => `<tr>
    <td class="mono">${esc(s.username)}</td>
    <td>${esc(s.nasipaddress)}</td>
    <td>${esc(s.framedipaddress)}</td>
    <td>${esc(s.acctstarttime)}</td>
  </tr>`).join('');
};

window.loadUsers = async () => {
  const d = await App.api('/radius/users');
  const tb = document.getElementById('userTable');
  if (!d?.success) {
    tb.innerHTML = `<tr><td colspan="4" style="color:#dc2626;">${esc(d?.message)}</td></tr>`;
    return;
  }
  const rows = d.data.remote || [];
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="4" style="padding:16px;color:#94a3b8;">Tidak ada user di radcheck</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(u => `<tr>
    <td class="mono">${esc(u.username)}</td>
    <td>${esc(u.groupname || '—')}</td>
    <td>${u.has_password ? 'ada' : '—'}</td>
    <td>${esc(u.auth_type || 'Accept')}</td>
  </tr>`).join('');
};

function alignTone(status) {
  if (status === 'ok') return { bg: '#ecfdf5', bd: '#6ee7b7', fg: '#065f46' };
  if (status === 'critical') return { bg: '#fef2f2', bd: '#fca5a5', fg: '#991b1b' };
  return { bg: '#fffbeb', bd: '#fcd34d', fg: '#92400e' };
}

function roleLabel(role) {
  if (role === 'fiberix') return 'Fiberix';
  if (role === 'billingradius') return 'BillingRadius';
  return 'lain';
}

window.loadAlignment = async () => {
  const box = document.getElementById('alignBody');
  if (!box) return;
  box.innerHTML = '<p class="rd-note">Membaca CORE…</p>';
  const d = await App.api('/radius/alignment');
  if (!d?.success) {
    box.innerHTML = `<p class="rd-note" style="color:#dc2626;">${esc(d?.message || 'Gagal membaca alignment')}</p>`;
    return;
  }
  const net = d.data.network || {};
  const tone = alignTone(net.status);
  const fx = d.data.fiberix;
  const br = d.data.billingradius;
  const cores = d.data.cores || [];
  const coreHtml = cores.map(c => {
    const t = alignTone(c.ok ? c.status : 'warn');
    const rows = (c.clients || []).map(r => `<tr>
      <td>${r.order}</td>
      <td class="mono">${esc(r.address)}</td>
      <td>${esc(roleLabel(r.role))}</td>
      <td>${r.disabled ? 'mati' : 'hidup'}</td>
      <td>${esc(r.timeout || '—')}</td>
      <td class="mono">${esc(r.srcAddress || 'auto')}</td>
      <td>${esc(r.comment || '—')}</td>
    </tr>`).join('');
    const issues = (c.issues || []).map(i => `<li>${esc(i)}</li>`).join('');
    const next = (c.next || []).map(i => `<li>${esc(i)}</li>`).join('');
    return `<div style="margin-top:14px;padding:12px 14px;border:1px solid ${t.bd};border-radius:12px;background:${t.bg};color:${t.fg};">
      <strong>${esc(c.name)}</strong> <span class="mono">${esc(c.ip)}</span>
      ${c.use_radius === false ? ' · use-radius=no' : (c.use_radius ? ' · use-radius=yes' : '')}
      <div style="margin-top:6px;font-size:13px;">${esc(c.title || '')}</div>
      <p class="rd-note" style="margin:6px 0 0;color:inherit;">${esc(c.summary || '')}</p>
      ${rows ? `<table class="rd-tbl" style="margin-top:10px;background:#fff;border-radius:8px;overflow:hidden;"><thead><tr><th>#</th><th>Address</th><th>Peran</th><th>Status</th><th>Timeout</th><th>src-address</th><th>Komentar</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
      ${issues ? `<ul style="margin:10px 0 0;padding-left:18px;font-size:12.5px;">${issues}</ul>` : ''}
      ${next ? `<ol style="margin:10px 0 0;padding-left:18px;font-size:12.5px;">${next}</ol>` : ''}
    </div>`;
  }).join('');

  box.innerHTML = `
    <div style="padding:12px 14px;border:1px solid ${tone.bd};border-radius:12px;background:${tone.bg};color:${tone.fg};">
      <strong>${esc(net.title || 'Status')}</strong>
      <p class="rd-note" style="margin:6px 0 0;color:inherit;">${esc(net.summary || '')}</p>
      <p class="rd-note" style="margin:8px 0 0;color:inherit;">Fiberix: <code>${esc(fx ? (fx.host + ':' + (fx.auth_port || 1812)) : 'belum diset')}</code> · BillingRadius: <code>${esc(br ? (br.host + ':1812') : '—')}</code></p>
    </div>
    ${coreHtml || '<p class="rd-note" style="margin-top:12px;">Tidak ada router CORE yang bisa dibaca.</p>'}
    <p class="rd-note" style="margin-top:14px;">Playbook proxy (diterapkan di host FreeRADIUS, bukan di CORE): <code>${esc(d.data.playbook || 'deploy/freeradius-proxy/')}</code>. Tes <code>radtest</code> user Fiberix dan user BillingRadius dulu. Baru kemudian CORE boleh punya satu server saja.</p>
  `;
};

document.addEventListener('DOMContentLoaded', () => {
  App.init && App.init();
  loadServers();
  loadAlignment();
});
