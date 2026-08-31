const Gudang = (() => {
  let rows = [];

  async function load() {
    const r = await App.api('/gudang');
    rows = r.data || [];
    const s = r.stats || {};
    document.getElementById('gdStats').innerHTML = ['in_stock','checked_out','installed','ont','kabel'].map((k) => {
      const lbl = { in_stock:'Stok', checked_out:'Di teknisi', installed:'Terpasang', ont:'ONT', kabel:'Kabel' }[k];
      return `<div class="rd-card"><div class="rd-lbl">${lbl}</div><div class="rd-val">${s[k] || 0}</div></div>`;
    }).join('');
    document.getElementById('gdBody').innerHTML = rows.map((it) => `<tr>
      <td><b>${esc(it.serial_number || it.name)}</b><br><small>${esc(it.brand || '')} ${esc(it.model || '')}</small></td>
      <td>${it.item_type}</td>
      <td><span class="pill ${it.status}">${it.status}</span></td>
      <td>${esc(it.technician_name || '—')}</td>
      <td>${esc(it.customer?.name || '—')}</td>
      <td>${actions(it)}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="padding:24px;color:#94a3b8">Belum ada barang</td></tr>';
  }

  function actions(it) {
    const btns = [];
    if (it.status === 'in_stock') btns.push(`<button class="rd-btn" onclick="Gudang.move(${it.id},'checkout')">Checkout</button>`);
    if (it.status === 'checked_out') {
      btns.push(`<button class="rd-btn" onclick="Gudang.move(${it.id},'install')">Pasang</button>`);
      btns.push(`<button class="rd-btn" onclick="Gudang.move(${it.id},'return')">Kembali</button>`);
    }
    if (it.status === 'installed') btns.push(`<button class="rd-btn" onclick="Gudang.move(${it.id},'return')">Tarik</button>`);
    return btns.join(' ');
  }

  function esc(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

  function openIn() {
    const box = document.getElementById('gdBox');
    document.getElementById('gdModal').classList.add('open');
    box.innerHTML = `<h3 style="margin:0 0 12px">Masuk gudang</h3>
      <form id="gdForm">
        <div class="fld"><label>Tipe</label><select name="item_type"><option value="ont">ONT</option><option value="adaptor">Adaptor</option><option value="kabel">Kabel</option><option value="other">Lainnya</option></select></div>
        <div class="fld"><label>Serial</label><input name="serial_number" placeholder="wajib untuk ONT"></div>
        <div class="fld"><label>Nama</label><input name="name" placeholder="ONT Huawei / dropcore 100m"></div>
        <div class="fld"><label>Merk / model</label><input name="brand" placeholder="Huawei"><input name="model" placeholder="HG8245H5" style="margin-top:6px"></div>
        <div class="fld"><label>Panjang kabel (m)</label><input name="length_m" type="number"></div>
        <div style="display:flex;gap:8px"><button class="rd-btn pri" type="submit">Simpan</button>
        <button class="rd-btn" type="button" onclick="Gudang.close()">Batal</button></div>
      </form>`;
    document.getElementById('gdForm').onsubmit = async (e) => {
      e.preventDefault();
      const body = {};
      new FormData(e.target).forEach((v, k) => { if (String(v).trim()) body[k] = v; });
      const r = await App.api('/gudang', { method: 'POST', body: JSON.stringify(body) });
      if (!r.success) return alert(r.message);
      close();
      load();
    };
  }

  async function move(id, action) {
    let extra = {};
    if (action === 'checkout') {
      const name = prompt('Nama teknisi yang bawa barang?') || '';
      extra = { technician_name: name };
    }
    const r = await App.api('/gudang/' + id + '/move', { method: 'POST', body: JSON.stringify({ action, ...extra }) });
    if (!r.success) return alert(r.message);
    load();
  }

  function close() { document.getElementById('gdModal').classList.remove('open'); }

  document.addEventListener('DOMContentLoaded', load);
  return { load, openIn, move, close };
})();
