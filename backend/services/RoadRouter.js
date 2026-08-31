'use strict';
/**
 * Routing kabel fiber mengikuti jalan (OSRM).
 * Titik input/output: [lat, lng].
 */

const axios = require('axios');
const logger = require('../utils/logger');

const PROVIDERS = [
  process.env.OSRM_URL || 'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car',
];

function downsample(coords, maxPoints = 80) {
  if (!Array.isArray(coords) || coords.length <= maxPoints) return coords || [];
  const step = Math.max(1, Math.ceil(coords.length / maxPoints));
  const out = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  const last = coords[coords.length - 1];
  const prev = out[out.length - 1];
  if (!prev || prev[0] !== last[0] || prev[1] !== last[1]) out.push(last);
  return out;
}

function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pathDistanceM(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += haversineM(points[i], points[i + 1]);
  return Math.round(total);
}

function normalizePoints(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (Array.isArray(p) && p.length >= 2) return [parseFloat(p[0]), parseFloat(p[1])];
      if (p && typeof p === 'object') {
        const lat = parseFloat(p.lat ?? p.latitude);
        const lng = parseFloat(p.lng ?? p.lon ?? p.longitude);
        return [lat, lng];
      }
      return null;
    })
    .filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

async function fetchOsrm(base, points) {
  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `${base.replace(/\/+$/, '')}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await axios.get(url, {
    timeout: 9000,
    headers: { 'User-Agent': 'Fiberix-CRM/1.0 (infrastructure map cable routing)' },
    validateStatus: (s) => s >= 200 && s < 500,
  });
  if (res.status !== 200 || res.data?.code !== 'Ok') {
    const err = new Error(res.data?.message || `OSRM ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const geometry = res.data.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(geometry) || geometry.length < 2) {
    throw new Error('OSRM geometry kosong');
  }
  const latlngs = geometry.map(([lng, lat]) => [lat, lng]);
  return {
    path: latlngs,
    distance_m: Math.round(res.data.routes[0].distance || pathDistanceM(latlngs)),
  };
}

/**
 * Route along roads between 2+ points.
 * Returns intermediate waypoints (tanpa titik awal/akhir) supaya endpoint marker tetap dipakai.
 */
async function routeAlongRoads(rawPoints, opts = {}) {
  const points = normalizePoints(rawPoints);
  if (points.length < 2) {
    return { ok: false, fallback: true, waypoints: [], path: points, distance_m: 0, error: 'Minimal 2 titik' };
  }

  const maxPoints = opts.maxPoints || 80;
  let lastErr = null;
  for (const base of PROVIDERS) {
    try {
      const routed = await fetchOsrm(base, points);
      const full = downsample(routed.path, maxPoints);
      const waypoints = full.length > 2 ? full.slice(1, -1) : [];
      return {
        ok: true,
        fallback: false,
        waypoints,
        path: full,
        distance_m: routed.distance_m,
        provider: base,
      };
    } catch (err) {
      lastErr = err;
      logger.warn(`[RoadRouter] ${base} gagal: ${err.message}`);
    }
  }

  return {
    ok: false,
    fallback: true,
    waypoints: points.slice(1, -1),
    path: points,
    distance_m: pathDistanceM(points),
    error: lastErr ? lastErr.message : 'routing gagal',
  };
}

module.exports = {
  downsample,
  haversineM,
  pathDistanceM,
  normalizePoints,
  routeAlongRoads,
};
