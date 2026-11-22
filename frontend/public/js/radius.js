function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

window.__sqlGuide=null;
window.__sqlPassVisible=false;

function maskGuide(g){
  if(!g) return g;
  const hidden=Object.assign({},g);
  const stars='********';
  hidden.mysql_password=stars;
  hidden.sql_snippet=(g.sql_snippet||'').replace(/password\s*=\s*"[^"]*"/,'password = "'+stars+'"');
  hidden.daloradius_php=(g.daloradius_php||'').replace(/CONFIG_DB_PASS'\] = '[^']*'/,"CONFIG_DB_PASS'] = '"+stars+"'");
  return hidden;
}
function shownGuide(){
  const g=window.__sqlGuide;
  if(!g) return null;
  return window.__sqlPassVisible?g:maskGuide(g);
}
function renderSqlGuide(){
  const g=shownGuide();
  const raw=window.__sqlGuide;
  if(!g||!raw) return;
  const daemon=document.getElementById('gDaemon');
  const test=document.getElementById('gMysqlTest');
  if(daemon) daemon.textContent=raw.daemon_host||'192.168.22.9';
  if(test) test.textContent=raw.mysql_test||'';
  const set=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=v||'';};
  set('gSql', g.sql_snippet);
  set('gEnable', (raw.mysql_test||'')+'\n\n'+(raw.enable_cmds||''));
  set('gPhp', g.daloradius_php);
  set('gMk', raw.mikrotik);
  const notes=document.getElementById('gNotes');
  if(notes) notes.textContent=(raw.notes||[]).join(' ');
}
async function loadSqlGuide(){
  const d=await App.api('/radius/sql-guide');
  if(!d?.success){
    const el=document.getElementById('gSql');
    if(el) el.textContent=d?.message||'Gagal memuat panduan';
    return;
  }
  window.__sqlGuide=d.data;
  renderSqlGuide();
}
window.toggleSqlPass=()=>{
  window.__sqlPassVisible=!window.__sqlPassVisible;
  renderSqlGuide();
};
function copyText(t){
  const text=String(t||'');
  if(navigator.clipboard&&navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text).then(()=>App.showToast('Disalin','success'),()=>App.showToast('Gagal menyalin','error'));
  }
  const ta=document.createElement('textarea');
  ta.value=text; document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); App.showToast('Disalin','success'); }
  catch(_){ App.showToast('Gagal menyalin','error'); }
  document.body.removeChild(ta);
}
window.copySqlSnippet=()=>{
  const g=window.__sqlGuide;
  if(!g) return App.showToast('Panduan belum dimuat','error');
  copyText(g.sql_snippet);
};
window.copyGuideField=(id)=>{
  const el=document.getElementById(id);
  if(!el) return;
  if(id==='gSql') return copySqlSnippet();
  if(id==='gPhp' && window.__sqlGuide) return copyText(window.__sqlGuide.daloradius_php);
  copyText(el.textContent);
};

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
document.addEventListener('DOMContentLoaded', ()=>{loadServers(); loadSqlGuide();});
