if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(error => console.warn('[Holocron] Service worker indisponible :', error)));
}
