/* push client: register SW, subscribe/unsubscribe to PushManager, wire settings UI.
   - stores subscription JSON at localStorage key 'pushSubscription'
   - optional server endpoint configured in #pushServerUrl will receive POST { subscription, meta }
*/
(function () {
  const SW_PATH = './sw.js';
  const LS_KEY = 'pushSubscription';

  // helpers
  function el(id){ return document.getElementById(id); }
  function log(){ try { console.log.apply(console, arguments); } catch(e){} }

  // VAPID helper
  function urlBase64ToUint8Array(base64String) {
    if (!base64String) return null;
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  // store subscription locally
  function saveLocal(sub) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(sub)); } catch(e){}
  }
  function clearLocal() { localStorage.removeItem(LS_KEY); }
  function getLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch(e){ return null; }
  }

  // post subscription to server (if configured)
  async function postSubscription(serverUrl, subscription) {
    if (!serverUrl) return;
    try {
      await fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, meta: { client: 'willlappschedule' } }),
      });
    } catch (e) {
      log('push: failed to POST subscription', e);
    }
  }

  // register service worker
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register(SW_PATH);
      log('push: SW registered', reg);
      return reg;
    } catch (e) {
      log('push: SW register failed', e);
      return null;
    }
  }

  // get active service worker registration (or register)
  async function getRegistration() {
    if (!('serviceWorker' in navigator)) return null;
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await registerSW();
    return reg;
  }

  // subscribe
  async function subscribePush(vapidKey) {
    if (!('Notification' in window) || !('PushManager' in window)) throw new Error('Push not supported in this browser');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notification permission denied');

    const reg = await getRegistration();
    if (!reg || !reg.pushManager) throw new Error('Service worker registration / pushManager not available');

    const options = {};
    if (vapidKey) options.applicationServerKey = urlBase64ToUint8Array(vapidKey);
    options.userVisibleOnly = true;

    const sub = await reg.pushManager.subscribe(options);
    saveLocal(sub);
    const serverUrl = (el('pushServerUrl') && el('pushServerUrl').value) || '';
    await postSubscription(serverUrl, sub);
    return sub;
  }

  // unsubscribe
  async function unsubscribePush() {
    const reg = await getRegistration();
    if (!reg || !reg.pushManager) return false;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) { clearLocal(); return true; }
    const ok = await sub.unsubscribe();
    clearLocal();
    return ok;
  }

  // update UI status
  function updateStatusUI() {
    const statusEl = el('pushStatus');
    const sub = getLocal();
    if (!statusEl) return;
    if (Notification && Notification.permission === 'denied') {
      statusEl.textContent = 'Permission denied';
      return;
    }
    if (sub) statusEl.textContent = 'Subscribed';
    else statusEl.textContent = 'Not subscribed';
  }

  // wire settings buttons
  async function wireUi() {
    const subBtn = el('subscribePushBtn');
    const unsubBtn = el('unsubscribePushBtn');
    // show current status
    updateStatusUI();

    if (subBtn) subBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const vapid = (el('pushVapidKey') && el('pushVapidKey').value) || '';
        await registerSW(); // ensure SW registered
        const sub = await subscribePush(vapid);
        log('push: subscribed', sub);
        updateStatusUI();
      } catch (err) {
        log('push: subscribe error', err);
        alert('Subscribe failed: ' + (err && err.message ? err.message : err));
        updateStatusUI();
      }
    });

    if (unsubBtn) unsubBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await unsubscribePush();
        updateStatusUI();
      } catch (err) {
        log('push: unsubscribe error', err);
        alert('Unsubscribe failed: ' + (err && err.message ? err.message : err));
      }
    });
  }

  // initialize: register SW (non-blocking) and wire UI when DOM ready
  (function init() {
    if ('serviceWorker' in navigator) {
      // try to register early but ignore errors
      registerSW().catch(()=>{});
    }
    document.addEventListener('DOMContentLoaded', () => {
      wireUi();
      updateStatusUI();
    });
  })();

  // expose helpers for debugging
  window.pushClient = {
    registerSW, subscribePush, unsubscribePush, getLocalSubscription: getLocal
  };
})();
