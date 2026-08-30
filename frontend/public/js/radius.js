function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

async function loadServers(){
  const d=await App.api('/radius/servers');
  const tb=document.getElementById('srvTable');
  if(!d?.success){tb.innerHTML=`<tr><td colspan="5" style="color:#dc2626;">${esc(d?.message)}</td></tr>`;return;}
  if(!d.data.length){tb.innerHTML='<tr><td colspan="5" style="color:#94a3b8;padding:16px;">Belum ada server. Klik Pakai MySQL lokal atau + Server.</td></tr>';return;}
  window.__radiusServers=d.data;
  tb.innerHTML=d.data.map(s=>`<tr>
    <td>${esc(s.name)}</td>
    <td class="mono">${esc(s.host)}:${s.auth_port||1812}</td>
    <td class="mono">${esc(s.mysql_user)}@${esc(s.mysql_host)}/${esc(s.mysql_database)}</td>
    <td>${s.last_error?`<span style="color:#dc2626;">${esc(s.last_error)}</span>`:(s.last_ok_at?'OK '+esc(s.last_ok_at):'belum dites')}</td>
    <td style="white-space:nowrap;">
      <button class="btn btn-sm btn-secondary" onclick="editSrv(${s.id})">Edit</button>
      <button class="btn btn-sm btn-secondary" onclick="testSrv(${s.id})">Tes MySQL</button>
    </td>
  </tr>`).join('');
}
let editingSrvId=null;
window.openSrv=()=>{
  editingSrvId=null;
  document.getElementById('sName').value='daloRADIUS';
  document.getElementById('sHost').value='192.168.22.9';
  document.getElementById('sMysql').value='127.0.0.1';
  document.getElementById('sDb').value='radius';
  document.getElementById('sUser').value='radius';
  document.getElementById('sPass').value='';
  document.getElementById('srvModal').style.display='flex';
};
window.editSrv=(id)=>{
  const row=(window.__radiusServers||[]).find(s=>s.id===id);
  if(!row) return;
  editingSrvId=id;
  document.getElementById('sName').value=row.name||'';
  document.getElementById('sHost').value=row.host||'';
  document.getElementById('sMysql').value=row.mysql_host||'127.0.0.1';
  document.getElementById('sDb').value=row.mysql_database||'radius';
  document.getElementById('sUser').value=row.mysql_user||'radius';
  document.getElementById('sPass').value='';
  document.getElementById('srvModal').style.display='flex';
};
window.saveSrv=async()=>{
  const body={
    name:document.getElementById('sName').value.trim(),
    host:document.getElementById('sHost').value.trim(),
    mysql_host:document.getElementById('sMysql').value.trim(),
    mysql_database:document.getElementById('sDb').value.trim(),
    mysql_user:document.getElementById('sUser').value.trim(),
    mysql_password:document.getElementById('sPass').value
  };
  const r=editingSrvId
    ? await App.api('/radius/servers/'+editingSrvId,{method:'PUT',body:JSON.stringify(body)})
    : await App.api('/radius/servers',{method:'POST',body:JSON.stringify(body)});
  if(!r?.success) return App.showToast(r?.message||'Gagal','error');
  document.getElementById('srvModal').style.display='none';
  App.showToast('Server disimpan','success');
  loadServers();
};
window.ensureLocal=async()=>{
  const r=await App.api('/radius/ensure-local',{method:'POST',body:JSON.stringify({})});
  App.showToast(r?.message||(r?.success?'OK':'Gagal'), r?.success?'success':'error');
  if(r?.success){ loadServers(); loadSessions(); loadUsers(); }
};
window.testSrv=async(id)=>{
  const r=await App.api('/radius/servers/'+id+'/test',{method:'POST'});
  App.showToast(r?.message|| (r?.success?'OK':'Gagal'), r?.success?'success':'error');
  loadServers();
  if(r?.success){ loadSessions(); loadUsers(); }
};
window.loadSessions=async()=>{
  const d=await App.api('/radius/sessions');
  const tb=document.getElementById('sessTable');
  if(!d?.success){tb.innerHTML=`<tr><td colspan="4" style="color:#dc2626;">${esc(d?.message)}</td></tr>`;return;}
  if(!d.data.length){tb.innerHTML='<tr><td colspan="4" style="padding:16px;color:#94a3b8;">Tidak ada sesi online</td></tr>';return;}
  tb.innerHTML=d.data.map(s=>`<tr>
    <td class="mono">${esc(s.username)}</td>
    <td>${esc(s.nasipaddress)}</td>
    <td>${esc(s.framedipaddress)}</td>
    <td>${esc(s.acctstarttime)}</td>
  </tr>`).join('');
};
window.loadUsers=async()=>{
  const d=await App.api('/radius/users');
  const tb=document.getElementById('userTable');
  if(!d?.success){tb.innerHTML=`<tr><td colspan="3" style="color:#dc2626;">${esc(d?.message)}</td></tr>`;return;}
  const rows=d.data.remote||[];
  if(!rows.length){tb.innerHTML='<tr><td colspan="3" style="padding:16px;color:#94a3b8;">Tidak ada user di radcheck</td></tr>';return;}
  tb.innerHTML=rows.map(u=>`<tr>
    <td class="mono">${esc(u.username)}</td>
    <td>${u.has_password?'ada':'—'}</td>
    <td>${esc(u.auth_type||'Accept')}</td>
  </tr>`).join('');
};
document.addEventListener('DOMContentLoaded', ()=>{loadServers();});
