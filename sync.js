// sync.js – Couchbase Capella sync for TimeScape Planner
// Pulls data from /api/sync/:collection and merges with localStorage,
// then pushes all local items back so Capella stays current.
// Runs on page load and whenever localStorage data is saved.
(function () {
  const COLLECTIONS = ['events', 'tasks', 'taskCategories'];
  const SYNC_INTERVAL_MS = 5 * 60 * 1000; // background poll every 5 minutes

  // -------------------------------------------------------------------------
  // Merge helpers
  // -------------------------------------------------------------------------

  function safeParse(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
  }

  // Merge remote array into local array by id, remote wins on conflict.
  // Returns merged array and whether any remote-only items were added.
  function mergeItems(local, remote) {
    const byId = {};
    local.forEach(item => { if (item && item.id) byId[item.id] = item; });
    let changed = false;
    remote.forEach(item => {
      if (!item) return;
      const id = item.id || item._id;
      if (!id) return;
      // Normalise _id -> id
      const normalised = Object.assign({}, item, { id });
      delete normalised._id;
      if (!byId[id]) changed = true;
      byId[id] = normalised;
    });
    return { merged: Object.values(byId), changed };
  }

  // Detect whether we are running with a backend server (server.js).
  // On static hosts (e.g. GitHub Pages) the /api/* paths return 404 HTML.
  let _hasServer = null; // null = unknown, true/false after first check

  async function hasServer() {
    if (_hasServer !== null) return _hasServer;
    try {
      const resp = await fetch('/api/sync/' + COLLECTIONS[0]);
      // server.js always returns JSON; a static host returns HTML 404
      const ct = (resp.headers.get('content-type') || '');
      _hasServer = ct.includes('application/json');
    } catch (_) {
      _hasServer = false;
    }
    return _hasServer;
  }

  async function syncCollection(name) {
    // Skip if no backend server is available (static hosting)
    if (!(await hasServer())) return;

    // 1. Fetch remote items
    let remote = [];
    try {
      const resp = await fetch(`/api/sync/${name}`);
      if (!resp.ok) return; // server returned error (e.g. 503 – sync not configured)
      const data = await resp.json();
      remote = Array.isArray(data.items) ? data.items : [];
    } catch (_) {
      return; // network error – skip silently
    }

    // 2. Merge remote into local
    const local = safeParse(name);
    const { merged, changed } = mergeItems(local, remote);
    if (changed) {
      localStorage.setItem(name, JSON.stringify(merged));
    }

    // 3. Push merged set back to server (upsert all local items)
    try {
      await fetch(`/api/sync/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
    } catch (_) {
      // push failed – fine, will retry next time
    }

    return changed;
  }

  // -------------------------------------------------------------------------
  // Run a full sync across all collections
  // -------------------------------------------------------------------------

  async function syncAll() {
    let anyChanged = false;
    for (const name of COLLECTIONS) {
      const changed = await syncCollection(name);
      if (changed) anyChanged = true;
    }
    if (anyChanged) {
      window.dispatchEvent(new CustomEvent('app:data:updated'));
    }
  }

  // -------------------------------------------------------------------------
  // Push a single collection immediately (called after local save)
  // -------------------------------------------------------------------------

  async function pushCollection(name) {
    if (!COLLECTIONS.includes(name)) return;
    if (!(await hasServer())) return; // skip on static hosts
    const items = safeParse(name);
    try {
      await fetch(`/api/sync/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      });
    } catch (_) { /* ignore */ }
  }

  // -------------------------------------------------------------------------
  // Hook into localStorage writes to trigger an immediate push
  // -------------------------------------------------------------------------

  const _originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    _originalSetItem(key, value);
    if (COLLECTIONS.includes(key)) {
      pushCollection(key);
    }
  };

  // -------------------------------------------------------------------------
  // Init: sync on load, then poll in the background
  // -------------------------------------------------------------------------

  function init() {
    syncAll();
    setInterval(syncAll, SYNC_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  // Expose for manual use / debugging
  window.appSync = { syncAll, syncCollection, pushCollection };
})();
