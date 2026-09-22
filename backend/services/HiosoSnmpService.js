'use strict';

/**
 * SNMP HIOSO EPON (enterprise 25355) — dipakai saat Telnet/SSH tertutup.
 * Tabel ONU: 1.3.6.1.4.1.25355.3.2.6.3.2.1
 *   .11 SN/MAC  .37 nama  .39 status (1 online / 2 offline)
 * Optik: 1.3.6.1.4.1.25355.3.2.6.14.2.1  .4 TX  .8 RX (string dBm)
 * Indeks: board.pon.onu  (contoh 1.2.1 = PON2 ONU1)
 */

const logger = require('../utils/logger');

let snmp;
try { snmp = require('net-snmp'); } catch (e) {
  logger.warn('[HiosoSnmp] net-snmp tidak terinstall');
}

const OID = {
  SYS_DESCR: '1.3.6.1.2.1.1.1.0',
  SYS_NAME:  '1.3.6.1.2.1.1.5.0',
  SYS_UP:    '1.3.6.1.2.1.1.3.0',
  ONU_SN:    '1.3.6.1.4.1.25355.3.2.6.3.2.1.11',
  ONU_NAME:  '1.3.6.1.4.1.25355.3.2.6.3.2.1.37',
  ONU_STAT:  '1.3.6.1.4.1.25355.3.2.6.3.2.1.39',
  ONU_TX:    '1.3.6.1.4.1.25355.3.2.6.14.2.1.4',
  ONU_RX:    '1.3.6.1.4.1.25355.3.2.6.14.2.1.8',
};

class HiosoSnmpService {
  constructor(config = {}) {
    this.host = config.host;
    this.community = config.community || config.snmpCommunity || 'public';
    this.port = config.port || config.snmpPort || 161;
    this.timeout = config.timeout || 10000;
    this.name = config.name || config.host;
    this._session = null;
  }

  _getSession() {
    if (this._session) return this._session;
    if (!snmp) throw new Error('net-snmp tidak terinstall');
    this._session = snmp.createSession(this.host, this.community, {
      port: this.port, timeout: this.timeout, retries: 1, version: snmp.Version2c,
    });
    this._session.on('error', () => { this._session = null; });
    return this._session;
  }

  closeSession() {
    if (this._session) { try { this._session.close(); } catch (e) {} this._session = null; }
  }

  _get(oids) {
    return new Promise((resolve, reject) => {
      this._getSession().get(oids, (err, vbs) => err ? reject(err) : resolve(vbs));
    });
  }

  _walk(oid) {
    return new Promise((resolve, reject) => {
      const results = [];
      this._getSession().subtree(oid, 20, (varbinds) => {
        for (const v of varbinds) {
          if (!snmp.isVarbindError(v)) results.push({ oid: v.oid, value: v.value });
        }
      }, (err) => err ? reject(err) : resolve(results));
    });
  }

  _asTxt(raw) {
    if (raw == null) return null;
    const s = Buffer.isBuffer(raw)
      ? raw.toString('utf8').replace(/\x00/g, '').replace(/[^\x20-\x7e]/g, '').trim()
      : String(raw).replace(/"/g, '').trim();
    return s || null;
  }

  _asMac(raw) {
    const s = this._asTxt(raw);
    if (!s) return null;
    const hex = s.replace(/[^0-9a-f]/gi, '');
    if (hex.length === 12) return hex.match(/.{2}/g).join(':').toUpperCase();
    if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(s)) return s.toUpperCase();
    return s.toUpperCase();
  }

  _asDbm(raw) {
    if (raw == null || raw === '') return null;
    const n = parseFloat(this._asTxt(raw) ?? raw);
    return Number.isFinite(n) && n !== 0 ? parseFloat(n.toFixed(2)) : null;
  }

  _splitIdx(fullOid, base) {
    const rest = String(fullOid).replace(base + '.', '');
    const p = rest.split('.').map((x) => parseInt(x, 10));
    if (p.length < 3 || p.some((n) => !Number.isFinite(n))) return null;
    return { board: p[0], pon: p[1], onu: p[2], key: rest };
  }

  _quality(rx) {
    if (rx == null) return 'unknown';
    if (rx >= -25) return 'good';
    if (rx >= -28) return 'warning';
    return 'critical';
  }

  async getAllOnus() {
    if (!snmp) throw new Error('net-snmp tidak terinstall');
    const fields = [
      { key: 'name', oid: OID.ONU_NAME },
      { key: 'sn', oid: OID.ONU_SN },
      { key: 'stat', oid: OID.ONU_STAT },
      { key: 'rx', oid: OID.ONU_RX },
      { key: 'tx', oid: OID.ONU_TX },
    ];
    const walks = await Promise.allSettled(
      fields.map((f) => this._walk(f.oid).then((rows) => ({ ...f, rows })))
    );
    const map = new Map();
    for (const r of walks) {
      if (r.status !== 'fulfilled') continue;
      const { key, oid, rows } = r.value;
      for (const row of rows) {
        const idx = this._splitIdx(row.oid, oid);
        if (!idx) continue;
        if (!map.has(idx.key)) map.set(idx.key, { ...idx });
        map.get(idx.key)[key] = row.value;
      }
    }

    const onus = [];
    const byPon = {};
    for (const raw of map.values()) {
      const name = this._asTxt(raw.name);
      const sn = this._asMac(raw.sn);
      const rx = this._asDbm(raw.rx);
      const tx = this._asDbm(raw.tx);
      const run = parseInt(raw.stat, 10);
      let status = run === 1 ? 'online' : 'offline';
      if (status === 'online' && rx != null && rx < -27) status = 'warning';
      const online = status === 'online' || status === 'warning';
      const o = {
        onu_id: raw.onu,
        board: raw.board,
        pon: raw.pon,
        onu_if: `${raw.pon}/${raw.onu}`,
        gpon_olt: `PON${String(raw.pon).padStart(2, '0')}`,
        name,
        sn,
        type: null,
        status: online ? 'online' : 'offline',
        phase_state: online ? 'working' : 'offline',
        onu_rx_dbm: rx,
        onu_tx_dbm: tx,
        quality: this._quality(rx),
      };
      onus.push(o);
      const pk = String(raw.pon);
      if (!byPon[pk]) byPon[pk] = { port: pk, total: 0, online: 0, offline: 0 };
      byPon[pk].total++;
      if (o.status === 'online') byPon[pk].online++;
      else byPon[pk].offline++;
    }

    logger.info(`[HiosoSnmp:${this.name}] ${onus.length} ONU via SNMP 25355`);
    let system = null;
    try { system = await this.getSystemInfo(); } catch (e) { system = null; }
    return {
      onus,
      ports: Object.values(byPon),
      scanned: Object.keys(byPon).length,
      system: (system && !system.error) ? system : null,
    };
  }

  async getOnuState(ref) {
    const all = await this.getAllOnus();
    const pon = parseInt(String(ref || '').split(/[\/:]/).filter(Boolean)[0], 10);
    if (!Number.isFinite(pon)) return all.onus;
    return all.onus.filter((o) => Number(o.pon) === pon);
  }

  async getOnuDetail(pon, id) {
    const all = await this.getAllOnus();
    const o = all.onus.find((x) => Number(x.pon) === Number(pon) && Number(x.onu_id) === Number(id));
    if (!o) return { error: 'ONU tidak ditemukan' };
    return {
      onu_if: o.onu_if,
      serial_number: o.sn,
      name: o.name,
      type: o.type,
      state: o.status,
      phase_state: o.phase_state,
      power: {
        onu_rx_dbm: o.onu_rx_dbm,
        onu_tx_dbm: o.onu_tx_dbm,
        olt_rx_dbm: null,
        olt_tx_dbm: null,
        no_signal: o.onu_rx_dbm == null,
        quality: o.quality,
      },
    };
  }

  async getPortSummary(ports = []) {
    const all = await this.getAllOnus();
    if (!ports.length) return all.ports;
    const want = new Set(ports.map((p) => String(parseInt(String(p).replace(/.*\//, ''), 10))));
    return all.ports.filter((p) => want.has(String(p.port)));
  }

  async getSystemInfo() {
    if (!snmp) return { error: 'net-snmp tidak terinstall' };
    try {
      const vbs = await this._get([OID.SYS_DESCR, OID.SYS_NAME, OID.SYS_UP]);
      const desc = this._asTxt(vbs[0] && vbs[0].value);
      const name = this._asTxt(vbs[1] && vbs[1].value);
      const ticks = vbs[2] && vbs[2].value != null ? parseInt(vbs[2].value, 10) : NaN;
      this.closeSession();
      let uptime = null;
      if (Number.isFinite(ticks)) {
        let s = Math.floor(ticks / 100);
        const d = Math.floor(s / 86400); s %= 86400;
        const h = Math.floor(s / 3600); s %= 3600;
        const m = Math.floor(s / 60);
        uptime = `${d}d ${h}h ${m}m`;
      }
      return { model: desc || name || this.name, version: null, hw_version: null, uptime, cpu_percent: null, temperature_c: null, raw: desc };
    } catch (err) {
      this.closeSession();
      return { error: err.message };
    }
  }

  async testConnection() {
    if (!snmp) return { success: false, error: 'net-snmp tidak terinstall' };
    try {
      const vbs = await this._get([OID.SYS_DESCR, OID.SYS_NAME]);
      const desc = this._asTxt(vbs[0] && vbs[0].value);
      const name = this._asTxt(vbs[1] && vbs[1].value);
      this.closeSession();
      return {
        success: true,
        sysDescr: desc,
        sysName: name,
        message: `Terhubung ke: ${name || desc || this.host} — ${desc || ''}`.trim(),
      };
    } catch (err) {
      this.closeSession();
      return { success: false, error: err.message };
    }
  }
}

module.exports = HiosoSnmpService;
