'use strict';
const assert = require('assert');
const IsolirPPPoE = require('../services/IsolirPPPoE');

function arg(words, prefix) {
  const w = (words || []).find(x => String(x).startsWith(prefix));
  return w ? w.slice(prefix.length) : null;
}

function makeApi({ secrets = [], sessions = [], failIdRemove = false } = {}) {
  const state = {
    secrets: secrets.map(s => ({ ...s })),
    sessions: sessions.map(s => ({ ...s })),
    calls: []
  };
  return {
    state,
    async run(words) {
      state.calls.push(words.slice());
      const cmd = words[0];
      if (cmd === '/ppp/secret/print') {
        const name = arg(words, '?name=');
        if (name) return state.secrets.filter(s => s.name === name);
        return state.secrets.slice();
      }
      if (cmd === '/ppp/secret/set') {
        const id = arg(words, '=.id=');
        const profile = arg(words, '=profile=');
        const s = state.secrets.find(x => x['.id'] === id);
        if (!s) throw new Error('no such item');
        s.profile = profile;
        return [];
      }
      if (cmd === '/ppp/active/print') {
        const name = arg(words, '?name=');
        if (name) return state.sessions.filter(s => s.name === name);
        return state.sessions.slice();
      }
      if (cmd === '/ppp/active/remove') {
        if (failIdRemove && arg(words, '=.id=')) {
          throw new Error('no such command prefix');
        }
        const id = arg(words, '=numbers=') || arg(words, '=.id=');
        const idx = state.sessions.findIndex(s => s['.id'] === id);
        if (idx < 0) throw new Error('no such item');
        state.sessions.splice(idx, 1);
        return [];
      }
      throw new Error('unexpected ' + cmd);
    }
  };
}

const sequelize = {
  QueryTypes: { SELECT: 'SELECT' },
  async query(sql) {
    if (/app_settings/.test(sql)) {
      return [{ key: 'isolir_pppoe_profile_name', value: 'isolir-profile' }];
    }
    return [];
  }
};

assert.strictEqual(IsolirPPPoE.resolveRestoreProfile('10Mbps'), '10Mbps');
assert.strictEqual(IsolirPPPoE.resolveRestoreProfile('isolir-profile'), 'default');
assert.strictEqual(IsolirPPPoE.resolveRestoreProfile('SKYNET-ISOLIR'), 'default');
assert.strictEqual(IsolirPPPoE.resolveRestoreProfile(''), 'default');
assert.ok(IsolirPPPoE.isIsolirProfileName('SKYNET-ISOLIR'));

(async () => {
  // Kick finds session when ?name= is case-sensitive miss
  {
    const api = makeApi({
      sessions: [{ '.id': '*8', name: 'User1', address: '10.255.255.10' }]
    });
    const r = await IsolirPPPoE.kickActivePppSessions(api, 'user1', { retryDelayMs: 0 });
    assert.strictEqual(r.found, 1);
    assert.strictEqual(r.kicked, 1);
    assert.strictEqual(api.state.sessions.length, 0);
  }

  // Kick uses numbers= when =.id= REST-style remove fails
  {
    const api = makeApi({
      sessions: [{ '.id': '*80000002', name: 'andi', address: '10.255.0.12' }],
      failIdRemove: true
    });
    const r = await IsolirPPPoE.kickActivePppSessions(api, 'andi', { retryDelayMs: 0 });
    assert.strictEqual(r.kicked, 1);
    const usedNumbers = api.state.calls.some(
      c => c[0] === '/ppp/active/remove' && c.some(w => String(w).startsWith('=numbers='))
    );
    assert.ok(usedNumbers, 'expected numbers= remove attempt');
    assert.strictEqual(api.state.sessions.length, 0);
  }

  // Restore switches profile then kicks so isolir IP is released
  {
    const api = makeApi({
      secrets: [{ '.id': '*1', name: 'andi', profile: 'isolir-profile' }],
      sessions: [{ '.id': '*9', name: 'andi', address: '10.255.255.9' }]
    });
    const r = await IsolirPPPoE.restorePPPoEUser(api, 'andi', '10Mbps', { retryDelayMs: 0 });
    assert.strictEqual(r.secretRestored, true);
    assert.strictEqual(r.kicked, 1);
    assert.strictEqual(api.state.secrets[0].profile, '10Mbps');
    assert.strictEqual(api.state.sessions.length, 0);
  }

  // Restore without local secret still kicks (RADIUS / NAS lain)
  {
    const api = makeApi({
      secrets: [],
      sessions: [{ '.id': '*2', name: 'andi', address: '10.255.255.4' }]
    });
    const r = await IsolirPPPoE.restorePPPoEUser(api, 'andi', '10Mbps', {
      allowMissingSecret: true,
      retryDelayMs: 0
    });
    assert.strictEqual(r.secretRestored, false);
    assert.strictEqual(r.kicked, 1);
    assert.strictEqual(api.state.sessions.length, 0);
  }

  // Do not restore onto isolir-profile itself
  {
    const api = makeApi({
      secrets: [{ '.id': '*1', name: 'andi', profile: 'isolir-profile' }],
      sessions: []
    });
    await IsolirPPPoE.restorePPPoEUser(api, 'andi', 'isolir-profile', { retryDelayMs: 0 });
    assert.strictEqual(api.state.secrets[0].profile, 'default');
  }

  // Isolir still kicks after profile switch
  {
    const api = makeApi({
      secrets: [{ '.id': '*1', name: 'andi', profile: '10Mbps' }],
      sessions: [{ '.id': '*3', name: 'andi', address: '10.20.0.9' }]
    });
    const r = await IsolirPPPoE.isolirPPPoEUser(api, 'andi', sequelize, 7, { retryDelayMs: 0 });
    assert.strictEqual(r.secretRestored, true);
    assert.strictEqual(r.kicked, 1);
    assert.strictEqual(api.state.secrets[0].profile, 'isolir-profile');
    assert.strictEqual(api.state.sessions.length, 0);
  }

  console.log('isolirRestoreKick.test.js ok');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
