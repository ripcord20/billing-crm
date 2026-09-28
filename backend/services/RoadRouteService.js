'use strict';

/**
 * Snap a pair of coordinates onto the OSM road network (OSRM).
 * Used by Fiber GIS "Kabel Jalan" so a cable follows streets instead of
 * a straight air-line between two nodes.
 */

const OSRM_ENDPOINTS = [
  'https://router.project-osrm.org/route/v1/driving',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving'
];

const MAX_POINTS = 120;
const TIMEOUT_MS = 8000;

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function downsample(coords) {
  if (!Array.isArray(coords) || coords.length <= MAX_POINTS) return coords || [];
  const out = [coords[0]];
  const step = (coords.length - 1) / (MAX_POINTS - 1);
  for (let i = 1; i < MAX_POINTS - 1; i++) {
    out.push(coords[Math.round(i * step)]);
  }
  out.push(coords[coords.length - 1]);
  return out;
}

async function fetchOsrm(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'fiberix-gis/1.0' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function routeAlongRoad(fromLat, fromLng, toLat, toLng) {
  const aLat = toNum(fromLat);
  const aLng = toNum(fromLng);
  const bLat = toNum(toLat);
  const bLng = toNum(toLng);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) {
    return { ok: false, message: 'Koordinat tidak valid' };
  }

  const loc = `${aLng},${aLat};${bLng},${bLat}`;
  const qs = 'overview=full&geometries=geojson&alternatives=false&steps=false';

  for (const base of OSRM_ENDPOINTS) {
    const json = await fetchOsrm(`${base}/${loc}?${qs}`);
    const route = json && json.routes && json.routes[0];
    const geom = route && route.geometry && route.geometry.coordinates;
    if (!Array.isArray(geom) || geom.length < 2) continue;
    const coordinates = downsample(geom.map((p) => [p[1], p[0]]));
    return {
      ok: true,
      coordinates,
      distance_m: Math.round(route.distance || 0)
    };
  }

  return { ok: false, message: 'Rute jalan tidak tersedia' };
}

module.exports = { routeAlongRoad };
