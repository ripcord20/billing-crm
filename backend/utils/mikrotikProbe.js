'use strict';

/**
 * Parse hasil /tool/ping MikroTik (REST array, summary object, atau native).
 * Format waktu sama seperti terminal: "19ms474us", "20ms", "20588us".
 */
function parseMikrotikRtt(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return 0;
  const msPart = s.match(/([\d.]+)\s*ms/i);
  const usPart = s.match(/([\d.]+)\s*us/i);
  let ms = 0;
  if (msPart) ms += parseFloat(msPart[1]) || 0;
  if (usPart) ms += (parseFloat(usPart[1]) || 0) / 1000;
  if (!msPart && !usPart) {
    const n = parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
    ms = /us/i.test(s) ? n / 1000 : n;
  }
  return Math.round(ms * 1000) / 1000;
}

function parseMikrotikPing(raw, fallbackCount = 8) {
  if (!raw) {
    return { sent: fallbackCount, received: 0, loss: 100, rtt_avg: null, pings: [], success: false };
  }
  const entries = Array.isArray(raw) ? raw : [raw];
  let summary = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e && typeof e === 'object' && +e.sent > 0) { summary = e; break; }
  }

  const pings = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const st = String(e.status || '').toLowerCase();
    const rttRaw = e['response-time'] != null ? e['response-time']
      : (e.time != null ? e.time : (e['avg-rtt'] != null ? null : null));
    const isReply = st.includes('reply')
      || (rttRaw != null && !st.includes('timeout') && !st.includes('unreachable') && !st.includes('no route'));
    if (isReply && rttRaw != null) {
      const ms = parseMikrotikRtt(rttRaw);
      pings.push({ seq: pings.length + 1, ttl: e.ttl != null ? +e.ttl : null, ms });
    }
  }

  let sent;
  let received;
  let rttAvg;
  if (summary) {
    sent = +summary.sent || fallbackCount;
    received = +summary.received || 0;
    rttAvg = parseMikrotikRtt(summary['avg-rtt'] || summary['avg-rtt-ms'] || '');
    if (!rttAvg && pings.length) {
      rttAvg = pings.reduce((s, p) => s + p.ms, 0) / pings.length;
    }
  } else {
    received = pings.length;
    sent = Math.max(entries.filter((e) => e && typeof e === 'object').length, received, fallbackCount);
    rttAvg = received ? pings.reduce((s, p) => s + p.ms, 0) / received : null;
  }

  const loss = sent > 0 ? Math.round(((sent - received) / sent) * 1000) / 10 : 100;
  return {
    sent,
    received,
    loss,
    rtt_avg: received ? Math.round((rttAvg || 0) * 1000) / 1000 : null,
    pings,
    success: received > 0,
    method: 'mikrotik'
  };
}

function isNoisyLossSample(sent, received) {
  const s = Number(sent) || 0;
  const r = Number(received) || 0;
  if (s <= 0) return true;
  // 1 paket hilang pada sampel kecil (3–5 ping) sering rate-limit ICMP, bukan link down.
  return s <= 5 && (s - r) <= 1 && r > 0;
}

function parseMikrotikDnsLookup(raw) {
  const rows = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const answers = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const ip = r.data || r.address || r['ip-address'] || '';
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip))) answers.push(String(ip));
  }
  return { ok: answers.length > 0, answers };
}

module.exports = {
  parseMikrotikRtt,
  parseMikrotikPing,
  parseMikrotikDnsLookup,
  isNoisyLossSample
};
