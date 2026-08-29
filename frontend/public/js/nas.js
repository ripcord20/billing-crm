function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

let __wgLastConfig = null; // {nas, client_config, filename}

function modeBadge(n){
  if(n.conn_mode==='vpn'){
    const ok = n.wg_configured;
    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${ok?'#dcfce7':'#fef9c3'};color:${ok?'#166534':'#854d0e'};">VPN${ok?' ✓':' (belum gen)'}</span>`;
  }
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:#e2e8f0;color:#475569;">Public IP</span>`;
}

async function loadNas(){
  const tb=document.getElementById('nasTable');
  const d=await App.api('/nas');
  if(!d?.success){tb.innerHTML=`<tr><td colspan="6" style="text-align:center;color:#dc2626;padding:24px;">${esc(d?.message)}</td></tr>`;return;}
  if(!d.data.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">Belum ada NAS. Tambah router yang auth ke FreeRADIUS.</td></tr>';return;}
  tb.innerHTML=d.data.map(n=>`<tr>
    <td class="mono">${esc(n.nasname)}${n.tunnel_address?`<br><span style="font-size:11px;color:#64748b;">tunnel: ${esc(n.tunnel_address)}</span>`:''}</td>
    <td>${esc(n.shortname||'—')}</td>
    <td>${esc(n.type)}</td>
    <td>${modeBadge(n)}</td>
    <td>${n.last_error?`<span style="color:#dc2626;">${esc(n.last_error)}</span>`:(n.last_sync_at?esc(n.last_sync_at):'belum')}</td>
    <td style="white-space:nowrap;">
      ${n.conn_mode==='vpn'?`<button class="btn btn-sm btn-primary" onclick="wgGen(${n.id},'${esc(n.shortname||n.nasname)}')" title="Generate/regenerate config WireGuard">WG</button>`:''}
      <button class="btn btn-sm btn-secondary" onclick="syncNas(${n.id})">Sync</button>
      <button class="btn btn-sm btn-danger" onclick="delNas(${n.id})">Hapus</button>
    </td>
  </tr>`).join('');
}

window.onConnModeChange=()=>{
  const vpn=document.getElementById('nasConnMode').value==='vpn';
  document.getElementById('nasVpnHint').style.display=vpn?'block':'none';
};

window.openNas=()=>{
  document.getElementById('nasId').value='';
  document.getElementById('nasTitle').textContent='NAS baru';
  document.getElementById('nasIp').value='';
  document.getElementById('nasShort').value='';
  document.getElementById('nasSecret').value='';
  document.getElementById('nasType').value='mikrotik';
  document.getElementById('nasConnMode').value='public';
  onConnModeChange();
  document.getElementById('nasModal').style.display='flex';
};
window.saveNas=async()=>{
  const body={
    nasname:document.getElementById('nasIp').value.trim(),
    shortname:document.getElementById('nasShort').value.trim(),
    secret:document.getElementById('nasSecret').value,
    type:document.getElementById('nasType').value.trim()||'mikrotik',
    conn_mode:document.getElementById('nasConnMode').value
  };
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

// ── WireGuard server settings ───────────────────────────────────────────────
window.openWgServer=async()=>{
  const d=await App.api('/nas/wireguard/server');
  if(d?.success){
    const c=d.data;
    document.getElementById('wgEnabled').value=c.enabled?'true':'false';
    document.getElementById('wgEndpointHost').value=c.endpointHost||'';
    document.getElementById('wgListenPort').value=c.listenPort||51820;
    document.getElementById('wgIface').value=c.iface||'wg0';
    document.getElementById('wgSubnet').value=c.tunnelSubnet||'10.10.0.0/24';
    document.getElementById('wgServerAddr').value=c.serverAddress||'10.10.0.1';
    document.getElementById('wgServerPub').value=c.serverPublicKey||'';
  }
  document.getElementById('wgServerModal').style.display='flex';
};
window.saveWgServer=async()=>{
  const body={
    enabled:document.getElementById('wgEnabled').value==='true',
    endpointHost:document.getElementById('wgEndpointHost').value.trim(),
    listenPort:document.getElementById('wgListenPort').value.trim(),
    iface:document.getElementById('wgIface').value.trim(),
    tunnelSubnet:document.getElementById('wgSubnet').value.trim(),
    serverAddress:document.getElementById('wgServerAddr').value.trim()
  };
  const r=await App.api('/nas/wireguard/server',{method:'PUT',body:JSON.stringify(body)});
  if(!r?.success) return App.showToast(r?.message||'Gagal simpan','error');
  App.showToast('Pengaturan WireGuard tersimpan','success');
  document.getElementById('wgServerModal').style.display='none';
};
window.wgInitKeys=async()=>{
  const r=await App.api('/nas/wireguard/server/init-keys',{method:'POST',body:JSON.stringify({})});
  if(!r?.success) return App.showToast(r?.message||'Gagal','error');
  document.getElementById('wgServerPub').value=r.data.serverPublicKey||'';
  App.showToast(r.created?'Keypair server dibuat':'Keypair server sudah ada','success');
};

// ── Generate peer/config untuk satu NAS ─────────────────────────────────────
window.wgGen=async(id,label)=>{
  const r=await App.api('/nas/'+id+'/wireguard/generate',{method:'POST',body:JSON.stringify({})});
  if(!r?.success) return App.showToast(r?.message||'Gagal generate','error');
  const d=r.data;
  __wgLastConfig={label,client_config:d.client_config,filename:'wg-'+(label||id)+'.conf'};
  document.getElementById('wgCfgNas').textContent=label||('#'+id);
  document.getElementById('wgCfgAddr').textContent=d.tunnel_address;
  document.getElementById('wgCfgClient').textContent=d.client_config;
  document.getElementById('wgCfgMikrotik').textContent=d.mikrotik_commands;
  document.getElementById('wgCfgPeer').textContent=d.server_peer_block;
  const note=document.getElementById('wgApplyNote');
  if(d.applied&&d.applied.attempted){
    note.textContent=d.applied.ok?'✓ Peer otomatis terpasang ke interface WireGuard server ini.':'Peer belum terpasang otomatis: '+(d.applied.message||'')+' — tempel blok [Peer] di server secara manual.';
  }else{
    note.textContent='Server ini tidak menjalankan daemon WireGuard (wg) — tempel blok [Peer] di server WireGuard Anda secara manual.';
  }
  document.getElementById('wgConfigModal').style.display='flex';
  loadNas();
};
window.wgCopy=(elId)=>{
  const t=document.getElementById(elId).textContent;
  navigator.clipboard?.writeText(t).then(()=>App.showToast('Disalin','success'),()=>App.showToast('Gagal menyalin','error'));
};
window.wgDownload=()=>{
  if(!__wgLastConfig) return;
  const blob=new Blob([__wgLastConfig.client_config],{type:'text/plain'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=__wgLastConfig.filename;
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(a.href);
};

document.addEventListener('DOMContentLoaded', loadNas);
