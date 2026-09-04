'use strict';

/**
 * Foto KTP / rumah pelanggan.
 *
 * Sumber utama: Customer.documents JSON { ktp: {url,...}, house: {url,...} }
 * Kolom VARCHAR ktp_photo / house_photo disinkronkan supaya listing &
 * aktivasi dari registrasi sales bisa baca path tanpa parse JSON.
 */

const SLOTS = ['ktp', 'house'];

function columnForSlot(slot) {
  if (slot === 'ktp') return 'ktp_photo';
  if (slot === 'house') return 'house_photo';
  return null;
}

function normalizeCustomerDocuments(customer) {
  const src = customer && typeof customer === 'object' ? customer : {};
  let docs = src.documents;
  if (!docs || Array.isArray(docs) || typeof docs !== 'object') docs = {};
  const out = Object.assign({}, docs);
  if (!out.ktp && src.ktp_photo) out.ktp = { url: src.ktp_photo };
  if (!out.house && src.house_photo) out.house = { url: src.house_photo };
  return out;
}

function applyDocumentSlot(customer, slot, entry) {
  if (!SLOTS.includes(slot)) {
    throw new Error('Slot dokumen tidak valid');
  }
  const docs = normalizeCustomerDocuments(customer);
  if (entry && entry.url) docs[slot] = entry;
  else delete docs[slot];

  const patch = { documents: docs };
  const col = columnForSlot(slot);
  if (col) patch[col] = (entry && entry.url) ? entry.url : null;
  return patch;
}

function documentsFromRegistration(reg) {
  const src = reg && typeof reg === 'object' ? reg : {};
  const docs = {};
  const now = new Date().toISOString();
  if (src.ktp_photo) {
    docs.ktp = { url: src.ktp_photo, name: 'Foto KTP', uploaded_at: now };
  }
  if (src.house_photo) {
    docs.house = { url: src.house_photo, name: 'Foto Rumah', uploaded_at: now };
  }
  return {
    ktp_photo: src.ktp_photo || null,
    house_photo: src.house_photo || null,
    documents: Object.keys(docs).length ? docs : null
  };
}

module.exports = {
  SLOTS,
  columnForSlot,
  normalizeCustomerDocuments,
  applyDocumentSlot,
  documentsFromRegistration
};
