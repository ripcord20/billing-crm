/**
 * HotspotService.js
 * Hotspot voucher/user: FreeRADIUS (radcheck) — bukan /ip/hotspot/user.
 * Server, profile, host, cookie, IP binding, walled-garden tetap di MikroTik.
 * Isolir captive portal (isolir-guest) tidak dikelola di sini.
 */

const { getMikrotikInstance, MikrotikService } = require('./MikrotikService');
const logger = require('../utils/logger');
const HotspotRadiusStore = require('./HotspotRadiusStore');
const {
  isIsolirHotspotUser,
  isIsolirHotspotProfile,
  mergeRadiusService,
  shouldAddHotspotToRadiusClient,
  canEnableHotspotRadius,
  mergeUsage,
  toApiUser,
  normalizeVoucherCharset,
  randomVoucherToken,
  normalizeVoucherPrefix,
  parseSamePassword,
  buildVoucherUsername
} = require('../utils/hotspotRadius');

const _radiusReadyHosts = new Set();
const _migrateLocks = new Map();

class HotspotService {
  /**
   * @param {MikrotikService|object|null} configOrInstance
   *   Bisa berupa:
   *   - MikrotikService instance (dari getMikrotikInstanceByDevice / getMikrotikInstance)
   *   - Config object { host, port, username, password, useSSL }
   *   - null → pakai default instance dari env
   * @param {object} [opts]
   *   - radiusStore: inject untuk tes
   */
  constructor(configOrInstance = null, opts = {}) {
    if (configOrInstance instanceof MikrotikService) {
      // Reuse instance — paling efisien, kalau caller sudah resolve instance
      this.mt = configOrInstance;
    } else if (configOrInstance && typeof configOrInstance.get === 'function' && typeof configOrInstance.put === 'function') {
      this.mt = configOrInstance;
    } else if (configOrInstance) {
      // Config object → buat instance baru
      this.mt = new MikrotikService(configOrInstance);
    } else {
      // Fallback ke default
      this.mt = getMikrotikInstance();
    }
    this.radiusStore = (opts && opts.radiusStore) || HotspotRadiusStore.shared();
  }

  _deviceId() {
    const id = this.mt && this.mt.deviceId;
    return id != null && id !== '' ? Number(id) : null;
  }

  _hostKey() {
    return String((this.mt && this.mt.host) || 'default');
  }

  async _prepareRadius() {
    await this.radiusStore.ensureSchema();
    await this.ensureHotspotRadiusOnRouter();
    await this.migrateLocalHotspotUsers();
  }

  /**
   * Nyalakan use-radius di profile hotspot voucher (bukan isolir) dan
   * tambah service=hotspot pada client RADIUS yang sudah dipakai PPPoE.
   * Tidak menambah server RADIUS baru, tidak mengubah /ppp aaa.
   */
  async ensureHotspotRadiusOnRouter() {
    const key = this._hostKey();
    if (_radiusReadyHosts.has(key)) return { skipped: true };

    const rads = await this.mt.get('/radius').catch(() => []);
    const list = Array.isArray(rads) ? rads : [];
    if (!canEnableHotspotRadius(list)) {
      throw new Error(
        'RADIUS client belum ada di MikroTik (butuh /radius dengan service ppp atau hotspot). ' +
        'Hotspot full RADIUS memakai client RADIUS yang sama dengan PPPoE — tidak membuat server baru.'
      );
    }
    for (const r of list) {
      if (!shouldAddHotspotToRadiusClient(r) || !r['.id']) continue;
      const next = mergeRadiusService(r.service);
      await this.mt.patch(`/radius/${r['.id']}`, { service: next });
      logger.info(`[Hotspot] RADIUS client ${r['.id']} service → ${next}`);
    }

    const profiles = await this.mt.get('/ip/hotspot/profile').catch(() => []);
    for (const p of Array.isArray(profiles) ? profiles : []) {
      if (!p['.id'] || isIsolirHotspotProfile(p)) continue;
      const already = p['use-radius'] === 'yes' && p['radius-accounting'] === 'yes';
      if (already) continue;
      const body = { 'use-radius': 'yes', 'radius-accounting': 'yes' };
      try {
        await this.mt.patch(`/ip/hotspot/profile/${p['.id']}`, {
          ...body,
          'radius-interim-update': '00:04:00'
        });
      } catch (_) {
        await this.mt.patch(`/ip/hotspot/profile/${p['.id']}`, body);
      }
    }

    _radiusReadyHosts.add(key);
    return { ok: true };
  }

  /**
   * Impor /ip/hotspot/user lokal ke RADIUS lalu hapus dari router,
   * kecuali isolir-guest / profile isolir.
   */
  async migrateLocalHotspotUsers() {
    const key = this._hostKey();
    const inflight = _migrateLocks.get(key);
    if (inflight && typeof inflight.then === 'function') return inflight;
    const job = this._migrateLocalHotspotUsersNow().finally(() => {
      if (_migrateLocks.get(key) === job) _migrateLocks.delete(key);
    });
    _migrateLocks.set(key, job);
    return job;
  }

  async _migrateLocalHotspotUsersNow() {
    const locals = await this.mt.get('/ip/hotspot/user').catch(() => []);
    const list = Array.isArray(locals) ? locals : [];
    let imported = 0;
    let skipped = 0;
    let removed = 0;
    for (const u of list) {
      const mapped = {
        name: u.name || '',
        password: u.password || '',
        profile: u.profile || 'default',
        server: u.server || 'all',
        address: u.address || '',
        macAddress: u['mac-address'] || '',
        limitUptime: u['limit-uptime'] || '',
        limitBytesIn: parseInt(u['limit-bytes-in'], 10) || 0,
        limitBytesOut: parseInt(u['limit-bytes-out'], 10) || 0,
        limitBytesTotal: parseInt(u['limit-bytes-total'], 10) || 0,
        comment: u.comment || '',
        disabled: u.disabled === 'true' || u.disabled === true,
        deviceId: this._deviceId()
      };
      if (isIsolirHotspotUser(mapped)) { skipped++; continue; }
      try {
        const existing = await this.radiusStore.get(mapped.name);
        if (!existing) {
          await this.radiusStore.create(mapped);
          imported++;
        }
        if (u['.id']) {
          await this.mt.delete(`/ip/hotspot/user/${u['.id']}`);
          removed++;
        }
      } catch (e) {
        skipped++;
        logger.warn(`[Hotspot] skip migrate "${mapped.name}": ${e.message}`);
      }
    }
    return { imported, removed, skipped, total: list.length };
  }

  async _kickUsername(username) {
    return this._kickUsernames([username]);
  }

  async _kickUsernames(usernames) {
    const want = new Set((usernames || []).map((u) => String(u || '').trim()).filter(Boolean));
    if (!want.size) return 0;
    let kicked = 0;
    try {
      const active = await this.getActiveSessions();
      for (const s of active) {
        if (want.has(s.user || '') && s.id) {
          try { await this.disconnectSession(s.id); kicked++; } catch (_) {}
        }
      }
    } catch (_) {}
    return kicked;
  }

  // ─── HOTSPOT SERVER ──────────────────────────────────────────

  async getServers() {
    const list = await this.mt.get('/ip/hotspot');
    return (Array.isArray(list) ? list : []).map(s => ({
      id:          s['.id'],
      name:        s.name        || '',
      interface:   s.interface   || '',
      addressPool: s['address-pool'] || '',
      profile:     s.profile     || 'default',
      idleTimeout: s['idle-timeout']  || 'none',
      keepaliveTimeout: s['keepalive-timeout'] || '00:00:00',
      disabled:    s.disabled    === 'true',
      running:     s.invalid     !== 'true',
    }));
  }

  async createServer(data) {
    const body = {
      name:      data.name,
      interface: data.interface,
    };
    if (data.addressPool) body['address-pool'] = data.addressPool;
    if (data.profile)     body.profile         = data.profile;
    if (data.idleTimeout) body['idle-timeout']  = data.idleTimeout;
    return this.mt.put('/ip/hotspot', body);
  }

  async updateServer(id, data) {
    const body = {};
    if (data.name        !== undefined) body.name             = data.name;
    if (data.interface   !== undefined) body.interface        = data.interface;
    if (data.addressPool !== undefined) body['address-pool']  = data.addressPool;
    if (data.profile     !== undefined) body.profile          = data.profile;
    if (data.idleTimeout !== undefined) body['idle-timeout']  = data.idleTimeout;
    if (data.disabled    !== undefined) body.disabled         = data.disabled ? 'true' : 'false';
    return this.mt.patch(`/ip/hotspot/${id}`, body);
  }

  async deleteServer(id) { return this.mt.delete(`/ip/hotspot/${id}`); }
  async enableServer(id)  { return this.mt.patch(`/ip/hotspot/${id}`, { disabled: 'false' }); }
  async disableServer(id) { return this.mt.patch(`/ip/hotspot/${id}`, { disabled: 'true'  }); }

  /**
   * Setup hotspot baru lengkap (mirip "Hotspot Setup" di Winbox, versi ringkas):
   *   1. Buat IP pool (kalau diberi poolRange)
   *   2. Buat server profile (kalau belum ada)
   *   3. Buat hotspot server di interface, pakai pool & profile tsb
   * Idempotent untuk pool/profile (skip kalau sudah ada nama sama).
   *
   * @param {object} data
   *   - name        : nama server (wajib)
   *   - interface   : interface (wajib)
   *   - poolName    : nama IP pool (default: hs-pool-<name>)
   *   - poolRange   : range IP pool (mis. 10.5.50.2-10.5.50.254)
   *   - profileName : nama server profile (default: hsprof-<name>)
   *   - dnsName     : DNS name untuk login page (opsional)
   *   - addressPool : kalau diberi, override poolName
   */
  async setupServer(data) {
    if (!data.name)      throw new Error('Nama server wajib');
    if (!data.interface) throw new Error('Interface wajib');

    const steps = [];
    const poolName    = data.poolName    || `hs-pool-${data.name}`;
    const profileName = data.profileName || `hsprof-${data.name}`;

    // 1. IP Pool
    if (data.poolRange && data.poolRange.trim()) {
      const existingPools = await this.mt.get('/ip/pool');
      const has = (Array.isArray(existingPools) ? existingPools : []).some(p => p.name === poolName);
      if (!has) {
        await this.mt.put('/ip/pool', { name: poolName, ranges: data.poolRange.trim() });
        steps.push(`Pool "${poolName}" dibuat (${data.poolRange})`);
      } else {
        steps.push(`Pool "${poolName}" sudah ada`);
      }
    }

    // 2. Server Profile
    // Catatan: profile hotspot TIDAK punya parameter "dns-server" (itu sebabnya
    // muncul error "unknown parameter dns-server"). DNS yang diberikan ke client
    // hotspot diambil dari /ip/dns router. Profile hanya punya "dns-name".
    const existingProfiles = await this.mt.get('/ip/hotspot/profile');
    const hasProfile = (Array.isArray(existingProfiles) ? existingProfiles : []).some(p => p.name === profileName);
    const dnsServers = (data.dnsServers || '').trim(); // mis. "8.8.8.8,1.1.1.1"
    if (!hasProfile) {
      const pbody = {
        name: profileName,
        'login-by': 'http-chap,http-pap',
        'use-radius': 'yes',
        'radius-accounting': 'yes'
      };
      if (data.dnsName) pbody['dns-name'] = data.dnsName;
      await this.mt.put('/ip/hotspot/profile', pbody);
      steps.push(`Server profile "${profileName}" dibuat (RADIUS)`);
    } else {
      // profile sudah ada → update dns-name kalau diisi
      const prof = (Array.isArray(existingProfiles) ? existingProfiles : []).find(p => p.name === profileName);
      if (prof && prof['.id'] && !isIsolirHotspotProfile(prof)) {
        const patch = { 'use-radius': 'yes', 'radius-accounting': 'yes' };
        if (data.dnsName) patch['dns-name'] = data.dnsName;
        await this.mt.patch(`/ip/hotspot/profile/${prof['.id']}`, patch);
      } else if (data.dnsName && prof && prof['.id']) {
        await this.mt.patch(`/ip/hotspot/profile/${prof['.id']}`, { 'dns-name': data.dnsName });
      }
      steps.push(`Server profile "${profileName}" sudah ada`);
    }

    // 2b. Set DNS server di router (/ip/dns) — inilah DNS yang dibagikan ke client
    // hotspot, sama seperti langkah "DNS Servers" di wizard MikroTik.
    if (dnsServers) {
      try {
        await this.mt.patch('/ip/dns', { servers: dnsServers, 'allow-remote-requests': 'yes' });
        steps.push(`DNS server di-set ke ${dnsServers}`);
      } catch (e) {
        steps.push(`⚠ Gagal set DNS: ${e.message}`);
      }
    }

    // 3. Hotspot Server
    const sbody = {
      name:      data.name,
      interface: data.interface,
      profile:   profileName,
    };
    if (data.poolRange && data.poolRange.trim()) sbody['address-pool'] = poolName;
    else if (data.addressPool) sbody['address-pool'] = data.addressPool;
    await this.mt.put('/ip/hotspot', sbody);
    steps.push(`Hotspot server "${data.name}" aktif di ${data.interface}`);

    return { steps, message: steps.join(' · ') };
  }

  // ─── HOTSPOT PROFILES ────────────────────────────────────────

  async getProfiles() {
    const list = await this.mt.get('/ip/hotspot/profile');
    return (Array.isArray(list) ? list : []).map(p => ({
      id:           p['.id'],
      name:         p.name          || '',
      hotspotAddress: p['hotspot-address'] || '',
      dnsName:      p['dns-name']    || '',
      htmlDirectory: p['html-directory'] || 'hotspot',
      loginBy:      p['login-by']    || 'cookie,http-chap',
      httpCookieLifetime: p['http-cookie-lifetime'] || '3d 00:00:00',
      rateLimit:    p['rate-limit']  || '',
      sharedUsers:  p['shared-users'] || '1',
      sessionTimeout: p['session-timeout'] || '',
      idleTimeout:  p['idle-timeout'] || '',
      macCookieTimeout: p['mac-cookie-timeout'] || '3d',
      useRadius:        p['use-radius'] === 'yes',
      radiusAccounting: p['radius-accounting'] === 'yes',
    }));
  }

  // Bangun body profile dari data UI. Field kosong di-omit supaya RouterOS
  // memakai default-nya (tidak memaksa string kosong yang bisa ditolak API).
  _profileBody(data) {
    const body = { name: data.name };
    if (data.hotspotAddress)     body['hotspot-address']      = data.hotspotAddress;
    if (data.dnsName !== undefined) body['dns-name']          = data.dnsName || '';
    if (data.htmlDirectory)      body['html-directory']       = data.htmlDirectory;
    if (data.loginBy)            body['login-by']             = data.loginBy;        // mis. "cookie,http-chap"
    if (data.httpCookieLifetime) body['http-cookie-lifetime'] = data.httpCookieLifetime;
    if (data.rateLimit)          body['rate-limit']           = data.rateLimit;
    if (!isIsolirHotspotProfile({ name: data.name, htmlDirectory: data.htmlDirectory })) {
      body['use-radius'] = 'yes';
      body['radius-accounting'] = 'yes';
    }
    return body;
  }

  async createProfile(data) {
    return this.mt.put('/ip/hotspot/profile', this._profileBody(data));
  }

  async updateProfile(id, data) {
    return this.mt.patch(`/ip/hotspot/profile/${id}`, this._profileBody(data));
  }

  async deleteProfile(id) {
    return this.mt.delete(`/ip/hotspot/profile/${id}`);
  }

  // ─── USER PROFILES (paket) ────────────────────────────────────

  async getUserProfiles() {
    const list = await this.mt.get('/ip/hotspot/user/profile');
    return (Array.isArray(list) ? list : []).map(p => ({
      id:           p['.id'],
      name:         p.name          || '',
      rateLimit:    p['rate-limit']  || '',
      sharedUsers:  p['shared-users'] || '1',
      sessionTimeout: p['session-timeout'] || '',
      idleTimeout:  p['idle-timeout'] || '',
      onLogin:      p['on-login']    || '',
      onLogout:     p['on-logout']   || '',
      addressList:  p['address-list'] || '',
      addMacCookie: p['add-mac-cookie'] === 'yes',
    }));
  }

  async createUserProfile(data) {
    // RouterOS REST API menolak string kosong untuk field time/rate
    // ("invalid time value for argument session-timeout"). Jadi field
    // hanya disertakan kalau benar-benar terisi — sisanya pakai default
    // MikroTik (0 = unlimited).
    const body = { name: data.name };
    const rate    = (data.rateLimit       || '').trim();
    const shared  = (data.sharedUsers     || '').toString().trim();
    const session = (data.sessionTimeout  || '').trim();
    const idle    = (data.idleTimeout     || '').trim();
    const addrLst = (data.addressList     || '').trim();
    if (rate)    body['rate-limit']      = rate;
    if (shared)  body['shared-users']    = shared;
    if (session) body['session-timeout'] = session;
    if (idle)    body['idle-timeout']    = idle;
    if (addrLst) body['address-list']    = addrLst;
    body['add-mac-cookie'] = data.addMacCookie ? 'yes' : 'no';
    return this.mt.put('/ip/hotspot/user/profile', body);
  }

  async updateUserProfile(id, data) {
    // Untuk PATCH, hanya update field yang dikirim user.
    // String kosong → kirim '0' (= reset ke default) bukan '' (yang akan ditolak).
    const body = {};
    if (data.name !== undefined) body.name = data.name;
    if (data.rateLimit       !== undefined) body['rate-limit']      = String(data.rateLimit      || '').trim() || '0';
    if (data.sharedUsers     !== undefined) body['shared-users']    = String(data.sharedUsers    || '1').trim();
    if (data.sessionTimeout  !== undefined) body['session-timeout'] = String(data.sessionTimeout || '').trim() || '0';
    if (data.idleTimeout     !== undefined) body['idle-timeout']    = String(data.idleTimeout    || '').trim() || 'none';
    if (data.addressList     !== undefined) body['address-list']    = String(data.addressList    || '').trim();
    return this.mt.patch(`/ip/hotspot/user/profile/${id}`, body);
  }

  async deleteUserProfile(id) {
    return this.mt.delete(`/ip/hotspot/user/profile/${id}`);
  }

  // ─── USERS (voucher / permanent) via FreeRADIUS ─────────────
  // Auth: radcheck/radreply. Metadata: hotspot_radius_users.
  // Tidak dual-write ke /ip/hotspot/user (kecuali isolir-guest, yang tidak
  // dikelola di sini).

  async getUsers(params = {}) {
    try {
      await this._prepareRadius();
    } catch (e) {
      logger.warn('[Hotspot] prepare RADIUS skipped: ' + e.message);
    }
    const rows = await this.radiusStore.list(params);
    const names = rows.map((r) => r.username);
    const [acctMap, active] = await Promise.all([
      this.radiusStore.usageByUsernames(names),
      this.getActiveSessions().catch(() => [])
    ]);
    const activeByUser = {};
    for (const s of active) {
      const k = s.user || '';
      if (!k) continue;
      const prev = activeByUser[k];
      if (!prev) {
        activeByUser[k] = s;
      } else {
        activeByUser[k] = {
          ...s,
          bytesIn: (prev.bytesIn || 0) + (s.bytesIn || 0),
          bytesOut: (prev.bytesOut || 0) + (s.bytesOut || 0)
        };
      }
    }
    let users = rows.map((r) =>
      toApiUser(r, mergeUsage(acctMap[r.username], activeByUser[r.username]))
    );
    if (params.profile) users = users.filter((u) => u.profile === params.profile);
    if (params.server) {
      users = users.filter((u) => u.server === params.server || u.server === 'all');
    }
    return users;
  }

  async createUser(data) {
    await this._prepareRadius();
    const row = await this.radiusStore.create({
      ...data,
      deviceId: data.deviceId != null ? data.deviceId : this._deviceId()
    });
    return toApiUser(row, {});
  }

  async updateUser(id, data) {
    await this._prepareRadius();
    const before = await this.radiusStore.get(id);
    const row = await this.radiusStore.update(id, data);
    if (before && before.username && row.username !== before.username) {
      await this._kickUsername(before.username);
    }
    if (data.disabled) await this._kickUsername(row.username);
    return toApiUser(row, {});
  }

  async deleteUser(id) {
    await this._prepareRadius();
    const row = await this.radiusStore.get(id);
    if (row) await this._kickUsername(row.username);
    return this.radiusStore.remove(id);
  }

  async deleteUserBatch(ids) {
    await this._prepareRadius();
    const want = new Set((ids || []).map((id) => String(id == null ? '' : id).trim()).filter(Boolean));
    if (!want.size) return { deleted: 0, failed: 0 };
    const rows = await this.radiusStore.list();
    const names = (rows || [])
      .filter((r) => want.has(String(r.id)) || want.has(String(r.username || '')))
      .map((r) => r.username)
      .filter(Boolean);
    await this._kickUsernames(names);
    const out = await this.radiusStore.removeManyByUsernames(names);
    return { deleted: out.deleted || 0, failed: Math.max(0, want.size - (out.deleted || 0)) };
  }

  /**
   * Hapus semua user hotspot yang cocok filter.
   * Sumber: hotspot_radius_users saja — PPPoE / isolir tidak ikut.
   */
  async deleteMatchingUsers(opts = {}) {
    await this._prepareRadius();
    const profile = String(opts.profile || '').trim();
    const search = String(opts.search || '').trim().toLowerCase();
    const generatedOnly = !!opts.generatedOnly;
    const disabledOnly = !!opts.disabledOnly;
    const users = await this.getUsers(profile ? { profile } : {});
    const match = (users || []).filter((u) => {
      if (disabledOnly && !u.disabled) return false;
      if (generatedOnly && !/Generated/i.test(String(u.comment || ''))) return false;
      if (search) {
        const hay = `${u.name || ''} ${u.comment || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
    const names = match.map((u) => u.name).filter(Boolean);
    await this._kickUsernames(names);
    const out = await this.radiusStore.removeManyByUsernames(names);
    return { deleted: out.deleted || 0, matched: names.length, usernames: out.usernames || names };
  }

  async enableUser(id) {
    await this._prepareRadius();
    return this.radiusStore.setDisabled(id, false);
  }

  async disableUser(id) {
    await this._prepareRadius();
    const row = await this.radiusStore.get(id);
    const out = await this.radiusStore.setDisabled(id, true);
    if (row) await this._kickUsername(row.username);
    return out;
  }

  // Bulk generate vouchers ke RADIUS (bukan /ip/hotspot/user).
  async generateVouchers(options) {
    const {
      count = 10, profile = 'default', server = 'all',
      prefix = 'vc', passwordLength = 6, charset = 'azAZ09', comment = '',
      limitUptime = '', limitBytesTotal = 0,
      price = 0, soldTo = '', samePassword = false,
    } = options;

    await this._prepareRadius();

    const charsetCode = normalizeVoucherCharset(charset);
    const prefixNorm = normalizeVoucherPrefix(prefix);
    const userPassSame = parseSamePassword(samePassword);
    const genRandom = (len) => randomVoucherToken(len, charsetCode);

    const existing = new Set(await this.radiusStore.listUsernames());
    const items = [];
    const seen = new Set();
    let guard = 0;
    while (items.length < count && guard < count * 20) {
      guard++;
      const token = genRandom(passwordLength);
      const username = buildVoucherUsername(prefixNorm, token);
      if (!username || seen.has(username) || existing.has(username)) continue;
      seen.add(username);
      const password = userPassSame ? username : genRandom(passwordLength);
      items.push({ username, password });
    }

    const buildComment = () => {
      if (comment) return comment;
      const parts = [`Generated ${new Date().toLocaleDateString('id-ID')}`];
      if (profile) parts.push(`Profile: ${profile}`);
      if (Number(price) > 0) parts.push(`Rp ${Number(price).toLocaleString('id-ID')}`);
      if (soldTo) parts.push(`Sold-to: ${soldTo}`);
      return parts.join(' | ');
    };
    const finalComment = buildComment();
    const deviceId = this._deviceId();

    const vouchers = [];
    const errors = [];
    const CHUNK = 10;

    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      const results = await Promise.allSettled(chunk.map(async ({ username, password }) => {
        await this.radiusStore.create({
          name: username,
          password,
          profile,
          server,
          comment: finalComment,
          limitUptime,
          limitBytesTotal,
          deviceId
        });
        return { username, password, profile, server };
      }));
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') vouchers.push(r.value);
        else errors.push({ username: chunk[idx].username, error: r.reason?.message || 'Unknown error' });
      });
    }

    return { vouchers, errors, total: count, success: vouchers.length };
  }

  // ─── ACTIVE SESSIONS ─────────────────────────────────────────

  async getActiveSessions() {
    const list = await this.mt.get('/ip/hotspot/active');
    return (Array.isArray(list) ? list : []).map(s => ({
      id:        s['.id'],
      user:      s.user      || '',
      address:   s.address   || '',
      macAddress: s['mac-address'] || '',
      loginBy:   s['login-by'] || '',
      uptime:    s.uptime    || '0s',
      idleTime:  s['idle-time'] || '0s',
      sessionTimeLeft: s['session-time-left'] || '',
      keepaliveTimeout: s['keepalive-timeout'] || '',
      bytesIn:   parseInt(s['bytes-in'])  || 0,
      bytesOut:  parseInt(s['bytes-out']) || 0,
      packetIn:  parseInt(s['packets-in'])  || 0,
      packetOut: parseInt(s['packets-out']) || 0,
      server:    s.server    || '',
      comment:   s.comment   || '',
    }));
  }

  async disconnectSession(id) {
    return this.mt.post(`/ip/hotspot/active/${id}/remove`, {});
  }

  async disconnectSessionBatch(ids) {
    const results = await Promise.allSettled(ids.map(id => this.mt.post(`/ip/hotspot/active/${id}/remove`, {})));
    return { disconnected: results.filter(r => r.status === 'fulfilled').length };
  }

  // ─── HOST LIST (semua device yang pernah connect) ─────────────

  async getHosts() {
    const list = await this.mt.get('/ip/hotspot/host');
    return (Array.isArray(list) ? list : []).map(h => ({
      id:        h['.id'],
      macAddress: h['mac-address'] || '',
      address:   h.address   || '',
      toAddress: h['to-address'] || '',
      server:    h.server    || '',
      bridgePort: h['bridge-port'] || '',
      uptime:    h.uptime    || '',
      idleTime:  h['idle-time'] || '',
      rxRate:    h['rx-rate'] || '',
      txRate:    h['tx-rate'] || '',
      bytesIn:   h['bytes-in']  || '0',
      bytesOut:  h['bytes-out'] || '0',
      authorized: h.authorized === 'true',
      bypassed:  h.bypassed   === 'true',
      dynamic:   h.dynamic    === 'true',
      comment:   h.comment    || '',
    }));
  }

  async makeHostBinding(id) {
    // RouterOS: jadikan host sebagai IP binding "bypassed" (analog tombol "Make Binding")
    return this.mt.post(`/ip/hotspot/host/${id}/make-binding`).catch(async () => {
      // fallback untuk versi yang tidak punya command make-binding: buat ip-binding manual
      const hosts = await this.getHosts();
      const h = hosts.find(x => String(x.id) === String(id));
      if (!h) throw new Error('Host tidak ditemukan');
      // Cek dulu apakah binding dgn MAC/address yang sama sudah ada → hindari duplikat
      const existing = await this.mt.get('/ip/hotspot/ip-binding');
      const norm = s => String(s || '').toUpperCase().trim();
      const dup = (Array.isArray(existing) ? existing : []).find(b =>
        (h.macAddress && norm(b['mac-address']) === norm(h.macAddress)) ||
        (h.address && (b.address || '') === h.address));
      if (dup) {
        // sudah ada → pastikan enabled saja, jangan bikin baru
        if (dup.disabled === 'true') await this.mt.patch(`/ip/hotspot/ip-binding/${dup['.id']}`, { disabled: 'false' });
        return { ok: true, existed: true };
      }
      return this.mt.put('/ip/hotspot/ip-binding', {
        'mac-address': h.macAddress, address: h.address, server: h.server || 'all', type: 'bypassed',
      });
    });
  }

  async deleteHost(id) { return this.mt.delete(`/ip/hotspot/host/${id}`); }

  // ─── COOKIE / IP BINDING ─────────────────────────────────────

  async getCookies() {
    const list = await this.mt.get('/ip/hotspot/cookie');
    return (Array.isArray(list) ? list : []).map(c => ({
      id:        c['.id'],
      user:      c.user      || '',
      domain:    c.domain    || '',
      address:   c.address   || '',
      macAddress: c['mac-address'] || '',
      expiresAt: c['expires-at']  || '',
      comment:   c.comment   || '',
    }));
  }

  async deleteCookie(id) { return this.mt.delete(`/ip/hotspot/cookie/${id}`); }

  async getIpBindings() {
    const list = await this.mt.get('/ip/hotspot/ip-binding');
    return (Array.isArray(list) ? list : []).map(b => ({
      id:        b['.id'],
      macAddress: b['mac-address'] || '',
      address:   b.address   || '',
      toAddress: b['to-address'] || '',
      server:    b.server    || '',
      type:      b.type      || 'regular',   // regular | bypassed | blocked
      comment:   b.comment   || '',
      disabled:  b.disabled  === 'true',
    }));
  }

  async createIpBinding(data) {
    const body = {
      type:    data.type    || 'regular',
      server:  data.server  || 'all',
      comment: data.comment || '',
    };
    if (data.macAddress) body['mac-address'] = data.macAddress;
    if (data.address)    body.address     = data.address;
    if (data.toAddress)  body['to-address'] = data.toAddress;
    return this.mt.put('/ip/hotspot/ip-binding', body);
  }

  async deleteIpBinding(id) { return this.mt.delete(`/ip/hotspot/ip-binding/${id}`); }

  // Edit binding (type / server / comment / address / mac) tanpa hapus-buat-ulang.
  async updateIpBinding(id, data) {
    const body = {};
    if (data.type !== undefined)       body.type = data.type;
    if (data.comment !== undefined)    body.comment = data.comment;
    if (data.macAddress !== undefined) body['mac-address'] = data.macAddress || '';
    if (data.address !== undefined)    body.address = data.address || '';
    if (data.toAddress !== undefined)  body['to-address'] = data.toAddress || '';
    // server='all'/kosong → omit (RouterOS ip-binding terima 'all', tapi konsisten saja)
    if (data.server && data.server !== 'all') body.server = data.server;
    return this.mt.patch(`/ip/hotspot/ip-binding/${id}`, body);
  }

  /**
   * Bersihkan binding duplikat: kelompokkan by MAC+address, sisakan 1 per grup
   * (utamakan type=bypassed & enabled), hapus sisanya.
   */
  async dedupeIpBindings() {
    const list = await this.getIpBindings();
    const norm = s => String(s || '').toUpperCase().trim();
    const groups = new Map();
    for (const b of list) {
      const key = norm(b.macAddress) + '|' + (b.address || '').trim();
      if (key === '|') continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    }
    let removed = 0, dupGroups = 0;
    for (const [, arr] of groups) {
      if (arr.length <= 1) continue;
      dupGroups++;
      arr.sort((a, b) => {
        const score = x => (x.type === 'bypassed' ? 2 : 0) + (x.disabled ? 0 : 1);
        return score(b) - score(a);
      });
      for (let i = 1; i < arr.length; i++) {
        try { await this.deleteIpBinding(arr[i].id); removed++; } catch (_) {}
      }
    }
    return { removed, groups: dupGroups, message: removed ? `${removed} binding duplikat dihapus` : 'Tidak ada duplikat' };
  }

  // ─── WALLED GARDEN (host/domain) ─────────────────────────────

  async getWalledGarden() {
    const list = await this.mt.get('/ip/hotspot/walled-garden');
    return (Array.isArray(list) ? list : []).map(w => ({
      id:        w['.id'],
      action:    w.action    || 'allow',
      server:    w.server    || 'all',
      srcAddress: w['src-address'] || '',
      dstAddress: w['dst-address'] || '',
      dstHost:   w['dst-host'] || '',
      dstPort:   w['dst-port'] || '',
      path:      w.path      || '',
      method:    w.method    || '',
      comment:   w.comment   || '',
      disabled:  w.disabled  === 'true',
      hits:      parseInt(w.hits) || 0,
    }));
  }

  async createWalledGarden(data) {
    const body = {
      action: data.action || 'allow',
    };
    // RouterOS menolak server='all' / kosong via API ("input does not match any
    // value of server"). Hanya kirim kalau berupa nama server hotspot spesifik;
    // kalau tidak, di-omit → RouterOS default ke semua server.
    if (data.server && data.server !== 'all') body.server = data.server;
    if (data.srcAddress) body['src-address'] = data.srcAddress;
    if (data.dstAddress) body['dst-address'] = data.dstAddress;
    if (data.dstHost) body['dst-host'] = data.dstHost;
    if (data.dstPort) body['dst-port'] = data.dstPort;
    if (data.path)    body.path        = data.path;
    if (data.method)  body.method      = String(data.method).toUpperCase();
    if (data.comment) body.comment     = data.comment;
    return this.mt.put('/ip/hotspot/walled-garden', body);
  }

  async deleteWalledGarden(id) { return this.mt.delete(`/ip/hotspot/walled-garden/${id}`); }

  async updateWalledGarden(id, data) {
    const body = {};
    if (data.action      !== undefined) body.action        = data.action || 'allow';
    if (data.server      !== undefined) body.server        = (data.server && data.server !== 'all') ? data.server : '';
    if (data.srcAddress  !== undefined) body['src-address'] = data.srcAddress || '';
    if (data.dstAddress  !== undefined) body['dst-address'] = data.dstAddress || '';
    if (data.dstHost     !== undefined) body['dst-host']    = data.dstHost || '';
    if (data.dstPort     !== undefined) body['dst-port']    = data.dstPort || '';
    if (data.path        !== undefined) body.path           = data.path || '';
    if (data.method      !== undefined) body.method         = data.method ? String(data.method).toUpperCase() : '';
    if (data.comment     !== undefined) body.comment        = data.comment || '';
    return this.mt.patch(`/ip/hotspot/walled-garden/${id}`, body);
  }

  // ─── WALLED GARDEN IP LIST ───────────────────────────────────

  async getWalledGardenIp() {
    const list = await this.mt.get('/ip/hotspot/walled-garden/ip');
    return (Array.isArray(list) ? list : []).map(w => ({
      id:        w['.id'],
      action:    w.action    || 'accept',
      server:    w.server    || 'all',
      srcAddress: w['src-address'] || '',
      dstAddress: w['dst-address'] || '',
      srcAddressList: w['src-address-list'] || '',
      dstAddressList: w['dst-address-list'] || '',
      dstHost:   w['dst-host'] || '',
      dstPort:   w['dst-port'] || '',
      protocol:  w.protocol  || '',
      comment:   w.comment   || '',
      disabled:  w.disabled  === 'true',
      hits:      parseInt(w.hits) || 0,
    }));
  }

  async createWalledGardenIp(data) {
    const body = {
      action: data.action || 'accept',
    };
    if (data.server && data.server !== 'all') body.server = data.server;
    if (data.srcAddress)     body['src-address']      = data.srcAddress;
    if (data.dstAddress)     body['dst-address']      = data.dstAddress;
    if (data.srcAddressList) body['src-address-list'] = data.srcAddressList;
    if (data.dstAddressList) body['dst-address-list'] = data.dstAddressList;
    if (data.dstHost)        body['dst-host']         = data.dstHost;
    if (data.dstPort)        body['dst-port']         = data.dstPort;
    // RouterOS protocol harus lowercase ("tcp", bukan "TCP") — kalau tidak
    // muncul error "input does not match any value of protocol".
    if (data.protocol)       body.protocol            = String(data.protocol).toLowerCase();
    if (data.comment)        body.comment             = data.comment;
    return this.mt.put('/ip/hotspot/walled-garden/ip', body);
  }

  async deleteWalledGardenIp(id) { return this.mt.delete(`/ip/hotspot/walled-garden/ip/${id}`); }

  async updateWalledGardenIp(id, data) {
    const body = {};
    if (data.action         !== undefined) body.action             = data.action || 'accept';
    if (data.server         !== undefined) body.server             = (data.server && data.server !== 'all') ? data.server : '';
    if (data.srcAddress     !== undefined) body['src-address']      = data.srcAddress || '';
    if (data.dstAddress     !== undefined) body['dst-address']      = data.dstAddress || '';
    if (data.srcAddressList !== undefined) body['src-address-list'] = data.srcAddressList || '';
    if (data.dstAddressList !== undefined) body['dst-address-list'] = data.dstAddressList || '';
    if (data.dstHost        !== undefined) body['dst-host']         = data.dstHost || '';
    if (data.dstPort        !== undefined) body['dst-port']         = data.dstPort || '';
    if (data.protocol       !== undefined) body.protocol           = data.protocol ? String(data.protocol).toLowerCase() : '';
    if (data.comment        !== undefined) body.comment            = data.comment || '';
    return this.mt.patch(`/ip/hotspot/walled-garden/ip/${id}`, body);
  }

  // ─── STATS / SUMMARY ─────────────────────────────────────────

  async getSummary() {
    const [servers, users, active, hosts] = await Promise.allSettled([
      this.getServers(),
      this.getUsers(),
      this.getActiveSessions(),
      this.getHosts(),
    ]);

    const sv = servers.status  === 'fulfilled' ? servers.value  : [];
    const us = users.status    === 'fulfilled' ? users.value    : [];
    const ac = active.status   === 'fulfilled' ? active.value   : [];
    const hs = hosts.status    === 'fulfilled' ? hosts.value    : [];

    return {
      totalServers:  sv.length,
      totalUsers:    us.length,
      activeUsers:   ac.length,
      disabledUsers: us.filter(u => u.disabled).length,
      totalHosts:    hs.length,
      totalBytesIn:  ac.reduce((s, x) => s + x.bytesIn,  0),
      totalBytesOut: ac.reduce((s, x) => s + x.bytesOut, 0),
    };
  }
}

function resetHotspotRadiusCacheForTests() {
  _radiusReadyHosts.clear();
  _migrateLocks.clear();
}

module.exports = HotspotService;
module.exports.resetHotspotRadiusCacheForTests = resetHotspotRadiusCacheForTests;
