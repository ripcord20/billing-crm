// ============================================================
// Content Monitoring — traffic per provider / kategori / web
// + top destination dari connection tracking MikroTik.
// ============================================================
(function () {
  let mode = 'provider';
  let lastSummary = null;
  let donut = null;
  let busy = false;
  let hasDevice = false;

  const WEB_PALETTE = [
    '#1d4ed8','#0ea5e9','#ef4444','#f59e0b','#10b981','#6366f1',
    '#ec4899','#14b8a6','#f97316','#8b5cf6','#22c55e','#eab308'
  ];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n >= 1e12) return (n / 1e12).toFixed(1) + ' TB';
    if (n >= 1e9)  return (n / 1e9).toFixed(1) + ' GB';
    if (n >= 1e6)  return (n / 1e6).toFixed(1) + ' MB';
    if (n >= 1e3)  return (n / 1e3).toFixed(1) + ' KB';
    return Math.round(n) + ' B';
  }
  function deviceId() {
    return (window.MikrotikSelector && MikrotikSelector.getSelectedId()) || '';
  }
  async function api(path) {
    if (typeof App !== 'undefined' && typeof App.api === 'function') {
      return App.api(path);
    }
    const res = await fetch('/api' + path, { credentials: 'include', headers: { Accept: 'application/json' } });
    return res.json();
  }

  function setChip(state, txt) {
    const chip = $('cmLiveChip');
    if (!chip) return;
    chip.className = 'live-chip chip-' + state;
    const t = $('cmLiveChipTxt');
    if (t) t.textContent = txt;
  }

  function setBusy(on) {
    busy = !!on;
    const btn = $('cmRefreshBtn');
    if (btn) btn.classList.toggle('spin', busy);
    if (on) setChip('busy', 'Memuat');
    else if (hasDevice) setChip('live', 'Live');
    else setChip('idle', 'Idle');
  }

  function failTraffic(msg, hint) {
    const empty = $('tsEmpty');
    const content = $('tsContent');
    if (empty) {
      empty.innerHTML = esc(msg) + (hint ? '<span class="cm-hint">' + hint + '</span>' : '');
      empty.style.display = '';
    }
    if (content) content.style.display = 'none';
    const sub = $('tsSub');
    if (sub) sub.textContent = '';
  }

  function destLoading() {
    const body = $('tdBody');
    if (body) body.innerHTML = '<tr><td colspan="3"><div class="cm-skel"></div></td></tr>';
  }

  function destEmpty(msg) {
    const body = $('tdBody');
    if (body) {
      body.innerHTML = '<tr><td colspan="3"><div class="cm-empty" style="padding:22px 8px">' + esc(msg) + '</div></td></tr>';
    }
  }

  function donutOptions(series, labels, colors) {
    return {
      chart: {
        type: 'donut', width: '100%', height: 200,
        parentHeightOffset: 0, animations: { enabled: true }
      },
      series: series, labels: labels, colors: colors,
      stroke: { width: 2, colors: ['#fff'] },
      plotOptions: { pie: { donut: { size: '72%' }, expandOnClick: false } },
      dataLabels: { enabled: false },
      legend: { show: false },
      grid: { padding: { top: 0, right: 0, bottom: 0, left: 0 } },
      tooltip: { y: { formatter: function (v) { return fmtBytes(v); } } },
      responsive: [{ breakpoint: 640, options: { chart: { height: 180 } } }]
    };
  }

  function renderDonut(series, labels, colors) {
    const el = $('tsDonut');
    if (!el || typeof ApexCharts === 'undefined') return;
    const opts = donutOptions(series, labels, colors);
    if (!donut) {
      donut = new ApexCharts(el, opts);
      donut.render();
    } else {
      donut.updateOptions(opts, true, true);
    }
  }

  window.cmSetMode = function (next) {
    mode = next;
    ['provider', 'category', 'web'].forEach(function (m) {
      const map = { provider: 'tsTabProvider', category: 'tsTabCategory', web: 'tsTabWeb' };
      const el = $(map[m]);
      if (el) el.classList.toggle('active', m === next);
    });
    if (lastSummary) renderSummary(lastSummary);
  };

  function renderSummary(j) {
    lastSummary = j;
    const empty = $('tsEmpty');
    const content = $('tsContent');
    const sub = $('tsSub');
    const list = $('tsList');
    if (!empty || !content) return;

    if (!j || !j.success) {
      return failTraffic(j && j.message ? j.message : 'Gagal memuat summary traffic');
    }
    if (!j.available) {
      return failTraffic(
        'Connection tracking tidak aktif di router ini',
        'Aktifkan di Winbox: IP → Firewall → Connections → Tracking → Enabled: yes<br>' +
        'Atau Terminal: <code>/ip firewall connection tracking set enabled=yes</code>'
      );
    }

    if (mode === 'web') {
      let web = (j.web || []).slice();
      if (!web.length) {
        return failTraffic(
          'Belum ada domain terdeteksi.',
          'Pastikan router jadi DNS server klien (allow-remote-requests=yes), atau tunggu reverse DNS.'
        );
      }
      web = web.map(function (d, i) {
        return Object.assign({}, d, { color: WEB_PALETTE[i % WEB_PALETTE.length] });
      });
      const webTotal = web.reduce(function (s, d) { return s + (d.bytes || 0); }, 0);
      empty.style.display = 'none';
      content.style.display = 'flex';
      if (sub) {
        const src = j.webSource === 'reverse-dns' ? 'reverse DNS' : 'DNS cache';
        sub.textContent = web.length + ' domain · ' + fmtBytes(webTotal) + ' · ' + src;
      }
      $('tsTotalVal').textContent = fmtBytes(webTotal);
      renderDonut(
        web.map(function (d) { return d.bytes || 0; }),
        web.map(function (d) { return d.domain; }),
        web.map(function (d) { return d.color; })
      );
      list.innerHTML = web.map(function (d) {
        return '<div class="cm-row">' +
          '<span class="cm-dot" style="background:' + d.color + '"></span>' +
          '<span class="cm-name">' + esc(d.domain) +
            '<span class="cm-cat"> · ' + (d.connections || 0).toLocaleString('id-ID') + ' koneksi</span></span>' +
          '<span class="cm-pct">' + (d.pct != null ? d.pct : 0) + '%</span>' +
          '<span class="cm-bytes">' + fmtBytes(d.bytes || 0) + '</span>' +
        '</div>';
      }).join('');
      return;
    }

    let rows = (mode === 'category' ? j.categories : j.providers) || [];
    rows = rows.filter(function (r) {
      const nm = mode === 'category' ? r.category : r.name;
      return nm !== 'Lainnya';
    });
    if (!rows.length) {
      return failTraffic('Belum ada traffic provider terklasifikasi');
    }
    const classifiedTotal = rows.reduce(function (s, r) { return s + (r.bytes || 0); }, 0);
    rows = rows.map(function (r) {
      return Object.assign({}, r, {
        pct: classifiedTotal > 0 ? Math.round(((r.bytes || 0) / classifiedTotal) * 1000) / 10 : 0
      });
    });

    empty.style.display = 'none';
    content.style.display = 'flex';
    if (sub) {
      sub.textContent = (j.totalConnections || 0).toLocaleString('id-ID') +
        ' koneksi · ' + fmtBytes(classifiedTotal) + ' terklasifikasi';
    }
    $('tsTotalVal').textContent = fmtBytes(classifiedTotal);
    renderDonut(
      rows.map(function (r) { return r.bytes || 0; }),
      rows.map(function (r) { return mode === 'category' ? r.category : r.name; }),
      rows.map(function (r) { return r.color || '#94a3b8'; })
    );
    list.innerHTML = rows.map(function (r) {
      const nm = mode === 'category' ? r.category : r.name;
      const catLine = mode === 'provider' && r.category
        ? '<span class="cm-cat"> · ' + esc(r.category) + '</span>' : '';
      return '<div class="cm-row">' +
        '<span class="cm-dot" style="background:' + (r.color || '#94a3b8') + '"></span>' +
        '<span class="cm-name">' + esc(nm) + catLine + '</span>' +
        '<span class="cm-pct">' + (r.pct != null ? r.pct : 0) + '%</span>' +
        '<span class="cm-bytes">' + fmtBytes(r.bytes || 0) + '</span>' +
      '</div>';
    }).join('');
  }

  function renderDest(j) {
    const body = $('tdBody');
    if (!body) return;
    if (!j || !j.success) {
      return destEmpty(j && j.message ? j.message : 'Gagal memuat top destination');
    }
    if (!j.available) {
      return destEmpty('Connection tracking tidak aktif di router ini');
    }
    const rows = j.data || [];
    if (!rows.length) return destEmpty('Belum ada koneksi tujuan publik');
    body.innerHTML = rows.map(function (r, i) {
      const host = r.hostname ? '<div class="cm-ptr">' + esc(r.hostname) + '</div>' : '';
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td><div class="cm-host">' + esc(r.dst) + '</div>' + host + '</td>' +
        '<td class="cm-col-extra cm-meta">' + fmtBytes(r.bytes || 0) +
          '<div>' + (r.connections || 0) + ' koneksi</div></td>' +
      '</tr>';
    }).join('');
  }

  async function refresh() {
    if (busy) return;
    const id = deviceId();
    if (!id) {
      hasDevice = false;
      setChip('idle', 'Idle');
      failTraffic(
        'Belum ada MikroTik terdaftar',
        'Tambahkan router di <a href="/devices">Device Management</a>.'
      );
      destEmpty('Pilih MikroTik untuk melihat tujuan traffic');
      return;
    }
    hasDevice = true;
    setBusy(true);
    destLoading();
    try {
      const [summary, dest] = await Promise.all([
        api('/noc/router/' + id + '/traffic-summary'),
        api('/noc/router/' + id + '/top-destinations?limit=15')
      ]);
      renderSummary(summary);
      renderDest(dest);
    } catch (e) {
      failTraffic('Gagal memuat data: ' + (e.message || 'jaringan'));
      destEmpty('Gagal memuat top destination');
    } finally {
      setBusy(false);
    }
  }

  window.cmRefresh = refresh;

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.MikrotikSelector) {
      failTraffic('Selector MikroTik gagal dimuat');
      return;
    }
    MikrotikSelector.init({
      onChange: refresh,
      onReady: function (info) {
        hasDevice = !!(info && info.activeId);
        refresh();
      }
    });
  });
})();
