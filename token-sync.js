// token-sync.js – Simple shared-token sync for TimeScape Planner
// Both devices share a short token. Every 30 s each device fetches each
// collection from the server, merges with local data, and pushes back.
// Works independently of the Couchbase Capella sync (sync.js).
(function () {
  const COLLECTIONS = ['events', 'tasks', 'taskCategories', 'reminders', 'inbox'];
  const SYNC_INTERVAL_MS = 30 * 1000;
  const TOKEN_KEY = 'tokenSyncKey';

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function safeParse(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
  }

  // Merge two arrays by id (remote items that are missing locally get added).
  function mergeArrays(local, remote) {
    if (!Array.isArray(local)) local = [];
    if (!Array.isArray(remote)) return { merged: local, changed: false };
    const byId = {};
    local.forEach(item => { if (item && item.id) byId[item.id] = item; });
    let changed = false;
    remote.forEach(item => {
      if (!item) return;
      const id = item.id || item._id;
      if (!id) return;
      const normalised = Object.assign({}, item, { id });
      delete normalised._id;
      if (!byId[id]) changed = true;
      byId[id] = normalised;
    });
    return { merged: Object.values(byId), changed };
  }

  // Merge two plain objects by key (e.g. reminders map keyed by date).
  function mergeObjects(local, remote) {
    if (!local || typeof local !== 'object' || Array.isArray(local)) local = {};
    if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return { merged: local, changed: false };
    const merged = Object.assign({}, local);
    let changed = false;
    Object.keys(remote).forEach(k => {
      if (!Object.prototype.hasOwnProperty.call(local, k)) changed = true;
      merged[k] = remote[k];
    });
    return { merged, changed };
  }

  // -------------------------------------------------------------------------
  // Guard flag – prevents re-entrant pushes triggered by our own setItem calls
  // -------------------------------------------------------------------------

  let _merging = false;

  // Detect whether we are running with a backend server (server.js).
  // On static hosts (e.g. GitHub Pages) the /api/* paths return 404 HTML.
  let _hasServer = null; // null = unknown, true/false after first check

  async function hasServer() {
    if (_hasServer !== null) return _hasServer;
    try {
      const token = getToken();
      if (!token) { _hasServer = false; return false; }
      const resp = await fetch(`/api/token-sync/${encodeURIComponent(token)}/${COLLECTIONS[0]}`);
      const ct = (resp.headers.get('content-type') || '');
      _hasServer = ct.includes('application/json');
    } catch (_) {
      _hasServer = false;
    }
    return _hasServer;
  }

  // -------------------------------------------------------------------------
  // Core sync
  // -------------------------------------------------------------------------

  async function syncCollection(name) {
    const token = getToken();
    if (!token) return;

    // Skip if no backend server is available (static hosting)
    if (!(await hasServer())) return;

    // 1. Fetch remote value
    let remote;
    try {
      const resp = await fetch(`/api/token-sync/${encodeURIComponent(token)}/${name}`);
      if (!resp.ok) return;
      const json = await resp.json();
      remote = json.value; // may be null if nothing stored yet
    } catch (_) {
      return; // network error – skip silently
    }

    // 2. Merge remote into local
    const local = safeParse(name);
    let merged, changed;

    if (remote === null || remote === undefined) {
      // Nothing on server yet – just push local
      merged = local;
      changed = false;
    } else if (name === 'reminders') {
      ({ merged, changed } = mergeObjects(local, remote));
    } else {
      ({ merged, changed } = mergeArrays(local, remote));
    }

    if (changed && merged !== null && merged !== undefined) {
      _merging = true;
      try {
        localStorage.setItem(name, JSON.stringify(merged));
      } finally {
        _merging = false;
      }
      window.dispatchEvent(new CustomEvent('token-sync:updated', { detail: { collection: name } }));
    }

    // 3. Push merged (or local) value back to server
    const pushValue = (merged !== null && merged !== undefined) ? merged : local;
    if (pushValue !== null && pushValue !== undefined) {
      try {
        await fetch(`/api/token-sync/${encodeURIComponent(token)}/${name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: pushValue }),
        });
      } catch (_) { /* push failed – will retry */ }
    }

    return changed;
  }

  async function syncAll() {
    const token = getToken();
    if (!token) return;
    let anyChanged = false;
    for (const name of COLLECTIONS) {
      const changed = await syncCollection(name);
      if (changed) anyChanged = true;
    }
    if (anyChanged) {
      window.dispatchEvent(new CustomEvent('app:data:updated'));
    }
    window.dispatchEvent(new CustomEvent('token-sync:done'));
  }

  // -------------------------------------------------------------------------
  // Immediate push on localStorage write
  // -------------------------------------------------------------------------

  async function pushCollection(name) {
    const token = getToken();
    if (!token || !COLLECTIONS.includes(name)) return;
    if (_hasServer === false) return; // skip on static hosts
    const value = safeParse(name);
    if (value === null) return;
    try {
      await fetch(`/api/token-sync/${encodeURIComponent(token)}/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
    } catch (_) { /* ignore */ }
  }

  // Hook localStorage.setItem to push immediately after any local save.
  const _originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    _originalSetItem(key, value);
    if (!_merging && COLLECTIONS.includes(key) && getToken()) {
      pushCollection(key);
    }
  };

  // -------------------------------------------------------------------------
  // Lifecycle: start / stop
  // -------------------------------------------------------------------------

  let _interval = null;

  function start() {
    if (_interval) clearInterval(_interval);
    window.dispatchEvent(new CustomEvent('token-sync:started'));
    syncAll();
    _interval = setInterval(syncAll, SYNC_INTERVAL_MS);
  }

  function stop() {
    if (_interval) { clearInterval(_interval); _interval = null; }
    window.dispatchEvent(new CustomEvent('token-sync:stopped'));
  }

  function setToken(token) {
    if (token) {
      _originalSetItem('tokenSyncKey', token);
      start();
    } else {
      _originalSetItem.call(localStorage, 'tokenSyncKey', '');
      stop();
    }
  }

  // Auto-start on page load if a token is already saved
  function init() {
    if (getToken()) start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  // Public API
  window.tokenSync = { start, stop, setToken, syncAll, syncCollection, pushCollection };
})();
