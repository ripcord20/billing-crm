'use strict';

const crypto = require('crypto');

function getKey() {
  const raw = process.env.CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (!raw || raw.length < 8) return null;
  return crypto.scryptSync(raw, 'radius-sql-v1', 32);
}

function encryptSecret(plain) {
  if (plain == null || plain === '') return plain;
  if (typeof plain !== 'string') plain = String(plain);
  if (plain.startsWith('enc:v1:')) return plain;
  const key = getKey();
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc:v1:' + Buffer.concat([iv, tag, ct]).toString('base64');
}

function decryptSecret(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') value = String(value);
  if (!value.startsWith('enc:v1:')) return value;
  const key = getKey();
  if (!key) return '';
  const buf = Buffer.from(value.slice(7), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
