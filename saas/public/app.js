const SaaS = {
  base() {
    return window.SAAS_BASE || '';
  },
  async api(path, opts) {
    const res = await fetch(this.base() + path, Object.assign({
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
    }, opts || {}));
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      location.href = this.base() + '/login';
      throw new Error('login');
    }
    return data;
  },
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
  async load() {
    const d = await this.api('/api/tenants');
    const tb = document.getElementById('tnBody');
    if (!d.success) {
      tb.innerHTML = '<tr><td colspan="5">' + this.esc(d.message || 'Gagal') + '</td></tr>';
      return;
    }
    if (!d.data.length) {
      tb.innerHTML = '<tr><td colspan="5">Belum ada tenant.</td></tr>';
      return;
    }
    tb.innerHTML = d.data.map((t) => {
      const owners = (t.owners || []).map((o) => this.esc(o.name) + ' · ' + this.esc(o.email)).join('<br>') || '<span style="color:#93a0bb">Belum ada</span>';
      const next = t.status === 'active' ? 'suspended' : 'active';
      return `<tr>
        <td><b>${this.esc(t.name)}</b><div style="color:#93a0bb">${this.esc(t.slug)}</div></td>
        <td><span class="badge ${this.esc(t.status)}">${t.status === 'active' ? 'Aktif' : 'Ditangguhkan'}</span></td>
        <td>${t.customer_count || 0}</td>
        <td>${owners}</td>
        <td class="tod-actions">
          <button class="tod-btn" type="button" onclick="SaaS.openOwner(${t.id})">+ Owner</button>
          <button class="tod-btn" type="button" onclick="SaaS.setStatus(${t.id},'${next}')">${t.status === 'active' ? 'Tangguhkan' : 'Aktifkan'}</button>
        </td>
      </tr>`;
    }).join('');
  },
  openCreate() {
    this.modal(`<h3>Tenant baru</h3>
      <label>Nama usaha</label><input id="tnName" placeholder="ISP Baru">
      <label>Email</label><input id="tnEmail" type="email">
      <div class="modal-actions">
        <button class="tod-btn" type="button" onclick="SaaS.close()">Batal</button>
        <button class="btn" type="button" style="margin:0" onclick="SaaS.submitCreate()">Simpan</button>
      </div>`);
  },
  async submitCreate() {
    const d = await this.api('/api/tenants', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('tnName').value,
        email: document.getElementById('tnEmail').value
      })
    });
    if (!d.success) return alert(d.message || 'Gagal');
    this.close();
    this.load();
  },
  openOwner(id) {
    this.modal(`<h3>Owner penyewa</h3>
      <p class="hint">Akun ini login ke billing, bukan ke panel platform.</p>
      <label>Nama</label><input id="owName">
      <label>Email</label><input id="owEmail" type="email">
      <label>Password</label><input id="owPass" type="password">
      <div class="modal-actions">
        <button class="tod-btn" type="button" onclick="SaaS.close()">Batal</button>
        <button class="btn" type="button" style="margin:0" onclick="SaaS.submitOwner(${id})">Buat</button>
      </div>`);
  },
  async submitOwner(id) {
    const d = await this.api('/api/tenants/' + id + '/owners', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('owName').value,
        email: document.getElementById('owEmail').value,
        password: document.getElementById('owPass').value
      })
    });
    if (!d.success) return alert(d.message || 'Gagal');
    alert(d.message);
    this.close();
    this.load();
  },
  async setStatus(id, status) {
    const d = await this.api('/api/tenants/' + id + '/status', {
      method: 'POST',
      body: JSON.stringify({ status })
    });
    if (!d.success) return alert(d.message || 'Gagal');
    this.load();
  },
  modal(html) {
    document.getElementById('modal').innerHTML = html;
    document.getElementById('overlay').hidden = false;
  },
  close() {
    document.getElementById('overlay').hidden = true;
  }
};

document.getElementById('overlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'overlay') SaaS.close();
});
if (document.getElementById('tnBody')) SaaS.load();
