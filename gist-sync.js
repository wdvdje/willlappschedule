// gist-sync.js – GitHub Gist sync for TimeScape Planner
// Syncs all app data via a private GitHub Gist using the user's existing GitHub account.
// No extra account or server needed. Just a GitHub Personal Access Token with 'gist' scope.
//
// Setup (once, on each device):
//   1. Go to https://github.com/settings/tokens/new
//   2. Name it, check the 'gist' scope, click Generate token
//   3. Paste the token in Settings → GitHub Sync on this page
//   4. Click "Save & Sync" — a private Gist is created automatically (or found if one already exists)
//   5. On your second device: paste the SAME token and click "Save & Sync" — it will find the same Gist
//
// API: window.gistSync.sync()   – full push+pull cycle
//      window.gistSync.push()   – push local data to Gist only
//      window.gistSync.pull()   – pull from Gist and merge into localStorage only
(function () {
  'use strict';

  const STORAGE_KEYS = [
    'events', 'tasks', 'taskCategories',
    'reminders', 'jobs', 'inbox',
    'USER_PROFILE', 'userName', 'userHome',
    'personalBuckets', 'homeBuckets',
    'personalMeals', 'personalCalorieGoal',
    'personalSleep', 'personalGym',
    'personalFocus', 'personalRoutines', 'personalRoutineLog',
    'personalHydration', 'personalMood',
    'personalMealFavorites', 'personalMealPrepLog',
  ];
  const GIST_FILENAME  = 'timescape-data.json';
  const SYNC_INTERVAL_MS = 5 * 60 * 1000; // background poll every 5 minutes
  const PUSH_DEBOUNCE_MS = 2000;           // debounce fast consecutive writes

  let _syncing     = false;
  let _applying    = false; // true while applyRemote is writing localStorage – prevents push loop
  let _intervalId  = null;
  let _pushTimer   = null;

  // -------------------------------------------------------------------------
  // localStorage helpers
  // -------------------------------------------------------------------------

  function getToken()  { return localStorage.getItem('gistSyncToken') || ''; }
  function getGistId() { return localStorage.getItem('gistSyncId')    || ''; }

  function safeParse(str) {
    try { return JSON.parse(str); } catch (e) { return null; }
  }

  // Collect all app data from localStorage into a plain object for upload.
  function collectLocal() {
    var data = {};
    STORAGE_KEYS.forEach(function (key) {
      var raw = localStorage.getItem(key);
      if (raw !== null) {
        var parsed = safeParse(raw);
        data[key] = (parsed !== null) ? parsed : raw;
      }
    });
    data._syncedAt = Date.now();
    return data;
  }

  // -------------------------------------------------------------------------
  // Merge helpers
  // -------------------------------------------------------------------------

  // Merge two arrays whose items have an 'id' field.
  // The item with the newer 'updated'/'created' timestamp wins; remote wins on tie.
  // Items without an id are preserved (appended) so they are not silently dropped.
  function mergeArrayById(local, remote) {
    if (!Array.isArray(remote)) return Array.isArray(local) ? local : [];
    if (!Array.isArray(local))  return remote;
    var map = {};
    var localNoId = [];
    var remoteNoId = [];
    local.forEach(function (item) {
      if (!item) return;
      var id = item.id || item._id;
      if (id) {
        map[id] = item;
      } else {
        localNoId.push(item);
      }
    });
    remote.forEach(function (item) {
      if (!item) return;
      var id = item.id || item._id;
      if (!id) {
        remoteNoId.push(item);
        return;
      }
      if (!map[id]) {
        map[id] = item;
      } else {
        var localTs  = map[id].updated  || map[id].created  || 0;
        var remoteTs = item.updated     || item.created     || 0;
        if (remoteTs >= localTs) map[id] = item; // remote wins on tie
      }
    });
    // Preserve items without IDs from both sides (legacy items created before IDs were added).
    // Deduplicate by JSON content to avoid duplicating the same item.
    var noIdSeen = {};
    var noIdItems = [];
    localNoId.concat(remoteNoId).forEach(function (item) {
      var key = JSON.stringify(item);
      if (!noIdSeen[key]) { noIdSeen[key] = true; noIdItems.push(item); }
    });
    return Object.values(map).concat(noIdItems);
  }

  // Apply a remote data snapshot into localStorage, merging where appropriate.
  function applyRemote(remote) {
    if (!remote || typeof remote !== 'object') return;

    var remoteSyncedAt = remote._syncedAt || 0;
    var localSyncedAt  = parseInt(localStorage.getItem('gistSyncedAt') || '0', 10);

    _applying = true;
    try {
      // Array collections – merge by id
      ['events', 'tasks', 'taskCategories', 'jobs', 'inbox', 'personalBuckets', 'homeBuckets'].forEach(function (key) {
        if (!(key in remote)) return;
        var localRaw = localStorage.getItem(key);
        var localArr = localRaw ? (safeParse(localRaw) || []) : [];
        var merged   = mergeArrayById(localArr, remote[key]);
        localStorage.setItem(key, JSON.stringify(merged));
      });

      // reminders – object keyed by date string
      // Remote date-keys win only when the remote snapshot is as new or newer than the last local sync,
      // so a locally-added reminder created after the last sync is not lost.
      if (remote.reminders && typeof remote.reminders === 'object' && !Array.isArray(remote.reminders)) {
        var localRemRaw = localStorage.getItem('reminders');
        var localRem    = (localRemRaw ? safeParse(localRemRaw) : null) || {};
        var mergedRem   = Object.assign({}, localRem);
        Object.keys(remote.reminders).forEach(function (dateKey) {
          // Always add new date keys; only overwrite existing ones if remote is at least as recent
          if (!(dateKey in mergedRem) || remoteSyncedAt >= localSyncedAt) {
            mergedRem[dateKey] = remote.reminders[dateKey];
          }
        });
        localStorage.setItem('reminders', JSON.stringify(mergedRem));
      }

      // Scalar / object keys – remote wins if it is the same age or newer
      ['USER_PROFILE', 'userName', 'userHome',
       'personalMeals', 'personalCalorieGoal',
       'personalSleep', 'personalGym',
       'personalFocus', 'personalRoutines', 'personalRoutineLog',
       'personalHydration', 'personalMood',
       'personalMealFavorites', 'personalMealPrepLog'
      ].forEach(function (key) {
        if (!(key in remote)) return;
        if (remoteSyncedAt >= localSyncedAt) {
          var val = remote[key];
          localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
        }
      });
    } finally {
      _applying = false;
    }

    localStorage.setItem('gistSyncedAt', String(Date.now()));
    window.dispatchEvent(new CustomEvent('app:data:updated'));
  }

  // -------------------------------------------------------------------------
  // GitHub Gist API helpers
  // -------------------------------------------------------------------------

  async function apiRequest(method, path, body) {
    var token = getToken();
    if (!token) throw new Error('No GitHub token saved. Paste one in Settings → GitHub Sync.');
    var opts = {
      method: method,
      headers: {
        'Authorization':        'Bearer ' + token,
        'Accept':               'application/vnd.github+json',
        'Content-Type':         'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    var resp = await fetch('https://api.github.com' + path, opts);
    if (!resp.ok) {
      var text = await resp.text().catch(function () { return ''; });
      throw new Error('GitHub ' + resp.status + ': ' + text.slice(0, 200));
    }
    return resp.json();
  }

  // Search the authenticated user's Gists for one that contains GIST_FILENAME.
  // Returns the Gist ID string, or null if not found.
  async function findExistingGist() {
    var page = 1;
    while (true) {
      var list = await apiRequest('GET', '/gists?per_page=100&page=' + page);
      if (!Array.isArray(list) || list.length === 0) return null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].files && list[i].files[GIST_FILENAME]) return list[i].id;
      }
      if (list.length < 100) return null; // no more pages
      page++;
    }
  }

  async function createGist(data) {
    var result = await apiRequest('POST', '/gists', {
      description: 'TimeScape Planner sync data',
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } },
    });
    return result.id;
  }

  async function updateGist(gistId, data) {
    await apiRequest('PATCH', '/gists/' + gistId, {
      files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } },
    });
  }

  async function fetchGist(gistId) {
    var result = await apiRequest('GET', '/gists/' + gistId);
    var file   = result.files && result.files[GIST_FILENAME];
    if (!file) return null;
    var content = file.content;
    // GitHub truncates large files — fall back to raw_url
    if (file.truncated && file.raw_url) {
      var raw = await fetch(file.raw_url, {
        headers: { 'Authorization': 'Bearer ' + getToken() },
      });
      content = await raw.text();
    }
    return safeParse(content);
  }

  // -------------------------------------------------------------------------
  // Sync cycle: pull remote → merge into local → push merged result back
  // -------------------------------------------------------------------------

  async function sync() {
    if (_syncing) return;
    var token = getToken();
    if (!token) return;
    _syncing = true;
    setStatus('Syncing…');
    try {
      var gistId = getGistId();
      if (!gistId) {
        // First time on this device: look for an existing Gist before creating a new one
        setStatus('Looking for existing sync data…');
        gistId = await findExistingGist();
        if (gistId) {
          localStorage.setItem('gistSyncId', gistId);
          setStatus('Found existing Gist – syncing…');
          var remote = await fetchGist(gistId);
          if (remote) applyRemote(remote);
          await updateGist(gistId, collectLocal());
          setStatus('Synced ✓  ' + new Date().toLocaleTimeString());
        } else {
          // Truly the first device – create a brand-new Gist
          gistId = await createGist(collectLocal());
          localStorage.setItem('gistSyncId', gistId);
          setStatus('Gist created – sync complete ✓  ' + new Date().toLocaleTimeString());
        }
      } else {
        var remote = await fetchGist(gistId);
        if (remote) applyRemote(remote);
        // Push merged local state back
        await updateGist(gistId, collectLocal());
        setStatus('Synced ✓  ' + new Date().toLocaleTimeString());
      }
      // Show the Gist ID in UI so the second device can also use the same token
      var display = document.getElementById('gistSyncIdDisplay');
      if (display) display.textContent = localStorage.getItem('gistSyncId') || '';
    } catch (err) {
      console.error('[gist-sync]', err);
      setStatus('Error: ' + (err.message || String(err)));
    } finally {
      _syncing = false;
    }
  }

  // Push only (called after local writes are debounced)
  async function push() {
    var token  = getToken();
    var gistId = getGistId();
    if (!token || !gistId) return;
    try {
      await updateGist(gistId, collectLocal());
    } catch (err) {
      console.error('[gist-sync] background push failed:', err.message || err);
    }
  }

  // Pull only (triggered by the "Pull Now" button)
  async function pull() {
    var gistId = getGistId();
    if (!gistId) { setStatus('No Gist yet – click "Save & Sync" first'); return; }
    setStatus('Pulling…');
    try {
      var remote = await fetchGist(gistId);
      if (remote) { applyRemote(remote); setStatus('Pulled ✓  ' + new Date().toLocaleTimeString()); }
      else         { setStatus('No data found in Gist'); }
    } catch (err) {
      setStatus('Pull error: ' + (err.message || String(err)));
    }
  }

  // -------------------------------------------------------------------------
  // Hook localStorage writes → debounced push after any data change
  // -------------------------------------------------------------------------

  var _origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    _origSetItem(key, value);
    // Don't push when we ourselves are applying a remote snapshot (avoids a redundant push)
    if (!_applying && STORAGE_KEYS.includes(key) && getToken() && getGistId()) {
      clearTimeout(_pushTimer);
      _pushTimer = setTimeout(push, PUSH_DEBOUNCE_MS);
    }
  };

  // -------------------------------------------------------------------------
  // UI wiring
  // -------------------------------------------------------------------------

  function setStatus(msg) {
    var el = document.getElementById('gistSyncStatus');
    if (el) el.textContent = msg;
  }

  function wireUI() {
    var tokenInput  = document.getElementById('gistSyncToken');
    var idDisplay   = document.getElementById('gistSyncIdDisplay');
    var saveBtn     = document.getElementById('gistSyncSaveBtn');
    var pullBtn     = document.getElementById('gistSyncPullBtn');

    if (tokenInput) tokenInput.value = getToken();
    if (idDisplay)  idDisplay.textContent = getGistId() || '(none yet – will be created on first sync)';

    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var tok = (tokenInput ? tokenInput.value : '').trim();
        if (!tok) { setStatus('Paste your GitHub token first'); return; }
        _origSetItem('gistSyncToken', tok);
        if (_intervalId) clearInterval(_intervalId);
        await sync();
        _intervalId = setInterval(sync, SYNC_INTERVAL_MS);
      });
    }

    if (pullBtn) {
      pullBtn.addEventListener('click', pull);
    }
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  function init() {
    wireUI();
    if (getToken()) {
      sync();
      _intervalId = setInterval(sync, SYNC_INTERVAL_MS);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  // Public API
  window.gistSync = { sync: sync, push: push, pull: pull };
})();
