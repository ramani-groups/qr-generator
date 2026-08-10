(() => {
  'use strict';

  const state = {
    type: 'url',
    payload: '',
    valid: true,
    qr: null
  };

  const byId = (id) => document.getElementById(id);
  const els = {
    urlInput: byId('urlInput'), textInput: byId('textInput'),
    emailAddress: byId('emailAddress'), emailSubject: byId('emailSubject'), emailMessage: byId('emailMessage'),
    phoneInput: byId('phoneInput'), smsPhone: byId('smsPhone'), smsMessage: byId('smsMessage'),
    wifiSsid: byId('wifiSsid'), wifiPassword: byId('wifiPassword'), wifiSecurity: byId('wifiSecurity'), wifiHidden: byId('wifiHidden'),
    foregroundColor: byId('foregroundColor'), backgroundColor: byId('backgroundColor'),
    foregroundValue: byId('foregroundValue'), backgroundValue: byId('backgroundValue'),
    sizeSelect: byId('sizeSelect'), errorCorrection: byId('errorCorrection'), marginRange: byId('marginRange'), marginValue: byId('marginValue'),
    validationMessage: byId('validationMessage'), validBadge: byId('validBadge'), canvas: byId('qrCanvas'),
    downloadPng: byId('downloadPng'), downloadSvg: byId('downloadSvg'), copyContent: byId('copyContent'), copyImage: byId('copyImage'), shareButton: byId('shareButton'),
    resetButton: byId('resetButton'), toast: byId('toast'), mobileMenuButton: document.querySelector('.mobile-menu-button'), nav: byId('primary-nav')
  };

  const DEFAULTS = {
    type: 'url', url: 'https://example.com', fg: '#000000', bg: '#ffffff', size: '512', ec: 'M', margin: '4'
  };

  function escapeWifi(value) {
    return value.replace(/([\\;,:"])/g, '\\$1');
  }

  function normalizeUrl(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  function isValidPhone(value) {
    return /^\+?[0-9 ()\-.]{5,25}$/.test(value.trim());
  }

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function relativeLuminance(hex) {
    const rgb = hexToRgb(hex);
    const channels = [rgb.r, rgb.g, rgb.b].map(value => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function qrContrastRatio() {
    const a = relativeLuminance(els.foregroundColor.value);
    const b = relativeLuminance(els.backgroundColor.value);
    const light = Math.max(a, b);
    const dark = Math.min(a, b);
    return (light + 0.05) / (dark + 0.05);
  }

  function buildPayload() {
    let payload = '';
    let error = '';

    switch (state.type) {
      case 'url': {
        const normalized = normalizeUrl(els.urlInput.value);
        if (!normalized) error = 'Enter a website URL.';
        else {
          try {
            const parsed = new URL(normalized);
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
            payload = parsed.href;
          } catch (_) { error = 'Enter a valid web address, such as example.com.'; }
        }
        break;
      }
      case 'text':
        payload = els.textInput.value.trim();
        if (!payload) error = 'Enter some text to create a QR code.';
        break;
      case 'email': {
        const email = els.emailAddress.value.trim();
        if (!email) error = 'Enter an email address.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Enter a valid email address.';
        else {
          const params = new URLSearchParams();
          if (els.emailSubject.value) params.set('subject', els.emailSubject.value);
          if (els.emailMessage.value) params.set('body', els.emailMessage.value);
          payload = `mailto:${email}${params.toString() ? `?${params.toString()}` : ''}`;
        }
        break;
      }
      case 'phone': {
        const phone = els.phoneInput.value.trim();
        if (!phone) error = 'Enter a phone number.';
        else if (!isValidPhone(phone)) error = 'Enter a valid phone number.';
        else payload = `tel:${phone.replace(/[ ()-.]/g, '')}`;
        break;
      }
      case 'sms': {
        const phone = els.smsPhone.value.trim();
        if (!phone) error = 'Enter a phone number for the SMS.';
        else if (!isValidPhone(phone)) error = 'Enter a valid phone number.';
        else payload = `SMSTO:${phone.replace(/[ ()-.]/g, '')}:${els.smsMessage.value}`;
        break;
      }
      case 'wifi': {
        const ssid = els.wifiSsid.value.trim();
        if (!ssid) error = 'Enter the Wi-Fi network name / SSID.';
        else {
          const security = els.wifiSecurity.value;
          const password = security === 'nopass' ? '' : els.wifiPassword.value;
          payload = `WIFI:T:${security};S:${escapeWifi(ssid)};P:${escapeWifi(password)};H:${els.wifiHidden.checked ? 'true' : 'false'};;`;
        }
        break;
      }
      default:
        error = 'Choose a QR content type.';
    }

    if (!error && qrContrastRatio() < 2.5) {
      error = 'Choose QR and background colors with stronger contrast for reliable scanning.';
    }

    state.payload = payload;
    state.valid = !error;
    els.validationMessage.textContent = error;
    els.validBadge.classList.toggle('invalid', Boolean(error));
    els.validBadge.innerHTML = `<span></span>${error ? 'Check input' : 'Ready'}`;
    [els.downloadPng, els.downloadSvg, els.copyContent].forEach(button => { button.disabled = Boolean(error); });
    if (els.copyImage) els.copyImage.disabled = Boolean(error);
    if (els.shareButton) els.shareButton.disabled = Boolean(error);
    return !error;
  }

  function createQr() {
    if (typeof window.qrcode !== 'function') {
      els.validationMessage.textContent = 'The QR library could not load. Check your internet connection and refresh.';
      state.valid = false;
      return null;
    }
    const qr = window.qrcode(0, els.errorCorrection.value);
    qr.addData(state.payload, 'Byte');
    qr.make();
    return qr;
  }

  function renderQr() {
    els.foregroundValue.textContent = els.foregroundColor.value.toUpperCase();
    els.backgroundValue.textContent = els.backgroundColor.value.toUpperCase();
    els.marginValue.textContent = `${els.marginRange.value} modules`;

    if (!buildPayload()) {
      drawPlaceholder();
      return;
    }

    try {
      state.qr = createQr();
      if (!state.qr) return;
      drawQrToCanvas(state.qr);
    } catch (error) {
      state.valid = false;
      els.validationMessage.textContent = 'This content is too large for the selected QR settings. Shorten it or raise error correction only when needed.';
      els.validBadge.classList.add('invalid');
      els.validBadge.innerHTML = '<span></span>Check input';
      drawPlaceholder();
    }
  }

  function drawQrToCanvas(qr) {
    const canvas = els.canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    const exportSize = Number(els.sizeSelect.value);
    const margin = Number(els.marginRange.value);
    const modules = qr.getModuleCount();
    const totalModules = modules + margin * 2;
    const scale = exportSize / totalModules;

    canvas.width = exportSize;
    canvas.height = exportSize;
    ctx.fillStyle = els.backgroundColor.value;
    ctx.fillRect(0, 0, exportSize, exportSize);
    ctx.fillStyle = els.foregroundColor.value;

    for (let row = 0; row < modules; row += 1) {
      for (let col = 0; col < modules; col += 1) {
        if (!qr.isDark(row, col)) continue;
        const x1 = Math.round((col + margin) * scale);
        const y1 = Math.round((row + margin) * scale);
        const x2 = Math.round((col + margin + 1) * scale);
        const y2 = Math.round((row + margin + 1) * scale);
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      }
    }
  }

  function drawPlaceholder() {
    const canvas = els.canvas;
    const ctx = canvas.getContext('2d');
    canvas.width = 512; canvas.height = 512;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#f3eee5';
    const s = 44, start = 58;
    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        if ((x * 3 + y * 5) % 4 < 2) ctx.fillRect(start + x * s, start + y * s, s - 8, s - 8);
      }
    }
  }

  function buildSvg() {
    if (!state.qr || !state.valid) return '';
    const size = Number(els.sizeSelect.value);
    const margin = Number(els.marginRange.value);
    const modules = state.qr.getModuleCount();
    const total = modules + margin * 2;
    const rects = [];
    for (let row = 0; row < modules; row += 1) {
      for (let col = 0; col < modules; col += 1) {
        if (state.qr.isDark(row, col)) rects.push(`<rect x="${col + margin}" y="${row + margin}" width="1" height="1"/>`);
      }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code">\n<rect width="${total}" height="${total}" fill="${els.backgroundColor.value}"/>\n<g fill="${els.foregroundColor.value}">${rects.join('')}</g>\n</svg>`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 1800);
  }

  function setType(type) {
    state.type = type;
    document.querySelectorAll('.tab-button').forEach(btn => {
      const active = btn.dataset.type === type;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.type-panel').forEach(panel => {
      const active = panel.dataset.panel === type;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
    renderQr();
  }

  function resetAll() {
    els.urlInput.value = DEFAULTS.url;
    [els.textInput, els.emailAddress, els.emailSubject, els.emailMessage, els.phoneInput, els.smsPhone, els.smsMessage, els.wifiSsid, els.wifiPassword].forEach(el => { el.value = ''; });
    els.wifiSecurity.value = 'WPA';
    els.wifiHidden.checked = false;
    els.foregroundColor.value = DEFAULTS.fg;
    els.backgroundColor.value = DEFAULTS.bg;
    els.sizeSelect.value = DEFAULTS.size;
    els.errorCorrection.value = DEFAULTS.ec;
    els.marginRange.value = DEFAULTS.margin;
    setType(DEFAULTS.type);
    showToast('Settings reset');
  }

  document.querySelectorAll('.tab-button').forEach(button => button.addEventListener('click', () => setType(button.dataset.type)));
  document.querySelectorAll('input, textarea, select').forEach(control => control.addEventListener('input', renderQr));
  document.querySelectorAll('select').forEach(control => control.addEventListener('change', renderQr));

  els.downloadPng.addEventListener('click', () => {
    if (!buildPayload()) return;
    renderQr();
    els.canvas.toBlob(blob => { if (blob) downloadBlob(blob, 'qr-code.png'); }, 'image/png');
  });

  els.downloadSvg.addEventListener('click', () => {
    if (!buildPayload()) return;
    renderQr();
    const svg = buildSvg();
    if (svg) downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'qr-code.svg');
  });

  els.copyContent.addEventListener('click', async () => {
    if (!buildPayload()) return;
    try { await navigator.clipboard.writeText(state.payload); showToast('QR content copied'); }
    catch (_) { showToast('Clipboard access is unavailable in this browser'); }
  });

  if (navigator.clipboard && window.ClipboardItem) {
    els.copyImage.hidden = false;
    els.copyImage.addEventListener('click', async () => {
      if (!state.valid) return;
      try {
        const blob = await new Promise(resolve => els.canvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('QR image copied');
      } catch (_) { showToast('Image clipboard access is unavailable'); }
    });
  }

  if (navigator.share) {
    els.shareButton.hidden = false;
    els.shareButton.addEventListener('click', async () => {
      if (!state.valid) return;
      try {
        const blob = await new Promise(resolve => els.canvas.toBlob(resolve, 'image/png'));
        const file = new File([blob], 'qr-code.png', { type: 'image/png' });
        const shareData = { title: 'QR Studio QR Code', text: state.payload };
        if (navigator.canShare && navigator.canShare({ files: [file] })) shareData.files = [file];
        await navigator.share(shareData);
      } catch (error) {
        if (error?.name !== 'AbortError') showToast('Sharing is unavailable right now');
      }
    });
  }

  els.resetButton.addEventListener('click', resetAll);
  els.mobileMenuButton.addEventListener('click', () => {
    const open = els.mobileMenuButton.getAttribute('aria-expanded') === 'true';
    els.mobileMenuButton.setAttribute('aria-expanded', String(!open));
    els.nav.classList.toggle('open', !open);
  });
  els.nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    els.nav.classList.remove('open');
    els.mobileMenuButton.setAttribute('aria-expanded', 'false');
  }));

  renderQr();
})();
