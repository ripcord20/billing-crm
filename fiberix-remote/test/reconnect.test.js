'use strict';
const assert = require('assert');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { SessionStore } = require('../server/sessions');

function send(ws, obj) { ws.send(JSON.stringify(obj)); }
function once(ws, type) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + type)), 4000);
    ws.on('message', (buf) => {
      const msg = JSON.parse(String(buf));
      if (msg.type === type) {
        clearTimeout(t);
        resolve(msg);
      }
    });
  });
}

(async () => {
  const store = new SessionStore();
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.on('message', (buf) => {
      const msg = JSON.parse(String(buf));
      if (msg.type === 'hello' && msg.role === 'host') {
        let sess = msg.sessionId && msg.token ? store.resumeHost(msg.sessionId, msg.token) : null;
        let password = null;
        if (!sess) {
          const c = store.create();
          sess = c.session; password = c.password;
        }
        store.attachHost(sess, ws);
        send(ws, { type: 'session', id: sess.id, password, token: sess.token, resumed: !password });
      }
      if (msg.type === 'hello' && msg.role === 'viewer') {
        const j = store.joinViewer(msg.sessionId, msg.password);
        if (j.error) send(ws, { type: 'error', message: j.error });
        else send(ws, { type: 'auth_ok', id: j.session.id, hostOnline: !!j.session.host });
      }
      if (msg.type === 'frame') {
        const sess = store.get(msg.id);
        if (sess) sess.lastFrame = msg;
      }
    });
    ws.on('close', () => store.detach(ws));
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const url = 'ws://127.0.0.1:' + port + '/ws';

  const host1 = new WebSocket(url);
  await new Promise((r, j) => { host1.on('open', r); host1.on('error', j); });
  send(host1, { type: 'hello', role: 'host' });
  const s1 = await once(host1, 'session');
  assert.ok(s1.id && s1.token && s1.password);

  host1.close();
  await new Promise((r) => host1.on('close', r));

  const host2 = new WebSocket(url);
  await new Promise((r, j) => { host2.on('open', r); host2.on('error', j); });
  send(host2, { type: 'hello', role: 'host', sessionId: s1.id, token: s1.token });
  const s2 = await once(host2, 'session');
  assert.strictEqual(s2.id, s1.id);
  assert.strictEqual(s2.resumed, true);
  assert.ok(!s2.password);

  const viewer = new WebSocket(url);
  await new Promise((r, j) => { viewer.on('open', r); viewer.on('error', j); });
  send(viewer, { type: 'hello', role: 'viewer', sessionId: s1.id, password: s1.password });
  const ok = await once(viewer, 'auth_ok');
  assert.strictEqual(ok.hostOnline, true);

  host2.close(); viewer.close();
  server.close();
  wss.close();
  console.log('reconnect.test.js OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
