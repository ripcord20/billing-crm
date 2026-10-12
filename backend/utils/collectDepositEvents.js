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
  return payload;
}

function emitCollectorDeposit(dep, extra = {}) {
  try {
    const io = global.__io;
    if (!io || !dep || !dep.collector_id) return null;
    const payload = depositEventPayload(dep, extra);
    if (!payload) return null;
    io.to('user_' + dep.collector_id).emit('collect:deposit', payload);
    return payload;
  } catch (_) {
    return null;
  }
}

module.exports = { depositEventPayload, emitCollectorDeposit };
