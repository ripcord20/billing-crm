'use strict';

/**
 * Event setoran kas ke app kolektor (Socket.IO room user_<id>).
 * Dipisah dari CollectNotifier supaya bisa diuji tanpa gateway WA.
 */
function depositEventPayload(dep, extra = {}) {
  if (!dep) return null;
  const status = extra.status || dep.status;
  const payload = {
    id: dep.id,
    collector_id: dep.collector_id,
    status,
    deposited_amount: parseFloat(dep.deposited_amount || 0),
    pending_deposit: extra.pending_deposit === undefined
      ? String(status) === 'pending'
      : !!extra.pending_deposit
  };
    if (extra.cash_held != null) payload.cash_held = extra.cash_held;
    if (extra.deposit_limit != null) payload.deposit_limit = extra.deposit_limit;
    if (extra.deposit_room != null) payload.deposit_room = extra.deposit_room;
    if (extra.collector_name) payload.collector_name = extra.collector_name;
    return payload;
}

function emitCollectorDeposit(dep, extra = {}) {
  try {
    const io = global.__io;
    if (!io || !dep || !dep.collector_id) return null;
    const payload = depositEventPayload(dep, extra);
    if (!payload) return null;
    io.to('user_' + dep.collector_id).emit('collect:deposit', payload);
    // Admin Collect (Laporan / Setoran Kas) harus langsung melihat setoran baru.
    if (typeof io.emit === 'function') io.emit('collect:deposit:admin', payload);
    return payload;
  } catch (_) {
    return null;
  }
}

module.exports = { depositEventPayload, emitCollectorDeposit };
