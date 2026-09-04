'use strict';

/**
 * GPS precision helpers for technician tracking.
 * Filters cell-tower jumps and low-accuracy fixes so trails stay on the road.
 */

const MAX_ACCEPT_ACCURACY_M = 80;
const MIN_JUMP_BUDGET_M = 40;

function parseCoord(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function roundCoord(value, decimals) {
  const n = parseCoord(value);
  if (n == null) return null;
  const d = decimals == null ? 7 : decimals;
  return Number(n.toFixed(d));
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const a = parseCoord(lat1);
  const b = parseCoord(lon1);
  const c = parseCoord(lat2);
  const d = parseCoord(lon2);
  if (a == null || b == null || c == null || d == null) return 0;
  const R = 6371000;
  const φ1 = a * Math.PI / 180;
  const φ2 = c * Math.PI / 180;
  const Δφ = (c - a) * Math.PI / 180;
  const Δλ = (d - b) * Math.PI / 180;
  const x = Math.sin(Δφ / 2) ** 2
    + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Inverse-variance blend of two GPS fixes (Kalman-like).
 */
function blendFixes(prev, lat, lng, accuracy) {
  const nextAcc = Number(accuracy);
  if (!prev || !Number.isFinite(nextAcc) || nextAcc <= 0) {
    return { latitude: lat, longitude: lng, accuracy: Number.isFinite(nextAcc) ? nextAcc : null };
  }
  const prevAcc = Number(prev.accuracy);
  if (!Number.isFinite(prevAcc) || prevAcc <= 0) {
    return { latitude: lat, longitude: lng, accuracy: nextAcc };
  }
  const wNew = 1 / Math.max(nextAcc * nextAcc, 4);
  const wOld = 1 / Math.max(prevAcc * prevAcc, 4);
  const w = wNew + wOld;
  return {
    latitude: (prev.latitude * wOld + lat * wNew) / w,
    longitude: (prev.longitude * wOld + lng * wNew) / w,
    accuracy: Math.sqrt(1 / w)
  };
}

/**
 * Decide whether a new fix should be stored and how much distance to add.
 */
function evaluateFix(prev, lat, lng, accuracy) {
  const acc = accuracy == null || accuracy === '' ? null : Number(accuracy);
  if (acc != null && Number.isFinite(acc) && acc > MAX_ACCEPT_ACCURACY_M && prev) {
    return { accept: false, distance: 0, reason: 'low_accuracy' };
  }

  if (!prev) {
    return { accept: true, distance: 0, reason: 'first' };
  }

  const dist = calculateDistance(prev.latitude, prev.longitude, lat, lng);
  const prevAcc = Number(prev.accuracy);
  const budget = Math.max(
    MIN_JUMP_BUDGET_M,
    (Number.isFinite(prevAcc) ? prevAcc : 25) + (Number.isFinite(acc) ? acc : 25)
  );
  if (dist > budget * 2) {
    return { accept: false, distance: 0, reason: 'gps_jump' };
  }
  return { accept: true, distance: dist, reason: 'ok' };
}

module.exports = {
  MAX_ACCEPT_ACCURACY_M,
  parseCoord,
  roundCoord,
  calculateDistance,
  blendFixes,
  evaluateFix
};
