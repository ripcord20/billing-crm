'use strict';

const crypto = require('crypto');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const HOST_GRACE_MS = 30 * 60 * 1000;

function makeId() {
  return String(crypto.randomInt(100_000_000, 999_999_999));
}

function makePassword() {
  return String(crypto.randomInt(1000, 9999));
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function hashPass(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}

class SessionStore {
  constructor() {
    this.byId = new Map();
  }

  _put(id, password, token) {
    const salt = crypto.randomBytes(8).toString('hex');
    const sess = {
      id,
      salt,
      passHash: hashPass(password, salt),
      token: token || makeToken(),
      host: null,
      viewers: new Set(),
      lastFrame: null,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      hostSeen: Date.now()
    };
    this.byId.set(id, sess);
    return { session: sess, password };
  }

  create() {
    let id = makeId();
    while (this.byId.has(id)) id = makeId();
    return this._put(id, makePassword(), makeToken());
  }

  /** Host sudah punya ID+password sendiri (seperti UltraViewer). */
  claim(id, password, token) {
    const sid = String(id || '');
    const pass = String(password || '').trim();
    if (!/^\d{9}$/.test(sid) || !/^\d{4,8}$/.test(pass) || !token) {
      return { error: 'bad' };
    }
    const existing = this.get(sid);
    if (existing) {
      if (existing.token === token) {
        existing.lastSeen = Date.now();
        existing.hostSeen = Date.now();
        return { session: existing };
      }
      return { error: 'taken' };
    }
    return this._put(sid, pass, token);
  }

  get(id) {
    return this.byId.get(String(id || '')) || null;
  }

  resumeHost(id, token) {
    const sess = this.get(id);
    if (!sess) return null;
    if (sess.token !== token) return null;
    sess.lastSeen = Date.now();
    sess.hostSeen = Date.now();
    return sess;
  }

  setPassword(sess, password) {
    const p = String(password || '').trim();
    if (!/^\d{4,8}$/.test(p)) return false;
    sess.salt = crypto.randomBytes(8).toString('hex');
    sess.passHash = hashPass(p, sess.salt);
    sess.lastSeen = Date.now();
    return true;
  }

  joinViewer(id, password) {
    const sess = this.get(id);
    if (!sess) return { error: 'ID tidak ditemukan' };
    if (hashPass(password, sess.salt) !== sess.passHash) {
      return { error: 'Password salah' };
    }
    sess.lastSeen = Date.now();
    return { session: sess };
  }

  attachHost(sess, ws) {
    if (sess.host && sess.host !== ws) {
      try { sess.host.close(); } catch (_) {}
    }
    sess.host = ws;
    sess.hostSeen = Date.now();
    sess.lastSeen = Date.now();
  }

  attachViewer(sess, ws) {
    sess.viewers.add(ws);
    sess.lastSeen = Date.now();
  }

  detach(ws) {
    for (const sess of this.byId.values()) {
      if (sess.host === ws) sess.host = null;
      if (sess.viewers.has(ws)) sess.viewers.delete(ws);
    }
  }

  sweep(now = Date.now()) {
    for (const [id, sess] of this.byId) {
      const hostGone = !sess.host && now - sess.hostSeen > HOST_GRACE_MS;
      const idle = now - sess.lastSeen > SESSION_TTL_MS;
      if (hostGone || idle) this.byId.delete(id);
    }
  }

  stats() {
    return { sessions: this.byId.size };
  }
}

module.exports = {
  SessionStore,
  makeId,
  makePassword,
  makeToken,
  hashPass,
  SESSION_TTL_MS,
  HOST_GRACE_MS
};
