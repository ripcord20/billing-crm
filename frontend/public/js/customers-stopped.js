'use strict';

const REASONS_FALLBACK = [
  'Pindah rumah','Pindah kota','Ganti ISP','Tidak mampu bayar',
  'Isolir berkepanjangan','Tutup usaha','Kualitas jaringan','Lainnya',
];

let _page = 1;
let _reasons = REASONS_FALLBACK.slice();
let _pickedReason = 'Pindah rumah';
let _searchTimer = null;
let _pickerTimer = null;
let _settlement = '';
let _rows = [];
let _drawerId = null;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function fmtDate(s) {
  if (!s) return '–';
  const d = new Date(String(s).slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return esc(s);
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

function fmtRp(n) {
  const v = Math.round(Number(n) || 0);
  return 'Rp ' + v.toLocaleString('id-ID');
}

function settleHtml(c) {
  if (c.settlement === 'tanggungan' || (Number(c.balance) || 0) > 0) {
    return '<span class="pill-tanggungan">Tanggungan ' + fmtRp(c.balance) + '</span>';
  }
  return '<span class="pill-lunas">Lunas</span>';
}

function notePreview(c) {
  const t = String(c.stop_notes || '').trim();
  if (!t) return '<div class="note-preview empty" onclick="openStopDrawer('+c.id+')">Belum ada catatan</div>';
  return '<div class="note-preview" title="'+esc(t)+'" onclick="openStopDrawer('+c.id+')">'+esc(t)+'</div>';
}

function fillReasonSelect(reasons) {
  const sel = document.getElementById('stopReason');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Semua alasan</option>' +
    reasons.map(r => '<option value="'+esc(r)+'">'+esc(r)+'</option>').join('');
  if (cur) sel.value = cur;
}

function renderChips(reasons) {
  const box = document.getElementById('reasonChips');
  if (!box) return;
  box.innerHTML = reasons.map(r =>
    '<button type="button" class="chip'+(r === _pickedReason ? ' on' : '')+'" data-r="'+esc(r)+'">'+esc(r)+'</button>'
  ).join('');
  box.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      _pickedReason = btn.dataset.r;
      renderChips(reasons);
      const other = document.getElementById('stopReasonOther');
      if (other) other.style.display = _pickedReason === 'Lainnya' ? 'block' : 'none';
    });
  });
}

function syncSettleChips() {
  document.querySelectorAll('#settleChips .st-chip').forEach(btn => {
    btn.classList.toggle('on', (btn.dataset.s || '') === _settlement);
  });
}

async function loadStats() {
  const d = await App.api('/customers/stopped/stats');
  if (!d || !d.success) return;
  const s = d.data || {};
  const t = document.getElementById('stTotal');
  const m = document.getElementById('stMonth');
  const ml = document.getElementById('stMonthLbl');
  const r = document.getElementById('stReason');
  const rs = document.getElementById('stReasonSub');
  const sub = document.getElementById('stSettleSub');
  if (t) t.textContent = s.total || 0;
  if (m) m.textContent = s.this_month || 0;
  if (ml) ml.textContent = s.month ? ('Periode ' + s.month) : '—';
  if (r) r.textContent = (s.top_reason && s.top_reason.reason) || 'Belum ada';
  if (rs) rs.textContent = s.top_reason ? (s.top_reason.count + ' pelanggan') : 'Isi alasan saat mencatat berhenti';
  if (sub) {
    const tg = s.tanggungan || 0;
    const ln = s.lunas || 0;
    sub.textContent = tg + ' tanggungan · ' + ln + ' lunas';
  }
}

async function loadList() {
  const search = document.getElementById('stopSearch')?.value || '';
  const reason = document.getElementById('stopReason')?.value || '';
  const month  = document.getElementById('stopMonth')?.value || '';
  const q = '/customers/stopped?page=' + _page + '&limit=20'
    + '&search=' + encodeURIComponent(search)
    + '&reason=' + encodeURIComponent(reason)
    + '&month=' + encodeURIComponent(month)
    + '&settlement=' + encodeURIComponent(_settlement);
  const d = await App.api(q);
  const tbody = document.getElementById('stopTable');
  const count = document.getElementById('stopCount');
  const pager = document.getElementById('stopPager');
  if (!d || !d.success) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#dc2626">Gagal memuat</td></tr>';
    return;
  }
  if (Array.isArray(d.reasons) && d.reasons.length) {
    _reasons = d.reasons;
    fillReasonSelect(_reasons);
  }
  const rows = d.data || [];
  _rows = rows;
  const total = d.pagination ? d.pagination.total : (d.total || rows.length);
  if (count) count.textContent = total + ' pelanggan';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:48px;color:#6b7fa8">'
      + '<div style="font-size:15px;font-weight:700;color:#0d1b3e;margin-bottom:6px">Belum ada data berhenti</div>'
      + '<div>Pakai tombol <b>Catat berhenti</b>. Isolir/suspend juga bisa dicari (contoh: Asina).</div>'
      + '</td></tr>';
  } else {
    tbody.innerHTML = rows.map(c => {
      const pkg = (c.package && c.package.name) || '–';
      const area = c.area || [c.district, c.regency].filter(Boolean).join(', ') || '–';
      const reason = c.stop_reason || 'Belum diisi';
      return '<tr>'
        + '<td><span class="cid-badge">'+esc(c.customer_id)+'</span></td>'
        + '<td><a href="/customers/profile/'+c.id+'" style="font-weight:700;color:#0d1b3e;text-decoration:none">'+esc(c.name)+'</a>'
        + '<div style="font-size:11px;color:#6b7fa8">'+esc(c.phone||'')+'</div></td>'
        + '<td>'+esc(pkg)+'</td>'
        + '<td>'+esc(area)+'</td>'
        + '<td>'+fmtDate(c.stopped_on || c.stopped_at)+'</td>'
        + '<td><span class="sb">'+esc(reason)+'</span></td>'
        + '<td>'+settleHtml(c)+'</td>'
        + '<td>'+notePreview(c)+'</td>'
        + '<td style="text-align:right;padding-right:18px;white-space:nowrap">'
        + '<button class="rb rb-note" onclick="openStopDrawer('+c.id+')">Catatan</button> '
        + '<a class="rb rb-edit" href="/customers/profile/'+c.id+'">Profil</a> '
        + '<button class="rb rb-act" onclick="reactivate('+c.id+',\''+esc(c.name)+'\')">Aktifkan</button>'
        + '</td></tr>';
    }).join('');
  }
  const pages = d.pagination ? (d.pagination.totalPages || 1) : Math.max(1, Math.ceil(total / 20));
  if (pager) {
    pager.innerHTML = '<span style="font-size:12.5px;color:#6b7fa8">Halaman '+_page+' / '+pages+'</span>'
      + '<div style="display:flex;gap:6px">'
      + '<button class="btn-fin btn-ghost" ' + (_page <= 1 ? 'disabled' : '') + ' onclick="goPage('+(_page-1)+')">Sebelumnya</button>'
      + '<button class="btn-fin btn-ghost" ' + (_page >= pages ? 'disabled' : '') + ' onclick="goPage('+(_page+1)+')">Berikutnya</button>'
      + '</div>';
  }
}

window.goPage = function(p) {
  if (p < 1) return;
  _page = p;
  loadList();
};

window.openStopModal = function() {
  document.getElementById('stopCustId').value = '';
  document.getElementById('stopCustSearch').value = '';
  document.getElementById('stopCustPick').textContent = 'Belum dipilih';
  document.getElementById('stopCustList').innerHTML = '';
  document.getElementById('stopDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('stopReasonOther').value = '';
  document.getElementById('stopReasonOther').style.display = 'none';
  const notes = document.getElementById('stopNotesInput');
  if (notes) notes.value = '';
  _pickedReason = 'Pindah rumah';
  renderChips(_reasons);
  document.getElementById('stopModal').classList.add('active');
  const pre = new URLSearchParams(location.search).get('mark');
  if (pre) prefetchCustomer(pre);
};

window.closeStopModal = function() {
  document.getElementById('stopModal').classList.remove('active');
};

async function prefetchCustomer(id) {
  const d = await App.api('/customers/' + id);
  if (!d || !d.success || !d.data) return;
  pickCustomer(d.data);
}

function statusBadge(c) {
  if (c.status === 'isolated') return '<span class="st-badge isolir">Isolir</span>';
  if (c.status === 'suspended') return '<span class="st-badge suspend">Suspend</span>';
  return '';
}

function pickCustomer(c) {
  document.getElementById('stopCustId').value = c.id;
  document.getElementById('stopCustSearch').value = (c.customer_id || '') + ' — ' + (c.name || '');
  const unpaid = (c.invoices || []).find(i => ['unpaid','overdue'].includes(i.status));
  const hint = unpaid
    ? ' · Tanggungan ' + fmtRp(unpaid.total || unpaid.amount)
    : (c.latest_invoice_status === 'overdue' || c.latest_invoice_status === 'unpaid' ? ' · Ada tagihan belum lunas' : '');
  document.getElementById('stopCustPick').innerHTML = '<b>'+esc(c.name)+'</b> · '+esc(c.customer_id)+statusBadge(c)+hint;
  document.getElementById('stopCustList').innerHTML = '';
}

async function searchStopCandidates() {
  const q = document.getElementById('stopCustSearch').value.trim();
  const box = document.getElementById('stopCustList');
  if (q.length < 2) { box.innerHTML = ''; return; }
  const d = await App.api('/customers?for_stop=1&limit=8&search=' + encodeURIComponent(q));
  const rows = (d && d.data) || [];
  if (!rows.length) { box.innerHTML = '<div style="font-size:12px;color:#94a3b8">Tidak ketemu. Coba CID atau nama lengkap — isolir juga muncul di sini.</div>'; return; }
  box.innerHTML = rows.map(c => {
    const unpaid = (c.invoices || []).find(i => ['unpaid','overdue'].includes(i.status));
    const extra = unpaid ? ' · ' + fmtRp(unpaid.total || unpaid.amount) : '';
    return '<button type="button" class="btn-fin btn-ghost" style="width:100%;justify-content:flex-start;margin-bottom:4px" data-id="'+c.id+'">'
      + '<span class="cid-badge">'+esc(c.customer_id)+'</span> '+esc(c.name)+statusBadge(c)+extra
      + '</button>';
  }).join('');
  box.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const hit = rows.find(r => String(r.id) === btn.dataset.id);
      if (hit) pickCustomer(hit);
    });
  });
}

window.saveStop = async function() {
  const id = document.getElementById('stopCustId').value;
  if (!id) { App.showToast('Pilih pelanggan dulu', 'warning'); return; }
  let reason = _pickedReason;
  const extra = (document.getElementById('stopReasonOther').value || '').trim();
  if (reason === 'Lainnya' && extra) reason = extra;
  else if (extra && reason !== 'Lainnya') reason = reason + ' — ' + extra;
  const notes = (document.getElementById('stopNotesInput')?.value || '').trim();
  const btn = document.getElementById('stopSaveBtn');
  btn.disabled = true;
  const d = await App.api('/customers/' + id + '/stop', {
    method: 'POST',
    body: JSON.stringify({
      stopped_at: document.getElementById('stopDate').value,
      stop_reason: reason,
      stop_notes: notes,
    }),
  });
  btn.disabled = false;
  if (!d || !d.success) {
    App.showToast((d && d.message) || 'Gagal menyimpan', 'error');
    return;
  }
  App.showToast('Pelanggan dicatat berhenti', 'success');
  closeStopModal();
  _page = 1;
  loadStats();
  loadList();
};

window.reactivate = async function(id, name) {
  if (!confirm('Aktifkan kembali ' + name + '?\nStatus kembali ke Aktif dan keluar dari daftar berhenti.')) return;
  const d = await App.api('/customers/' + id + '/reactivate', { method: 'POST', body: '{}' });
  if (!d || !d.success) {
    App.showToast((d && d.message) || 'Gagal mengaktifkan', 'error');
    return;
  }
  App.showToast('Pelanggan diaktifkan kembali', 'success');
  loadStats();
  loadList();
};

window.openStopDrawer = async function(id) {
  _drawerId = id;
  let row = _rows.find(r => String(r.id) === String(id));
  if (!row) {
    const d = await App.api('/customers/' + id);
    row = (d && d.data) || null;
  }
  if (!row) { App.showToast('Data tidak ditemukan', 'error'); return; }
  document.getElementById('drName').textContent = row.name || '—';
  document.getElementById('drMeta').textContent = [row.customer_id, row.phone, row.stop_reason].filter(Boolean).join(' · ');
  document.getElementById('drSettle').innerHTML = settleHtml(row);
  const open = row.open_invoices || (row.invoices || []).filter(i => ['unpaid','overdue'].includes(i.status));
  const box = document.getElementById('drInvoices');
  if (!open.length) {
    box.innerHTML = '<div style="font-size:13px;color:#047857">Tidak ada invoice tertinggal.</div>';
  } else {
    box.innerHTML = '<table class="inv-mini"><thead><tr><th>Invoice</th><th>Jatuh tempo</th><th>Status</th><th>Nominal</th></tr></thead><tbody>'
      + open.map(i => '<tr><td>'+esc(i.invoice_number || ('#'+i.id))+'</td><td>'+fmtDate(i.due_date)+'</td><td>'+esc(i.status)+'</td><td>'+fmtRp(i.total || i.amount)+'</td></tr>').join('')
      + '</tbody></table>';
  }
  document.getElementById('drNotes').value = row.stop_notes || '';
  document.getElementById('drawerOv').classList.add('active');
  const dr = document.getElementById('stopDrawer');
  dr.classList.add('open');
  dr.setAttribute('aria-hidden', 'false');
};

window.closeStopDrawer = function() {
  _drawerId = null;
  document.getElementById('drawerOv').classList.remove('active');
  const dr = document.getElementById('stopDrawer');
  dr.classList.remove('open');
  dr.setAttribute('aria-hidden', 'true');
};

window.saveDrawerNotes = async function() {
  if (!_drawerId) return;
  const btn = document.getElementById('drSaveBtn');
  btn.disabled = true;
  const d = await App.api('/customers/' + _drawerId + '/stop-notes', {
    method: 'PUT',
    body: JSON.stringify({ stop_notes: document.getElementById('drNotes').value }),
  });
  btn.disabled = false;
  if (!d || !d.success) {
    App.showToast((d && d.message) || 'Gagal menyimpan catatan', 'error');
    return;
  }
  App.showToast('Catatan disimpan', 'success');
  closeStopDrawer();
  loadList();
};

document.addEventListener('DOMContentLoaded', () => {
  fillReasonSelect(_reasons);
  renderChips(_reasons);
  syncSettleChips();
  loadStats();
  loadList();
  const s = document.getElementById('stopSearch');
  const r = document.getElementById('stopReason');
  const m = document.getElementById('stopMonth');
  if (s) s.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => { _page = 1; loadList(); }, 350);
  });
  if (r) r.addEventListener('change', () => { _page = 1; loadList(); });
  if (m) m.addEventListener('change', () => { _page = 1; loadList(); });
  document.querySelectorAll('#settleChips .st-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      _settlement = btn.dataset.s || '';
      syncSettleChips();
      _page = 1;
      loadList();
    });
  });
  const cs = document.getElementById('stopCustSearch');
  if (cs) cs.addEventListener('input', () => {
    clearTimeout(_pickerTimer);
    _pickerTimer = setTimeout(searchStopCandidates, 300);
  });
  const mark = new URLSearchParams(location.search).get('mark');
  if (mark) openStopModal();
});
