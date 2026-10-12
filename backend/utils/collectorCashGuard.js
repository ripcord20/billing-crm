/**
 * Aturan plafon deposit kolektor + setor kas.
 * Fungsi murni (tanpa DB) supaya mudah diuji.
 *
 * Model:
 *   - Owner injek plafon (deposit_limit). Default 0 = belum boleh terima tunai.
 *   - cash_held = uang tunai di tangan kolektor (belum disetor).
 *   - sisa plafon = deposit_limit - cash_held.
 *   - Tagih tunai hanya boleh jika sisa plafon cukup dan tidak ada setoran pending.
 *   - Setor harus = cash_held, wajib bukti, satu pending pada satu waktu.
 */

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function cashRoom(depositLimit, cashHeld) {
  return Math.max(0, num(depositLimit) - num(cashHeld));
}

function assertCanCollectCash({ depositLimit, cashHeld, pendingDeposit, amount }) {
  const amt = num(amount);
  if (amt <= 0) {
    return { ok: false, code: 'invalid_amount', message: 'Nominal pembayaran tidak valid' };
  }
  if (pendingDeposit) {
    return {
      ok: false,
      code: 'pending_setor',
      message: 'Masih ada setoran menunggu verifikasi. Selesaikan setor dulu sebelum terima tunai lagi.'
    };
  }
  const limit = num(depositLimit);
  if (limit <= 0) {
    return {
      ok: false,
      code: 'no_plafon',
      message: 'Plafon deposit masih Rp0. Owner harus injek saldo dulu sebelum kolektor boleh terima tunai.'
    };
  }
  const room = cashRoom(limit, cashHeld);
  if (amt > room) {
    return {
      ok: false,
      code: 'over_plafon',
      message: `Sisa plafon deposit hanya Rp${room.toLocaleString('id-ID')}. Setor kas dulu atau minta owner injek saldo.`
    };
  }
  return { ok: true, room };
}

function assertCanCreateSetor({ cashHeld, pendingDeposit, hasProof }) {
  if (pendingDeposit) {
    return { ok: false, code: 'pending_setor', message: 'Masih ada setoran menunggu verifikasi.' };
  }
  const expected = num(cashHeld);
  if (expected <= 0) {
    return { ok: false, code: 'no_cash', message: 'Tidak ada kas di tangan untuk disetor.' };
  }
  if (!hasProof) {
    return { ok: false, code: 'proof_required', message: 'Foto bukti setor wajib. Tanpa bukti setoran ditolak.' };
  }
  return { ok: true, expected };
}

function nextDepositLimit(currentLimit, cashHeld, delta) {
  const add = num(delta);
  if (!add) return { ok: false, message: 'Nominal injek tidak valid' };
  const next = num(currentLimit) + add;
  if (next < 0) return { ok: false, message: 'Plafon tidak boleh negatif' };
  if (next < num(cashHeld)) {
    return {
      ok: false,
      message: `Plafon tidak boleh di bawah kas di tangan (Rp${num(cashHeld).toLocaleString('id-ID')}).`
    };
  }
  return { ok: true, next };
}

module.exports = {
  num,
  cashRoom,
  assertCanCollectCash,
  assertCanCreateSetor,
  nextDepositLimit
};
