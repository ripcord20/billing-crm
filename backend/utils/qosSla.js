'use strict';

/** SLA defaults for billing / VoIP / realtime. */
const DEFAULTS = {
  rttMs: 150,
  rttWarnMs: 100,
  lossPct: 1,
  lossWarnPct: 0.5,
  jitterMs: 30,
  jitterWarnMs: 20,
  bandwidthWarnPct: 80,
  bandwidthCritPct: 95,
  authWindowMin: 15,
  authFailPerIp: 10,
  authFailTotal: 20,
  anomalyMultiplier: 3,
  publicDns: ['8.8.8.8', '1.1.1.1'],
  dnsProbeHost: 'google.com',
  dnsWarnMs: 80,
  dnsCritMs: 200,
  uplinkMbps: 1000
};

function toNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseServerList(raw, fallback = []) {
  if (Array.isArray(raw)) {
    const list = raw.map((s) => String(s || '').trim()).filter(Boolean);
    return list.length ? list : fallback.slice();
  }
  if (typeof raw !== 'string') return fallback.slice();
  const list = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  return list.length ? list : fallback.slice();
}

/** Mean consecutive difference of RTT samples (ms). */
function computeJitter(samples) {
  const vals = (samples || [])
    .map((s) => (s && typeof s === 'object' ? s.ms : s))
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (vals.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < vals.length; i++) sum += Math.abs(vals[i] - vals[i - 1]);
  return Math.round((sum / (vals.length - 1)) * 100) / 100;
}

function classifyGauge(value, warnAt, critAt) {
  const v = Number(value);
  if (!Number.isFinite(v)) return { status: 'unknown', value: null };
  if (v >= critAt) return { status: 'critical', value: v };
  if (v >= warnAt) return { status: 'warn', value: v };
  return { status: 'ok', value: v };
}

function classifyRtt(ms, thresholds = DEFAULTS) {
  return classifyGauge(ms, thresholds.rttWarnMs, thresholds.rttMs);
}

function classifyLoss(pct, thresholds = DEFAULTS) {
  return classifyGauge(pct, thresholds.lossWarnPct, thresholds.lossPct);
}

function classifyJitter(ms, thresholds = DEFAULTS) {
  return classifyGauge(ms, thresholds.jitterWarnMs, thresholds.jitterMs);
}

function classifyBandwidth(usedBps, capBps, thresholds = DEFAULTS) {
  const used = Number(usedBps);
  const cap = Number(capBps);
  if (!Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0) {
    return { status: 'unknown', value: null, pct: null, used: used || 0, cap: cap || 0 };
  }
  const pct = Math.round((used / cap) * 10000) / 100;
  const g = classifyGauge(pct, thresholds.bandwidthWarnPct, thresholds.bandwidthCritPct);
  return { ...g, pct, used, cap };
}

function classifyAuthFails({ perIpCounts, total } = {}, thresholds = DEFAULTS) {
  const spikes = Object.entries(perIpCounts || {})
    .filter(([, n]) => Number(n) >= thresholds.authFailPerIp)
    .map(([ip, count]) => ({ ip, count: Number(count) }))
    .sort((a, b) => b.count - a.count);
  const totalN = Number(total) || 0;
  let status = 'ok';
  if (spikes.length || totalN >= thresholds.authFailTotal) {
    status = (totalN >= thresholds.authFailTotal * 2
      || spikes.some((s) => s.count >= thresholds.authFailPerIp * 2))
      ? 'critical'
      : 'warn';
  }
  return { status, spikes, total: totalN };
}

function classifyTrafficAnomaly(current, baseline, thresholds = DEFAULTS) {
  const c = Number(current);
  const b = Number(baseline);
  if (!Number.isFinite(c) || !Number.isFinite(b) || b <= 0) {
    return { status: 'unknown', ratio: null, current: c || 0, baseline: b || 0 };
  }
  const ratio = Math.round((c / b) * 100) / 100;
  let status = 'ok';
  if (ratio >= thresholds.anomalyMultiplier * 1.5) status = 'critical';
  else if (ratio >= thresholds.anomalyMultiplier) status = 'warn';
  return { status, ratio, current: c, baseline: b };
}

function classifyDns({ ok, latencyMs, accurate } = {}, thresholds = DEFAULTS) {
  if (!ok) {
    return { status: 'critical', value: latencyMs ?? null, accurate: false };
  }
  if (accurate === false) {
    return { status: 'critical', value: latencyMs ?? null, accurate: false };
  }
  return { ...classifyGauge(latencyMs, thresholds.dnsWarnMs, thresholds.dnsCritMs), accurate: true };
}

function alertAudience(type) {
  const map = {
    qos_latency: 'tech',
    qos_packet_loss: 'tech',
    qos_jitter: 'tech',
    dns_degraded: 'tech',
    bandwidth_bottleneck: 'tech',
    bandwidth_upsell: 'sales',
    auth_fail: 'security',
    ddos_anomaly: 'security'
  };
  return map[type] || 'tech';
}

function alertRoles(type) {
  return alertAudience(type) === 'sales'
    ? ['admin', 'superadmin', 'finance']
    : ['admin', 'superadmin', 'noc'];
}

function worstStatus(statuses) {
  const s = (statuses || []).filter(Boolean);
  if (s.includes('critical')) return 'critical';
  if (s.includes('warn')) return 'warn';
  if (s.includes('ok')) return 'ok';
  return 'unknown';
}

function parseMs(raw) {
  if (raw == null || raw === '') return null;
  const n = parseFloat(String(raw).replace(/ms/i, '').trim());
  return Number.isFinite(n) ? n : null;
}

/** Parse hasil /tool/ping MikroTik (REST atau binary) jadi rtt/loss/samples. */
function parseMikrotikPing(pr) {
  const rows = Array.isArray(pr) ? pr : (pr ? [pr] : []);
  const times = [];
  let sent = 0;
  let received = 0;
  for (const p of rows) {
    if (!p || typeof p !== 'object') continue;
    if ((p.sent != null || p['packet-sent'] != null) && p.received != null && rows.length === 1) {
      sent = Number(p.sent || p['packet-sent']) || 0;
      received = Number(p.received) || 0;
      const avg = parseMs(p['avg-rtt'] || p.avg || p['rtt-avg']);
      const lossN = sent ? Math.round((1 - received / sent) * 10000) / 100 : 100;
      return {
        success: received > 0,
        rtt_avg: avg,
        loss: lossN,
        pings: avg != null ? [{ ms: avg }] : []
      };
    }
    sent += 1;
    const st = String(p.status || '').toLowerCase();
    const ms = parseMs(p.time || p['response-time'] || p.ms || p.rtt);
    const ok = (+p.received > 0)
      || (ms != null && !st.includes('timeout') && !st.includes('fail'))
      || st === 'ok' || st.includes('reply');
    if (ok && ms != null) {
      received += 1;
      times.push(ms);
    }
  }
  const loss = sent ? Math.round((1 - received / sent) * 10000) / 100 : 100;
  const rtt_avg = times.length
    ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100
    : null;
  return { success: received > 0, rtt_avg, loss, pings: times.map((ms) => ({ ms })) };
}

function deviceCanApiProbe(device) {
  if (!device || !device.api_username) return false;
  const mon = device.monitoring_type || 'snmp';
  return mon === 'api' || mon === 'both';
}

function metricDeviceId(row) {
  if (!row) return null;
  if (row.device_id != null && row.device_id !== '') return Number(row.device_id);
  const meta = row.metadata || {};
  if (meta.device_id != null && meta.device_id !== '') return Number(meta.device_id);
  return null;
}

function latestForDevice(rows, deviceId) {
  const list = rows || [];
  if (deviceId == null || deviceId === '' || deviceId === 'all') return list[0] || null;
  const id = Number(deviceId);
  return list.find((r) => metricDeviceId(r) === id) || null;
}

function rollupMax(values) {
  const vals = (values || []).map(Number).filter((n) => Number.isFinite(n));
  if (!vals.length) return null;
  return Math.round(Math.max(...vals) * 100) / 100;
}

function emptyCard() {
  return { status: 'unknown', value: null, target: null, recorded_at: null, device_id: null };
}

function cardFromMetric(row) {
  if (!row) return emptyCard();
  return {
    status: row.status || 'unknown',
    value: row.value == null ? null : Number(row.value),
    target: row.target || null,
    recorded_at: row.recorded_at || null,
    device_id: metricDeviceId(row)
  };
}

function mergeSettings(raw = {}) {
  return {
    ...DEFAULTS,
    rttMs: toNum(raw.rttMs ?? raw.qos_rtt_ms, DEFAULTS.rttMs),
    rttWarnMs: toNum(raw.rttWarnMs ?? raw.qos_rtt_warn_ms, DEFAULTS.rttWarnMs),
    lossPct: toNum(raw.lossPct ?? raw.qos_loss_pct, DEFAULTS.lossPct),
    lossWarnPct: toNum(raw.lossWarnPct ?? raw.qos_loss_warn_pct, DEFAULTS.lossWarnPct),
    jitterMs: toNum(raw.jitterMs ?? raw.qos_jitter_ms, DEFAULTS.jitterMs),
    jitterWarnMs: toNum(raw.jitterWarnMs ?? raw.qos_jitter_warn_ms, DEFAULTS.jitterWarnMs),
    bandwidthWarnPct: toNum(raw.bandwidthWarnPct ?? raw.qos_bw_warn_pct, DEFAULTS.bandwidthWarnPct),
    bandwidthCritPct: toNum(raw.bandwidthCritPct ?? raw.qos_bw_crit_pct, DEFAULTS.bandwidthCritPct),
    authWindowMin: toNum(raw.authWindowMin ?? raw.qos_auth_window_min, DEFAULTS.authWindowMin),
    authFailPerIp: toNum(raw.authFailPerIp ?? raw.qos_auth_fail_ip, DEFAULTS.authFailPerIp),
    authFailTotal: toNum(raw.authFailTotal ?? raw.qos_auth_fail_total, DEFAULTS.authFailTotal),
    anomalyMultiplier: toNum(raw.anomalyMultiplier ?? raw.qos_anomaly_multiplier, DEFAULTS.anomalyMultiplier),
    dnsProbeHost: String(raw.dnsProbeHost ?? raw.qos_dns_probe_host ?? DEFAULTS.dnsProbeHost).trim() || DEFAULTS.dnsProbeHost,
    dnsWarnMs: toNum(raw.dnsWarnMs ?? raw.qos_dns_warn_ms, DEFAULTS.dnsWarnMs),
    dnsCritMs: toNum(raw.dnsCritMs ?? raw.qos_dns_crit_ms, DEFAULTS.dnsCritMs),
    uplinkMbps: toNum(raw.uplinkMbps ?? raw.qos_uplink_mbps, DEFAULTS.uplinkMbps),
    publicDns: parseServerList(raw.publicDns ?? raw.qos_public_dns, DEFAULTS.publicDns),
    ispDns: parseServerList(raw.ispDns ?? raw.qos_isp_dns, []),
    pingTargets: parseServerList(raw.pingTargets ?? raw.qos_ping_targets, DEFAULTS.publicDns)
  };
}

const SETTING_KEYS = [
  'qos_rtt_ms', 'qos_rtt_warn_ms',
  'qos_loss_pct', 'qos_loss_warn_pct',
  'qos_jitter_ms', 'qos_jitter_warn_ms',
  'qos_bw_warn_pct', 'qos_bw_crit_pct',
  'qos_auth_window_min', 'qos_auth_fail_ip', 'qos_auth_fail_total',
  'qos_anomaly_multiplier',
  'qos_dns_probe_host', 'qos_dns_warn_ms', 'qos_dns_crit_ms',
  'qos_uplink_mbps', 'qos_public_dns', 'qos_isp_dns', 'qos_ping_targets'
];

function settingsToRows(settings) {
  const s = mergeSettings(settings);
  return {
    qos_rtt_ms: String(s.rttMs),
    qos_rtt_warn_ms: String(s.rttWarnMs),
    qos_loss_pct: String(s.lossPct),
    qos_loss_warn_pct: String(s.lossWarnPct),
    qos_jitter_ms: String(s.jitterMs),
    qos_jitter_warn_ms: String(s.jitterWarnMs),
    qos_bw_warn_pct: String(s.bandwidthWarnPct),
    qos_bw_crit_pct: String(s.bandwidthCritPct),
    qos_auth_window_min: String(s.authWindowMin),
    qos_auth_fail_ip: String(s.authFailPerIp),
    qos_auth_fail_total: String(s.authFailTotal),
    qos_anomaly_multiplier: String(s.anomalyMultiplier),
    qos_dns_probe_host: s.dnsProbeHost,
    qos_dns_warn_ms: String(s.dnsWarnMs),
    qos_dns_crit_ms: String(s.dnsCritMs),
    qos_uplink_mbps: String(s.uplinkMbps),
    qos_public_dns: s.publicDns.join(', '),
    qos_isp_dns: s.ispDns.join(', '),
    qos_ping_targets: s.pingTargets.join(', ')
  };
}

module.exports = {
  DEFAULTS,
  SETTING_KEYS,
  toNum,
  parseServerList,
  computeJitter,
  classifyGauge,
  classifyRtt,
  classifyLoss,
  classifyJitter,
  classifyBandwidth,
  classifyAuthFails,
  classifyTrafficAnomaly,
  classifyDns,
  alertAudience,
  alertRoles,
  mergeSettings,
  settingsToRows,
  worstStatus,
  parseMs,
  parseMikrotikPing,
  deviceCanApiProbe,
  metricDeviceId,
  latestForDevice,
  rollupMax,
  emptyCard,
  cardFromMetric
};
