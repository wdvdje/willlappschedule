/**
 * desktop.js — Desktop-specific advanced features for TimeScape Planner.
 *
 * All features are guarded behind a (min-width: 768px) media query and
 * injected into the existing DOM on demand. The same localStorage data
 * model is used by all devices; no sync changes are needed.
 *
 * Features:
 *   1. CSV export for events and tasks
 *   2. Earnings & analytics panel (job events this week)
 *   3. Advanced task filter / sort bar (all/pending/done + sort fields)
 *   4. Drag-and-drop event rescheduling in the week view
 *   5. Bulk task operations (select, mark done, delete)
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function isDesktop() {
    return window.matchMedia('(min-width: 768px)').matches;
  }

  function safeParse(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }

  function saveKey(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function getEv()  { return safeParse('events', []); }
  function getTk()  { return safeParse('tasks',  []); }
  function getJb()  { return safeParse('jobs',   []); }
  function setEv(v) { saveKey('events', v); }
  function setTk(v) { saveKey('tasks',  v); }

  function nd(s) {
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function p2(n) { return n < 10 ? '0' + n : '' + n; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function parseMin(t) {
    if (!t) return null;
    var parts = t.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
  }

  /** Returns the Sunday–Saturday range containing today. */
  function weekRange() {
    var now = new Date(), dow = now.getDay();
    var s = new Date(now); s.setDate(now.getDate() - dow); s.setHours(0, 0, 0, 0);
    var e = new Date(s);   e.setDate(s.getDate() + 6);    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }

  // ---------------------------------------------------------------------------
  // 1. CSV Export
  // ---------------------------------------------------------------------------

  function rowsToCsv(rows) {
    return rows.map(function (row) {
      return row.map(function (cell) {
        var s = String(cell == null ? '' : cell);
        return /[,"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  }

  function downloadCsv(filename, rows) {
    var blob = new Blob([rowsToCsv(rows)], { type: 'text/csv' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  }

  function exportEventsCsv() {
    var stamp = new Date().toISOString().slice(0, 10);
    var header = ['id', 'title', 'date', 'time', 'endTime', 'location',
                  'category', 'emoji', 'repeat', 'preBuffer', 'postBuffer'];
    var rows = [header].concat(getEv().map(function (e) {
      return [e.id, e.title, e.date, e.time || '', e.endTime || '',
              e.location || '', e.category || '', e.emoji || '',
              e.repeat || 'none', e.preBuffer || 0, e.postBuffer || 0];
    }));
    downloadCsv('timescape-events-' + stamp + '.csv', rows);
  }

  function exportTasksCsv() {
    var stamp = new Date().toISOString().slice(0, 10);
    var header = ['id', 'title', 'date', 'time', 'category', 'priority', 'done', 'created'];
    var rows = [header].concat(getTk().map(function (t) {
      return [t.id || '', t.title || t.text || '', t.date || '', t.time || '',
              t.category || '', t.priority || '', t.done ? 'yes' : 'no', t.created || ''];
    }));
    downloadCsv('timescape-tasks-' + stamp + '.csv', rows);
  }

  function injectCsvButtons() {
    var section = document.getElementById('dataBackupSettings');
    if (!section || document.getElementById('dtCsvBtns')) return;

    var wrap = document.createElement('div');
    wrap.id = 'dtCsvBtns';
    wrap.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' +
                         'margin-top:8px;padding-top:8px;border-top:1px solid #eee';

    var label = document.createElement('span');
    label.style.cssText = 'font-size:0.85rem;font-weight:600;color:#555';
    label.textContent = '📊 Desktop exports:';
    wrap.appendChild(label);

    [['Export Events CSV', exportEventsCsv],
     ['Export Tasks CSV',  exportTasksCsv]].forEach(function (pair) {
      var btn = document.createElement('button');
      btn.className = 'small-btn';
      btn.style.cssText = 'background:#27ae60;color:#fff';
      btn.textContent = pair[0];
      btn.addEventListener('click', pair[1]);
      wrap.appendChild(btn);
    });

    section.appendChild(wrap);
  }

  // ---------------------------------------------------------------------------
  // 2. Earnings & analytics panel
  // ---------------------------------------------------------------------------

  function calcEarnings() {
    var range   = weekRange();
    var events  = getEv();
    var jobs    = getJb();
    var byId    = {}, byName = {};
    jobs.forEach(function (j) {
      if (j.id)   byId[j.id] = j;
      if (j.name) byName[j.name.toLowerCase()] = j;
    });

    var total = 0, items = [];

    events.forEach(function (ev) {
      var d = new Date((nd(ev.date) || '') + 'T00:00:00');
      if (isNaN(d.getTime()) || d < range.start || d > range.end) return;
      if ((ev.category || 'event') !== 'job') return;

      var job = null;
      if (ev.jobId) job = byId[ev.jobId];
      if (!job && ev.jobName) job = byName[(ev.jobName || '').toLowerCase()];
      if (!job && ev.jobRate)  job = { rate: ev.jobRate, unit: ev.jobUnit || 'hour' };

      var earnings = null, hours = null;
      if (job) {
        var rate = parseFloat(job.rate || 0);
        var unit = job.unit || 'hour';
        if (unit === 'job' || unit === 'day') {
          earnings = rate;
        } else if (unit === 'hour' && ev.time && ev.endTime) {
          var sm = parseMin(ev.time), em = parseMin(ev.endTime);
          if (em <= sm) em += 1440;
          hours    = (em - sm) / 60;
          earnings = rate * hours;
        }
        if (earnings != null) total += earnings;
      }
      items.push({ ev: ev, earnings: earnings, hours: hours });
    });

    return { total: total, items: items, range: range };
  }

  function refreshEarnings() {
    var body = document.getElementById('dtEarningsBody');
    if (!body) return;
    var result = calcEarnings();
    var fmt    = function (d) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };

    if (!result.items.length) {
      body.innerHTML = '<span style="color:#aaa">No job events this week (' +
        fmt(result.range.start) + '–' + fmt(result.range.end) +
        '). Add events with <b>job</b> category to track earnings.</span>';
      return;
    }

    var html = result.items.map(function (item) {
      var e = item.ev;
      var earnStr = item.earnings != null ? '$' + item.earnings.toFixed(2) : '—';
      var hrsStr  = item.hours  != null ? item.hours.toFixed(1) + 'h ' : '';
      return '<div style="display:flex;gap:8px;align-items:center;' +
             'padding:4px 0;border-bottom:1px solid #f5f5f5">' +
             '<span style="flex:1"><b>' + esc(e.title || '') + '</b> ' +
             '<small style="color:#888">' + esc(e.date || '') +
             (e.time ? ' ' + esc(e.time) : '') + '</small></span>' +
             (hrsStr ? '<small style="color:#666">' + hrsStr + '</small>' : '') +
             '<b style="color:#27ae60">' + earnStr + '</b></div>';
    }).join('');

    if (result.total > 0) {
      html += '<div style="margin-top:8px;font-weight:700;color:#27ae60">' +
              'Total: $' + result.total.toFixed(2) + '</div>';
    }
    body.innerHTML = html;
  }

  function injectEarningsPanel() {
    var dash = document.querySelector('.dashboard');
    if (!dash || document.getElementById('dtEarningsPanel')) return;

    var panel = document.createElement('div');
    panel.id = 'dtEarningsPanel';
    panel.style.cssText = 'margin:12px auto 0;padding:12px;background:#fff;' +
                          'border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,0.06);' +
                          'text-align:left;max-width:640px';
    panel.innerHTML = '<h4 style="margin:0 0 8px;color:#333;font-size:0.95rem">' +
                      "💼 This Week's Job Earnings</h4>" +
                      '<div id="dtEarningsBody" style="font-size:0.88rem;color:#555"></div>';
    dash.appendChild(panel);
    refreshEarnings();
  }

  // ---------------------------------------------------------------------------
  // 3. Advanced task filter / sort bar
  // ---------------------------------------------------------------------------

  var dtFilter   = 'all';
  var dtSort     = 'date';
  var dtSortDir  = 'asc';
  var _dtObs     = null;   // MutationObserver on #tasksContainer
  var _dtSuppressed = false;
  var _dtFrame   = null;

  function schedApply() {
    if (_dtFrame) cancelAnimationFrame(_dtFrame);
    _dtFrame = requestAnimationFrame(applyDtFilter);
  }

  /**
   * Tags each .task-box with data attributes derived from the sorted task
   * array, then filters (show/hide) and re-orders boxes per current settings.
   * The sort order used here matches tasks.js's renderTasksList() so that
   * box[i] correctly maps to tasks[i].
   */
  function applyDtFilter() {
    _dtFrame = null;
    var container = document.getElementById('tasksContainer');
    if (!container) return;
    var boxes = Array.from(container.querySelectorAll('.task-box'));
    if (!boxes.length) return;

    // Mirror tasks.js sort: by date then time
    var tasks = getTk().slice().sort(function (a, b) {
      if ((a.date || '') !== (b.date || '')) return (a.date || '').localeCompare(b.date || '');
      return (a.time || '').localeCompare(b.time || '');
    });

    // Tag boxes with task metadata
    boxes.forEach(function (box, i) {
      var t = tasks[i];
      if (!t) return;
      box.dataset.dtId    = t.id != null ? String(t.id) : ('__idx__' + i);
      box.dataset.dtDone  = t.done ? '1' : '0';
      box.dataset.dtCat   = t.category  || '';
      box.dataset.dtPrio  = t.priority  || '1';
      box.dataset.dtDate  = t.date      || '';
      box.dataset.dtTitle = (t.title || t.text || '').toLowerCase();
    });

    // Filter
    boxes.forEach(function (box) {
      if (!box.dataset.dtId) { box.style.display = 'flex'; return; }
      var done = box.dataset.dtDone === '1';
      var vis  = true;
      if (dtFilter === 'pending' && done)  vis = false;
      if (dtFilter === 'done'    && !done) vis = false;
      box.style.display = vis ? 'flex' : 'none';
    });

    // Sort DOM order
    var prioMap = { '1': 1, '2': 2, '3': 3 };
    var sorted = boxes.slice().sort(function (a, b) {
      var cmp = 0;
      if      (dtSort === 'date')     cmp = (a.dataset.dtDate  || '9999').localeCompare(b.dataset.dtDate  || '9999');
      else if (dtSort === 'priority') cmp = (prioMap[a.dataset.dtPrio] || 1) - (prioMap[b.dataset.dtPrio] || 1);
      else if (dtSort === 'category') cmp = (a.dataset.dtCat   || '').localeCompare(b.dataset.dtCat   || '');
      else if (dtSort === 'title')    cmp = (a.dataset.dtTitle || '').localeCompare(b.dataset.dtTitle || '');
      return dtSortDir === 'asc' ? cmp : -cmp;
    });

    _dtSuppressed = true;
    sorted.forEach(function (box) { container.appendChild(box); });
    _dtSuppressed = false;

    // Re-add bulk checkboxes if bulk mode is active
    if (_bulkMode) addBulkCheckboxes();
  }

  function injectTaskBar() {
    var section = document.getElementById('page-tasks');
    if (!section || document.getElementById('dtTaskBar')) return;
    var container = document.getElementById('tasksContainer');
    if (!container || !container.parentNode) return;

    var bar = document.createElement('div');
    bar.id = 'dtTaskBar';
    bar.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;' +
                        'margin:10px 12px 2px;padding:8px 10px;background:#fff;' +
                        'border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.05)';

    // Filter buttons
    var fLabel = document.createElement('span');
    fLabel.style.cssText = 'font-size:0.8rem;color:#666;font-weight:600';
    fLabel.textContent = 'Filter:';
    bar.appendChild(fLabel);

    [['all', 'All'], ['pending', 'Pending'], ['done', 'Done']].forEach(function (pair) {
      var btn = document.createElement('button');
      btn.className = 'dt-fb';
      btn.dataset.f = pair[0];
      btn.style.cssText = 'padding:3px 10px;border-radius:14px;cursor:pointer;font-size:0.8rem;' +
                          'border:1.5px solid ' + (pair[0] === 'all' ? '#4a90e2' : '#ddd') + ';' +
                          'background:' + (pair[0] === 'all' ? '#4a90e2' : '#fff') + ';' +
                          'color:' + (pair[0] === 'all' ? '#fff' : '#333');
      btn.textContent = pair[1];
      btn.addEventListener('click', function () {
        dtFilter = pair[0];
        bar.querySelectorAll('.dt-fb').forEach(function (b) {
          var active = b.dataset.f === dtFilter;
          b.style.background   = active ? '#4a90e2' : '#fff';
          b.style.borderColor  = active ? '#4a90e2' : '#ddd';
          b.style.color        = active ? '#fff'    : '#333';
        });
        schedApply();
      });
      bar.appendChild(btn);
    });

    // Sort controls
    var sLabel = document.createElement('span');
    sLabel.style.cssText = 'margin-left:auto;font-size:0.8rem;color:#666;font-weight:600';
    sLabel.textContent = 'Sort:';
    bar.appendChild(sLabel);

    var sel = document.createElement('select');
    sel.id = 'dtSortSel';
    sel.style.cssText = 'padding:4px 6px;border-radius:6px;border:1px solid #ccc;' +
                        'font-size:0.8rem;width:auto;margin-top:0';
    [['date', 'Due date'], ['priority', 'Priority'],
     ['category', 'Category'], ['title', 'Title']].forEach(function (pair) {
      var opt = document.createElement('option');
      opt.value = pair[0]; opt.textContent = pair[1];
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () { dtSort = sel.value; schedApply(); });
    bar.appendChild(sel);

    var dirBtn = document.createElement('button');
    dirBtn.id = 'dtSortDir';
    dirBtn.title = 'Toggle sort direction';
    dirBtn.style.cssText = 'background:#fff;border:1px solid #ccc;border-radius:6px;' +
                           'padding:3px 8px;cursor:pointer;font-size:0.85rem';
    dirBtn.textContent = '↑';
    dirBtn.addEventListener('click', function () {
      dtSortDir = dtSortDir === 'asc' ? 'desc' : 'asc';
      dirBtn.textContent = dtSortDir === 'asc' ? '↑' : '↓';
      schedApply();
    });
    bar.appendChild(dirBtn);

    container.parentNode.insertBefore(bar, container);

    // Watch for task list re-renders
    if (!_dtObs) {
      _dtObs = new MutationObserver(function () {
        if (!_dtSuppressed) schedApply();
      });
      _dtObs.observe(container, { childList: true });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Drag-and-drop event rescheduling in week view
  // ---------------------------------------------------------------------------

  var _dragEvId  = null;
  var _dndObs    = null;
  var _dndFrame  = null;

  /**
   * Parse the week-start date from the monthLabel text.
   * renderWeekView() sets it to e.g. "April 7 – April 13, 2026".
   */
  function parseWeekStart() {
    var ml = document.getElementById('monthLabel');
    if (!ml) return null;
    var text = (ml.textContent || '').trim();
    var MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
    // Match "MonthName D – MonthName D, YYYY"
    var m = text.match(/([A-Za-z]+)\s+(\d+)\s*[–\-]\s*([A-Za-z]+)\s+(\d+),\s*(\d{4})/);
    if (!m) return null;
    var startMo = MONTHS.findIndex(function (n) {
      return n.toLowerCase().startsWith(m[1].toLowerCase().slice(0, 3));
    });
    var endMo = MONTHS.findIndex(function (n) {
      return n.toLowerCase().startsWith(m[3].toLowerCase().slice(0, 3));
    });
    if (startMo === -1) return null;
    var endYear   = parseInt(m[5], 10);
    var startYear = startMo > endMo ? endYear - 1 : endYear;
    return new Date(startYear, startMo, parseInt(m[2], 10));
  }

  /** Add draggable behaviour to week-view event chips and drop zones. */
  function enhanceWeekViewDnd() {
    var container = document.getElementById('weekView');
    if (!container || !isDesktop()) return;
    var grid = container.querySelector('.week-grid');
    if (!grid) return;

    var ws     = parseWeekStart();
    var events = getEv();
    var cols   = grid.querySelectorAll('.week-col');

    cols.forEach(function (col, i) {
      // Assign a date to each column
      if (ws && !isNaN(ws.getTime())) {
        var colDate = new Date(ws);
        colDate.setDate(ws.getDate() + i);
        col.dataset.date = colDate.getFullYear() + '-' + p2(colDate.getMonth() + 1) + '-' + p2(colDate.getDate());
      }
      // Wire drop zone (use on* to safely replace any previous binding)
      col.ondragover  = function (e) {
        if (_dragEvId) { e.preventDefault(); col.style.outline = '2px dashed #4a90e2'; col.style.borderRadius = '8px'; }
      };
      col.ondragleave = function () { col.style.outline = ''; };
      col.ondrop      = function (e) {
        e.preventDefault();
        col.style.outline = '';
        var id = _dragEvId || e.dataTransfer.getData('text/plain');
        if (id && col.dataset.date) rescheduleEvent(id, col.dataset.date);
      };
    });

    // Make event chips draggable
    container.querySelectorAll('.week-chip.event').forEach(function (chip) {
      if (chip.dataset.evId) return;  // already wired
      var col = chip.closest('.week-col');
      if (!col || !col.dataset.date) return;

      // Match chip to an event by date + title
      var colDate   = col.dataset.date;
      var chipText  = chip.textContent.trim();
      var matched   = null;
      for (var k = 0; k < events.length; k++) {
        var ev = events[k];
        if (nd(ev.date) === colDate && chipText.indexOf(ev.title || '') !== -1) {
          matched = ev; break;
        }
      }
      if (!matched) return;

      chip.dataset.evId = String(matched.id);
      chip.draggable    = true;
      chip.style.cursor = 'grab';
      chip.ondragstart  = function (e) {
        _dragEvId = chip.dataset.evId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', _dragEvId);
        chip.style.opacity = '0.5';
      };
      chip.ondragend = function () { chip.style.opacity = ''; _dragEvId = null; };
    });
  }

  function rescheduleEvent(evId, newDate) {
    var events = getEv();
    var idx    = -1;
    for (var i = 0; i < events.length; i++) {
      if (String(events[i].id) === String(evId)) { idx = i; break; }
    }
    if (idx === -1) return;
    var target = nd(newDate);
    if (!target || nd(events[idx].date) === target) return;
    events[idx].date = target;
    setEv(events);
    window.dispatchEvent(new CustomEvent('app:data:updated'));
    try { if (typeof window.renderWeekView    === 'function') window.renderWeekView();    } catch (e) { /* ignore */ }
    try { if (typeof window.generateCalendar  === 'function') window.generateCalendar();  } catch (e) { /* ignore */ }
    if (typeof window.selectedDay !== 'undefined' && window.selectedDay) {
      try { if (typeof window.showReminders === 'function') window.showReminders(window.selectedDay); } catch (e) { /* ignore */ }
    }
  }

  function initWeekViewDnd() {
    var container = document.getElementById('weekView');
    if (!container) return;
    if (_dndObs) _dndObs.disconnect();
    _dndObs = new MutationObserver(function () {
      if (_dndFrame) cancelAnimationFrame(_dndFrame);
      _dndFrame = requestAnimationFrame(function () { _dndFrame = null; enhanceWeekViewDnd(); });
    });
    _dndObs.observe(container, { childList: true });
    // Run once in case week view is already visible
    enhanceWeekViewDnd();
  }

  // ---------------------------------------------------------------------------
  // 5. Bulk task operations
  // ---------------------------------------------------------------------------

  var _bulkMode = false;

  /** Return the dataset.dtId values for all checked bulk checkboxes. */
  function getCheckedIds() {
    var ids = [];
    document.querySelectorAll('.dt-bulk-cb:checked').forEach(function (cb) {
      var box = cb.closest('.task-box');
      if (box && box.dataset.dtId && box.dataset.dtId.indexOf('__idx__') === -1) {
        ids.push(box.dataset.dtId);
      }
    });
    return ids;
  }

  function updateBulkCount() {
    var n   = document.querySelectorAll('.dt-bulk-cb:checked').length;
    var el  = document.getElementById('dtBulkCount');
    if (el) el.textContent = n + ' selected';
  }

  function addBulkCheckboxes() {
    var container = document.getElementById('tasksContainer');
    if (!container) return;
    container.querySelectorAll('.task-box').forEach(function (box) {
      if (box.querySelector('.dt-bulk-cb')) return;
      var hasId = box.dataset.dtId && box.dataset.dtId.indexOf('__idx__') === -1;
      var cb    = document.createElement('input');
      cb.type   = 'checkbox';
      cb.className   = 'dt-bulk-cb';
      cb.style.cssText = 'width:18px;height:18px;flex-shrink:0;cursor:pointer;accent-color:#4a90e2';
      if (!hasId) { cb.disabled = true; cb.title = 'Legacy task — no ID, cannot bulk-select'; }
      cb.addEventListener('change', updateBulkCount);
      box.insertBefore(cb, box.firstChild);
    });
    updateBulkCount();
  }

  function removeBulkCheckboxes() {
    document.querySelectorAll('.dt-bulk-cb').forEach(function (cb) { cb.remove(); });
    var el = document.getElementById('dtBulkCount');
    if (el) el.textContent = '0 selected';
  }

  function bulkMarkDone() {
    var ids   = getCheckedIds();
    if (!ids.length) { alert('Select at least one task first.'); return; }
    var tasks = getTk().map(function (t) {
      return ids.indexOf(String(t.id)) !== -1 ? Object.assign({}, t, { done: true }) : t;
    });
    setTk(tasks);
    window.dispatchEvent(new CustomEvent('app:data:updated'));
  }

  function bulkDelete() {
    var ids = getCheckedIds();
    if (!ids.length) { alert('Select at least one task first.'); return; }
    if (!confirm('Delete ' + ids.length + ' task(s)?')) return;
    var tasks = getTk().filter(function (t) { return ids.indexOf(String(t.id)) === -1; });
    setTk(tasks);
    window.dispatchEvent(new CustomEvent('app:data:updated'));
  }

  function enterBulkMode() {
    _bulkMode = true;
    var btn = document.getElementById('dtBulkToggle');
    if (btn) {
      btn.textContent    = '✕ Cancel select';
      btn.style.background   = '#fff0f0';
      btn.style.color        = '#e74c3c';
      btn.style.borderColor  = '#e74c3c';
    }
    var acts = document.getElementById('dtBulkActs');
    if (acts) acts.style.display = 'flex';
    // Ensure boxes are tagged before adding checkboxes
    schedApply();
    // addBulkCheckboxes is called at the end of applyDtFilter when _bulkMode=true
  }

  function exitBulkMode() {
    _bulkMode = false;
    var btn = document.getElementById('dtBulkToggle');
    if (btn) {
      btn.textContent    = '☑ Select';
      btn.style.background   = '#e8f2fe';
      btn.style.color        = '#4a90e2';
      btn.style.borderColor  = '#4a90e2';
    }
    var acts = document.getElementById('dtBulkActs');
    if (acts) acts.style.display = 'none';
    removeBulkCheckboxes();
  }

  function injectBulkTaskBar() {
    var section = document.getElementById('page-tasks');
    if (!section || document.getElementById('dtBulkToggle')) return;
    var container = document.getElementById('tasksContainer');
    if (!container || !container.parentNode) return;

    // Toggle button (inserted before the task bar if present, else before container)
    var toggleBtn = document.createElement('button');
    toggleBtn.id = 'dtBulkToggle';
    toggleBtn.className = 'small-btn';
    toggleBtn.style.cssText = 'margin:4px 12px 2px;background:#e8f2fe;color:#4a90e2;' +
                              'border:1.5px solid #4a90e2;align-self:flex-start';
    toggleBtn.textContent = '☑ Select';
    toggleBtn.addEventListener('click', function () {
      _bulkMode ? exitBulkMode() : enterBulkMode();
    });

    // Action bar
    var actBar = document.createElement('div');
    actBar.id = 'dtBulkActs';
    actBar.style.cssText = 'display:none;gap:8px;align-items:center;margin:2px 12px 4px;' +
                           'padding:6px 10px;background:#e8f2fe;border-radius:8px;flex-wrap:wrap';

    var countEl = document.createElement('span');
    countEl.id = 'dtBulkCount';
    countEl.style.cssText = 'font-size:0.85rem;color:#4a90e2;font-weight:600';
    countEl.textContent = '0 selected';
    actBar.appendChild(countEl);

    [['Select All', '#4a90e2', function () {
        container.querySelectorAll('.dt-bulk-cb:not(:disabled)').forEach(function (cb) { cb.checked = true; });
        updateBulkCount();
      }],
     ['✓ Mark Done', '#27ae60', bulkMarkDone],
     ['✕ Delete',    '#e74c3c', bulkDelete],
     ['Cancel',      '#888',    exitBulkMode]
    ].forEach(function (pair) {
      var btn = document.createElement('button');
      btn.className = 'small-btn';
      btn.style.cssText = 'background:' + pair[1] + ';color:#fff';
      btn.textContent = pair[0];
      btn.addEventListener('click', pair[2]);
      actBar.appendChild(btn);
    });

    // Insert toggle button and action bar before the tasks container
    var ref = document.getElementById('dtTaskBar') || container;
    container.parentNode.insertBefore(actBar,    ref);
    container.parentNode.insertBefore(toggleBtn, ref);
  }

  // ---------------------------------------------------------------------------
  // Show / hide all desktop-only elements
  // ---------------------------------------------------------------------------

  var DESKTOP_ELEMENTS = {
    'dtCsvBtns':       'flex',
    'dtEarningsPanel': 'block',
    'dtTaskBar':       'flex',
    'dtBulkToggle':    'inline-block',
    'dtAgendaSidebar': 'block',
  };

  function hideDesktopFeatures() {
    Object.keys(DESKTOP_ELEMENTS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    var acts = document.getElementById('dtBulkActs');
    if (acts) acts.style.display = 'none';
    if (_bulkMode) exitBulkMode();
  }

  function showDesktopFeatures() {
    Object.keys(DESKTOP_ELEMENTS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = DESKTOP_ELEMENTS[id];
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Event tooltip popover on hover (desktop calendar)
  // ---------------------------------------------------------------------------

  var _tooltipEl = null;

  function ensureTooltip() {
    if (_tooltipEl) return _tooltipEl;
    _tooltipEl = document.createElement('div');
    _tooltipEl.id = 'dtEventTooltip';
    _tooltipEl.style.cssText = 'position:fixed;z-index:10000;background:#fff;border:1px solid #ddd;' +
      'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.15);padding:10px 14px;' +
      'max-width:280px;font-size:0.85rem;pointer-events:none;display:none;text-align:left;' +
      "font-family:'Source Sans 3',Arial,sans-serif;line-height:1.4";
    document.body.appendChild(_tooltipEl);
    return _tooltipEl;
  }

  function showTooltip(chip, ev) {
    if (!isDesktop()) return;
    var tip = ensureTooltip();
    var domainColors = (typeof getDomainColors === 'function') ? getDomainColors() : { work: '#4a90e2', home: '#27ae60', personal: '#9b59b6' };
    var domainLabels = { work: '💼 Work', home: '🏡 Home', personal: '👤 Personal' };
    var domain = ev.domain || 'personal';
    var color = domainColors[domain] || '#9b59b6';

    var html = '<div style="border-left:4px solid ' + color + ';padding-left:8px;margin-bottom:6px">';
    html += '<div style="font-weight:700;font-size:0.95rem;color:#222">' + (ev.emoji ? ev.emoji + ' ' : '') + esc(ev.title || '') + '</div>';
    html += '<div style="font-size:0.75rem;color:' + color + ';font-weight:600">' + (domainLabels[domain] || domain) + '</div>';
    html += '</div>';
    if (ev.time) html += '<div style="color:#555">🕐 ' + esc(ev.time) + (ev.endTime ? ' – ' + esc(ev.endTime) : '') + '</div>';
    if (ev.location) html += '<div style="color:#555">📍 ' + esc(ev.location) + '</div>';
    if (ev.category) html += '<div style="color:#888;font-size:0.78rem;margin-top:2px">Category: ' + esc(ev.category) + '</div>';
    tip.innerHTML = html;
    tip.style.display = 'block';

    var rect = chip.getBoundingClientRect();
    var tipW = tip.offsetWidth, tipH = tip.offsetHeight;
    var left = rect.right + 8;
    var top = rect.top;
    if (left + tipW > window.innerWidth - 12) left = rect.left - tipW - 8;
    if (top + tipH > window.innerHeight - 12) top = window.innerHeight - tipH - 12;
    if (top < 4) top = 4;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function hideTooltip() {
    if (_tooltipEl) _tooltipEl.style.display = 'none';
  }

  function wireCalendarTooltips() {
    var cal = document.getElementById('calendar');
    if (!cal || !isDesktop()) return;
    var events = getEv();
    cal.querySelectorAll('.event-preview[data-event-id]').forEach(function (chip) {
      var evId = chip.dataset.eventId;
      var ev = null;
      for (var i = 0; i < events.length; i++) {
        if (String(events[i].id) === String(evId)) { ev = events[i]; break; }
      }
      if (!ev) return;
      chip.style.cursor = 'pointer';
      chip.addEventListener('mouseenter', function () { showTooltip(chip, ev); });
      chip.addEventListener('mouseleave', hideTooltip);
    });
  }

  // ---------------------------------------------------------------------------
  // 7. Agenda sidebar (desktop calendar — upcoming events list)
  // ---------------------------------------------------------------------------

  function injectAgendaSidebar() {
    var calPage = document.getElementById('page-calendar');
    if (!calPage || !isDesktop() || document.getElementById('dtAgendaSidebar')) return;

    var sidebar = document.createElement('div');
    sidebar.id = 'dtAgendaSidebar';
    sidebar.style.cssText = 'position:fixed;right:16px;top:72px;width:260px;max-height:calc(100vh - 100px);' +
      'overflow-y:auto;background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,0.08);' +
      'padding:14px 16px;z-index:50;font-size:0.88rem;display:none';
    sidebar.innerHTML = '<h4 style="margin:0 0 10px;color:#333;font-size:0.95rem">📋 Upcoming</h4>' +
      '<div id="dtAgendaBody"></div>';
    document.body.appendChild(sidebar);
    refreshAgenda();
  }

  function refreshAgenda() {
    var body = document.getElementById('dtAgendaBody');
    var sidebar = document.getElementById('dtAgendaSidebar');
    if (!body || !sidebar) return;

    var calPage = document.getElementById('page-calendar');
    if (!calPage || calPage.classList.contains('hidden')) { sidebar.style.display = 'none'; return; }
    sidebar.style.display = 'block';

    var today = new Date();
    var todayStr = today.getFullYear() + '-' + p2(today.getMonth() + 1) + '-' + p2(today.getDate());
    var endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);
    var endStr = endDate.getFullYear() + '-' + p2(endDate.getMonth() + 1) + '-' + p2(endDate.getDate());

    var events = getEv().filter(function (e) {
      var d = nd(e.date);
      return d >= todayStr && d <= endStr;
    }).sort(function (a, b) {
      var cmp = (nd(a.date) || '').localeCompare(nd(b.date) || '');
      if (cmp !== 0) return cmp;
      return (a.time || '').localeCompare(b.time || '');
    });

    var domainColors = (typeof getDomainColors === 'function') ? getDomainColors() : { work: '#4a90e2', home: '#27ae60', personal: '#9b59b6' };
    var DOMAIN_LABELS = { work: 'Work', home: 'Home', personal: 'Personal' };

    if (!events.length) {
      body.innerHTML = '<div style="color:#aaa;padding:8px 0">No upcoming events this week.</div>';
      return;
    }

    var html = '';
    var lastDate = '';
    events.forEach(function (ev) {
      var d = nd(ev.date);
      if (d !== lastDate) {
        var dateObj = new Date(d + 'T12:00:00');
        var dateLabel = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        html += '<div style="font-weight:700;font-size:0.78rem;color:#888;margin-top:8px;text-transform:uppercase;letter-spacing:0.03em">' + esc(dateLabel) + '</div>';
        lastDate = d;
      }
      var domain = ev.domain || 'personal';
      var color = domainColors[domain] || '#9b59b6';
      html += '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #f5f5f5">';
      html += '<div style="width:4px;height:28px;border-radius:2px;background:' + color + ';flex-shrink:0"></div>';
      html += '<div style="flex:1;overflow:hidden">';
      html += '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (ev.emoji ? ev.emoji + ' ' : '') + esc(ev.title || '') + '</div>';
      html += '<div style="font-size:0.75rem;color:#888">' + (ev.time || 'All day') +
        ' · <span style="color:' + color + '">' + esc(DOMAIN_LABELS[domain] || domain) + '</span></div>';
      html += '</div></div>';
    });

    body.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // 8. Keyboard navigation for calendar days (desktop)
  // ---------------------------------------------------------------------------

  function wireCalendarKeyNav() {
    if (!isDesktop()) return;
    document.addEventListener('keydown', function (e) {
      var calPage = document.getElementById('page-calendar');
      if (!calPage || calPage.classList.contains('hidden')) return;
      // Only handle arrow keys and Enter when not in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      var sel = window.selectedDay;
      var mo = window.selectedMonth;
      var yr = window.selectedYear;
      if (sel == null || mo == null || yr == null) return;

      var daysInMonth = new Date(yr, mo + 1, 0).getDate();
      var handled = false;

      if (e.key === 'ArrowRight') {
        if (sel < daysInMonth) { sel++; handled = true; }
      } else if (e.key === 'ArrowLeft') {
        if (sel > 1) { sel--; handled = true; }
      } else if (e.key === 'ArrowDown') {
        if (sel + 7 <= daysInMonth) { sel += 7; handled = true; }
      } else if (e.key === 'ArrowUp') {
        if (sel - 7 >= 1) { sel -= 7; handled = true; }
      }

      if (handled) {
        e.preventDefault();
        window.selectedDay = sel;
        try { if (typeof window.showReminders === 'function') window.showReminders(sel); } catch (_) {}
        try { if (typeof window.generateCalendar === 'function') window.generateCalendar(); } catch (_) {}
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------------------

  function initDesktop() {
    if (!isDesktop()) return;
    injectCsvButtons();
    injectEarningsPanel();
    injectTaskBar();
    injectBulkTaskBar();
    initWeekViewDnd();
    injectAgendaSidebar();
    wireCalendarKeyNav();
    wireCalendarTooltips();
  }

  // Re-inject when the user navigates to a view (sections may be hidden at init)
  window.addEventListener('view:show', function (e) {
    if (!isDesktop()) return;
    var view = e.detail && e.detail.view;
    if (view === 'tasks')    { injectTaskBar(); injectBulkTaskBar(); if (_bulkMode) schedApply(); }
    if (view === 'settings') { injectCsvButtons(); }
    if (view === 'calendar' || view === 'today') {
      injectEarningsPanel(); refreshEarnings();
      injectAgendaSidebar(); refreshAgenda();
      setTimeout(wireCalendarTooltips, 100);
    }
  });

  // Refresh earnings, agenda and tooltips after any data change
  window.addEventListener('app:data:updated', function () {
    refreshEarnings();
    if (isDesktop()) {
      refreshAgenda();
      setTimeout(wireCalendarTooltips, 100);
    }
  });
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key === 'events' || e.key === 'jobs') {
      refreshEarnings();
      if (isDesktop()) refreshAgenda();
    }
  });

  // Respond to viewport changes
  window.matchMedia('(min-width: 768px)').addEventListener('change', function (mq) {
    if (mq.matches) { initDesktop(); showDesktopFeatures(); }
    else            { hideDesktopFeatures(); }
  });

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDesktop);
  } else {
    setTimeout(initDesktop, 0);
  }
})();
