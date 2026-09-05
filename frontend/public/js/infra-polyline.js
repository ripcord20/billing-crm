/**
 * InfraPolyline — penggambaran & edit jalur kabel presisi (custom polyline).
 * Leaflet native vertex handles + Leaflet.Draw (jika tersedia) sebagai editor.
 * Tidak mengganti Draw Link / Core Kabel / tile / occupancy yang sudah ada.
 *
 * Payload contoh:
 * {
 *   "from_point_id": 3,
 *   "to_point_id": 7,
 *   "waypoints": [[-8.1671, 114.3860]],
 *   "metadata": {
 *     "coordinates": [[-8.1667, 114.3852], [-8.1671, 114.3860], [-8.1674, 114.3871]],
 *     "geojson": { "type": "LineString", "coordinates": [[114.3852, -8.1667], ...] }
 *   }
 * }
 */
(function (global) {
  function parseMaybeJson(value) {
    if (value == null) return null;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (_) { return null; }
    }
    return value;
  }

  function asPair(value) {
    if (value == null) return null;
    if (Array.isArray(value) && value.length >= 2) {
      const a = Number(value[0]), b = Number(value[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return [a, b];
    }
    if (typeof value === 'object') {
      const lat = Number(value.lat != null ? value.lat : value.latitude);
      const lng = Number(value.lng != null ? value.lng : (value.lon != null ? value.lon : value.longitude));
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    }
    return null;
  }

  function looksLikeLngLat(pair) {
    return Math.abs(pair[0]) > 90 && Math.abs(pair[1]) <= 90;
  }

  function normalizePair(pair) {
    if (!pair) return null;
    return looksLikeLngLat(pair) ? [pair[1], pair[0]] : [Number(pair[0]), Number(pair[1])];
  }

  function parseCoordList(raw) {
    const parsed = parseMaybeJson(raw);
    if (!parsed) return [];
    if (parsed.type === 'LineString' && Array.isArray(parsed.coordinates)) {
      return parseCoordList(parsed.coordinates);
    }
    if (!Array.isArray(parsed)) return [];
    const out = [];
    for (let i = 0; i < parsed.length; i++) {
      const pair = normalizePair(asPair(parsed[i]));
      if (pair) out.push(pair);
    }
    return out;
  }

  function near(a, b, eps) {
    const tol = eps == null ? 1e-5 : eps;
    return !!(a && b && Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol);
  }

  function haversineM(a, b) {
    const R = 6371000;
    const toRad = function (d) { return d * Math.PI / 180; };
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function pathDistanceM(path) {
    if (!path || path.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < path.length - 1; i++) dist += haversineM(path[i], path[i + 1]);
    return dist;
  }

  function extractMetaCoords(metadata) {
    const meta = parseMaybeJson(metadata);
    if (!meta || typeof meta !== 'object') return [];
    if (meta.coordinates) return parseCoordList(meta.coordinates);
    if (meta.geojson) return parseCoordList(meta.geojson);
    if (meta.path) return parseCoordList(meta.path);
    return [];
  }

  function cleanPath(path) {
    const cleaned = [];
    for (let i = 0; i < (path || []).length; i++) {
      const p = path[i];
      if (!cleaned.length || !near(cleaned[cleaned.length - 1], p, 1e-7)) cleaned.push(p);
    }
    return cleaned;
  }

  function resolvePath(from, to, waypoints, metadata, coordinates) {
    const fromLL = normalizePair(asPair(from));
    const toLL = normalizePair(asPair(to));
    const meta = parseMaybeJson(metadata);
    const metaObj = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};

    let full = parseCoordList(coordinates);
    if (full.length < 2) full = extractMetaCoords(metaObj);

    const wps = parseCoordList(waypoints);
    if (full.length < 2 && wps.length >= 2 && fromLL && toLL && near(wps[0], fromLL) && near(wps[wps.length - 1], toLL)) {
      full = wps;
    }
    if (full.length < 2 && fromLL && toLL) full = [fromLL].concat(wps, [toLL]);
    else if (full.length < 2) full = wps.slice();

    if (full.length >= 2 && fromLL) full[0] = fromLL;
    if (full.length >= 2 && toLL) full[full.length - 1] = toLL;

    const path = cleanPath(full);
    const intermediates = path.length >= 3 ? path.slice(1, -1) : [];
    return {
      path: path,
      waypoints: intermediates.length ? intermediates : [],
      metadata: {
        coordinates: path,
        geojson: { type: 'LineString', coordinates: path.map(function (p) { return [p[1], p[0]]; }) }
      },
      distance_m: Math.round(pathDistanceM(path))
    };
  }

  function payloadFromPath(path) {
    const resolved = resolvePath(path[0], path[path.length - 1], path.slice(1, -1), null, path);
    return {
      waypoints: resolved.waypoints.length ? resolved.waypoints : null,
      distance_m: resolved.distance_m,
      metadata: resolved.metadata
    };
  }

  function closestSegmentIndex(path, latlng) {
    if (!path || path.length < 2) return 0;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const d = haversineM(mid, [latlng.lat, latlng.lng]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function projectOnSegment(a, b, p) {
    const vx = b[1] - a[1], vy = b[0] - a[0];
    const wx = p[1] - a[1], wy = p[0] - a[0];
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return a.slice();
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return b.slice();
    const t = c1 / c2;
    return [a[0] + t * vy, a[1] + t * vx];
  }

  const InfraPolyline = {
    _map: null,
    _state: null,
    _pluginLine: null,

    resolvePath: resolvePath,
    payloadFromPath: payloadFromPath,
    pathDistanceM: pathDistanceM,
    parseCoordList: parseCoordList,

    isEditing: function () {
      return !!(this._state && this._state.active);
    },

    editingLinkId: function () {
      return this._state && this._state.active ? this._state.linkId : null;
    },

    exitEdit: function (silent) {
      const st = this._state;
      if (!st) return;
      this._unbindKeys();
      this._clearHandles();
      if (this._pluginLine) {
        try {
          if (this._pluginLine.editing && this._pluginLine.editing.disable) this._pluginLine.editing.disable();
          if (this._map) this._map.removeLayer(this._pluginLine);
        } catch (_) {}
        this._pluginLine = null;
      }
      const bar = document.getElementById('pathEditBar');
      if (bar) bar.classList.remove('active');
      if (this._map && this._map.getContainer()) this._map.getContainer().classList.remove('path-edit-mode');
      this._state = null;
      if (!silent && typeof showToast === 'function') showToast('Edit jalur ditutup', 'info', 1600);
    },

    enterEdit: function (map, opts) {
      if (!map || !opts || !opts.linkId) return;
      if (this._state && this._state.linkId === opts.linkId && this._state.active) {
        this._setMode(opts.mode || 'edit');
        this._updateBar();
        return;
      }
      this.exitEdit(true);
      const path = (opts.path && opts.path.length >= 2) ? cleanPath(opts.path.map(function (p) { return normalizePair(asPair(p)); }).filter(Boolean)) : [];
      if (path.length < 2) return;
      this._map = map;
      this._state = {
        active: true,
        linkId: opts.linkId,
        path: path,
        original: path.map(function (p) { return p.slice(); }),
        from: opts.from || path[0],
        to: opts.to || path[path.length - 1],
        selected: -1,
        mode: opts.mode || 'edit',
        dirty: false,
        onSave: opts.onSave
      };
      map.closePopup && map.closePopup();
      if (map.getContainer()) map.getContainer().classList.add('path-edit-mode');
      this._bindKeys();
      this._rebuildHandles();
      this._updateBar();
      if (typeof showToast === 'function') {
        showToast('Tarik titik belok untuk mengikuti jalan. Simpan jika sudah pas.', 'info', 3200);
      }
    },

    setAddMode: function (on) {
      this._setMode(on === false ? 'edit' : 'add');
    },

    setDeleteMode: function (on) {
      this._setMode(on === false ? 'edit' : 'delete');
    },

    handleMapClick: function (latlng) {
      const st = this._state;
      if (!st || !st.active || !latlng) return false;
      if (st.mode === 'add') {
        this.addVertexAt(latlng);
        return true;
      }
      return false;
    },

    addVertexAt: function (latlng) {
      const st = this._state;
      if (!st || !st.active) return;
      const p = [latlng.lat, latlng.lng];
      const idx = closestSegmentIndex(st.path, latlng);
      const projected = projectOnSegment(st.path[idx], st.path[idx + 1], p);
      st.path.splice(idx + 1, 0, projected);
      st.selected = idx + 1;
      st.dirty = true;
      st.mode = 'edit';
      this._rebuildHandles();
      this._updateBar();
    },

    addMidpoint: function () {
      const st = this._state;
      if (!st || st.path.length < 2) return;
      let bestI = 0, bestD = -1;
      for (let i = 0; i < st.path.length - 1; i++) {
        const d = haversineM(st.path[i], st.path[i + 1]);
        if (d > bestD) { bestD = d; bestI = i; }
      }
      const a = st.path[bestI], b = st.path[bestI + 1];
      st.path.splice(bestI + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      st.selected = bestI + 1;
      st.dirty = true;
      st.mode = 'edit';
      this._rebuildHandles();
      this._updateBar();
    },

    removeSelected: function () {
      const st = this._state;
      if (!st) return;
      let idx = st.selected;
      if (idx <= 0 || idx >= st.path.length - 1) {
        if (st.path.length < 3) {
          if (typeof showToast === 'function') showToast('Tidak ada titik belok yang bisa dihapus', 'warning');
          return;
        }
        idx = st.path.length - 2;
      }
      st.path.splice(idx, 1);
      st.selected = -1;
      st.dirty = true;
      st.mode = 'edit';
      this._rebuildHandles();
      this._updateBar();
    },

    cancel: function () {
      const st = this._state;
      if (st && st.dirty && typeof showToast === 'function') {
        showToast('Perubahan jalur dibatalkan', 'info', 1800);
      }
      this.exitEdit(true);
    },

    save: function () {
      const st = this._state;
      if (!st) return Promise.resolve();
      if (st.path.length >= 2) {
        st.path[0] = st.from;
        st.path[st.path.length - 1] = st.to;
      }
      const payload = payloadFromPath(st.path);
      const onSave = st.onSave;
      const linkId = st.linkId;
      if (typeof onSave === 'function') {
        return Promise.resolve(onSave(linkId, payload)).then(function (ok) {
          if (ok !== false) InfraPolyline.exitEdit(true);
          return ok;
        });
      }
      this.exitEdit(true);
      return Promise.resolve(true);
    },

    _setMode: function (mode) {
      if (!this._state) return;
      this._state.mode = mode || 'edit';
      this._updateBar();
      if (mode === 'add' && typeof showToast === 'function') {
        showToast('Klik di sepanjang kabel untuk menambah titik belok', 'info', 2400);
      }
      if (mode === 'delete' && typeof showToast === 'function') {
        showToast('Klik titik belok (bukan ujung node) untuk menghapus', 'info', 2400);
      }
    },

    _clearHandles: function () {
      const st = this._state;
      if (!st || !st.handles) return;
      st.handles.forEach(function (h) {
        try { if (h && InfraPolyline._map) InfraPolyline._map.removeLayer(h); } catch (_) {}
      });
      st.handles = [];
    },

    _syncPluginLine: function () {
      if (!this._pluginLine || !this._state) return;
      try { this._pluginLine.setLatLngs(this._state.path); } catch (_) {}
      try {
        if (this._pluginLine.editing && this._pluginLine.editing.updateMarkers) {
          this._pluginLine.editing.updateMarkers();
        }
      } catch (_) {}
    },

    _enableLeafletDraw: function () {
      if (typeof L === 'undefined' || !L.polyline || !this._map || !this._state) return false;
      if (!(L.Edit && (L.Edit.Poly || L.Edit.PolyVerticesEdit))) return false;
      try {
        this._pluginLine = L.polyline(this._state.path, {
          color: '#00e5cc',
          weight: 3,
          opacity: 0.95,
          className: 'fiber-path-edit',
          interactive: true
        }).addTo(this._map);
        if (this._pluginLine.editing && typeof this._pluginLine.editing.enable === 'function') {
          this._pluginLine.editing.enable();
          const self = this;
          this._pluginLine.on('edit', function () {
            const latlngs = self._pluginLine.getLatLngs();
            const path = latlngs.map(function (ll) { return [ll.lat, ll.lng]; });
            if (path.length >= 2) {
              path[0] = self._state.from;
              path[path.length - 1] = self._state.to;
            }
            self._state.path = path;
            self._state.dirty = true;
            self._pluginLine.setLatLngs(path);
            self._rebuildNativeOnly();
            self._updateBar();
          });
          return true;
        }
        this._map.removeLayer(this._pluginLine);
        this._pluginLine = null;
      } catch (_) {
        this._pluginLine = null;
      }
      return false;
    },

    _rebuildNativeOnly: function () {
      this._clearHandles();
      this._buildNativeHandles({ skipPlugin: true });
    },

    _rebuildHandles: function () {
      this._clearHandles();
      if (this._pluginLine) {
        try {
          if (this._pluginLine.editing && this._pluginLine.editing.disable) this._pluginLine.editing.disable();
          this._map.removeLayer(this._pluginLine);
        } catch (_) {}
        this._pluginLine = null;
      }
      const usedPlugin = this._enableLeafletDraw();
      this._buildNativeHandles({ skipPlugin: usedPlugin });
      this._syncPluginLine();
    },

    _buildNativeHandles: function (opts) {
      const st = this._state;
      const map = this._map;
      if (!st || !map) return;
      st.handles = st.handles || [];
      const skipDrag = !!(opts && opts.skipPlugin);
      const self = this;

      st.path.forEach(function (pt, idx) {
        const isEnd = idx === 0 || idx === st.path.length - 1;
        const selected = st.selected === idx;
        if (skipDrag) return;
        const marker = L.marker(pt, {
          icon: L.divIcon({
            className: 'path-vertex-wrap',
            html: '<div class="path-vertex' + (isEnd ? ' end' : '') + (selected ? ' sel' : '') + '"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          }),
          draggable: !isEnd,
          interactive: true,
          keyboard: false,
          zIndexOffset: 520
        });
        marker.on('click', function (e) {
          L.DomEvent.stopPropagation(e);
          if (isEnd) return;
          st.selected = idx;
          if (st.mode === 'delete') {
            self.removeSelected();
            return;
          }
          self._rebuildHandles();
          self._updateBar();
        });
        marker.on('drag', function (e) {
          if (isEnd) return;
          const ll = e.target.getLatLng();
          st.path[idx] = [ll.lat, ll.lng];
          st.dirty = true;
          self._syncVisual(st.path);
          self._syncPluginLine();
        });
        marker.on('dragend', function () {
          st.dirty = true;
          self._updateBar();
        });
        marker.addTo(map);
        st.handles.push(marker);
      });

      if (!skipDrag) {
        for (let i = 0; i < st.path.length - 1; i++) {
          const a = st.path[i], b = st.path[i + 1];
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const plus = L.marker(mid, {
            icon: L.divIcon({
              className: 'path-mid-handle',
              html: '<div class="path-mid-plus">+</div>',
              iconSize: [18, 18],
              iconAnchor: [9, 9]
            }),
            interactive: true,
            zIndexOffset: 400
          });
          (function (segIndex) {
            plus.on('click', function (e) {
              L.DomEvent.stopPropagation(e);
              const aa = st.path[segIndex], bb = st.path[segIndex + 1];
              st.path.splice(segIndex + 1, 0, [(aa[0] + bb[0]) / 2, (aa[1] + bb[1]) / 2]);
              st.selected = segIndex + 1;
              st.dirty = true;
              st.mode = 'edit';
              self._rebuildHandles();
              self._updateBar();
            });
          })(i);
          plus.addTo(map);
          st.handles.push(plus);
        }
      }

      this._syncVisual(st.path);
    },

    _syncVisual: function (path) {
      const st = this._state;
      if (!st || !global._infraLinkById) return;
      const rec = global._infraLinkById[st.linkId];
      if (!rec || !rec.layers) return;
      rec.layers.forEach(function (layer) {
        try { if (layer && layer.setLatLngs) layer.setLatLngs(path); } catch (_) {}
      });
      rec.path = path;
    },

    _bindKeys: function () {
      if (this._onKey) return;
      const self = this;
      this._onKey = function (e) {
        if (!self._state || !self._state.active) return;
        const tag = (e.target && e.target.tagName) || '';
        if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
        if (e.key === 'Escape') { e.preventDefault(); self.cancel(); }
        if ((e.key === 'Backspace' || e.key === 'Delete') && self._state.selected > 0) {
          e.preventDefault();
          self.removeSelected();
        }
        if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          self.save();
        }
      };
      document.addEventListener('keydown', this._onKey);
    },

    _unbindKeys: function () {
      if (this._onKey) {
        document.removeEventListener('keydown', this._onKey);
        this._onKey = null;
      }
    },

    _updateBar: function () {
      const st = this._state;
      const bar = document.getElementById('pathEditBar');
      const text = document.getElementById('pathEditText');
      if (!bar) return;
      if (!st || !st.active) { bar.classList.remove('active'); return; }
      bar.classList.add('active');
      const bends = Math.max(0, st.path.length - 2);
      const dist = pathDistanceM(st.path);
      const distTxt = dist > 1000 ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
      let modeTxt = 'tarik titik untuk membelokkan kabel';
      if (st.mode === 'add') modeTxt = 'klik peta/kabel untuk TAMBAH titik belok';
      if (st.mode === 'delete') modeTxt = 'klik titik belok untuk HAPUS';
      if (text) {
        text.innerHTML = '<strong>Edit jalur</strong> · ' + bends + ' titik belok · ~' + distTxt
          + ' · ' + modeTxt + (st.dirty ? ' · belum disimpan' : '');
      }
      bar.classList.toggle('mode-add', st.mode === 'add');
      bar.classList.toggle('mode-delete', st.mode === 'delete');
    }
  };

  global.InfraPolyline = InfraPolyline;
})(window);
