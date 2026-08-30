const TenantsAdmin = {
  rows: [],
  timer: null,

  init() { this.load(); },

  async load() {
    const q = document.getElementById('tnSearch')?.value || '';
    const d = await App.api('/tenants' + (q ? ('?q=' + encodeURIComponent(q)) : ''));
    if (!d?.success) {
      document.getElementById('tnTable').innerHTML = '<tr><td colspan="5"><div class="tod-empty">Gagal memuat</div></td></tr>';
      return;
    }
    this.rows = d.data || [];
    const note = document.getElementById('tnUnassigned');
    if (d.unassigned_customers > 0) {
      note.style.display = 'block';
      note.textContent = d.unassigned_customers + ' pelanggan belum terikat tenant. Buka tenant, lalu “Ikat pelanggan belum terikat”.';
    } else note.style.display = 'none';
    this.render();
  },

  onSearch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(), 250);
  },

  render() {
    const tb = document.getElementById('tnTable');
    if (!this.rows.length) {
      tb.innerHTML = '<tr><td colspan="5"><div class="tod-empty">Belum ada tenant. Buat tenant dulu, lalu buat pemiliknya.</div></td></tr>';
      return;
    }
    tb.innerHTML = this.rows.map((t) => {
      const owners = (t.owners || []).map((o) => this.esc(o.name) + ' <span class="tod-cid">' + this.esc(o.email) + '</span>').join('<br>') || '<span class="tod-cid">Belum ada pemilik</span>';
      return `<tr>
        <td><div class="tod-name">${this.esc(t.name)}</div><div class="tod-cid">${this.esc(t.slug)} · ${this.esc(t.email || '–')}</div></td>
        <td><span class="tod-badge ${t.status}">${t.status === 'active' ? 'Aktif' : 'Ditangguhkan'}</span></td>
        <td>${t.customer_count || 0}</td>
        <td>${owners}</td>
        <td class="tod-actions">
          <a class="tod-btn" href="/tenant?tenant_id=${t.id}">Dashboard</a>
          <button class="tod-btn" type="button" onclick="TenantsAdmin.openOwner(${t.id})">+ Owner</button>
          <button class="tod-btn" type="button" onclick="TenantsAdmin.assignUnassigned(${t.id})">Ikat pelanggan</button>
          <button class="tod-btn" type="button" onclick="TenantsAdmin.toggleStatus(${t.id},'${t.status}')">${t.status === 'active' ? 'Tangguhkan' : 'Aktifkan'}</button>
        </td>
      </tr>`;
    }).join('');
  },

  openCreate() {
    document.getElementById('tnModal').innerHTML = `
      <h3>Tenant baru</h3>
      <label>Nama usaha</label><input id="tnName" class="tod-input" placeholder="ISP Baru">
      <label>Email</label><input id="tnEmail" class="tod-input" type="email">
      <label>Telepon</label><input id="tnPhone" class="tod-input">
      <label>Alamat</label><input id="tnAddr" class="tod-input">
      <div class="tod-modal-actions">
        <button class="tod-btn" type="button" onclick="TenantsAdmin.closeModal()">Batal</button>
        <button class="btn-primary" type="button" onclick="TenantsAdmin.submitCreate()">Simpan</button>
      </div>`;
    document.getElementById('tnOverlay').classList.add('open');
  },

  async submitCreate() {
    const d = await App.api('/tenants', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('tnName').value,
        email: document.getElementById('tnEmail').value,
        phone: document.getElementById('tnPhone').value,
        address: document.getElementById('tnAddr').value
      })
    });
    if (!d?.success) { App.showToast(d?.message || 'Gagal', 'error'); return; }
    App.showToast(d.message, 'success');
    this.closeModal();
    this.load();
  },

  openOwner(id) {
    document.getElementById('tnModal').innerHTML = `
      <h3>Buat pemilik tenant</h3>
      <p class="tod-sub">User ini login di /login lalu otomatis masuk dashboard /tenant</p>
      <label>Nama</label><input id="owName" class="tod-input" placeholder="Budi">
      <label>Email</label><input id="owEmail" class="tod-input" type="email" placeholder="owner@isp.id">
      <label>Password</label><input id="owPass" class="tod-input" type="password" placeholder="minimal 8 karakter">
      <label>Telepon</label><input id="owPhone" class="tod-input">
      <div class="tod-modal-actions">
        <button class="tod-btn" type="button" onclick="TenantsAdmin.closeModal()">Batal</button>
        <button class="btn-primary" type="button" onclick="TenantsAdmin.submitOwner(${id})">Buat owner</button>
      </div>`;
    document.getElementById('tnOverlay').classList.add('open');
  },

  async submitOwner(id) {
    const d = await App.api('/tenants/' + id + '/owners', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('owName').value,
        email: document.getElementById('owEmail').value,
        password: document.getElementById('owPass').value,
        phone: document.getElementById('owPhone').value
      })
    });
    if (!d?.success) { App.showToast(d?.message || 'Gagal', 'error'); return; }
    App.showToast(d.message, 'success');
    this.closeModal();
    this.load();
  },

  async assignUnassigned(id) {
    if (!confirm('Pindahkan semua pelanggan yang belum terikat ke tenant ini?')) return;
    const d = await App.api('/tenants/' + id + '/assign-customers', {
      method: 'POST',
      body: JSON.stringify({ assign_unassigned: true })
    });
    App.showToast(d?.message || 'Selesai', d?.success ? 'success' : 'error');
    this.load();
  },

  async toggleStatus(id, current) {
    const next = current === 'active' ? 'suspended' : 'active';
    const d = await App.api('/tenants/' + id, { method: 'PUT', body: JSON.stringify({ status: next }) });
    App.showToast(d?.message || 'Selesai', d?.success ? 'success' : 'error');
    this.load();
  },

  closeModal() { document.getElementById('tnOverlay').classList.remove('open'); },
  esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
};

document.addEventListener('DOMContentLoaded', () => TenantsAdmin.init());
