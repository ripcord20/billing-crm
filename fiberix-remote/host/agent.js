'use strict';

/**
 * Agen host Fiberix Remote.
 * - Menyambung ke relay, dapat ID + password (seperti UltraViewer)
 * - Auto-reconnect tanpa ganti ID (token disimpan di disk)
 * - Menampilkan jendela lokal di http://127.0.0.1:18080
 * - Di Windows: capture layar + klik/ketik
 * - Bisa dikemas jadi .exe (pkg): skrip PowerShell di folder yang sama dengan exe
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { WebSocket } = require('ws');
const { normalizeRelay, displayRelay } = require('../lib/relayUrl');
const { DEFAULT_RELAY } = require('../lib/defaultRelay');
const { startRelay } = require('../server/index');
const LOCAL_RELAY = 'ws://127.0.0.1:18789/ws';

const IS_WIN = process.platform === 'win32';
const FPS = Math.max(1, Math.min(8, parseInt(process.env.REMOTE_FPS || '4', 10)));
const UI_PORT = parseInt(process.env.REMOTE_HOST_UI || '18080', 10);
const STATE_FILE = path.join(os.homedir(), '.fiberix-remote-host.json');
const HERE = process.pkg ? path.dirname(process.execPath) : __dirname;
const SNAPSHOT = __dirname;

let relayUrl = normalizeRelay(process.env.REMOTE_RELAY || process.argv[2] || DEFAULT_RELAY);
let session = { id: null, password: null, token: null };
let captureTimer = null;
let seq = 0;
let lastError = '';
let options = { autostart: false, preventSleep: false, wol: false };
const links = {
  cloud: { url: relayUrl, ws: null, online: false, viewers: 0, connecting: false, timer: null, err: '' },
  local: { url: LOCAL_RELAY, ws: null, online: false, viewers: 0, connecting: false, timer: null, err: '' }
};

function viewers() {
  return (links.cloud.viewers || 0) + (links.local.viewers || 0);
}
function hostOnline() {
  return !!(links.cloud.online || links.local.online);
}

function loadState() {
  try {
    const j = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (j.id && j.token) session = { id: j.id, token: j.token, password: j.password || null };
    options.autostart = !!j.autostart;
    options.preventSleep = !!j.preventSleep;
    options.wol = !!j.wol;
  } catch (_) {}
  if (!relayUrl) relayUrl = DEFAULT_RELAY;
  ensureLocalSession();
}

function ensureLocalSession() {
  if (!/^\d{9}$/.test(String(session.id || ''))) {
    session.id = String(crypto.randomInt(100000000, 999999999));
  }
  if (!/^\d{4,8}$/.test(String(session.password || ''))) {
    session.password = randomPassword();
  }
  if (!session.token) session.token = crypto.randomBytes(24).toString('hex');
  saveState();
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      id: session.id, token: session.token, password: session.password, relay: relayUrl,
      autostart: options.autostart, preventSleep: options.preventSleep, wol: options.wol
    }, null, 2));
  } catch (e) {
    console.warn('Tidak bisa simpan sesi:', e.message);
  }
}

function randomPassword() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

function winCmd(args) {
  if (!IS_WIN) return;
  spawn('cmd.exe', ['/c', ...args], { windowsHide: true, stdio: 'ignore' });
}

function applyAutostart() {
  if (!IS_WIN) return;
  const vbs = path.join(HERE, '..', 'FiberixRemote.vbs');
  const name = 'FiberixRemote';
  if (options.autostart && fs.existsSync(vbs)) {
    winCmd(['reg', 'add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', name, '/t', 'REG_SZ', '/d', 'wscript.exe "' + vbs + '"', '/f']);
  } else {
    winCmd(['reg', 'delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', name, '/f']);
  }
}

function keepAwake() {
  if (!IS_WIN || !options.preventSleep) return;
  spawn('powershell.exe', ['-NoProfile', '-Command',
    'Add-Type -TypeDefinition @"\nusing System.Runtime.InteropServices;\npublic class K { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint s); }\n"@; [K]::SetThreadExecutionState(2147483651)'
  ], { windowsHide: true, stdio: 'ignore' });
}

function applyWol() {
  if (!IS_WIN || !options.wol) return;
  spawn('powershell.exe', ['-NoProfile', '-Command',
    'Get-NetAdapter -Physical -ErrorAction SilentlyContinue | ForEach-Object { try { Enable-NetAdapterPowerManagement -Name $_.Name -WakeOnMagicPacket Enabled -ErrorAction SilentlyContinue } catch {} }'
  ], { windowsHide: true, stdio: 'ignore' });
}

function applyPassword(next) {
  const p = String(next || '').trim();
  if (!/^\d{4,8}$/.test(p)) {
    lastError = 'Password kustom 4–8 digit';
    return false;
  }
  session.password = p;
  saveState();
  send({ type: 'set_password', password: p });
  return true;
}

function send(obj) {
  const raw = JSON.stringify(obj);
  for (const L of Object.values(links)) {
    if (L.ws && L.ws.readyState === WebSocket.OPEN) L.ws.send(raw);
  }
}

function schedule(name) {
  const L = links[name];
  if (L.timer) return;
  L.timer = setTimeout(() => {
    L.timer = null;
    connectLink(name);
  }, name === 'cloud' ? 2500 : 1200);
}

function setRelay(next) {
  const url = normalizeRelay(next);
  if (!url) {
    lastError = 'Alamat server kosong';
    return false;
  }
  relayUrl = url;
  links.cloud.url = url;
  saveState();
  if (links.cloud.ws) {
    try { links.cloud.ws.close(); } catch (_) {}
  }
  connectLink('cloud');
  return true;
}

function connectLink(name) {
  const L = links[name];
  if (L.connecting) return;
  L.connecting = true;
  try {
    L.ws = new WebSocket(L.url, { handshakeTimeout: 8000 });
  } catch (e) {
    L.connecting = false;
    L.online = false;
    L.err = e.message;
    lastError = e.message;
    schedule(name);
    return;
  }
  L.ws.on('open', () => {
    L.connecting = false;
    L.err = '';
    L.ws.send(JSON.stringify({
      type: 'hello',
      role: 'host',
      sessionId: session.id,
      token: session.token,
      password: session.password,
      hostname: os.hostname(),
      platform: process.platform
    }));
  });
  L.ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(String(buf)); } catch { return; }
    if (msg.type === 'session') {
      session.id = msg.id;
      session.token = msg.token;
      if (msg.password) session.password = msg.password;
      L.online = true;
      L.err = '';
      lastError = '';
      saveState();
      console.log(`\n  Fiberix Remote siap (${name})`);
      console.log(`  ID       : ${session.id}`);
      console.log(`  Password : ${session.password}`);
    }
    if (msg.type === 'status') {
      L.viewers = msg.viewers || 0;
      L.online = !!msg.hostOnline;
    }
    if (msg.type === 'error') {
      L.err = msg.message;
      lastError = msg.message;
    }
    if (msg.type === 'input') applyInput(msg);
  });
  L.ws.on('close', () => {
    L.connecting = false;
    L.online = false;
    L.viewers = 0;
    schedule(name);
  });
  L.ws.on('error', (e) => {
    L.err = e.message;
    L.connecting = false;
    if (name === 'cloud') lastError = 'Server internet belum nyala (' + displayRelay(L.url) + ')';
  });
}

function connect() {
  connectLink('local');
  connectLink('cloud');
}

setInterval(() => send({ type: 'ping', t: Date.now() }), 4000);

function bmpClockFrame() {
  const w = 640, h = 360;
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const pixelSize = rowSize * h;
  const header = 54;
  const buf = Buffer.alloc(header + pixelSize);
  buf.write('BM');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(header, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelSize, 34);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = header + (h - 1 - y) * rowSize + x * 3;
      buf[o] = 40; buf[o + 1] = 28; buf[o + 2] = 15;
    }
  }
  return { mime: 'image/bmp', data: buf.toString('base64'), w, h };
}

function scriptPath(name) {
  const beside = path.join(HERE, name);
  if (fs.existsSync(beside)) return beside;
  return path.join(SNAPSHOT, name);
}

function captureWindows(cb) {
  const script = scriptPath('capture.ps1');
  execFile('powershell.exe', [
    '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script
  ], { windowsHide: true, maxBuffer: 12 * 1024 * 1024, timeout: 4000 }, (err, stdout) => {
    if (err || !stdout) return cb(err || new Error('capture kosong'));
    const line = String(stdout).trim().split(/\r?\n/).pop();
    const parts = line.split('|');
    if (parts.length < 3) return cb(new Error('format capture salah'));
    cb(null, { mime: 'image/jpeg', w: parseInt(parts[0], 10), h: parseInt(parts[1], 10), data: parts[2] });
  });
}

function captureFrame(cb) {
  if (IS_WIN) return captureWindows(cb);
  cb(null, bmpClockFrame());
}

function startCapture() {
  if (captureTimer) return;
  const tick = () => {
    if (!hostOnline() || viewers() < 1) {
      captureTimer = setTimeout(tick, 500);
      return;
    }
    captureFrame((err, frame) => {
      if (!err && frame && frame.data) {
        seq += 1;
        send({ type: 'frame', seq, ...frame });
      }
      captureTimer = setTimeout(tick, Math.round(1000 / FPS));
    });
  };
  tick();
}

function applyInput(msg) {
  if (!IS_WIN) return;
  const kind = msg.kind;
  const script = scriptPath('input.ps1');
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, kind];
  if (kind === 'mouse') {
    args.push(String(msg.action || 'move'), String(msg.x || 0), String(msg.y || 0), String(msg.button || 'left'));
  } else if (kind === 'key') {
    args.push(String(msg.action || 'down'), String(msg.key || ''));
  } else {
    return;
  }
  spawn('powershell.exe', args, { windowsHide: true, stdio: 'ignore' });
}

function readUi() {
  const candidates = [
    path.join(SNAPSHOT, 'ui.html'),
    path.join(HERE, 'ui.html')
  ];
  for (const f of candidates) {
    try { return fs.readFileSync(f, 'utf8'); } catch (_) {}
  }
  return '<p>ui.html tidak ditemukan</p>';
}

const uiHtml = readUi();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function stateJson() {
  return {
    id: session.id,
    password: session.password,
    relay: relayUrl,
    relayDisplay: displayRelay(relayUrl),
    online: hostOnline(),
    cloudOnline: !!links.cloud.online,
    viewers: viewers(),
    error: lastError,
    platform: process.platform,
    hostname: os.hostname(),
    autostart: options.autostart,
    preventSleep: options.preventSleep,
    wol: options.wol
  };
}

const uiServer = http.createServer((req, res) => {
  const url = req.url || '';
  if (url.startsWith('/api/state') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(stateJson()));
    return;
  }
  if (url.startsWith('/api/relay') && req.method === 'POST') {
    readBody(req).then((body) => {
      const ok = setRelay(body.url || body.relay || '');
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok, ...stateJson() }));
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'JSON tidak valid' }));
    });
    return;
  }
  if (url.startsWith('/api/options') && req.method === 'POST') {
    readBody(req).then((body) => {
      options.autostart = !!body.autostart;
      options.preventSleep = !!body.preventSleep;
      options.wol = !!body.wol;
      saveState();
      applyAutostart();
      if (options.preventSleep) keepAwake();
      applyWol();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...stateJson() }));
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
    });
    return;
  }
  if (url.startsWith('/api/password') && req.method === 'POST') {
    readBody(req).then((body) => {
      const p = body.rotate ? randomPassword() : body.password;
      const ok = applyPassword(p);
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok, ...stateJson() }));
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(uiHtml);
});

function openLocalUi() {
  const page = `http://127.0.0.1:${UI_PORT}`;
  if (IS_WIN) spawn('cmd', ['/c', 'start', '', page], { windowsHide: true, stdio: 'ignore' });
}

loadState();
setInterval(keepAwake, 40000);
uiServer.listen(UI_PORT, '127.0.0.1', () => {
  console.log(`Panel host: http://127.0.0.1:${UI_PORT}`);
  openLocalUi();
  if (options.autostart) applyAutostart();
  if (options.preventSleep) keepAwake();
  startRelay(18789).finally(() => {
    connect();
    startCapture();
  });
});
