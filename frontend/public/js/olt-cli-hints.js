/* OltCliHints — petunjuk perintah CLI ZTE C300/C320.
   Dipakai Diagnostik CLI (web) dan dijaga selaras dengan ZteCliCoach.java (APK).
   Node: module.exports; browser: window.OltCliHints
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OltCliHints = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COMMANDS = [
    'show card',
    'show card-temperature',
    'show processor',
    'show temperature',
    'show version',
    'show vlan summary',
    'show vlan',
    'show onu-type gpon',
    'show gpon onu uncfg',
    'show gpon onu state',
    'show gpon onu detail-info',
    'show gpon onu optical-info',
    'show gpon onu baseinfo',
    'show gpon onu remote-info',
    'show gpon profile tcont',
    'show gpon profile traffic',
    'show current-config',
    'show running-config',
    'show pon power attenuation',
    'show mac',
    'terminal length 0',
    'configure terminal'
  ];

  var EXACT_OK = {
    'conf t': 1,
    'configure t': 1,
    'configure terminal': 1,
    'conf terminal': 1,
    'end': 1,
    'exit': 1,
    'write': 1,
    'wr': 1,
    'enable': 1,
    'disable': 1
  };

  var SKIP_FIRST = {
    interface: 1, 'pon-onu-mng': 1, onu: 1, int: 1, vlan: 1,
    tcont: 1, gemport: 1, 'service-port': 1, write: 1, end: 1, exit: 1,
    enable: 1, disable: 1, no: 1, qos: 1, igmp: 1, nni: 1, switchvlan: 1
  };

  var ALIAS = {
    sshow: 'show', shw: 'show', sho: 'show', shwo: 'show', showw: 'show',
    sh0w: 'show', sh: 'show',
    display: 'show', diplay: 'show', dispaly: 'show', disp: 'show',
    unconf: 'uncfg', unconfig: 'uncfg', unconfigured: 'uncfg',
    unconfigure: 'uncfg', 'un-cfg': 'uncfg', autofind: 'uncfg',
    'auto-find': 'uncfg', uncfgd: 'uncfg',
    ont: 'onu', onus: 'onu', onts: 'onu',
    gponn: 'gpon', gppon: 'gpon',
    status: 'state', stat: 'state', sta: 'state', stats: 'state',
    crd: 'card', kartu: 'card', cards: 'card',
    prosesor: 'processor', cpu: 'processor', proc: 'processor',
    temprature: 'temperature', suhu: 'temperature', temperatur: 'temperature',
    vln: 'vlan', vlans: 'vlan',
    sumary: 'summary',
    conf: 'configure', config: 'configure', konfig: 'configure',
    termianl: 'terminal', term: 'terminal',
    lenght: 'length',
    detail: 'detail-info', detailed: 'detail-info',
    optical: 'optical-info', optic: 'optical-info',
    'base-info': 'baseinfo',
    remote: 'remote-info'
  };

  var LINE_ALIAS = [
    { re: /^display\s+ont\s+auto-?find(?:\s+all)?$/i, to: 'show gpon onu uncfg' },
    { re: /^display\s+ont\s+autofind(?:\s+all)?$/i, to: 'show gpon onu uncfg' }
  ];

  var DISTINCTIVE = {
    uncfg: 1, 'optical-info': 1, 'detail-info': 1, baseinfo: 1,
    'remote-info': 1, 'card-temperature': 1, 'onu-type': 1,
    attenuation: 1, tcont: 1
  };

  var TYPO_FROM = {
    sshow: 1, shw: 1, sho: 1, shwo: 1, showw: 1, sh0w: 1,
    diplay: 1, dispaly: 1, gponn: 1, gppon: 1, uncfgd: 1,
    temprature: 1, lenght: 1, termianl: 1, sumary: 1, crd: 1
  };

  var VOCAB = (function () {
    var s = {};
    COMMANDS.forEach(function (c) {
      c.split(/\s+/).forEach(function (t) { s[t] = 1; });
    });
    return Object.keys(s);
  })();

  var ALIAS_KEYS = Object.keys(ALIAS);

  function lev(a, b) {
    if (a === b) return 0;
    var al = a.length, bl = b.length;
    if (!al) return bl;
    if (!bl) return al;
    var prev = new Array(bl + 1);
    var cur = new Array(bl + 1);
    var i, j, c;
    for (j = 0; j <= bl; j++) prev[j] = j;
    for (i = 1; i <= al; i++) {
      cur[0] = i;
      for (j = 1; j <= bl; j++) {
        c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
      }
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[bl];
  }

  function close(a, b) {
    if (a === b) return true;
    var d = lev(a, b);
    var max = Math.max(a.length, b.length);
    if (max <= 2) return false;
    if (max <= 4) return d <= 1;
    return d <= 2;
  }

  function canonToken(t) {
    var k = t.toLowerCase();
    if (ALIAS[k]) return { canon: ALIAS[k], via: 'alias', from: k };
    var i, key;
    for (i = 0; i < ALIAS_KEYS.length; i++) {
      key = ALIAS_KEYS[i];
      if (close(k, key)) return { canon: ALIAS[key], via: 'typo', from: k };
    }
    for (i = 0; i < VOCAB.length; i++) {
      key = VOCAB[i];
      if (close(k, key)) {
        return { canon: key, via: k === key ? 'exact' : 'typo', from: k };
      }
    }
    return { canon: k, via: 'exact', from: k };
  }

  function tokenize(s) {
    return String(s || '')
      .replace(/ZXAN(?:\([^)]+\))?#/gi, ' ')
      .replace(/[?]+$/g, '')
      .trim()
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
  }

  function isArg(t) {
    return /^(gpon-olt_|gpon-onu_|epon-olt_|epon-onu_)/i.test(t)
      || /^\d+\/\d+(?:\/\d+)?(?::\d+)?$/.test(t);
  }

  function peel(tokens) {
    var core = tokens.slice();
    var args = [];
    while (core.length) {
      var t = core[core.length - 1];
      if (t === 'all' || isArg(t)) args.unshift(core.pop());
      else break;
    }
    return { core: core, args: args };
  }

  function normalizeJoin(tokens) {
    return tokens.join(' ').replace(/\s+/g, ' ').trim();
  }

  function withArgs(cmd, args) {
    if (!args || !args.length) return cmd;
    var keep = args.filter(function (a) { return a !== 'all'; });
    return keep.length ? cmd + ' ' + keep.join(' ') : cmd;
  }

  function isPrefixOf(core, ct) {
    if (core.length === 0 || core.length >= ct.length) return false;
    var i;
    for (i = 0; i < core.length; i++) {
      if (core[i] !== ct[i]) return false;
    }
    return true;
  }

  function scoreAgainst(coreMapped, catalogTokens) {
    var used = [];
    var i, j, mapped, tok, found, orderIdx, lastPos, orderWrong;
    mapped = [];
    for (i = 0; i < coreMapped.length; i++) {
      tok = coreMapped[i];
      found = -1;
      for (j = 0; j < catalogTokens.length; j++) {
        if (used[j]) continue;
        if (catalogTokens[j] === tok.canon) { found = j; break; }
      }
      if (found < 0) {
        mapped.push({ typed: tok.from, canon: tok.canon, via: tok.via, cat: null });
      } else {
        used[found] = true;
        mapped.push({
          typed: tok.from,
          canon: tok.canon,
          via: tok.via,
          cat: catalogTokens[found],
          pos: found
        });
      }
    }
    var matched = mapped.filter(function (m) { return m.cat; });
    var missing = [];
    for (j = 0; j < catalogTokens.length; j++) {
      if (!used[j]) missing.push(catalogTokens[j]);
    }
    var extra = mapped.filter(function (m) { return !m.cat; });
    lastPos = -1;
    orderWrong = false;
    for (i = 0; i < matched.length; i++) {
      orderIdx = matched[i].pos;
      if (orderIdx < lastPos) orderWrong = true;
      lastPos = orderIdx;
    }
    var typos = [];
    var aliases = [];
    matched.forEach(function (m) {
      if (m.typed !== m.cat) {
        if (TYPO_FROM[m.typed] || m.via === 'typo') typos.push([m.typed, m.cat]);
        else if (m.via === 'alias' && ALIAS[m.typed] === m.cat) aliases.push([m.typed, m.cat]);
        else typos.push([m.typed, m.cat]);
      }
    });
    extra.forEach(function (m) {
      if (m.via === 'typo' || m.via === 'alias') typos.push([m.typed, m.canon]);
    });

    var score = 0;
    if (catalogTokens.length) score += (matched.length / catalogTokens.length) * 70;
    if (coreMapped.length) score += (matched.length / coreMapped.length) * 30;
    if (orderWrong) score -= 8;
    score -= aliases.length * 4;
    score -= typos.length * 8;
    score -= missing.length * 12;
    score -= extra.length * 18;
    matched.forEach(function (m) {
      if (DISTINCTIVE[m.cat]) score += 22;
    });
    return {
      score: score,
      matched: matched,
      missing: missing,
      extra: extra,
      orderWrong: orderWrong,
      typos: typos,
      aliases: aliases
    };
  }

  function buildReason(hit, correct) {
    var parts = [];
    if (hit.typos.length) {
      parts.push('Salah ketik: ' + hit.typos.map(function (p) { return p[0] + ' → ' + p[1]; }).join(', '));
    }
    if (hit.aliases.length) {
      parts.push('Kata ZTE: ' + hit.aliases.map(function (p) { return p[0] + ' → ' + p[1]; }).join(', '));
    }
    if (hit.orderWrong) parts.push('Urutan kata salah');
    if (hit.missing.length && hit.matched.length) {
      parts.push('Kurang kata: ' + hit.missing.join(', '));
    }
    if (!parts.length && hit.missing.length) {
      parts.push('Lanjut yang sering dipakai');
    }
    if (!parts.length) parts.push('Perintah tidak dikenali');
    return parts.join('. ') + '. Yang benar: ' + correct;
  }

  function kindOf(hit, isPrefix) {
    if (isPrefix) return 'prefix';
    if ((hit.typos.length || hit.aliases.length) && hit.orderWrong) return 'both';
    if (hit.orderWrong) return 'order';
    if (hit.typos.length) return 'typo';
    if (hit.aliases.length) return 'alias';
    if (hit.missing.length) return 'missing';
    return 'other';
  }

  function hint(raw) {
    var typed = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!typed) return null;
    var compact = typed.toLowerCase();
    if (EXACT_OK[compact]) return null;

    var i;
    for (i = 0; i < LINE_ALIAS.length; i++) {
      if (LINE_ALIAS[i].re.test(compact)) {
        return {
          correct: LINE_ALIAS[i].to,
          reason: 'Itu perintah Huawei. Di ZTE: ' + LINE_ALIAS[i].to,
          highConfidence: true,
          kind: 'alias',
          alternatives: []
        };
      }
    }

    var tokens = tokenize(typed);
    if (!tokens.length) return null;
    var first = tokens[0];
    var firstCanon = canonToken(first).canon;
    if (SKIP_FIRST[first] && firstCanon !== 'show' && firstCanon !== 'configure' && firstCanon !== 'terminal') {
      return null;
    }

    var peeled = peel(tokens);
    var core = peeled.core;
    var args = peeled.args;
    if (!core.length) return null;

    var coreJoin = normalizeJoin(core);
    for (i = 0; i < COMMANDS.length; i++) {
      if (coreJoin === COMMANDS[i]) return null;
    }

    var tooShort = core.length < 2 && typed.replace(/\s/g, '').length < 8;
    var mapped = core.map(canonToken);

    var best = [];
    for (i = 0; i < COMMANDS.length; i++) {
      var ct = COMMANDS[i].split(/\s+/);
      var mappedCanon = mapped.map(function (m) { return m.canon; });
      if (isPrefixOf(mappedCanon, ct) && mappedCanon.every(function (t, idx) { return t === ct[idx]; })) {
        best.push({
          cmd: COMMANDS[i],
          hit: {
            score: 50 + core.length * 8,
            matched: mapped.map(function (m, idx) { return { typed: m.from, cat: ct[idx] }; }),
            missing: ct.slice(core.length),
            extra: [],
            orderWrong: false,
            typos: [],
            aliases: []
          },
          prefix: true
        });
        continue;
      }
      var hit = scoreAgainst(mapped, ct);
      if (hit.matched.length === 0) continue;
      var distinctive = hit.matched.some(function (m) { return DISTINCTIVE[m.cat]; });
      if (hit.score < 48 && !(distinctive && core.length === 1)) continue;
      best.push({ cmd: COMMANDS[i], hit: hit, prefix: false });
    }

    best.sort(function (a, b) {
      if (b.hit.score !== a.hit.score) return b.hit.score - a.hit.score;
      if (a.hit.missing.length !== b.hit.missing.length) return a.hit.missing.length - b.hit.missing.length;
      return a.cmd.length - b.cmd.length;
    });

    if (!best.length) return null;

    var top = best[0];
    var second = best[1];
    var unique = !second || (top.hit.score - second.hit.score) >= 8;
    var correct = withArgs(top.cmd, args);
    if (correct === coreJoin || correct === compact) return null;

    var isPrefix = !!top.prefix && !top.hit.orderWrong && !top.hit.typos.length && !top.hit.aliases.length;
    if (isPrefix && tooShort) return null;
    if (!isPrefix && tooShort && !mapped.some(function (m) { return DISTINCTIVE[m.canon]; })) return null;

    var alternatives = [];
    if (isPrefix) {
      for (i = 0; i < best.length && alternatives.length < 2; i++) {
        if (best[i].prefix) alternatives.push(withArgs(best[i].cmd, args));
      }
      if (alternatives[0] === correct) alternatives = alternatives.slice(1);
    }

    var high = !isPrefix && unique && core.length >= 2 && top.hit.score >= 72
      && top.hit.extra.length <= 1;

    return {
      correct: correct,
      reason: buildReason(top.hit, correct),
      highConfidence: high,
      kind: kindOf(top.hit, isPrefix),
      alternatives: alternatives
    };
  }

  return { hint: hint, COMMANDS: COMMANDS.slice() };
}));
