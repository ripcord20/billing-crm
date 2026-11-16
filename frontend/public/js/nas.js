function esc(s) {
  return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function methodLabel(m) {
  return m === 'public_ip' ? 'IP Publik' : 'VPN';
}

let _nasCache = [];

async function loadProvinces() {
  const sel = document.getElementById('nasProvince');
  const keep = sel.value;
  try {
    const rows = await App.api('/regions/provinces');
    const list = Array.isArray(rows) ? rows : (rows?.data || []);
    sel.innerHTML = '<option value="">Pilih wilayah untuk NAS</option>' +
      list.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
    if (keep) sel.value = keep;
  } catch (_) {}
}

async function loadNas() {
  const box = document.getElementById('nasList');
  const d = await App.api('/nas');
  if (!d?.success) {
    box.innerHTML = `<div class="nas-empty" style="color:#dc2626;">${esc(d?.message || 'Gagal memuat')}</div>`;
    return;
  }
  _nasCache = d.data;
  if (!d.data.length) {
    box.innerHTML = '<div class="nas-empty">Belum ada NAS. Klik <b>+ Tambah NAS</b> untuk menambahkan router.</div>';
    return;
  }
  box.innerHTML = d.data.map(n => {
    const wilayah = [n.regency, n.province].filter(Boolean).join(', ') || 'Wilayah belum dipilih';
    const m = n.connection_method === 'public_ip' ? 'ip' : 'vpn';
    const ip = n.connection_method === 'public_ip' && n.nasname
      ? `<span class="nas-pill">${esc(n.nasname)}</span>` : '';
    return `<div class="nas-card">
      <div>
        <h3>${esc(n.shortname || n.nasname || 'NAS')}</h3>
        <p class="desc">${esc(n.description || 'Tidak ada deskripsi')}</p>
        <div class="nas-meta">
          <span class="nas-pill ${m}">${methodLabel(n.connection_method)}</span>
          <span class="nas-pill">${esc(wilayah)}</span>
          ${ip}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="nas-btn-c" style="padding:6px 10px;font-size:12px;" onclick="editNas(${n.id})">Edit</button>
        <button class="nas-btn-c" style="padding:6px 10px;font-size:12px;color:#dc2626;border-color:#fecaca;" onclick="delNas(${n.id})">Hapus</button>
      </div>
    </div>`;
  }).join('');
}

window.onMethodChange = function () {
  const vpn = document.getElementById('nasMethod').value !== 'public_ip';
  document.getElementById('nasIpWrap').style.display = vpn ? 'none' : 'block';
  document.getElementById('nasIp').required = !vpn;
};

window.openNas = function () {
  document.getElementById('nasId').value = '';
  document.getElementById('nasTitle').textContent = '+ Tambah NAS';
  document.getElementById('nasSubmit').textContent = '+ Tambah NAS';
  document.getElementById('nasName').value = '';
  document.getElementById('nasDesc').value = '';
  document.getElementById('nasMethod').value = 'vpn';
  document.getElementById('nasIp').value = '';
  document.getElementById('nasProvince').value = '';
  onMethodChange();
  document.getElementById('nasModal').classList.add('open');
};

window.closeNas = function () {
  document.getElementById('nasModal').classList.remove('open');
};

window.editNas = function (id) {
  const n = _nasCache.find(x => x.id === id);
  if (!n) return;
  document.getElementById('nasId').value = n.id;
  document.getElementById('nasTitle').textContent = 'Edit NAS';
  document.getElementById('nasSubmit').textContent = 'Simpan';
  document.getElementById('nasName').value = n.shortname || '';
  document.getElementById('nasDesc').value = n.description || '';
  document.getElementById('nasMethod').value = n.connection_method === 'public_ip' ? 'public_ip' : 'vpn';
  document.getElementById('nasIp').value = n.nasname || '';
  document.getElementById('nasProvince').value = n.province || '';
  onMethodChange();
  document.getElementById('nasModal').classList.add('open');
};

window.saveNas = async function () {
  const id = document.getElementById('nasId').value;
  const method = document.getElementById('nasMethod').value;
  const body = {
    name: document.getElementById('nasName').value.trim(),
    description: document.getElementById('nasDesc').value.trim(),
    connection_method: method,
    province: document.getElementById('nasProvince').value,
    public_ip: document.getElementById('nasIp').value.trim()
  };
  if (!body.name) return App.showToast('Nama NAS wajib', 'error');
  if (method === 'public_ip' && !body.public_ip) return App.showToast('IP publik wajib', 'error');
  const r = await App.api(id ? '/nas/' + id : '/nas', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(body)
  });
  if (!r?.success) return App.showToast(r?.message || 'Gagal', 'error');
  closeNas();
  App.showToast(id ? 'NAS diperbarui' : 'NAS ditambahkan', 'success');
  loadNas();
};

window.delNas = async function (id) {
  if (!confirm('Hapus NAS ini?')) return;
  const r = await App.api('/nas/' + id, { method: 'DELETE' });
  App.showToast(r?.message || (r?.success ? 'Dihapus' : 'Gagal'), r?.success ? 'success' : 'error');
  loadNas();
};

document.addEventListener('DOMContentLoaded', () => {
  loadProvinces();
  loadNas();
});
