function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

let __wgLastConfig = null; // {nas, client_config, filename}
let __nasRows = [];
let __previewTimer = null;

function fmtSyncAt(s){
  if(!s) return 'belum';
  const d=new Date(s);
  if(Number.isNaN(d.getTime())) return esc(s);
  const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function modeBadge(n){
  const link = n.link || {};
  const state = link.state === 'up' || link.state === 'pending' || link.state === 'down' ? link.state : 'down';
  const kind = n.conn_mode === 'vpn'
    ? `Tunnel · ${String(n.vpn_type || 'wireguard').toUpperCase()}`
    : 'LAN / langsung';
  const label = link.label || (state === 'up' ? 'Terhubung' : 'Belum terhubung');
  const age = link.age_label
    ? `<span class="nas-link-age">${esc(link.age_label)}</span>`
    : '';
  return `<div class="nas-mode">
    <div class="nas-mode-kind">${esc(kind)}</div>
    <span class="nas-link ${state}" title="${esc(label)}">
      <span class="nas-led"></span>
      <span class="nas-link-copy">
        <span class="nas-link-text">${esc(label)}</span>
        ${age}
      </span>
    </span>
  </div>`;
}

async function loadNas(){
  const tb=document.getElementById('nasTable');
  const d=await App.api('/nas');
  if(!d?.success){
    const msg=d?.message==='Route not found'
      ? 'API Modul NAS belum aktif di server. Refresh setelah diperbaiki.'
      : (d?.message||'Gagal memuat NAS');
    tb.innerHTML=`<tr><td colspan="6" style="text-align:center;color:#dc2626;padding:24px;">${esc(msg)}</td></tr>`;
    return;
  }
  if(!d.data.length){
    __nasRows=[];
    tb.innerHTML='<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">Belum ada NAS. Tambah router yang auth ke FreeRADIUS.</td></tr>';
    return;
  }
  __nasRows=d.data;
  tb.innerHTML=d.data.map(n=>`<tr>
    <td class="mono">${esc(n.nasname)}${n.tunnel_address?`<br><span style="font-size:11px;color:#64748b;">tunnel: ${esc(n.tunnel_address)}</span>`:''}${n.device?`<br><span style="font-size:11px;color:#166534;">Device: ${esc(n.device.name)}</span>`:''}</td>
    <td>${esc(n.shortname||'—')}</td>
    <td>${esc(n.type)}</td>
    <td>${modeBadge(n)}</td>
    <td>${n.last_error?`<span style="color:#dc2626;">${esc(n.last_error)}</span>`:fmtSyncAt(n.last_sync_at)}</td>
    <td class="nas-aksi" style="white-space:nowrap;">
      <button class="btn btn-sm btn-primary" onclick="openNasDetail(${n.id})" title="Detail NAS + script RouterOS">Detail</button>
      ${n.conn_mode==='vpn'?`<button class="btn btn-sm btn-secondary" onclick="wgGen(${n.id},'${esc(n.shortname||n.nasname)}')" title="Generate/regenerate config VPN saja">VPN</button>`:''}
      <button class="btn btn-sm btn-secondary" onclick="syncNas(${n.id})">Sync</button>
      <button class="btn btn-sm btn-danger" onclick="delNas(${n.id})">Hapus</button>
    </td>
  </tr>`).join('');
}

window.onConnModeChange=()=>{
  const vpn=document.getElementById('nasConnMode').value==='vpn';
  const lanHint=document.getElementById('nasLanHint');
  if(lanHint) lanHint.style.display=vpn?'none':'block';
  const hint=document.getElementById('nasVpnHint');
  const wrap=document.getElementById('nasVpnTypeWrap');
  if(hint) hint.style.display=vpn?'block':'none';
  if(wrap) wrap.style.display=vpn?'block':'none';
};

function showNasDetail(show){
  const list=document.getElementById('nasListView');
  const det=document.getElementById('nasDetailView');
  if(list) list.style.display=show?'none':'block';
  if(det) det.style.display=show?'block':'none';
}

window.closeNasDetail=()=>{
  showNasDetail(false);
};

function nasFormBody(){
  const secret=document.getElementById('nasSecret').value;
  const body={
    nasname:document.getElementById('nasIp').value.trim(),
    shortname:document.getElementById('nasShort').value.trim(),
    type:document.getElementById('nasType').value.trim()||'mikrotik',
    conn_mode:document.getElementById('nasConnMode').value,
    vpn_type:document.getElementById('nasVpnType').value,
    ppp_pool_ranges:document.getElementById('nasPppPool').value.trim(),
    ppp_local_address:document.getElementById('nasPppLocal').value.trim()
  };
  if(secret && secret!=='********') body.secret=secret;
  return body;
}

window.openNas=()=>{
  document.getElementById('nasId').value='';
  document.getElementById('nasTitle').textContent='NAS baru';
  document.getElementById('nasIp').value='';
  document.getElementById('nasShort').value='';
  document.getElementById('nasSecret').value='';
  document.getElementById('nasType').value='mikrotik';
  document.getElementById('nasConnMode').value='public';
  document.getElementById('nasVpnType').value='wireguard';
  document.getElementById('nasPppPool').value='10.20.0.2-10.20.0.254';
  document.getElementById('nasPppLocal').value='10.20.0.1';
  onConnModeChange();
  showNasDetail(true);
  const pre=document.getElementById('rosScript');
  if(pre) pre.textContent='Isi IP NAS dan secret, lalu script muncul di sini.';
  document.getElementById('rosNotes').textContent='Pilih versi RouterOS, lalu salin dan tempel di New Terminal MikroTik.';
  window.scrollTo({top:0,behavior:'smooth'});
};

window.openNasDetail=async(id)=>{
  let n=(__nasRows||[]).find(x=>String(x.id)===String(id));
  if(!n){
    await loadNas();
    n=(__nasRows||[]).find(x=>String(x.id)===String(id));
  }
  if(!n) return App.showToast('NAS tidak ditemukan','error');
  document.getElementById('nasId').value=String(n.id);
  document.getElementById('nasTitle').textContent='Detail NAS';
  document.getElementById('nasIp').value=n.nasname||'';
  document.getElementById('nasShort').value=n.shortname||'';
  document.getElementById('nasSecret').value='';
  document.getElementById('nasSecret').placeholder='kosongkan jika tidak diubah';
  document.getElementById('nasType').value=n.type||'mikrotik';
  document.getElementById('nasConnMode').value=n.conn_mode==='vpn'?'vpn':'public';
  document.getElementById('nasVpnType').value=n.vpn_type||'wireguard';
  document.getElementById('nasPppPool').value=n.ppp_pool_ranges||'10.20.0.2-10.20.0.254';
  document.getElementById('nasPppLocal').value=n.ppp_local_address||'10.20.0.1';
  onConnModeChange();
  showNasDetail(true);
  window.scrollTo({top:0,behavior:'smooth'});
  await openRosScript(n.id, n.shortname||n.nasname);
};

window.saveNas=async()=>{
  const body=nasFormBody();
  const id=document.getElementById('nasId').value;
  if(!body.nasname) return App.showToast('IP NAS wajib','error');
  if(!id && !body.secret) return App.showToast('Secret wajib','error');
  const r=await App.api(id?'/nas/'+id:'/nas',{method:id?'PUT':'POST',body:JSON.stringify(body)});
  if(!r?.success) return App.showToast(r?.message||'Gagal','error');
  const linked=r.device_linked?' (sudah tertaut Device Management)':'';
  const reused=r.reused?'NAS sudah ada, data diperbarui':'Tersimpan';
  App.showToast(
    (r.radius_sync?.success?(reused+' & ter-sync ke FreeRADIUS'):(reused+' di billing: '+(r.radius_sync?.message||'')))+linked,
    r.radius_sync?.success?'success':'error'
  );
  const newId=(r.data&&r.data.id)||id;
  await loadNas();
  if(newId) await openNasDetail(newId);
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

// ── Generate credential/config VPN untuk satu NAS (dispatch per tipe) ─────────
window.wgGen=async(id,label)=>{
  const r=await App.api('/nas/'+id+'/vpn/generate',{method:'POST',body:JSON.stringify({})});
  if(!r?.success) return App.showToast(r?.message||'Gagal generate','error');
  const d=r.data;
  const type=(d.vpn_type||'wireguard');
  const ext=type==='wireguard'?'.conf':(type==='openvpn'?'.ovpn':'.txt');
  __wgLastConfig={label,client_config:d.client_config,filename:'vpn-'+type+'-'+(label||id)+ext};
  document.getElementById('wgCfgType').textContent=type;
  document.getElementById('wgCfgNas').textContent=label||('#'+id);
  document.getElementById('wgCfgAddr').textContent=d.tunnel_address||'—';
  document.getElementById('wgCfgClient').textContent=d.client_config||'';
  document.getElementById('wgCfgMikrotik').textContent=d.mikrotik_commands||'';
  showWgQr(d, type==='wireguard');

  // Kredensial (l2tp/openvpn)
  const credWrap=document.getElementById('wgCredWrap');
  if(d.username){
    credWrap.style.display='block';
    document.getElementById('wgCredUser').textContent=d.username;
    document.getElementById('wgCredPass').textContent=d.password||'';
    document.getElementById('wgCredPskWrap').style.display=d.psk?'block':'none';
    document.getElementById('wgCredPsk').textContent=d.psk||'';
  }else{
    credWrap.style.display='none';
  }

  // Blok server: WireGuard → [Peer]; lainnya → provisioning server
  const peerWrap=document.getElementById('wgPeerWrap');
  if(type==='wireguard'){
    document.getElementById('wgCfgClientLabel').textContent='Config Klien (wg-quick / router)';
    document.getElementById('wgCfgPeerLabel').textContent='Blok [Peer] untuk server';
    document.getElementById('wgCfgPeer').textContent=d.server_peer_block||'';
    peerWrap.style.display='block';
  }else{
    document.getElementById('wgCfgClientLabel').textContent=(type==='openvpn'?'Config Klien (.ovpn)':'Parameter Koneksi L2TP/IPsec');
    if(d.server_provisioning){
      document.getElementById('wgCfgPeerLabel').textContent='Provisioning di Server VPN';
      document.getElementById('wgCfgPeer').textContent=d.server_provisioning;
      peerWrap.style.display='block';
    }else{
      peerWrap.style.display='none';
    }
  }

  const note=document.getElementById('wgApplyNote');
  if(type==='wireguard'){
    if(d.applied&&d.applied.attempted){
      note.textContent=d.applied.ok?'✓ Peer otomatis terpasang ke interface WireGuard server ini.':'Peer belum terpasang otomatis: '+(d.applied.message||'')+' — tempel blok [Peer] di server secara manual.';
    }else{
      note.textContent='Server ini tidak menjalankan daemon WireGuard (wg) — tempel blok [Peer] di server WireGuard Anda secara manual.';
    }
  }else{
    note.textContent='Terapkan blok "Provisioning di Server VPN" pada server '+type.toUpperCase()+' Anda, lalu pasang config klien di MikroTik.';
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

function showWgQr(d, enabled){
  const wrap=document.getElementById('wgQrWrap');
  const img=document.getElementById('wgQrImg');
  const warn=document.getElementById('wgQrWarn');
  if(!wrap||!img) return;
  if(enabled && d && d.qr_data_url){
    wrap.style.display='block';
    img.src=d.qr_data_url;
    if(warn){
      if(d.endpoint_is_private){
        warn.style.display='block';
        warn.textContent='Endpoint masih IP LAN server Fiberix (bukan VPS). HP di data seluler tidak handshake. Untuk tes di kantor, sambungkan HP ke Wi-Fi LAN yang sama.';
      }else{
        warn.style.display='none';
        warn.textContent='';
      }
    }
  }else{
    wrap.style.display='none';
    img.removeAttribute('src');
    if(warn){ warn.style.display='none'; warn.textContent=''; }
  }
}

window.openPhoneQr=async()=>{
  const label=window.prompt('Nama peer HP (contoh: HP tes Sys)','HP tes')||'HP tes';
  const r=await App.api('/nas/wireguard/phone-qr',{method:'POST',body:JSON.stringify({label})});
  if(!r?.success) return App.showToast(r?.message||'Gagal buat QR HP','error');
  const d=r.data;
  __wgLastConfig={label:d.label,client_config:d.client_config,filename:d.filename||'fiberix-hp.conf'};
  document.getElementById('wgCfgType').textContent='HP';
  document.getElementById('wgCfgNas').textContent=d.label||'HP';
  document.getElementById('wgCfgAddr').textContent=d.tunnel_address||'—';
  document.getElementById('wgCfgClient').textContent=d.client_config||'';
  document.getElementById('wgCfgMikrotik').textContent='(QR ini untuk aplikasi WireGuard di HP, bukan script MikroTik.)';
  document.getElementById('wgCredWrap').style.display='none';
  document.getElementById('wgCfgClientLabel').textContent='Config HP (.conf)';
  document.getElementById('wgCfgPeerLabel').textContent='Blok [Peer] — tempel di concentrator Fiberix';
  document.getElementById('wgCfgPeer').textContent=d.server_peer_block||'';
  document.getElementById('wgPeerWrap').style.display='block';
  const note=document.getElementById('wgApplyNote');
  if(d.applied&&d.applied.attempted){
    note.textContent=d.applied.ok
      ? '✓ Peer HP sudah dipasang di interface WireGuard server ini. Scan QR di aplikasi WireGuard.'
      : 'Peer belum terpasang otomatis: '+(d.applied.message||'')+' — tempel blok [Peer] di concentrator, lalu scan QR.';
  }else{
    note.textContent='Tempel blok [Peer] di concentrator WireGuard Fiberix, lalu scan QR di HP. Concentrator sekarang bukan Ubuntu billing.';
  }
  showWgQr(d, true);
  document.getElementById('wgConfigModal').style.display='flex';
};

let __rosLast=null;
let __rosTab='v7';
window.openRosScript=async(id,label)=>{
  const r=await App.api('/nas/'+id+'/routeros-script',{method:'POST',body:JSON.stringify(nasFormBody())});
  if(!r?.success) return App.showToast(r?.message||'Gagal membuat script','error');
  applyRosData(r.data, label||('#'+id));
  if(r.data.generated) App.showToast('Peer WireGuard baru digenerate untuk script ini','success');
};

function applyRosData(data, label){
  __rosLast={id:document.getElementById('nasId').value,label,data};
  const apiHost=data.recommended_api_host||'—';
  const radius=' Radius: '+(data.radius_host||'192.168.22.9')+'.';
  const lanDirect=data.conn_mode!=='vpn';
  document.getElementById('rosHint').textContent=lanDirect
    ? 'API/sync: '+apiHost+':8728.'+radius+' Mode LAN: tempel script, tanpa VPS dan tanpa port-forward.'
    : (data.endpoint_is_lan
      ? 'API/sync: '+apiHost+':8728 (tunnel ke IP LAN Fiberix).'+radius+' Bukan VPS cloud. Port-forward tidak dipakai.'
      : 'API/sync: '+apiHost+':8728 (IP tunnel).'+radius+' Server tunnel = Fiberix, bukan VPS cloud.');
  const usage=(data.usage&&data.usage.length)?data.usage.join(' '):(data.notes||[]).join(' ');
  document.getElementById('rosNotes').textContent=usage;
  if(data.radius_host){
    const rh=document.getElementById('nasRadiusHost');
    if(rh) rh.value=data.radius_host;
  }
  const pf=data.port_forward_example||{};
  const pfBox=document.getElementById('rosPfBox');
  const showPf=!pf.skipped && Array.isArray(pf.rules) && pf.rules.length>0;
  if(pfBox) pfBox.style.display=showPf?'block':'none';
  document.getElementById('rosPfNote').textContent=pf.note||'';
  document.getElementById('rosPfTable').innerHTML=(pf.rules||[]).map(x=>`<tr><td>${esc(x.use)}</td><td class="mono">${esc(x.public)}</td><td class="mono">${esc(x.internal)}</td></tr>`).join('');
  document.getElementById('rosPfNft').textContent=pf.nft_example||'';
  showRosTab(__rosTab||'v7');
}

window.previewNasScript=()=>{
  clearTimeout(__previewTimer);
  __previewTimer=setTimeout(runNasPreview, 400);
};

async function runNasPreview(){
  const det=document.getElementById('nasDetailView');
  if(!det || det.style.display==='none') return;
  const id=document.getElementById('nasId').value;
  const secret=document.getElementById('nasSecret').value.trim();
  const nasname=document.getElementById('nasIp').value.trim();
  if(id && (!secret || secret==='********')){
    return openRosScript(id, document.getElementById('nasShort').value||nasname);
  }
  if(!nasname || !secret) return;
  const r=await App.api('/nas/routeros-preview',{method:'POST',body:JSON.stringify(nasFormBody())});
  if(!r?.success) return;
  applyRosData(r.data, document.getElementById('nasShort').value||nasname);
}

window.showRosTab=(tab)=>{
  __rosTab=tab;
  const d=__rosLast&&__rosLast.data;
  if(!d) return;
  document.getElementById('rosScript').textContent=tab==='v6'?d.v6:d.v7;
  const lab=document.getElementById('rosScriptLabel');
  if(lab) lab.textContent=tab==='v7'?'RouterOS v7 Script':'RouterOS v6 Script';
  document.getElementById('rosTabV7').className='btn btn-sm '+(tab==='v7'?'btn-primary':'btn-secondary');
  document.getElementById('rosTabV6').className='btn btn-sm '+(tab==='v6'?'btn-primary':'btn-secondary');
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
window.copyRos=()=>{
  const el=document.getElementById('rosScript');
  copyText(el&&el.textContent);
};
window.downloadRos=()=>{
  if(!__rosLast) return;
  const d=__rosLast.data;
  const body=__rosTab==='v6'?d.v6:d.v7;
  const blob=new Blob([body],{type:'text/plain'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='fiberix-'+(__rosLast.label||'nas')+'-'+__rosTab+'.rsc';
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(a.href);
};

document.addEventListener('DOMContentLoaded', () => {
  loadNas();
  setInterval(loadNas, 20000);
});
