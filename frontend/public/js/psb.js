const Psb = (() => {
  const GROUPS = [
    ['daftar', 'survey'],
    ['jadwal', 'stok'],
    ['pasang', 'bind'],
    ['redaman', 'pppoe'],
    ['tagihan', 'done']
  ];
  const LABEL = {
    daftar: 'Daftar', survey: 'Survey', jadwal: 'Jadwal', stok: 'Stok',
    pasang: 'Pasang', bind: 'Bind ONT', redaman: 'Redaman', pppoe: 'PPPoE',
    tagihan: 'Tagihan', done: 'Selesai'
  };
  const STAGES = ['daftar','survey','jadwal','stok','pasang','bind','redaman','pppoe','tagihan','done'];
  let jobs = [];
  let current = null;
  let packages = [];

  async function api(path, opts) {
    return App.api(path, opts);
  }

  async function load() {
    const [j, p] = await Promise.all([
      api('/psb'),
      api('/packages').catch(() => ({ data: [] }))
    ]);
    jobs = j.data || [];
    packages = p.data || [];
    renderBoard();
  }

  function renderBoard() {
    const el = document.getElementById('psbCols');
    el.innerHTML = GROUPS.map((pair) => {
      const items = jobs.filter((x) => pair.includes(x.stage));
      const title = pair.map((s) => LABEL[s]).join(' / ');
      return `<section class="psb-col"><h3>${title}<span>${items.length}</span></h3>
        <div class="psb-list">${items.map(cardHtml).join('') || '<div style="padding:16px;color:#94a3b8;font-size:12px">Kosong</div>'}</div>
      </section>`;
    }).join('');
  }

  function cardHtml(j) {
    return `<article class="psb-card" onclick="Psb.open(${j.id})">
      <b>${esc(j.name)}</b>
      <small>${j.job_number} · ${LABEL[j.stage] || j.stage}</small><br>
      <small>${esc(j.phone)} · ${esc(j.package?.name || 'belum paket')}</small>
    </article>`;
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function openCreate() {
    current = null;
    drawForm({
      title: 'PSB baru',
      fields: [
        ['name', 'Nama'], ['phone', 'Telepon'], ['address', 'Alamat', 'textarea'],
        ['package_id', 'Paket', 'package']
      ],
      submit: 'Simpan daftar',
      onSubmit: async (body) => {
        const r = await api('/psb', { method: 'POST', body: JSON.stringify(body) });
        if (!r.success) throw new Error(r.message);
        close();
        await load();
        if (r.data?.id) open(r.data.id);
      }
    });
  }

  async function open(id) {
    const r = await api('/psb/' + id);
    if (!r.success) return alert(r.message);
    current = r.data;
    const next = r.next;
    const i = STAGES.indexOf(current.stage);
    const steps = STAGES.map((s, idx) => `<i class="${idx < i ? 'done' : idx === i ? 'on' : ''}">${LABEL[s]}</i>`).join('');
    const action = nextAction(next);
    drawForm({
      title: current.job_number,
      html: `<p style="margin:0 0 8px;color:#64748b;font-size:13px">${esc(current.name)} · ${esc(current.phone)}<br>${esc(current.address)}</p>
        <div class="steps">${steps}</div>
        <p style="font-size:12px;color:#64748b">ODP: ${esc(current.odp?.name || '-')} · ONT: ${esc(current.ont_serial || '-')} · PPPoE: ${esc(current.pppoe_username || '-')}</p>`,
      fields: action.fields,
      submit: action.label,
      extra: `<button class="rd-btn" type="button" onclick="Psb.cancel()">Batalkan</button>`,
      onSubmit: async (body) => {
        const res = await api('/psb/' + current.id + '/advance', { method: 'POST', body: JSON.stringify(body) });
        if (!res.success) throw new Error(res.message);
        current = res.data;
        await load();
        open(current.id);
      }
    }, true);
  }

  function nextAction(next) {
    const map = {
      survey: { label: 'Simpan survey / coverage', fields: [['latitude', 'Latitude'], ['longitude', 'Longitude']] },
      jadwal: { label: 'Jadwalkan teknisi', fields: [['scheduled_date', 'Tanggal', 'date'], ['technician_name', 'Nama teknisi']] },
      stok: { label: 'Ambil ONT gudang', fields: [['serial_number', 'Serial ONT']] },
      pasang: { label: 'Tandai terpasang', fields: [] },
      bind: { label: 'Bind ONT + VLAN 100', fields: [['ont_serial', 'Serial ONT']] },
      redaman: { label: 'Simpan redaman', fields: [['rx_power', 'RX Power (dBm)']] },
      pppoe: { label: 'Buat PPPoE', fields: [['pppoe_username', 'Username PPPoE'], ['pppoe_password', 'Password'], ['device_id', 'ID MikroTik (opsional)']] },
      tagihan: { label: 'Generate tagihan pertama', fields: [] },
      done: { label: 'Selesai', fields: [] }
    };
    return map[next] || { label: 'Lanjut', fields: [] };
  }

  function drawForm({ title, fields = [], submit, onSubmit, html = '', extra = '' }, keepOpen) {
    const drawer = document.getElementById('psbDrawer');
    const mask = document.getElementById('psbMask');
    const fieldHtml = fields.map(([name, label, type]) => {
      if (type === 'package') {
        const opts = packages.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
        return `<div class="fld"><label>${label}</label><select name="${name}"><option value="">— pilih —</option>${opts}</select></div>`;
      }
      if (type === 'textarea') return `<div class="fld"><label>${label}</label><textarea name="${name}" rows="3"></textarea></div>`;
      return `<div class="fld"><label>${label}</label><input name="${name}" type="${type === 'date' ? 'date' : 'text'}"></div>`;
    }).join('');
    drawer.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <h2 style="margin:0;font-size:18px">${esc(title)}</h2>
        <button class="rd-btn" type="button" onclick="Psb.close()">Tutup</button>
      </div>
      ${html}
      <form id="psbForm">${fieldHtml}
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="rd-btn pri" type="submit">${esc(submit)}</button>
          ${extra}
        </div>
        <div id="psbErr" style="color:#b91c1c;font-size:12px;margin-top:8px"></div>
      </form>`;
    drawer.classList.add('open');
    mask.classList.add('open');
    const form = document.getElementById('psbForm');
    if (current && current.ont_serial && form.ont_serial) form.ont_serial.value = current.ont_serial;
    if (current && current.pppoe_username && form.pppoe_username) form.pppoe_username.value = current.pppoe_username;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = {};
      new FormData(form).forEach((v, k) => { if (String(v).trim()) body[k] = v; });
      try {
        document.getElementById('psbErr').textContent = '';
        await onSubmit(body);
      } catch (err) {
        document.getElementById('psbErr').textContent = err.message;
      }
    };
  }

  function close() {
    document.getElementById('psbDrawer').classList.remove('open');
    document.getElementById('psbMask').classList.remove('open');
  }

  async function cancel() {
    if (!current) return;
    if (!confirm('Batalkan PSB ini?')) return;
    await api('/psb/' + current.id + '/cancel', { method: 'POST', body: JSON.stringify({}) });
    close();
    load();
  }

  document.addEventListener('DOMContentLoaded', load);
  return { load, open, openCreate, close, cancel };
})();
