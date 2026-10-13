'use strict';

function basePath() {
  const raw = String(process.env.SAAS_BASE_PATH || '/platform').trim();
  if (!raw || raw === '/') return '';
  return raw.replace(/\/+$/, '');
}

function withBase(p) {
  const b = basePath();
  const path = p.startsWith('/') ? p : '/' + p;
  if (!b) return path;
  if (path === '/') return b + '/';
  return b + path;
}

function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'tenant';
}

function publicUrl() {
  return String(process.env.SAAS_PUBLIC_URL || '').replace(/\/+$/, '') || withBase('/');
}

module.exports = { basePath, withBase, slugify, publicUrl };
