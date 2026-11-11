function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

async function loadServers(){
  const d=await App.api('/radius/servers');
  const tb=document.getElementById('srvTable');
  if(!d?.success){tb.innerHTML=`<tr><td colspan="5" style="color:#dc2626;">${esc(d?.message)}</td></tr>`;return;}
  if(!d.data.length){tb.innerHTML='<tr><td colspan="5" style="color:#94a3b8;padding:16px;">Belum ada server. Tambah 192.168.22.9 dan isi password MySQL radius.</td></tr>';return;}
  tb.innerHTML=d.data.map(s=>`<tr>
    <td>${esc(s.name)}</td>
    <td class="mono">${esc(s.host)}:${s.auth_port||1812}</td>
    <td class="mono">${esc(s.mysql_user)}@${esc(s.mysql_host)}/${esc(s.mysql_database)}</td>
    <td>${s.last_error?`<span style="color:#dc2626;">${esc(s.last_error)}</span>`:(s.last_ok_at?'OK '+esc(s.last_ok_at):'belum dites')}</td>
    <td>
      <button class="btn btn-sm btn-secondary" onclick="testSrv(${s.id})">Tes MySQL</button>
    </td>
  </tr>`).join('');
}
window.openSrv=()=>{document.getElementById('srvModal').style.display='flex';};
window.saveSrv=async()=>{
  const r=await App.api('/radius/servers',{method:'POST',body:JSON.stringify({
    name:document.getElementById('sName').value.trim(),
    host:document.getElementById('sHost').value.trim(),
    mysql_host:document.getElementById('sMysql').value.trim(),
    mysql_database:document.getElementById('sDb').value.trim(),
    mysql_user:document.getElementById('sUser').value.trim(),
    mysql_password:document.getElementById('sPass').value
  })});
  if(!r?.success) return App.showToast(r?.message||'Gagal','error');
  document.getElementById('srvModal').style.display='none';
  App.showToast('Server disimpan','success');
  loadServers();
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
