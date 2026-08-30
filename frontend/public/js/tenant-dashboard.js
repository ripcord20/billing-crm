const TenantDash = {
  chart: null,
  donut: null,

  init() {
    const now = new Date();
    const monthEl = document.getElementById('todMonth');
    const yearEl = document.getElementById('todYear');
    const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    monthEl.innerHTML = months.map((n, i) =>
      `<option value="${i + 1}" ${i + 1 === now.getMonth() + 1 ? 'selected' : ''}>${n}</option>`
    ).join('');
    const y = now.getFullYear();
    yearEl.innerHTML = [y - 1, y, y + 1].map((n) =>
      `<option value="${n}" ${n === y ? 'selected' : ''}>${n}</option>`
    ).join('');
    this.load();
    window.addEventListener('themechange', () => this.load());
  },

  rupiah(n) {
    return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  },

  async load() {
    const month = document.getElementById('todMonth')?.value;
    const year = document.getElementById('todYear')?.value;
    const params = new URLSearchParams();
    if (month) params.set('month', month);
    if (year) params.set('year', year);
    const q = window.location.search;
    if (q.includes('tenant_id=')) {
      const tid = new URLSearchParams(q).get('tenant_id');
      if (tid) params.set('tenant_id', tid);
    }
    const d = await App.api('/tenant/dashboard?' + params.toString());
    if (!d?.success || !d.data) {
      document.getElementById('todSub').textContent = d?.message || 'Belum ada data tenant';
      return;
    }
    this.render(d.data);
  },

  render(data) {
    const t = data.tenant || {};
    const k = data.kpis || {};
    document.getElementById('todTitle').textContent = t.name || 'Dashboard';
    const nCust = k.customers || 0;
    document.getElementById('todSub').textContent =
      (t.status === 'suspended' ? 'Akun ditangguhkan · ' : '') +
      (nCust
        ? `${nCust} pelanggan · ${k.tx_count || 0} transaksi periode ini`
        : 'Belum ada pelanggan — buat paket, lalu tambah pelanggan di menu Billing');
    const start = document.getElementById('todStart');
    if (start) start.style.display = nCust ? 'none' : '';

    document.getElementById('todKpiBiz').innerHTML = [
      this.kpi('Pelanggan', k.customers, 'Semua status'),
      this.kpi('Aktif', k.active, 'Sedang berlangganan', 'ok'),
      this.kpi('Isolir', k.isolated, 'Perlu perhatian', k.isolated ? 'warn' : ''),
      this.kpi('Paket terpakai', k.packages, 'Jenis paket berbeda')
    ].join('');

    document.getElementById('todKpiBill').innerHTML = [
      this.kpi('Tagihan', this.rupiah(k.billed), (k.invoices || 0) + ' invoice'),
      this.kpi('Penerimaan', this.rupiah(k.received), (k.tx_count || 0) + ' transaksi', 'ok'),
      this.kpi('Belum lunas', this.rupiah(k.outstanding), (k.unpaid_count || 0) + ' invoice', k.outstanding ? 'warn' : ''),
      this.kpi('Janji hutang', k.deferral_open || 0, (k.deferral_overdue || 0) + ' lewat janji', k.deferral_overdue ? 'warn' : '')
    ].join('');

    this.renderChart(data.daily || [], data.period);
    this.renderDonut(data.methods || []);
    this.renderOverdue(data.overdue || []);
    this.renderRecent(data.recent || []);
  },

  kpi(label, value, sub, tone) {
    return `<div class="tod-kpi ${tone || ''}">
      <div class="tod-kpi-label">${label}</div>
      <div class="tod-kpi-value">${value}</div>
      <div class="tod-kpi-sub">${sub || ''}</div>
    </div>`;
  },

  renderChart(daily, period) {
    const theme = App.chartTheme();
    const daysInMonth = new Date(period.year, period.month, 0).getDate();
    const byDate = {};
    daily.forEach((r) => { byDate[String(r.date).slice(0, 10)] = r.total; });
    const cats = [];
    const series = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${period.year}-${String(period.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cats.push(String(d));
      series.push(byDate[key] || 0);
    }
    const total = series.reduce((a, b) => a + b, 0);
    document.getElementById('todChartSub').textContent = this.rupiah(total);
    const opt = {
      chart: { type: 'area', height: 220, toolbar: { show: false }, fontFamily: 'DM Sans, sans-serif', background: 'transparent' },
      series: [{ name: 'Penerimaan', data: series }],
      colors: [theme.primary],
      stroke: { curve: 'smooth', width: 2.5 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 90, 100] } },
      dataLabels: { enabled: false },
      grid: { borderColor: theme.gridColor, strokeDashArray: 4 },
      xaxis: { categories: cats, labels: { style: { colors: theme.foreColor, fontSize: '10px' }, rotate: 0, hideOverlappingLabels: true } },
      yaxis: { labels: { style: { colors: theme.foreColor, fontSize: '11px' }, formatter: (v) => (v >= 1000000 ? (v / 1000000).toFixed(1) + 'jt' : (v >= 1000 ? Math.round(v / 1000) + 'rb' : String(v))) } },
      tooltip: { theme: theme.tooltipTheme, y: { formatter: (v) => this.rupiah(v) } },
      theme: { mode: theme.isDark ? 'dark' : 'light' }
    };
    if (this.chart) { this.chart.updateOptions(opt); this.chart.updateSeries(opt.series); }
    else { this.chart = new ApexCharts(document.getElementById('todChart'), opt); this.chart.render(); }
  },

  renderDonut(methods) {
    const theme = App.chartTheme();
    const labels = methods.map((m) => m.method || 'lain');
    const series = methods.map((m) => m.total);
    const el = document.getElementById('todDonutLegend');
    if (!methods.length) {
      el.innerHTML = '<div class="tod-empty">Belum ada pembayaran periode ini</div>';
      if (this.donut) { this.donut.destroy(); this.donut = null; }
      return;
    }
    el.innerHTML = methods.map((m) =>
      `<div class="tod-leg-row"><span>${m.method}</span><strong>${this.rupiah(m.total)}</strong></div>`
    ).join('');
    const opt = {
      chart: { type: 'donut', height: 200, fontFamily: 'DM Sans, sans-serif', background: 'transparent' },
      series, labels,
      colors: [theme.primary, theme.accent, theme.orange, theme.success, theme.warning],
      legend: { show: false },
      dataLabels: { enabled: false },
      stroke: { width: 0 },
      tooltip: { theme: theme.tooltipTheme, y: { formatter: (v) => this.rupiah(v) } },
      theme: { mode: theme.isDark ? 'dark' : 'light' }
    };
    if (this.donut) { this.donut.updateOptions(opt); this.donut.updateSeries(series); }
    else { this.donut = new ApexCharts(document.getElementById('todDonut'), opt); this.donut.render(); }
  },

  renderOverdue(rows) {
    const tb = document.getElementById('todOverdue');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="4"><div class="tod-empty">Tidak ada tagihan tertunggak di periode ini</div></td></tr>';
      return;
    }
    tb.innerHTML = rows.map((r) => `<tr>
      <td><div class="tod-name">${this.esc(r.name)}</div><div class="tod-cid">${this.esc(r.cid)}</div></td>
      <td>${this.esc(r.invoice_number || '–')}</td>
      <td class="tod-amt">${this.rupiah(r.total)}</td>
      <td>${r.due_date ? new Date(r.due_date + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '–'}</td>
    </tr>`).join('');
  },

  renderRecent(rows) {
    const tb = document.getElementById('todRecent');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="4"><div class="tod-empty">Belum ada pembayaran</div></td></tr>';
      return;
    }
    tb.innerHTML = rows.map((r) => `<tr>
      <td><div class="tod-name">${this.esc(r.name)}</div><div class="tod-cid">${this.esc(r.cid)}</div></td>
      <td>${r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '–'}</td>
      <td>${this.esc(r.method || '–')}</td>
      <td class="tod-amt">${this.rupiah(r.amount)}</td>
    </tr>`).join('');
  },

  esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};

document.addEventListener('DOMContentLoaded', () => TenantDash.init());
