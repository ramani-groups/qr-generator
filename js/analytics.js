(() => {
  'use strict';
  const cfg=window.RAMANI_QR_CONFIG||{}, byId=id=>document.getElementById(id);
  const rows=byId('analyticsRows'), status=byId('analyticsStatus'), callout=byId('configCallout'), search=byId('qrSearch'), dateFrom=byId('dateFrom'), dateTo=byId('dateTo');
  let codes=[], detailCache=new Map();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>v?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';
  const fmtShort=v=>v?new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(new Date(v)):'—';
  const csv=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  function scanInRange(scan){const t=new Date(scan.timestamp).getTime();if(!Number.isFinite(t))return false;if(dateFrom?.value){const a=new Date(dateFrom.value+'T00:00:00').getTime();if(t<a)return false;}if(dateTo?.value){const b=new Date(dateTo.value+'T23:59:59.999').getTime();if(t>b)return false;}return true;}

  function jsonp(p){return new Promise((resolve,reject)=>{if(!cfg.appsScriptUrl)return reject(new Error('Tracking service is not configured.'));const cb=`ramaniAnalytics_${Date.now()}_${Math.random().toString(36).slice(2)}`,s=document.createElement('script');let done=false,timer;const finish=(e,d)=>{if(done)return;done=true;delete window[cb];s.remove();clearTimeout(timer);e?reject(e):resolve(d)};window[cb]=d=>finish(null,d);const u=new URL(cfg.appsScriptUrl);Object.entries({...p,callback:cb}).forEach(([k,v])=>u.searchParams.set(k,v));s.src=u.toString();s.onerror=()=>finish(new Error('Could not reach tracking service.'));document.head.appendChild(s);timer=setTimeout(()=>finish(new Error('Request timed out.')),12000);});}

  function render(){
    const q=search.value.trim().toLowerCase(), filtered=codes.filter(x=>x.name.toLowerCase().includes(q));
    rows.innerHTML=filtered.length?filtered.map(x=>`<tr><td><strong>${esc(x.name)}</strong></td><td><span class="type-chip">${esc(x.type)}</span></td><td><span class="scan-count">${Number(x.scanCount||0).toLocaleString()}</span></td><td>${fmt(x.createdAt)}</td><td>${fmt(x.lastScannedAt)}</td><td><div class="row-actions"><button class="text-button detail-btn" data-name="${esc(x.name)}" type="button">View scans</button><button class="text-button danger-text delete-btn" data-name="${esc(x.name)}" type="button">Delete</button></div></td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">No matching QR Names.</td></tr>';
    rows.querySelectorAll('.detail-btn').forEach(b=>b.onclick=()=>loadDetail(b.dataset.name));
    rows.querySelectorAll('.delete-btn').forEach(b=>b.onclick=()=>deleteQr(b.dataset.name));
  }

  async function loadAnalytics(){
    if(!cfg.appsScriptUrl){callout.hidden=false;callout.innerHTML='<strong>Tracking is not configured.</strong> Deploy the included Google Apps Script and paste its /exec URL into <code>js/config.js</code>.'; status.textContent='Configuration required'; ['totalCodes','totalScans','scannedCodes','todayScans','weekScans'].forEach(id=>{if(byId(id))byId(id).textContent='0'}); rows.innerHTML='<tr><td colspan="6" class="empty-state">Configure tracking to load reports.</td></tr>';return;}
    status.textContent='Refreshing…';
    try{
      const r=await jsonp({action:'analytics'});if(!r?.ok)throw new Error(r?.message||'Analytics request failed');
      codes=r.codes||[]; detailCache.clear();
      const totals=r.totals||{}; const total=Number(totals.totalScans??codes.reduce((s,x)=>s+Number(x.scanCount||0),0));
      byId('totalCodes').textContent=Number(totals.totalCodes??codes.length).toLocaleString();
      byId('totalScans').textContent=total.toLocaleString();
      byId('scannedCodes').textContent=Number(totals.scannedCodes??codes.filter(x=>Number(x.scanCount)>0).length).toLocaleString();
      if(byId('todayScans'))byId('todayScans').textContent=Number(totals.todayScans||0).toLocaleString();
      if(byId('weekScans'))byId('weekScans').textContent='…';
      render(); status.textContent=`Updated ${new Date().toLocaleTimeString()}`;
      hydrateScanSummary();
    }catch(e){status.textContent='Could not load analytics';rows.innerHTML=`<tr><td colspan="6" class="empty-state">${esc(e.message)}</td></tr>`;}
  }

  async function getDetail(name){
    if(detailCache.has(name)) return detailCache.get(name);
    const p=jsonp({action:'detail',name}).then(r=>{if(!r?.ok)throw new Error(r?.message||'Could not load details');return r;});
    detailCache.set(name,p); return p;
  }

  async function hydrateScanSummary(){
    const scanned=codes.filter(x=>Number(x.scanCount||0)>0);
    if(!scanned.length){if(byId('weekScans'))byId('weekScans').textContent='0';renderDeviceChart([]);return;}
    try{
      const details=await Promise.all(scanned.map(x=>getDetail(x.name).catch(()=>null)));
      const all=details.filter(Boolean).flatMap(d=>d.scans||[]), now=Date.now(), seven=7*24*60*60*1000;
      const week=all.filter(s=>{const t=new Date(s.timestamp).getTime();return Number.isFinite(t)&&now-t<=seven&&now>=t;}).length;
      if(byId('weekScans'))byId('weekScans').textContent=week.toLocaleString();
      renderDeviceChart(all);
    }catch(_){if(byId('weekScans'))byId('weekScans').textContent='—';}
  }

  function renderDeviceChart(scans){
    const host=byId('deviceBreakdown'); if(!host)return;
    const counts={}; scans.forEach(s=>{const k=(s.device||'Unknown').trim()||'Unknown';counts[k]=(counts[k]||0)+1;});
    const items=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6), max=Math.max(1,...items.map(x=>x[1]));
    host.innerHTML=items.length?items.map(([k,v])=>`<div class="breakdown-row"><div><span>${esc(k)}</span><strong>${v.toLocaleString()}</strong></div><div class="breakdown-track"><i style="width:${Math.max(4,(v/max)*100)}%"></i></div></div>`).join(''):'<div class="empty-state">Device data will appear after scans are recorded.</div>';
  }

  async function loadDetail(name){
    const card=byId('detailCard');card.hidden=false;byId('detailName').textContent=name;byId('detailMeta').textContent='Loading scan details…';byId('detailScans').innerHTML='';card.scrollIntoView({behavior:'smooth',block:'start'});
    try{
      const r=await getDetail(name);
      const allScans=r.scans||[], scans=allScans.filter(scanInRange);
      const rangeNote=(dateFrom?.value||dateTo?.value)?` · ${scans.length.toLocaleString()} in selected date range`:'';
      byId('detailMeta').textContent=`${r.type} · ${Number(r.scanCount||0).toLocaleString()} total scans · Created ${fmtShort(r.createdAt)}${rangeNote}`;
      byId('detailScans').innerHTML=scans.length?scans.map((x,i)=>{
        const loc=[x.city,x.region,x.country].filter(Boolean).join(', ')||'—';
        const coords=(x.latitude!==''&&x.longitude!=='')?`${x.latitude}, ${x.longitude}`:'—';
        return `<article class="scan-detail-row"><div class="scan-detail-top"><span>Scan ${scans.length-i}</span><strong>${fmt(x.timestamp)}</strong></div><div class="scan-meta-grid"><div><span>Device</span><strong>${esc(x.device||'—')}</strong></div><div><span>Browser</span><strong>${esc(x.browser||'—')}</strong></div><div><span>OS</span><strong>${esc(x.os||'—')}</strong></div><div><span>IP</span><strong>${esc(x.ip||'—')}</strong></div><div><span>Location</span><strong>${esc(loc)}</strong></div><div><span>Coordinates</span><strong>${esc(coords)}</strong></div><div class="scan-meta-wide"><span>Referrer</span><strong>${esc(x.referrer||'Direct / unavailable')}</strong></div><div class="scan-meta-wide"><span>User agent</span><strong class="ua-text">${esc(x.userAgent||'—')}</strong></div></div></article>`;
      }).join(''):'<div class="empty-state">No scans recorded yet.</div>';
    }catch(e){byId('detailMeta').textContent=e.message;}
  }

  async function deleteQr(name){
    const code=codes.find(x=>x.name===name); if(!code)return;
    if(!confirm(`Delete "${name}" and all of its scan history?\n\nAfter deletion, this QR Name can be reused. This cannot be undone.`))return;
    status.textContent=`Deleting ${name}…`;
    try{
      const r=await jsonp({action:'delete',name,token:code.token}); if(!r?.ok)throw new Error(r?.message||'Delete failed');
      if(byId('detailCard')&&!byId('detailCard').hidden&&byId('detailName').textContent===name)byId('detailCard').hidden=true;
      await loadAnalytics();
    }catch(e){status.textContent=`Delete failed: ${e.message}`;alert(e.message);}
  }

  async function exportCsv(){
    status.textContent='Preparing export…';
    const lines=[['QR Name','Type','Created At','Scan Count','Last Scanned At','Scan Timestamp','Device','Browser','OS','Referrer','IP Address','Country','Region','City','Latitude','Longitude','User Agent'].map(csv).join(',')];
    for(const code of codes){
      let detail=null; try{detail=await getDetail(code.name);}catch(_){}
      const scans=(detail?.scans||[]).filter(scanInRange);
      if(!scans.length){lines.push([code.name,code.type,code.createdAt,code.scanCount,code.lastScannedAt,'','','','','','','','','','','',''].map(csv).join(','));continue;}
      scans.forEach(s=>lines.push([code.name,code.type,code.createdAt,code.scanCount,code.lastScannedAt,s.timestamp,s.device,s.browser,s.os,s.referrer,s.ip,s.country,s.region,s.city,s.latitude,s.longitude,s.userAgent].map(csv).join(',')));
    }
    const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ramani-qr-analytics-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();URL.revokeObjectURL(a.href);a.remove();status.textContent='CSV exported';
  }

  search.addEventListener('input',render);
  [dateFrom,dateTo].forEach(el=>el&&el.addEventListener('change',()=>{if(!byId('detailCard').hidden)loadDetail(byId('detailName').textContent);}));
  byId('clearDates').onclick=()=>{dateFrom.value='';dateTo.value='';if(!byId('detailCard').hidden)loadDetail(byId('detailName').textContent);};
  byId('refreshAnalytics').onclick=loadAnalytics;byId('exportAnalytics').onclick=exportCsv;byId('closeDetail').onclick=()=>{byId('detailCard').hidden=true;};loadAnalytics();
})();
