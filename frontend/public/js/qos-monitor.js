(function () {
  const TYPE_LABEL = {
    qos_latency: 'Latency',
    qos_packet_loss: 'Packet loss',
    qos_jitter: 'Jitter',
    dns_degraded: 'DNS',
    bandwidth_bottleneck: 'Bottleneck',
    bandwidth_upsell: 'Up-sell',
    auth_fail: 'Auth gagal',
    ddos_anomaly: 'Anomali DDoS'
  };

  let overview = null;
  let audience = '';
  let pollTimer = null;
  let settingsTouched = false;

  function fmt(n, unit, digits) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    const v = Number(n);
    return (Number.isInteger(v) ? String(v) : v.toFixed(digits == null ? 1 : digits)) + (unit || '');
  }

  function badge(status) {
    return '<span class="qos-badge ' + (status || 'ok') + '">' + (status || 'unknown') + '</span>';
  }

  function cardHtml(id, lbl, val, hint, status) {
    return '<div class="qos-card ' + (status || '') + '" data-card="' + id + '">'
      + '<div class="lbl">' + lbl + '</div>'
      + '<div class="val">' + val + '</div>'
      + '<div class="hint">' + hint + '</div></div>';
  }

  function renderCards(data) {
    const c = data.cards || {};
    const sla = data.sla || {};
    document.getElementById('qosCards').innerHTML = [
      cardHtml('latency', 'Latency RTT', fmt(c.latency && c.latency.value, ' ms'), 'SLA < ' + sla.rtt_ms + ' ms · VoIP/realtime', c.latency && c.latency.status),
      cardHtml('loss', 'Packet loss', fmt(c.packet_loss && c.packet_loss.value, '%'), 'SLA < ' + sla.loss_pct + '% · layanan kritis', c.packet_loss && c.packet_loss.status),
      cardHtml('jitter', 'Jitter', fmt(c.jitter && c.jitter.value, ' ms'), 'SLA < ' + sla.jitter_ms + ' ms · VoIP/video', c.jitter && c.jitter.status),
      cardHtml('bw', 'Bandwidth', fmt(c.bandwidth && c.bandwidth.value, '%'), 'Peringatan ≥ ' + sla.bandwidth_warn_pct + '% kapasitas', c.bandwidth && c.bandwidth.status),
      cardHtml('auth', 'Auth gagal', fmt(c.auth_fails && c.auth_fails.value, ''), 'Jendela ' + ((c.auth_fails && c.auth_fails.target) || '15m'), c.auth_fails && c.auth_fails.status),
      cardHtml('dns', 'DNS', fmt(c.dns && c.dns.value, ' ms'), c.dns && c.dns.target ? String(c.dns.target) : 'Publik vs ISP', c.dns && c.dns.status)
    ].join('');
  }

  function renderSla(settings) {
    const s = settings || {};
    document.getElementById('qosSlaChips').innerHTML = [
      '<span>RTT <b>&lt; ' + s.rttMs + ' ms</b></span>',
      '<span>Loss <b>&lt; ' + s.lossPct + '%</b></span>',
      '<span>Jitter <b>&lt; ' + s.jitterMs + ' ms</b></span>',
      '<span>Bandwidth warn <b>' + s.bandwidthWarnPct + '%</b></span>',
      '<span>DNS publik <b>' + (s.publicDns || []).join(', ') + '</b></span>',
      '<span>DNS ISP <b>' + ((s.ispDns || []).length ? s.ispDns.join(', ') : 'belum diset') + '</b></span>'
    ].join('');
  }

  function renderAlerts(list) {
    const rows = (list || []).filter((a) => !audience || a.audience === audience);
    if (!rows.length) {
      document.getElementById('qosAlerts').innerHTML = '<div class="qos-empty">Tidak ada alert terbuka.</div>';
      return;
    }
    document.getElementById('qosAlerts').innerHTML = '<table class="qos-table"><thead><tr><th>Tipe</th><th>Pesan</th><th></th></tr></thead><tbody>'
      + rows.map((a) => '<tr>'
        + '<td><span class="qos-badge ' + a.audience + '">' + (TYPE_LABEL[a.type] || a.type) + '</span><div style="margin-top:4px">' + badge(a.severity === 'critical' ? 'critical' : (a.severity === 'warning' ? 'warn' : 'ok')) + '</div></td>'
        + '<td><strong>' + esc(a.title) + '</strong><div style="color:var(--text-secondary);margin-top:3px">' + esc(a.message) + '</div></td>'
        + '<td><button class="btn btn-secondary btn-sm" type="button" data-ack="' + a.id + '">Ack</button></td>'
        + '</tr>').join('')
      + '</tbody></table>';
  }

  function renderDns(list, compare) {
    const hint = document.getElementById('qosDnsCompare');
    if (hint && compare) {
      const pub = compare.public_avg != null ? compare.public_avg + ' ms' : '—';
      const isp = compare.isp_avg != null ? compare.isp_avg + ' ms' : 'belum diukur';
      hint.textContent = 'Publik rata-rata ' + pub + ' · ISP ' + isp + (compare.winner === 'public' ? ' · publik lebih cepat' : (compare.winner === 'isp' ? ' · ISP lebih cepat' : ''));
    }
    if (!list || !list.length) {
      document.getElementById('qosDns').innerHTML = '<div class="qos-empty">Belum ada hasil probe. Klik Jalankan probe.</div>';
      return;
    }
    const seen = {};
    const unique = list.filter((d) => {
      const k = (d.group || '') + ':' + (d.server || '');
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    document.getElementById('qosDns').innerHTML = '<table class="qos-table"><thead><tr><th>Resolver</th><th>Waktu</th><th>Status</th></tr></thead><tbody>'
      + unique.map((d) => '<tr><td><strong>' + esc(d.server || '-') + '</strong><div style="color:var(--text-secondary)">' + (d.group === 'public' ? 'Publik' : (d.group === 'isp' ? 'ISP' : esc(d.group || ''))) + '</div></td><td>' + fmt(d.value, ' ms') + '</td><td>' + badge(d.status) + '</td></tr>').join('')
      + '</tbody></table>';
  }

  function renderUpsell(list) {
    if (!list || !list.length) {
      document.getElementById('qosUpsell').innerHTML = '<div class="qos-empty">Belum ada pelanggan mendekati batas paket.</div>';
      return;
    }
    document.getElementById('qosUpsell').innerHTML = '<table class="qos-table"><thead><tr><th>Pelanggan</th><th>Pakai</th></tr></thead><tbody>'
      + list.map((m) => {
        const meta = m.metadata || {};
        return '<tr><td>' + esc(meta.name || m.target) + '<div style="color:var(--text-secondary)">' + esc(meta.package || '') + '</div></td><td>' + fmt(m.value, '%') + '</td></tr>';
      }).join('')
      + '</tbody></table>';
  }

  function renderAuth(rows) {
    if (!rows || !rows.length) {
      document.getElementById('qosAuth').innerHTML = '<div class="qos-empty">Tidak ada login gagal pada jendela ini.</div>';
      return;
    }
    document.getElementById('qosAuth').innerHTML = '<table class="qos-table"><thead><tr><th>Sumber</th><th>Identitas</th><th>IP</th></tr></thead><tbody>'
      + rows.slice(0, 12).map((r) => '<tr><td>' + esc(r.source) + '</td><td>' + esc(r.identifier || '-') + '</td><td>' + esc(r.ip_address || '-') + '</td></tr>').join('')
      + '</tbody></table>';
  }

  function fillSettings(s) {
    const map = {
      'set-ispDns': (s.ispDns || []).join(', '),
      'set-publicDns': (s.publicDns || []).join(', '),
      'set-dnsProbeHost': s.dnsProbeHost || '',
      'set-pingTargets': (s.pingTargets || []).join(', '),
      'set-uplinkMbps': s.uplinkMbps,
      'set-rttMs': s.rttMs,
      'set-lossPct': s.lossPct,
      'set-jitterMs': s.jitterMs,
      'set-bandwidthWarnPct': s.bandwidthWarnPct
    };
    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = map[id] == null ? '' : map[id];
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function load(opts) {
    const silent = opts && opts.silent;
    const res = await App.api('/qos/overview');
    if (!res || !res.success) return;
    overview = res.data;
    renderSla(overview.settings);
    renderCards(overview);
    renderAlerts(overview.alerts);
    renderDns(overview.dns, overview.dns_compare);
    renderUpsell(overview.upsell);
    const settingsOpen = document.getElementById('qosSettings') && document.getElementById('qosSettings').classList.contains('open');
    if (!silent && !settingsOpen && !settingsTouched) fillSettings(overview.settings);
    const auth = await App.api('/qos/auth-fails?minutes=' + (overview.settings.authWindowMin || 15));
    renderAuth(auth && auth.success ? auth.data : []);
    const live = document.getElementById('qosLiveHint');
    if (live) live.textContent = 'Live · ' + new Date().toLocaleTimeString('id-ID');
  }

  document.addEventListener('click', async (e) => {
    const chip = e.target.closest('.qos-chip');
    if (chip) {
      audience = chip.dataset.aud || '';
      document.querySelectorAll('.qos-chip').forEach((c) => c.classList.toggle('active', c === chip));
      if (overview) renderAlerts(overview.alerts);
      return;
    }
    const ack = e.target.closest('[data-ack]');
    if (ack) {
      await App.api('/qos/alerts/' + ack.dataset.ack + '/ack', { method: 'POST' });
      await load();
    }
  });

  document.getElementById('qosSettingsBtn').addEventListener('click', () => {
    document.getElementById('qosSettings').classList.toggle('open');
  });
  document.getElementById('qosSettings').addEventListener('input', () => { settingsTouched = true; });

  document.getElementById('qosSaveSettings').addEventListener('click', async () => {
    const body = {
      qos_isp_dns: document.getElementById('set-ispDns').value,
      qos_public_dns: document.getElementById('set-publicDns').value,
      qos_dns_probe_host: document.getElementById('set-dnsProbeHost').value,
      qos_ping_targets: document.getElementById('set-pingTargets').value,
      qos_uplink_mbps: document.getElementById('set-uplinkMbps').value,
      qos_rtt_ms: document.getElementById('set-rttMs').value,
      qos_loss_pct: document.getElementById('set-lossPct').value,
      qos_jitter_ms: document.getElementById('set-jitterMs').value,
      qos_bw_warn_pct: document.getElementById('set-bandwidthWarnPct').value
    };
    const res = await App.api('/qos/settings', { method: 'PUT', body: JSON.stringify(body) });
    if (res && res.success) {
      overview.settings = res.data;
      renderSla(res.data);
      if (window.App && App.showToast) App.showToast('Ambang SLA disimpan', 'success');
    }
  });

  document.getElementById('qosRunBtn').addEventListener('click', async () => {
    const btn = document.getElementById('qosRunBtn');
    btn.disabled = true; btn.textContent = 'Memeriksa…';
    try {
      await App.api('/qos/run', { method: 'POST' });
      await load();
    } finally {
      btn.disabled = false; btn.textContent = 'Jalankan probe';
    }
  });

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => { load({ silent: true }).catch(() => {}); }, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { load(); startPoll(); });
  else { load(); startPoll(); }
})();
