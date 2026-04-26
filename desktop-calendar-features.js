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
      '  #miniMonthNav, #calDailyPanel, #calDaySummaryPanel, #calUpcomingPanel, .cal-panel-expand-tab, #cmdPalette, #searchModal,',
      '  .calendar-controls button, #categoryFilterWrap, #layerToggles,',
      '  #activityChartRow, #calendarSummary, #quickAddBar,',
      '  .item-controls, .small-btn { display: none !important; }',
      '  body { background: #fff !important; padding: 0 !important; color: #000 !important; }',
      '  .page.hidden { display: none !important; }',
      '  #page-calendar { display: block !important; max-width: 100% !important; }',
      '  .calendar { width: 100% !important; max-width: 100% !important; box-shadow: none !important; border: 1px solid #ccc; }',
      '  .day { min-height: 80px !important; break-inside: avoid; border: 1px solid #eee !important; }',
      '  .event-preview { white-space: normal !important; font-size: 0.7rem !important; }',
      '  .event-preview .ep-label { display: inline !important; max-width: none !important; }',
      '  #calDailyPanel, #calDaySummaryPanel, #calUpcomingPanel, .cal-panel-expand-tab, #yearView, #twoWeekView { display: none !important; }',
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
      'body.dark-mode .week-row-split { background: #16213e !important; }',
      'body.dark-mode .dcf-2week-row-split { background: #16213e !important; }',
      'body.dark-mode #dtAgendaSidebar, body.dark-mode .cal-side-panel { background: #16213e !important; color: #e0e0e0 !important; }',
      'body.dark-mode #calActivityRow { background: #16213e !important; }',
      'body.dark-mode .dcf-year-cell { background: #1e2d45 !important; }',
      'body.dark-mode .dcf-streak-badge { background: #2a3a5e !important; color: #ffa !important; }',
      'body.dark-mode .dcf-day-timeline { color: #e0e0e0; }'
    ].join('\n');
    document.head.appendChild(style);

    function applyDarkMode(on) {
      document.body.classList.toggle('dark-mode', !!on);
      localStorage.setItem('darkMode', on ? '1' : '0');
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

    /* Auto-follow system dark/light changes at runtime (e.g. sunset auto-switch) */
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var handler = function(e) {
        /* Only follow system if the user has NOT manually set a preference */
        if (localStorage.getItem('darkMode') === null) {
          applyDarkMode(e.matches);
        }
      };
      if (mq.addEventListener) {
        mq.addEventListener('change', handler);
      } else if (mq.addListener) {
        /* Safari < 14 fallback */
        mq.addListener(handler);
      }
    }

    /* Dark mode toggle is available in Settings page only */
    document.addEventListener('DOMContentLoaded', function () {
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
      '.dcf-count-badge { position:absolute;top:4px;right:4px;background:rgba(74,144,226,0.85);color:#fff;font-size:0.62rem;font-weight:700;border-radius:8px;padding:1px 5px;line-height:1.3;pointer-events:auto;z-index:5;cursor:default; }',
      '.dcf-count-badge-tooltip { display:none;position:absolute;top:100%;right:0;margin-top:4px;background:#fff;color:#333;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.18);padding:8px 10px;font-size:0.75rem;font-weight:400;min-width:180px;max-width:260px;z-index:100;text-align:left;line-height:1.4; }',
      '.dcf-count-badge:hover .dcf-count-badge-tooltip { display:block; }',
      'body.dark-mode .dcf-count-badge-tooltip { background:#1e2d45;color:#e0e0e0;box-shadow:0 4px 16px rgba(0,0,0,0.4); }',
      '.dcf-badge-tt-item { padding:2px 0;border-bottom:1px solid #f0f0f0; }',
      '.dcf-badge-tt-item:last-child { border-bottom:none; }',
      'body.dark-mode .dcf-badge-tt-item { border-bottom-color:#2a2a4a; }',
      '.dcf-badge-tt-kind { display:inline-block;font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;padding:0 4px;border-radius:3px;margin-right:4px;vertical-align:middle; }',
      '.dcf-badge-tt-kind-event { background:#e8f0fe;color:#3367d6; }',
      '.dcf-badge-tt-kind-task { background:#e6f4ea;color:#1e7e34; }',
      '.dcf-badge-tt-kind-reminder { background:#fef3e0;color:#c77c00; }',
      'body.dark-mode .dcf-badge-tt-kind-event { background:#1e3055;color:#7ab3f5; }',
      'body.dark-mode .dcf-badge-tt-kind-task { background:#1a3020;color:#8fcd8f; }',
      'body.dark-mode .dcf-badge-tt-kind-reminder { background:#3a2a10;color:#f0c060; }',
      '.dcf-recur-icon { font-size:0.65rem;opacity:0.8;vertical-align:middle;margin-left:2px; }',
      '.dcf-weather-badge { position:absolute;bottom:2px;right:3px;font-size:0.68rem;color:#555;pointer-events:none;z-index:4;background:rgba(255,255,255,0.85);border-radius:4px;padding:0 2px;line-height:1.4; }',
      'body.dark-mode .dcf-weather-badge { background:rgba(30,45,69,0.85);color:#aad; }',
      '.dcf-layer-bar { display:flex;gap:5px;flex-wrap:wrap;align-items:center;max-width:100%;margin:0 auto 6px;padding:0 4px;box-sizing:border-box; }',
      '.dcf-layer-btn { padding:3px 10px;border-radius:16px;border:1.5px solid #ddd;background:#fff;cursor:pointer;font-size:0.78rem;user-select:none;transition:all 0.12s; }',
      '.dcf-layer-btn.active { background:var(--ios-accent,#4a90e2);color:#fff;border-color:var(--ios-accent,#4a90e2); }',
      '.dcf-layer-btn:hover:not(.active) { border-color:var(--ios-accent,#4a90e2); }',
      'body.dark-mode .dcf-layer-btn { background:#1e2d45;color:#ccc;border-color:#2a2a4a; }',
      'body.dark-mode .dcf-layer-btn.active { background:var(--ios-accent,#4a90e2);color:#fff; }',
      '.dcf-year-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;padding:10px 4px;max-width:100%;margin:0 auto; }',
      '.dcf-year-month { background:#fff;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,0.07);padding:8px 10px; }',
      'body.dark-mode .dcf-year-month { background:#16213e; }',
      '.dcf-year-month-title { font-weight:700;font-size:0.8rem;color:#4a90e2;margin-bottom:6px;text-align:center; }',
      '.dcf-year-days { display:grid;grid-template-columns:repeat(7,1fr);gap:2px; }',
      '.dcf-year-cell { width:100%;aspect-ratio:1;border-radius:2px;cursor:pointer;transition:transform 0.1s; }',
      '.dcf-year-cell:hover { transform:scale(1.3);z-index:2;position:relative; }',
      '.dcf-2week-grid { display:grid;grid-template-columns:repeat(7,1fr);gap:4px;background:#fff;border-radius:10px;box-shadow:0 1px 8px rgba(0,0,0,0.07);padding:8px;box-sizing:border-box;min-width:560px; }',
      'body.dark-mode .dcf-2week-grid { background:#16213e; }',
      '.dcf-week-time-block { position:relative;font-size:0.7rem;border-radius:4px;padding:2px 5px;margin-bottom:1px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border-left:3px solid; }',
      '.dcf-activity-bar { background:#fff;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,0.07);padding:12px 16px;max-width:100%;margin:0 auto 12px;box-sizing:border-box;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap; }',
      'body.dark-mode .dcf-activity-bar { background:#16213e; }',
      '.dcf-chart-title { font-weight:700;font-size:0.82rem;color:#555;margin-bottom:6px; }',
      'body.dark-mode .dcf-chart-title { color:#aaa; }',
      '.dcf-streak-badge { display:inline-flex;align-items:center;gap:4px;background:#fff3cd;border:1.5px solid #f0ad4e;border-radius:20px;padding:4px 12px;font-size:0.88rem;font-weight:700;color:#7a4f00;margin:6px 0; }',
      '#calSidePanel { display:none; }',
      '@media (min-width: 901px) {',
      '  .day { overflow:visible; }',
      '  #calPageLayout { display:flex;gap:6px;align-items:flex-start;max-width:100%;padding:0;box-sizing:border-box; }',
      '  #calCenterPanel { flex:1;min-width:0;overflow:hidden; }',
      '  .cal-side-panel { display:flex;flex-direction:column;width:220px;flex-shrink:1;min-width:180px;background:#fff;border-radius:12px;',
      '    box-shadow:0 2px 14px rgba(0,0,0,0.08);padding:10px 12px;',
      '    font-size:0.83rem;overflow:hidden;',
      '    transition:width 0.25s ease,padding 0.25s ease,opacity 0.25s ease; }',
      '  .cal-side-panel > div:last-child { flex:1;overflow-y:auto;min-height:0; }',
      '  body.dark-mode .cal-side-panel { background:#16213e;color:#e0e0e0; }',
      '  .cal-side-panel h4 { margin:0 0 8px;font-size:0.9rem;color:#4a90e2;display:flex;align-items:center;justify-content:space-between; }',
      '  .cal-side-panel.collapsed { width:0;min-width:0;padding:0;overflow:hidden;opacity:0;pointer-events:none;border:none; }',
      '  .cal-panel-toggle { background:none;border:none;cursor:pointer;font-size:1rem;padding:0 2px;color:#888;line-height:1;flex-shrink:0; }',
      '  .cal-panel-toggle:hover { color:#4a90e2; }',
      /* Expand tab is position:fixed so it never occupies flex-row space */
      '  .cal-panel-expand-tab { display:none;position:fixed;right:12px;top:50%;transform:translateY(-50%);width:28px;',
      '    background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.12);cursor:pointer;z-index:500;',
      '    padding:10px 2px;text-align:center;font-size:0.85rem;color:#888;writing-mode:vertical-rl;',
      '    user-select:none;transition:background 0.15s,box-shadow 0.15s; }',
      '  .cal-panel-expand-tab:hover { background:#f0f6ff;color:#4a90e2;box-shadow:0 4px 18px rgba(74,144,226,0.2); }',
      '  body.dark-mode .cal-panel-expand-tab { background:#16213e;color:#aaa; }',
      '  body.dark-mode .cal-panel-expand-tab:hover { background:#1e3055;color:#7ab3f5; }',
      '  .cal-panel-expand-tab.visible { display:block; }',
      '  #calSidePanel { display:block; }',
      '}',
      '.dcf-split-event { padding:5px 8px;border-radius:6px;margin-bottom:4px;border-left:4px solid;font-size:0.8rem;cursor:pointer;transition:background 0.15s; }',
      '.dcf-split-event:hover { filter:brightness(0.95); }',
      '.dcf-split-kind { display:inline-block;font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;padding:1px 5px;border-radius:4px;margin-right:4px;vertical-align:middle; }',
      '.dcf-split-kind-event { background:#e8f0fe;color:#3367d6; }',
      '.dcf-split-kind-task { background:#e6f4ea;color:#1e7e34; }',
      '.dcf-split-kind-reminder { background:#fef3e0;color:#c77c00; }',
      'body.dark-mode .dcf-split-kind-event { background:#1e3055;color:#7ab3f5; }',
      'body.dark-mode .dcf-split-kind-task { background:#1a3020;color:#8fcd8f; }',
      'body.dark-mode .dcf-split-kind-reminder { background:#3a2a10;color:#f0c060; }',
      '.dcf-split-time { font-size:0.72rem;color:#888;display:block; }',
      'body.dark-mode .dcf-split-time { color:#aaa; }',
      '.dcf-day-timeline { position:relative;display:flex; }',
      '.dcf-day-timeline-gutter { width:36px;flex-shrink:0;position:relative; }',
      '.dcf-day-timeline-gutter-lbl { position:absolute;right:4px;font-size:0.62rem;color:#999;font-weight:600;line-height:1; }',
      '.dcf-day-timeline-body { flex:1;position:relative;border-left:1px solid #e8e8e8; }',
      'body.dark-mode .dcf-day-timeline-body { border-left-color:#2a2a4a; }',
      '.dcf-day-timeline-slot { position:absolute;left:0;right:0;border-bottom:1px solid #f0f0f0;height:0; }',
      'body.dark-mode .dcf-day-timeline-slot { border-color:#2a2a4a; }',
      '.dcf-day-timeline-half { position:absolute;left:0;right:0;border-bottom:1px dashed #f5f5f5;height:0; }',
      'body.dark-mode .dcf-day-timeline-half { border-color:#222; }',
      '.dcf-day-timeline-block { position:absolute;border-radius:4px;padding:2px 4px;overflow:hidden;cursor:pointer;font-size:0.7rem;line-height:1.2;border-left:3px solid;z-index:5;box-sizing:border-box; }',
      '.dcf-day-timeline-block:hover { filter:brightness(0.95); }',
      '.dcf-day-timeline-now { position:absolute;left:0;right:0;height:2px;background:#e74c3c;z-index:10;pointer-events:none; }',
      '.dcf-day-timeline-now-dot { position:absolute;left:-4px;top:-3px;width:8px;height:8px;border-radius:50%;background:#e74c3c; }',
      '.dcf-day-untimed-section { margin-top:8px;border-top:1px solid #eee;padding-top:6px; }',
      'body.dark-mode .dcf-day-untimed-section { border-color:#2a2a4a; }',
      '.dcf-day-untimed-header { font-size:0.65rem;color:#999;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;margin-bottom:4px; }',
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
      '.dcf-goto-btn { padding:5px 10px;border-radius:8px;background:var(--ios-accent,#4a90e2);color:#fff;border:none;cursor:pointer;font-size:0.82rem; }'
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
    /* Inject Events/Tasks/Reminders toggles directly into the categoryFilterBar */
    var filterBar = document.getElementById('categoryFilterBar');
    if (!filterBar || filterBar.querySelector('.dcf-layer-btn')) return;

    /* Add a separator label */
    var sep = document.createElement('span');
    sep.className = 'dcf-filter-sep';
    sep.style.cssText = 'font-size:0.8rem;color:#666;margin-left:6px;margin-right:2px;font-weight:600';
    sep.textContent = 'Types:';
    filterBar.appendChild(sep);

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
      filterBar.appendChild(btn);
    });
  }

  /* Patch generateCalendar once to add badges + recur icons + layer filtering + dblclick */
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
      try { refreshCharts(); } catch (_) {}
      try { syncPanelHeights(); } catch (_) {}
      try { wireDayDblClick(); } catch (_) {}
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

      /* Build hover tooltip with item list */
      var tooltip = document.createElement('div');
      tooltip.className = 'dcf-count-badge-tooltip';
      var ttHtml = '';
      dayEvts.forEach(function (ev) {
        var timeStr = ev.time ? esc(ev.time) + ' ' : '';
        var repeatIcon = (ev.repeat && ev.repeat !== 'none') ? ' 🔁' : '';
        ttHtml += '<div class="dcf-badge-tt-item"><span class="dcf-badge-tt-kind dcf-badge-tt-kind-event">Event</span>' + timeStr + esc(ev.emoji || '📌') + ' ' + esc(ev.title || '') + repeatIcon + '</div>';
      });
      dayTasks.forEach(function (t) {
        var doneIcon = t.done ? '✅' : '⬜';
        var doneCls = t.done ? ' style="text-decoration:line-through;opacity:0.65"' : '';
        ttHtml += '<div class="dcf-badge-tt-item"' + doneCls + '><span class="dcf-badge-tt-kind dcf-badge-tt-kind-task">Task</span>' + doneIcon + ' ' + esc(t.title || t.text || '') + '</div>';
      });
      var dayRemsList = rems[ymd] || [];
      dayRemsList.forEach(function (r) {
        var timeStr = r.time ? esc(r.time) + ' ' : '';
        ttHtml += '<div class="dcf-badge-tt-item"><span class="dcf-badge-tt-kind dcf-badge-tt-kind-reminder">Reminder</span>' + timeStr + '🔔 ' + esc(r.text || '') + '</div>';
      });
      tooltip.innerHTML = ttHtml;
      badge.appendChild(tooltip);

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
  function render2WeekView(targetContainer) {
    var container = targetContainer || document.getElementById('twoWeekView');
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

    function buildCol(d) {
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
          render2WeekView(container);
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

      return col;
    }

    for (var week = 0; week < 2; week++) {
      if (isDesktop()) {
        /* Desktop: 4+3 split */
        var row1 = document.createElement('div');
        row1.className = 'dcf-2week-row-split week-row-first';
        var row2 = document.createElement('div');
        row2.className = 'dcf-2week-row-split week-row-second';
        for (var i = 0; i < 7; i++) {
          var d = new Date(startDate);
          d.setDate(startDate.getDate() + week * 7 + i);
          var col = buildCol(d);
          if (i < 4) row1.appendChild(col);
          else row2.appendChild(col);
        }
        wrap.appendChild(row1);
        wrap.appendChild(row2);
        if (week === 0) {
          /* Visual separator between the two weeks */
          var sep = document.createElement('div');
          sep.style.cssText = 'height:8px';
          wrap.appendChild(sep);
        }
      } else {
        /* Mobile: 7-col grid */
        var grid = document.createElement('div');
        grid.className = 'dcf-2week-grid';
        grid.style.marginBottom = '6px';
        for (var i = 0; i < 7; i++) {
          var d = new Date(startDate);
          d.setDate(startDate.getDate() + week * 7 + i);
          grid.appendChild(buildCol(d));
        }
        wrap.appendChild(grid);
      }
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
  window.renderTwoWeekView = render2WeekView;

  /* ══════════════════════════════════════════════════════
     3. TIME-BLOCK WEEK VIEW  (proportional duration blocks)
  ══════════════════════════════════════════════════════ */
  var _weekTimelineMode = false;
  var _weekViewPatched = false;

  function patchWeekView() {
    if (_weekViewPatched || typeof window.renderWeekView !== 'function') return;
    /* The new renderWeekView is already a full timeline – no wrapping needed */
    if (window._weekViewIsTimeline) { _weekViewPatched = true; return; }
    _weekViewPatched = true;
    var orig = window.renderWeekView;
    window.renderWeekView = function () {
      if (!_weekTimelineMode) { orig.apply(this, arguments); return; }
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
          (function (id, occDate) { block.addEventListener('click', function () { try { editEvent(id, occDate); } catch (_) {} }); })(ev.id, ev.occurrenceDate);
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
     Enhanced with: stacked bars (E/T/R), day labels,
     click-to-navigate, weekly avg line, monthly summary
     stats, and previous-month comparison.
  ══════════════════════════════════════════════════════ */

  /* Chart display mode: 'stacked' (E/T/R breakdown) or 'total' */
  var _chartMode = 'stacked';

  /* Gather per-day breakdown for a given year/month */
  function gatherMonthData(yr, mo) {
    var daysInMonth = new Date(yr, mo + 1, 0).getDate();
    var monthStart = yr + '-' + p2(mo + 1) + '-01';
    var monthEnd   = yr + '-' + p2(mo + 1) + '-' + p2(daysInMonth);
    var evts = safeGetEvts(monthStart, monthEnd);
    var tasks = safeTasks();
    var rems = safeRems();

    var dayData = []; /* { e, t, r, total } per day */
    var domainTotals = { work: 0, personal: 0, home: 0 };

    for (var day = 1; day <= daysInMonth; day++) {
      var ymd = yr + '-' + p2(mo + 1) + '-' + p2(day);
      var dayEvts = evts.filter(function (e) { return nd(e.date) === ymd; });
      var dayTasks = tasks.filter(function (t) { return nd(t.date) === ymd; });
      var dayRems = (rems[ymd] || []).length;
      dayData.push({ e: dayEvts.length, t: dayTasks.length, r: dayRems, total: dayEvts.length + dayTasks.length + dayRems });

      dayEvts.forEach(function (e) {
        var dom = (e.domain || 'personal');
        if (domainTotals[dom] !== undefined) domainTotals[dom]++;
        else domainTotals.personal++;
      });
    }
    return { dayData: dayData, domainTotals: domainTotals, daysInMonth: daysInMonth };
  }

  function renderActivityChart() {
    var chartEl = document.getElementById('dcfActivitySvg');
    var donutEl = document.getElementById('dcfDonutSvg');
    if (!chartEl && !donutEl) return;

    var yr = selYear(), mo = selMonth();
    var data = gatherMonthData(yr, mo);
    var dayData = data.dayData;
    var domainTotals = data.domainTotals;
    var daysInMonth = data.daysInMonth;

    /* Bar chart SVG */
    if (chartEl) {
      var maxCount = Math.max(1, Math.max.apply(null, dayData.map(function (d) { return d.total; })));
      var labelH = 14;   /* height reserved for day labels */
      var svgW = Math.max(300, daysInMonth * 16);
      var svgH = 100;
      var chartArea = svgH - labelH;
      var barW = Math.floor(svgW / daysInMonth) - 2;
      var todayStr = todayISO();

      var barsSvg = '';

      /* Stacked bar colours */
      var colEvt = '#4a90e2';  /* blue for events */
      var colTask = '#27ae60'; /* green for tasks */
      var colRem = '#e67e22';  /* orange for reminders */

      /* Compute weekly averages and per-day bucket index in a single pass */
      var weekSums = [];
      var weekCounts = [];
      var dayWeekBucket = []; /* bucket index per day */
      dayData.forEach(function (d, i) {
        var wk = Math.floor(i / 7);
        dayWeekBucket.push(wk);
        if (!weekSums[wk]) { weekSums[wk] = 0; weekCounts[wk] = 0; }
        weekSums[wk] += d.total;
        weekCounts[wk]++;
      });

      var avgLinePoints = [];
      dayData.forEach(function (d, i) {
        var x = i * (barW + 2);
        var ymd2 = yr + '-' + p2(mo + 1) + '-' + p2(i + 1);
        var isToday = ymd2 === todayStr;
        var totalH = Math.max(2, Math.floor((d.total / maxCount) * (chartArea - 6)));
        var tipText = 'Day ' + (i + 1) + ': ' + d.e + ' event' + (d.e !== 1 ? 's' : '') + ', ' + d.t + ' task' + (d.t !== 1 ? 's' : '') + ', ' + d.r + ' reminder' + (d.r !== 1 ? 's' : '');

        if (_chartMode === 'stacked' && d.total > 0) {
          /* Stacked: events on bottom, tasks in middle, reminders on top */
          var eH = Math.round((d.e / d.total) * totalH);
          var tH = Math.round((d.t / d.total) * totalH);
          var rH = totalH - eH - tH;
          if (rH < 0) rH = 0;

          var baseY = chartArea - totalH;
          /* Events segment (bottom) */
          if (eH > 0) {
            barsSvg += '<rect class="dcf-chart-bar" x="' + x + '" y="' + (baseY + rH + tH) + '" width="' + barW + '" height="' + eH +
              '" fill="' + (isToday ? '#c0392b' : colEvt) + '" rx="1"' +
              ' data-day="' + (i + 1) + '"><title>' + tipText + '</title></rect>';
          }
          /* Tasks segment (middle) */
          if (tH > 0) {
            barsSvg += '<rect class="dcf-chart-bar" x="' + x + '" y="' + (baseY + rH) + '" width="' + barW + '" height="' + tH +
              '" fill="' + (isToday ? '#e74c3c' : colTask) + '" rx="0"' +
              ' data-day="' + (i + 1) + '"><title>' + tipText + '</title></rect>';
          }
          /* Reminders segment (top) */
          if (rH > 0) {
            barsSvg += '<rect class="dcf-chart-bar" x="' + x + '" y="' + baseY + '" width="' + barW + '" height="' + rH +
              '" fill="' + (isToday ? '#ff6b6b' : colRem) + '" rx="1"' +
              ' data-day="' + (i + 1) + '"><title>' + tipText + '</title></rect>';
          }
        } else {
          /* Total mode or empty day */
          var barH = totalH;
          var y = chartArea - barH;
          var color = d.total === 0 ? '#ddd' : (isToday ? '#e74c3c' : '#4a90e2');
          barsSvg += '<rect class="dcf-chart-bar" x="' + x + '" y="' + y + '" width="' + barW + '" height="' + barH +
            '" fill="' + color + '" rx="2" data-day="' + (i + 1) + '"><title>Day ' + (i + 1) + ': ' + d.total + ' item' + (d.total !== 1 ? 's' : '') + '</title></rect>';
        }

        /* Day number labels – show every day or every other day for 31-day months */
        var showLabel = daysInMonth <= 28 || (i + 1) % 2 === 1;
        if (showLabel) {
          barsSvg += '<text x="' + (x + barW / 2) + '" y="' + (svgH - 1) + '" text-anchor="middle" font-size="7" class="dcf-day-label">' + (i + 1) + '</text>';
        }

        /* Build weekly average line point */
        var wk = dayWeekBucket[i];
        var avg = weekCounts[wk] > 0 ? weekSums[wk] / weekCounts[wk] : 0;
        var lineX = x + barW / 2;
        var lineY = chartArea - Math.floor((avg / maxCount) * (chartArea - 6));
        avgLinePoints.push(lineX + ',' + lineY);
      });
      if (avgLinePoints.length > 1) {
        barsSvg += '<polyline points="' + avgLinePoints.join(' ') + '" fill="none" stroke="#f39c12" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7">' +
          '<title>Weekly average</title></polyline>';
      }

      chartEl.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);
      chartEl.innerHTML = barsSvg;

      /* Click-to-navigate: clicking a bar selects that day (wire once) */
      if (!chartEl._dcfClickWired) {
        chartEl._dcfClickWired = true;
        chartEl.addEventListener('click', function (evt) {
          var target = evt.target;
          if (target.tagName === 'title') target = target.parentElement;
          var dayNum = target && target.getAttribute('data-day');
          if (!dayNum) return;
          dayNum = parseInt(dayNum, 10);
          if (isNaN(dayNum) || dayNum < 1) return;
          window.selectedDay = dayNum;
          try { generateCalendar(); } catch (_) {}
          try { showReminders(dayNum); } catch (_) {}
          try { refreshSplitPanel(); } catch (_) {}
        });
      }

      /* Hover tooltip — store current data on element so the handler reads fresh values each render */
      chartEl._dcfTooltipData = { dayData: dayData, yr: yr, mo: mo };
      wireBarTooltip(chartEl);

      /* Render monthly summary stats row */
      renderMonthlyStats(dayData, yr, mo);
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

  /* Render monthly summary stats below the activity chart */
  function renderMonthlyStats(dayData, yr, mo) {
    var statsEl = document.getElementById('dcfMonthlyStats');
    if (!statsEl) return;

    var totalItems = 0, totalEvents = 0, totalTasks = 0, totalRems = 0;
    var busiestDay = 0, busiestCount = 0;
    var activeDays = 0;
    dayData.forEach(function (d, i) {
      totalItems += d.total;
      totalEvents += d.e;
      totalTasks += d.t;
      totalRems += d.r;
      if (d.total > busiestCount) { busiestCount = d.total; busiestDay = i + 1; }
      if (d.total > 0) activeDays++;
    });
    var avg = dayData.length > 0 ? (totalItems / dayData.length).toFixed(1) : '0';

    /* Previous month comparison */
    var prevMo = mo === 0 ? 11 : mo - 1;
    var prevYr = mo === 0 ? yr - 1 : yr;
    var prevData = gatherMonthData(prevYr, prevMo);
    var prevTotal = 0;
    prevData.dayData.forEach(function (d) { prevTotal += d.total; });
    var prevAvg = prevData.daysInMonth > 0 ? (prevTotal / prevData.daysInMonth).toFixed(1) : '0';
    var diff = totalItems - prevTotal;
    var diffSign = diff > 0 ? '+' : '';
    var diffColor = diff > 0 ? '#27ae60' : (diff < 0 ? '#e74c3c' : '#888');
    var diffPct = prevTotal > 0 ? Math.round((diff / prevTotal) * 100) : 0;
    var diffLabel = prevTotal === 0 && totalItems > 0 ? 'new' : (diffPct !== 0 ? diffSign + diffPct + '%' : 'same');

    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    statsEl.innerHTML =
      '<div class="dcf-stat-card">' +
        '<div class="dcf-stat-value">' + totalItems + '</div>' +
        '<div class="dcf-stat-label">Total Items</div>' +
        '<div class="dcf-stat-sub">' + totalEvents + 'E · ' + totalTasks + 'T · ' + totalRems + 'R</div>' +
      '</div>' +
      '<div class="dcf-stat-card">' +
        '<div class="dcf-stat-value">' + avg + '</div>' +
        '<div class="dcf-stat-label">Avg / Day</div>' +
        '<div class="dcf-stat-sub">' + activeDays + ' of ' + dayData.length + ' active</div>' +
      '</div>' +
      '<div class="dcf-stat-card">' +
        '<div class="dcf-stat-value">' + (busiestCount > 0 ? busiestDay : '—') + '</div>' +
        '<div class="dcf-stat-label">Busiest Day</div>' +
        '<div class="dcf-stat-sub">' + busiestCount + ' item' + (busiestCount !== 1 ? 's' : '') + '</div>' +
      '</div>' +
      '<div class="dcf-stat-card">' +
        '<div class="dcf-stat-value" style="color:' + diffColor + '">' + diffSign + diff + '</div>' +
        '<div class="dcf-stat-label">vs ' + monthNames[prevMo] + '</div>' +
        '<div class="dcf-stat-sub" style="color:' + diffColor + '">' + diffLabel + ' · avg ' + prevAvg + '/d</div>' +
      '</div>';
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
    barSec.style.minWidth = '0';

    /* Title row with mode toggle */
    var titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap';
    var barTitle = document.createElement('div');
    barTitle.className = 'dcf-chart-title';
    barTitle.style.margin = '0';
    barTitle.textContent = '📊 Daily Activity (items/day)';

    /* Toggle button: stacked vs total */
    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'dcf-chart-mode-btn';
    toggleBtn.textContent = _chartMode === 'stacked' ? 'Stacked' : 'Total';
    toggleBtn.title = 'Toggle between stacked (E/T/R breakdown) and total view';
    toggleBtn.addEventListener('click', function () {
      _chartMode = _chartMode === 'stacked' ? 'total' : 'stacked';
      toggleBtn.textContent = _chartMode === 'stacked' ? 'Stacked' : 'Total';
      renderActivityChart();
    });

    titleRow.appendChild(barTitle);
    titleRow.appendChild(toggleBtn);

    /* Stacked legend */
    var stackLegend = document.createElement('div');
    stackLegend.id = 'dcfStackLegend';
    stackLegend.className = 'dcf-stack-legend';
    stackLegend.innerHTML =
      '<span><span class="dcf-legend-dot" style="background:var(--ios-accent,#4a90e2)"></span>Events</span>' +
      '<span><span class="dcf-legend-dot" style="background:#27ae60"></span>Tasks</span>' +
      '<span><span class="dcf-legend-dot" style="background:#e67e22"></span>Reminders</span>' +
      '<span><span class="dcf-legend-dot" style="background:#f39c12;width:12px;height:2px;border-radius:1px"></span>Wk Avg</span>';
    titleRow.appendChild(stackLegend);

    barSec.appendChild(titleRow);

    var barSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    barSvg.id = 'dcfActivitySvg';
    barSvg.style.cssText = 'width:100%;height:100px;display:block;cursor:pointer';
    barSec.appendChild(barSvg);

    /* Monthly stats row */
    var statsRow = document.createElement('div');
    statsRow.id = 'dcfMonthlyStats';
    statsRow.className = 'dcf-monthly-stats';
    barSec.appendChild(statsRow);

    /* Donut chart section */
    var donutSec = document.createElement('div');
    donutSec.style.cssText = 'display:flex;flex-direction:column;align-items:center;min-width:100px';
    var donutTitle = document.createElement('div');
    donutTitle.className = 'dcf-chart-title';
    donutTitle.textContent = '🍩 By Domain';
    var donutSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    donutSvg.id = 'dcfDonutSvg';
    donutSvg.style.cssText = 'width:90px;height:90px';
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
    /* Insert into the month nav row (above the calendar, right-aligned) */
    var monthNav = document.querySelector('#page-calendar .cal-month-nav');
    if (!monthNav) return;
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
    monthNav.appendChild(row);
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
     17. SPLIT-PANEL LAYOUT  (calendar + single combined side panel)
     The panel shows the hourly day view when a day is selected,
     and the upcoming view when no day is selected.
  ══════════════════════════════════════════════════════ */
  var _sideCollapsed = false;

  function injectSplitPanel() {
    if (!isDesktop()) return;
    var calPage = document.getElementById('page-calendar');
    if (!calPage || document.getElementById('calPageLayout')) return;

    /* Wrap calendar + views in a flex layout */
    var calEl = document.getElementById('calendar');
    /* Only include weekView/twoWeekView/yearView if they are already inside page-calendar.
       #weekView lives in #page-week and must not be relocated here. */
    var weekView = calPage.querySelector('#weekView');
    var twoWeekView = calPage.querySelector('#twoWeekView');
    var yearView = calPage.querySelector('#yearView');
    if (!calEl) return;

    var layout = document.createElement('div');
    layout.id = 'calPageLayout';

    /* ── Center panel — Calendar ── */
    var centerPanel = document.createElement('div');
    centerPanel.id = 'calCenterPanel';
    [calEl, weekView, twoWeekView, yearView].forEach(function (el) {
      if (el) centerPanel.appendChild(el);
    });
    layout.appendChild(centerPanel);

    /* ── Single right panel (day timeline / upcoming) ── */
    var sidePanel = document.createElement('div');
    sidePanel.id = 'calSidePanel';
    sidePanel.className = 'cal-side-panel';

    sidePanel.innerHTML =
      '<h4 id="calSidePanelHeader">' +
        '<span id="calSidePanelTitle">📋 Upcoming</span>' +
        '<button class="cal-panel-toggle" id="calSidePanelToggle" title="Collapse panel" aria-label="Collapse side panel" aria-expanded="true">▸</button>' +
      '</h4>' +
      /* Day timeline section (shown when day selected) */
      '<div id="calDaySection" style="display:none">' +
        '<div style="font-size:0.72rem;color:#888;margin-bottom:6px" id="calDailyPanelDate"></div>' +
        '<div id="calDailyPanelContent" style="font-size:0.82rem;color:#888">Select a day to see details.</div>' +
      '</div>' +
      /* Upcoming section (shown when no day selected) */
      '<div id="calUpcomingSection">' +
        '<div id="calUpcomingPanelControls" style="margin-bottom:8px">' +
          '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">' +
            '<button class="cal-domain-pill cal-up-domain active" data-domain="all" style="font-size:0.72rem;padding:2px 7px">All</button>' +
            '<button class="cal-domain-pill cal-up-domain" data-domain="personal" style="font-size:0.72rem;padding:2px 7px">👤</button>' +
            '<button class="cal-domain-pill cal-up-domain" data-domain="home" style="font-size:0.72rem;padding:2px 7px">🏡</button>' +
            '<button class="cal-domain-pill cal-up-domain" data-domain="work" style="font-size:0.72rem;padding:2px 7px">💼</button>' +
          '</div>' +
          /* Pill row for days range (replaces select dropdown) */
          '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px" id="calUpcomingDaysPills">' +
            '<button class="cal-domain-pill cal-up-days active" data-days="7" style="font-size:0.72rem;padding:2px 7px">7d</button>' +
            '<button class="cal-domain-pill cal-up-days" data-days="30" style="font-size:0.72rem;padding:2px 7px">30d</button>' +
            '<button class="cal-domain-pill cal-up-days" data-days="90" style="font-size:0.72rem;padding:2px 7px">90d</button>' +
          '</div>' +
        '</div>' +
        '<div id="calUpcomingPanelContent" style="font-size:0.82rem;color:#888">Loading...</div>' +
      '</div>';
    layout.appendChild(sidePanel);

    /* ── Expand tab (shown when panel collapsed) ── */
    var expandTab = document.createElement('div');
    expandTab.id = 'calSideExpandTab';
    expandTab.className = 'cal-panel-expand-tab';
    expandTab.title = 'Expand panel';
    expandTab.setAttribute('role', 'button');
    expandTab.setAttribute('aria-label', 'Expand side panel');
    expandTab.textContent = '📋';
    expandTab.addEventListener('click', function () { toggleSidePanel(false); });
    layout.appendChild(expandTab);

    /* Hide the original calendarSummary on desktop since we integrated it */
    var existingSummary = document.getElementById('calendarSummary');
    if (existingSummary) existingSummary.style.display = 'none';

    /* Find the category filter controls and insert layout after them */
    var calControls = calPage.querySelector('.calendar-controls');
    if (calControls) {
      calControls.insertAdjacentElement('afterend', layout);
    } else {
      calPage.appendChild(layout);
    }

    /* Wire collapse toggle button */
    document.getElementById('calSidePanelToggle').addEventListener('click', function () { toggleSidePanel(true); });

    /* Wire upcoming domain filters */
    sidePanel.querySelectorAll('.cal-up-domain').forEach(function (btn) {
      btn.addEventListener('click', function () {
        sidePanel.querySelectorAll('.cal-up-domain').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        refreshUpcomingPanel();
      });
    });
    /* Wire days-range pill buttons */
    sidePanel.querySelectorAll('.cal-up-days').forEach(function (btn) {
      btn.addEventListener('click', function () {
        sidePanel.querySelectorAll('.cal-up-days').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        refreshUpcomingPanel();
      });
    });

    /* Click outside calendar grid → deselect day, show upcoming */
    layout.addEventListener('click', function (e) {
      var cal = document.getElementById('calendar');
      if (!cal) return;
      /* If the click landed outside the calendar grid, deselect day */
      if (!cal.contains(e.target) && e.target !== cal) {
        /* Check if click was in the side panel itself (don't deselect in that case) */
        if (!sidePanel.contains(e.target)) {
          window.selectedDay = null;
          /* Remove 'selected' class from all day cells */
          cal.querySelectorAll('.day.selected').forEach(function (c) { c.classList.remove('selected'); });
          showSidePanelUpcoming();
        }
      }
    });

    /* Hide the fixed agenda sidebar since upcoming is now integrated */
    var agendaSidebar = document.getElementById('dtAgendaSidebar');
    if (agendaSidebar) agendaSidebar.style.display = 'none';

    /* Initial render */
    refreshUpcomingPanel();
  }

  function toggleSidePanel(collapse) {
    var panel = document.getElementById('calSidePanel');
    var tab = document.getElementById('calSideExpandTab');
    var toggleBtn = document.getElementById('calSidePanelToggle');
    if (!panel || !tab) return;
    _sideCollapsed = collapse;
    if (collapse) {
      panel.classList.add('collapsed');
      tab.classList.add('visible');
      /* Hide panel from layout entirely after transition */
      function onTransitionEnd() {
        panel.removeEventListener('transitionend', onTransitionEnd);
        if (panel.classList.contains('collapsed')) panel.style.display = 'none';
      }
      panel.addEventListener('transitionend', onTransitionEnd);
    } else {
      /* Restore display before removing collapsed class so transition runs */
      panel.style.display = '';
      /* Force a synchronous layout recalculation so the browser registers
         the display change before the CSS transition class is removed */
      void panel.offsetWidth;
      panel.classList.remove('collapsed');
      tab.classList.remove('visible');
    }
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(!collapse));
  }

  /* Switch the side panel to show the day timeline */
  function showSidePanelDay() {
    var daySection = document.getElementById('calDaySection');
    var upcomingSection = document.getElementById('calUpcomingSection');
    var title = document.getElementById('calSidePanelTitle');
    if (daySection) daySection.style.display = '';
    if (upcomingSection) upcomingSection.style.display = 'none';
    if (title) title.textContent = '📅 Day';
  }

  /* Switch the side panel to show the upcoming view */
  function showSidePanelUpcoming() {
    var daySection = document.getElementById('calDaySection');
    var upcomingSection = document.getElementById('calUpcomingSection');
    var title = document.getElementById('calSidePanelTitle');
    if (daySection) daySection.style.display = 'none';
    if (upcomingSection) upcomingSection.style.display = '';
    if (title) title.textContent = '📋 Upcoming';
  }

  /* No-op stub kept so any stale external references don't throw */
  function toggleDaySummaryPanel() {}
  function toggleUpcomingPanel(collapse) { toggleSidePanel(collapse); }

  function refreshUpcomingPanel() {
    var content = document.getElementById('calUpcomingPanelContent');
    if (!content) return;
    if (!isDesktop()) return;

    /* Read filter state */
    var activeBtn = document.querySelector('.cal-up-domain.active');
    var domainFilter = activeBtn ? activeBtn.dataset.domain || 'all' : 'all';
    var activeDaysBtn = document.querySelector('.cal-up-days.active');
    var days = activeDaysBtn ? parseInt(activeDaysBtn.dataset.days, 10) : 7;

    var today = new Date();
    var todayStr = today.getFullYear() + '-' + p2(today.getMonth() + 1) + '-' + p2(today.getDate());
    var endDate = new Date(today);
    endDate.setDate(endDate.getDate() + days);
    var endStr = endDate.getFullYear() + '-' + p2(endDate.getMonth() + 1) + '-' + p2(endDate.getDate());

    var items = [];
    var dcs = safeDomainColors();

    /* Gather events */
    safeGetEvts(todayStr, endStr).forEach(function (ev) {
      var d = nd(ev.date);
      if (!d || d < todayStr || d > endStr) return;
      var domain = ev.domain || 'personal';
      if (domainFilter !== 'all' && domain !== domainFilter) return;
      items.push({ kind: 'event', time: ev.time || '23:59', title: ev.title || '', color: dcs[domain] || '#4a90e2', emoji: ev.emoji || '📌', date: d, endTime: ev.endTime || '', repeat: ev.repeat || 'none', eventId: ev.id, occurrenceDate: ev.occurrenceDate || '' });
    });

    /* Gather tasks */
    safeTasks().forEach(function (t, idx) {
      var d = nd(t.date);
      if (!d || d < todayStr || d > endStr) return;
      var domain = t.domain || 'personal';
      if (domainFilter !== 'all' && domain !== domainFilter) return;
      items.push({ kind: 'task', time: t.time || '23:59', title: t.title || t.text || '', color: '#27ae60', emoji: t.done ? '✅' : '⬜', date: d, done: t.done, taskIdx: idx });
    });

    /* Gather reminders */
    var rems = safeRems();
    Object.keys(rems).forEach(function (dk) {
      if (dk < todayStr || dk > endStr) return;
      (rems[dk] || []).forEach(function (r, ri) {
        var domain = r.domain || 'personal';
        if (domainFilter !== 'all' && domain !== domainFilter) return;
        items.push({ kind: 'reminder', time: r.time || '23:59', title: r.text || '', color: '#e67e22', emoji: '🔔', date: dk, remKey: dk, remIdx: ri });
      });
    });

    items.sort(function (a, b) {
      var cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return a.time.localeCompare(b.time);
    });

    if (!items.length) {
      content.innerHTML = '<div style="color:#aaa;padding:8px 0;text-align:center">No upcoming items.</div>';
      return;
    }

    var html = '';
    var lastDate = '';
    items.forEach(function (item) {
      if (item.date !== lastDate) {
        var dateObj = new Date(item.date + 'T12:00:00');
        var dateLabel = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        html += '<div style="font-weight:700;font-size:0.72rem;color:#888;margin-top:6px;text-transform:uppercase;letter-spacing:0.03em">' + esc(dateLabel) + '</div>';
        lastDate = item.date;
      }
      var repeatIcon = (item.repeat && item.repeat !== 'none') ? ' 🔁' : '';
      var doneStyle = item.done ? 'text-decoration:line-through;opacity:0.65;' : '';
      var dataAttrs = '';
      if (item.kind === 'event') dataAttrs = ' data-action="edit-event" data-event-id="' + item.eventId + '" data-occurrence-date="' + esc(item.occurrenceDate || '') + '"';
      else if (item.kind === 'task') dataAttrs = ' data-action="edit-task" data-task-idx="' + item.taskIdx + '"';
      else if (item.kind === 'reminder') dataAttrs = ' data-action="edit-reminder" data-rem-key="' + esc(item.remKey) + '" data-rem-idx="' + item.remIdx + '"';
      var kindLabel = '<span class="dcf-split-kind dcf-split-kind-' + item.kind + '">' + item.kind.charAt(0).toUpperCase() + item.kind.slice(1) + '</span>';
      html += '<div class="dcf-split-event" style="border-left-color:' + item.color + ';background:' + hexToRgba2(item.color, 0.1) + ';' + doneStyle + '"' + dataAttrs + ' title="Click to edit">';
      html += kindLabel + '<span style="font-weight:600">' + item.emoji + ' ' + esc(item.title) + repeatIcon + '</span>';
      if (item.time && item.time !== '23:59') {
        html += '<span class="dcf-split-time">' + esc(item.time) + (item.endTime ? ' – ' + esc(item.endTime) : '') + '</span>';
      }
      html += '</div>';
    });
    content.innerHTML = html;
    wireItemClicks(content);
  }

  function refreshSplitPanel() {
    if (!isDesktop()) return;
    var sidePanel = document.getElementById('calSidePanel');
    if (!sidePanel) return;

    var yr = selYear(), mo = selMonth(), day = window.selectedDay;
    if (!day) {
      /* No day selected → show upcoming view */
      showSidePanelUpcoming();
      refreshUpcomingPanel();
      return;
    }

    /* Day selected → show timeline view */
    showSidePanelDay();

    var ymd = yr + '-' + p2(mo + 1) + '-' + p2(day);
    var dateLabel = document.getElementById('calDailyPanelDate');
    if (dateLabel) {
      var d = new Date(ymd + 'T12:00:00');
      dateLabel.textContent = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }

    var content = document.getElementById('calDailyPanelContent');
    if (!content) return;

    var evts = safeGetEvts(ymd, ymd);
    var allTasks = safeTasks();
    var tasks = [];
    allTasks.forEach(function (t, idx) { if (nd(t.date) === ymd) tasks.push({ task: t, idx: idx }); });
    var rems = safeRems()[ymd] || [];
    var dcs = safeDomainColors();

    if (!evts.length && !tasks.length && !rems.length) {
      content.innerHTML = '<div style="color:#aaa;padding:8px 0;text-align:center">Nothing scheduled.</div>';
      return;
    }

    /* Build unified items list with minute-based times, mirroring daily-view.js */
    var items = [];
    function toMin(t) {
      if (!t) return null;
      var s = String(t).trim();
      var m = s.match(/(\d{1,2}):(\d{2})/);
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    }
    function fmtTime(minutes) {
      var h = Math.floor((minutes % 1440) / 60);
      var m = minutes % 60;
      return p2(h) + ':' + p2(m);
    }
    function lighten(hex, alpha) {
      if (!hex || hex[0] !== '#') return 'rgba(74,144,226,' + alpha + ')';
      var r = parseInt(hex.substr(1, 2), 16);
      var g = parseInt(hex.substr(3, 2), 16);
      var b = parseInt(hex.substr(5, 2), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    evts.forEach(function (e) {
      var s = toMin(e.time);
      var en = toMin(e.endTime);
      var hasTimes = s !== null;
      if (s === null) s = 9 * 60;
      if (en === null) en = s + 60;
      if (en <= s) en = s + 60;
      items.push({ kind: 'event', title: e.title || 'Event', emoji: e.emoji || '📌', startMin: s, endMin: en, hasTimes: hasTimes, color: dcs[e.domain || 'personal'] || '#4a90e2', eventId: e.id, repeat: e.repeat || 'none', occurrenceDate: e.occurrenceDate || '' });
    });
    tasks.forEach(function (entry) {
      var t = entry.task;
      var s = toMin(t.time);
      if (s === null) return; /* skip untimed tasks from timeline – show below */
      items.push({ kind: 'task', title: t.title || t.text || 'Task', emoji: t.done ? '✅' : '⬜', startMin: s, endMin: s + 30, hasTimes: true, color: '#27ae60', done: t.done, taskIdx: entry.idx });
    });
    rems.forEach(function (r, ri) {
      var s = toMin(r.time);
      if (s === null) return;
      items.push({ kind: 'reminder', title: r.text || 'Reminder', emoji: '🔔', startMin: s, endMin: s + 15, hasTimes: true, color: '#e67e22', remKey: ymd, remIdx: ri });
    });
    items.sort(function (a, b) { return a.startMin - b.startMin; });

    /* Determine visible hour range */
    var rangeStart = 7, rangeEnd = 22; /* default 7 AM to 10 PM */
    if (items.length > 0) {
      var earliest = items[0].startMin;
      var latest = items[items.length - 1].endMin;
      rangeStart = Math.max(0, Math.floor(earliest / 60) - 1);
      rangeEnd = Math.min(24, Math.ceil(latest / 60) + 1);
      if (rangeEnd - rangeStart < 4) rangeEnd = rangeStart + 4;
    }
    var rangeStartMin = rangeStart * 60;
    var rangeEndMin = rangeEnd * 60;
    var totalHours = rangeEnd - rangeStart;
    var HOUR_H = 40; /* px per hour in mini timeline */
    var totalPx = totalHours * HOUR_H;

    /* Column packing for overlapping items */
    function layoutCols(arr) {
      var columns = [];
      arr.forEach(function (item) {
        var placed = false;
        for (var c = 0; c < columns.length; c++) {
          var last = columns[c][columns[c].length - 1];
          if (last.endMin <= item.startMin) { columns[c].push(item); item._col = c; placed = true; break; }
        }
        if (!placed) { item._col = columns.length; columns.push([item]); }
      });
      arr.forEach(function (item) {
        var maxCol = item._col;
        arr.forEach(function (other) {
          if (other.startMin < item.endMin && other.endMin > item.startMin && other._col > maxCol) maxCol = other._col;
        });
        item._totalCols = maxCol + 1;
      });
      /* Normalize totalCols for overlapping groups */
      var changed = true, passes = 0;
      while (changed && passes < 8) {
        changed = false; passes++;
        arr.forEach(function (item) {
          arr.forEach(function (other) {
            if (other.startMin < item.endMin && other.endMin > item.startMin) {
              var m = Math.max(item._totalCols, other._totalCols);
              if (item._totalCols !== m) { item._totalCols = m; changed = true; }
              if (other._totalCols !== m) { other._totalCols = m; changed = true; }
            }
          });
        });
      }
    }
    layoutCols(items);

    /* Build the DOM */
    content.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'dcf-day-timeline';
    grid.style.minHeight = totalPx + 'px';

    /* Gutter (hour labels) */
    var gutter = document.createElement('div');
    gutter.className = 'dcf-day-timeline-gutter';
    for (var h = rangeStart; h < rangeEnd; h++) {
      var lbl = document.createElement('div');
      lbl.className = 'dcf-day-timeline-gutter-lbl';
      lbl.style.top = ((h - rangeStart) * HOUR_H) + 'px';
      lbl.textContent = p2(h) + ':00';
      gutter.appendChild(lbl);
    }
    grid.appendChild(gutter);

    /* Body (slots + events) */
    var body = document.createElement('div');
    body.className = 'dcf-day-timeline-body';
    body.style.minHeight = totalPx + 'px';
    /* Hour slot lines */
    for (var h = rangeStart; h < rangeEnd; h++) {
      var slot = document.createElement('div');
      slot.className = 'dcf-day-timeline-slot';
      slot.style.top = ((h - rangeStart) * HOUR_H) + 'px';
      body.appendChild(slot);
      /* Half-hour line */
      var half = document.createElement('div');
      half.className = 'dcf-day-timeline-half';
      half.style.top = ((h - rangeStart) * HOUR_H + HOUR_H / 2) + 'px';
      body.appendChild(half);
    }

    /* Event blocks */
    items.forEach(function (item) {
      var s = Math.max(item.startMin, rangeStartMin);
      var e = Math.min(item.endMin, rangeEndMin);
      var topPx = ((s - rangeStartMin) / (rangeEndMin - rangeStartMin)) * totalPx;
      var heightPx = Math.max(16, ((e - s) / (rangeEndMin - rangeStartMin)) * totalPx);
      var colWidth = 100 / (item._totalCols || 1);
      var leftPct = (item._col || 0) * colWidth;

      var block = document.createElement('div');
      block.className = 'dcf-day-timeline-block';
      block.style.top = topPx + 'px';
      block.style.height = heightPx + 'px';
      block.style.left = leftPct + '%';
      block.style.width = (colWidth - 2) + '%';
      block.style.background = lighten(item.color, 0.18);
      block.style.borderLeftColor = item.color;
      if (item.done) block.style.opacity = '0.65';
      block.title = item.title || '';

      var inner = '';
      inner += '<span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">';
      if (item.emoji) inner += item.emoji + ' ';
      if (item.done) inner += '<span style="text-decoration:line-through">';
      inner += esc(item.title);
      if (item.done) inner += '</span>';
      if (item.repeat && item.repeat !== 'none') inner += ' 🔁';
      inner += '</span>';
      if (item.hasTimes) {
        inner += '<span class="dcf-split-time" style="font-size:0.6rem">' + fmtTime(item.startMin) + ' – ' + fmtTime(item.endMin) + '</span>';
      }
      block.innerHTML = inner;

      /* Click to edit */
      var dataAction = '';
      if (item.kind === 'event') dataAction = 'edit-event';
      else if (item.kind === 'task') dataAction = 'edit-task';
      else if (item.kind === 'reminder') dataAction = 'edit-reminder';
      block.dataset.action = dataAction;
      if (item.eventId !== undefined) block.dataset.eventId = item.eventId;
      if (item.taskIdx !== undefined) block.dataset.taskIdx = item.taskIdx;
      if (item.remKey) { block.dataset.remKey = item.remKey; block.dataset.remIdx = item.remIdx; }

      body.appendChild(block);
    });

    /* Current time indicator (only for today) */
    if (ymd === todayISO()) {
      var now = new Date();
      var nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin >= rangeStartMin && nowMin < rangeEndMin) {
        var nowPx = ((nowMin - rangeStartMin) / (rangeEndMin - rangeStartMin)) * totalPx;
        var nowLine = document.createElement('div');
        nowLine.className = 'dcf-day-timeline-now';
        nowLine.style.top = nowPx + 'px';
        var nowDot = document.createElement('div');
        nowDot.className = 'dcf-day-timeline-now-dot';
        nowLine.appendChild(nowDot);
        body.appendChild(nowLine);
      }
    }

    grid.appendChild(body);
    content.appendChild(grid);

    /* Untimed items below the timeline */
    var untimedItems = [];
    allTasks.forEach(function (t, idx) {
      if (nd(t.date) !== ymd) return;
      var s = toMin(t.time);
      if (s !== null) return; /* already in timeline */
      untimedItems.push({ kind: 'task', title: t.title || t.text || 'Task', emoji: t.done ? '✅' : '⬜', done: t.done, color: '#27ae60', taskIdx: idx });
    });
    rems.forEach(function (r, ri) {
      var s = toMin(r.time);
      if (s !== null) return;
      untimedItems.push({ kind: 'reminder', title: r.text || 'Reminder', emoji: '🔔', color: '#e67e22', remKey: ymd, remIdx: ri });
    });
    /* Also add untimed events */
    evts.forEach(function (e) {
      var s = toMin(e.time);
      if (s !== null) return;
      untimedItems.push({ kind: 'event', title: e.title || 'Event', emoji: e.emoji || '📌', color: dcs[e.domain || 'personal'] || '#4a90e2', eventId: e.id, repeat: e.repeat || 'none', occurrenceDate: e.occurrenceDate || '' });
    });

    if (untimedItems.length > 0) {
      var untimedDiv = document.createElement('div');
      untimedDiv.className = 'dcf-day-untimed-section';
      untimedDiv.innerHTML = '<div class="dcf-day-untimed-header">All Day / Untimed</div>';
      untimedItems.forEach(function (item) {
        var doneStyle = item.done ? 'text-decoration:line-through;opacity:0.65;' : '';
        var dataAttrs = '';
        if (item.kind === 'event') dataAttrs = ' data-action="edit-event" data-event-id="' + item.eventId + '" data-occurrence-date="' + esc(item.occurrenceDate || '') + '"';
        else if (item.kind === 'task') dataAttrs = ' data-action="edit-task" data-task-idx="' + item.taskIdx + '"';
        else if (item.kind === 'reminder') dataAttrs = ' data-action="edit-reminder" data-rem-key="' + esc(item.remKey) + '" data-rem-idx="' + item.remIdx + '"';
        var el = document.createElement('div');
        el.className = 'dcf-split-event';
        el.style.cssText = 'border-left-color:' + item.color + ';background:' + lighten(item.color, 0.1) + ';' + doneStyle;
        el.title = 'Click to edit';
        el.innerHTML = '<span style="font-weight:600">' + item.emoji + ' ' + esc(item.title) + ((item.repeat && item.repeat !== 'none') ? ' 🔁' : '') + '</span>';
        if (dataAttrs) {
          var tmp = document.createElement('div');
          tmp.innerHTML = '<div' + dataAttrs + '></div>';
          var attrs = tmp.firstChild;
          for (var a = 0; a < attrs.attributes.length; a++) {
            el.setAttribute(attrs.attributes[a].name, attrs.attributes[a].value);
          }
        }
        untimedDiv.appendChild(el);
      });
      content.appendChild(untimedDiv);
    }

    wireItemClicks(content);
  }

  /* Sync side panel heights with the calendar container */
  function syncPanelHeights() {
    if (!isDesktop()) return;
    var calEl = document.getElementById('calendar');
    var sidePanel = document.getElementById('calSidePanel');
    if (!calEl || !sidePanel) return;
    var calH = calEl.offsetHeight;
    if (calH > 0 && !sidePanel.classList.contains('collapsed')) {
      sidePanel.style.maxHeight = calH + 'px';
    }
  }

  /* Wire click-to-edit on panel items */
  function wireItemClicks(container) {
    container.querySelectorAll('[data-action]').forEach(function (el) {
      el.addEventListener('click', function () {
        var action = el.dataset.action;
        try {
          if (action === 'edit-event' && typeof window.editEvent === 'function') {
            window.editEvent(parseInt(el.dataset.eventId, 10), el.dataset.occurrenceDate || undefined);
          } else if (action === 'edit-task' && typeof window.editTask === 'function') {
            window.editTask(parseInt(el.dataset.taskIdx, 10));
          } else if (action === 'edit-reminder' && typeof window.editReminder === 'function') {
            var remKey = el.dataset.remKey || '';
            var parts = remKey.split('-');
            if (parts.length === 3) {
              var day = parseInt(parts[2], 10);
              window.editReminder(day, parseInt(el.dataset.remIdx, 10));
            }
          }
        } catch (e) { console.warn('Panel item click error:', e); }
      });
    });
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
  /* Time-slot quick-create disabled — clicking a day now only selects it */
  function wireTimeSlotCreate() {
    /* intentionally empty */
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
    var viewToggleDiv = document.getElementById('viewDropdownBar');
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
      /* Only anchor to a #weekView that is inside the calendar page; #weekView in
         #page-week must not be used as an insertion point here. */
      var calWeekView = calPage.querySelector('#weekView');
      if (calWeekView) calWeekView.insertAdjacentElement('afterend', tw);
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
     22. DOUBLE-CLICK ADD ITEM MODAL  (desktop only)
  ══════════════════════════════════════════════════════ */
  function injectDayAddModal() {
    if (document.getElementById('dcfDayAddModal')) return;

    /* Inject CSS — Liquid Glass style matching other app modals */
    var modalStyle = document.createElement('style');
    modalStyle.textContent = [
      '.dcf-day-add-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.40);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);z-index:10010;display:none;align-items:center;justify-content:center}',
      '.dcf-day-add-overlay.open{display:flex}',
      '@keyframes dcf-day-add-in{from{transform:scale(0.94) translateY(8px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}',
      '.dcf-day-add-panel{',
      '  background:var(--ios-glass-vibrant,rgba(255,255,255,0.85));',
      '  -webkit-backdrop-filter:var(--ios-glass-blur,saturate(200%) blur(40px));',
      '  backdrop-filter:var(--ios-glass-blur,saturate(200%) blur(40px));',
      '  border:1px solid var(--ios-border-glass,rgba(255,255,255,0.45));',
      '  border-radius:var(--ios-r-lg,24px);',
      '  box-shadow:var(--ios-shadow-glass,0 8px 32px rgba(0,0,0,0.12),inset 0 1px 0 rgba(255,255,255,0.6));',
      '  width:92%;max-width:420px;padding:0 24px 24px;box-sizing:border-box;',
      '  animation:dcf-day-add-in var(--ios-slow,0.50s) var(--ios-spring-soft,cubic-bezier(0.22,1.0,0.36,1)) both}',
      '.dcf-day-add-handle{width:36px;height:4px;background:rgba(60,60,67,0.18);border-radius:2px;margin:12px auto 18px;flex-shrink:0}',
      '.dcf-day-add-date{font-size:1.05rem;font-weight:700;color:var(--ios-accent,#007AFF);margin-bottom:14px;text-align:center}',
      '.dcf-day-add-tabs{display:flex;gap:6px;margin-bottom:14px;background:var(--ios-surface-2,#f2f2f7);border-radius:var(--ios-r-sm,14px);padding:3px}',
      '.dcf-day-add-tab{flex:1;padding:7px 4px;border-radius:calc(var(--ios-r-sm,14px) - 2px);border:none;background:transparent;cursor:pointer;font-size:0.84rem;font-weight:600;transition:all var(--ios-fast,0.18s) var(--ios-spring,cubic-bezier(0.34,1.56,0.64,1));text-align:center;color:var(--ios-text-2,#48484a)}',
      '.dcf-day-add-tab.active{background:var(--ios-surface,#fff);color:var(--ios-accent,#007AFF);box-shadow:0 1px 6px rgba(0,0,0,0.10)}',
      '.dcf-day-add-input{width:100%;box-sizing:border-box;padding:10px 13px;border-radius:var(--ios-r-sm,14px);border:1.5px solid var(--ios-border,rgba(60,60,67,0.13));font-size:0.95rem;margin-bottom:10px;background:var(--ios-surface,#fff);color:var(--ios-text,#1c1c1e);outline:none;transition:border-color var(--ios-fast,0.18s)}',
      '.dcf-day-add-input:focus{border-color:var(--ios-accent,#007AFF);box-shadow:0 0 0 3px rgba(0,122,255,0.16)}',
      '.dcf-day-add-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}',
      '.dcf-day-add-submit{padding:9px 22px;border-radius:var(--ios-r-sm,14px);background:var(--ios-accent,#007AFF);color:#fff;border:none;font-size:0.9rem;font-weight:600;cursor:pointer;transition:background var(--ios-fast,0.18s),transform var(--ios-fast,0.18s) var(--ios-spring,cubic-bezier(0.34,1.56,0.64,1))}',
      '.dcf-day-add-submit:hover{background:var(--ios-accent-dk,#0062CC)}',
      '.dcf-day-add-submit:active{transform:scale(0.95)}',
      '.dcf-day-add-cancel{padding:9px 16px;border-radius:var(--ios-r-sm,14px);background:rgba(120,120,128,0.14);color:var(--ios-text-2,#48484a);border:none;font-size:0.9rem;cursor:pointer;transition:background var(--ios-fast,0.18s)}',
      '.dcf-day-add-cancel:hover{background:rgba(120,120,128,0.24)}',
      /* Dark mode via CSS custom properties already handled; explicit dark-mode class fallback: */
      'body.dark-mode .dcf-day-add-panel{background:rgba(44,44,46,0.90);border-color:rgba(255,255,255,0.14)}',
      'body.dark-mode .dcf-day-add-tab.active{background:rgba(58,58,60,0.90);color:var(--ios-accent,#0a84ff)}',
      'body.dark-mode .dcf-day-add-input{background:rgba(58,58,60,0.70);color:#f2f2f7;border-color:rgba(255,255,255,0.12)}',
      'body.dark-mode .dcf-day-add-handle{background:rgba(255,255,255,0.22)}'
    ].join('\n');
    document.head.appendChild(modalStyle);

    var overlay = document.createElement('div');
    overlay.id = 'dcfDayAddModal';
    overlay.className = 'dcf-day-add-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Add item');
    overlay.innerHTML = [
      '<div class="dcf-day-add-panel">',
      '  <div class="dcf-day-add-handle"></div>',
      '  <div class="dcf-day-add-date" id="dcfDayAddDate"></div>',
      '  <div class="dcf-day-add-tabs">',
      '    <button class="dcf-day-add-tab active" data-kind="event">📅 Event</button>',
      '    <button class="dcf-day-add-tab" data-kind="task">✅ Task</button>',
      '    <button class="dcf-day-add-tab" data-kind="reminder">🔔 Reminder</button>',
      '  </div>',
      '  <input class="dcf-day-add-input" id="dcfDayAddTitle" type="text" placeholder="Title…" autocomplete="off" />',
      '  <input class="dcf-day-add-input" id="dcfDayAddTime" type="time" style="width:140px" />',
      '  <div class="dcf-day-add-actions">',
      '    <button class="dcf-day-add-cancel" id="dcfDayAddCancel">Cancel</button>',
      '    <button class="dcf-day-add-submit" id="dcfDayAddSubmit">Add</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    var _addDate = null;
    var _addKind = 'event';

    function openDayAddModal(ymd) {
      _addDate = ymd;
      _addKind = 'event';
      overlay.querySelectorAll('.dcf-day-add-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.kind === 'event'); });
      var dateLabel = document.getElementById('dcfDayAddDate');
      if (dateLabel) {
        var d = new Date(ymd + 'T12:00:00');
        dateLabel.textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      }
      var titleEl = document.getElementById('dcfDayAddTitle');
      var timeEl = document.getElementById('dcfDayAddTime');
      if (titleEl) { titleEl.value = ''; titleEl.placeholder = 'Event title…'; }
      if (timeEl) timeEl.value = '';
      overlay.classList.add('open');
      setTimeout(function () { if (titleEl) titleEl.focus(); }, 50);
    }
    window.dcfOpenDayAddModal = openDayAddModal;

    function closeDayAddModal() { overlay.classList.remove('open'); }

    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeDayAddModal(); });
    document.getElementById('dcfDayAddCancel').addEventListener('click', closeDayAddModal);

    /* Tab switching */
    overlay.querySelectorAll('.dcf-day-add-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        _addKind = tab.dataset.kind;
        overlay.querySelectorAll('.dcf-day-add-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var titleEl = document.getElementById('dcfDayAddTitle');
        if (titleEl) titleEl.placeholder = (_addKind === 'reminder' ? 'Reminder text…' : _addKind === 'task' ? 'Task title…' : 'Event title…');
      });
    });

    /* Submit */
    document.getElementById('dcfDayAddSubmit').addEventListener('click', function () { submitDayAdd(); });
    document.getElementById('dcfDayAddTitle').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitDayAdd(); }
    });
    overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDayAddModal(); });

    function submitDayAdd() {
      var titleEl = document.getElementById('dcfDayAddTitle');
      var timeEl  = document.getElementById('dcfDayAddTime');
      var title = (titleEl && titleEl.value.trim()) || '';
      var time  = (timeEl && timeEl.value) || '';
      if (!title || !_addDate) return;

      try {
        if (_addKind === 'event') {
          var evs = typeof getEvents === 'function' ? getEvents() : JSON.parse(localStorage.getItem('events') || '[]');
          var newId = evs.length ? Math.max.apply(null, evs.map(function (e) { return e.id || 0; })) + 1 : 1;
          evs.push({ id: newId, title: title, date: _addDate, time: time, endTime: '', category: 'event', domain: 'personal' });
          if (typeof setEvents === 'function') setEvents(evs); else localStorage.setItem('events', JSON.stringify(evs));
        } else if (_addKind === 'task') {
          var tasks = typeof getTasks === 'function' ? getTasks() : JSON.parse(localStorage.getItem('tasks') || '[]');
          tasks.push({ id: Date.now(), title: title, date: _addDate, time: time, done: false, category: 'work', priority: '2' });
          if (typeof setTasks === 'function') setTasks(tasks); else localStorage.setItem('tasks', JSON.stringify(tasks));
        } else if (_addKind === 'reminder') {
          var rems = typeof getReminders === 'function' ? getReminders() : JSON.parse(localStorage.getItem('reminders') || '{}');
          if (!rems[_addDate]) rems[_addDate] = [];
          rems[_addDate].push({ text: title, time: time });
          if (typeof setReminders === 'function') setReminders(rems); else localStorage.setItem('reminders', JSON.stringify(rems));
        }
        try { window.dispatchEvent(new Event('app:data:updated')); } catch (_) {}
        try { generateCalendar(); } catch (_) {}
        try {
          var parts = _addDate.split('-');
          if (parts.length === 3) {
            window.selectedYear = parseInt(parts[0], 10);
            window.selectedMonth = parseInt(parts[1], 10) - 1;
            window.selectedDay = parseInt(parts[2], 10);
            showReminders(window.selectedDay);
          }
        } catch (_) {}
      } catch (err) { console.warn('dcfDayAdd error:', err); }
      closeDayAddModal();
    }
  }

  /* Wire dblclick on day cells (desktop only) */
  function wireDayDblClick() {
    if (!isDesktop()) return;
    var calEl = document.getElementById('calendar');
    if (!calEl) return;
    calEl.querySelectorAll('.day[data-day]').forEach(function (cell) {
      if (cell._dcfDblClickWired) return;
      cell._dcfDblClickWired = true;
      cell.addEventListener('dblclick', function (e) {
        e.preventDefault();
        var day = parseInt(cell.dataset.day, 10);
        if (isNaN(day)) return;
        var yr = window.selectedYear || new Date().getFullYear();
        var mo = (window.selectedMonth != null ? window.selectedMonth : new Date().getMonth());
        var ymd = yr + '-' + p2(mo + 1) + '-' + p2(day);
        injectDayAddModal();
        if (window.dcfOpenDayAddModal) window.dcfOpenDayAddModal(ymd);
      });
    });
  }

  /* ══════════════════════════════════════════════════════
     23. ACTIVITY CHART BAR HOVER TOOLTIP
  ══════════════════════════════════════════════════════ */
  function injectBarTooltip() {
    if (document.getElementById('dcfBarTooltip')) return;
    var tip = document.createElement('div');
    tip.id = 'dcfBarTooltip';
    tip.style.cssText = [
      'position:fixed',
      'display:none',
      'z-index:9999',
      'background:#fff',
      'color:#333',
      'border-radius:10px',
      'box-shadow:0 4px 20px rgba(0,0,0,0.15)',
      'padding:8px 12px',
      'font-size:0.8rem',
      'line-height:1.5',
      'pointer-events:none',
      'max-width:180px',
      'white-space:normal'
    ].join(';');
    document.body.appendChild(tip);

    /* Dark mode style */
    var tipStyle = document.createElement('style');
    tipStyle.textContent = 'body.dark-mode #dcfBarTooltip{background:#16213e;color:#e0e0e0;box-shadow:0 4px 20px rgba(0,0,0,0.45)}';
    document.head.appendChild(tipStyle);
  }

  function wireBarTooltip(svgEl) {
    if (!svgEl) return;
    if (svgEl._dcfTooltipWired) return;
    svgEl._dcfTooltipWired = true;
    injectBarTooltip();
    var tip = document.getElementById('dcfBarTooltip');
    if (!tip) return;

    var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    svgEl.addEventListener('mousemove', function (e) {
      var target = e.target;
      if (target.tagName === 'title') target = target.parentElement;
      var dayNum = target && target.getAttribute('data-day');
      if (!dayNum) { tip.style.display = 'none'; return; }
      dayNum = parseInt(dayNum, 10);
      if (isNaN(dayNum) || dayNum < 1) { tip.style.display = 'none'; return; }
      /* Read fresh data stored on the element at each render */
      var stored = svgEl._dcfTooltipData || {};
      var dayData = stored.dayData;
      var yr = stored.yr;
      var mo = stored.mo;
      /* dayData.e/t/r are abbreviations from gatherMonthData: e=events, t=tasks, r=reminders */
      var d = (dayData && dayData[dayNum - 1]) || { e: 0, t: 0, r: 0, total: 0 };
      var dateStr = (mo != null ? MONTH_NAMES[mo] : '') + ' ' + dayNum + (yr ? ', ' + yr : '');
      tip.innerHTML =
        '<div style="font-weight:700;margin-bottom:3px">' + esc(dateStr) + '</div>' +
        '<div style="color:#4a90e2">📅 Events: ' + d.e + '</div>' +
        '<div style="color:#27ae60">✅ Tasks: ' + d.t + '</div>' +
        '<div style="color:#e67e22">🔔 Reminders: ' + d.r + '</div>' +
        '<div style="font-weight:600;border-top:1px solid #eee;margin-top:4px;padding-top:3px">Total: ' + d.total + '</div>';
      var x = e.clientX + 14;
      var y = e.clientY - 10;
      /* Keep within viewport */
      if (x + 180 > window.innerWidth) x = e.clientX - 190;
      if (y + 110 > window.innerHeight) y = e.clientY - 120;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
      tip.style.display = 'block';
    });
    svgEl.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
  }
  function init() {
    patchGenerateCalendar();
    patchWeekView();

    injectViewButtons();
    wireViewButtons();
    injectLayerToggles();
    injectGotoDate();
    refreshCharts();
    injectStreakBadge();
    injectCommandPalette();
    injectSmartSchedule();
    wireSearchHighlight();

    if (isDesktop()) {
      injectSplitPanel();
      injectDayAddModal();
      syncPanelHeights();
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
        if (isDesktop()) {
          injectSplitPanel();
          refreshSplitPanel();
          syncPanelHeights();
          /* Hide the fixed agenda sidebar since upcoming is integrated */
          var agendaSidebar = document.getElementById('dtAgendaSidebar');
          if (agendaSidebar) agendaSidebar.style.display = 'none';
        }
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
    try { syncPanelHeights(); } catch (_) {}
  });

  /* Refresh split panel whenever a day is selected */
  window.addEventListener('dailyview:datechange', function () {
    try { refreshSplitPanel(); } catch (_) {}
  });

  /* Re-sync panel heights on window resize */
  window.addEventListener('resize', function () {
    try { syncPanelHeights(); } catch (_) {}
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

  /* ══════════════════════════════════════════════════════
     21. SCHOOL A/B DAY LABELS
     Shows an "A" or "B" badge on each school weekday cell,
     using a user-configured anchor date and respecting the
     same holiday / off-day rules as the A/B repeat pattern.
  ══════════════════════════════════════════════════════ */
  (function initSchoolABLabels() {
    /* CSS for A/B badges */
    var abStyle = document.createElement('style');
    abStyle.id = 'dcf-ab-label-css';
    abStyle.textContent = [
      '.dcf-ab-badge { position:absolute;top:2px;left:4px;font-size:0.6rem;font-weight:900;',
      '  border-radius:5px;padding:1px 5px;line-height:1.4;pointer-events:none;z-index:6;letter-spacing:0.04em; }',
      '.dcf-ab-badge.ab-a { background:rgba(74,144,226,0.14);color:#1a5fa8;border:1px solid rgba(74,144,226,0.35); }',
      '.dcf-ab-badge.ab-b { background:rgba(231,76,60,0.11);color:#b03020;border:1px solid rgba(231,76,60,0.32); }',
      'body.dark-mode .dcf-ab-badge.ab-a { background:rgba(74,144,226,0.28);color:#7ab3f5;border-color:rgba(74,144,226,0.5); }',
      'body.dark-mode .dcf-ab-badge.ab-b { background:rgba(231,76,60,0.22);color:#e88;border-color:rgba(231,76,60,0.45); }'
    ].join('\n');
    document.head.appendChild(abStyle);

    /* Read school A/B config from localStorage */
    function getABConfig() {
      try { return JSON.parse(localStorage.getItem('schoolABSchedule') || '{}'); } catch (_) { return {}; }
    }

    /* Build the set of dates that are NOT school days (weekends excluded separately) */
    function buildSkipSet(year) {
      var skip = {};
      function nthWd(yr, mi, wd, n) {
        var f = new Date(yr, mi, 1).getDay();
        return 1 + ((7 + wd - f) % 7) + (n - 1) * 7;
      }
      function lastWd(yr, mi, wd) {
        var last = new Date(yr, mi + 1, 0);
        return last.getDate() - ((7 + last.getDay() - wd) % 7);
      }
      /* Cover previous and next year too so anchor dates near year-end work */
      for (var yr = year - 1; yr <= year + 1; yr++) {
        [yr+'-01-01', yr+'-06-19', yr+'-07-04', yr+'-11-11', yr+'-12-25'].forEach(function (d) { skip[d] = true; });
        skip[yr+'-01-'+p2(nthWd(yr, 0, 1, 3))] = true;   // MLK Day
        skip[yr+'-02-'+p2(nthWd(yr, 1, 1, 3))] = true;   // Presidents' Day
        skip[yr+'-05-'+p2(lastWd(yr, 4, 1))]   = true;   // Memorial Day
        skip[yr+'-09-'+p2(nthWd(yr, 8, 1, 1))] = true;   // Labor Day
        skip[yr+'-10-'+p2(nthWd(yr, 9, 1, 2))] = true;   // Columbus Day
        skip[yr+'-11-'+p2(nthWd(yr, 10, 4, 4))] = true;  // Thanksgiving
      }
      try {
        var userOff = JSON.parse(localStorage.getItem('userOffDays') || '[]');
        if (Array.isArray(userOff)) {
          userOff.forEach(function (d) {
            var ds = typeof d === 'string' ? d : (d && d.date ? d.date : '');
            if (ds) skip[ds] = true;
          });
        }
      } catch (_) {}
      return skip;
    }

    /* Add one calendar day (positive or negative n) to an ISO date string */
    function addDay(iso, n) {
      var d = new Date(iso + 'T00:00:00');
      d.setDate(d.getDate() + n);
      return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    }

    /* Return 'A', 'B', or null (non-school day) for a given calendar date.
       anchorLabel is 'A' or 'B' — what the anchor date itself is called. */
    function getABLabel(targetISO, anchorISO, anchorLabel, skipSet) {
      /* Weekends and off-days are not school days */
      var dow = new Date(targetISO + 'T00:00:00').getDay();
      if (dow === 0 || dow === 6) return null;
      if (skipSet[targetISO]) return null;

      /* Count school days walked between anchor (exclusive) and target (inclusive) */
      var count = 0;
      var d = anchorISO;
      var dir = anchorISO <= targetISO ? 1 : -1;
      /* Safety cap: ~240 school days/yr × 2.5 years = 600 calendar-day iterations max */
      var MAX_SCHOOL_DAYS_SEARCH = 600;
      var safety = MAX_SCHOOL_DAYS_SEARCH;
      while (d !== targetISO && safety-- > 0) {
        d = addDay(d, dir);
        var ddow = new Date(d + 'T00:00:00').getDay();
        if (ddow !== 0 && ddow !== 6 && !skipSet[d]) count++;
      }
      /* Determine label: anchor=0 (same as anchorLabel), each step flips */
      var anchorIsA = (anchorLabel || 'A').toUpperCase() !== 'B';
      var targetIsA = (count % 2 === 0) ? anchorIsA : !anchorIsA;
      return targetIsA ? 'A' : 'B';
    }

    /* Inject A/B badges into the currently rendered calendar grid */
    function patchABBadges() {
      var cfg = getABConfig();
      if (!cfg.enabled || !cfg.anchorDate) return;

      var calendarEl = document.getElementById('calendar');
      if (!calendarEl) return;

      var yr = (typeof selectedYear !== 'undefined') ? selectedYear : new Date().getFullYear();
      var mo = (typeof selectedMonth !== 'undefined') ? selectedMonth : new Date().getMonth();
      var skipSet = buildSkipSet(yr);

      calendarEl.querySelectorAll('.day[data-day]').forEach(function (cell) {
        /* Remove any existing badge */
        var old = cell.querySelector('.dcf-ab-badge');
        if (old) old.remove();

        var day = parseInt(cell.dataset.day, 10);
        if (!day) return;
        var dateISO = yr + '-' + p2(mo + 1) + '-' + p2(day);
        var label = getABLabel(dateISO, cfg.anchorDate, cfg.anchorLabel || 'A', skipSet);
        if (!label) return;

        var badge = document.createElement('span');
        badge.className = 'dcf-ab-badge ab-' + label.toLowerCase();
        badge.textContent = label;
        badge.title = 'School day ' + label;
        cell.appendChild(badge);
      });
    }

    /* Patch generateCalendar so badges are applied after every calendar render */
    if (typeof generateCalendar === 'function' && !generateCalendar._abPatched) {
      var _origGenCal = generateCalendar;
      window.generateCalendar = generateCalendar = function () {
        _origGenCal.apply(this, arguments);
        try { patchABBadges(); } catch (_) {}
      };
      generateCalendar._abPatched = true;
    }

    /* Also patch on first DOMContentLoaded in case generateCalendar wasn't ready yet */
    document.addEventListener('DOMContentLoaded', function () {
      if (typeof generateCalendar === 'function' && !generateCalendar._abPatched) {
        var _orig = generateCalendar;
        window.generateCalendar = generateCalendar = function () {
          _orig.apply(this, arguments);
          try { patchABBadges(); } catch (_) {}
        };
        generateCalendar._abPatched = true;
      }
      try { patchABBadges(); } catch (_) {}
    });

    /* Re-apply when settings or off-days change (e.g. from settings.html) */
    window.addEventListener('storage', function (e) {
      if (e.key === 'schoolABSchedule' || e.key === 'userOffDays') {
        try { patchABBadges(); } catch (_) {}
      }
    });

    /* Re-apply on generic data updates */
    window.addEventListener('app:data:updated', function () {
      try { patchABBadges(); } catch (_) {}
    });
  })();

})();
