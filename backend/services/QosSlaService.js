'use strict';

const { Resolver } = require('dns');
const { Op } = require('sequelize');
const {
  QosMetric, QosAlert, AuthFailEvent, AppSetting,
  TrafficData, Customer, Package, Device
} = require('../models');
const PingService = require('./PingService');
const {
  mergeSettings, settingsToRows, SETTING_KEYS,
  computeJitter, classifyRtt, classifyLoss, classifyJitter,
  classifyBandwidth, classifyAuthFails, classifyTrafficAnomaly,
  classifyDns, alertAudience, alertRoles,
  parseMikrotikPing, deviceCanApiProbe, latestForDevice, cardFromMetric,
  emptyCard, worstStatus, rollupMax, metricDeviceId
} = require('../utils/qosSla');

const METRIC_RETENTION_DAYS = 7;
const ALERT_DEDUPE_MIN = 30;
const CUSTOMER_SAMPLE = 40;

async function loadSettings() {
  const rows = await AppSetting.findAll({ where: { key: { [Op.in]: SETTING_KEYS } } });
  const raw = {};
  for (const r of rows) raw[r.key] = r.value;
  return mergeSettings(raw);
}

async function saveSettings(partial = {}) {
  const next = mergeSettings({ ...(await loadSettings()), ...partial });
  const rows = settingsToRows(next);
  for (const [key, value] of Object.entries(rows)) {
    const existing = await AppSetting.findOne({ where: { key } });
    if (existing) await existing.update({ value, type: 'string' });
    else await AppSetting.create({ key, value, type: 'string', description: key });
  }
  return next;
}

async function recordMetric({ kind, source, target, value, unit, status, metadata, device_id }) {
  return QosMetric.create({
    kind,
    source,
    device_id: device_id == null || device_id === '' ? null : Number(device_id),
    target: target || null,
    value: value == null ? null : value,
    unit: unit || null,
    status: status || 'ok',
    metadata: metadata || null,
    recorded_at: new Date()
  });
}

function severityFromStatus(status) {
  if (status === 'critical') return 'critical';
  if (status === 'warn') return 'warning';
  return 'info';
}

async function raiseAlert({ type, title, message, status, targetKey, metadata, device_id }) {
  if (!status || status === 'ok' || status === 'unknown') return null;
  const now = new Date();
  const since = new Date(now.getTime() - ALERT_DEDUPE_MIN * 60 * 1000);
  const key = device_id != null && targetKey && !String(targetKey).startsWith('dev:')
    ? `dev:${device_id}:${targetKey}`
    : (targetKey || null);
  const where = { type, status: 'open' };
  if (key) where.target_key = key;
  const existing = await QosAlert.findOne({
    where: {
      ...where,
      [Op.or]: [
        { last_seen_at: { [Op.gte]: since } },
        { created_at: { [Op.gte]: since } }
      ]
    },
    order: [['id', 'DESC']]
  });
  const audience = alertAudience(type);
  const severity = severityFromStatus(status);
  if (existing) {
    await existing.update({
      title,
      message,
      severity,
      device_id: device_id == null ? existing.device_id : Number(device_id),
      metadata: metadata || existing.metadata,
      hit_count: (existing.hit_count || 1) + 1,
      last_seen_at: now
    });
    return existing;
  }
  const alert = await QosAlert.create({
    type,
    audience,
    severity,
    title,
    message,
    device_id: device_id == null || device_id === '' ? null : Number(device_id),
    target_key: key,
    status: 'open',
    hit_count: 1,
    last_seen_at: now,
    metadata: metadata || null
  });
  try {
    const Notif = require('./NotificationService');
    await Notif.pushByRoles(alertRoles(type), {
      type,
      title,
      message,
      severity,
      action_url: '/monitoring/qos',
      metadata: { audience, target_key: key, device_id: device_id || null, ...(metadata || {}) }
    });
  } catch (e) {
    console.error('[QosSla] notify error:', e.message);
  }
  return alert;
}

async function recordAuthFail({ source, identifier, ip_address, user_agent, reason, metadata, device_id }) {
  return AuthFailEvent.create({
    source: source || 'portal',
    device_id: device_id == null || device_id === '' ? null : Number(device_id),
    identifier: identifier ? String(identifier).slice(0, 120) : null,
    ip_address: ip_address ? String(ip_address).slice(0, 64) : null,
    user_agent: user_agent ? String(user_agent).slice(0, 255) : null,
    reason: reason ? String(reason).slice(0, 80) : null,
    metadata: metadata || null
  });
}

function probeResolver(server, hostname, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const resolver = new Resolver();
    try { resolver.setServers([server]); } catch (e) {
      resolve({ ok: false, latencyMs: 0, accurate: false, error: e.message, answers: [] });
      return;
    }
    const t0 = Date.now();
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({ ok: false, latencyMs: Date.now() - t0, accurate: false, error: 'timeout', answers: [] });
    }, timeoutMs);
    resolver.resolve4(hostname, (err, addrs) => {
      clearTimeout(timer);
      const latencyMs = Date.now() - t0;
      if (err) {
        finish({ ok: false, latencyMs, accurate: false, error: err.message, answers: [] });
        return;
      }
      finish({
        ok: true,
        latencyMs,
        accurate: Array.isArray(addrs) && addrs.length > 0,
        answers: addrs || [],
        error: null
      });
    });
  });
}

async function pingTarget(host) {
  try {
    return await PingService.ping(host, 3, 4);
  } catch (e) {
    return { success: false, host, error: e.message, loss: 100, rtt_avg: null, pings: [] };
  }
}

async function listMonitorDevices() {
  return Device.findAll({
    where: { is_active: true, type: { [Op.in]: ['router', 'olt'] } },
    attributes: ['id', 'name', 'ip_address', 'type', 'monitoring_type', 'api_username', 'api_protocol', 'api_port', 'status'],
    order: [['id', 'ASC']]
  });
}

function uniqueProbeHosts(settings) {
  const list = [...(settings.publicDns || []), ...(settings.ispDns || []), ...(settings.pingTargets || [])];
  const seen = new Set();
  const out = [];
  for (const h of list) {
    const key = String(h || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function hostGroup(host, settings) {
  if ((settings.ispDns || []).includes(host)) return 'isp';
  if ((settings.publicDns || []).includes(host)) return 'public';
  return 'probe';
}

async function pingViaMikrotik(mt, host) {
  const raw = await mt.ping(host, { count: 3, interval: '0.2', timeout: 8000 });
  return parseMikrotikPing(raw);
}

async function recordProbeRow({ device, host, group, ping, settings, source }) {
  const jitter = computeJitter(ping.pings || []);
  const rtt = ping.success ? ping.rtt_avg : null;
  const loss = ping.success ? ping.loss : 100;
  const rttClass = classifyRtt(rtt, settings);
  const lossClass = classifyLoss(loss, settings);
  const jitterClass = classifyJitter(jitter, settings);
  const label = device ? `${device.name}` : 'Fiberix';
  const row = {
    device_id: device ? device.id : null,
    device_name: device ? device.name : 'Fiberix / VPS',
    host,
    group,
    rtt_ms: rtt,
    loss_pct: loss,
    jitter_ms: jitter,
    success: !!ping.success,
    method: ping.method || (device ? 'mikrotik' : 'vps'),
    error: ping.error || null
  };
  const devId = device ? device.id : null;
  await recordMetric({
    kind: 'rtt', source, target: host, value: rtt, unit: 'ms',
    status: rttClass.status, metadata: row, device_id: devId
  });
  await recordMetric({
    kind: 'loss', source, target: host, value: loss, unit: '%',
    status: lossClass.status, metadata: row, device_id: devId
  });
  await recordMetric({
    kind: 'jitter', source, target: host, value: jitter, unit: 'ms',
    status: jitterClass.status, metadata: row, device_id: devId
  });
  if (rttClass.status !== 'ok' && rttClass.status !== 'unknown') {
    await raiseAlert({
      type: 'qos_latency', status: rttClass.status, device_id: devId,
      targetKey: `rtt:${host}`,
      title: `Latency tinggi ${label} → ${host}: ${rtt}ms`,
      message: `RTT ${rtt}ms dari ${label} ke ${host} (SLA < ${settings.rttMs}ms).`,
      metadata: row
    });
  }
  if (lossClass.status !== 'ok' && lossClass.status !== 'unknown') {
    await raiseAlert({
      type: 'qos_packet_loss', status: lossClass.status, device_id: devId,
      targetKey: `loss:${host}`,
      title: `Packet loss tinggi ${label} → ${host}: ${loss}%`,
      message: `Packet loss ${loss}% dari ${label} ke ${host} (SLA < ${settings.lossPct}%).`,
      metadata: row
    });
  }
  if (jitterClass.status !== 'ok' && jitterClass.status !== 'unknown') {
    await raiseAlert({
      type: 'qos_jitter', status: jitterClass.status, device_id: devId,
      targetKey: `jitter:${host}`,
      title: `Jitter tinggi ${label} → ${host}: ${jitter}ms`,
      message: `Jitter ${jitter}ms dari ${label} ke ${host} (SLA < ${settings.jitterMs}ms).`,
      metadata: row
    });
  }
  return row;
}

async function runDeviceProbes(device, settings) {
  const out = { device_id: device.id, probes: [], error: null, via: null };
  if (deviceCanApiProbe(device)) {
    try {
      const { getMikrotikInstanceByDevice } = require('./MikrotikService');
      const mt = await getMikrotikInstanceByDevice(device.id);
      out.via = 'api';
      const hosts = uniqueProbeHosts(settings);
      for (const host of hosts) {
        try {
          const ping = await pingViaMikrotik(mt, host);
          const group = hostGroup(host, settings);
          const source = group === 'isp' ? 'isp_dns' : (group === 'public' ? 'public_dns' : 'probe');
          out.probes.push(await recordProbeRow({ device, host, group, ping, settings, source }));
        } catch (e) {
          out.probes.push({
            device_id: device.id, host, success: false, error: e.message,
            rtt_ms: null, loss_pct: 100, jitter_ms: null
          });
        }
      }
      return out;
    } catch (e) {
      out.error = e.message;
      out.via = 'api_fail';
    }
  }
  // SNMP / API gagal: ukur reachability device dari server billing
  try {
    const ping = await pingTarget(device.ip_address);
    out.via = out.via || 'icmp';
    out.probes.push(await recordProbeRow({
      device,
      host: device.ip_address,
      group: 'device',
      ping,
      settings,
      source: 'device_icmp'
    }));
  } catch (e) {
    out.error = (out.error ? out.error + ' ' : '') + e.message;
  }
  return out;
}

async function runDnsChecks(settings) {
  const host = settings.dnsProbeHost;
  const groups = [
    ...settings.publicDns.map((server) => ({ server, group: 'public' })),
    ...settings.ispDns.map((server) => ({ server, group: 'isp' }))
  ];
  const results = [];
  for (const { server, group } of groups) {
    const resolve = await probeResolver(server, host);
    const ping = await pingTarget(server);
    const jitter = computeJitter(ping.pings || []);
    const rtt = ping.success ? ping.rtt_avg : resolve.latencyMs;
    const loss = ping.success ? ping.loss : (resolve.ok ? 0 : 100);
    const dnsClass = classifyDns(resolve, settings);
    const rttClass = classifyRtt(rtt, settings);
    const lossClass = classifyLoss(loss, settings);
    const jitterClass = classifyJitter(jitter, settings);
    const row = {
      group,
      server,
      probe_host: host,
      resolve_ok: resolve.ok,
      resolve_ms: resolve.latencyMs,
      accurate: resolve.accurate,
      answers: resolve.answers,
      error: resolve.error || ping.error || null,
      rtt_ms: rtt,
      loss_pct: loss,
      jitter_ms: jitter,
      status: [dnsClass.status, rttClass.status, lossClass.status].includes('critical')
        ? 'critical'
        : ([dnsClass.status, rttClass.status, lossClass.status].includes('warn') ? 'warn' : (resolve.ok ? 'ok' : 'critical'))
    };
    results.push(row);
    await recordMetric({
      kind: 'dns', source: group === 'public' ? 'public_dns' : 'isp_dns',
      target: server, value: resolve.latencyMs, unit: 'ms', status: dnsClass.status,
      metadata: row
    });
    await recordMetric({
      kind: 'rtt', source: group === 'public' ? 'public_dns' : 'isp_dns',
      target: server, value: rtt, unit: 'ms', status: rttClass.status, metadata: { jitter, loss }
    });
    await recordMetric({
      kind: 'loss', source: group === 'public' ? 'public_dns' : 'isp_dns',
      target: server, value: loss, unit: '%', status: lossClass.status
    });
    await recordMetric({
      kind: 'jitter', source: group === 'public' ? 'public_dns' : 'isp_dns',
      target: server, value: jitter, unit: 'ms', status: jitterClass.status
    });
    if (dnsClass.status !== 'ok') {
      await raiseAlert({
        type: 'dns_degraded',
        status: dnsClass.status,
        targetKey: `dns:${group}:${server}`,
        title: `DNS ${group === 'public' ? 'publik' : 'ISP'} lambat/gagal: ${server}`,
        message: resolve.ok
          ? `Resolver ${server} merespons ${resolve.latencyMs}ms untuk ${host}. Target SLA DNS cepat & akurat.`
          : `Resolver ${server} gagal resolve ${host}: ${resolve.error || 'error'}`,
        metadata: row
      });
    }
  }
  return results;
}

async function runPingTargets(settings) {
  const extra = settings.pingTargets.filter((h) => !settings.publicDns.includes(h) && !settings.ispDns.includes(h));
  const rows = [];
  for (const host of extra) {
    const ping = await pingTarget(host);
    const jitter = computeJitter(ping.pings || []);
    const rtt = ping.success ? ping.rtt_avg : null;
    const loss = ping.success ? ping.loss : 100;
    const rttClass = classifyRtt(rtt, settings);
    const lossClass = classifyLoss(loss, settings);
    const jitterClass = classifyJitter(jitter, settings);
    const row = {
      host,
      rtt_ms: rtt,
      loss_pct: loss,
      jitter_ms: jitter,
      success: !!ping.success,
      method: ping.method || null
    };
    rows.push(row);
    await recordMetric({ kind: 'rtt', source: 'probe', target: host, value: rtt, unit: 'ms', status: rttClass.status, metadata: row });
    await recordMetric({ kind: 'loss', source: 'probe', target: host, value: loss, unit: '%', status: lossClass.status });
    await recordMetric({ kind: 'jitter', source: 'probe', target: host, value: jitter, unit: 'ms', status: jitterClass.status });
    if (rttClass.status !== 'ok' && rttClass.status !== 'unknown') {
      await raiseAlert({
        type: 'qos_latency',
        status: rttClass.status,
        targetKey: `rtt:${host}`,
        title: `Latency tinggi ${host}: ${rtt}ms`,
        message: `RTT ${rtt}ms (SLA < ${settings.rttMs}ms). Nilai tinggi menandakan kemacetan — kritis untuk VoIP/SLA.`,
        metadata: row
      });
    }
    if (lossClass.status !== 'ok' && lossClass.status !== 'unknown') {
      await raiseAlert({
        type: 'qos_packet_loss',
        status: lossClass.status,
        targetKey: `loss:${host}`,
        title: `Packet loss tinggi ${host}: ${loss}%`,
        message: `Packet loss ${loss}% (SLA VoIP < ${settings.lossPct}%). Kirim ke tim teknis untuk investigasi.`,
        metadata: { ...row, audience: 'tech' }
      });
    }
    if (jitterClass.status !== 'ok' && jitterClass.status !== 'unknown') {
      await raiseAlert({
        type: 'qos_jitter',
        status: jitterClass.status,
        targetKey: `jitter:${host}`,
        title: `Jitter tinggi ${host}: ${jitter}ms`,
        message: `Jitter ${jitter}ms (SLA < ${settings.jitterMs}ms). Fluktuasi merusak kualitas panggilan VoIP/video.`,
        metadata: row
      });
    }
  }
  return rows;
}

async function runBandwidthChecks(settings) {
  const capBps = settings.uplinkMbps * 1e6;
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const samples = await TrafficData.findAll({
    where: { recorded_at: { [Op.gte]: since } },
    attributes: ['device_id', 'interface_name', 'rx_rate', 'tx_rate', 'recorded_at'],
    order: [['recorded_at', 'DESC']],
    limit: 4000
  });

  const latestByIf = new Map();
  const histByIf = new Map();
  for (const s of samples) {
    const key = `${s.device_id}::${s.interface_name}`;
    const used = Math.max(Number(s.rx_rate) || 0, Number(s.tx_rate) || 0);
    if (!latestByIf.has(key)) latestByIf.set(key, { ...s.toJSON(), used });
    if (!histByIf.has(key)) histByIf.set(key, []);
    histByIf.get(key).push(used);
  }

  const interfaces = [];
  for (const [key, latest] of latestByIf) {
    const hist = histByIf.get(key) || [];
    const baseline = hist.length > 1
      ? hist.slice(1, 13).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(12, hist.length - 1))
      : 0;
    const bw = classifyBandwidth(latest.used, capBps, settings);
    const anomaly = classifyTrafficAnomaly(latest.used, baseline, settings);
    interfaces.push({
      device_id: latest.device_id,
      interface_name: latest.interface_name,
      rx_rate: latest.rx_rate,
      tx_rate: latest.tx_rate,
      used: latest.used,
      pct: bw.pct,
      status: bw.status,
      anomaly: anomaly.status,
      ratio: anomaly.ratio
    });
    await recordMetric({
      kind: 'bandwidth', source: 'interface', target: key,
      value: bw.pct, unit: '%', status: bw.status,
      device_id: latest.device_id,
      metadata: { used: latest.used, cap: capBps, rx: latest.rx_rate, tx: latest.tx_rate, device_id: latest.device_id }
    });
    if (bw.status === 'critical') {
      await raiseAlert({
        type: 'bandwidth_bottleneck',
        status: 'critical',
        device_id: latest.device_id,
        targetKey: `if:${key}`,
        title: `Bottleneck ${latest.interface_name}: ${bw.pct}%`,
        message: `Utilisasi ${latest.interface_name} ${bw.pct}% dari ${settings.uplinkMbps} Mbps. Kemacetan — investigasi kapasitas.`,
        metadata: { device_id: latest.device_id, interface_name: latest.interface_name, pct: bw.pct }
      });
    } else if (bw.status === 'warn') {
      await raiseAlert({
        type: 'bandwidth_bottleneck',
        status: 'warn',
        device_id: latest.device_id,
        targetKey: `if:${key}`,
        title: `Bandwidth mendekati batas: ${latest.interface_name} (${bw.pct}%)`,
        message: `Interface ${latest.interface_name} memakai ${bw.pct}% kapasitas. Pantau bottleneck / rencana upgrade.`,
        metadata: { device_id: latest.device_id, interface_name: latest.interface_name, pct: bw.pct }
      });
    }
    if (anomaly.status !== 'ok' && anomaly.status !== 'unknown') {
      await raiseAlert({
        type: 'ddos_anomaly',
        status: anomaly.status,
        device_id: latest.device_id,
        targetKey: `ddos:${key}`,
        title: `Anomali traffic ${latest.interface_name} (${anomaly.ratio}× baseline)`,
        message: `Traffic ${latest.interface_name} ${Math.round(latest.used / 1e6)} Mbps vs baseline ${Math.round(baseline / 1e6)} Mbps (${anomaly.ratio}×). Indikasi serangan DDoS / burst abnormal.`,
        metadata: { device_id: latest.device_id, interface_name: latest.interface_name, ratio: anomaly.ratio, used: latest.used, baseline }
      });
    }
  }

  const customers = await Customer.findAll({
    where: { status: { [Op.in]: ['active', 'isolated'] } },
    include: [{ model: Package, as: 'package', attributes: ['name', 'speed_down', 'speed_up'], required: false }],
    attributes: ['id', 'customer_id', 'name', 'pppoe_username', 'static_ip'],
    limit: 800
  });
  const upsell = [];
  for (const c of customers) {
    const capMbps = Number(c.package?.speed_down) || 0;
    if (!capMbps) continue;
    const uname = (c.pppoe_username || '').toLowerCase();
    if (!uname) continue;
    let match = null;
    for (const latest of latestByIf.values()) {
      const ifn = String(latest.interface_name || '').toLowerCase();
      if (ifn.includes(uname)) { match = latest; break; }
    }
    if (!match) continue;
    const capBpsCust = capMbps * 1e6;
    const bw = classifyBandwidth(match.used, capBpsCust, settings);
    if (bw.status === 'warn' || bw.status === 'critical') {
      const row = {
        customer_id: c.id,
        customer_code: c.customer_id,
        name: c.name,
        package: c.package?.name || null,
        cap_mbps: capMbps,
        used_mbps: Math.round((match.used / 1e6) * 100) / 100,
        pct: bw.pct,
        status: bw.status
      };
      upsell.push(row);
      await recordMetric({
        kind: 'bandwidth', source: 'customer', target: String(c.id),
        value: bw.pct, unit: '%', status: bw.status, metadata: row
      });
      await raiseAlert({
        type: 'bandwidth_upsell',
        status: bw.status,
        targetKey: `cust-bw:${c.id}`,
        title: `${c.name} mendekati batas paket (${bw.pct}%)`,
        message: `${c.name} (${c.customer_id}) memakai ${row.used_mbps} dari ${capMbps} Mbps. Peluang up-selling paket lebih besar.`,
        metadata: row
      });
      if (upsell.length >= CUSTOMER_SAMPLE) break;
    }
  }

  return { interfaces, upsell, sample_count: samples.length };
}

async function runAuthFailChecks(settings) {
  const since = new Date(Date.now() - settings.authWindowMin * 60 * 1000);
  const rows = await AuthFailEvent.findAll({
    where: { created_at: { [Op.gte]: since } },
    attributes: ['ip_address', 'source', 'identifier', 'created_at']
  });
  const perIp = {};
  for (const r of rows) {
    const ip = r.ip_address || 'unknown';
    perIp[ip] = (perIp[ip] || 0) + 1;
  }
  const classified = classifyAuthFails({ perIpCounts: perIp, total: rows.length }, settings);
  await recordMetric({
    kind: 'auth', source: 'portal', target: 'window',
    value: rows.length, unit: 'count', status: classified.status,
    metadata: classified
  });
  if (classified.status !== 'ok') {
    const top = classified.spikes.slice(0, 3).map((s) => `${s.ip}×${s.count}`).join(', ');
    await raiseAlert({
      type: 'auth_fail',
      status: classified.status,
      targetKey: 'auth:window',
      title: `${rows.length} autentikasi gagal dalam ${settings.authWindowMin} menit`,
      message: top
        ? `Lonjakan login gagal (indikasi serangan): ${top}`
        : `${rows.length} percobaan login gagal dalam ${settings.authWindowMin} menit.`,
      metadata: classified
    });
  }
  return { window_min: settings.authWindowMin, total: rows.length, ...classified };
}

async function ingestMikrotikAuthFailsFromMt(mt, deviceId) {
  if (!mt || typeof mt.request !== 'function') return { imported: 0, scanned: 0 };
  let logs = [];
  try {
    logs = await mt.request('GET', '/log', null, { timeout: 8000, retries: 0 });
  } catch (_) {
    return { imported: 0, scanned: 0 };
  }
  const list = Array.isArray(logs) ? logs : [];
  const failRe = /login fail|login failure|auth fail|authentication fail|ppp.*fail|hotspot.*fail/i;
  let imported = 0;
  for (const row of list.slice(-80)) {
    const topics = String(row.topics || row.topic || '');
    const message = String(row.message || row.msg || '');
    if (!failRe.test(message)) continue;
    const ipMatch = message.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    const userMatch = message.match(/user[:\s]+([^\s,]+)/i) || message.match(/for\s+([^\s]+)\s+from/i);
    try {
      await recordAuthFail({
        source: /ppp|pppoe/i.test(message) ? 'pppoe' : (/hotspot/i.test(message) ? 'hotspot' : 'mikrotik'),
        device_id: deviceId,
        identifier: userMatch ? userMatch[1] : null,
        ip_address: ipMatch ? ipMatch[0] : null,
        reason: 'mikrotik_log',
        metadata: { topics, message: message.slice(0, 240), device_id: deviceId }
      });
      imported += 1;
    } catch (_) { /* ignore dup/insert errors */ }
  }
  return { imported, scanned: list.length };
}

async function ingestMikrotikAuthFails(device) {
  if (device) {
    if (!deviceCanApiProbe(device)) return { imported: 0, scanned: 0, skipped: true };
    try {
      const { getMikrotikInstanceByDevice } = require('./MikrotikService');
      const mt = await getMikrotikInstanceByDevice(device.id);
      return ingestMikrotikAuthFailsFromMt(mt, device.id);
    } catch (_) {
      return { imported: 0, scanned: 0 };
    }
  }
  const devices = await listMonitorDevices();
  let imported = 0;
  let scanned = 0;
  for (const d of devices.filter(deviceCanApiProbe)) {
    const one = await ingestMikrotikAuthFails(d);
    imported += one.imported || 0;
    scanned += one.scanned || 0;
  }
  return { imported, scanned, devices: devices.filter(deviceCanApiProbe).length };
}

async function pruneOld() {
  const since = new Date(Date.now() - METRIC_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await QosMetric.destroy({ where: { recorded_at: { [Op.lt]: since } } });
  const authSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  await AuthFailEvent.destroy({ where: { created_at: { [Op.lt]: authSince } } });
}

async function latestByKind(kind, limit = 12) {
  return QosMetric.findAll({
    where: { kind },
    order: [['recorded_at', 'DESC']],
    limit
  });
}

async function runCycle() {
  const settings = await loadSettings();
  const out = { settings, dns: [], probes: [], devices: [], bandwidth: null, auth: null, mikrotik: null, error: null };
  try {
    out.dns = await runDnsChecks(settings);
  } catch (e) { out.error = (out.error || '') + ` dns:${e.message}`; }
  try {
    out.probes = await runPingTargets(settings);
  } catch (e) { out.error = (out.error || '') + ` ping:${e.message}`; }
  try {
    const devices = await listMonitorDevices();
    const batch = 2;
    for (let i = 0; i < devices.length; i += batch) {
      const chunk = devices.slice(i, i + batch);
      const rows = await Promise.all(chunk.map(async (d) => {
        const probe = await runDeviceProbes(d, settings).catch((e) => ({
          device_id: d.id, error: e.message, probes: [], via: null
        }));
        const mtAuth = await ingestMikrotikAuthFails(d).catch(() => ({ imported: 0 }));
        return {
          id: d.id,
          name: d.name,
          ip_address: d.ip_address,
          via: probe.via,
          error: probe.error || null,
          probes: probe.probes || [],
          mikrotik_auth: mtAuth
        };
      }));
      out.devices.push(...rows);
    }
    out.mikrotik = {
      devices: out.devices.length,
      imported: out.devices.reduce((n, d) => n + (d.mikrotik_auth && d.mikrotik_auth.imported ? d.mikrotik_auth.imported : 0), 0)
    };
  } catch (e) { out.error = (out.error || '') + ` devices:${e.message}`; }
  try {
    out.bandwidth = await runBandwidthChecks(settings);
  } catch (e) { out.error = (out.error || '') + ` bw:${e.message}`; }
  try {
    out.auth = await runAuthFailChecks(settings);
  } catch (e) { out.error = (out.error || '') + ` auth:${e.message}`; }
  try { await pruneOld(); } catch (_) {}
  out.ran_at = new Date().toISOString();
  return out;
}

function alertMatchesDevice(alert, deviceId) {
  if (deviceId == null) return true;
  if (Number(alert.device_id) === deviceId) return true;
  const meta = alert.metadata || {};
  return Number(meta.device_id) === deviceId;
}

async function overview(deviceId) {
  const settings = await loadSettings();
  const selected = deviceId && deviceId !== 'all' ? parseInt(deviceId, 10) : null;
  const selectedOk = Number.isFinite(selected) && selected > 0 ? selected : null;

  const devices = await listMonitorDevices().catch(() => []);
  const nameById = {};
  for (const d of devices) nameById[d.id] = d.name;

  const authWhere = { created_at: { [Op.gte]: new Date(Date.now() - settings.authWindowMin * 60 * 1000) } };
  if (selectedOk) authWhere.device_id = selectedOk;

  const [rtt, loss, jitter, bw, dns, auth, openAlerts, authRecent] = await Promise.all([
    latestByKind('rtt', 120),
    latestByKind('loss', 120),
    latestByKind('jitter', 120),
    latestByKind('bandwidth', 80),
    latestByKind('dns', 40),
    latestByKind('auth', 8),
    QosAlert.findAll({ where: { status: 'open' }, order: [['last_seen_at', 'DESC'], ['id', 'DESC']], limit: 120 }),
    AuthFailEvent.count({ where: authWhere }).catch(() => 0)
  ]);

  const deviceRows = devices.map((d) => {
    const cards = {
      latency: cardFromMetric(latestForDevice(rtt, d.id)),
      packet_loss: cardFromMetric(latestForDevice(loss, d.id)),
      jitter: cardFromMetric(latestForDevice(jitter, d.id)),
      bandwidth: cardFromMetric(latestForDevice(bw.filter((r) => r.source === 'interface'), d.id))
    };
    return {
      id: d.id,
      name: d.name,
      ip_address: d.ip_address,
      type: d.type,
      monitoring_type: d.monitoring_type,
      device_status: d.status,
      probe_via: deviceCanApiProbe(d) ? 'api' : 'icmp',
      cards,
      worst: worstStatus([
        cards.latency.status, cards.packet_loss.status,
        cards.jitter.status, cards.bandwidth.status
      ])
    };
  });

  const ifaceBw = bw.filter((r) => r.source === 'interface');
  let cards;
  if (selectedOk) {
    const one = deviceRows.find((d) => d.id === selectedOk);
    cards = {
      latency: one ? one.cards.latency : emptyCard(),
      packet_loss: one ? one.cards.packet_loss : emptyCard(),
      jitter: one ? one.cards.jitter : emptyCard(),
      bandwidth: one ? one.cards.bandwidth : cardFromMetric(latestForDevice(ifaceBw, selectedOk)),
      dns: cardFromMetric(latestForDevice(dns, selectedOk) || dns.find((r) => metricDeviceId(r) == null)),
      auth_fails: {
        status: auth[0]?.status || (authRecent > 0 ? 'warn' : 'ok'),
        value: authRecent,
        target: `${settings.authWindowMin}m`
      }
    };
  } else {
    cards = {
      latency: {
        status: worstStatus(deviceRows.map((d) => d.cards.latency.status)),
        value: rollupMax(deviceRows.map((d) => d.cards.latency.value)),
        target: 'terburuk antar device',
        recorded_at: null,
        device_id: null
      },
      packet_loss: {
        status: worstStatus(deviceRows.map((d) => d.cards.packet_loss.status)),
        value: rollupMax(deviceRows.map((d) => d.cards.packet_loss.value)),
        target: 'terburuk antar device',
        recorded_at: null,
        device_id: null
      },
      jitter: {
        status: worstStatus(deviceRows.map((d) => d.cards.jitter.status)),
        value: rollupMax(deviceRows.map((d) => d.cards.jitter.value)),
        target: 'terburuk antar device',
        recorded_at: null,
        device_id: null
      },
      bandwidth: {
        status: worstStatus(deviceRows.map((d) => d.cards.bandwidth.status)),
        value: rollupMax(deviceRows.map((d) => d.cards.bandwidth.value)),
        target: 'terburuk antar device',
        recorded_at: null,
        device_id: null
      },
      dns: cardFromMetric(dns[0]),
      auth_fails: {
        status: auth[0]?.status || (authRecent > 0 ? 'warn' : 'ok'),
        value: authRecent,
        target: `${settings.authWindowMin}m`
      }
    };
  }

  const scopedAlerts = openAlerts.filter((a) => alertMatchesDevice(a, selectedOk));
  const alertsByType = {};
  const alertsByAudience = { tech: 0, sales: 0, security: 0 };
  for (const a of scopedAlerts) {
    alertsByType[a.type] = (alertsByType[a.type] || 0) + 1;
    alertsByAudience[a.audience] = (alertsByAudience[a.audience] || 0) + 1;
  }

  const dnsRows = (selectedOk
    ? dns.filter((r) => metricDeviceId(r) === selectedOk || metricDeviceId(r) == null)
    : dns
  ).slice(0, 20);

  return {
    settings,
    sla: {
      rtt_ms: settings.rttMs,
      loss_pct: settings.lossPct,
      jitter_ms: settings.jitterMs,
      bandwidth_warn_pct: settings.bandwidthWarnPct
    },
    selected_device_id: selectedOk,
    scope_label: selectedOk ? (nameById[selectedOk] || ('Device #' + selectedOk)) : 'Semua device',
    cards,
    devices: deviceRows,
    dns: dnsRows.map((r) => ({
      group: r.source === 'public_dns' ? 'public' : (r.source === 'isp_dns' ? 'isp' : r.source),
      server: r.target,
      value: r.value == null ? null : Number(r.value),
      status: r.status,
      metadata: r.metadata,
      recorded_at: r.recorded_at,
      device_id: metricDeviceId(r),
      device_name: nameById[metricDeviceId(r)] || (metricDeviceId(r) == null ? 'Fiberix / VPS' : null)
    })),
    alerts: scopedAlerts.map((a) => {
      const json = typeof a.toJSON === 'function' ? a.toJSON() : a;
      json.device_name = nameById[json.device_id] || (json.metadata && json.metadata.device_name) || null;
      return json;
    }),
    alert_counts: { total: scopedAlerts.length, by_type: alertsByType, by_audience: alertsByAudience },
    upsell: bw.filter((r) => r.source === 'customer' && r.status !== 'ok').slice(0, 20),
    device_count: devices.length
  };
}

module.exports = {
  loadSettings,
  saveSettings,
  recordAuthFail,
  recordMetric,
  raiseAlert,
  runCycle,
  runDnsChecks,
  runAuthFailChecks,
  runDeviceProbes,
  listMonitorDevices,
  overview,
  ingestMikrotikAuthFails
};
