/* Submodul independen: manajemen core TIA/EIA-598 di peta Infrastruktur. */
(function () {
  const api = (path, opt) => {
    if (typeof apiWithRetry === 'function') return apiWithRetry(path, opt || {});
    const token = localStorage.getItem('token');
    return fetch('/api' + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(opt || {})
    }).then((r) => r.json());
  };

  const STATUS_LABEL = { active: 'Active', idle: 'Idle', damaged: 'Rusak', reserved: 'Reserved' };
  let state = { tab: 'cables', cables: [], points: [], cable: null, detail: null, selected: null, error: '' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function cableTitle(c) {
    const a = c.from_point ? ((c.from_point.type || '').toUpperCase() + ' ' + c.from_point.name) : '?';
    const b = c.to_point ? ((c.to_point.type || '').toUpperCase() + ' ' + c.to_point.name) : '?';
    return (c.name || ('Kabel #' + c.id)) + ' · ' + a + ' → ' + b;
  }

  async function loadPoints() {
    try {
      const res = await api('/infrastructure/map');
      state.points = (res && res.data) || [];
    } catch (e) {
      state.points = [];
    }
  }

  async function loadCables() {
    try {
      const res = await api('/infrastructure-cores/cables');
      if (!res || res.success === false) {
        state.error = (res && res.message) || 'Gagal memuat daftar kabel.';
        state.cables = [];
      } else {
        state.error = '';
        state.cables = res.data || [];
      }
    } catch (e) {
      state.error = e.message || 'Gagal memuat daftar kabel.';
      state.cables = [];
    }
    render();
  }

  function pointOptions(selected) {
    const pts = (state.points || []).slice().sort((a, b) => {
      const ta = String(a.type || '');
      const tb = String(b.type || '');
      if (ta !== tb) return ta.localeCompare(tb);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    if (!pts.length) return '<option value="">— Belum ada titik di peta —</option>';
    return '<option value="">— pilih titik —</option>' + pts.map((p) => {
      const sel = Number(selected) === Number(p.id) ? ' selected' : '';
      return `<option value="${p.id}"${sel}>${esc((p.type || '').toUpperCase())} · ${esc(p.name)}</option>`;
    }).join('');
  }

  function renderCreateForm() {
    return `<div class="core-form" style="border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin-bottom:12px;">
      <div style="font-weight:800;font-size:13px;margin-bottom:4px;">Buat kabel baru</div>
      <p style="font-size:12px;color:#64748b;margin:0 0 8px;">Pilih dua titik yang sudah ada, atau gambar di peta.</p>
      <label>Dari titik</label>
      <select id="cmFrom">${pointOptions()}</select>
      <label>Ke titik</label>
      <select id="cmTo">${pointOptions()}</select>
      <label>Kapasitas core</label>
      <select id="cmNewCores">
        <option value="12">12 core</option>
        <option value="24">24 core</option>
        <option value="48">48 core</option>
        <option value="8">8 core</option>
        <option value="4">4 core</option>
        <option value="2">2 core</option>
        <option value="1">1 core</option>
      </select>
      <div class="core-actions">
        <button class="btn btn-primary" type="button" onclick="CoreMap.createLink()">Simpan kabel</button>
        <button class="btn btn-secondary" type="button" onclick="CoreMap.startDraw()">Gambar di peta</button>
      </div>
    </div>`;
  }

  async function openCable(id) {
    const res = await api('/infrastructure-cores?cable_id=' + encodeURIComponent(id));
    state.cable = state.cables.find((c) => Number(c.id) === Number(id)) || { id };
    state.detail = (res && res.data) || { cores: [], connections: [], subscriber_cores: [] };
    state.selected = null;
    state.tab = 'map';
    document.querySelectorAll('.core-tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === 'map'));
    render();
  }

  function groupTubes(cores) {
    const tubes = {};
    (cores || []).forEach((c) => {
      const k = c.tube_number || 1;
      if (!tubes[k]) tubes[k] = { tube: k, color: c.tube_color, cores: [] };
      tubes[k].cores.push(c);
    });
    return Object.values(tubes);
  }

  function renderCables() {
    const err = state.error
      ? `<p style="color:#b91c1c;font-size:13px;">${esc(state.error)}</p>`
      : '';
    const list = state.cables.length
      ? state.cables.map((c) => {
        const st = c.cores || {};
        return `<div class="core-cable" onclick="CoreMap.openCable(${c.id})">
          <div style="font-weight:800;font-size:13px;">${esc(cableTitle(c))}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px;">
            ${st.total || 0} core · aktif ${st.active || 0} · idle ${st.idle || 0} · rusak ${st.damaged || 0}
          </div>
        </div>`;
      }).join('')
      : '<p style="color:#64748b;font-size:13px;margin-top:8px;">Belum ada kabel fiber/trunk. Buat dari form di atas, atau gambar link di peta.</p>';
    return err + renderCreateForm() + list;
  }

  function renderMap() {
    if (!state.detail) {
      return '<p style="color:#64748b;font-size:13px;">Pilih kabel di tab Kabel dulu.</p>';
    }
    const cores = state.detail.cores || [];
    if (!cores.length) {
      return `<div>
        <p style="font-size:13px;">Kabel #${state.cable.id} belum punya core.</p>
        <label>Generate kapasitas</label>
        <select id="cmGenCount" class="form-control">
          <option>12</option><option>24</option><option>48</option><option>8</option><option>4</option><option>2</option><option>1</option>
        </select>
        <div class="core-actions"><button class="btn btn-primary" type="button" onclick="CoreMap.generate()">Generate core</button></div>
      </div>`;
    }
    const tubes = groupTubes(cores);
    const sel = state.selected;
    const drop = (state.detail.subscriber_cores || []).find((d) => sel && Number(d.core_id) === Number(sel.id));
    let html = `<div style="font-size:12px;font-weight:700;margin-bottom:8px;">${esc(cableTitle(state.cable))}</div>`;
    tubes.forEach((t) => {
      html += `<div class="core-tube"><div class="core-tube-h">Tube ${t.tube} · ${esc(t.color || '')}</div><div class="core-grid">`;
      t.cores.forEach((c) => {
        const on = sel && Number(sel.id) === Number(c.id) ? ' on' : '';
        html += `<button type="button" class="core-chip core-st-${esc(c.status)}${on}" onclick="CoreMap.select(${c.id})">
          <div class="core-dot" style="background:${esc(c.hex_code || '#999')}"></div>
          <div class="n">${c.core_number} ${esc(c.color_code)}</div>
          <div class="s">${esc(STATUS_LABEL[c.status] || c.status)}</div>
        </button>`;
      });
      html += '</div></div>';
    });
    if (sel) {
      html += `<div class="core-form">
        <div style="font-weight:800;margin:8px 0;">Core ${sel.core_number} · ${esc(sel.color_code)}</div>
        <label>Status</label>
        <select id="cmStatus">
          ${['idle','active','reserved','damaged'].map((s) => `<option value="${s}"${sel.status===s?' selected':''}>${STATUS_LABEL[s]}</option>`).join('')}
        </select>
        <label>Redaman (dB)</label>
        <input id="cmAtt" type="number" step="0.01" value="${sel.attenuation_db != null ? sel.attenuation_db : ''}" placeholder="mis. 0.35">
        <label>Catatan</label>
        <textarea id="cmNotes" rows="2">${esc(sel.notes || '')}</textarea>
        <div class="core-actions">
          <button class="btn btn-primary" type="button" onclick="CoreMap.saveCore()">Simpan core</button>
        </div>
        <label>Sambung ke core ID</label>
        <input id="cmTarget" type="number" placeholder="ID core tujuan">
        <label>Atau port perangkat</label>
        <select id="cmDevType">
          <option value="">—</option>
          <option value="OLT_PORT">OLT Port</option>
          <option value="ODC_SPLITTER">ODC Splitter</option>
          <option value="ODP_PORT">ODP Port</option>
        </select>
        <input id="cmDevPort" placeholder="Nomor port / splitter" style="margin-top:6px">
        <div class="core-actions">
          <button class="btn btn-secondary" type="button" onclick="CoreMap.splice()">Simpan sambungan</button>
        </div>
        <label>Assign pelanggan (ID internal)</label>
        <input id="cmCust" type="number" placeholder="customers.id" value="${drop ? drop.subscriber_id : ''}">
        <input id="cmOdpPort" type="number" placeholder="Port ODP" value="${drop && drop.odp_port_number != null ? drop.odp_port_number : ''}" style="margin-top:6px">
        <div class="core-actions">
          <button class="btn btn-primary" type="button" onclick="CoreMap.assign()">Assign dropcore</button>
        </div>
      </div>`;
    }
    const conns = state.detail.connections || [];
    if (conns.length) {
      html += '<div style="margin-top:16px;font-weight:800;font-size:12px;">Sambungan</div>';
      conns.forEach((c) => {
        html += `<div style="font-size:12px;padding:6px 0;border-bottom:1px solid #eef2f7;display:flex;justify-content:space-between;gap:8px;">
          <span>#${c.source_core_id} → ${c.target_core_id || (c.target_device_type + ' ' + (c.target_port || ''))}</span>
          <button type="button" class="btn btn-secondary" style="padding:2px 8px;font-size:11px" onclick="CoreMap.unsplice(${c.id})">Hapus</button>
        </div>`;
      });
    }
    return html;
  }

  function renderTrace() {
    return `<div class="core-form">
      <label>ID pelanggan (customers.id)</label>
      <input id="cmTraceCust" type="number" placeholder="mis. 21">
      <div class="core-actions">
        <button class="btn btn-primary" type="button" onclick="CoreMap.trace()">Telusuri jalur</button>
      </div>
      <div id="cmTraceOut"></div>
    </div>`;
  }

  function render() {
    const el = document.getElementById('coreBody');
    if (!el) return;
    if (state.tab === 'cables') el.innerHTML = renderCables();
    else if (state.tab === 'map') el.innerHTML = renderMap();
    else el.innerHTML = renderTrace();
  }

  window.CoreMap = {
    async open() {
      const p = document.getElementById('corePanel');
      if (!p) return;
      p.classList.add('open');
      p.setAttribute('aria-hidden', 'false');
      await loadPoints();
      await loadCables();
    },
    refresh() {
      return loadCables();
    },
    startDraw() {
      window.CoreMap.close();
      if (typeof toggleDrawMode === 'function') toggleDrawMode();
    },
    async createLink() {
      const from = parseInt((document.getElementById('cmFrom') || {}).value, 10);
      const to = parseInt((document.getElementById('cmTo') || {}).value, 10);
      const cores = parseInt((document.getElementById('cmNewCores') || {}).value, 10);
      if (!from || !to || from === to) return alert('Pilih dua titik yang berbeda.');
      const res = await api('/infrastructure-links', {
        method: 'POST',
        body: JSON.stringify({
          from_point_id: from,
          to_point_id: to,
          link_type: 'fiber',
          status: 'active',
          core_count: cores || null
        })
      });
      if (!res || !res.success) return alert((res && res.message) || 'Gagal membuat kabel.');
      if (typeof loadInfraData === 'function') {
        loadInfraData(typeof currentFilter !== 'undefined' ? currentFilter : '', { preserveView: true });
      }
      await loadCables();
      const newId = res.data && res.data.id;
      if (newId) await openCable(newId);
    },
    close() {
      const p = document.getElementById('corePanel');
      if (!p) return;
      p.classList.remove('open');
      p.setAttribute('aria-hidden', 'true');
    },
    tab(name, btn) {
      state.tab = name;
      document.querySelectorAll('.core-tab').forEach((t) => t.classList.toggle('on', t === btn));
      render();
    },
    openCable,
    select(id) {
      state.selected = (state.detail.cores || []).find((c) => Number(c.id) === Number(id)) || null;
      render();
    },
    async generate() {
      const n = parseInt(document.getElementById('cmGenCount').value, 10);
      const res = await api('/infrastructure-cores/generate', {
        method: 'POST',
        body: JSON.stringify({ cable_id: state.cable.id, total_cores: n })
      });
      if (!res.success) return alert(res.message || 'Gagal generate');
      await openCable(state.cable.id);
      await loadCables();
    },
    async saveCore() {
      const res = await api('/infrastructure-cores/' + state.selected.id, {
        method: 'PATCH',
        body: JSON.stringify({
          status: document.getElementById('cmStatus').value,
          attenuation_db: document.getElementById('cmAtt').value,
          notes: document.getElementById('cmNotes').value
        })
      });
      if (!res.success) return alert(res.message || 'Gagal simpan');
      await openCable(state.cable.id);
    },
    async splice() {
      const target = parseInt(document.getElementById('cmTarget').value, 10);
      const res = await api('/infrastructure-cores/splice', {
        method: 'POST',
        body: JSON.stringify({
          source_core_id: state.selected.id,
          target_core_id: target || null,
          target_device_type: document.getElementById('cmDevType').value || null,
          target_port: document.getElementById('cmDevPort').value || null,
          connection_kind: target ? 'splice' : 'patch'
        })
      });
      if (!res.success) return alert(res.message || 'Gagal splice');
      await openCable(state.cable.id);
    },
    async unsplice(id) {
      if (!confirm('Hapus sambungan ini?')) return;
      const res = await api('/infrastructure-cores/connections/' + id, { method: 'DELETE' });
      if (!res.success) return alert(res.message || 'Gagal hapus');
      await openCable(state.cable.id);
    },
    async assign() {
      const res = await api('/infrastructure-cores/assign', {
        method: 'POST',
        body: JSON.stringify({
          core_id: state.selected.id,
          subscriber_id: parseInt(document.getElementById('cmCust').value, 10),
          odp_port_number: parseInt(document.getElementById('cmOdpPort').value, 10) || null
        })
      });
      if (!res.success) return alert(res.message || 'Gagal assign');
      await openCable(state.cable.id);
    },
    async trace() {
      const id = document.getElementById('cmTraceCust').value;
      const out = document.getElementById('cmTraceOut');
      const res = await api('/infrastructure-cores/trace?customer_id=' + encodeURIComponent(id));
      if (!res.success) { out.innerHTML = '<p style="color:#b91c1c">' + esc(res.message) + '</p>'; return; }
      const trail = (res.data && res.data.trail) || [];
      out.innerHTML = '<div class="core-trail">' + trail.map((t) => '<div>' + esc(t) + '</div>').join('') + '</div>';
    }
  };
})();
