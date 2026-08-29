function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

async function loadNas(){
  const tb=document.getElementById('nasTable');
  const d=await App.api('/nas');
  if(!d?.success){tb.innerHTML=`<tr><td colspan="5" style="text-align:center;color:#dc2626;padding:24px;">${esc(d?.message)}</td></tr>`;return;}
  if(!d.data.length){tb.innerHTML='<tr><td colspan="5" style="text-align:center;padding:24px;color:#94a3b8;">Belum ada NAS. Tambah router yang auth ke FreeRADIUS 192.168.22.9</td></tr>';return;}
  tb.innerHTML=d.data.map(n=>`<tr>
    <td class="mono">${esc(n.nasname)}</td>
    <td>${esc(n.shortname||'—')}</td>
    <td>${esc(n.type)}</td>
    <td>${n.last_error?`<span style="color:#dc2626;">${esc(n.last_error)}</span>`:(n.last_sync_at?esc(n.last_sync_at):'belum')}</td>
    <td>
      <button class="btn btn-sm btn-secondary" onclick="syncNas(${n.id})">Sync</button>
      <button class="btn btn-sm btn-danger" onclick="delNas(${n.id})">Hapus</button>
    </td>
  </tr>`).join('');
}
window.openNas=()=>{
  document.getElementById('nasId').value='';
  document.getElementById('nasTitle').textContent='NAS baru';
  document.getElementById('nasIp').value='';
  document.getElementById('nasShort').value='';
  document.getElementById('nasSecret').value='';
  document.getElementById('nasModal').style.display='flex';
};
window.saveNas=async()=>{
  const body={nasname:document.getElementById('nasIp').value.trim(),shortname:document.getElementById('nasShort').value.trim(),secret:document.getElementById('nasSecret').value,type:document.getElementById('nasType').value.trim()||'mikrotik'};
  const id=document.getElementById('nasId').value;
  const r=await App.api(id?'/nas/'+id:'/nas',{method:id?'PUT':'POST',body:JSON.stringify(body)});
  if(!r?.success) return App.showToast(r?.message||'Gagal','error');
  document.getElementById('nasModal').style.display='none';
  App.showToast(r.radius_sync?.success?'Tersimpan & ter-sync ke FreeRADIUS':'Tersimpan di billing: '+(r.radius_sync?.message||''), r.radius_sync?.success?'success':'error');
  loadNas();
};
window.syncNas=async(id)=>{
  const r=await App.api('/nas/'+id+'/sync',{method:'POST'});
  App.showToast(r?.message|| (r?.success?'OK':'Gagal'), r?.success?'success':'error');
  loadNas();
};
window.delNas=async(id)=>{
  if(!confirm('Hapus NAS dari billing dan coba hapus dari FreeRADIUS?')) return;
  const r=await App.api('/nas/'+id,{method:'DELETE'});
  App.showToast(r?.message|| (r?.success?'Dihapus':'Gagal'), r?.success?'success':'error');
  loadNas();
};
window.importNas=async()=>{
  const r=await App.api('/nas/import',{method:'POST',body:JSON.stringify({})});
  if(!r?.success) return App.showToast(r?.message||'Gagal import','error');
  App.showToast('Import: +'+r.data.created+' (skip '+r.data.skipped+')','success');
  loadNas();
};
document.addEventListener('DOMContentLoaded', loadNas);
