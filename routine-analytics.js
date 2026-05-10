/**
 * routine-analytics.js — Habit Streak & Analytics for Daily Routines
 *
 * Features:
 *   1. Per-step habit streaks — consecutive days a step was completed
 *   2. Routine analytics dashboard — weekly/monthly completion rates per phase
 *   3. Best/worst day-of-week analysis
 *   4. Average phase completion time (if start/end timestamps are logged)
 *   5. Injected into the Personal page as a collapsible "📊 Routine Stats" section
 *   6. Exposed as window.routineAnalytics for use by other scripts
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------------------
  function sp(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  function sk(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function p2(n) { return n < 10 ? '0' + n : '' + n; }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function addDaysISO(isoDate, n) {
    var d = new Date(isoDate + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function getPhases() {
    var r = sp('personalRoutines', {});
    if (r.phases && Array.isArray(r.phases) && r.phases.length > 0) return r.phases;
    var phases = [];
    ['morning', 'evening'].forEach(function (period) {
      var steps = r[period] || [];
      if (!steps.length) return;
      phases.push({
        id: period,
        name: period === 'morning' ? 'Morning' : 'Evening',
        emoji: period === 'morning' ? '🌅' : '🌙',
        startTime: period === 'morning' ? '06:30' : '21:00',
        steps: steps.map(function (s) {
          return typeof s === 'string' ? { text: s, duration: 0, notes: '' } : s;
        })
      });
    });
    return phases;
  }

  function getRouLog() { return sp('personalRoutineLog', {}); }

  // ---------------------------------------------------------------------------
  // Streak calculation
  // ---------------------------------------------------------------------------

  /**
   * Shared helper: count consecutive days (ending today) on which
   * the predicate fn(dateISO) returns true.
   */
  function calcConsecutiveStreak(predicateFn) {
    var streak = 0;
    var date = todayISO();
    for (var i = 0; i < 365; i++) {
      if (predicateFn(date)) {
        streak++;
      } else if (i === 0) {
        /* today not yet completed — don't break, check yesterday */
      } else {
        break;
      }
      date = addDaysISO(date, -1);
    }
    return streak;
  }

  /**
   * For a given phase + step index, count consecutive days (ending today)
   * on which the step was marked done.
   */
  function calcStepStreak(phaseId, stepIdx) {
    var log = getRouLog();
    return calcConsecutiveStreak(function (date) {
      var doneArr = (log[date] && log[date][phaseId]) ? log[date][phaseId] : [];
      return doneArr.indexOf(stepIdx) >= 0;
    });
  }

  /**
   * For a given phase, count consecutive days (ending today) on which
   * ALL steps were completed.
   */
  function calcPhaseStreak(phase) {
    var steps = phase.steps || [];
    if (!steps.length) return 0;
    var log = getRouLog();
    return calcConsecutiveStreak(function (date) {
      var doneArr = (log[date] && log[date][phase.id]) ? log[date][phase.id] : [];
      return steps.every(function (_, si) { return doneArr.indexOf(si) >= 0; });
    });
  }

  /**
   * Returns completion percentage for a phase on a given date.
   */
  function phasePctOnDate(phase, dateISO) {
    var steps = phase.steps || [];
    if (!steps.length) return 0;
    var log = getRouLog();
    var doneArr = (log[dateISO] && log[dateISO][phase.id]) ? log[dateISO][phase.id] : [];
    return Math.round(doneArr.filter(function (i) { return i < steps.length; }).length / steps.length * 100);
  }

  /**
   * Returns an array of {date, pct} for the past n days.
   */
  function phaseHistoryDays(phase, n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var date = addDaysISO(todayISO(), -i);
      out.push({ date: date, pct: phasePctOnDate(phase, date) });
    }
    return out;
  }

  /**
   * Returns array of 7 numbers [Sun..Sat] — average % complete across last 8 weeks.
   */
  function phaseAvgByDow(phase) {
    var totals = [0, 0, 0, 0, 0, 0, 0];
    var counts = [0, 0, 0, 0, 0, 0, 0];
    var today = todayISO();
    for (var i = 0; i < 56; i++) {
      var date = addDaysISO(today, -i);
      var dow = new Date(date + 'T12:00:00').getDay();
      totals[dow] += phasePctOnDate(phase, date);
      counts[dow]++;
    }
    return totals.map(function (t, i) {
      return counts[i] > 0 ? Math.round(t / counts[i]) : 0;
    });
  }

  // ---------------------------------------------------------------------------
  // DOM building — Analytics Dashboard
  // ---------------------------------------------------------------------------

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function buildAnalyticsDashboard() {
    var phases = getPhases();
    var wrap = document.createElement('div');
    wrap.className = 'ra-dashboard';

    if (!phases.length) {
      var empty = document.createElement('div');
      empty.className = 'ra-empty';
      empty.textContent = 'No routine phases found. Set up your routines in the Personal page.';
      wrap.appendChild(empty);
      return wrap;
    }

    phases.forEach(function (phase) {
      var steps = phase.steps || [];
      if (!steps.length) return;

      var section = document.createElement('div');
      section.className = 'ra-phase-section';

      /* Phase header with streak */
      var phaseStreak = calcPhaseStreak(phase);
      var hdr = document.createElement('div');
      hdr.className = 'ra-phase-header';
      hdr.innerHTML =
        '<span class="ra-phase-name">' + esc((phase.emoji || '') + ' ' + phase.name) + '</span>' +
        (phaseStreak > 0
          ? '<span class="ra-phase-streak">🔥 ' + phaseStreak + '-day streak</span>'
          : '<span class="ra-phase-streak-none">No current streak</span>');
      section.appendChild(hdr);

      /* 28-day bar chart */
      var hist = phaseHistoryDays(phase, 28);
      var chartWrap = document.createElement('div');
      chartWrap.className = 'ra-chart-wrap';
      var chart = document.createElement('div');
      chart.className = 'ra-bar-chart';
      var maxPct = Math.max.apply(null, hist.map(function (h) { return h.pct; }).concat([1]));
      hist.forEach(function (h) {
        var col = document.createElement('div');
        col.className = 'ra-bar-col';
        var bar = document.createElement('div');
        bar.className = 'ra-bar' + (h.pct === 0 ? ' ra-bar-zero' : h.pct === 100 ? ' ra-bar-full' : '');
        bar.style.height = Math.max(2, Math.round(h.pct / maxPct * 48)) + 'px';
        var d = new Date(h.date + 'T12:00:00');
        bar.title = MONTH_ABBR[d.getMonth()] + ' ' + d.getDate() + ': ' + h.pct + '%';
        col.appendChild(bar);
        /* date label every 7 days */
        if (hist.indexOf(h) % 7 === 0) {
          var lbl = document.createElement('div');
          lbl.className = 'ra-bar-lbl';
          lbl.textContent = (d.getMonth() + 1) + '/' + d.getDate();
          col.appendChild(lbl);
        }
        chart.appendChild(col);
      });
      chartWrap.appendChild(chart);
      var chartTitle = document.createElement('div');
      chartTitle.className = 'ra-chart-title';
      chartTitle.textContent = 'Last 28 days — % complete per day';
      chartWrap.appendChild(chartTitle);
      section.appendChild(chartWrap);

      /* Day-of-week averages */
      var avgByDow = phaseAvgByDow(phase);
      var bestDow  = avgByDow.indexOf(Math.max.apply(null, avgByDow));
      var worstDow = avgByDow.indexOf(Math.min.apply(null, avgByDow));
      var dowWrap = document.createElement('div');
      dowWrap.className = 'ra-dow-wrap';
      var dowTitle = document.createElement('div');
      dowTitle.className = 'ra-dow-title';
      dowTitle.textContent = 'Average by day of week (last 8 weeks)';
      dowWrap.appendChild(dowTitle);
      var dowBars = document.createElement('div');
      dowBars.className = 'ra-dow-bars';
      avgByDow.forEach(function (avg, dow) {
        var col = document.createElement('div');
        col.className = 'ra-dow-col' + (dow === bestDow ? ' best' : dow === worstDow ? ' worst' : '');
        var bar = document.createElement('div');
        bar.className = 'ra-dow-bar';
        bar.style.height = Math.max(2, Math.round(avg / 100 * 40)) + 'px';
        bar.title = DOW_LABELS[dow] + ': ' + avg + '%';
        var label = document.createElement('div');
        label.className = 'ra-dow-label';
        label.textContent = DOW_LABELS[dow].slice(0, 1);
        var pctLbl = document.createElement('div');
        pctLbl.className = 'ra-dow-pct';
        pctLbl.textContent = avg + '%';
        col.appendChild(bar);
        col.appendChild(label);
        col.appendChild(pctLbl);
        dowBars.appendChild(col);
      });
      dowWrap.appendChild(dowBars);
      if (avgByDow[bestDow] > 0) {
        var summary = document.createElement('div');
        summary.className = 'ra-dow-summary';
        summary.innerHTML =
          '🏆 Best: <strong>' + DOW_LABELS[bestDow] + '</strong> (' + avgByDow[bestDow] + '%)' +
          (avgByDow[worstDow] < avgByDow[bestDow]
            ? '&nbsp;&nbsp;🔻 Needs work: <strong>' + DOW_LABELS[worstDow] + '</strong> (' + avgByDow[worstDow] + '%)'
            : '');
        dowWrap.appendChild(summary);
      }
      section.appendChild(dowWrap);

      /* Per-step streaks */
      if (steps.length) {
        var streakTitle = document.createElement('div');
        streakTitle.className = 'ra-streak-title';
        streakTitle.textContent = '🔥 Per-Step Streaks';
        section.appendChild(streakTitle);

        var streakGrid = document.createElement('div');
        streakGrid.className = 'ra-streak-grid';
        steps.forEach(function (step, si) {
          var streak = calcStepStreak(phase.id, si);
          var row = document.createElement('div');
          row.className = 'ra-streak-row' + (streak >= 7 ? ' hot' : streak >= 3 ? ' warm' : '');
          row.innerHTML =
            '<span class="ra-streak-step-name">' + esc(step.text || '') + '</span>' +
            '<span class="ra-streak-count">' + (streak > 0 ? '🔥 ' + streak + 'd' : '—') + '</span>';
          streakGrid.appendChild(row);
        });
        section.appendChild(streakGrid);
      }

      wrap.appendChild(section);
    });

    return wrap;
  }

  // ---------------------------------------------------------------------------
  // Render / refresh the stats section in the Personal page
  // ---------------------------------------------------------------------------

  function renderStats() {
    var container = document.getElementById('personalRoutineStatsSection');
    if (!container) return;
    container.innerHTML = '';
    container.appendChild(buildAnalyticsDashboard());
  }

  // ---------------------------------------------------------------------------
  // Inject styles
  // ---------------------------------------------------------------------------
  var STYLES = [
    '.ra-dashboard { display: flex; flex-direction: column; gap: 20px; }',
    '.ra-empty { color: #aaa; font-size: 0.85rem; padding: 12px 0; }',
    '.ra-phase-section {',
    '  background: var(--ios-bg-2, #f8f9fa); border-radius: 12px;',
    '  padding: 14px; display: flex; flex-direction: column; gap: 12px;',
    '}',
    '.ra-phase-header { display: flex; align-items: center; justify-content: space-between; }',
    '.ra-phase-name { font-weight: 700; font-size: 0.95rem; }',
    '.ra-phase-streak { font-size: 0.82rem; color: #e67e22; font-weight: 600; }',
    '.ra-phase-streak-none { font-size: 0.78rem; color: #aaa; }',
    '.ra-chart-wrap { display: flex; flex-direction: column; gap: 4px; }',
    '.ra-bar-chart {',
    '  display: flex; align-items: flex-end; gap: 2px; height: 52px;',
    '  padding-bottom: 2px;',
    '}',
    '.ra-bar-col { display: flex; flex-direction: column; align-items: center; flex: 1; }',
    '.ra-bar {',
    '  width: 100%; min-height: 2px; border-radius: 2px 2px 0 0;',
    '  background: #4a90e2; transition: height 0.3s ease;',
    '}',
    '.ra-bar.ra-bar-zero { background: #e0e0e0; }',
    '.ra-bar.ra-bar-full { background: #27ae60; }',
    '.ra-bar-lbl { font-size: 0.6rem; color: #aaa; margin-top: 2px; white-space: nowrap; }',
    '.ra-chart-title { font-size: 0.72rem; color: #888; }',
    '.ra-dow-wrap { display: flex; flex-direction: column; gap: 6px; }',
    '.ra-dow-title { font-size: 0.72rem; color: #888; }',
    '.ra-dow-bars { display: flex; gap: 4px; align-items: flex-end; height: 54px; }',
    '.ra-dow-col {',
    '  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;',
    '}',
    '.ra-dow-bar {',
    '  width: 100%; min-height: 2px; border-radius: 3px 3px 0 0;',
    '  background: #4a90e2;',
    '}',
    '.ra-dow-col.best .ra-dow-bar { background: #27ae60; }',
    '.ra-dow-col.worst .ra-dow-bar { background: #e74c3c; opacity: 0.7; }',
    '.ra-dow-label { font-size: 0.65rem; color: #666; font-weight: 600; }',
    '.ra-dow-pct { font-size: 0.6rem; color: #aaa; }',
    '.ra-dow-summary { font-size: 0.78rem; color: #555; }',
    '.ra-streak-title { font-size: 0.78rem; font-weight: 700; color: #555; }',
    '.ra-streak-grid { display: flex; flex-direction: column; gap: 4px; }',
    '.ra-streak-row {',
    '  display: flex; justify-content: space-between; align-items: center;',
    '  padding: 5px 8px; border-radius: 6px; font-size: 0.8rem;',
    '  background: rgba(0,0,0,0.03);',
    '}',
    '.ra-streak-row.warm { background: rgba(230,126,34,0.08); }',
    '.ra-streak-row.hot  { background: rgba(231,76,60,0.08); }',
    '.ra-streak-step-name { flex: 1; color: #333; }',
    '.ra-streak-count { font-size: 0.78rem; font-weight: 700; color: #e67e22; }',
    /* dark mode */
    '.dark-mode .ra-phase-section { background: rgba(255,255,255,0.05); }',
    '.dark-mode .ra-streak-row { background: rgba(255,255,255,0.04); }',
    '.dark-mode .ra-streak-step-name { color: #ddd; }',
    '.dark-mode .ra-dow-label { color: #aaa; }',
    '.dark-mode .ra-dow-summary { color: #aaa; }'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('raStyles')) return;
    var el = document.createElement('style');
    el.id = 'raStyles';
    el.textContent = STYLES;
    document.head.appendChild(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }

  // ---------------------------------------------------------------------------
  // Listen for routine data changes
  // ---------------------------------------------------------------------------
  window.addEventListener('app:data:updated', function () {
    if (document.getElementById('personalRoutineStatsSection')) renderStats();
  });
  window.addEventListener('storage', function (e) {
    if (e.key === 'personalRoutineLog' || e.key === 'personalRoutines') {
      if (document.getElementById('personalRoutineStatsSection')) renderStats();
    }
  });

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  window.routineAnalytics = {
    renderStats:      renderStats,
    calcStepStreak:   calcStepStreak,
    calcPhaseStreak:  calcPhaseStreak,
    phasePctOnDate:   phasePctOnDate,
    phaseHistoryDays: phaseHistoryDays,
    phaseAvgByDow:    phaseAvgByDow
  };

})();
