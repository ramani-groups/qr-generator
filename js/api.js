(function () {
  'use strict';

  const cfg = window.RAMANI_QR_CONFIG || {};
  const API_URL = cfg.API_URL || '';
  let callbackCounter = 0;

  function jsonp(params, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      if (!API_URL) {
        reject(new Error('Tracking API URL is not configured.'));
        return;
      }

      callbackCounter += 1;
      const callbackName = `__ramaniQrJsonp_${Date.now()}_${callbackCounter}`;
      const url = new URL(API_URL);
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      });
      url.searchParams.set('callback', callbackName);
      url.searchParams.set('_', Date.now().toString());

      const script = document.createElement('script');
      let settled = false;

      const cleanup = () => {
        clearTimeout(timer);
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      };

      window[callbackName] = (data) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (data && (data.ok === true || data.success === true)) resolve(data);
        else reject(new Error((data && (data.error || data.message)) || 'Tracking service returned an error.'));
      };

      script.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Could not reach the tracking service. Check the Apps Script deployment and internet connection.'));
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Tracking service timed out. Please try again.'));
      }, timeoutMs);

      script.src = url.toString();
      script.async = true;
      document.head.appendChild(script);
    });
  }

  window.RamaniQrApi = {
    health: () => jsonp({ action: 'health' }),
    checkName: (name) => jsonp({ action: 'checkName', name }),
    register: ({ qrName, qrType, payload }) => jsonp({ action: 'register', qrName, qrType, payload }),
    scan: (id) => jsonp({ action: 'scan', id }),
    analytics: () => jsonp({ action: 'analytics' }),
    details: (name) => jsonp({ action: 'details', name })
  };
})();
