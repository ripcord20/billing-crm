'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { SessionStore } = require('./sessions');

const PORT = parseInt(process.env.REMOTE_PORT || '18789', 10);
const VIEWER_DIR = path.join(__dirname, '..', 'viewer');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml'
};

const store = new SessionStore();

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcastViewers(sess, obj, skip) {
  const raw = JSON.stringify(obj);
  for (const v of sess.viewers) {
    if (v !== skip && v.readyState === 1) v.send(raw);
  }
}

function notifyStatus(sess) {
  const payload = {
    type: 'status',
    hostOnline: !!sess.host,
    viewers: sess.viewers.size
  };
  if (sess.host) send(sess.host, payload);
  broadcastViewers(sess, payload);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(VIEWER_DIR, urlPath));
  if (!file.startsWith(VIEWER_DIR)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ...store.stats() }));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.role = null;
  ws.sessionId = null;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(String(buf)); } catch { return; }
    const type = msg && msg.type;

    if (type === 'ping') {
      send(ws, { type: 'pong', t: msg.t || Date.now() });
      return;
    }

    if (type === 'hello' && msg.role === 'host') {
      let sess = null;
      let password = null;
      if (msg.sessionId && msg.token) {
        sess = store.resumeHost(msg.sessionId, msg.token);
      }
      if (!sess) {
        const created = store.create();
        sess = created.session;
        password = created.password;
      }
      store.attachHost(sess, ws);
      ws.role = 'host';
      ws.sessionId = sess.id;
      send(ws, {
        type: 'session',
        id: sess.id,
        password,
        token: sess.token,
        resumed: !password
      });
      if (sess.lastFrame) send(ws, { type: 'ack_frame', seq: sess.lastFrame.seq });
      notifyStatus(sess);
      return;
    }

    if (type === 'hello' && msg.role === 'viewer') {
      const joined = store.joinViewer(msg.sessionId, msg.password);
      if (joined.error) {
        send(ws, { type: 'error', message: joined.error });
        return;
      }
      const sess = joined.session;
      store.attachViewer(sess, ws);
      ws.role = 'viewer';
      ws.sessionId = sess.id;
      send(ws, { type: 'auth_ok', id: sess.id, hostOnline: !!sess.host });
      if (sess.lastFrame) send(ws, sess.lastFrame);
      notifyStatus(sess);
      return;
    }

    const sess = ws.sessionId ? store.get(ws.sessionId) : null;
    if (!sess) return;

    if (type === 'frame' && ws.role === 'host') {
      sess.lastFrame = {
        type: 'frame',
        mime: msg.mime || 'image/jpeg',
        data: msg.data,
        w: msg.w,
        h: msg.h,
        seq: msg.seq || 0
      };
      sess.hostSeen = Date.now();
      sess.lastSeen = Date.now();
      broadcastViewers(sess, sess.lastFrame);
      return;
    }

    if (type === 'set_password' && ws.role === 'host') {
      if (!store.setPassword(sess, msg.password)) {
        send(ws, { type: 'error', message: 'Password kustom 4–8 digit' });
        return;
      }
      send(ws, {
        type: 'session',
        id: sess.id,
        password: String(msg.password).trim(),
        token: sess.token,
        resumed: true
      });
      return;
    }

    if (type === 'input' && ws.role === 'viewer') {
      if (sess.host) send(sess.host, msg);
      return;
    }
  });

  ws.on('close', () => {
    const sess = ws.sessionId ? store.get(ws.sessionId) : null;
    store.detach(ws);
    if (sess) notifyStatus(sess);
  });
});

const heartbeat = setInterval(() => {
  store.sweep();
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  }
}, 8000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[fiberix-remote] relay http://0.0.0.0:${PORT}`);
  console.log(`[fiberix-remote] viewer  http://<ip>:${PORT}/`);
  console.log(`[fiberix-remote] ws      ws://<ip>:${PORT}/ws`);
});
