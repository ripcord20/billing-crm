'use strict';

/**
 * CdataOltService.js
 * ─────────────────────────────────────────────────────────────────────
 * OLT C-DATA FD16xx.
 *
 * Dua dialek CLI:
 *   1) Huawei-like (FD1604S V3, terverifikasi live):
 *        enable → config → show ont info all
 *        interface gpon 0/0 → show ont optical-info <pon> all
 *   2) Cortina (FD12xx / firmware lama):
 *        configure terminal → interface gpon 0/<port> → show onu_information
 *
 * Default account pabrik (sebagian unit): admin / Xpon@Olt9417#
 * ─────────────────────────────────────────────────────────────────────
 */

const GponCliOltService = require('./GponCliOltService');

class CdataOltService extends GponCliOltService {
  constructor(config = {}) {
    super(Object.assign({}, config, {
      brand: 'cdata',
      timeout: config.timeout || 25000,
      cmd: Object.assign({
        enter:         'config',
        exit:          'end',
        ifEnter:       'interface gpon 0/0',
        ifExit:        'exit',
        versionCheck:  'show version',
        sysInfo:       'show version',
        onuList:       'show ont info all',
        onuListPort:   'show ont info {port} all',
        onuOptical:    'show ont optical-info {port} {id}',
        onuOpticalAll: 'show ont optical-info {port} all',
        onuDetail:     'show ont info {port} {id}',
        onuVersion:    'show ont version {port} {id}',
        uncfg:         'show ont autofind all',
        authorize:     'ont add {port} {id} sn-auth {sn}',
        editName:      'ont modify {port} {id} desc {name}',
        editDesc:      'ont modify {port} {id} desc {desc}',
        reboot:        'ont reboot {port} {id}',
        del:           'ont delete {port} {id}',
      }, config.cmd || {}),
    }));
    // FD1604S = 4 PON. Dipakai hanya sebagai batas, bukan untuk scan 16 port.
    this.defaultPonPorts = config.defaultPonPorts || 4;
    this._dialect = 'huawei';
    // FD1604S menolak "screen-length 0 temporary" / "terminal length 0".
    // Paging "--More ( Press 'Q' to quit )--" ditangani di BaseCliOltService.
    this.pagingOffCmd = config.pagingOffCmd != null ? config.pagingOffCmd : '';
  }

  // Buang jejak pager C-DATA yang bisa memotong baris di tengah nama/SN.
  _cleanCli(out) {
    let s = String(out || '')
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
      .replace(/\x08/g, '')
      .replace(/--More\s*\([^)]*\)--/gi, ' ')
      .replace(/--\s*more\s*--/gi, ' ')
      .replace(/\r/g, '');
    // Pager C-DATA sering menempel baris berikutnya di ujung baris sebelumnya.
    s = s.replace(/(\S)[ \t]+(?=\d+\/\d+\s+\d+\s+\d+\s+[0-9A-Za-z]{8,})/g, '$1\n');
    s = s.replace(/(-?\d+\.\d+)\s+(?=\d+\s+-?\d+\.\d+)/g, '$1\n');
    return s;
  }

  async _enterEnable() {
    await this._safeExec('enable');
    if (this.enablePassword) await this._safeExec(this.enablePassword);
  }

  async _enterConfig() {
    await this._enterEnable();
    if (this._dialect === 'cortina') {
      await this.exec('configure terminal');
      return;
    }
    const out = await this.exec(this.cmd.enter);
    if (/unknown command/i.test(String(out))) {
      this._dialect = 'cortina';
      await this.exec('configure terminal');
    }
  }

  async _enterBoard() {
    await this._enterConfig();
    if (this._dialect === 'cortina') return;
    await this.exec(this.cmd.ifEnter);
  }

  _pack(list) {
    const byPon = {};
    for (const o of list) {
      const key = String(o.pon);
      if (!byPon[key]) byPon[key] = { port: key, total: 0, online: 0, offline: 0 };
      byPon[key].total++;
      if (o.status === 'online') byPon[key].online++;
      else byPon[key].offline++;
    }
    const ports = Object.values(byPon).sort((a, b) => Number(a.port) - Number(b.port));
    return {
      onus: list,
      ports,
      scannedPorts: ports.map((p) => String(p.port)),
      scanned: ports.length,
    };
  }

  // ── Daftar semua ONU: satu perintah global, bukan scan 16 interface ──
  async getAllOnus({ withPower = true, ports = null } = {}) {
    await this._enterConfig();
    const raw = this._cleanCli(await this.exec(this.cmd.onuList));
    if (/unknown command/i.test(raw)) {
      await this._exitConfig();
      return this._getAllOnusCortina(arguments[0] || {});
    }
    let list = this.parseOnuList(raw);
    if (ports && ports.length) {
      const want = new Set(ports.map((p) => String(this._normPort(p))).filter((p) => p != null));
      list = list.filter((o) => want.has(String(o.pon)));
    }
    // Frontend power-batch khusus ZTE; C-DATA harus mengisi Rx di sini.
    // 1 perintah optik per PON (FD1604S max 4) — tidak mahal.
    if (list.length) await this._attachOptical(list);
    await this._exitConfig();
    return this._pack(list);
  }

  async _getAllOnusCortina(opts) {
    this._dialect = 'cortina';
    const saved = Object.assign({}, this.cmd);
    Object.assign(this.cmd, {
      enter:      'configure terminal',
      onuList:    'show onu_information',
      ifEnter:    'interface gpon 0/{port}',
      onuOptical: 'show onu optical-info {id} all',
    });
    try {
      return await super.getAllOnus(opts);
    } finally {
      Object.assign(this.cmd, saved);
    }
  }

  async _attachOptical(list) {
    const outIf = await this.exec(this.cmd.ifEnter);
    if (/unknown command|invalid|does not exist/i.test(String(outIf))) return;
    const pons = [...new Set(list.map((o) => o.pon))];
    for (const pon of pons) {
      const optOut = this._cleanCli(await this._safeExec(this._fmt(this.cmd.onuOpticalAll, { port: pon })));
      const byId = this.parseOpticalTable(optOut);
      for (const o of list) {
        if (String(o.pon) !== String(pon)) continue;
        const p = byId.get(Number(o.onu_id));
        if (!p) {
          if (o.onu_rx_dbm === undefined) {
            o.onu_rx_dbm = null;
            o.quality = o.status === 'online' ? 'unknown' : 'los';
          }
          continue;
        }
        o.onu_rx_dbm = p.onu_rx_dbm;
        o.onu_tx_dbm = p.onu_tx_dbm;
        o.olt_rx_dbm = p.olt_rx_dbm;
        o.quality = p.quality;
      }
    }
    await this._safeExec(this.cmd.ifExit);
  }

  async getOnuState(portRef, { withPower = false } = {}) {
    const port = this._normPort(portRef);
    if (port == null) throw new Error('PON port tidak valid: ' + portRef);
    await this._enterConfig();
    const raw = this._cleanCli(await this.exec(this._fmt(this.cmd.onuListPort, { port })));
    if (/unknown command/i.test(raw)) {
      await this._exitConfig();
      return super.getOnuState(portRef, { withPower });
    }
    let list = this.parseOnuList(raw, port);
    if (withPower && list.length) await this._attachOptical(list);
    await this._exitConfig();
    return list;
  }

  async discoverPonPorts() {
    await this._enterConfig();
    const raw = this._cleanCli(await this.exec(this.cmd.onuList));
    await this._exitConfig();
    if (/unknown command/i.test(raw)) {
      this._dialect = 'cortina';
      return super.discoverPonPorts();
    }
    const ports = [...new Set(this.parseOnuList(raw).map((o) => String(o.pon)))];
    return ports.length ? ports : ['1', '2', '3', '4'];
  }

  async getUncfgOnu() {
    await this._enterConfig();
    const out = this._cleanCli(await this._safeExec(this.cmd.uncfg));
    await this._exitConfig();
    return this.parseUncfg(out);
  }

  async getOnuDetail(portRef, onuId) {
    const port = this._normPort(portRef);
    onuId = parseInt(onuId);
    await this._enterBoard();
    if (this._dialect === 'cortina') {
      await this._exitConfig();
      return super.getOnuDetail(portRef, onuId);
    }
    const [detOut, optOut, verOut] = [
      this._cleanCli(await this._safeExec(this._fmt(this.cmd.onuDetail, { port, id: onuId }))),
      this._cleanCli(await this._safeExec(this._fmt(this.cmd.onuOptical, { port, id: onuId }))),
      this._cleanCli(await this._safeExec(this._fmt(this.cmd.onuVersion, { port, id: onuId }))),
    ];
    await this._exitIf();
    const detail = this.parseOnuDetail(detOut, port, onuId);
    if (!detail.type) {
      const eq = String(verOut).match(/Equipment-ID\s*:\s*(\S+)/i);
      if (eq) detail.type = eq[1];
    }
    detail.power = this.parseOpticalDetail(optOut, onuId);
    return detail;
  }

  async getOnuPower(portRef, onuId) {
    const port = this._normPort(portRef);
    onuId = parseInt(onuId);
    await this._enterBoard();
    if (this._dialect === 'cortina') {
      await this._exitConfig();
      return super.getOnuPower(portRef, onuId);
    }
    const out = this._cleanCli(await this.exec(this._fmt(this.cmd.onuOptical, { port, id: onuId })));
    await this._exitIf();
    return this.parseOpticalDetail(out, onuId);
  }

  async authorizeOnu({ port, onuId, type, sn, name, description }) {
    const p = this._normPort(port);
    onuId = parseInt(onuId);
    if (p == null || !onuId || !sn) throw new Error('port, onuId, dan sn wajib diisi');
    await this._enterBoard();
    if (this._dialect === 'cortina') {
      await this._exitConfig();
      return super.authorizeOnu({ port, onuId, type, sn, name, description });
    }
    let out = await this.exec(this._fmt(this.cmd.authorize, { port: p, id: onuId, sn }));
    const desc = description || name;
    if (desc) out += '\n' + await this._safeExec(this._fmt(this.cmd.editDesc, { port: p, id: onuId, desc }));
    await this._exitIf();
    if (/error|invalid|fail|denied|unknown command/i.test(out)) {
      throw new Error('Authorize ditolak: ' + this._firstError(out));
    }
    return { success: true, port: p, onuId };
  }

  async editOnu(portRef, onuId, { name, description } = {}) {
    const p = this._normPort(portRef);
    const desc = description !== undefined ? description : name;
    await this._enterBoard();
    if (this._dialect === 'cortina') {
      await this._exitConfig();
      return super.editOnu(portRef, onuId, { name, description });
    }
    const out = await this.exec(this._fmt(this.cmd.editDesc, { port: p, id: onuId, desc: desc || '' }));
    await this._exitIf();
    if (/error|invalid|fail|unknown command/i.test(out)) {
      throw new Error('Edit ONU gagal: ' + this._firstError(out));
    }
    return { success: true };
  }

  async rebootOnu(portRef, onuId) {
    const p = this._normPort(portRef);
    await this._enterBoard();
    if (this._dialect === 'cortina') {
      await this._exitConfig();
      return super.rebootOnu(portRef, onuId);
    }
    const out = await this.exec(this._fmt(this.cmd.reboot, { port: p, id: onuId }));
    await this._exitIf();
    if (/error|invalid|fail|unknown command/i.test(out)) {
      throw new Error('Reboot gagal: ' + this._firstError(out));
    }
    return { success: true };
  }

  async deleteOnu(portRef, onuId) {
    const p = this._normPort(portRef);
    await this._enterBoard();
    if (this._dialect === 'cortina') {
      await this._exitConfig();
      return super.deleteOnu(portRef, onuId);
    }
    const out = await this.exec(this._fmt(this.cmd.del, { port: p, id: onuId }));
    await this._exitIf();
    if (/error|invalid|fail|unknown command/i.test(out)) {
      throw new Error('Hapus gagal: ' + this._firstError(out));
    }
    return { success: true };
  }

  // ════════════════════════════════════════════════════════════════════
  // PARSERS — tabel Huawei FD1604S `show ont info all`
  //   F/S P  ONT-ID  SN  Control  Run  Config  Match  Last-down  Desc
  //   0/0 1  1       ZTEGCC1FBAD8 Active Online success match dying-gasp ERNI
  // ════════════════════════════════════════════════════════════════════
  parseOnuList(out, portFilter = null) {
    const list = [];
    const seen = new Set();
    const text = this._cleanCli(out);
    String(text).split('\n').forEach((line) => {
      const t = line.trim();
      if (!t) return;
      if (/^total\s*:/i.test(t) || /^[-]{5,}/.test(t)) return;
      if (/f\/s|ont-id|control\s+flag|run\s+state|down-cause|description/i.test(t) && !/[0-9A-Za-z]{8,}/.test(t)) return;

      // 0/0 1 1 ZTEGCC1FBAD8 Active Online success match dying-gasp ERNI
      let m = t.match(/^(\d+\/\d+)\s+(\d+)\s+(\d+)\s+([0-9A-Za-z]{8,16})\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
      let frameSlot = null;
      let pon;
      let onuId;
      let sn;
      let control;
      let run;
      let desc;
      if (m) {
        frameSlot = m[1];
        pon = parseInt(m[2], 10);
        onuId = parseInt(m[3], 10);
        sn = m[4];
        control = m[5];
        run = m[6];
        desc = (m[10] || '').trim();
      } else {
        // Tanpa F/S: 1 1 ZTEGCC1FBAD8 Active Online ...
        m = t.match(/^(\d+)\s+(\d+)\s+([0-9A-Za-z]{8,16})\s+(\S+)\s+(\S+)/);
        if (m) {
          pon = parseInt(m[1], 10);
          onuId = parseInt(m[2], 10);
          sn = m[3];
          control = m[4];
          run = m[5];
          const rest = t.slice(m[0].length).trim().split(/\s+/);
          desc = rest.length >= 3 ? rest.slice(3).join(' ') : '';
        } else {
          return;
        }
      }

      if (!onuId || !sn || /^\d+$/.test(sn)) return;
      if (portFilter != null && pon !== Number(portFilter)) return;
      const key = `${pon}/${onuId}`;
      if (seen.has(key)) return;
      seen.add(key);

      const runL = String(run || '').toLowerCase();
      const ctlL = String(control || '').toLowerCase();
      let status = 'offline';
      if (/deactiv|disable/.test(ctlL)) status = 'disabled';
      else if (/online/.test(runL)) status = 'online';

      const name = (!desc || desc === '--') ? null : desc;
      list.push({
        onu_id: onuId,
        port: pon,
        pon: String(pon),
        board: frameSlot || '0/0',
        onu_if: `${pon}/${onuId}`,
        sn,
        type: null,
        name,
        admin_state: control || null,
        phase_state: run || null,
        status,
      });
    });
    return list;
  }

  parseUncfg(out) {
    const list = [];
    const text = this._cleanCli(out);
    if (/no ont available|no onu available/i.test(text)) return list;
    String(text).split('\n').forEach((line) => {
      const t = line.trim();
      const m = t.match(/(?:^|\s)(\d+)\s+(\d+)\s+([0-9A-Za-z]{8,16})/);
      if (!m) return;
      if (/sn|serial|ont-id|f\/s/i.test(t) && !/[0-9A-Za-z]{8,}/.test(m[3])) return;
      list.push({
        port: parseInt(m[1], 10),
        onu_id: parseInt(m[2], 10),
        sn: m[3],
        state: 'autofind',
        next_onu_id: null,
      });
    });
    return list;
  }

  // show ont optical-info <pon> all
  //   ONT-ID  Rx(dBm)  Tx(dBm)  OLT-Rx(dBm)  Temp  Volt  Current
  //   1       -21.00   2.35     -28.54       54.02 3.40  13.87
  parseOpticalTable(out) {
    const map = new Map();
    const text = this._cleanCli(out);
    String(text).split('\n').forEach((line) => {
      const t = line.trim();
      const m = t.match(/^(\d+)\s+(-?\d+\.\d+|--+)\s+(-?\d+\.\d+|--+)(?:\s+(-?\d+\.\d+|--+))?/);
      if (!m) return;
      if (/ont|rx\s*power|id\b/i.test(t) && !/^-?\d+\.\d+/.test(m[2])) return;
      const onuId = parseInt(m[1], 10);
      const rx = m[2].startsWith('--') ? null : parseFloat(m[2]);
      const tx = m[3].startsWith('--') ? null : parseFloat(m[3]);
      const oltRx = m[4] && !String(m[4]).startsWith('--') ? parseFloat(m[4]) : null;
      map.set(onuId, {
        onu_rx_dbm: Number.isFinite(rx) ? rx : null,
        onu_tx_dbm: Number.isFinite(tx) ? tx : null,
        olt_rx_dbm: Number.isFinite(oltRx) ? oltRx : null,
        quality: this._quality(rx),
      });
    });
    return map;
  }

  parseOpticalDetail(out, onuId) {
    const s = this._cleanCli(out);
    const grab = (re) => {
      const m = s.match(re);
      return m ? parseFloat(m[1]) : null;
    };
    let onu_rx = grab(/Rx\s+optical\s+power\s*\(dBm\)\s*:\s*(-?\d+\.\d+)/i);
    let onu_tx = grab(/Tx\s+optical\s+power\s*\(dBm\)\s*:\s*(-?\d+\.\d+)/i);
    let olt_rx = grab(/OLT\s+Rx\s+ONT\s+optical\s+power\s*\(dBm\)\s*:\s*(-?\d+\.\d+)/i);
    if (onu_rx == null) {
      const row = this.parseOpticalTable(s).get(parseInt(onuId, 10));
      if (row) {
        onu_rx = row.onu_rx_dbm;
        onu_tx = row.onu_tx_dbm;
        olt_rx = row.olt_rx_dbm;
      }
    }
    return {
      onu_if: `?/${onuId}`,
      onu_rx_dbm: onu_rx,
      onu_tx_dbm: onu_tx,
      olt_rx_dbm: olt_rx,
      olt_tx_dbm: null,
      no_signal: onu_rx == null,
      quality: this._quality(onu_rx),
      raw: s.trim().slice(0, 2000),
    };
  }

  parseOptical(out, onuId) {
    return this.parseOpticalDetail(out, onuId);
  }

  _quality(rx) {
    if (rx == null || !Number.isFinite(Number(rx))) return 'unknown';
    const n = Number(rx);
    if (n >= this.rxGood) return 'good';
    if (n >= this.rxWarning) return 'warning';
    return 'critical';
  }

  parseOnuDetail(out, port, onuId) {
    const s = this._cleanCli(out);
    const get = (label) => {
      const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*(.+)', 'i');
      const m = s.match(re);
      return m ? m[1].trim().replace(/\s+$/, '') : null;
    };
    const snRaw = get('SN') || get('Serial');
    const sn = snRaw ? snRaw.replace(/\s*\(.*\)$/, '').trim() : null;
    const distStr = get('Distance(m)') || get('Distance');
    const run = get('Run state') || get('Run');
    return {
      onu_if:        `${port}/${onuId}`,
      name:          get('Description'),
      type:          get('Equipment-ID') || get('Type') || get('Product-ID'),
      state:         run,
      admin_state:   get('Control flag'),
      phase_state:   run,
      auth_mode:     get('Authentic mode') || get('Auth'),
      serial_number: sn,
      description:   get('Description'),
      distance_m:    distStr ? (parseInt(String(distStr).replace(/[^\d]/g, ''), 10) || null) : null,
      online_duration: get('Online  time') || get('Online time'),
      raw: s.trim().slice(0, 4000),
    };
  }
}

module.exports = CdataOltService;
