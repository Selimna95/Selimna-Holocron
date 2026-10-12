/* Shared browser state and guarded platform APIs. Loaded before legacy modules. */
(function initHolocronGuards(global) {
  'use strict';

  global.HOLOCRON_STATE = global.HOLOCRON_STATE || {
    account: null,
    preferences: { relayUrl: '' },
    ui: { activePage: 'dashboard' },
    cache: Object.create(null),
    requests: Object.create(null),
  };

  function storageAdapter(area) {
    return {
      getItem(key) {
        try { return global[area].getItem(String(key)) || ''; } catch (_) { return ''; }
      },
      setItem(key, value) {
        try { global[area].setItem(String(key), String(value)); return true; } catch (_) { return false; }
      },
      removeItem(key) {
        try { global[area].removeItem(String(key)); return true; } catch (_) { return false; }
      },
    };
  }

  global.DEFAULT_RELAY_URL = 'https://swgoh-optimizer-relay.lorg75017.workers.dev';

  global.esc = global.esc || function esc(value) {
    return String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
  };

  global.safeUrl = function safeUrl(value, base = global.location.href) {
    try {
      const url = new URL(String(value ?? '').trim(), base);
      if (url.protocol !== 'https:') return '';
      return global.esc(url.href);
    } catch (_) { return ''; }
  };

  global.normalizeRelayUrl = function normalizeRelayUrl(value) {
    try {
      const url = new URL(String(value ?? '').trim());
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.username || url.password || !url.host || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) return '';
      url.hash = '';
      return url.href.replace(/\/$/, '');
    } catch (_) { return ''; }
  };

  global.safeStorage = global.safeStorage || storageAdapter('localStorage');
  global.safeSessionStorage = global.safeSessionStorage || storageAdapter('sessionStorage');

  global.holoFetch = async function holoFetch(input, options = {}, timeoutMs = 12000) {
    const timeout = Number(options.timeoutMs || timeoutMs);
    const requestOptions = { ...options };
    delete requestOptions.timeoutMs;
    const controller = new AbortController();
    const externalSignal = requestOptions.signal;
    requestOptions.signal = controller.signal;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort(externalSignal.reason);
      else externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
    }
    const timer = setTimeout(() => controller.abort(new DOMException('Délai réseau dépassé', 'TimeoutError')), timeout);
    try {
      return await fetch(input, requestOptions);
    } finally {
      clearTimeout(timer);
    }
  };
})(window);
