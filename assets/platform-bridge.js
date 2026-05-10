(function () {
  const pending = new Map();
  let requestSeq = 0;
  const KNOWN_HANDLERS = [
    'appEvent',
    'requestNotificationPermission',
    'showNotification',
    'registerServiceWorker',
    'openExternal'
  ];

  function hasNativeHandler(name) {
    try {
      return !!(
        window.webkit &&
        window.webkit.messageHandlers &&
        window.webkit.messageHandlers[name] &&
        typeof window.webkit.messageHandlers[name].postMessage === 'function'
      );
    } catch (_) {
      return false;
    }
  }

  function postToNative(name, payload) {
    if (!hasNativeHandler(name)) return false;
    try {
      window.webkit.messageHandlers[name].postMessage(payload || {});
      return true;
    } catch (err) {
      console.warn('Native bridge post failed:', name, err);
      return false;
    }
  }

  function nextRequestId() {
    requestSeq += 1;
    return 'req:' + Date.now().toString(36) + ':' + requestSeq.toString(36);
  }

  function settlePending(requestId, result) {
    const entry = pending.get(requestId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    pending.delete(requestId);
    entry.resolve(result);
    return true;
  }

  function rejectPending(requestId, error) {
    const entry = pending.get(requestId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    pending.delete(requestId);
    entry.reject(error instanceof Error ? error : new Error(String(error || 'Unknown bridge error')));
    return true;
  }

  function parseTimeoutMs(raw, fallbackMs) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallbackMs;
    return Math.min(n, 30000);
  }

  function callNativeWithAck(handlerName, payload, options) {
    const opts = options || {};
    if (!hasNativeHandler(handlerName)) {
      return Promise.resolve({ sent: false, ok: false, reason: 'handler-missing' });
    }

    const requestId = nextRequestId();
    const timeoutMs = parseTimeoutMs(opts.timeoutMs, 5000);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        resolve({
          sent: true,
          ok: !!opts.defaultOkOnTimeout,
          timeout: true,
          requestId,
        });
      }, timeoutMs);

      pending.set(requestId, { resolve, reject, timer });

      const posted = postToNative(handlerName, Object.assign({}, payload || {}, {
        requestId,
        expectsResponse: true,
        ts: Date.now(),
      }));

      if (!posted) {
        clearTimeout(timer);
        pending.delete(requestId);
        resolve({ sent: false, ok: false, reason: 'post-failed', requestId });
      }
    });
  }

  const bridge = window.platformBridge || {};

  bridge.isNativeHost = function isNativeHost() {
    try {
      return !!(window.webkit && window.webkit.messageHandlers);
    } catch (_) {
      return false;
    }
  };

  bridge.hasHandler = hasNativeHandler;
  bridge.knownHandlers = KNOWN_HANDLERS.slice();

  bridge.getDiagnostics = function getDiagnostics() {
    let detected = [];
    try {
      const handlers = (window.webkit && window.webkit.messageHandlers) ? window.webkit.messageHandlers : null;
      if (handlers && typeof handlers === 'object') {
        detected = Object.keys(handlers);
      }
    } catch (_) {
      detected = [];
    }

    const statusByKnown = {};
    KNOWN_HANDLERS.forEach((name) => {
      statusByKnown[name] = hasNativeHandler(name);
    });

    const missingKnown = KNOWN_HANDLERS.filter((name) => !statusByKnown[name]);

    return {
      bridgeLoaded: true,
      isNativeHost: bridge.isNativeHost(),
      knownHandlers: KNOWN_HANDLERS.slice(),
      detectedHandlers: detected,
      statusByKnown,
      missingKnownHandlers: missingKnown,
      pendingRequestCount: pending.size,
      hasResolveEntrypoint: typeof window.__timescapeBridgeResolve === 'function',
      ts: Date.now(),
    };
  };

  bridge.callNativeWithAck = callNativeWithAck;

  bridge.resolveNativeResponse = function resolveNativeResponse(response) {
    const msg = response && typeof response === 'object' ? response : {};
    const requestId = msg.requestId;
    if (!requestId) return false;

    if (msg.error) {
      return rejectPending(requestId, msg.error);
    }

    const result = {
      sent: true,
      ok: typeof msg.ok === 'boolean' ? msg.ok : true,
      status: msg.status || '',
      value: msg.value,
      requestId,
      raw: msg,
    };
    return settlePending(requestId, result);
  };

  bridge.rejectNativeResponse = function rejectNativeResponse(requestId, error) {
    if (!requestId) return false;
    return rejectPending(requestId, error || 'Bridge request rejected');
  };

  // Convenience host entrypoint for WKWebView evaluateJavaScript calls.
  window.__timescapeBridgeResolve = bridge.resolveNativeResponse;

  bridge.emit = function emit(eventName, payload) {
    return postToNative('appEvent', {
      event: eventName || 'unknown',
      payload: payload || {},
      ts: Date.now(),
    });
  };

  bridge.requestNotificationPermission = async function requestNotificationPermission() {
    const resp = await callNativeWithAck(
      'requestNotificationPermission',
      {},
      { timeoutMs: 5000, defaultOkOnTimeout: true }
    );
    if (resp.sent) return !!resp.ok;

    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch (_) {
      return false;
    }
  };

  bridge.showNotification = async function showNotification(title, options) {
    const resp = await callNativeWithAck(
      'showNotification',
      { title: title || 'Reminder', options: options || {} },
      { timeoutMs: 4000, defaultOkOnTimeout: true }
    );
    return !!(resp && resp.sent && resp.ok);
  };

  bridge.registerServiceWorker = async function registerServiceWorker(swPath) {
    const resp = await callNativeWithAck(
      'registerServiceWorker',
      { path: swPath || './sw.js' },
      { timeoutMs: 5000, defaultOkOnTimeout: true }
    );
    if (resp.sent) return !!resp.ok;

    if (!('serviceWorker' in navigator)) return false;
    try {
      await navigator.serviceWorker.register(swPath || './sw.js');
      return true;
    } catch (_) {
      return false;
    }
  };

  bridge.openExternal = async function openExternal(url) {
    const target = url || '';
    if (!target) return false;

    const resp = await callNativeWithAck(
      'openExternal',
      { url: target },
      { timeoutMs: 3000, defaultOkOnTimeout: true }
    );
    if (resp.sent) return !!resp.ok;

    try {
      window.open(target, '_blank', 'noopener');
      return true;
    } catch (_) {
      return false;
    }
  };

  window.platformBridge = bridge;
})();
