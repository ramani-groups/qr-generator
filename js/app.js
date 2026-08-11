(() => {
  'use strict';

  const cfg = window.RAMANI_QR_CONFIG || {};
  const state = {
    type: 'url',
    actionPayload: '',
    qrPayload: '',
    valid: false,
    qr: null,
    nameStatus: 'unknown',
    registeredName: '',
    registeredFingerprint: '',
    token: ''
  };

  const byId = id => document.getElementById(id);
  const els = {
    qrName: byId('qrName'), nameStatus: byId('nameStatus'),
    urlInput: byId('urlInput'), textInput: byId('textInput'),
    emailAddress: byId('emailAddress'), emailSubject: byId('emailSubject'), emailMessage: byId('emailMessage'),
    phoneInput: byId('phoneInput'), smsPhone: byId('smsPhone'), smsMessage: byId('smsMessage'),
    wifiSsid: byId('wifiSsid'), wifiPassword: byId('wifiPassword'), wifiSecurity: byId('wifiSecurity'), wifiHidden: byId('wifiHidden'),
    foregroundColor: byId('foregroundColor'), backgroundColor: byId('backgroundColor'),
    foregroundValue: byId('foregroundValue'), backgroundValue: byId('backgroundValue'),
    sizeSelect: byId('sizeSelect'), errorCorrection: byId('errorCorrection'), marginRange: byId('marginRange'), marginValue: byId('marginValue'),
    validationMessage: byId('validationMessage'), validBadge: byId('validBadge'), canvas: byId('qrCanvas'),
    saveQr: byId('saveQr'), saveStatus: byId('saveStatus'),
    downloadPng: byId('downloadPng'), downloadSvg: byId('downloadSvg'), copyContent: byId('copyContent'), copyImage: byId('copyImage'), shareButton: byId('shareButton'),
    resetButton: byId('resetButton'), toast: byId('toast'), mobileMenuButton: document.querySelector('.mobile-menu-button'), nav: byId('primary-nav')
  };

  const DEFAULTS = { type: 'url', url: 'https://example.com', fg: '#000000', bg: '#ffffff', size: '512', ec: 'M', margin: '4' };

  function apiConfigured() { return Boolean(cfg.appsScriptUrl); }
  function makeToken() {
    if (window.crypto?.getRandomValues) { const a=new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a,b=>b.toString(16).padStart(2,'0')).join(''); }
    return Math.random().toString(36).slice(2)+Date.now().toString(36);
  }
  function getBaseUrl() {
    if (cfg.publicBaseUrl) return cfg.publicBaseUrl.replace(/\/$/, '');
    if (/^https?:$/.test(location.protocol)) return new URL('.', location.href).href.replace(/\/$/, '');
    return '';
  }

  const bridgePending = new Map();
  window.addEventListener('message', event => {
    const msg = event.data;
    if (!msg || msg.source !== 'ramani-qr-studio' || !msg.requestId) return;
    const pending = bridgePending.get(msg.requestId);
    if (!pending) return;
    bridgePending.delete(msg.requestId);
    clearTimeout(pending.timer);
    pending.iframe.remove();
    pending.resolve(msg.data);
  });

  function backendRequest(params, timeoutMs=12000) {
    return new Promise((resolve, reject) => {
      if (!apiConfigured()) return reject(new Error('Tracking service is not configured.'));
      const requestId = `ramani_${Date.now()}_${makeToken().slice(0,12)}`;
      const iframe = document.createElement('iframe');
      iframe.hidden = true;
      iframe.setAttribute('aria-hidden', 'true');
      const url = new URL(cfg.appsScriptUrl);
      Object.entries({ ...params, requestId, origin: location.origin }).forEach(([k, v]) => url.searchParams.set(k, v));
      iframe.src = url.toString();
      const timer = setTimeout(() => {
        bridgePending.delete(requestId);
        iframe.remove();
        reject(new Error('Tracking service did not respond. Confirm the Apps Script Web App is deployed with access set to Anyone.'));
      }, timeoutMs);
      bridgePending.set(requestId, { resolve, reject, iframe, timer });
      iframe.onerror = () => {
        clearTimeout(timer);
        bridgePending.delete(requestId);
        iframe.remove();
        reject(new Error('Could not open the tracking service.'));
      };
      document.body.appendChild(iframe);
    });
  }

  function normalizeName(raw) { return raw.trim().replace(/\s+/g, ' '); }
  function validName(name) { return /^[A-Za-z0-9][A-Za-z0-9 _.-]{2,59}$/.test(name); }
  function slugName(name) { return name.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'qr-code'; }
  function base64UrlEncode(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function escapeWifi(value) { return value.replace(/([\\;,:\"])/g, '\\$1'); }
  function normalizeUrl(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  }
  function isValidPhone(value) { return /^\+?[0-9 ()\-.]{5,25}$/.test(value.trim()); }
  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return { r: parseInt(clean.slice(0,2),16), g: parseInt(clean.slice(2,4),16), b: parseInt(clean.slice(4,6),16) };
  }
  function relativeLuminance(hex) {
    const rgb = hexToRgb(hex);
    const c = [rgb.r,rgb.g,rgb.b].map(v => { const x=v/255; return x<=.03928 ? x/12.92 : ((x+.055)/1.055)**2.4; });
    return .2126*c[0]+.7152*c[1]+.0722*c[2];
  }
  function qrContrastRatio() {
    const a=relativeLuminance(els.foregroundColor.value), b=relativeLuminance(els.backgroundColor.value);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  }

  function buildActionPayload() {
    let payload = '', error = '';
    switch (state.type) {
      case 'url': {
        const normalized = normalizeUrl(els.urlInput.value);
        if (!normalized) error = 'Enter a website URL.';
        else try {
          const parsed = new URL(normalized);
          if (!['http:','https:'].includes(parsed.protocol)) throw new Error();
          payload = parsed.href;
        } catch (_) { error = 'Enter a valid web address, such as ramanigroups.com.'; }
        break;
      }
      case 'text':
        payload = els.textInput.value.trim();
        if (!payload) error = 'Enter some text.';
        break;
      case 'email': {
        const email = els.emailAddress.value.trim();
        if (!email) error = 'Enter an email address.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Enter a valid email address.';
        else {
          const params = new URLSearchParams();
          if (els.emailSubject.value) params.set('subject', els.emailSubject.value);
          if (els.emailMessage.value) params.set('body', els.emailMessage.value);
          payload = `mailto:${email}${params.toString() ? `?${params}` : ''}`;
        }
        break;
      }
      case 'phone': {
        const phone = els.phoneInput.value.trim();
        if (!phone) error = 'Enter a phone number.';
        else if (!isValidPhone(phone)) error = 'Enter a valid phone number.';
        else payload = `tel:${phone.replace(/[ ()-.]/g,'')}`;
        break;
      }
      case 'sms': {
        const phone = els.smsPhone.value.trim();
        if (!phone) error = 'Enter a phone number for the SMS.';
        else if (!isValidPhone(phone)) error = 'Enter a valid phone number.';
        else payload = `sms:${phone.replace(/[ ()-.]/g,'')}?body=${encodeURIComponent(els.smsMessage.value)}`;
        break;
      }
      case 'wifi': {
        const ssid = els.wifiSsid.value.trim();
        if (!ssid) error = 'Enter the Wi-Fi network name / SSID.';
        else {
          const security = els.wifiSecurity.value;
          const password = security === 'nopass' ? '' : els.wifiPassword.value;
          if (security !== 'nopass' && !password) error = 'Enter the Wi-Fi password.';
          else payload = `WIFI:T:${security};S:${escapeWifi(ssid)};P:${escapeWifi(password)};H:${els.wifiHidden.checked ? 'true' : 'false'};;`;
        }
        break;
      }
    }
    return { payload, error };
  }

  function buildTrackedPayload(actionPayload) {
    const name = normalizeName(els.qrName.value);
    const base = getBaseUrl();
    if (!base) return { payload: '', error: 'Tracking requires this tool to be hosted on GitHub Pages or another HTTPS site.' };
    if (!apiConfigured()) return { payload: '', error: 'Configure the Google Apps Script tracking URL in js/config.js.' };
    const data = base64UrlEncode(actionPayload);
    if (!state.token) state.token = makeToken();
    const url = new URL(cfg.appsScriptUrl);
    url.searchParams.set('action', 'scan');
    url.searchParams.set('n', name);
    url.searchParams.set('t', state.type);
    url.searchParams.set('k', state.token);
    url.searchParams.set('d', data);
    url.searchParams.set('b', `${base}/go.html`);
    return { payload: url.toString(), error: '' };
  }

  function fingerprint() { return `${normalizeName(els.qrName.value)}|${state.type}|${state.actionPayload}`; }

  function setStatus(error) {
    state.valid = !error && state.nameStatus === 'available' && apiConfigured();
    els.validationMessage.textContent = error || (!apiConfigured() ? 'Configure the Google Apps Script tracking URL in js/config.js.' : '');
    els.validBadge.classList.toggle('invalid', !state.valid);
    els.validBadge.innerHTML = `<span></span>${state.valid ? 'Ready' : 'Check input'}`;
    [els.saveQr, els.downloadPng, els.downloadSvg, els.copyContent].filter(Boolean).forEach(b => { b.disabled = !state.valid; });
    if (els.copyImage) els.copyImage.disabled = !state.valid;
    if (els.shareButton) els.shareButton.disabled = !state.valid;
  }

  function buildPayload() {
    const name = normalizeName(els.qrName.value);
    let error = '';
    if (!name) error = 'Enter a unique QR Name.';
    else if (!validName(name)) error = 'QR Name must be 3–60 characters and use letters, numbers, spaces, hyphen, underscore or dot.';

    const action = buildActionPayload();
    if (!error && action.error) error = action.error;
    if (!error && qrContrastRatio() < 2.5) error = 'Choose QR and background colors with stronger contrast.';

    state.actionPayload = action.payload;
    if (!error) {
      const tracked = buildTrackedPayload(action.payload);
      if (tracked.error) error = tracked.error;
      state.qrPayload = tracked.payload;
    } else state.qrPayload = '';

    setStatus(error);
    return !error;
  }

  function createQr() {
    if (typeof window.qrcode !== 'function') return null;
    const qr = window.qrcode(0, els.errorCorrection.value);
    qr.addData(state.qrPayload, 'Byte');
    qr.make();
    return qr;
  }

  function drawPlaceholder() {
    const c=els.canvas, ctx=c.getContext('2d'); c.width=512; c.height=512;
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,512,512); ctx.fillStyle='#eef3f7';
    const s=44,start=58; for(let y=0;y<9;y++) for(let x=0;x<9;x++) if((x*3+y*5)%4<2) ctx.fillRect(start+x*s,start+y*s,s-8,s-8);
  }

  function drawQrToCanvas(qr) {
    const c=els.canvas, ctx=c.getContext('2d',{alpha:false}), size=Number(els.sizeSelect.value), margin=Number(els.marginRange.value), modules=qr.getModuleCount(), total=modules+margin*2, scale=size/total;
    c.width=size; c.height=size; ctx.fillStyle=els.backgroundColor.value; ctx.fillRect(0,0,size,size); ctx.fillStyle=els.foregroundColor.value;
    for(let r=0;r<modules;r++) for(let col=0;col<modules;col++) if(qr.isDark(r,col)) {
      const x1=Math.round((col+margin)*scale), y1=Math.round((r+margin)*scale), x2=Math.round((col+margin+1)*scale), y2=Math.round((r+margin+1)*scale);
      ctx.fillRect(x1,y1,x2-x1,y2-y1);
    }
  }

  function renderQr() {
    els.foregroundValue.textContent=els.foregroundColor.value.toUpperCase();
    els.backgroundValue.textContent=els.backgroundColor.value.toUpperCase();
    els.marginValue.textContent=`${els.marginRange.value} modules`;
    const basicOk=buildPayload();
    if (!basicOk || state.nameStatus !== 'available') { drawPlaceholder(); return; }
    try { state.qr=createQr(); state.qr ? drawQrToCanvas(state.qr) : drawPlaceholder(); }
    catch (_) { els.validationMessage.textContent='This QR content is too large. Shorten the content.'; state.valid=false; drawPlaceholder(); }
  }

  function buildSvg() {
    if (!state.qr || !state.valid) return '';
    const size=Number(els.sizeSelect.value), margin=Number(els.marginRange.value), modules=state.qr.getModuleCount(), total=modules+margin*2, rects=[];
    for(let r=0;r<modules;r++) for(let c=0;c<modules;c++) if(state.qr.isDark(r,c)) rects.push(`<rect x="${c+margin}" y="${r+margin}" width="1" height="1"/>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${els.backgroundColor.value}"/><g fill="${els.foregroundColor.value}">${rects.join('')}</g></svg>`;
  }

  function showToast(message) { els.toast.textContent=message; els.toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>els.toast.classList.remove('show'),1800); }
  function downloadBlob(blob, filename) { const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=filename; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }

  let nameTimer;
  async function checkName() {
    clearTimeout(nameTimer);
    const name=normalizeName(els.qrName.value);
    state.nameStatus='checking';
    els.nameStatus.className='name-status';
    if (!name) { state.nameStatus='unknown'; els.nameStatus.textContent='Required for tracking and reports.'; renderQr(); return; }
    if (!validName(name)) { state.nameStatus='invalid'; els.nameStatus.textContent='Use 3–60 letters/numbers/spaces/-/_/.'; renderQr(); return; }
    if (state.registeredName.toLowerCase() === name.toLowerCase()) { state.nameStatus='available'; els.nameStatus.textContent='Registered in this session.'; els.nameStatus.classList.add('ok'); renderQr(); return; }
    if (!apiConfigured()) { state.nameStatus='unavailable'; els.nameStatus.textContent='Tracking service not configured.'; renderQr(); return; }
    els.nameStatus.textContent='Checking availability…';
    nameTimer=setTimeout(async()=>{
      try {
        const result=await backendRequest({action:'checkName',name});
        if (result?.available) { state.nameStatus='available'; els.nameStatus.textContent='Name is available.'; els.nameStatus.classList.add('ok'); }
        else { state.nameStatus='taken'; els.nameStatus.textContent='This QR Name already exists. Choose another.'; els.nameStatus.classList.add('bad'); }
      } catch (e) { state.nameStatus='unavailable'; els.nameStatus.textContent=e.message; els.nameStatus.classList.add('bad'); }
      renderQr();
    },350);
  }

  async function ensureRegistered() {
    if (!buildPayload() || state.nameStatus !== 'available') throw new Error('Complete the QR details first.');
    const name=normalizeName(els.qrName.value), fp=fingerprint();
    if (state.registeredName.toLowerCase()===name.toLowerCase() && state.registeredFingerprint===fp) return true;
    if (state.registeredName.toLowerCase()===name.toLowerCase() && state.registeredFingerprint!==fp) throw new Error('This QR Name is already registered with different content. Use a new QR Name.');
    const result=await backendRequest({action:'register',name,type:state.type,token:state.token});
    if (!result?.ok) {
      state.nameStatus='taken'; els.nameStatus.textContent=result?.message || 'QR Name already exists.'; els.nameStatus.className='name-status bad'; renderQr();
      throw new Error(result?.message || 'QR Name already exists.');
    }
    state.registeredName=name; state.registeredFingerprint=fp; state.nameStatus='available'; els.nameStatus.textContent='Registered for scan tracking.'; els.nameStatus.className='name-status ok';
    if (els.saveStatus) els.saveStatus.textContent=`Saved as “${name}”. Analytics is ready to count scans.`;
    if (els.saveQr) els.saveQr.textContent='Saved & Tracking Enabled';
    return true;
  }

  function setType(type) {
    state.type=type;
    document.querySelectorAll('.tab-button').forEach(btn=>{ const on=btn.dataset.type===type; btn.classList.toggle('active',on); btn.setAttribute('aria-selected',String(on)); });
    document.querySelectorAll('.type-panel').forEach(p=>{ const on=p.dataset.panel===type; p.classList.toggle('active',on); p.hidden=!on; });
    renderQr();
  }

  function resetAll() {
    els.qrName.value=''; els.urlInput.value=DEFAULTS.url;
    [els.textInput,els.emailAddress,els.emailSubject,els.emailMessage,els.phoneInput,els.smsPhone,els.smsMessage,els.wifiSsid,els.wifiPassword].forEach(el=>{el.value='';});
    els.wifiSecurity.value='WPA'; els.wifiHidden.checked=false; els.foregroundColor.value=DEFAULTS.fg; els.backgroundColor.value=DEFAULTS.bg; els.sizeSelect.value=DEFAULTS.size; els.errorCorrection.value=DEFAULTS.ec; els.marginRange.value=DEFAULTS.margin;
    state.registeredName=''; state.registeredFingerprint=''; state.token=makeToken(); state.nameStatus='unknown'; els.nameStatus.textContent='Required for tracking and reports.'; els.nameStatus.className='name-status'; if(els.saveStatus)els.saveStatus.textContent='Not saved yet.'; if(els.saveQr)els.saveQr.textContent='Save QR & Enable Tracking'; setType(DEFAULTS.type); showToast('Settings reset');
  }

  document.querySelectorAll('.tab-button').forEach(b=>b.addEventListener('click',()=>setType(b.dataset.type)));
  document.querySelectorAll('input,textarea,select').forEach(c=>{ if(c!==els.qrName) c.addEventListener('input',renderQr); });
  document.querySelectorAll('select').forEach(c=>c.addEventListener('change',renderQr));
  els.qrName.addEventListener('input',()=>{ state.token=makeToken(); state.registeredName=''; state.registeredFingerprint=''; if(els.saveStatus)els.saveStatus.textContent='Not saved yet.'; if(els.saveQr)els.saveQr.textContent='Save QR & Enable Tracking'; checkName(); });

  els.saveQr?.addEventListener('click', async()=>{
    try { await ensureRegistered(); showToast('QR saved and tracking enabled'); }
    catch(e){ showToast(e.message); }
  });

  els.downloadPng.addEventListener('click', async()=>{
    try { await ensureRegistered(); renderQr(); const filename=`${slugName(els.qrName.value)}.png`; els.canvas.toBlob(blob=>{if(blob) downloadBlob(blob,filename);},'image/png'); }
    catch(e){ showToast(e.message); }
  });
  els.downloadSvg.addEventListener('click', async()=>{
    try { await ensureRegistered(); renderQr(); const svg=buildSvg(); if(svg) downloadBlob(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),`${slugName(els.qrName.value)}.svg`); }
    catch(e){ showToast(e.message); }
  });
  els.copyContent.addEventListener('click', async()=>{ if(!state.valid)return; try{await ensureRegistered(); await navigator.clipboard.writeText(state.qrPayload);showToast('Tracked QR link copied');}catch(e){showToast(e.message||'Clipboard unavailable');} });

  if (navigator.clipboard && window.ClipboardItem) {
    els.copyImage.hidden=false; els.copyImage.addEventListener('click',async()=>{ if(!state.valid)return; try{await ensureRegistered(); const blob=await new Promise(r=>els.canvas.toBlob(r,'image/png')); await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]); showToast('QR image copied');}catch(e){showToast(e.message||'Image clipboard unavailable');} });
  }
  if (navigator.share) {
    els.shareButton.hidden=false; els.shareButton.addEventListener('click',async()=>{ if(!state.valid)return; try{await ensureRegistered(); const blob=await new Promise(r=>els.canvas.toBlob(r,'image/png')); const file=new File([blob],`${slugName(els.qrName.value)}.png`,{type:'image/png'}); const data={title:`${els.qrName.value} · Ramani QR`,text:'Tracked Ramani Groups QR code'}; if(navigator.canShare?.({files:[file]}))data.files=[file]; await navigator.share(data);}catch(e){if(e?.name!=='AbortError')showToast(e.message||'Sharing unavailable');} });
  }

  els.resetButton.addEventListener('click',resetAll);
  els.mobileMenuButton?.addEventListener('click',()=>{const open=els.mobileMenuButton.getAttribute('aria-expanded')==='true';els.mobileMenuButton.setAttribute('aria-expanded',String(!open));els.nav.classList.toggle('open',!open);});
  els.nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{els.nav.classList.remove('open');els.mobileMenuButton?.setAttribute('aria-expanded','false');}));

  state.token=makeToken();
  drawPlaceholder();
  checkName();
})();
