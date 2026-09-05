'use strict';

/**
 * Normalisasi jalur kabel infrastruktur.
 * Source of truth: [latitude, longitude] (sama seperti kolom waypoints existing).
 * GeoJSON LineString memakai [longitude, latitude] hanya di metadata.geojson.
 */

function parseMaybeJson(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try { return JSON.parse(trimmed); } catch (_) { return null; }
  }
  return value;
}

function asPair(value) {
  if (value == null) return null;
  if (Array.isArray(value) && value.length >= 2) {
    const a = Number(value[0]);
    const b = Number(value[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return [a, b];
  }
  if (typeof value === 'object') {
    const lat = Number(value.lat ?? value.latitude);
    const lng = Number(value.lng ?? value.lon ?? value.longitude);
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
  for (const item of parsed) {
    const pair = normalizePair(asPair(item));
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
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const sin = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(sin)));
}

function pathDistanceM(path) {
  if (!Array.isArray(path) || path.length < 2) return 0;
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
  for (const point of path || []) {
    if (!cleaned.length || !near(cleaned[cleaned.length - 1], point, 1e-7)) cleaned.push(point);
  }
  return cleaned;
}

/**
 * @param {[number,number]|object|null} from
 * @param {[number,number]|object|null} to
 * @param {any} waypoints
 * @param {any} metadata
 * @param {any} coordinates
 */
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
  if (full.length < 2 && fromLL && toLL) {
    full = [fromLL, ...wps, toLL];
  } else if (full.length < 2) {
    full = wps.slice();
  }

  if (full.length >= 2 && fromLL) full[0] = fromLL;
  if (full.length >= 2 && toLL) full[full.length - 1] = toLL;

  const path = cleanPath(full);
  const intermediates = path.length >= 3 ? path.slice(1, -1) : [];

  return {
    path,
    waypoints: intermediates.length ? intermediates : null,
    metadata: {
      ...metaObj,
      coordinates: path,
      geojson: {
        type: 'LineString',
        coordinates: path.map(([lat, lng]) => [lng, lat])
      }
    },
    distance_m: Math.round(pathDistanceM(path))
  };
}

function mergeLinkMetadata(existing, incoming, pathMeta) {
  const base = parseMaybeJson(existing);
  const extra = parseMaybeJson(incoming);
  const baseObj = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
  const extraObj = extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {};
  return {
    ...baseObj,
    ...extraObj,
    coordinates: pathMeta.coordinates,
    geojson: pathMeta.geojson
  };
}

module.exports = {
  parseMaybeJson,
  parseCoordList,
  pathDistanceM,
  resolvePath,
  mergeLinkMetadata,
  near
};
