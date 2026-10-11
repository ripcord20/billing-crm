/**
 * Nama petugas yang melunasi invoice.
 * Prioritas: kolektor lapangan (collected_by) → user yang mencatat (recorded_by).
 * Pembayaran migrasi/gateway tanpa user tampil sebagai Sistem.
 */
function paidByDisplayName(collectedName, recordedName, notes) {
  const collected = collectedName && String(collectedName).trim();
  if (collected) return collected;
  const recorded = recordedName && String(recordedName).trim();
  if (recorded) return recorded;
  if (notes && /migrasi/i.test(String(notes))) return 'Migrasi BillingRadius';
  return 'Sistem';
}

function paidByFromPayment(pay) {
  if (!pay) return '';
  const collected = pay.collector && pay.collector.name;
  const recorded = (pay.recorder && pay.recorder.name) || pay.recorded_by_name || pay.collected_by_name;
  if ((collected && String(collected).trim()) || (recorded && String(recorded).trim())) {
    return paidByDisplayName(collected, recorded, pay.notes);
  }
  if (pay.notes && /migrasi/i.test(String(pay.notes))) return 'Migrasi BillingRadius';
  return '';
}

module.exports = { paidByDisplayName, paidByFromPayment };
