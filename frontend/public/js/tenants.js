function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

async function loadTenants(){
  const tb=document.getElementById('tenantTable');
  const d=await App.api('/tenants');
  if(!d?.success){tb.innerHTML=`<tr><td colspan="6" style="text-align:center;color:#dc2626;padding:24px;">${esc(d?.message||'Gagal')}</td></tr>`;return;}
  if(!d.data.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">Belum ada tenant</td></tr>';return;}
  tb.innerHTML=d.data.map(t=>`<tr>
    <td><b>${esc(t.name)}</b><div style="font-size:11px;color:#94a3b8;">${esc(t.company_name||'')}</div></td>
    <td class="mono">${esc(t.slug)}</td>
    <td>${t.status==='active'?'<span style="color:#16a34a;">Aktif</span>':'<span style="color:#dc2626;">Suspended</span>'}</td>
    <td>${t.customer_count||0}</td>
    <td>${t.owner?esc(t.owner.email):'—'}</td>
    <td><button class="btn btn-sm btn-secondary" onclick="openOwner(${t.id},'${esc(t.name)}')">Owner</button></td>
  </tr>`).join('');
}
window.openTenantModal=()=>{document.getElementById('tenantModal').style.display='flex';};
window.openOwner=(id,name)=>{
  document.getElementById('ownerTenantId').value=id;
  document.getElementById('ownerTitle').textContent='Owner untuk '+name;
  document.getElementById('ownerModal').style.display='flex';
};
window.saveTenant=async()=>{
  const name=document.getElementById('tName').value.trim();
  if(!name) return App.showToast('Nama wajib','error');
  const r=await App.api('/tenants',{method:'POST',body:JSON.stringify({name,company_name:document.getElementById('tCompany').value.trim()})});
  if(!r?.success) return App.showToast(r?.message||'Gagal','error');
  document.getElementById('tenantModal').style.display='none';
  App.showToast('Tenant dibuat','success');
  loadTenants();
};
window.saveOwner=async()=>{
  const id=document.getElementById('ownerTenantId').value;
  const r=await App.api('/tenants/'+id+'/owner',{method:'POST',body:JSON.stringify({
    name:document.getElementById('oName').value.trim(),
    email:document.getElementById('oEmail').value.trim(),
    password:document.getElementById('oPass').value
  })});
  if(!r?.success) return App.showToast(r?.message||'Gagal','error');
  document.getElementById('ownerModal').style.display='none';
  App.showToast('Owner dibuat. Mereka login ke /tenant','success');
  loadTenants();
};
document.addEventListener('DOMContentLoaded', loadTenants);
