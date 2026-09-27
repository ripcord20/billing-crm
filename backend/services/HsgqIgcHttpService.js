'use strict';

/**
 * HsgqIgcHttpService.js
 * ─────────────────────────────────────────────────────────────────────
 * Baca redaman presisi 4 desimal dari web IGC HSGQ GPON (G02ID / G04ID).
 *
 * MIB SNMP 3.12.3.1.4 hanya kelipatan 1 dBm (-2300 → -23.0), sementara
 * halaman IGC /gponmgmt?form=optical_onu menampilkan nilai asli
 * (contoh ARUL: -22.6780 dBm).
 *
 * Login: POST /userlogin?form=login
 *   key   = md5(user:password)
 *   value = base64(password)
 * Token: header X-Token
 * ─────────────────────────────────────────────────────────────────────
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { parseDbmNumber } = require('../utils/opticalDbm');
const logger = require('../utils/logger');

const tokenCache = new Map(); // host → { token, until }

class HsgqIgcHttpService {
  constructor(config = {}) {
    this.host     = config.host;
    this.username = config.username || 'root';
    this.password = config.password || '';
    this.timeout  = config.timeout  || 10000;
    this.name     = config.name     || config.host;
    this.httpPort = config.httpPort || 80;
    this.httpsPort = config.httpsPort || 443;
    this._scheme  = config.scheme || 'http';
  }

  _request(method, urlPath, body, headers = {}) {
    const scheme = this._scheme === 'https' ? https : http;
    const port = this._scheme === 'https' ? this.httpsPort : this.httpPort;
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const hdrs = Object.assign({
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'User-Agent': 'Fiberix-OLT/1.0',
    }, headers);
    if (payload) hdrs['Content-Length'] = String(payload.length);

    return new Promise((resolve, reject) => {
      const req = scheme.request({
        host: this.host,
        port,
        path: urlPath,
        method,
        headers: hdrs,
        timeout: this.timeout,
        rejectUnauthorized: false,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(raw); } catch (e) { /* bukan JSON */ }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            json,
            raw,
          });
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('IGC timeout')); });
      if (payload) req.write(payload);
      req.end();
    });
  }

  async login() {
    const cached = tokenCache.get(this.host);
    if (cached && cached.until > Date.now() && cached.token) return cached.token;

    const key = crypto.createHash('md5').update(`${this.username}:${this.password}`).digest('hex');
    const value = Buffer.from(String(this.password), 'utf8').toString('base64');
    const body = {
      method: 'set',
      param: { name: this.username, key, value, captcha_v: '', captcha_f: '' },
    };
    const res = await this._request('POST', '/userlogin?form=login', body);
    const token = res.headers['x-token'] || res.headers['X-Token'];
    if (!res.json || res.json.code !== 1 || !token) {
      const msg = (res.json && res.json.message) || `HTTP ${res.status}`;
      throw new Error(`IGC login gagal: ${msg}`);
    }
    tokenCache.set(this.host, { token, until: Date.now() + 4 * 60 * 1000 });
    return token;
  }

  async _get(urlPath) {
    const token = await this.login();
    const res = await this._request('GET', urlPath, null, { 'X-Token': token });
    if (res.json && res.json.code === 1) return res.json.data;
    if (res.status === 401 || (res.json && res.json.code === 401)) {
      tokenCache.delete(this.host);
      const token2 = await this.login();
      const res2 = await this._request('GET', urlPath, null, { 'X-Token': token2 });
      if (res2.json && res2.json.code === 1) return res2.json.data;
    }
    throw new Error(`IGC ${urlPath} gagal: ${(res.json && res.json.message) || res.status}`);
  }

  _row(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const rx = parseDbmNumber(raw.receive_power);
    const tx = parseDbmNumber(raw.transmit_power);
    const oltRx = parseDbmNumber(raw.olt_rxpower);
    return {
      port_id: raw.port_id != null ? parseInt(raw.port_id, 10) : null,
      ont_id:  raw.ont_id  != null ? parseInt(raw.ont_id, 10) : null,
      ont_name: raw.ont_name || null,
      ont_sn: raw.ont_sn || null,
      onu_rx_dbm: rx,
      onu_tx_dbm: tx,
      olt_rx_dbm: oltRx,
      work_temperature: raw.work_temperature || null,
      work_voltage: raw.work_voltage || null,
      transmit_bias: raw.transmit_bias || null,
    };
  }

  async getPonOptical(portId) {
    const data = await this._get(`/gponmgmt?form=optical_onu&port_id=${encodeURIComponent(portId)}`);
    const rows = Array.isArray(data) ? data : [];
    return rows.map((r) => this._row(r)).filter(Boolean);
  }

  async getOnuOptical(portId, ontId) {
    const data = await this._get(
      `/gponont_mgmt?form=ont_optical&port_id=${encodeURIComponent(portId)}&ont_id=${encodeURIComponent(ontId)}`
    );
    return this._row(Object.assign({ port_id: portId, ont_id: ontId }, data || {}));
  }

  async getAllOptical(ports = [1, 2, 3, 4, 5, 6, 7, 8]) {
    const out = [];
    for (const pon of ports) {
      try {
        const rows = await this.getPonOptical(pon);
        if (rows.length) out.push(...rows);
      } catch (e) {
        logger.warn(`[HsgqIgc:${this.name}] PON ${pon}: ${e.message}`);
      }
    }
    return out;
  }
}

module.exports = HsgqIgcHttpService;
