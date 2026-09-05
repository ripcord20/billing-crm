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
  let state = { tab: 'cables', cables: [], cable: null, detail: null, selected: null };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function cableTitle(c) {
    const a = c.from_point ? ((c.from_point.type || '').toUpperCase() + ' ' + c.from_point.name) : '?';
    const b = c.to_point ? ((c.to_point.type || '').toUpperCase() + ' ' + c.to_point.name) : '?';
    return (c.name || ('Kabel #' + c.id)) + ' · ' + a + ' → ' + b;
  }

  async function loadCables() {
    const res = await api('/infrastructure-cores/cables');
    state.cables = (res && res.data) || [];
    render();
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
    if (!state.cables.length) {
      return '<p style="color:#64748b;font-size:13px;">Belum ada kabel fiber/trunk. Gambar link di peta, lalu pilih kapasitas core.</p>';
    }
    return state.cables.map((c) => {
      const st = c.cores || {};
      return `<div class="core-cable" onclick="CoreMap.openCable(${c.id})">
        <div style="font-weight:800;font-size:13px;">${esc(cableTitle(c))}</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;">
          ${st.total || 0} core · aktif ${st.active || 0} · idle ${st.idle || 0} · rusak ${st.damaged || 0}
        </div>
      </div>`;
    }).join('');
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
      await loadCables();
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
