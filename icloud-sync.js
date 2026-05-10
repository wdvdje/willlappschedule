/* icloud-sync.js — iCloud Drive sync via File System Access API
 *
 * Tier 1 — macOS Safari (showDirectoryPicker available):
 *   Auto-writes timescape-data.json to a chosen iCloud Drive folder on every
 *   data change (debounced). Auto-reads + merges on page load.
 *
 * Tier 2 — iOS/iPadOS or any browser with showOpenFilePicker, or any browser
 *   without any File System Access API (falls back to <input type="file">):
 *   Manual export (download JSON → iOS Files/iCloud Drive) and import
 *   (pick file from Files/iCloud Drive).
 *
 * Both tiers call buildExportPayload() from app.js for export, and apply
 * imported data directly via the global setter functions (setEvents, setTasks,
 * etc.) also defined in app.js.
 *
 * window.icloudSync is the public API.
 */
(function () {
  'use strict';

  var FILENAME    = 'timescape-data.json';
  var IDB_NAME    = 'timescape-icloud';
  var IDB_STORE   = 'handles';
  var HANDLE_KEY  = 'folderHandle';

  /*
   * Minimum ms difference between remote exportedAt and local lastWritten
   * before we treat the remote file as meaningfully newer.  This guards
   * against clock-skew between devices and the small delay between
   * buildExportPayload() and actually finishing the write.
   */
  var NEWER_THRESHOLD_MS = 5000;

  /* ── IndexedDB helpers (idb-keyval pattern, no library) ── */

  function openIDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function (e) {
        e.target.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  }

  function idbGet(key) {
    return openIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  function idbSet(key, value) {
    return openIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(IDB_STORE, 'readwrite');
        var req = tx.objectStore(IDB_STORE).put(value, key);
        req.onsuccess = function () { resolve(); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  function idbDel(key) {
    return openIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(IDB_STORE, 'readwrite');
        var req = tx.objectStore(IDB_STORE).delete(key);
        req.onsuccess = function () { resolve(); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  /* ── Capability detection ── */

  function hasDirPicker()  { return typeof window.showDirectoryPicker  === 'function'; }
  function hasFilePicker() { return typeof window.showOpenFilePicker   === 'function'; }

  /* Returns current tier:
   *   'macos'  — showDirectoryPicker available → full folder auto-sync (Tier 1)
   *   'ios'    — showOpenFilePicker available  → manual file picker (Tier 2)
   *   'basic'  — neither API present           → <input type="file"> fallback (Tier 2)
   *
   * The 'ios' and 'basic' tiers use identical UI; the distinction is only
   * used internally so that importFile() can choose the right picker.
   */
  function detectTier() {
    if (hasDirPicker())  return 'macos';
    if (hasFilePicker()) return 'ios';
    return 'basic';
  }

  /* ── Status / UI helpers ── */

  function el(id) { return document.getElementById(id); }

  function updateStatusUI() {
    var tier       = detectTier();
    var folderName = localStorage.getItem('icloudFolderName')   || '';
    var lastWrite  = localStorage.getItem('icloudLastWritten')  || '';
    var lastExp    = localStorage.getItem('icloudLastExported') || '';
    var lastImp    = localStorage.getItem('icloudLastImported') || '';

    var macSection  = el('icloudMacSection');
    var iosSection  = el('icloudIosSection');
    var noApiSection= el('icloudNoApiSection');
    var macStatus   = el('icloudMacStatus');
    var iosStatus   = el('icloudIosStatus');

    /* Nothing to update — UI not in DOM yet */
    if (!macSection && !iosSection && !noApiSection) return;

    if (tier === 'macos') {
      if (macSection)   macSection.style.display   = '';
      if (iosSection)   iosSection.style.display   = 'none';
      if (noApiSection) noApiSection.style.display = 'none';
      if (macStatus) {
        if (folderName) {
          macStatus.textContent = '📁\u202F' + folderName +
            (lastWrite ? '\u2002·\u2002Last synced: ' + new Date(lastWrite).toLocaleTimeString() : '');
          macStatus.style.color = '#27ae60';
        } else {
          macStatus.textContent = 'No folder connected.';
          macStatus.style.color = '#666';
        }
      }
    } else if (tier === 'ios' || tier === 'basic') {
      /* Both 'ios' (showOpenFilePicker) and 'basic' (input fallback) use the
       * same manual export/import UI. The 'basic' tier also shows a note
       * about the lack of native iCloud Drive integration. */
      if (macSection)   macSection.style.display   = 'none';
      if (iosSection)   iosSection.style.display   = '';
      if (noApiSection) noApiSection.style.display = (tier === 'basic') ? '' : 'none';
      if (iosStatus) {
        var parts = [];
        if (lastExp) parts.push('Last exported: ' + new Date(lastExp).toLocaleTimeString());
        if (lastImp) parts.push('Last imported: ' + new Date(lastImp).toLocaleTimeString());
        iosStatus.textContent = parts.join('\u2002·\u2002');
        iosStatus.style.color = '#666';
      }
    } else {
      if (macSection)   macSection.style.display   = 'none';
      if (iosSection)   iosSection.style.display   = 'none';
      if (noApiSection) noApiSection.style.display = '';
    }
  }

  /* ── Re-authorize prompt ── */

  function showReauthPrompt() {
    var p = el('icloudReauthPrompt');
    if (p) p.style.display = '';
  }

  function hideReauthPrompt() {
    var p = el('icloudReauthPrompt');
    if (p) p.style.display = 'none';
  }

  /* ── Permission helpers ── */

  function queryPerm(handle, mode) {
    if (!handle || typeof handle.queryPermission !== 'function') return Promise.resolve('denied');
    return handle.queryPermission({ mode: mode }).catch(function () { return 'denied'; });
  }

  function requestPerm(handle, mode) {
    if (!handle || typeof handle.requestPermission !== 'function') return Promise.resolve('denied');
    return handle.requestPermission({ mode: mode }).catch(function () { return 'denied'; });
  }

  /* ── Core Tier-1 (macOS) functions ── */

  function connectFolder() {
    if (!hasDirPicker()) return Promise.resolve(null);
    return window.showDirectoryPicker({ mode: 'readwrite' }).then(function (handle) {
      return idbSet(HANDLE_KEY, handle).then(function () {
        localStorage.setItem('icloudFolderName', handle.name);
        hideReauthPrompt();
        updateStatusUI();
        return writeToFolder().then(function () {
          updateStatusUI();
          return handle;
        });
      });
    }).catch(function (e) {
      if (e && e.name !== 'AbortError') console.warn('iCloud Sync: connectFolder error', e);
      return null;
    });
  }

  function getStoredHandle() {
    return idbGet(HANDLE_KEY).catch(function () { return null; });
  }

  function writeToFolder(data) {
    return getStoredHandle().then(function (handle) {
      if (!handle) return false;
      return queryPerm(handle, 'readwrite').then(function (perm) {
        if (perm === 'prompt') {
          return requestPerm(handle, 'readwrite').then(function (p) {
            if (p !== 'granted') { showReauthPrompt(); return false; }
            return _doWrite(handle, data);
          });
        }
        if (perm !== 'granted') {
          return idbDel(HANDLE_KEY).then(function () {
            localStorage.removeItem('icloudFolderName');
            updateStatusUI();
            return false;
          });
        }
        return _doWrite(handle, data);
      });
    }).catch(function (e) {
      console.warn('iCloud Sync: writeToFolder error', e);
      return false;
    });
  }

  function _doWrite(handle, data) {
    var payload = data || (typeof buildExportPayload === 'function' ? buildExportPayload() : null);
    if (!payload) return Promise.resolve(false);
    return handle.getFileHandle(FILENAME, { create: true }).then(function (fh) {
      return fh.createWritable().then(function (w) {
        return w.write(JSON.stringify(payload, null, 2)).then(function () {
          return w.close();
        });
      });
    }).then(function () {
      localStorage.setItem('icloudLastWritten', new Date().toISOString());
      updateStatusUI();
      return true;
    }).catch(function (e) {
      console.warn('iCloud Sync: _doWrite error', e);
      return false;
    });
  }

  function readFromFolder() {
    return getStoredHandle().then(function (handle) {
      if (!handle) return null;
      return queryPerm(handle, 'readwrite').then(function (perm) {
        if (perm === 'prompt') { showReauthPrompt(); return null; }
        if (perm !== 'granted') return null;
        return handle.getFileHandle(FILENAME).then(function (fh) {
          return fh.getFile().then(function (file) {
            return file.text().then(function (text) {
              return JSON.parse(text);
            });
          });
        }).catch(function (e) {
          if (e && e.name !== 'NotFoundError') console.warn('iCloud Sync: readFromFolder error', e);
          return null;
        });
      });
    });
  }

  function disconnectFolder() {
    return idbDel(HANDLE_KEY).then(function () {
      localStorage.removeItem('icloudFolderName');
      localStorage.removeItem('icloudLastWritten');
      hideReauthPrompt();
      updateStatusUI();
    }).catch(function () {
      localStorage.removeItem('icloudFolderName');
      localStorage.removeItem('icloudLastWritten');
      hideReauthPrompt();
      updateStatusUI();
    });
  }

  /* ── Tier-2 (iOS) file exchange ── */

  function exportFile() {
    if (typeof buildExportPayload !== 'function') return;
    var payload = buildExportPayload();
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = FILENAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    localStorage.setItem('icloudLastExported', new Date().toISOString());
    updateStatusUI();
  }

  function importFile() {
    if (hasFilePicker()) {
      return window.showOpenFilePicker({
        types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
        multiple: false
      }).then(function (handles) {
        return handles[0].getFile().then(function (f) { return f.text(); }).then(function (text) {
          _applyParsed(JSON.parse(text));
        });
      }).catch(function (e) {
        if (e && e.name !== 'AbortError') console.warn('iCloud Sync: importFile error', e);
      });
    }
    /* Fallback: invisible <input type="file"> */
    var inp = document.createElement('input');
    inp.type   = 'file';
    inp.accept = 'application/json,.json';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        try { _applyParsed(JSON.parse(e.target.result)); }
        catch (parseErr) {
          var statusEl = el('icloudIosStatus') || el('icloudMacStatus');
          var msg = 'iCloud Sync: could not read file — ' + (parseErr && parseErr.message ? parseErr.message : 'invalid JSON');
          if (statusEl) { statusEl.textContent = msg; statusEl.style.color = '#b00020'; }
          else { console.error(msg); }
        }
      };
      reader.readAsText(f);
    });
    inp.click();
    return Promise.resolve();
  }

  /* ── Apply imported data ── */

  function _applyParsed(parsed) {
    /* Support both { meta, data } wrapper and raw data objects */
    var importData = (parsed && parsed.data) ? parsed.data : parsed;
    if (!importData) return;
    _applySilent(importData);
    localStorage.setItem('icloudLastImported', new Date().toISOString());
    updateStatusUI();
  }

  /*
   * Silent overwrite — applies all known data keys directly via the global
   * setter functions from app.js, without triggering any confirm() dialogs.
   * This is intentional: for background auto-sync the iCloud file is treated
   * as the source of truth without requiring user confirmation.
   *
   * _isApplying prevents the patched setters below from scheduling a write
   * back to iCloud while we are in the middle of applying a remote read.
   */
  var _isApplying = false;

  function _applySilent(d) {
    if (!d) return;
    _isApplying = true;
    try {
      /* Core data */
      if (Array.isArray(d.events))    { try { if (typeof setEvents  === 'function') setEvents(d.events);   } catch(_) {} }
      if (Array.isArray(d.tasks))     { try { if (typeof setTasks   === 'function') setTasks(d.tasks);     } catch(_) {} }
      if (Array.isArray(d.reminders)) { try { if (typeof setRemindersFromArray === 'function') setRemindersFromArray(d.reminders); } catch(_) {} }
      if (Array.isArray(d.jobs))      { try { if (typeof setJobs    === 'function') setJobs(d.jobs);       } catch(_) {} }
      if (Array.isArray(d.inbox))     { try { if (typeof setInbox   === 'function') setInbox(d.inbox);     } catch(_) {} }
      /* User profile */
      if (d.userProfile && typeof writeUserProfile === 'function') {
        try { writeUserProfile(d.userProfile); } catch(_) {}
      }
      /* JSON-serialised settings and widget data stored directly in localStorage */
      var jsonKeys = [
        'taskCategories', 'userOffDays', 'personalBuckets', 'homeBuckets', 'domainColors',
        'personalMeals', 'personalSleep', 'personalGym', 'personalFocus',
        'personalRoutines', 'personalRoutineLog', 'personalHydration', 'personalMealPrepLog',
        'personalMood', 'personalMealFavorites', 'journalEntries', 'journalFolders',
        'personalBudget', 'personalMacroGoals', 'personalRecipes', 'personalBodyMeasurements',
        'personalSavingsGoals', 'personalDebts', 'personalManualAssets', 'appNotificationSettings',
        'groceryList', 'homeStreaks', 'choreTemplatesCustom',
        'earningsSettings', 'schoolABSchedule'
      ];
      jsonKeys.forEach(function (k) {
        if (d[k] != null) { try { localStorage.setItem(k, JSON.stringify(d[k])); } catch(_) {} }
      });
      /* Plain string / numeric settings */
      var strKeys = ['dayStartHour', 'dayEndHour', 'personalCalorieGoal',
                     'morningBriefingEnabled', 'morningBriefingTime'];
      strKeys.forEach(function (k) {
        if (d[k] != null) { try { localStorage.setItem(k, d[k]); } catch(_) {} }
      });
      /* Notify the app that data has changed */
      try { if (typeof refreshAfterImport === 'function') refreshAfterImport(); } catch(_) {}
    } finally {
      _isApplying = false;
    }
  }

  /* ── Debounced auto-write ── */

  var _writeTimer = null;

  function scheduleWrite() {
    if (detectTier() !== 'macos') return;
    if (_isApplying) return; /* Don't write back while we're applying a remote read */
    if (_writeTimer) clearTimeout(_writeTimer);
    _writeTimer = setTimeout(function () {
      _writeTimer = null;
      writeToFolder().then(function (ok) {
        /* If the write failed because we are offline, register a Background
         * Sync tag so the SW retries it automatically when connectivity
         * returns.  Supported on iOS 16+ standalone; silently ignored elsewhere. */
        if (!ok && 'serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then(function (reg) {
            if (reg.sync && typeof reg.sync.register === 'function') {
              reg.sync.register('icloud-sync').catch(function () {});
            }
          }).catch(function () {});
        }
      });
    }, 1500);
  }

  /* Listen for the SW Background Sync message and retry the write. */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (ev) {
      if (ev && ev.data && ev.data.type === 'bg-sync:icloud') {
        writeToFolder().catch(function () {});
      }
    });
  }

  /*
   * Patch global data setters so every save triggers a debounced iCloud write.
   * These functions are defined at the global scope in app.js.
   * NOTE: if new data-setter functions are added to app.js, add them here too.
   */
  function _patchSetters() {
    var setters = ['setEvents', 'setTasks', 'setReminders', 'setJobs', 'setInbox',
                   'setBuckets', 'writeUserProfile'];
    setters.forEach(function (name) {
      var orig = window[name];
      if (typeof orig !== 'function') return;
      window[name] = function () {
        orig.apply(this, arguments);
        scheduleWrite();
      };
    });
  }

  /* ── iOS Shortcut URL-parameter import ──
   *
   * An iOS Shortcut can read timescape-data.json from iCloud Drive, base64-encode
   * its contents, and open the app at:
   *   https://<app-url>?import-data=<base64>
   *
   * On load this function checks for that parameter, decodes the payload,
   * applies it as an overwrite, then strips the parameter from the URL so
   * a reload does not re-apply stale data.
   */

  function checkURLImport() {
    var search = window.location.search;
    if (!search) return;
    var params = new URLSearchParams(search);
    var encoded = params.get('import-data');
    if (!encoded) return;

    /* Strip the parameter immediately so a reload won't re-apply it */
    params.delete('import-data');
    var newSearch = params.toString();
    var newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
    try { window.history.replaceState(null, '', newUrl); } catch (_) {}

    /* Clipboard-based import: the iOS Shortcut copies the base64 JSON to the
     * clipboard and opens the app with ?import-data=clipboard to avoid the
     * "URI too long" error that occurs when large payloads are embedded in the URL. */
    if (encoded === 'clipboard') {
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
        var statusElC = el('icloudIosStatus') || el('icloudMacStatus');
        if (statusElC) {
          statusElC.textContent = '⚠️ Clipboard API not available in this browser.';
          statusElC.style.color = '#b00020';
        }
        return;
      }
      navigator.clipboard.readText().then(function (text) {
        try {
          var json = atob(text.trim());
          var parsed = JSON.parse(json);
          _applyParsed(parsed);
          var statusEl = el('icloudIosStatus') || el('icloudMacStatus');
          if (statusEl) {
            statusEl.textContent = '✅ Imported from iCloud Shortcut at ' + new Date().toLocaleTimeString();
            statusEl.style.color = '#27ae60';
          }
        } catch (e) {
          console.warn('iCloud Sync: clipboard import failed to decode/apply data', e);
          var statusEl = el('icloudIosStatus') || el('icloudMacStatus');
          if (statusEl) {
            statusEl.textContent = '⚠️ Shortcut import failed: ' + (e && e.message ? e.message : 'invalid data');
            statusEl.style.color = '#b00020';
          }
        }
      }).catch(function (e) {
        console.warn('iCloud Sync: clipboard read failed', e);
        var statusEl = el('icloudIosStatus') || el('icloudMacStatus');
        if (statusEl) {
          statusEl.textContent = '⚠️ Could not read clipboard: ' + (e && e.message ? e.message : 'permission denied');
          statusEl.style.color = '#b00020';
        }
      });
      return;
    }

    try {
      var json = atob(encoded);
      var parsed = JSON.parse(json);
      _applyParsed(parsed);
      var statusEl = el('icloudIosStatus') || el('icloudMacStatus');
      if (statusEl) {
        statusEl.textContent = '✅ Imported from iCloud Shortcut at ' + new Date().toLocaleTimeString();
        statusEl.style.color = '#27ae60';
      }
    } catch (e) {
      console.warn('iCloud Sync: checkURLImport failed to decode/apply data', e);
      var statusEl = el('icloudIosStatus') || el('icloudMacStatus');
      if (statusEl) {
        statusEl.textContent = '⚠️ Shortcut import failed: ' + (e && e.message ? e.message : 'invalid data');
        statusEl.style.color = '#b00020';
      }
    }
  }

  /* ── Auto-read on load ── */

  function autoReadOnLoad() {
    if (detectTier() !== 'macos') return;
    getStoredHandle().then(function (handle) {
      if (!handle) return;
      queryPerm(handle, 'readwrite').then(function (perm) {
        if (perm === 'prompt') { showReauthPrompt(); return; }
        if (perm !== 'granted') {
          idbDel(HANDLE_KEY);
          localStorage.removeItem('icloudFolderName');
          updateStatusUI();
          return;
        }
        readFromFolder().then(function (parsed) {
          if (!parsed) return;
          /* Only apply if the remote file's exportedAt is newer than our last write */
          var remoteTs  = parsed.meta && parsed.meta.exportedAt ? new Date(parsed.meta.exportedAt).getTime() : 0;
          var localTs   = localStorage.getItem('icloudLastWritten');
          var localTime = localTs ? new Date(localTs).getTime() : 0;
          if (remoteTs > localTime + NEWER_THRESHOLD_MS) {
            /* Remote is meaningfully newer — apply it */
            _applyParsed(parsed);
          }
        });
      });
    });
  }

  /* ── Wire settings-modal UI buttons ── */

  function wireUI() {
    var connectBtn    = el('icloudConnectBtn');
    var disconnectBtn = el('icloudDisconnectBtn');
    var exportBtn     = el('icloudExportBtn');
    var importBtn     = el('icloudImportBtn');
    var reauthBtn     = el('icloudReauthBtn');

    if (connectBtn) {
      connectBtn.addEventListener('click', function () { connectFolder(); });
    }
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', function () { disconnectFolder(); });
    }
    if (exportBtn) {
      exportBtn.addEventListener('click', function () { exportFile(); });
    }
    if (importBtn) {
      importBtn.addEventListener('click', function () { importFile(); });
    }
    if (reauthBtn) {
      reauthBtn.addEventListener('click', function () {
        getStoredHandle().then(function (handle) {
          if (!handle) return;
          requestPerm(handle, 'readwrite').then(function (perm) {
            if (perm === 'granted') {
              hideReauthPrompt();
              writeToFolder().then(function () { updateStatusUI(); });
            } else {
              disconnectFolder();
            }
          });
        });
      });
    }

    /* Data-change hooks */
    window.addEventListener('app:data:updated', scheduleWrite);
  }

  /* ── Init ── */

  function init() {
    _patchSetters();
    wireUI();
    updateStatusUI();
    checkURLImport();
    autoReadOnLoad();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Public API ── */
  window.icloudSync = {
    connectFolder:    connectFolder,
    disconnectFolder: disconnectFolder,
    writeToFolder:    writeToFolder,
    readFromFolder:   readFromFolder,
    exportFile:       exportFile,
    importFile:       importFile,
    scheduleWrite:    scheduleWrite,
    updateStatusUI:   updateStatusUI,
    checkURLImport:   checkURLImport
  };

}());
