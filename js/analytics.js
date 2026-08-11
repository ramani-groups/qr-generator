(() => {
  'use strict';
  const cfg=window.RAMANI_QR_CONFIG||{}, byId=id=>document.getElementById(id);
  const rows=byId('analyticsRows'), status=byId('analyticsStatus'), callout=byId('configCallout'), search=byId('qrSearch');
  let codes=[];
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>v?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';
  const token=()=>window.crypto?.getRandomValues?Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>b.toString(16).padStart(2,'0')).join(''):Math.random().toString(36).slice(2);

  const pending=new Map();
  window.addEventListener('message',event=>{
    const msg=event.data;
    if(!msg||msg.source!=='ramani-qr-studio'||!msg.requestId)return;
    const p=pending.get(msg.requestId); if(!p)return;
    pending.delete(msg.requestId); clearTimeout(p.timer); p.iframe.remove(); p.resolve(msg.data);
  });

  function backendRequest(params,timeoutMs=15000){
    return new Promise((resolve,reject)=>{
      if(!cfg.appsScriptUrl)return reject(new Error('Tracking service is not configured.'));
      const requestId=`analytics_${Date.now()}_${token()}`;
      const iframe=document.createElement('iframe'); iframe.hidden=true; iframe.setAttribute('aria-hidden','true');
      const url=new URL(cfg.appsScriptUrl); Object.entries({...params,requestId,origin:location.origin}).forEach(([k,v])=>url.searchParams.set(k,v)); iframe.src=url.toString();
      const timer=setTimeout(()=>{pending.delete(requestId);iframe.remove();reject(new Error('Analytics backend did not respond. Confirm the Apps Script Web App access is set to Anyone.'));},timeoutMs);
      pending.set(requestId,{resolve,reject,iframe,timer});
      iframe.onerror=()=>{clearTimeout(timer);pending.delete(requestId);iframe.remove();reject(new Error('Could not open the analytics backend.'));};
      document.body.appendChild(iframe);
    });
  }

  function render(){
    const q=search.value.trim().toLowerCase(), filtered=codes.filter(x=>String(x.name||'').toLowerCase().includes(q));
    rows.innerHTML=filtered.length?filtered.map(x=>`<tr><td><strong>${esc(x.name)}</strong></td><td><span class="type-chip">${esc(x.type)}</span></td><td><span class="scan-count">${Number(x.scanCount||0).toLocaleString()}</span></td><td>${fmt(x.createdAt)}</td><td>${fmt(x.lastScannedAt)}</td><td><button class="text-button detail-btn" data-name="${esc(x.name)}" type="button">View scans</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">No matching QR Names.</td></tr>';
    rows.querySelectorAll('.detail-btn').forEach(b=>b.onclick=()=>loadDetail(b.dataset.name));
  }

  async function loadAnalytics(){
    if(!cfg.appsScriptUrl){
      callout.hidden=false; callout.innerHTML='<strong>Tracking is not configured.</strong> Paste your deployed Apps Script /exec URL into <code>js/config.js</code>.';
      status.textContent='Configuration required'; ['totalCodes','totalScans','scannedCodes'].forEach(id=>byId(id).textContent='0'); rows.innerHTML='<tr><td colspan="6" class="empty-state">Configure tracking to load reports.</td></tr>'; return;
    }
    callout.hidden=true; status.textContent='Refreshing…';
    try{
      const r=await backendRequest({action:'analytics'}); if(!r?.ok)throw new Error(r?.message||'Analytics request failed');
      codes=r.codes||[]; const total=codes.reduce((s,x)=>s+Number(x.scanCount||0),0);
      byId('totalCodes').textContent=codes.length.toLocaleString(); byId('totalScans').textContent=total.toLocaleString(); byId('scannedCodes').textContent=codes.filter(x=>Number(x.scanCount)>0).length.toLocaleString();
      render(); status.textContent=`Updated ${new Date().toLocaleTimeString()}`;
    }catch(e){status.textContent='Could not load analytics';rows.innerHTML=`<tr><td colspan="6" class="empty-state">${esc(e.message)}</td></tr>`; callout.hidden=false;callout.innerHTML='<strong>Backend connection failed.</strong> Make sure you deployed the newest Apps Script version as a Web App with access set to <strong>Anyone</strong>.';}
  }

  async function loadDetail(name){
    const card=byId('detailCard'); card.hidden=false; byId('detailName').textContent=name; byId('detailMeta').textContent='Loading scan details…'; byId('detailScans').innerHTML=''; card.scrollIntoView({behavior:'smooth',block:'start'});
    try{
      const r=await backendRequest({action:'detail',name}); if(!r?.ok)throw new Error(r?.message||'Could not load details');
      byId('detailMeta').textContent=`${r.type} · ${Number(r.scanCount||0).toLocaleString()} total scans`;
      const scans=r.scans||[]; byId('detailScans').innerHTML=scans.length?scans.map((x,i)=>`<div class="scan-row"><span>Recent scan ${i+1}</span><strong>${fmt(x.timestamp)}</strong></div>`).join(''):'<div class="empty-state">No scans recorded yet.</div>';
    }catch(e){byId('detailMeta').textContent=e.message;}
  }

  search.addEventListener('input',render); byId('refreshAnalytics').onclick=loadAnalytics; byId('closeDetail').onclick=()=>{byId('detailCard').hidden=true;}; loadAnalytics();
})();
