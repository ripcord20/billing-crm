'use strict';

const login = document.getElementById('login');
const desk = document.getElementById('desk');
const err = document.getElementById('err');
const frame = document.getElementById('frame');
const wait = document.getElementById('wait');
const deskId = document.getElementById('deskId');
const deskSt = document.getElementById('deskSt');

let ws = null;
let wantOpen = false;
let sessionId = '';
let password = '';
let retry = 0;
let remoteW = 0;
let remoteH = 0;
let reconnectTimer = null;
let pingTimer = null;
let wakeLock = null;

function nativeRelay() {
  try {
    if (window.FiberixNative && typeof window.FiberixNative.getWsUrl === 'function') {
      return window.FiberixNative.getWsUrl() || '';
    }
  } catch (_) {}
  return '';
}

function wsUrl() {
  const typed = (document.getElementById('relay') && document.getElementById('relay').value) || '';
  const saved = localStorage.getItem('fiberix_relay') || nativeRelay();
  return window.normalizeRelay(typed || saved, location);
}

function setStatus(text, cls) {
  deskSt.textContent = text;
  deskSt.className = 'pill' + (cls ? ' ' + cls : '');
}

function mapPoint(ev) {
  if (!remoteW || !remoteH) return null;
  const r = frame.getBoundingClientRect();
  const scale = Math.min(r.width / remoteW, r.height / remoteH);
  const dw = remoteW * scale;
  const dh = remoteH * scale;
  const ox = r.left + (r.width - dw) / 2;
  const oy = r.top + (r.height - dh) / 2;
  const x = Math.round((ev.clientX - ox) / scale);
  const y = Math.round((ev.clientY - oy) / scale);
  if (x < 0 || y < 0 || x > remoteW || y > remoteH) return null;
  return { x, y };
}

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function stopPing() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
}

function startPing() {
  stopPing();
  pingTimer = setInterval(() => send({ type: 'ping', t: Date.now() }), 4000);
}

async function keepAwake() {
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
}

function formatIdInput(el) {
  const d = String(el.value || '').replace(/\D/g, '').slice(0, 9);
  el.value = d.replace(/(\d{3})(?=\d)/g, '$1 ');
}

function connectViewer() {
  sessionId = document.getElementById('sid').value.replace(/\D/g, '');
  password = document.getElementById('spw').value.trim();
  err.textContent = '';
  const relay = wsUrl();
  if (!relay) { err.textContent = 'Enter server IP:port'; return; }
  localStorage.setItem('fiberix_relay', relay);
  try {
    if (window.FiberixNative && window.FiberixNative.saveRelay) window.FiberixNative.saveRelay(relay);
  } catch (_) {}
  if (sessionId.length < 6) { err.textContent = 'Invalid ID'; return; }
  wantOpen = true;
  retry = 0;
  login.classList.add('hidden');
  desk.classList.remove('hidden');
  deskId.textContent = sessionId.replace(/(\d{3})(?=\d)/g, '$1 ');
  openSocket();
  keepAwake();
}

function disconnectViewer() {
  wantOpen = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  stopPing();
  if (ws) try { ws.close(); } catch (_) {}
  ws = null;
  desk.classList.add('hidden');
  login.classList.remove('hidden');
}

function openSocket() {
  if (!wantOpen) return;
  setStatus('Connecting…');
  ws = new WebSocket(wsUrl());
  ws.onopen = () => {
    retry = 0;
    send({ type: 'hello', role: 'viewer', sessionId, password });
    startPing();
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'error') {
      err.textContent = msg.message;
      wantOpen = false;
      disconnectViewer();
      return;
    }
    if (msg.type === 'auth_ok') {
      setStatus(msg.hostOnline ? 'Connected' : 'Waiting for host', msg.hostOnline ? 'ok' : 'warn');
    }
    if (msg.type === 'status') {
      setStatus(msg.hostOnline ? 'Connected' : 'Host offline, waiting…', msg.hostOnline ? 'ok' : 'warn');
    }
    if (msg.type === 'frame' && msg.data) {
      remoteW = msg.w || remoteW;
      remoteH = msg.h || remoteH;
      frame.src = 'data:' + (msg.mime || 'image/jpeg') + ';base64,' + msg.data;
      wait.style.display = 'none';
    }
  };
  ws.onclose = () => {
    stopPing();
    if (!wantOpen) return;
    setStatus('Reconnecting…', 'warn');
    const delay = Math.min(8000, 700 + retry * 500);
    retry += 1;
    reconnectTimer = setTimeout(openSocket, delay);
  };
}

function pointer(kind, ev, extra) {
  const p = mapPoint(ev);
  if (!p) return;
  send({ type: 'input', kind: 'mouse', action: kind, button: extra || 'left', x: p.x, y: p.y });
}

frame.addEventListener('mousedown', (e) => { e.preventDefault(); pointer('down', e, e.button === 2 ? 'right' : 'left'); });
frame.addEventListener('mouseup', (e) => { e.preventDefault(); pointer('up', e, e.button === 2 ? 'right' : 'left'); });
frame.addEventListener('mousemove', (e) => {
  if (!e.buttons) return;
  pointer('move', e);
});
frame.addEventListener('contextmenu', (e) => e.preventDefault());
frame.addEventListener('touchstart', (e) => { e.preventDefault(); pointer('down', e.touches[0]); }, { passive: false });
frame.addEventListener('touchmove', (e) => { e.preventDefault(); pointer('move', e.touches[0]); }, { passive: false });
frame.addEventListener('touchend', (e) => { e.preventDefault(); if (e.changedTouches[0]) pointer('up', e.changedTouches[0]); }, { passive: false });

window.addEventListener('keydown', (e) => {
  if (login.classList.contains('hidden')) {
    send({ type: 'input', kind: 'key', action: 'down', key: e.keyCode });
  }
});
window.addEventListener('keyup', (e) => {
  if (login.classList.contains('hidden')) {
    send({ type: 'input', kind: 'key', action: 'up', key: e.keyCode });
  }
});

(function restoreRelay() {
  const el = document.getElementById('relay');
  if (!el) return;
  const saved = localStorage.getItem('fiberix_relay') || nativeRelay();
  if (saved && window.displayRelay) el.value = window.displayRelay(saved);
  else if (location.protocol !== 'file:' && location.host) el.value = location.host;
  const sid = document.getElementById('sid');
  if (sid) sid.addEventListener('input', () => formatIdInput(sid));
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.connectViewer = connectViewer;
window.disconnectViewer = disconnectViewer;
