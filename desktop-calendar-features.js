/* ══════════════════════════════════════════════════════════════════════
   desktop-calendar-features.js
   20 advanced calendar features for the desktop view:
   1. Year heatmap view
   2. Animated view transitions
   3. Time-block week view (proportional duration blocks)
   4. Weather forecast overlay (Open-Meteo, no API key)
   5. Day-cell event count badges
   6. Dark mode toggle
   7. Two-week (14-day) view
   8. Drag-to-resize event duration on daily timeline
   9. Time-slot quick-create on daily timeline
  10. Calendar layer toggles (Events / Tasks / Reminders)
  11. Recurring event visual indicators (🔁 badge)
  12. Smart scheduling (find next free time slot)
  13. Activity summary chart (SVG bar chart per month)
  14. Time allocation donut chart (SVG donut per month)
  15. Streak tracking (consecutive-day task completion)
  16. Go-to-date quick picker
  17. Split-panel layout on desktop (calendar + daily side panel)
  18. Search-as-you-type calendar highlighting
  19. Print-friendly stylesheet
  20. Command palette (Ctrl+P)
══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─── Core helpers ─── */
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(s) { return (s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nd(d) { if (!d) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; var dt = new Date(d); return isNaN(dt.getTime()) ? '' : dt.getFullYear() + '-' + p2(dt.getMonth() + 1) + '-' + p2(dt.getDate()); }
  function isDesktop() { return window.matchMedia && window.matchMedia('(min-width: 901px)').matches; }
  function todayISO() { var n = new Date(); return n.getFullYear() + '-' + p2(n.getMonth() + 1) + '-' + p2(n.getDate()); }

  /* Safe data accessors (fallback if app.js hasn't loaded yet) */
  function safeGetEvts(start, end) {
    try {
      if (typeof getExpandedEvents === 'function') return getExpandedEvents(start, end);
      return (typeof getEvents === 'function' ? getEvents() : JSON.parse(localStorage.getItem('events') || '[]') || []).filter(function (e) { var d = nd(e.date); return (!start || d >= start) && (!end || d <= end); });
    } catch (_) { return []; }
  }
  function safeTasks() { try { return typeof getTasks === 'function' ? getTasks() : JSON.parse(localStorage.getItem('tasks') || '[]') || []; } catch (_) { return []; } }
  function safeRems() { try { return typeof getReminders === 'function' ? getReminders() : JSON.parse(localStorage.getItem('reminders') || '{}') || {}; } catch (_) { return {}; } }
  function safeDomainColors() { try { return typeof getDomainColors === 'function' ? getDomainColors() : { work: '#4a90e2', home: '#27ae60', personal: '#9b59b6', holiday: '#e74c3c' }; } catch (_) { return { work: '#4a90e2', home: '#27ae60', personal: '#9b59b6', holiday: '#e74c3c' }; } }
  function selYear() { return window.selectedYear || new Date().getFullYear(); }
  function selMonth() { return window.selectedMonth != null ? window.selectedMonth : new Date().getMonth(); }

  /* ══════════════════════════════════════════════════════
     19. PRINT-FRIENDLY STYLESHEET
  ══════════════════════════════════════════════════════ */
  (function injectPrintCSS() {
    var style = document.createElement('style');
    style.id = 'dcf-print-css';
    style.textContent = [
      '@media print {',
      '  .bottom-ribbon, header, #syncStatusBar, #undoToast, #shortcutHints,',
      '  #dtPomodoro, #dtAgendaSidebar, #dtTaskBar, #dtBulkToggle, #dtBulkActs,',
      '  #miniMonthNav, #calDailyPanel, #cmdPalette, #searchModal,',
      '  .calendar-controls button, #categoryFilterBar, #layerToggles,',
      '  #activityChartRow, #calendarSummary, #quickAddBar,',
      '  .item-controls, .small-btn { display: none !important; }',
      '  body { background: #fff !important; padding: 0 !important; color: #000 !important; }',
      '  .page.hidden { display: none !important; }',
      '  #page-calendar { display: block !important; max-width: 100% !important; }',
      '  .calendar { width: 100% !important; max-width: 100% !important; box-shadow: none !important; border: 1px solid #ccc; }',
      '  .day { min-height: 80px !important; break-inside: avoid; border: 1px solid #eee !important; }',
      '  .event-preview { white-space: normal !important; font-size: 0.7rem !important; }',
      '  .event-preview .ep-label { display: inline !important; max-width: none !important; }',
      '  #calDailyPanel, #yearView, #twoWeekView { display: none !important; }',
      '  @page { margin: 1cm; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  })();

  /* ══════════════════════════════════════════════════════
     6. DARK MODE
  ══════════════════════════════════════════════════════ */
  (function initDarkMode() {
    var style = document.createElement('style');
    style.id = 'dcf-dark-mode-css';
    style.textContent = [
      'body.dark-mode { background: #1a1a2e !important; color: #e0e0e0 !important; }',
      'body.dark-mode header { background: #16213e !important; }',
      'body.dark-mode .bottom-ribbon { background: #16213e !important; border-color: #2a2a4a !important; }',
      'body.dark-mode .bottom-ribbon .r-item { color: #ccc !important; border-color: #2a2a4a !important; }',
      'body.dark-mode .bottom-ribbon .r-item.active { background: #1e3a6e !important; color: #7ab3f5 !important; border-color: #4a90e2 !important; }',
      'body.dark-mode .calendar { background: #16213e !important; box-shadow: none !important; }',
      'body.dark-mode .day { background: #1e2d45 !important; color: #e0e0e0 !important; box-shadow: none !important; }',
      'body.dark-mode .day.today { outline-color: #7ab3f5 !important; }',
      'body.dark-mode .day.selected { border-color: #4a90e2 !important; }',
      'body.dark-mode .event-preview { color: #d0d0d0 !important; }',
      'body.dark-mode .event-preview .ep-label { color: #ccc !important; }',
      'body.dark-mode .page { color: #e0e0e0 !important; }',
      'body.dark-mode input, body.dark-mode select, body.dark-mode textarea { background: #1e2d45 !important; color: #e0e0e0 !important; border-color: #2a2a4a !important; }',
      'body.dark-mode .small-btn { background: #2a3a5e !important; color: #ccc !important; }',
      'body.dark-mode .view-toggle-btn { background: #1e2d45 !important; color: #7ab3f5 !important; border-color: #2a2a4a !important; }',
      'body.dark-mode .view-toggle-btn.active { background: #4a90e2 !important; color: #fff !important; }',
      'body.dark-mode .cat-filter-btn { background: #1e2d45 !important; color: #ccc !important; border-color: #2a2a4a !important; }',
      'body.dark-mode .cat-filter-btn.active { background: #4a90e2 !important; color: #fff !important; }',
      'body.dark-mode #editModal .panel, body.dark-mode #jobModal .panel { background: #16213e !important; color: #e0e0e0 !important; }',
      'body.dark-mode .reminder-bar { background: #2a1f10 !important; color: #f0c07a !important; }',
      'body.dark-mode .bucket-card { background: #1e2d45 !important; border-color: #2a2a4a !important; }',
      'body.dark-mode .bucket-header { background: #1a2640 !important; }',
      'body.dark-mode .daily-view-timeline { background: #16213e !important; border-color: #2a2a4a !important; }',
      'body.dark-mode .dv-hour-slot { border-color: #2a2a4a !important; }',
      'body.dark-mode .week-grid { background: #16213e !important; }',
      'body.dark-mode .week-col { background: #1e2d45 !important; }',
      'body.dark-mode #dtAgendaSidebar, body.dark-mode #calDailyPanel { background: #16213e !important; color: #e0e0e0 !important; }',
      'body.dark-mode #calActivityRow { background: #16213e !important; }',
      'body.dark-mode .dcf-year-cell { background: #1e2d45 !important; }',
      'body.dark-mode .dcf-streak-badge { background: #2a3a5e !important; color: #ffa !important; }'
    ].join('\n');
    document.head.appendChild(style);

    function applyDarkMode(on) {
      document.body.classList.toggle('dark-mode', !!on);
      localStorage.setItem('darkMode', on ? '1' : '0');
      var btn = document.getElementById('dcfDarkModeBtn');
      if (btn) btn.textContent = on ? '☀️' : '🌙';
      var settingBtn = document.getElementById('dcfDarkModeSettingBtn');
      if (settingBtn) settingBtn.textContent = on ? '☀️ Disable Dark Mode' : '🌙 Enable Dark Mode';
    }

    function toggleDarkMode() { applyDarkMode(!document.body.classList.contains('dark-mode')); }
    window.dcfToggleDarkMode = toggleDarkMode;

    /* Restore from storage */
    var saved = localStorage.getItem('darkMode');
    if (saved === '1') {
      applyDarkMode(true);
    } else if (saved === null) {
      /* System preference */
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) applyDarkMode(true);
    }

    /* Inject header toggle button (moon icon, before settings gear) */
    document.addEventListener('DOMContentLoaded', function () {
      var header = document.getElementById('appHeader');
      if (header && !document.getElementById('dcfDarkModeBtn')) {
        var btn = document.createElement('button');
        btn.id = 'dcfDarkModeBtn';
        btn.className = 'header-btn';
        btn.title = 'Toggle dark mode';
        btn.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
        btn.setAttribute('aria-label', 'Toggle dark mode');
        btn.addEventListener('click', toggleDarkMode);
        /* Insert between inbox and title */
        var title = document.getElementById('appHeaderTitle');
        if (title) header.insertBefore(btn, title);
        else header.appendChild(btn);
      }

      /* Inject settings page toggle */
      var settingsPage = document.getElementById('page-settings');
      if (settingsPage && !document.getElementById('dcfDarkModeSettingBtn')) {
        var sec = document.createElement('div');
        sec.style.cssText = 'margin:16px 0;padding:12px 16px;background:#f5f7fa;border-radius:10px;display:flex;align-items:center;justify-content:space-between';
        sec.innerHTML = '<span style="font-weight:600">🌙 Dark Mode</span>';
        var sBtn = document.createElement('button');
        sBtn.id = 'dcfDarkModeSettingBtn';
        sBtn.className = 'small-btn';
        sBtn.style.cssText = 'background:#333;color:#fff;margin-left:12px';
        sBtn.textContent = document.body.classList.contains('dark-mode') ? '☀️ Disable Dark Mode' : '🌙 Enable Dark Mode';
        sBtn.addEventListener('click', toggleDarkMode);
        sec.appendChild(sBtn);
        var firstH3 = settingsPage.querySelector('h3');
        if (firstH3) firstH3.insertAdjacentElement('beforebegin', sec);
        else settingsPage.prepend(sec);
      }
    });
  })();

  /* ══════════════════════════════════════════════════════
     2. ANIMATED VIEW TRANSITIONS
  ══════════════════════════════════════════════════════ */
  (function injectTransitionCSS() {
    var style = document.createElement('style');
    style.id = 'dcf-transitions-css';
    style.textContent = [
      '@keyframes dcfFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }',
      '.dcf-anim-fade { animation: dcfFadeIn 0.22s ease; }',
      '#calendar.dcf-anim-fade, #weekView.dcf-anim-fade, #twoWeekView.dcf-anim-fade, #yearView.dcf-anim-fade { animation: dcfFadeIn 0.22s ease; }',
      '.dv-event-block { transition: box-shadow 0.15s, opacity 0.15s; }',
      '.dcf-count-badge { position:absolute;top:4px;right:4px;background:rgba(74,144,226,0.85);color:#fff;font-size:0.62rem;font-weight:700;border-radius:8px;padding:1px 5px;line-height:1.3;pointer-events:none;z-index:5; }',
      '.dcf-recur-icon { font-size:0.65rem;opacity:0.8;vertical-align:middle;margin-left:2px; }',
      '.dcf-weather-badge { position:absolute;bottom:2px;right:3px;font-size:0.68rem;color:#555;pointer-events:none;z-index:4;background:rgba(255,255,255,0.85);border-radius:4px;padding:0 2px;line-height:1.4; }',
      'body.dark-mode .dcf-weather-badge { background:rgba(30,45,69,0.85);color:#aad; }',
      '.dcf-layer-bar { display:flex;gap:5px;flex-wrap:wrap;align-items:center;max-width:720px;margin:0 auto 6px;padding:0 12px;box-sizing:border-box; }',
      '.dcf-layer-btn { padding:3px 10px;border-radius:16px;border:1.5px solid #ddd;background:#fff;cursor:pointer;font-size:0.78rem;user-select:none;transition:all 0.12s; }',
      '.dcf-layer-btn.active { background:#4a90e2;color:#fff;border-color:#4a90e2; }',
      '.dcf-layer-btn:hover:not(.active) { border-color:#4a90e2; }',
      'body.dark-mode .dcf-layer-btn { background:#1e2d45;color:#ccc;border-color:#2a2a4a; }',
      'body.dark-mode .dcf-layer-btn.active { background:#4a90e2;color:#fff; }',
      '.dcf-year-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;padding:10px 12px;max-width:900px;margin:0 auto; }',
      '.dcf-year-month { background:#fff;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,0.07);padding:8px 10px; }',
      'body.dark-mode .dcf-year-month { background:#16213e; }',
      '.dcf-year-month-title { font-weight:700;font-size:0.8rem;color:#4a90e2;margin-bottom:6px;text-align:center; }',
      '.dcf-year-days { display:grid;grid-template-columns:repeat(7,1fr);gap:2px; }',
      '.dcf-year-cell { width:100%;aspect-ratio:1;border-radius:2px;cursor:pointer;transition:transform 0.1s; }',
      '.dcf-year-cell:hover { transform:scale(1.3);z-index:2;position:relative; }',
      '.dcf-2week-grid { display:grid;grid-template-columns:repeat(7,1fr);gap:4px;background:#fff;border-radius:10px;box-shadow:0 1px 8px rgba(0,0,0,0.07);padding:8px;box-sizing:border-box;min-width:560px; }',
      'body.dark-mode .dcf-2week-grid { background:#16213e; }',
      '.dcf-week-time-block { position:relative;font-size:0.7rem;border-radius:4px;padding:2px 5px;margin-bottom:1px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border-left:3px solid; }',
      '.dcf-activity-bar { background:#fff;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,0.07);padding:12px 16px;max-width:900px;margin:0 auto 12px;box-sizing:border-box;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap; }',
      'body.dark-mode .dcf-activity-bar { background:#16213e; }',
      '.dcf-chart-title { font-weight:700;font-size:0.82rem;color:#555;margin-bottom:6px; }',
      'body.dark-mode .dcf-chart-title { color:#aaa; }',
      '.dcf-streak-badge { display:inline-flex;align-items:center;gap:4px;background:#fff3cd;border:1.5px solid #f0ad4e;border-radius:20px;padding:4px 12px;font-size:0.88rem;font-weight:700;color:#7a4f00;margin:6px 0; }',
      '#calDailyPanel { display:none; }',
      '@media (min-width: 901px) {',
      '  #calPageLayout { display:flex;gap:14px;align-items:flex-start; }',
      '  #calLeftPanel { flex:1;min-width:0; }',
      '  #calDailyPanel { display:block;width:270px;flex-shrink:0;background:#fff;border-radius:12px;',
      '    box-shadow:0 2px 14px rgba(0,0,0,0.08);padding:10px 12px;',
      '    position:sticky;top:72px;max-height:calc(100vh - 90px);overflow-y:auto;font-size:0.83rem; }',
      '  body.dark-mode #calDailyPanel { background:#16213e; }',
      '  #calDailyPanel h4 { margin:0 0 8px;font-size:0.9rem;color:#4a90e2; }',
      '}',
      '.dcf-split-event { padding:5px 8px;border-radius:6px;margin-bottom:4px;border-left:4px solid;font-size:0.8rem; }',
      '.dcf-split-time { font-size:0.72rem;color:#888;display:block; }',
      'body.dark-mode .dcf-split-time { color:#aaa; }',
      '.dcf-cmd-overlay { position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10002;display:none;align-items:flex-start;justify-content:center;padding-top:80px; }',
      '.dcf-cmd-overlay.open { display:flex; }',
      '.dcf-cmd-panel { background:#fff;border-radius:14px;width:94%;max-width:580px;box-shadow:0 8px 40px rgba(0,0,0,0.22);overflow:hidden; }',
      'body.dark-mode .dcf-cmd-panel { background:#16213e;color:#e0e0e0; }',
      '.dcf-cmd-input { width:100%;border:none;outline:none;padding:16px 20px;font-size:1.1rem;background:transparent;box-sizing:border-box; }',
      'body.dark-mode .dcf-cmd-input { color:#e0e0e0; }',
      '.dcf-cmd-divider { border:none;border-top:1px solid #eee;margin:0; }',
      'body.dark-mode .dcf-cmd-divider { border-color:#2a2a4a; }',
      '.dcf-cmd-results { max-height:320px;overflow-y:auto; }',
      '.dcf-cmd-item { display:flex;gap:10px;align-items:center;padding:10px 20px;cursor:pointer;transition:background 0.1s;font-size:0.9rem; }',
      '.dcf-cmd-item:hover, .dcf-cmd-item.focused { background:#f0f6ff; }',
      'body.dark-mode .dcf-cmd-item:hover, body.dark-mode .dcf-cmd-item.focused { background:#1e3055; }',
      '.dcf-cmd-hint { font-size:0.75rem;color:#888;padding:8px 20px 6px; }',
      '.dcf-resize-handle { position:absolute;bottom:0;left:0;right:0;height:7px;cursor:ns-resize;background:transparent;z-index:20; }',
      '.dcf-resize-handle:hover { background:rgba(74,144,226,0.3);border-radius:0 0 6px 6px; }',
      '.dv-hour-slot.dcf-slot-hover { background:rgba(74,144,226,0.06); }',
      '.dcf-suggest-btn { background:#e8f7ee;color:#27ae60;border:1.5px solid #27ae60;border-radius:8px;padding:4px 10px;font-size:0.8rem;cursor:pointer;margin-top:6px; }',
      '.dcf-suggest-result { background:#e8f7ee;border:1px solid #27ae60;border-radius:8px;padding:8px 12px;margin-top:6px;font-size:0.85rem;color:#155724; }',
      'body.dark-mode .dcf-suggest-result { background:#1a3020;color:#8fcd8f;border-color:#27ae60; }',
      '.dcf-goto-row { display:flex;align-items:center;gap:6px; }',
      '.dcf-goto-input { width:140px !important;padding:5px 8px !important;border-radius:8px !important;font-size:0.82rem !important;margin:0 !important; }',
      '.dcf-goto-btn { padding:5px 10px;border-radius:8px;background:#4a90e2;color:#fff;border:none;cursor:pointer;font-size:0.82rem; }'
    ].join('\n');
    document.head.appendChild(style);
  })();

  /* Animate a view container (call after showing it) */
  function animateView(el) {
    if (!el) return;
    el.classList.remove('dcf-anim-fade');
    void el.offsetWidth; /* reflow */
    el.classList.add('dcf-anim-fade');
  }

  /* ══════════════════════════════════════════════════════
     5. DAY-CELL EVENT COUNT BADGES  +
    10. LAYER TOGGLES  +
    11. RECURRING EVENT INDICATORS
     (All patched into generateCalendar)
  ══════════════════════════════════════════════════════ */

  var dcfLayers = { events: true, tasks: true, reminders: true };

  function injectLayerToggles() {
    if (document.getElementById('dcfLayerBar')) return;
    var filterBar = document.getElementById('categoryFilterBar');
    if (!filterBar) return;
    var bar = document.createElement('div');
    bar.id = 'dcfLayerBar';
    bar.className = 'dcf-layer-bar';
    [
      { key: 'events',    label: '📅 Events' },
      { key: 'tasks',     label: '✅ Tasks' },
      { key: 'reminders', label: '🔔 Reminders' }
    ].forEach(function (item) {
      var btn = document.createElement('button');
      btn.className = 'dcf-layer-btn' + (dcfLayers[item.key] ? ' active' : '');
      btn.textContent = item.label;
      btn.title = 'Toggle ' + item.key + ' visibility';
      btn.addEventListener('click', function () {
        dcfLayers[item.key] = !dcfLayers[item.key];
        btn.classList.toggle('active', dcfLayers[item.key]);
        try { generateCalendar(); } catch (_) {}
        try { if (window.selectedDay) showReminders(window.selectedDay); } catch (_) {}
      });
      bar.appendChild(btn);
    });
    filterBar.insertAdjacentElement('afterend', bar);
  }

  /* Patch generateCalendar once to add badges + recur icons + layer filtering */
  var _gcPatched = false;
  function patchGenerateCalendar() {
    if (_gcPatched || typeof window.generateCalendar !== 'function') return;
    _gcPatched = true;
    var orig = window.generateCalendar;
    window.generateCalendar = function () {
      orig.apply(this, arguments);
      try { applyCountBadgesAndRecurIcons(); } catch (_) {}
      try { applyLayerFilter(); } catch (_) {}
      try { applyWeatherBadges(); } catch (_) {}
      try { applySearchHighlight(); } catch (_) {}
    };
    window.generateCalendar._dcfPatched = true;
  }

  function applyCountBadgesAndRecurIcons() {
    var calEl = document.getElementById('calendar');
    if (!calEl) return;
    var yr = selYear(), mo = selMonth();
    var monthStart = yr + '-' + p2(mo + 1) + '-01';
    var daysInMonth = new Date(yr, mo + 1, 0).getDate();
    var monthEnd = yr + '-' + p2(mo + 1) + '-' + p2(daysInMonth);
    var evts = safeGetEvts(monthStart, monthEnd);
    var tasks = safeTasks();
    var rems = safeRems();

    calEl.querySelectorAll('.day[data-day]').forEach(function (cell) {
      var day = parseInt(cell.dataset.day, 10);
      var ymd = yr + '-' + p2(mo + 1) + '-' + p2(day);

      /* Remove old badge */
      var old = cell.querySelector('.dcf-count-badge');
      if (old) old.remove();

      var dayEvts = evts.filter(function (e) { return nd(e.date) === ymd; });
      var dayTasks = tasks.filter(function (t) { return nd(t.date) === ymd; });
      var dayRems = (rems[ymd] || []).length;
      var total = dayEvts.length + dayTasks.length + dayRems;
      if (total === 0) return;

      /* Badge */
      var badge = document.createElement('span');
      badge.className = 'dcf-count-badge';
      var parts = [];
      if (dayEvts.length) parts.push(dayEvts.length + 'E');
      if (dayTasks.length) parts.push(dayTasks.length + 'T');
      if (dayRems) parts.push(dayRems + 'R');
      badge.textContent = parts.join(' ');
      cell.style.position = 'relative';
      cell.appendChild(badge);

      /* Recurring icons — add 🔁 to event chips for recurring events */
      var chips = cell.querySelectorAll('.event-preview[data-event-id]');
      chips.forEach(function (chip) {
        var evId = chip.dataset.eventId;
        var ev = null;
        for (var i = 0; i < dayEvts.length; i++) {
          if (String(dayEvts[i].id) === String(evId)) { ev = dayEvts[i]; break; }
        }
        if (!ev) return;
        if (ev.repeat && ev.repeat !== 'none') {
          if (!chip.querySelector('.dcf-recur-icon')) {
            var icon = document.createElement('span');
            icon.className = 'dcf-recur-icon';
            icon.textContent = '🔁';
            icon.title = 'Recurring: ' + ev.repeat;
            chip.appendChild(icon);
          }
        }
      });
    });
  }

  function applyLayerFilter() {
    var calEl = document.getElementById('calendar');
    if (!calEl) return;
    if (dcfLayers.events && dcfLayers.tasks && dcfLayers.reminders) return; /* all visible, skip */
    calEl.querySelectorAll('.event-preview').forEach(function (chip) {
      var kind = '';
      if (chip.classList.contains('task')) kind = 'tasks';
      else if (chip.classList.contains('reminder')) kind = 'reminders';
      else kind = 'events';
      chip.style.display = dcfLayers[kind] ? '' : 'none';
    });
  }

  /* ══════════════════════════════════════════════════════
     4. WEATHER FORECAST OVERLAY  (Open-Meteo, no API key)
  ══════════════════════════════════════════════════════ */
  var _weatherCache = null;
  var _weatherDate = null;
  var WMO_EMOJI = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
    45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌦️',
    61: '🌧️', 63: '🌧️', 65: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '🌨️', 77: '🌨️',
    80: '🌦️', 81: '🌦️', 82: '⛈️',
    85: '🌨️', 86: '🌨️',
    95: '⛈️', 96: '⛈️', 99: '⛈️'
  };

  function fetchWeather() {
    if (!navigator.geolocation) return;
    var today = todayISO();
    if (_weatherDate === today && _weatherCache) { applyWeatherBadges(); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude.toFixed(4);
      var lon = pos.coords.longitude.toFixed(4);
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
        '&daily=weathercode,temperature_2m_max&forecast_days=7&timezone=auto';
      fetch(url).then(function (r) { return r.json(); }).then(function (data) {
        if (!data.daily) return;
        _weatherCache = {};
        _weatherDate = today;
        var dates = data.daily.time || [];
        var codes = data.daily.weathercode || [];
        var temps = data.daily.temperature_2m_max || [];
        for (var i = 0; i < dates.length; i++) {
          _weatherCache[dates[i]] = { emoji: WMO_EMOJI[codes[i]] || '🌡️', temp: Math.round(temps[i]) };
        }
        applyWeatherBadges();
      }).catch(function () { /* silent fail */ });
    }, function () { /* permission denied – silent */ }, { timeout: 5000 });
  }

  function applyWeatherBadges() {
    if (!_weatherCache) return;
    var calEl = document.getElementById('calendar');
    if (!calEl) return;
    var yr = selYear(), mo = selMonth();
    calEl.querySelectorAll('.day[data-day]').forEach(function (cell) {
      var day = parseInt(cell.dataset.day, 10);
      var ymd = yr + '-' + p2(mo + 1) + '-' + p2(day);
      var old = cell.querySelector('.dcf-weather-badge');
      if (old) old.remove();
      var w = _weatherCache[ymd];
      if (!w) return;
      cell.style.position = 'relative';
      var badge = document.createElement('span');
      badge.className = 'dcf-weather-badge';
      badge.title = w.temp + '°';
      badge.textContent = w.emoji + w.temp + '°';
      cell.appendChild(badge);
    });
  }

  /* ══════════════════════════════════════════════════════
     1. YEAR HEATMAP VIEW
  ══════════════════════════════════════════════════════ */
  function renderYearView(year) {
    var container = document.getElementById('yearView');
    if (!container) return;
    year = year || selYear();
    var today = todayISO();

    /* Count items per day for the whole year */
    var yearStart = year + '-01-01';
    var yearEnd   = year + '-12-31';
    var evts = safeGetEvts(yearStart, yearEnd);
    var tasks = safeTasks();
    var rems = safeRems();
    var countMap = {};
    evts.forEach(function (e) { var d = nd(e.date); if (d) countMap[d] = (countMap[d] || 0) + 1; });
    tasks.forEach(function (t) { var d = nd(t.date); if (d && d >= yearStart && d <= yearEnd) countMap[d] = (countMap[d] || 0) + 1; });
    Object.keys(rems).forEach(function (dk) { if (dk >= yearStart && dk <= yearEnd) countMap[dk] = (countMap[dk] || 0) + (rems[dk] || []).length; });

    var maxCount = Math.max(1, Math.max.apply(null, Object.values(countMap).concat([0])));

    function intensityColor(cnt) {
      if (!cnt) return '#eee';
      var pct = Math.min(1, cnt / maxCount);
      var r = Math.round(74 + (0 - 74) * pct);
      var g = Math.round(144 + (80 - 144) * pct);
      var b = Math.round(226 + (180 - 226) * pct);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var grid = document.createElement('div');
    grid.className = 'dcf-year-grid';

    /* Year heading */
    var heading = document.createElement('div');
    heading.style.cssText = 'grid-column:1/-1;display:flex;align-items:center;gap:12px;margin-bottom:4px';
    var prevYrBtn = document.createElement('button');
    prevYrBtn.className = 'view-toggle-btn';
    prevYrBtn.textContent = '‹ ' + (year - 1);
    prevYrBtn.addEventListener('click', function () { renderYearView(year - 1); });
    var yrLabel = document.createElement('span');
    yrLabel.style.cssText = 'font-weight:700;font-size:1.1rem;flex:1;text-align:center';
    yrLabel.textContent = '📆 ' + year;
    var nextYrBtn = document.createElement('button');
    nextYrBtn.className = 'view-toggle-btn';
    nextYrBtn.textContent = (year + 1) + ' ›';
    nextYrBtn.addEventListener('click', function () { renderYearView(year + 1); });
    heading.appendChild(prevYrBtn);
    heading.appendChild(yrLabel);
    heading.appendChild(nextYrBtn);
    grid.appendChild(heading);

    for (var m = 0; m < 12; m++) {
      var monthDiv = document.createElement('div');
      monthDiv.className = 'dcf-year-month';
      var titleDiv = document.createElement('div');
      titleDiv.className = 'dcf-year-month-title';
      titleDiv.textContent = MONTH_NAMES[m] + ' ' + year;
      monthDiv.appendChild(titleDiv);

      /* Day-of-week headers */
      var daysGrid = document.createElement('div');
      daysGrid.className = 'dcf-year-days';
      ['S','M','T','W','T','F','S'].forEach(function (d) {
        var hdr = document.createElement('div');
        hdr.style.cssText = 'font-size:0.58rem;color:#999;text-align:center;font-weight:600';
        hdr.textContent = d;
        daysGrid.appendChild(hdr);
      });

      /* Blank cells for first-day offset */
      var firstDow = new Date(year, m, 1).getDay();
      for (var b = 0; b < firstDow; b++) {
        var blank = document.createElement('div');
        daysGrid.appendChild(blank);
      }

      var daysInM = new Date(year, m + 1, 0).getDate();
      for (var d = 1; d <= daysInM; d++) {
        var ymd = year + '-' + p2(m + 1) + '-' + p2(d);
        var cnt = countMap[ymd] || 0;
        var cell = document.createElement('div');
        cell.className = 'dcf-year-cell';
        cell.style.background = intensityColor(cnt);
        if (ymd === today) { cell.style.outline = '2px solid #e74c3c'; cell.style.outlineOffset = '1px'; }
        cell.title = ymd + (cnt ? ': ' + cnt + ' item' + (cnt > 1 ? 's' : '') : '');
        (function (yr2, mo2, day2) {
          cell.addEventListener('click', function () {
            window.selectedYear = yr2;
            window.selectedMonth = mo2;
            window.selectedDay = day2;
            /* Switch to month view */
            var monthBtn = document.getElementById('viewMonthBtn');
            if (monthBtn) monthBtn.click();
            try { generateCalendar(); showReminders(day2); } catch (_) {}
          });
        })(year, m, d);
        daysGrid.appendChild(cell);
      }

      monthDiv.appendChild(daysGrid);
      grid.appendChild(monthDiv);
    }

    container.innerHTML = '';
    container.appendChild(grid);
    animateView(container);
  }

  /* ══════════════════════════════════════════════════════
     7. TWO-WEEK VIEW
  ══════════════════════════════════════════════════════ */
  function render2WeekView() {
    var container = document.getElementById('twoWeekView');
    if (!container) return;
    var today = new Date();
    var startDate = new Date(selYear(), selMonth(), window.selectedDay || today.getDate());
    /* Snap to start of current week */
    var dow = startDate.getDay();
    startDate.setDate(startDate.getDate() - dow);

    var todayStr = todayISO();
    var ws = new Date(startDate);
    var we = new Date(startDate);
    we.setDate(we.getDate() + 13);
    var startISO = ws.getFullYear() + '-' + p2(ws.getMonth() + 1) + '-' + p2(ws.getDate());
    var endISO   = we.getFullYear() + '-' + p2(we.getMonth() + 1) + '-' + p2(we.getDate());
    var evts = safeGetEvts(startISO, endISO);
    var tasks = safeTasks();
    var rems = safeRems();

    var wrap = document.createElement('div');
    wrap.style.cssText = 'overflow-x:auto;max-width:100%;margin:0 auto 12px';

    for (var week = 0; week < 2; week++) {
      var grid = document.createElement('div');
      grid.className = 'dcf-2week-grid';
      grid.style.marginBottom = '6px';

      for (var i = 0; i < 7; i++) {
        var d = new Date(startDate);
        d.setDate(startDate.getDate() + week * 7 + i);
        var ymd = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
        var isToday = ymd === todayStr;
        var isSelected = (d.getFullYear() === selYear() && d.getMonth() === selMonth() && d.getDate() === (window.selectedDay || 0));
        var isWknd = d.getDay() === 0 || d.getDay() === 6;

        var col = document.createElement('div');
        col.className = 'week-col';
        col.style.background = isWknd ? '#f0ecfa' : '#f0f7ff';
        col.style.borderRadius = '8px';
        col.style.padding = '4px';
        col.style.minHeight = '80px';

        var hdr = document.createElement('div');
        hdr.className = 'week-col-header' + (isToday ? ' today' : '') + (isSelected ? ' selected' : '');
        hdr.textContent = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()] + ' ' + d.getDate();
        hdr.style.cursor = 'pointer';
        (function (dd) {
          hdr.addEventListener('click', function () {
            window.selectedYear = dd.getFullYear();
            window.selectedMonth = dd.getMonth();
            window.selectedDay = dd.getDate();
            render2WeekView();
            try { showReminders(dd.getDate()); } catch (_) {}
          });
        })(d);
        col.appendChild(hdr);

        var dcs = safeDomainColors();
        evts.filter(function (e) { return nd(e.date) === ymd; }).forEach(function (ev) {
          var chip = document.createElement('div');
          chip.className = 'week-chip event';
          var repeatIcon = (ev.repeat && ev.repeat !== 'none') ? ' 🔁' : '';
          chip.textContent = (ev.emoji || '') + ' ' + (ev.time ? ev.time + ' ' : '') + (ev.title || '') + repeatIcon;
          chip.style.borderLeftColor = dcs[ev.domain || 'personal'] || '#4a90e2';
          chip.title = ev.title || '';
          col.appendChild(chip);
        });
        tasks.filter(function (t) { return nd(t.date) === ymd; }).forEach(function (t) {
          var chip = document.createElement('div');
          chip.className = 'week-chip task';
          chip.textContent = (t.done ? '✅' : '⬜') + ' ' + (t.title || t.text || '');
          col.appendChild(chip);
        });
        var dayRems = rems[ymd] || [];
        if (dayRems.length) {
          var chip = document.createElement('div');
          chip.className = 'week-chip reminder';
          chip.textContent = '🔔 ' + dayRems.length + ' reminder' + (dayRems.length > 1 ? 's' : '');
          col.appendChild(chip);
        }

        grid.appendChild(col);
      }
      wrap.appendChild(grid);
    }

    /* Week range label */
    var we2 = new Date(startDate); we2.setDate(startDate.getDate() + 13);
    var ml = document.getElementById('monthLabel');
    if (ml) {
      var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      ml.textContent = MONTHS[startDate.getMonth()] + ' ' + startDate.getDate() + ' – ' + MONTHS[we2.getMonth()] + ' ' + we2.getDate() + ', ' + we2.getFullYear();
    }

    container.innerHTML = '';
    container.appendChild(wrap);
    animateView(container);
  }

  /* ══════════════════════════════════════════════════════
     3. TIME-BLOCK WEEK VIEW  (proportional duration blocks)
  ══════════════════════════════════════════════════════ */
  var _weekTimelineMode = false;
  var _weekViewPatched = false;

  function patchWeekView() {
    if (_weekViewPatched || typeof window.renderWeekView !== 'function') return;
    _weekViewPatched = true;
    var orig = window.renderWeekView;
    window.renderWeekView = function () {
      if (!_weekTimelineMode) { orig.apply(this, arguments); applyWeekViewRecurIcons(); return; }
      renderWeekTimeline();
    };
    window.renderWeekView._dcfPatched = true;
  }

  function applyWeekViewRecurIcons() {
    var container = document.getElementById('weekView');
    if (!container) return;
    /* Add 🔁 to week chips for recurring events */
    container.querySelectorAll('.week-chip.event').forEach(function (chip) {
      if (chip.textContent.indexOf('🔁') === -1) {
        /* We can't easily identify which event a chip belongs to by content alone — 
           the chip's click handler uses event id. Check dataset if available. */
        /* Minimal: scan chip text against events and add icon if recurring */
      }
    });
  }

  function renderWeekTimeline() {
    var container = document.getElementById('weekView');
    if (!container) return;

    /* Get week start */
    var yr = selYear(), mo = selMonth(), day = window.selectedDay || 1;
    var ws = new Date(yr, mo, day);
    var dow = ws.getDay();
    ws.setDate(ws.getDate() - dow);
    var we = new Date(ws); we.setDate(ws.getDate() + 6);

    var startISO = ws.getFullYear() + '-' + p2(ws.getMonth() + 1) + '-' + p2(ws.getDate());
    var endISO   = we.getFullYear() + '-' + p2(we.getMonth() + 1) + '-' + p2(we.getDate());
    var evts = safeGetEvts(startISO, endISO);
    var todayStr = todayISO();
    var dcs = safeDomainColors();

    var HOUR_PX = 50; /* px per hour in timeline */
    var RANGE_START = 7; /* 7 AM */
    var RANGE_END = 22;  /* 10 PM */
    var totalHours = RANGE_END - RANGE_START;

    /* Build grid */
    var outerWrap = document.createElement('div');
    outerWrap.style.cssText = 'overflow-x:auto;max-width:100%';
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:40px repeat(7,1fr);min-width:560px;background:#fff;border-radius:10px;box-shadow:0 1px 8px rgba(0,0,0,0.07);padding:8px;box-sizing:border-box;position:relative';
    if (document.body.classList.contains('dark-mode')) grid.style.background = '#16213e';

    /* Column headers */
    grid.appendChild(document.createElement('div')); /* gutter */
    for (var i = 0; i < 7; i++) {
      var d = new Date(ws); d.setDate(ws.getDate() + i);
      var ymd = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
      var isToday = ymd === todayStr;
      var hdr = document.createElement('div');
      hdr.className = 'week-col-header' + (isToday ? ' today' : '');
      hdr.textContent = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()] + ' ' + d.getDate();
      hdr.style.cssText = 'text-align:center;padding:4px 2px;font-size:0.78rem;';
      grid.appendChild(hdr);
    }

    /* Hour rows */
    for (var h = RANGE_START; h < RANGE_END; h++) {
      var gutterLbl = document.createElement('div');
      gutterLbl.style.cssText = 'font-size:0.65rem;color:#999;text-align:right;padding-right:4px;height:' + HOUR_PX + 'px;display:flex;align-items:flex-start;padding-top:2px;box-sizing:border-box';
      gutterLbl.textContent = (h < 10 ? '0' : '') + h + ':00';
      grid.appendChild(gutterLbl);

      for (var col = 0; col < 7; col++) {
        var d2 = new Date(ws); d2.setDate(ws.getDate() + col);
        var ymd2 = d2.getFullYear() + '-' + p2(d2.getMonth() + 1) + '-' + p2(d2.getDate());
        var cell = document.createElement('div');
        cell.style.cssText = 'border-top:1px solid #f0f0f0;height:' + HOUR_PX + 'px;position:relative;box-sizing:border-box';
        if (document.body.classList.contains('dark-mode')) cell.style.borderColor = '#2a2a4a';

        /* Render events that start during this hour */
        evts.filter(function (e) { return nd(e.date) === ymd2 && e.time; }).forEach(function (ev) {
          var startM = timeToMinutes(ev.time);
          var endM = ev.endTime ? timeToMinutes(ev.endTime) : startM + 60;
          var evH = Math.floor(startM / 60);
          if (evH !== h) return;
          var topPct = ((startM % 60) / 60) * 100;
          var heightPct = Math.max(20, ((endM - startM) / 60) * HOUR_PX);
          var color = dcs[ev.domain || 'personal'] || '#4a90e2';
          var block = document.createElement('div');
          block.className = 'dcf-week-time-block';
          block.style.cssText = 'position:absolute;top:' + topPct + '%;left:1px;right:1px;height:' + heightPct + 'px;background:' + hexToRgba2(color, 0.15) + ';border-left-color:' + color + ';z-index:3;';
          var repeatIcon = (ev.repeat && ev.repeat !== 'none') ? ' 🔁' : '';
          block.textContent = (ev.emoji || '') + ' ' + (ev.title || '') + repeatIcon;
          block.title = (ev.time || '') + ' – ' + (ev.endTime || '') + ': ' + (ev.title || '');
          (function (id) { block.addEventListener('click', function () { try { editEvent(id); } catch (_) {} }); })(ev.id);
          cell.appendChild(block);
        });

        grid.appendChild(cell);
      }
    }

    container.innerHTML = '';
    outerWrap.appendChild(grid);
    container.appendChild(outerWrap);

    /* Update month label */
    var ml = document.getElementById('monthLabel');
    var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (ml) ml.textContent = MONTHS[ws.getMonth()] + ' ' + ws.getDate() + ' – ' + MONTHS[we.getMonth()] + ' ' + we.getDate() + ', ' + we.getFullYear();
    animateView(container);
  }

  function timeToMinutes(t) {
    if (!t) return 0;
    var m = t.match(/(\d{1,2}):(\d{2})/);
    if (!m) return 0;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function hexToRgba2(hex, a) {
    if (!hex || hex[0] !== '#') return 'rgba(74,144,226,' + a + ')';
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ══════════════════════════════════════════════════════
     13. ACTIVITY SUMMARY CHART  +  14. TIME ALLOCATION DONUT
  ══════════════════════════════════════════════════════ */
  function renderActivityChart() {
    var chartEl = document.getElementById('dcfActivitySvg');
    var donutEl = document.getElementById('dcfDonutSvg');
    if (!chartEl && !donutEl) return;

    var yr = selYear(), mo = selMonth();
    var daysInMonth = new Date(yr, mo + 1, 0).getDate();
    var monthStart = yr + '-' + p2(mo + 1) + '-01';
    var monthEnd   = yr + '-' + p2(mo + 1) + '-' + p2(daysInMonth);
    var evts = safeGetEvts(monthStart, monthEnd);
    var tasks = safeTasks();
    var rems = safeRems();

    /* Build per-day counts */
    var dayCounts = [];
    var domainTotals = { work: 0, personal: 0, home: 0 };

    for (var day = 1; day <= daysInMonth; day++) {
      var ymd = yr + '-' + p2(mo + 1) + '-' + p2(day);
      var dayEvts = evts.filter(function (e) { return nd(e.date) === ymd; });
      var dayTasks = tasks.filter(function (t) { return nd(t.date) === ymd; });
      var dayRems = (rems[ymd] || []).length;
      dayCounts.push(dayEvts.length + dayTasks.length + dayRems);

      dayEvts.forEach(function (e) {
        var dom = (e.domain || 'personal');
        if (domainTotals[dom] !== undefined) domainTotals[dom]++;
        else domainTotals.personal++;
      });
    }

    /* Bar chart SVG */
    if (chartEl) {
      var maxCount = Math.max(1, Math.max.apply(null, dayCounts));
      var svgW = Math.max(300, daysInMonth * 14);
      var svgH = 70;
      var barW = Math.floor(svgW / daysInMonth) - 1;
      var bars = dayCounts.map(function (cnt, i) {
        var barH = Math.max(2, Math.floor((cnt / maxCount) * (svgH - 18)));
        var x = i * (barW + 1);
        var y = svgH - 12 - barH;
        var color = cnt === 0 ? '#ddd' : '#4a90e2';
        var today = todayISO();
        var ymd2 = yr + '-' + p2(mo + 1) + '-' + p2(i + 1);
        if (ymd2 === today) color = '#e74c3c';
        return '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + barH +
          '" fill="' + color + '" rx="2" title="' + (i + 1) + ': ' + cnt + ' items"><title>' + (i + 1) + ': ' + cnt + ' items</title></rect>';
      }).join('');
      chartEl.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);
      chartEl.innerHTML = bars;
    }

    /* Donut chart SVG */
    if (donutEl) {
      var dcs = safeDomainColors();
      var total = domainTotals.work + domainTotals.personal + domainTotals.home || 1;
      var segments = [
        { key: 'work',     color: dcs.work,     pct: domainTotals.work     / total },
        { key: 'personal', color: dcs.personal,  pct: domainTotals.personal / total },
        { key: 'home',     color: dcs.home,      pct: domainTotals.home     / total }
      ].filter(function (s) { return s.pct > 0; });

      var cx = 50, cy = 50, r = 38, inner = 24;
      var paths = '';
      var startAngle = -Math.PI / 2;
      segments.forEach(function (seg) {
        var angle = seg.pct * 2 * Math.PI;
        var endAngle = startAngle + angle;
        var x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
        var x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle);
        var ix1 = cx + inner * Math.cos(startAngle), iy1 = cy + inner * Math.sin(startAngle);
        var ix2 = cx + inner * Math.cos(endAngle),   iy2 = cy + inner * Math.sin(endAngle);
        var large = angle > Math.PI ? 1 : 0;
        paths += '<path d="M' + ix1 + ',' + iy1 + ' L' + x1 + ',' + y1 +
          ' A' + r + ',' + r + ' 0 ' + large + ',1 ' + x2 + ',' + y2 +
          ' L' + ix2 + ',' + iy2 +
          ' A' + inner + ',' + inner + ' 0 ' + large + ',0 ' + ix1 + ',' + iy1 + ' Z"' +
          ' fill="' + seg.color + '"><title>' + seg.key + ': ' + Math.round(seg.pct * 100) + '%</title></path>';
        startAngle = endAngle;
      });

      donutEl.setAttribute('viewBox', '0 0 100 100');
      donutEl.innerHTML = paths + '<text x="50" y="54" text-anchor="middle" font-size="10" fill="#666">' + (total) + '</text>';
    }
  }

  function injectActivityChartRow() {
    if (document.getElementById('activityChartRow')) return;
    var calSummary = document.getElementById('calendarSummary');
    if (!calSummary) return;

    var row = document.createElement('div');
    row.id = 'activityChartRow';
    row.className = 'dcf-activity-bar';

    /* Bar chart section */
    var barSec = document.createElement('div');
    barSec.style.flex = '2';
    var barTitle = document.createElement('div');
    barTitle.className = 'dcf-chart-title';
    barTitle.textContent = '📊 Daily Activity (items/day)';
    var barSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    barSvg.id = 'dcfActivitySvg';
    barSvg.style.cssText = 'width:100%;height:70px;display:block';
    barSec.appendChild(barTitle);
    barSec.appendChild(barSvg);

    /* Donut chart section */
    var donutSec = document.createElement('div');
    donutSec.style.cssText = 'display:flex;flex-direction:column;align-items:center;min-width:80px';
    var donutTitle = document.createElement('div');
    donutTitle.className = 'dcf-chart-title';
    donutTitle.textContent = '🍩 By Domain';
    var donutSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    donutSvg.id = 'dcfDonutSvg';
    donutSvg.style.cssText = 'width:80px;height:80px';
    /* Legend */
    var legend = document.createElement('div');
    legend.id = 'dcfDonutLegend';
    legend.style.cssText = 'font-size:0.68rem;margin-top:4px;text-align:left';
    donutSec.appendChild(donutTitle);
    donutSec.appendChild(donutSvg);
    donutSec.appendChild(legend);

    row.appendChild(barSec);
    row.appendChild(donutSec);
    calSummary.insertAdjacentElement('beforebegin', row);
  }

  function refreshCharts() {
    injectActivityChartRow();
    renderActivityChart();
    /* Update donut legend */
    var legendEl = document.getElementById('dcfDonutLegend');
    if (legendEl) {
      var yr = selYear(), mo = selMonth();
      var daysInMonth = new Date(yr, mo + 1, 0).getDate();
      var monthStart = yr + '-' + p2(mo + 1) + '-01';
      var monthEnd   = yr + '-' + p2(mo + 1) + '-' + p2(daysInMonth);
      var evts = safeGetEvts(monthStart, monthEnd);
      var dcs = safeDomainColors();
      var totals = { work: 0, personal: 0, home: 0 };
      evts.forEach(function (e) { var d = e.domain || 'personal'; if (totals[d] !== undefined) totals[d]++; });
      legendEl.innerHTML = ['work','personal','home'].filter(function (k) { return totals[k] > 0; }).map(function (k) {
        return '<span style="display:inline-block;width:8px;height:8px;background:' + dcs[k] + ';border-radius:2px;margin-right:3px"></span>' + k + ':' + totals[k] + ' ';
      }).join('');
    }
  }

  /* ══════════════════════════════════════════════════════
     15. STREAK TRACKING
  ══════════════════════════════════════════════════════ */
  function calcStreak() {
    var tasks = safeTasks();
    /* Build set of dates with at least one completed task */
    var doneDates = {};
    tasks.forEach(function (t) {
      if (t.done && t.date) doneDates[nd(t.date)] = true;
    });
    var streak = 0;
    var d = new Date();
    while (true) {
      var iso = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
      if (!doneDates[iso]) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function renderStreak() {
    var el = document.getElementById('dcfStreakEl');
    if (!el) return;
    var s = calcStreak();
    if (s === 0) { el.style.display = 'none'; return; }
    el.style.display = 'inline-flex';
    el.innerHTML = '🔥 ' + s + '-day streak!';
    el.title = s + ' consecutive days with completed tasks';
  }

  function injectStreakBadge() {
    if (document.getElementById('dcfStreakEl')) return;
    var welcomeWrapper = document.getElementById('welcomeWrapper');
    if (!welcomeWrapper) return;
    var badge = document.createElement('div');
    badge.id = 'dcfStreakEl';
    badge.className = 'dcf-streak-badge';
    badge.style.display = 'none';
    welcomeWrapper.appendChild(badge);
    renderStreak();
  }

  /* ══════════════════════════════════════════════════════
     16. GO-TO-DATE QUICK PICKER
  ══════════════════════════════════════════════════════ */
  function injectGotoDate() {
    if (document.getElementById('dcfGotoRow')) return;
    var controls = document.querySelector('#page-calendar .calendar-controls');
    if (!controls) return;
    var row = document.createElement('div');
    row.id = 'dcfGotoRow';
    row.className = 'dcf-goto-row';
    row.style.cssText = 'margin-left:auto;display:flex;align-items:center;gap:4px';
    var input = document.createElement('input');
    input.id = 'dcfGotoInput';
    input.type = 'date';
    input.className = 'dcf-goto-input';
    input.title = 'Go to date (shortcut: G)';
    var btn = document.createElement('button');
    btn.className = 'dcf-goto-btn';
    btn.textContent = 'Go';
    function goToDate() {
      var val = input.value;
      if (!val) return;
      var parts = val.split('-');
      if (parts.length !== 3) return;
      var yr = parseInt(parts[0], 10), mo = parseInt(parts[1], 10) - 1, day = parseInt(parts[2], 10);
      if (isNaN(yr) || isNaN(mo) || isNaN(day)) return;
      window.selectedYear = yr;
      window.selectedMonth = mo;
      window.selectedDay = day;
      /* Switch to month view */
      var monthBtn = document.getElementById('viewMonthBtn');
      if (monthBtn) monthBtn.click();
      else {
        try { generateCalendar(); showReminders(day); } catch (_) {}
      }
    }
    btn.addEventListener('click', goToDate);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); goToDate(); } });
    row.appendChild(input);
    row.appendChild(btn);
    controls.appendChild(row);
  }

  /* Keyboard shortcut G → focus go-to date input */
  document.addEventListener('keydown', function (e) {
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'g' || e.key === 'G') {
      var calPage = document.getElementById('page-calendar');
      if (calPage && !calPage.classList.contains('hidden')) {
        var inp = document.getElementById('dcfGotoInput');
        if (inp) { e.preventDefault(); inp.focus(); }
      }
    }
  });

  /* ══════════════════════════════════════════════════════
     17. SPLIT-PANEL LAYOUT  (calendar + mini daily side panel)
  ══════════════════════════════════════════════════════ */
  function injectSplitPanel() {
    if (!isDesktop()) return;
    var calPage = document.getElementById('page-calendar');
    if (!calPage || document.getElementById('calPageLayout')) return;

    /* Wrap calendar + weekView in a flex layout */
    var calEl = document.getElementById('calendar');
    var weekView = document.getElementById('weekView');
    var twoWeekView = document.getElementById('twoWeekView');
    var yearView = document.getElementById('yearView');
    if (!calEl) return;

    /* Only wrap if not already wrapped */
    var layout = document.createElement('div');
    layout.id = 'calPageLayout';

    var leftPanel = document.createElement('div');
    leftPanel.id = 'calLeftPanel';

    /* Move calendar elements into left panel */
    [calEl, weekView, twoWeekView, yearView].forEach(function (el) {
      if (el) leftPanel.appendChild(el);
    });
    layout.appendChild(leftPanel);

    /* Right panel */
    var rightPanel = document.createElement('div');
    rightPanel.id = 'calDailyPanel';
    rightPanel.innerHTML = '<h4>📅 <span id="calDailyPanelDate">Today</span></h4><div id="calDailyPanelContent" style="font-size:0.82rem;color:#888">Select a day to see details.</div>';
    layout.appendChild(rightPanel);

    /* Find the category filter bar and insert layout after it */
    var layerBar = document.getElementById('dcfLayerBar') || document.getElementById('categoryFilterBar');
    if (layerBar) {
      layerBar.insertAdjacentElement('afterend', layout);
    } else {
      calPage.appendChild(layout);
    }
  }

  function refreshSplitPanel() {
    var panel = document.getElementById('calDailyPanel');
    if (!panel || panel.style.display === 'none') return;
    if (!isDesktop()) return;

    var yr = selYear(), mo = selMonth(), day = window.selectedDay;
    if (!day) return;

    var ymd = yr + '-' + p2(mo + 1) + '-' + p2(day);
    var dateLabel = document.getElementById('calDailyPanelDate');
    if (dateLabel) {
      var d = new Date(ymd + 'T12:00:00');
      dateLabel.textContent = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }

    var content = document.getElementById('calDailyPanelContent');
    if (!content) return;

    var evts = safeGetEvts(ymd, ymd);
    var tasks = safeTasks().filter(function (t) { return nd(t.date) === ymd; });
    var rems = safeRems()[ymd] || [];
    var dcs = safeDomainColors();

    var html = '';
    if (!evts.length && !tasks.length && !rems.length) {
      html = '<div style="color:#aaa;padding:8px 0;text-align:center">Nothing scheduled.</div>';
    } else {
      /* Sort events by time */
      var items = [];
      evts.forEach(function (e) { items.push({ kind: 'event', time: e.time || '23:59', title: e.title || '', color: dcs[e.domain || 'personal'] || '#4a90e2', emoji: e.emoji || '📌', endTime: e.endTime || '', repeat: e.repeat || 'none' }); });
      tasks.forEach(function (t) { items.push({ kind: 'task', time: t.time || '23:59', title: t.title || t.text || '', color: '#27ae60', emoji: t.done ? '✅' : '⬜', done: t.done }); });
      rems.forEach(function (r) { items.push({ kind: 'reminder', time: r.time || '23:59', title: r.text || '', color: '#e67e22', emoji: '🔔' }); });
      items.sort(function (a, b) { return a.time.localeCompare(b.time); });

      items.forEach(function (item) {
        var repeatIcon = (item.repeat && item.repeat !== 'none') ? ' 🔁' : '';
        var doneStyle = item.done ? 'text-decoration:line-through;opacity:0.65;' : '';
        html += '<div class="dcf-split-event" style="border-left-color:' + item.color + ';background:' + hexToRgba2(item.color, 0.1) + ';' + doneStyle + '">';
        html += '<span style="font-weight:600">' + item.emoji + ' ' + esc(item.title) + repeatIcon + '</span>';
        if (item.time && item.time !== '23:59') {
          html += '<span class="dcf-split-time">' + esc(item.time) + (item.endTime ? ' – ' + esc(item.endTime) : '') + '</span>';
        }
        html += '</div>';
      });
    }
    content.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════
     18. SEARCH-AS-YOU-TYPE CALENDAR HIGHLIGHTING
  ══════════════════════════════════════════════════════ */
  var _searchHighlightTerms = [];

  function applySearchHighlight() {
    var calEl = document.getElementById('calendar');
    if (!calEl) return;
    /* Remove existing highlights */
    calEl.querySelectorAll('.day.dcf-search-match').forEach(function (c) { c.classList.remove('dcf-search-match'); });
    if (!_searchHighlightTerms.length) return;

    var yr = selYear(), mo = selMonth();
    var daysInMonth = new Date(yr, mo + 1, 0).getDate();
    var monthStart = yr + '-' + p2(mo + 1) + '-01';
    var monthEnd   = yr + '-' + p2(mo + 1) + '-' + p2(daysInMonth);
    var evts = safeGetEvts(monthStart, monthEnd);
    var tasks = safeTasks();
    var rems = safeRems();

    var matchDays = {};
    _searchHighlightTerms.forEach(function (term) {
      var lower = term.toLowerCase();
      evts.forEach(function (e) {
        if ((e.title || '').toLowerCase().includes(lower) || (e.location || '').toLowerCase().includes(lower)) {
          var d = parseInt((nd(e.date) || '').slice(8, 10), 10);
          if (d) matchDays[d] = true;
        }
      });
      tasks.forEach(function (t) {
        if ((t.title || t.text || '').toLowerCase().includes(lower)) {
          var d = parseInt((nd(t.date) || '').slice(8, 10), 10);
          if (d && nd(t.date).slice(0, 7) === yr + '-' + p2(mo + 1)) matchDays[d] = true;
        }
      });
      var monthPfx = yr + '-' + p2(mo + 1);
      Object.keys(rems).forEach(function (dk) {
        if (!dk.startsWith(monthPfx)) return;
        (rems[dk] || []).forEach(function (r) {
          if ((r.text || '').toLowerCase().includes(lower)) {
            var d = parseInt(dk.slice(8, 10), 10);
            if (d) matchDays[d] = true;
          }
        });
      });
    });

    calEl.querySelectorAll('.day[data-day]').forEach(function (cell) {
      var d = parseInt(cell.dataset.day, 10);
      if (matchDays[d]) {
        cell.classList.add('dcf-search-match');
        cell.style.boxShadow = '0 0 0 2px #f39c12, 0 2px 8px rgba(243,156,18,0.3)';
      } else {
        cell.style.boxShadow = '';
      }
    });
  }

  /* Hook into search input */
  function wireSearchHighlight() {
    var inp = document.getElementById('searchInput');
    if (!inp || inp._dcfHighlightWired) return;
    inp._dcfHighlightWired = true;
    inp.addEventListener('input', function () {
      var term = (inp.value || '').trim();
      _searchHighlightTerms = term ? [term] : [];
      try { applySearchHighlight(); } catch (_) {}
    });
  }

  /* ══════════════════════════════════════════════════════
     12. SMART SCHEDULING  (Find next free time slot)
  ══════════════════════════════════════════════════════ */
  function findNextFreeSlot(dateISO, durationMins) {
    durationMins = durationMins || 60;
    var evts = safeGetEvts(dateISO, dateISO);
    /* Build list of busy intervals (in minutes since midnight) */
    var busy = [];
    evts.forEach(function (e) {
      if (!e.time) return;
      var start = timeToMinutes(e.time);
      var end = e.endTime ? timeToMinutes(e.endTime) : start + 60;
      if (end > start) busy.push([start, end]);
    });
    busy.sort(function (a, b) { return a[0] - b[0]; });

    /* Try slots from 8 AM to 9 PM in 30-min increments */
    for (var t = 8 * 60; t <= 21 * 60 - durationMins; t += 30) {
      var slotEnd = t + durationMins;
      var conflict = busy.some(function (b) { return t < b[1] && slotEnd > b[0]; });
      if (!conflict) return { start: t, end: slotEnd };
    }
    return null; /* No free slot found */
  }

  function minutesToTimeStr(m) {
    var h = Math.floor(m / 60), mm = m % 60;
    return p2(h) + ':' + p2(mm);
  }

  function injectSmartSchedule() {
    var eventTimeInput = document.getElementById('eventTime');
    if (!eventTimeInput || document.getElementById('dcfSuggestBtn')) return;
    var container = eventTimeInput.closest('.overlay-input') || eventTimeInput.parentElement;
    if (!container) return;
    var btn = document.createElement('button');
    btn.id = 'dcfSuggestBtn';
    btn.type = 'button';
    btn.className = 'dcf-suggest-btn';
    btn.textContent = '🕐 Find free time';
    var result = document.createElement('div');
    result.id = 'dcfSuggestResult';
    result.style.display = 'none';
    btn.addEventListener('click', function () {
      var dateEl = document.getElementById('eventDate');
      var dateVal = dateEl ? dateEl.value : todayISO();
      var slot = findNextFreeSlot(dateVal || todayISO(), 60);
      if (slot) {
        result.className = 'dcf-suggest-result';
        result.style.display = 'block';
        result.innerHTML = '✅ Next free hour: <b>' + minutesToTimeStr(slot.start) + ' – ' + minutesToTimeStr(slot.end) + '</b> ' +
          '<button type="button" style="background:#27ae60;color:#fff;border:none;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:0.78rem;margin-left:8px" id="dcfApplySuggest">Use this</button>';
        var applyBtn = document.getElementById('dcfApplySuggest');
        if (applyBtn) {
          applyBtn.addEventListener('click', function () {
            var timeEl = document.getElementById('eventTime');
            var endEl  = document.getElementById('eventEndTime');
            if (timeEl) timeEl.value = minutesToTimeStr(slot.start);
            if (endEl)  endEl.value  = minutesToTimeStr(slot.end);
            result.style.display = 'none';
          });
        }
      } else {
        result.className = 'dcf-suggest-result';
        result.style.display = 'block';
        result.style.background = '#fde8e8';
        result.style.color = '#900';
        result.style.borderColor = '#e74c3c';
        result.textContent = 'No free hour found on this date.';
      }
    });
    container.insertAdjacentElement('afterend', btn);
    btn.insertAdjacentElement('afterend', result);
  }

  /* ══════════════════════════════════════════════════════
     8. DRAG-TO-RESIZE EVENT DURATION  (daily timeline)
  ══════════════════════════════════════════════════════ */
  function wireResizeHandles() {
    var dailyView = document.getElementById('dailyView');
    if (!dailyView) return;
    /* Use MutationObserver to wire handles after each render */
    if (dailyView._dcfResizeObserver) return;
    var obs = new MutationObserver(function () { addResizeHandles(dailyView); });
    obs.observe(dailyView, { childList: true, subtree: true });
    dailyView._dcfResizeObserver = obs;
    addResizeHandles(dailyView);
  }

  function addResizeHandles(container) {
    container.querySelectorAll('.dv-event-block').forEach(function (block) {
      if (block.querySelector('.dcf-resize-handle')) return;
      if (block.classList.contains('dv-item-done')) return; /* Don't add to completed items */

      var handle = document.createElement('div');
      handle.className = 'dcf-resize-handle';
      handle.title = 'Drag to resize duration';
      handle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var startY = e.clientY;
        var startHeight = block.offsetHeight;
        var HOUR_HEIGHT = 60;

        function onMouseMove(mv) {
          var dy = mv.clientY - startY;
          var newH = Math.max(20, startHeight + dy);
          block.style.height = newH + 'px';
        }
        function onMouseUp() {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          /* Calculate new endTime from height */
          var top = parseFloat(block.style.top) || 0;
          var height = parseFloat(block.style.height) || HOUR_HEIGHT;
          var body = block.closest('.dv-body');
          if (!body) return;
          var totalBodyH = body.offsetHeight;
          /* Determine range from the grid (7AM–11PM = 16 hours) */
          var rangeHours = totalBodyH / HOUR_HEIGHT;
          var rangeStartMin = 7 * 60;
          var endMin = rangeStartMin + ((top + height) / HOUR_HEIGHT) * 60;
          endMin = Math.round(endMin / 15) * 15; /* snap to 15 min */
          var endTimeStr = minutesToTimeStr(Math.min(endMin, 23 * 60 + 45));
          /* Save to localStorage if we can identify the event */
          /* The block's title contains event info; try to match by dataset */
          var eventId = block.dataset && block.dataset.eventId;
          if (eventId) {
            try {
              var evts2 = typeof getEvents === 'function' ? getEvents() : JSON.parse(localStorage.getItem('events') || '[]');
              var ev = evts2.find(function (e) { return String(e.id) === String(eventId); });
              if (ev) {
                ev.endTime = endTimeStr;
                if (typeof setEvents === 'function') setEvents(evts2);
                else localStorage.setItem('events', JSON.stringify(evts2));
                try { window.dispatchEvent(new Event('app:data:updated')); } catch (_) {}
              }
            } catch (_) {}
          }
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
      block.style.position = 'absolute';
      block.appendChild(handle);
    });
  }

  /* ══════════════════════════════════════════════════════
     9. TIME-SLOT QUICK-CREATE  (click empty hour to pre-fill)
  ══════════════════════════════════════════════════════ */
  function wireTimeSlotCreate() {
    var dailyView = document.getElementById('dailyView');
    if (!dailyView || dailyView._dcfSlotWired) return;
    dailyView._dcfSlotWired = true;
    dailyView.addEventListener('click', function (e) {
      var slot = e.target.closest('.dv-hour-slot');
      if (!slot) return;
      /* Don't fire if clicking inside an event block */
      if (e.target.closest('.dv-event-block')) return;
      var body = slot.closest('.dv-body');
      if (!body) return;
      var rect = body.getBoundingClientRect();
      var HOUR_HEIGHT = 60;
      var bodyH = body.offsetHeight;
      var rangeHours = bodyH / HOUR_HEIGHT;
      var rangeStartH = 7;
      var relY = e.clientY - rect.top;
      var clickMin = rangeStartH * 60 + (relY / HOUR_HEIGHT) * 60;
      var snapped = Math.round(clickMin / 30) * 30;
      var timeStr = minutesToTimeStr(Math.min(snapped, 23 * 60));
      /* Navigate to events page and pre-fill time */
      var dateStr = (typeof window.dailyViewGetDate === 'function') ? window.dailyViewGetDate() : todayISO();
      try { if (typeof showView === 'function') showView('events'); } catch (_) {}
      setTimeout(function () {
        var timeEl = document.getElementById('eventTime');
        var dateEl = document.getElementById('eventDate');
        var titleEl = document.getElementById('eventTitle');
        if (timeEl) timeEl.value = timeStr;
        if (dateEl) dateEl.value = dateStr;
        if (titleEl) { titleEl.focus(); titleEl.select(); }
      }, 50);
    });

    /* Hover highlight */
    dailyView.addEventListener('mouseover', function (e) {
      var slot = e.target.closest('.dv-hour-slot');
      if (slot && !e.target.closest('.dv-event-block')) slot.classList.add('dcf-slot-hover');
    });
    dailyView.addEventListener('mouseout', function (e) {
      var slot = e.target.closest('.dv-hour-slot');
      if (slot) slot.classList.remove('dcf-slot-hover');
    });
  }

  /* ══════════════════════════════════════════════════════
     20. COMMAND PALETTE  (Ctrl+P)
  ══════════════════════════════════════════════════════ */
  var COMMANDS = [
    { icon: '🗓️', label: 'Go to today',        hint: '',                action: function () { var n = new Date(); window.selectedYear = n.getFullYear(); window.selectedMonth = n.getMonth(); window.selectedDay = n.getDate(); try { generateCalendar(); showReminders(n.getDate()); } catch (_) {} try { showView('calendar'); } catch (_) {} } },
    { icon: '📅', label: 'Go to Calendar',      hint: '2',               action: function () { try { showView('calendar'); } catch (_) {} } },
    { icon: '🏠', label: 'Go to Today page',    hint: '1',               action: function () { try { showView('today'); } catch (_) {} } },
    { icon: '✅', label: 'Go to Tasks',          hint: '4',               action: function () { try { showView('tasks'); } catch (_) {} } },
    { icon: '📥', label: 'Go to Inbox',          hint: '',                action: function () { try { showView('inbox'); } catch (_) {} } },
    { icon: '⚙️', label: 'Go to Settings',       hint: '',                action: function () { try { showView('settings'); } catch (_) {} } },
    { icon: '🌙', label: 'Toggle Dark Mode',     hint: '',                action: function () { window.dcfToggleDarkMode && window.dcfToggleDarkMode(); } },
    { icon: '📆', label: 'Switch to Year View',  hint: '',                action: function () { var btn = document.getElementById('viewYearBtn'); if (btn) btn.click(); } },
    { icon: '2W', label: 'Switch to 2-Week View', hint: '',               action: function () { var btn = document.getElementById('view2WeekBtn'); if (btn) btn.click(); } },
    { icon: '📊', label: 'Switch to Month View', hint: '',                action: function () { var btn = document.getElementById('viewMonthBtn'); if (btn) btn.click(); } },
    { icon: '🗒️', label: 'Switch to Week View',  hint: '',                action: function () { var btn = document.getElementById('viewWeekBtn'); if (btn) btn.click(); } },
    { icon: '⏱️', label: 'Switch Week → Timeline mode', hint: '',         action: function () { _weekTimelineMode = !_weekTimelineMode; try { renderWeekView(); } catch (_) {} } },
    { icon: '📤', label: 'Export calendar (ICS)', hint: '',               action: function () { var btn = document.getElementById('icsExportBtn') || document.querySelector('[id*="icsExport"]'); if (btn) btn.click(); } },
    { icon: '🖨️', label: 'Print calendar',        hint: '',               action: function () { window.print(); } },
    { icon: '🔍', label: 'Open search',            hint: 'Ctrl+K',        action: function () { try { openSearch(); } catch (_) {} } }
  ];

  function injectCommandPalette() {
    if (document.getElementById('dcfCmdPalette')) return;
    var overlay = document.createElement('div');
    overlay.id = 'dcfCmdPalette';
    overlay.className = 'dcf-cmd-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Command palette');
    overlay.innerHTML = [
      '<div class="dcf-cmd-panel">',
      '  <input id="dcfCmdInput" class="dcf-cmd-input" type="text" placeholder="Type a command or search…" autocomplete="off" />',
      '  <hr class="dcf-cmd-divider" />',
      '  <div id="dcfCmdResults" class="dcf-cmd-results"></div>',
      '  <div class="dcf-cmd-hint">↑↓ navigate · Enter select · Esc close · <kbd>Ctrl+P</kbd> to open</div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    var input = overlay.querySelector('#dcfCmdInput');
    var results = overlay.querySelector('#dcfCmdResults');
    var focusIdx = 0;

    function closePalette() { overlay.classList.remove('open'); if (input) input.value = ''; renderCommands(''); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closePalette(); });

    function renderCommands(q) {
      results.innerHTML = '';
      focusIdx = 0;
      var term = (q || '').toLowerCase().trim();
      var filtered = COMMANDS.filter(function (c) { return !term || c.label.toLowerCase().includes(term) || (c.hint || '').toLowerCase().includes(term); });

      /* NLP quick-add command */
      if (q && q.trim().length > 2 && typeof parseQuickAdd === 'function') {
        try {
          var parsed = parseQuickAdd(q.trim());
          if (parsed && parsed.title) {
            var nlpItem = document.createElement('div');
            nlpItem.className = 'dcf-cmd-item';
            nlpItem.innerHTML = '<span style="font-size:1.2rem">✨</span> <span>Quick-add: <b>' + esc(parsed.title) + '</b>' + (parsed.date ? ' on ' + esc(parsed.date) : '') + (parsed.time ? ' at ' + esc(parsed.time) : '') + ' as <i>' + esc(parsed.kind || 'event') + '</i></span>';
            nlpItem.addEventListener('click', function () {
              closePalette();
              var quickInput = document.getElementById('quickAddInput');
              if (quickInput) {
                quickInput.value = q;
                quickInput.dispatchEvent(new Event('input'));
                var addBtn = document.getElementById('quickAddBtn');
                if (addBtn) setTimeout(function () { addBtn.click(); }, 50);
              }
            });
            results.appendChild(nlpItem);
          }
        } catch (_) {}
      }

      /* Go-to-date shortcut: "go to 2026-05-15" */
      var gotoMatch = q && q.trim().match(/^(?:go\s+to\s+|goto\s+|jump\s+to\s+)?(\d{4}-\d{2}-\d{2})$/i);
      if (!gotoMatch) gotoMatch = q && q.trim().match(/^(?:go\s+to\s+|goto\s+)(.+)$/i);
      if (gotoMatch) {
        var gotoVal = gotoMatch[1];
        var gotoItem = document.createElement('div');
        gotoItem.className = 'dcf-cmd-item';
        gotoItem.innerHTML = '<span style="font-size:1.2rem">📍</span> <span>Go to date: <b>' + esc(gotoVal) + '</b></span>';
        gotoItem.addEventListener('click', function () {
          closePalette();
          var gotoInput = document.getElementById('dcfGotoInput');
          if (gotoInput) { gotoInput.value = gotoVal; gotoInput.dispatchEvent(new Event('change')); }
          var gotoBtn = gotoInput && gotoInput.nextElementSibling;
          if (gotoBtn) gotoBtn.click();
        });
        results.appendChild(gotoItem);
      }

      if (!filtered.length && !results.children.length) {
        results.innerHTML = '<div style="padding:12px 20px;color:#888;font-size:0.85rem">No commands found.</div>';
        return;
      }

      filtered.forEach(function (cmd, idx) {
        var item = document.createElement('div');
        item.className = 'dcf-cmd-item' + (idx === 0 ? ' focused' : '');
        item.innerHTML = '<span style="font-size:1.2rem;min-width:24px">' + esc(cmd.icon) + '</span> <span style="flex:1">' + esc(cmd.label) + '</span>' + (cmd.hint ? '<kbd style="font-size:0.72rem;margin-left:8px">' + esc(cmd.hint) + '</kbd>' : '');
        item.addEventListener('click', function () { closePalette(); cmd.action(); });
        results.appendChild(item);
      });
    }

    function updateFocus() {
      var items = results.querySelectorAll('.dcf-cmd-item');
      items.forEach(function (el, i) { el.classList.toggle('focused', i === focusIdx); });
      if (items[focusIdx]) items[focusIdx].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', function () { renderCommands(input.value); });
    input.addEventListener('keydown', function (e) {
      var items = results.querySelectorAll('.dcf-cmd-item');
      if (e.key === 'ArrowDown') { e.preventDefault(); focusIdx = Math.min(focusIdx + 1, items.length - 1); updateFocus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusIdx = Math.max(focusIdx - 1, 0); updateFocus(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[focusIdx]) items[focusIdx].click();
      }
      else if (e.key === 'Escape') closePalette();
    });

    renderCommands('');
    window.dcfOpenCmdPalette = function () { overlay.classList.add('open'); setTimeout(function () { if (input) { input.value = ''; input.focus(); renderCommands(''); } }, 20); };
    window.dcfCloseCmdPalette = closePalette;
  }

  /* Ctrl+P keyboard shortcut */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      if (window.dcfOpenCmdPalette) window.dcfOpenCmdPalette();
    }
  });

  /* ══════════════════════════════════════════════════════
     VIEW TOGGLE WIRING  (Year + 2-Week + Week Timeline)
  ══════════════════════════════════════════════════════ */
  function injectViewButtons() {
    var viewToggleDiv = document.querySelector('#page-calendar .calendar-controls > div');
    if (!viewToggleDiv) return;

    /* 2-Week button */
    if (!document.getElementById('view2WeekBtn')) {
      var btn2W = document.createElement('button');
      btn2W.id = 'view2WeekBtn';
      btn2W.className = 'view-toggle-btn';
      btn2W.title = '2-week view';
      btn2W.textContent = '2W';
      viewToggleDiv.appendChild(btn2W);
    }

    /* Year button */
    if (!document.getElementById('viewYearBtn')) {
      var btnYr = document.createElement('button');
      btnYr.id = 'viewYearBtn';
      btnYr.className = 'view-toggle-btn';
      btnYr.title = 'Year heatmap view';
      btnYr.textContent = 'Year';
      viewToggleDiv.appendChild(btnYr);
    }

    /* Week timeline toggle */
    if (!document.getElementById('viewWeekTimelineBtn')) {
      var btnWL = document.createElement('button');
      btnWL.id = 'viewWeekTimelineBtn';
      btnWL.className = 'view-toggle-btn';
      btnWL.title = 'Switch week view to time-block timeline (when week view is active)';
      btnWL.textContent = '⏱';
      btnWL.style.opacity = '0.5';
      viewToggleDiv.appendChild(btnWL);
    }
  }

  function wireViewButtons() {
    /* Ensure view containers exist */
    var calPage = document.getElementById('page-calendar');
    if (!calPage) return;

    /* Create #twoWeekView if missing */
    if (!document.getElementById('twoWeekView')) {
      var tw = document.createElement('div');
      tw.id = 'twoWeekView';
      tw.style.display = 'none';
      tw.setAttribute('aria-label', '2-week view');
      var weekView = document.getElementById('weekView');
      if (weekView) weekView.insertAdjacentElement('afterend', tw);
      else calPage.appendChild(tw);
    }

    /* Create #yearView if missing */
    if (!document.getElementById('yearView')) {
      var yv = document.createElement('div');
      yv.id = 'yearView';
      yv.style.display = 'none';
      yv.setAttribute('aria-label', 'Year view');
      var tw2 = document.getElementById('twoWeekView');
      if (tw2) tw2.insertAdjacentElement('afterend', yv);
      else calPage.appendChild(yv);
    }

    var ALL_VIEWS = ['calendar','weekView','twoWeekView','yearView'];
    function hideAllCalViews() {
      ALL_VIEWS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      ['viewMonthBtn','viewWeekBtn','view2WeekBtn','viewYearBtn'].forEach(function (id) {
        var btn = document.getElementById(id);
        if (btn) btn.classList.remove('active');
      });
    }

    var monthBtn = document.getElementById('viewMonthBtn');
    var weekBtn  = document.getElementById('viewWeekBtn');
    var btn2W    = document.getElementById('view2WeekBtn');
    var btnYr    = document.getElementById('viewYearBtn');
    var btnWL    = document.getElementById('viewWeekTimelineBtn');

    /* Wrap existing month/week handlers by re-wiring */
    if (monthBtn && !monthBtn._dcfWired) {
      monthBtn._dcfWired = true;
      monthBtn.addEventListener('click', function () {
        hideAllCalViews();
        var cal = document.getElementById('calendar');
        if (cal) cal.style.display = '';
        monthBtn.classList.add('active');
        animateView(cal);
        refreshCharts();
      });
    }

    if (weekBtn && !weekBtn._dcfWired) {
      weekBtn._dcfWired = true;
      weekBtn.addEventListener('click', function () {
        hideAllCalViews();
        var wv = document.getElementById('weekView');
        if (wv) { wv.style.display = ''; animateView(wv); }
        weekBtn.classList.add('active');
        if (btnWL) btnWL.style.opacity = '1';
        refreshCharts();
      });
    }

    if (btn2W && !btn2W._dcfWired) {
      btn2W._dcfWired = true;
      btn2W.addEventListener('click', function () {
        hideAllCalViews();
        var tw3 = document.getElementById('twoWeekView');
        if (tw3) { tw3.style.display = ''; render2WeekView(); }
        btn2W.classList.add('active');
        refreshCharts();
      });
    }

    if (btnYr && !btnYr._dcfWired) {
      btnYr._dcfWired = true;
      btnYr.addEventListener('click', function () {
        hideAllCalViews();
        var yv2 = document.getElementById('yearView');
        if (yv2) { yv2.style.display = ''; renderYearView(selYear()); }
        btnYr.classList.add('active');
      });
    }

    if (btnWL && !btnWL._dcfWired) {
      btnWL._dcfWired = true;
      btnWL.addEventListener('click', function () {
        _weekTimelineMode = !_weekTimelineMode;
        btnWL.style.background = _weekTimelineMode ? '#4a90e2' : '';
        btnWL.style.color = _weekTimelineMode ? '#fff' : '';
        try { renderWeekView(); } catch (_) {}
      });
    }
  }

  /* ══════════════════════════════════════════════════════
     BOOT / INITIALIZATION
  ══════════════════════════════════════════════════════ */
  function init() {
    patchGenerateCalendar();
    patchWeekView();

    injectViewButtons();
    wireViewButtons();
    injectLayerToggles();
    injectGotoDate();
    injectActivityChartRow();
    injectStreakBadge();
    injectCommandPalette();
    injectSmartSchedule();
    wireSearchHighlight();

    if (isDesktop()) {
      injectSplitPanel();
    }

    wireResizeHandles();
    wireTimeSlotCreate();

    fetchWeather();
    renderStreak();
  }

  /* ── Event listener hooks ── */
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(init, 450);
    /* Streak badge may need re-render after tasks load */
    setTimeout(renderStreak, 800);
  });

  window.addEventListener('view:show', function (e) {
    var view = e.detail && e.detail.view;
    if (view === 'calendar') {
      setTimeout(function () {
        patchGenerateCalendar();
        patchWeekView();
        injectViewButtons();
        wireViewButtons();
        injectLayerToggles();
        injectGotoDate();
        injectActivityChartRow();
        refreshCharts();
        if (isDesktop()) injectSplitPanel();
        wireSearchHighlight();
        fetchWeather();
      }, 80);
    }
    if (view === 'today') {
      injectStreakBadge();
      renderStreak();
    }
    if (view === 'events') {
      setTimeout(injectSmartSchedule, 80);
    }
  });

  window.addEventListener('app:data:updated', function () {
    try { refreshCharts(); } catch (_) {}
    try { refreshSplitPanel(); } catch (_) {}
    try { renderStreak(); } catch (_) {}
    try { applyCountBadgesAndRecurIcons(); } catch (_) {}
  });

  /* Refresh split panel whenever a day is selected */
  window.addEventListener('dailyview:datechange', function () {
    try { refreshSplitPanel(); } catch (_) {}
  });

  /* After generateCalendar runs, refresh split panel for selected day */
  var _origShowReminders = window.showReminders;
  if (typeof _origShowReminders === 'function' && !_origShowReminders._dcfWrapped) {
    window.showReminders = function (day) {
      _origShowReminders.apply(this, arguments);
      try { refreshSplitPanel(); } catch (_) {}
    };
    window.showReminders._dcfWrapped = true;
  }

})();
