'use strict';

/**
 * HsgqOltService.js
 * ─────────────────────────────────────────────────────────────────────
 * Service SNMP untuk OLT HSGQ (EPON E04I/E08I + GPON G02ID).
 * Vendor Enterprise OID: 1.3.6.1.4.1.50224
 *
 * Dua MIB dalam satu vendor:
 *
 * 1) E04I EPON — 1.3.6.1.4.1.50224.3.3.2.1  (oltTree.eponONU.onuInfoTable)
 *    Diverifikasi ke 10.2.2.250.
 *    Kolom 2=nama, 4=IP, 7=MAC, 12=HW, 14=FW, 15=RX uint8, 16=seq status.
 *
 * 2) G02ID GPON — 1.3.6.1.4.1.50224.3.12.2.1  (ONT Table di web IGC)
 *    Diverifikasi ke 192.168.94.2 firmware IGC_V1.0.11C_Rel (51 ONT).
 *    Kolom 2=nama, 5=run-state (1 online / 0 offline), 8=vendor, 9=model,
 *    11=HW, 13=SW, 15=SN GPON (HWTC8c531cad), 16=LOID, 20=last-reg, 21=ticks.
 *    Optical: 3.12.3.1.4.{idx}.0 = RX 0.01 dBm, .5.{idx}.0 = TX 0.01 dBm.
 *    Indeks sama: 0x01000100 + ONU  → 16777472 = PON1/ONU0, 16777476 = PON1/ONU4.
 *    Statistik PON 3.2.3.1.{3=total,4=online,5=offline} dipakai sebagai acuan.
 *
 * mibMode: auto (deteksi 3.12 dulu, fallback 3.3) | g02id | hsgq
 * ─────────────────────────────────────────────────────────────────────
 */

const logger = require('../utils/logger');

let snmp;
try {
  snmp = require('net-snmp');
} catch (e) {
  logger.warn('[HsgqOlt] net-snmp tidak terinstall — jalankan: npm install net-snmp');
}

const OID = {
  SYS_DESCR:    '1.3.6.1.2.1.1.1.0',
  SYS_NAME:     '1.3.6.1.2.1.1.5.0',
  SYS_FW:       '1.3.6.1.4.1.50224.3.1.1.6.0',
  ONU_NAME:     '1.3.6.1.4.1.50224.3.3.2.1.2',   // nama pelanggan (E04I)
  ONU_IP:       '1.3.6.1.4.1.50224.3.3.2.1.4',   // IP address
  ONU_MAC:      '1.3.6.1.4.1.50224.3.3.2.1.7',   // MAC (6 byte)
  ONU_HW_VER:   '1.3.6.1.4.1.50224.3.3.2.1.12',  // HW version
  ONU_FW_VER:   '1.3.6.1.4.1.50224.3.3.2.1.14',  // FW version
  ONU_RX_POWER: '1.3.6.1.4.1.50224.3.3.2.1.15',  // RX Power (uint8)
  ONU_SEQ:      '1.3.6.1.4.1.50224.3.3.2.1.16',  // Sequence → 0/65535=offline
};

// G02ID GPON — isi ONT Table di web IGC (bukan eponONU 3.3)
const G02 = {
  ONU_NAME:   '1.3.6.1.4.1.50224.3.12.2.1.2',
  ONU_RUN:    '1.3.6.1.4.1.50224.3.12.2.1.5',
  ONU_VENDOR: '1.3.6.1.4.1.50224.3.12.2.1.8',
  ONU_MODEL:  '1.3.6.1.4.1.50224.3.12.2.1.9',
  ONU_HW:     '1.3.6.1.4.1.50224.3.12.2.1.11',
  ONU_SW:     '1.3.6.1.4.1.50224.3.12.2.1.13',
  ONU_SN:     '1.3.6.1.4.1.50224.3.12.2.1.15',
  ONU_LOID:   '1.3.6.1.4.1.50224.3.12.2.1.16',
  ONU_REG:    '1.3.6.1.4.1.50224.3.12.2.1.20',
  ONU_TICKS:  '1.3.6.1.4.1.50224.3.12.2.1.21',
  ONU_RX:     '1.3.6.1.4.1.50224.3.12.3.1.4',
  ONU_TX:     '1.3.6.1.4.1.50224.3.12.3.1.5',
};

class HsgqOltService {
  constructor(config = {}) {
    this.host      = config.host;
    this.community = config.community || 'public';
    this.port      = config.port      || 161;
    this.timeout   = config.timeout   || 10000;
    this.name      = config.name      || config.host;
    this.mibMode   = String(config.mibMode || 'auto').toLowerCase();
    this._session  = null;
    this._resolvedMib = null;
  }

  _getSession() {
    if (this._session) return this._session;
    if (!snmp) throw new Error('net-snmp tidak terinstall');
    this._session = snmp.createSession(this.host, this.community, {
      port: this.port, timeout: this.timeout, retries: 2, version: snmp.Version2c,
    });
    this._session.on('error', () => { this._session = null; });
    return this._session;
  }

  closeSession() {
    if (this._session) { try { this._session.close(); } catch(e) {} this._session = null; }
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

  _decodeIndex(idx) {
    const i = parseInt(idx);
    return { pon: (i >> 8) & 0xFF, onu: i & 0xFF };
  }

  _extractIndex(fullOid, baseOid) {
    return fullOid.replace(baseOid + '.', '');
  }

  _parseName(raw) {
    if (!raw) return null;
    return Buffer.isBuffer(raw)
      ? raw.toString('utf8').trim().replace(/\x00/g, '') || null
      : String(raw).trim() || null;
  }

  _parseMac(raw) {
    if (!raw || !Buffer.isBuffer(raw) || raw.length !== 6) return null;
    return [...raw].map(b => b.toString(16).padStart(2,'0')).join(':').toUpperCase();
  }

  _parseIp(raw) {
    const s = String(raw || '').trim();
    return (s && s !== '0.0.0.0') ? s : null;
  }

  _parseVersion(raw) {
    if (!raw) return null;
    return Buffer.isBuffer(raw)
      ? raw.toString('ascii').trim().replace(/\x00/g,'') || null
      : String(raw).trim() || null;
  }

  _parseRxPower(raw) {
    if (raw === null || raw === undefined) return null;
    // uint8: >=128 → (val-256)/10 dBm  |  <128 → -(val/10) dBm
    // val=0 → no signal (offline)
    const val = Buffer.isBuffer(raw) ? raw.readUInt8(0) : parseInt(raw);
    if (isNaN(val) || val === 0) return null;
    const dbm = val >= 128 ? (val - 256) / 10 : -(val / 10);
    return parseFloat(dbm.toFixed(1));
  }

  // Col 16: 0=offline, 65535=removed/error, 1-127=online
  _parseStatus(seqRaw, rxPower) {
    const seq = parseInt(seqRaw);
    if (isNaN(seq) || seq === 0 || seq === 65535) return 'offline';
    // Online tapi sinyal lemah → warning
    if (rxPower !== null && rxPower < -27) return 'warning';
    return 'online';
  }

  _parseG02Rx(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    const val = Buffer.isBuffer(raw)
      ? (raw.length ? raw.readIntBE(0, Math.min(raw.length, 4)) : NaN)
      : parseInt(raw, 10);
    if (!Number.isFinite(val) || val === 0) return null;
    return parseFloat((val / 100).toFixed(2));
  }

  _parseG02Status(runRaw, rxPower) {
    const run = parseInt(runRaw, 10);
    if (run !== 1) return 'offline';
    if (rxPower !== null && rxPower < -27) return 'warning';
    return 'online';
  }

  _formatTicks(raw) {
    const ticks = parseInt(raw, 10);
    if (!Number.isFinite(ticks) || ticks <= 0) return null;
    const sec = Math.floor(ticks / 100);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d) return `${d}d ${h}j ${m}m`;
    if (h) return `${h}j ${m}m`;
    return `${m}m`;
  }

  // Optical G02: OID berakhir .{onuIdx}.0 (ONU) atau .{onuIdx}.65535 (PON)
  _indexG02Optical(fullOid, baseOid) {
    const rest = this._extractIndex(fullOid, baseOid);
    const parts = String(rest).split('.');
    if (parts.length >= 2 && parts[1] === '65535') return null;
    return parts[0];
  }

  async _resolveMib() {
    if (this._resolvedMib) return this._resolvedMib;
    if (this.mibMode === 'g02id' || this.mibMode === 'g02') {
      this._resolvedMib = 'g02id';
      return this._resolvedMib;
    }
    if (this.mibMode === 'hsgq' || this.mibMode === 'e04i') {
      this._resolvedMib = 'hsgq';
      return this._resolvedMib;
    }
    // auto: G02ID dulu (tabel E04I kosong di firmware IGC), fallback E04I
    try {
      const rows = await this._walk(G02.ONU_NAME);
      if (rows.length) {
        this._resolvedMib = 'g02id';
        return this._resolvedMib;
      }
    } catch (e) {
      logger.warn(`[HsgqOlt:${this.name}] Deteksi G02ID gagal: ${e.message}`);
    }
    this._resolvedMib = 'hsgq';
    return this._resolvedMib;
  }

  async getAllONTs() {
    if (!snmp) throw new Error('net-snmp tidak terinstall. Jalankan: npm install net-snmp');
    const mib = await this._resolveMib();
    logger.info(`[HsgqOlt:${this.name}] Fetching ONTs via SNMP (${mib})...`);
    if (mib === 'g02id') return this._getG02ONTs();
    return this._getE04ONTs();
  }

  async _getE04ONTs() {
    const fields = [
      { key: 'name',     oid: OID.ONU_NAME     },
      { key: 'ip',       oid: OID.ONU_IP       },
      { key: 'mac',      oid: OID.ONU_MAC      },
      { key: 'hw_ver',   oid: OID.ONU_HW_VER   },
      { key: 'fw_ver',   oid: OID.ONU_FW_VER   },
      { key: 'rx_power', oid: OID.ONU_RX_POWER },
      { key: 'seq',      oid: OID.ONU_SEQ      },
    ];

    const walkResults = await Promise.allSettled(
      fields.map(f => this._walk(f.oid).then(rows => ({ key: f.key, oid: f.oid, rows })))
    );

    const onuMap = new Map();
    for (const result of walkResults) {
      if (result.status !== 'fulfilled') continue;
      const { key, oid, rows } = result.value;
      for (const row of rows) {
        const idx = this._extractIndex(row.oid, oid);
        if (!onuMap.has(idx)) onuMap.set(idx, { _index: idx });
        onuMap.get(idx)[key] = row.value;
      }
    }

    logger.info(`[HsgqOlt:${this.name}] ${onuMap.size} ONU entries found (E04I)`);
    return this._normalizeONTs(onuMap);
  }

  async _getG02ONTs() {
    const fields = [
      { key: 'name',   oid: G02.ONU_NAME },
      { key: 'run',    oid: G02.ONU_RUN },
      { key: 'vendor', oid: G02.ONU_VENDOR },
      { key: 'model',  oid: G02.ONU_MODEL },
      { key: 'hw_ver', oid: G02.ONU_HW },
      { key: 'fw_ver', oid: G02.ONU_SW },
      { key: 'sn',     oid: G02.ONU_SN },
      { key: 'loid',   oid: G02.ONU_LOID },
      { key: 'reg',    oid: G02.ONU_REG },
      { key: 'ticks',  oid: G02.ONU_TICKS },
    ];
    const walkResults = await Promise.allSettled(
      fields.map(f => this._walk(f.oid).then(rows => ({ key: f.key, oid: f.oid, rows })))
    );
    const onuMap = new Map();
    for (const result of walkResults) {
      if (result.status !== 'fulfilled') continue;
      const { key, oid, rows } = result.value;
      for (const row of rows) {
        const idx = this._extractIndex(row.oid, oid);
        if (!idx) continue;
        if (!onuMap.has(idx)) onuMap.set(idx, { _index: idx });
        onuMap.get(idx)[key] = row.value;
      }
    }

    const [rxRows, txRows] = await Promise.all([
      this._walk(G02.ONU_RX).catch(() => []),
      this._walk(G02.ONU_TX).catch(() => []),
    ]);
    for (const row of rxRows) {
      const idx = this._indexG02Optical(row.oid, G02.ONU_RX);
      if (!idx) continue;
      if (!onuMap.has(idx)) onuMap.set(idx, { _index: idx });
      onuMap.get(idx).rx_power = row.value;
    }
    for (const row of txRows) {
      const idx = this._indexG02Optical(row.oid, G02.ONU_TX);
      if (!idx || !onuMap.has(idx)) continue;
      onuMap.get(idx).tx_power = row.value;
    }

    logger.info(`[HsgqOlt:${this.name}] ${onuMap.size} ONU entries found (G02ID)`);
    return this._normalizeG02ONTs(onuMap);
  }

  _normalizeG02ONTs(onuMap) {
    const results = [];
    for (const [idx, raw] of onuMap) {
      const { pon, onu } = this._decodeIndex(idx);
      const name    = this._parseName(raw.name);
      const sn      = this._parseName(raw.sn);
      const vendor  = this._parseName(raw.vendor);
      const model   = this._parseName(raw.model);
      const hwVer   = this._parseVersion(raw.hw_ver);
      const fwVer   = this._parseVersion(raw.fw_ver);
      const loid    = this._parseName(raw.loid);
      const rxPower = this._parseG02Rx(raw.rx_power);
      const txPower = this._parseG02Rx(raw.tx_power);
      const status  = this._parseG02Status(raw.run, rxPower);
      const serial  = sn || `HSGQ-P${pon}O${String(onu).padStart(3, '0')}`;

      results.push({
        serial_number:   serial,
        olt_index:       idx,
        pon_port:        pon,
        onu_id:          onu,
        manufacturer:    vendor || 'HSGQ',
        model:           name || model || `ONU-P${pon}/${onu}`,
        firmware:        fwVer || hwVer || null,
        description:     name || null,
        ip_address:      null,
        mac_address:     null,
        status,
        signal_strength: rxPower,
        uptime:          this._formatTicks(raw.ticks),
        tr069_params: {
          rx_power:     rxPower,
          tx_power:     txPower,
          olt_rx_power: null,
          hw_version:   hwVer,
          fw_version:   fwVer,
          ont_model:    model,
          loid,
          last_reg:     this._parseName(raw.reg),
          vendor,
        },
        source:      'snmp_hsgq_g02id',
        last_inform: new Date(),
        last_synced: new Date(),
      });
    }

    const online  = results.filter(r => r.status === 'online').length;
    const offline = results.filter(r => r.status === 'offline').length;
    const warning = results.filter(r => r.status === 'warning').length;
    logger.info(`[HsgqOlt:${this.name}] ${results.length} total | ${online} online | ${offline} offline | ${warning} warning (G02ID)`);
    return results;
  }

  _normalizeONTs(onuMap) {
    const results = [];
    for (const [idx, raw] of onuMap) {
      const { pon, onu } = this._decodeIndex(idx);
      const name    = this._parseName(raw.name);
      const mac     = this._parseMac(raw.mac);
      const rxPower = this._parseRxPower(raw.rx_power);
      const ip      = this._parseIp(raw.ip);
      const hwVer   = this._parseVersion(raw.hw_ver);
      const fwVer   = this._parseVersion(raw.fw_ver);
      const status  = this._parseStatus(raw.seq, rxPower);
      const serial  = mac
        ? `HSGQ${mac.replace(/:/g,'')}`
        : `HSGQ-P${pon}O${String(onu).padStart(3,'0')}`;

      results.push({
        serial_number:   serial,
        olt_index:       idx,
        pon_port:        pon,
        onu_id:          onu,
        manufacturer:    'HSGQ',
        model:           name || `ONU-P${pon}/${onu}`,
        firmware:        fwVer || hwVer || null,
        description:     name || null,
        ip_address:      ip,
        mac_address:     mac,
        status,
        signal_strength: rxPower,
        uptime:          null,
        tr069_params: {
          rx_power:    rxPower,
          tx_power:    null,
          olt_rx_power:null,
          hw_version:  hwVer,
          fw_version:  fwVer,
        },
        source:      'snmp_hsgq',
        last_inform: new Date(),
        last_synced: new Date(),
      });
    }

    const online  = results.filter(r => r.status === 'online').length;
    const offline = results.filter(r => r.status === 'offline').length;
    const warning = results.filter(r => r.status === 'warning').length;
    logger.info(`[HsgqOlt:${this.name}] ${results.length} total | ${online} online | ${offline} offline | ${warning} warning`);
    return results;
  }

  _quality(rx) {
    if (rx === null || rx === undefined) return 'unknown';
    if (rx >= -25) return 'good';
    if (rx >= -28) return 'warning';
    return 'critical';
  }

  _toMgmtOnu(o) {
    const rx = o.signal_strength;
    const online = o.status === 'online' || o.status === 'warning';
    return {
      onu_id: o.onu_id,
      board: 1,
      pon: o.pon_port,
      onu_if: `${o.pon_port}/${o.onu_id}`,
      gpon_olt: `PON${String(o.pon_port).padStart(2, '0')}`,
      name: o.description || o.model || null,
      sn: o.serial_number || null,
      type: (o.tr069_params && o.tr069_params.ont_model) || o.model || null,
      status: online ? 'online' : 'offline',
      phase_state: o.status === 'offline' ? 'offline' : (o.status === 'warning' ? 'working' : 'working'),
      onu_rx_dbm: rx,
      onu_tx_dbm: (o.tr069_params && o.tr069_params.tx_power) || null,
      quality: this._quality(rx),
    };
  }

  // Format yang dipakai dashboard OLT Management (discover / tabel ONU)
  async getAllOnus() {
    const onts = await this.getAllONTs();
    const onus = onts.map((o) => this._toMgmtOnu(o));
    const byPon = {};
    for (const o of onus) {
      const key = String(o.pon);
      if (!byPon[key]) byPon[key] = { port: key, total: 0, online: 0, offline: 0 };
      byPon[key].total++;
      if (o.status === 'online') byPon[key].online++;
      else byPon[key].offline++;
    }
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
    if (id == null && typeof pon === 'string' && /\/\d+/.test(pon)) {
      const m = String(pon).match(/(\d+)\s*\/\s*(\d+)/);
      if (m) { pon = parseInt(m[1], 10); id = parseInt(m[2], 10); }
    }
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

  async getOnuPower(pon, id) {
    const d = await this.getOnuDetail(pon, id);
    return d.power || { onu_rx_dbm: null, no_signal: true, quality: 'unknown' };
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
      const vbs = await this._get([OID.SYS_DESCR, OID.SYS_NAME, OID.SYS_FW, '1.3.6.1.2.1.1.3.0']);
      const asTxt = (vb) => Buffer.isBuffer(vb?.value)
        ? vb.value.toString('utf8').replace(/\x00/g, '').trim()
        : String(vb?.value || '').trim();
      const desc = asTxt(vbs[0]);
      const name = asTxt(vbs[1]);
      const fw = asTxt(vbs[2]);
      const ticks = vbs[3] && vbs[3].value != null ? parseInt(vbs[3].value, 10) : NaN;
      this.closeSession();
      let uptime = null;
      if (Number.isFinite(ticks)) {
        let s = Math.floor(ticks / 100);
        const d = Math.floor(s / 86400); s %= 86400;
        const h = Math.floor(s / 3600); s %= 3600;
        const m = Math.floor(s / 60);
        uptime = `${d}d ${h}h ${m}m`;
      }
      return {
        model: desc || name || this.name,
        version: fw || null,
        hw_version: null,
        uptime,
        cpu_percent: null,
        temperature_c: null,
        raw: desc,
      };
    } catch (err) {
      this.closeSession();
      return { error: err.message };
    }
  }

  async testConnection() {
    if (!snmp) return { success: false, error: 'net-snmp tidak terinstall' };
    try {
      const vbs  = await this._get([OID.SYS_DESCR, OID.SYS_NAME, OID.SYS_FW]);
      const asTxt = (vb) => Buffer.isBuffer(vb?.value)
        ? vb.value.toString('utf8').replace(/\x00/g, '').trim()
        : String(vb?.value || '').trim();
      const desc = asTxt(vbs[0]);
      const name = asTxt(vbs[1]);
      const fw   = asTxt(vbs[2]);
      this.closeSession();
      const extra = fw ? ` · ${fw}` : '';
      return {
        success: true,
        sysDescr: desc,
        sysName: name,
        firmware: fw || null,
        message: `Terhubung ke: ${name} — ${desc}${extra}`,
      };
    } catch (err) {
      this.closeSession();
      return { success: false, error: err.message };
    }
  }
}

module.exports = HsgqOltService;