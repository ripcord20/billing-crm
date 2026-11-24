'use strict';

/**
 * Filter daftar transaksi modul Keuangan.
 *
 * Hutang/piutang dan kotak Cari tidak dibatasi bulan yang sedang dipilih.
 * Kalau dibatasi, data yang tanggalnya di bulan lain (mis. pinjaman Juni
 * saat tabel November) hilang — user kira simpan gagal.
 */

function isTruthyFlag(v) {
  return ['1', 'true', 'yes'].includes(String(v == null ? '' : v).toLowerCase());
}

function shouldSkipPeriodFilter({ type, search, all_months } = {}) {
  const t = String(type || '');
  if (t === 'hutang' || t === 'piutang') return true;
  if (String(search || '').trim()) return true;
  return isTruthyFlag(all_months);
}

function buildKeuanganListWhere(query = {}, { Op, moment } = {}) {
  if (!Op || !moment) throw new Error('Op dan moment wajib');

  const type = query.type && query.type !== 'semua' ? String(query.type) : '';
  const search = String(query.search || '').trim();
  const skipPeriod = shouldSkipPeriodFilter({
    type,
    search,
    all_months: query.all_months
  });

  const where = {};
  if (type) where.type = type;

  if (!skipPeriod) {
    const month = query.month;
    const year = query.year;
    if (month && year) {
      const start = moment(`${year}-${String(month).padStart(2, '0')}-01`).startOf('month').format('YYYY-MM-DD');
      const end = moment(start).endOf('month').format('YYYY-MM-DD');
      where.date = { [Op.between]: [start, end] };
    } else if (year) {
      where.date = { [Op.between]: [`${year}-01-01`, `${year}-12-31`] };
    }
  }

  if (search) {
    const like = { [Op.like]: `%${search}%` };
    where[Op.or] = [
      { description: like },
      { category: like },
      { party_name: like },
      { ref_number: like },
      { notes: like }
    ];
  }

  return { where, skipPeriod };
}

module.exports = {
  shouldSkipPeriodFilter,
  buildKeuanganListWhere
};
