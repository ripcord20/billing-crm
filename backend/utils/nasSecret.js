'use strict';

const crypto = require('crypto');

function generateNasSecret() {
  return 'fx' + crypto.randomBytes(10).toString('hex');
}

function resolveNasSecret(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s || s === '********') return generateNasSecret();
  return s;
}

module.exports = { generateNasSecret, resolveNasSecret };
