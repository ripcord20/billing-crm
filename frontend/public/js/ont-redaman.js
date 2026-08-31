/* Riwayat Redaman ONT — /monitoring/ont-redaman */
(function () {
  const $ = (id) => document.getElementById(id);
  let rows = [];
  let severity = '';
  let selectedId = null;
  let searchTimer = null;
  let chartPoints = [];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtTime(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function sparkSvg(vals) {
    if (!vals || vals.length < 2) return '<span style="color:#94a3b8">—</span>';
    const w = 72, h = 22, pad = 2;
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const span = (max - min) || 1;
    const pts = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    const last = vals[vals.length - 1];
    const color = last >= -24 ? '#16a34a' : last >= -27 ? '#d97706' : '#dc2626';
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${color}" stroke-width="1.6" points="${pts}"/></svg>`;
  }

  function drawChart(points) {
    const canvas = $('rdChart');
    const empty = $('rdChartEmpty');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const wrap = $('rdChartWrap');
    const w = wrap.clientWidth - 16;
    const h = wrap.clientHeight - 16;
    canvas.width = Math.max(200, w) * (window.devicePixelRatio || 1);
    canvas.height = Math.max(120, h) * (window.devicePixelRatio || 1);
    canvas.style.width = Math.max(200, w) + 'px';
    canvas.style.height = Math.max(120, h) + 'px';
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!points || points.length < 2) {
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';
    const vals = points.map((p) => p.rx);
    const min = Math.min(-30, Math.min.apply(null, vals) - 1);
    const max = Math.max(-8, Math.max.apply(null, vals) + 1);
    const span = max - min;
    const left = 36, right = 8, top = 10, bottom = 18;
    const iw = w - left - right, ih = h - top - bottom;
    function xy(i, v) {
      const x = left + (i / (vals.length - 1)) * iw;
      const y = top + (1 - (v - min) / span) * ih;
      return [x, y];
    }
    function band(from, to, color) {
      const y1 = top + (1 - (from - min) / span) * ih;
      const y2 = top + (1 - (to - min) / span) * ih;
      ctx.fillStyle = color;
      ctx.fillRect(left, Math.min(y1, y2), iw, Math.abs(y2 - y1));
    }
    band(-24, max, 'rgba(22,163,74,.08)');
    band(-27, -24, 'rgba(217,119,6,.10)');
    band(min, -27, 'rgba(220,38,38,.08)');
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + ih);
    ctx.lineTo(left + iw, top + ih);
    ctx.stroke();
    ctx.font = '10px Plus Jakarta Sans, sans-serif';
    ctx.fillStyle = '#94a3b8';
    [-27, -24, -15].forEach((tick) => {
      if (tick < min || tick > max) return;
      const y = top + (1 - (tick - min) / span) * ih;
      ctx.fillText(tick + '', 4, y + 3);
    });
    ctx.beginPath();
    vals.forEach((v, i) => {
      const [x, y] = xy(i, v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const last = vals[vals.length - 1];
    ctx.strokeStyle = last >= -24 ? '#16a34a' : last >= -27 ? '#d97706' : '#dc2626';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function renderStats(stats) {
    $('st-total').textContent = stats.total ?? 0;
    $('st-critical').textContent = stats.critical ?? 0;
    $('st-warning').textContent = stats.warning ?? 0;
    $('st-good').textContent = stats.good ?? 0;
    $('st-hot').textContent = stats.hot ?? 0;
  }

  function renderTable() {
    const body = $('rdBody');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="rd-empty">Belum ada data redaman. Sinkronkan ONT dari GenieACS dulu.</div></td></tr>';
      return;
    }
    body.innerHTML = rows.map((r) => {
      const rx = r.rx_power == null || Number.isNaN(r.rx_power) ? '—' : Number(r.rx_power).toFixed(2);
      const sel = r.id === selectedId ? 'sel' : '';
      return `<tr class="${sel}" onclick="OntRedaman.select(${r.id})">
        <td class="mono">${esc(r.serial_number)}</td>
        <td>${esc(r.customer_name || '—')}</td>
        <td class="mono">${rx}</td>
        <td><span class="pill ${esc(r.severity)}">${esc(r.severity_label)}</span></td>
        <td>${sparkSvg(r.sparkline)}</td>
        <td style="color:#64748b;font-size:12px">${fmtTime(r.last_recorded)}</td>
      </tr>`;
    }).join('');
  }

  async function refresh() {
    const btn = $('rdRefreshBtn');
    btn?.classList.add('spin');
    const q = encodeURIComponent(($('rdSearch').value || '').trim());
    const hours = $('rdHours').value || 24;
    const sev = severity ? `&severity=${encodeURIComponent(severity)}` : '';
    try {
      const r = await fetch(`/api/genieacs/ont-redaman?q=${q}&hours=${hours}${sev}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Gagal memuat');
      rows = j.data || [];
      renderStats(j.stats || {});
      renderTable();
      if (selectedId && rows.some((x) => x.id === selectedId)) select(selectedId);
    } catch (e) {
      $('rdBody').innerHTML = `<tr><td colspan="6"><div class="rd-empty">${esc(e.message)}</div></td></tr>`;
    } finally {
      btn?.classList.remove('spin');
    }
  }

  function setSeverity(sev, el) {
    severity = sev || '';
    document.querySelectorAll('.rd-card').forEach((c) => c.classList.remove('active'));
    el?.classList.add('active');
    refresh();
  }

  function debounceSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refresh, 280);
  }

  async function select(id) {
    selectedId = id;
    renderTable();
    const row = rows.find((x) => x.id === id);
    $('rdSideTitle').textContent = row ? (row.serial_number || 'ONT') : 'ONT';
    $('rdSideSub').textContent = row
      ? `${row.customer_name || 'Belum assign'} · ${row.severity_label || ''}`
      : '';
    $('rdSideActions').style.display = 'flex';
    const href = row?.device_id
      ? `/genieacs?sn=${encodeURIComponent(row.serial_number || '')}`
      : '/genieacs';
    $('rdGenieLink').href = href;
    const hours = $('rdHours').value || 24;
    try {
      const r = await fetch(`/api/genieacs/ont-redaman/${id}/history?hours=${hours}`);
      const j = await r.json();
      chartPoints = j.data || [];
      drawChart(chartPoints);
    } catch (_) {
      chartPoints = (row?.sparkline || []).map((rx) => ({ rx }));
      drawChart(chartPoints);
    }
  }

  window.addEventListener('resize', () => { if (chartPoints.length) drawChart(chartPoints); });
  document.addEventListener('DOMContentLoaded', refresh);

  window.OntRedaman = { refresh, setSeverity, debounceSearch, select, scanAlarms };

  async function scanAlarms() {
    const btn = $('rdScanAlarmBtn');
    if (btn) { btn.disabled = true; btn.classList.add('spin'); }
    try {
      const r = await App.api('/alarms/scan', { method: 'POST', body: '{}' });
      const n = (r.data && r.data.created && r.data.created.length) || 0;
      alert(n ? (n + ' tiket alarm dibuat') : (r.message || 'Tidak ada alarm baru'));
      if (n) window.location.href = '/tickets';
    } catch (e) {
      alert(e.message || 'Gagal scan alarm');
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('spin'); }
    }
  }
})();
