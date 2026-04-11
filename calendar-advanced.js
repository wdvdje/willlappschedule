/* ============================================================
   calendar-advanced.js
   Advanced calendar features (ICS export, heatmap, multi-day
   spans, drag-to-create, recurring exceptions, conflict
   detection, mini-month nav, NLP recurrence, Pomodoro timer,
   timezone selector).
   Loaded AFTER assets/app.js and BEFORE desktop.js.
   ============================================================ */
(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────
     HELPERS – safe references to globals defined in app.js
  ────────────────────────────────────────────────────────── */
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function nd(s) { return typeof normalizeDate === 'function' ? normalizeDate(s) : (s || ''); }
  function ev()  { return typeof getEvents    === 'function' ? getEvents()    : []; }
  function tk()  { return typeof getTasks     === 'function' ? getTasks()     : []; }
  function rem() { return typeof getReminders === 'function' ? getReminders() : {}; }
  function esc(s){ return typeof escapeHTML === 'function' ? escapeHTML(s) : (s+'').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  /* ══════════════════════════════════════════════════════════
     1. ICS / .ICS CALENDAR EXPORT
  ══════════════════════════════════════════════════════════ */
  function escICS(s) {
    return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function toICSDate(dateStr, timeStr) {
    if (!dateStr) return '';
    var d = dateStr.replace(/-/g, '');
    if (!timeStr) return d;
    return d + 'T' + timeStr.replace(/:/g, '') + '00';
  }

  function datePlusOne(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  }

  function generateICS() {
    var events = ev();
    var reminders = rem();
    var tasks = tk();

    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TimeScape Planner//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];

    events.forEach(function (e, idx) {
      if (!e.date) return;
      var uid = 'ev-' + (e.id || idx) + '@timescape.app';
      var hasTime = !!e.time;
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + uid);
      lines.push('SUMMARY:' + escICS((e.emoji ? e.emoji + ' ' : '') + (e.title || '')));
      if (hasTime) {
        lines.push('DTSTART:' + toICSDate(e.date, e.time));
        var endD = e.endDate || e.date;
        var endT = e.endTime || e.time;
        lines.push('DTEND:' + toICSDate(endD, endT));
      } else {
        lines.push('DTSTART;VALUE=DATE:' + e.date.replace(/-/g,''));
        var endDate = e.endDate ? e.endDate.replace(/-/g,'') : datePlusOne(e.date);
        lines.push('DTEND;VALUE=DATE:' + endDate);
      }
      if (e.location) lines.push('LOCATION:' + escICS(e.location));
      if (e.repeat && e.repeat !== 'none') {
        var rruleMap = { daily:'DAILY', '2day':'DAILY;INTERVAL=2', weekly:'WEEKLY', monthly:'MONTHLY' };
        var freq = rruleMap[e.repeat];
        if (!freq && e.repeat === 'custom' && e.repeatUnit) {
          var umap = { days:'DAILY', weeks:'WEEKLY', months:'MONTHLY', years:'YEARLY' };
          freq = (umap[e.repeatUnit] || 'DAILY') + ';INTERVAL=' + (e.repeatInterval || 1);
        }
        if (freq) {
          var rrule = 'RRULE:FREQ=' + freq;
          if (e.repeatUntil) rrule += ';UNTIL=' + e.repeatUntil.replace(/-/g,'') + 'T235959Z';
          lines.push(rrule);
        }
      }
      if (e.preBuffer) {
        lines.push('BEGIN:VALARM');
        lines.push('TRIGGER:-PT' + e.preBuffer + 'M');
        lines.push('ACTION:DISPLAY');
        lines.push('DESCRIPTION:' + escICS(e.title || '') + ' in ' + e.preBuffer + ' min');
        lines.push('END:VALARM');
      }
      lines.push('END:VEVENT');
    });

    Object.keys(reminders).forEach(function (dk) {
      (reminders[dk] || []).forEach(function (r, ri) {
        var uid = 'rem-' + dk + '-' + ri + '@timescape.app';
        lines.push('BEGIN:VEVENT');
        lines.push('UID:' + uid);
        lines.push('SUMMARY:\uD83D\uDD14 ' + escICS(r.text || ''));
        if (r.time) {
          lines.push('DTSTART:' + toICSDate(dk, r.time));
          lines.push('DTEND:' + toICSDate(dk, r.time));
        } else {
          lines.push('DTSTART;VALUE=DATE:' + dk.replace(/-/g,''));
          lines.push('DTEND;VALUE=DATE:' + datePlusOne(dk));
        }
        lines.push('END:VEVENT');
      });
    });

    tasks.forEach(function (t, ti) {
      if (!t.title && !t.text) return;
      var uid = 'task-' + ti + '@timescape.app';
      lines.push('BEGIN:VTODO');
      lines.push('UID:' + uid);
      lines.push('SUMMARY:\u2705 ' + escICS(t.title || t.text || ''));
      if (t.date) lines.push('DUE;VALUE=DATE:' + t.date.replace(/-/g,''));
      lines.push('STATUS:' + (t.done ? 'COMPLETED' : 'NEEDS-ACTION'));
      lines.push('PRIORITY:' + (t.priority === '3' ? '1' : t.priority === '1' ? '9' : '5'));
      lines.push('END:VTODO');
    });

    lines.push('END:VCALENDAR');

    var content = lines.join('\r\n');
    var blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'timescape-' + new Date().toISOString().slice(0,10) + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  window.generateICS = generateICS;

  function injectICSButton() {
    var section = document.getElementById('dataBackupSettings');
    if (!section || document.getElementById('icsExportBtn')) return;
    var wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid #eee;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
    var label = document.createElement('span');
    label.style.cssText = 'font-size:0.88rem;font-weight:600;color:#555';
    label.textContent = '\uD83D\uDCC5 Calendar export:';
    var btn = document.createElement('button');
    btn.id = 'icsExportBtn';
    btn.className = 'small-btn';
    btn.style.cssText = 'background:#27ae60;color:#fff';
    btn.textContent = 'Export .ICS (Apple/Google Calendar)';
    btn.addEventListener('click', function () {
      try { generateICS(); }
      catch (err) { alert('ICS export failed: ' + (err && err.message ? err.message : err)); }
    });
    wrap.appendChild(label);
    wrap.appendChild(btn);
    section.appendChild(wrap);
  }

  /* ══════════════════════════════════════════════════════════
     2. CALENDAR HEATMAP  (color-coded activity dots)
  ══════════════════════════════════════════════════════════ */
  function applyHeatmap() {
    var cal = document.getElementById('calendar');
    if (!cal) return;
    var selY = window.selectedYear;
    var selM = window.selectedMonth;
    var dim = new Date(selY, selM + 1, 0).getDate();
    var mStart = selY + '-' + p2(selM + 1) + '-01';
    var mEnd   = selY + '-' + p2(selM + 1) + '-' + p2(dim);
    var events = (typeof getExpandedEvents === 'function') ? getExpandedEvents(mStart, mEnd) : ev();
    var tasks = tk();
    var reminders = rem();

    cal.querySelectorAll('.day[data-day]').forEach(function (cell) {
      var day = parseInt(cell.dataset.day, 10);
      var ymd = selY + '-' + p2(selM + 1) + '-' + p2(day);
      var total = events.filter(function (e) { return nd(e.date) === ymd; }).length
                + tasks.filter(function (t)  { return nd(t.date) === ymd; }).length
                + (reminders[ymd] || []).length;
      if (total === 0) { var old = cell.querySelector('.heat-bar'); if (old) old.remove(); return; }

      var bar = cell.querySelector('.heat-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'heat-bar';
        bar.setAttribute('aria-hidden', 'true');
        bar.style.cssText = 'position:absolute;top:0;left:0;right:0;height:3px;border-radius:3px 3px 0 0;pointer-events:none;z-index:2';
        if (getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
        cell.insertBefore(bar, cell.firstChild);
      }
      var color = total <= 2 ? '#27ae60' : total <= 4 ? '#f39c12' : '#e74c3c';
      var opacity = Math.min(0.45 + total * 0.08, 0.95);
      bar.style.background = color;
      bar.style.opacity = String(opacity);
      bar.title = total + ' item' + (total !== 1 ? 's' : '');
    });
  }

  /* ══════════════════════════════════════════════════════════
     3. COLOR-CODED CONFLICT DETECTION
  ══════════════════════════════════════════════════════════ */
  function parseMin(t) {
    if (!t) return null;
    var p = t.split(':');
    return parseInt(p[0], 10) * 60 + (parseInt(p[1] || '0', 10));
  }

  function detectConflicts() {
    var cal = document.getElementById('calendar');
    if (!cal) return;
    var selY = window.selectedYear;
    var selM = window.selectedMonth;
    var dim = new Date(selY, selM + 1, 0).getDate();
    var mStart = selY + '-' + p2(selM + 1) + '-01';
    var mEnd   = selY + '-' + p2(selM + 1) + '-' + p2(dim);
    var events = (typeof getExpandedEvents === 'function') ? getExpandedEvents(mStart, mEnd) : ev();

    cal.querySelectorAll('.day[data-day]').forEach(function (cell) {
      var day = parseInt(cell.dataset.day, 10);
      var ymd = selY + '-' + p2(selM + 1) + '-' + p2(day);
      var dayEvs = events.filter(function (e) { return nd(e.date) === ymd && e.time; });
      var conflict = false;
      for (var i = 0; i < dayEvs.length && !conflict; i++) {
        var sA = parseMin(dayEvs[i].time);
        var eA = dayEvs[i].endTime ? parseMin(dayEvs[i].endTime) : (sA !== null ? sA + 60 : null);
        if (sA === null || eA === null) continue;
        for (var j = i + 1; j < dayEvs.length && !conflict; j++) {
          var sB = parseMin(dayEvs[j].time);
          var eB = dayEvs[j].endTime ? parseMin(dayEvs[j].endTime) : (sB !== null ? sB + 60 : null);
          if (sB === null || eB === null) continue;
          if (sA < eB && sB < eA) conflict = true;
        }
      }

      var badge = cell.querySelector('.conflict-badge');
      if (conflict) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'conflict-badge';
          badge.textContent = '\u26A0\uFE0F';
          badge.title = 'Schedule conflict on this day';
          badge.style.cssText = 'position:absolute;bottom:2px;right:2px;font-size:0.68rem;line-height:1;z-index:5;pointer-events:none';
          if (getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
          cell.appendChild(badge);
        }
      } else if (badge) {
        badge.remove();
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     4. MULTI-DAY EVENT SPANNING INDICATORS
  ══════════════════════════════════════════════════════════ */
  function applyMultiDaySpans() {
    var cal = document.getElementById('calendar');
    if (!cal) return;
    var events = ev();
    var multiDay = events.filter(function (e) {
      return e.endDate && nd(e.endDate) > nd(e.date);
    });
    if (!multiDay.length) return;
    var selY = window.selectedYear;
    var selM = window.selectedMonth;

    cal.querySelectorAll('.day[data-day]').forEach(function (cell) {
      var day = parseInt(cell.dataset.day, 10);
      var ymd = selY + '-' + p2(selM + 1) + '-' + p2(day);
      // Remove stale continuation chips
      cell.querySelectorAll('.multiday-cont').forEach(function (el) { el.remove(); });

      multiDay.forEach(function (e) {
        var start = nd(e.date);
        var end   = nd(e.endDate);
        if (ymd <= start || ymd > end) return; // start-day shown via regular generateCalendar; skip days outside range
        var emojiRow = cell.querySelector('.emoji-row');
        if (!emojiRow) return;
        var chip = document.createElement('span');
        chip.className = 'event-preview event multiday-cont';
        chip.dataset.domain = e.domain || 'personal';
        chip.title = (e.title || '') + ' (continues)';
        chip.style.cssText = 'opacity:0.65;font-style:italic';
        var ee = document.createElement('span'); ee.className = 'ep-emoji'; ee.textContent = e.emoji || '\uD83D\uDCCC';
        var el = document.createElement('span'); el.className = 'ep-label'; el.textContent = (e.title || '') + ' \u21A9';
        chip.appendChild(ee); chip.appendChild(el);
        emojiRow.appendChild(chip);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     5. DRAG-TO-CREATE EVENTS  (desktop only)
  ══════════════════════════════════════════════════════════ */
  var _drag = { on: false, start: 0, end: 0 };

  function wireDragCreate() {
    var cal = document.getElementById('calendar');
    if (!cal || cal.dataset.dragWired) return;
    cal.dataset.dragWired = '1';

    function dayOf(el) {
      var c = el && el.closest ? el.closest('.day[data-day]') : null;
      return c ? parseInt(c.dataset.day, 10) : 0;
    }

    cal.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest('.event-preview') || e.target.closest('button')) return;
      var d = dayOf(e.target);
      if (!d) return;
      _drag.on = true; _drag.start = d; _drag.end = d;
      highlightDrag();
    });

    cal.addEventListener('mouseover', function (e) {
      if (!_drag.on) return;
      var d = dayOf(e.target);
      if (d && d !== _drag.end) { _drag.end = d; highlightDrag(); }
    });

    document.addEventListener('mouseup', function () {
      if (!_drag.on) return;
      _drag.on = false;
      clearDrag();
      var s = Math.min(_drag.start, _drag.end);
      var en = Math.max(_drag.start, _drag.end);
      if (s) openDragCreateForm(s, en);
    });
  }

  function highlightDrag() {
    var cal = document.getElementById('calendar');
    if (!cal) return;
    var lo = Math.min(_drag.start, _drag.end);
    var hi = Math.max(_drag.start, _drag.end);
    cal.querySelectorAll('.day[data-day]').forEach(function (cell) {
      var d = parseInt(cell.dataset.day, 10);
      cell.style.outline = (d >= lo && d <= hi) ? '2px solid #4a90e2' : '';
      cell.style.outlineOffset = '-2px';
    });
  }

  function clearDrag() {
    var cal = document.getElementById('calendar');
    if (!cal) return;
    cal.querySelectorAll('.day[data-day]').forEach(function (cell) {
      cell.style.outline = '';
      cell.style.outlineOffset = '';
    });
  }

  function openDragCreateForm(startDay, endDay) {
    var y = window.selectedYear, m = window.selectedMonth;
    var fmt = function (d) { return y + '-' + p2(m + 1) + '-' + p2(d); };
    var startDate = fmt(startDay);
    var endDate   = endDay > startDay ? fmt(endDay) : '';

    if (typeof window.showView === 'function') {
      window.showView('events');
      setTimeout(function () {
        var f = document.getElementById('eventDate');
        if (f) { f.value = startDate; f.dispatchEvent(new Event('change')); }
        var fe = document.getElementById('eventEndDate');
        if (fe) { fe.value = endDate; fe.dispatchEvent(new Event('change')); }
        var ft = document.getElementById('eventTitle');
        if (ft) ft.focus();
        window.selectedDay = startDay;
      }, 60);
    }
  }

  /* ══════════════════════════════════════════════════════════
     6. RECURRING EVENT EXCEPTION EDITING
  ══════════════════════════════════════════════════════════ */
  function injectExceptionRow() {
    var modal = document.getElementById('editModal');
    if (!modal || document.getElementById('editOccurrenceRow')) return;

    var row = document.createElement('div');
    row.id = 'editOccurrenceRow';
    row.style.cssText = 'display:none;margin-top:8px;padding:8px 10px;background:#f0f6ff;border-radius:6px;font-size:0.88rem;border:1px solid #c8dff8';
    row.innerHTML = '<b>\uD83D\uDD01 Recurring event. Edit:</b>' +
      '<label style="display:block;margin-top:4px"><input type="radio" name="editOccurrence" value="this" checked> This occurrence only</label>' +
      '<label style="display:block;margin-top:2px"><input type="radio" name="editOccurrence" value="all"> All occurrences</label>';

    var saveBtn = document.getElementById('saveEdit');
    if (saveBtn && saveBtn.parentNode) {
      saveBtn.parentNode.insertBefore(row, saveBtn.closest('[style*="justify-content"]') || saveBtn.parentNode.lastChild);
    }

    // Show/hide when editEvent is called
    var origEdit = window.editEvent;
    if (typeof origEdit === 'function') {
      window.editEvent = function (id) {
        origEdit(id);
        setTimeout(function () {
          var events = ev();
          var e = null;
          for (var i = 0; i < events.length; i++) { if (events[i].id === id) { e = events[i]; break; } }
          var occRow = document.getElementById('editOccurrenceRow');
          if (occRow) occRow.style.display = (e && e.repeat && e.repeat !== 'none') ? 'block' : 'none';
          // Reset to "all"
          var allRadio = document.querySelector('input[name="editOccurrence"][value="all"]');
          if (allRadio) allRadio.checked = true;
        }, 0);
      };
    }

    // Intercept form submit to handle "this occurrence only"
    var editForm = document.getElementById('editForm');
    if (editForm) {
      editForm.addEventListener('submit', function (e) {
        var kindEl = document.getElementById('editKind');
        if (!kindEl || kindEl.value !== 'event') return;
        var thisRadio = document.querySelector('input[name="editOccurrence"][value="this"]');
        if (!thisRadio || !thisRadio.checked) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        saveOccurrenceException();
      }, true);
    }
  }

  function saveOccurrenceException() {
    var id   = parseInt((document.getElementById('editEventId') || {}).value, 10);
    var date = (document.getElementById('editDate') || {}).value || '';
    if (!id || !date) return;

    var events = typeof getEvents === 'function' ? getEvents() : [];
    var idx = -1;
    for (var i = 0; i < events.length; i++) { if (events[i].id === id) { idx = i; break; } }
    if (idx === -1) return;

    var exceptions = (events[idx].exceptions || []).slice();
    var dup = exceptions.findIndex(function (ex) { return ex.date === date; });
    if (dup !== -1) exceptions.splice(dup, 1);

    exceptions.push({
      date:     date,
      title:    (document.getElementById('editText')     || {}).value || events[idx].title,
      time:     (document.getElementById('editTime')     || {}).value || '',
      endTime:  (document.getElementById('editEndTime')  || {}).value || '',
      location: (document.getElementById('editLocation') || {}).value || '',
      emoji:    (document.getElementById('editEmoji')    || {}).value || ''
    });
    events[idx].exceptions = exceptions;

    if (typeof setEvents === 'function') setEvents(events);
    if (typeof closeEditModal === 'function') closeEditModal();
    try { window.generateCalendar(); } catch (_) {}
    try { if (window.selectedDay) window.showReminders(window.selectedDay); } catch (_) {}
    try { window.renderEvents && window.renderEvents(); } catch (_) {}
    try { window.showUndoToast && window.showUndoToast('\u2705 Saved for this occurrence only'); } catch (_) {}
  }

  /* ══════════════════════════════════════════════════════════
     7. MINI-MONTH NAVIGATOR  (inline, below calendar grid)
  ══════════════════════════════════════════════════════════ */
  function injectMiniMonthSection() {
    var calPage = document.getElementById('page-calendar');
    if (!calPage || document.getElementById('miniMonthNav')) return;

    var section = document.createElement('div');
    section.id = 'miniMonthNav';
    section.className = 'mini-month-nav';
    section.style.cssText = 'display:none;max-width:900px;margin:12px auto 0;padding:0 12px;box-sizing:border-box';
    section.innerHTML =
      '<div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">' +
        '<div id="miniCalPrev" style="flex:0 0 auto;min-width:160px;max-width:200px;background:#fff;border-radius:8px;box-shadow:0 1px 6px rgba(0,0,0,0.08);padding:8px 10px"></div>' +
        '<div id="miniCalNext" style="flex:0 0 auto;min-width:160px;max-width:200px;background:#fff;border-radius:8px;box-shadow:0 1px 6px rgba(0,0,0,0.08);padding:8px 10px"></div>' +
      '</div>';

    // Insert after the calendar summary section
    var summary = document.getElementById('calendarSummary');
    if (summary && summary.parentNode) {
      summary.parentNode.insertBefore(section, summary.nextSibling);
    } else {
      calPage.appendChild(section);
    }

    refreshMiniMonths();
  }

  var MNAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function renderMiniMonth(container, year, month) {
    if (!container) return;
    var first  = new Date(year, month, 1);
    var daysInM = new Date(year, month + 1, 0).getDate();
    var startDow = first.getDay();
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + p2(today.getMonth() + 1) + '-' + p2(today.getDate());

    var html = '<div style="font-weight:700;text-align:center;font-size:0.8rem;color:#555;margin-bottom:4px">' +
               MNAMES[month] + ' ' + year + '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;text-align:center;font-size:0.7rem">';
    ['S','M','T','W','T','F','S'].forEach(function (d) {
      html += '<span style="color:#aaa;padding:1px 0">' + d + '</span>';
    });
    for (var i = 0; i < startDow; i++) html += '<span></span>';
    for (var d = 1; d <= daysInM; d++) {
      var ymd = year + '-' + p2(month + 1) + '-' + p2(d);
      var isTd = ymd === todayStr;
      var isSel = window.selectedYear === year && window.selectedMonth === month && window.selectedDay === d;
      var bg = isTd ? '#4a90e2' : isSel ? '#dbeafe' : '';
      var col = isTd ? '#fff' : isSel ? '#1d4ed8' : '#333';
      html += '<span data-mday="' + d + '" data-mmonth="' + month + '" data-myear="' + year + '"' +
              ' style="cursor:pointer;padding:2px 1px;border-radius:3px;background:' + bg + ';color:' + col + '">' + d + '</span>';
    }
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-mday]').forEach(function (el) {
      el.addEventListener('click', function () {
        window.selectedYear  = parseInt(el.dataset.myear, 10);
        window.selectedMonth = parseInt(el.dataset.mmonth, 10);
        window.selectedDay   = parseInt(el.dataset.mday, 10);
        try { window.generateCalendar(); } catch (_) {}
        try { window.showReminders(window.selectedDay); } catch (_) {}
        refreshMiniMonths();
      });
    });
  }

  function refreshMiniMonths() {
    var prev = document.getElementById('miniCalPrev');
    var next = document.getElementById('miniCalNext');
    if (!prev && !next) return;
    var y = window.selectedYear  || new Date().getFullYear();
    var m = window.selectedMonth != null ? window.selectedMonth : new Date().getMonth();
    var pm = m - 1, py = y; if (pm < 0)  { pm = 11; py--; }
    var nm = m + 1, ny = y; if (nm > 11) { nm = 0; ny++; }
    if (prev) renderMiniMonth(prev, py, pm);
    if (next) renderMiniMonth(next, ny, nm);
  }

  function showMiniMonthNav() {
    var el = document.getElementById('miniMonthNav');
    if (el) el.style.display = 'block';
  }
  function hideMiniMonthNav() {
    var el = document.getElementById('miniMonthNav');
    if (el) el.style.display = 'none';
  }

  /* ══════════════════════════════════════════════════════════
     8. NLP RECURRING PATTERNS  ("every Tuesday at 3pm")
  ══════════════════════════════════════════════════════════ */
  function patchNLP() {
    if (typeof window.parseQuickAdd !== 'function') return;
    if (window.parseQuickAdd._advPatched) return;
    var orig = window.parseQuickAdd;
    window.parseQuickAdd = function (text) {
      var result = orig(text);
      if (!result) return result;

      var lower = text.toLowerCase();
      var DAY_MAP = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6,
                      monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0 };

      // "every day" / "daily"
      if (/\bevery\s+day\b|\bdaily\b/i.test(text) && !result.repeat) {
        result.repeat = 'daily';
        if (!result.date) result.date = new Date().toISOString().slice(0,10);
        if (result.kind === 'unsorted') result.kind = 'event';
      }

      // "every week" / "weekly"
      if (/\bevery\s+week\b|\bweekly\b/i.test(text) && !result.repeat) {
        result.repeat = 'weekly';
        if (result.kind === 'unsorted') result.kind = 'event';
      }

      // "every [Day][ and [Day]]"
      var everyMatch = lower.match(/\bevery\s+((?:(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)(?:\s*(?:and|,)\s*)?)+)/);
      if (everyMatch && !result.repeat) {
        var dayTokens = everyMatch[1].match(/\b(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi) || [];
        if (dayTokens.length) {
          var dows = dayTokens.map(function (d) {
            var k = d.toLowerCase().slice(0,3);
            return DAY_MAP[k] !== undefined ? DAY_MAP[k] : DAY_MAP[d.toLowerCase()];
          }).filter(function (n) { return n !== undefined; });
          if (dows.length) {
            result.recurringDays = dows;
            result.repeat = 'weekly';
            // Find the next occurrence of the first target day
            var now2 = new Date();
            var target = dows[0];
            var diff = target - now2.getDay();
            if (diff <= 0) diff += 7;
            var next = new Date(now2);
            next.setDate(now2.getDate() + diff);
            if (!result.date) {
              result.date = next.getFullYear() + '-' + p2(next.getMonth()+1) + '-' + p2(next.getDate());
            }
            if (result.kind === 'unsorted') result.kind = 'event';
          }
        }
      }

      // "every month" / "monthly"
      if (/\bevery\s+month\b|\bmonthly\b/i.test(text) && !result.repeat) {
        result.repeat = 'monthly';
        if (result.kind === 'unsorted') result.kind = 'event';
      }

      return result;
    };
    window.parseQuickAdd._advPatched = true;

    // Also pass repeat info through doQuickAdd by patching wireQuickAdd result
    // (wireQuickAdd is called before this script but parseQuickAdd is called at runtime)
  }

  /* Patch doQuickAdd (wireQuickAdd closure) to honour result.repeat for events */
  function patchQuickAddRepeat() {
    // We intercept the app:data:updated flow — simpler: patch addEvent to also
    // read repeat from the quickAdd result. Since doQuickAdd calls getEvents /
    // setEvents directly we patch setEvents to carry the repeat info through.
    // Actually the cleanest approach: after parseQuickAdd returns a result with
    // repeat info, we add it to the event. We do this by storing a pending
    // repeat on window and then patching setEvents to attach it.
    // Simpler: expose a global that doQuickAdd can check.
    window._qaRepeatPending = null;
    var origPQA = window.parseQuickAdd;
    window.parseQuickAdd = function (text) {
      var r = origPQA(text);
      if (r && r.repeat && r.repeat !== 'none') {
        window._qaRepeatPending = { repeat: r.repeat, recurringDays: r.recurringDays || [] };
      } else {
        window._qaRepeatPending = null;
      }
      return r;
    };

    // Patch setEvents to attach pending repeat to newest event
    var origSE = typeof setEvents === 'function' ? setEvents : null;
    if (origSE && !window._setEventsRepeatPatched) {
      window._setEventsRepeatPatched = true;
      var wrappedSE = function (evs) {
        if (window._qaRepeatPending && Array.isArray(evs) && evs.length) {
          var last = evs[evs.length - 1];
          if (!last.repeat || last.repeat === 'none') {
            last.repeat = window._qaRepeatPending.repeat || 'none';
          }
          window._qaRepeatPending = null;
        }
        origSE(evs);
      };
      // Override global setEvents safely
      try { window.setEvents = wrappedSE; } catch (_) {}
    }
  }

  /* ══════════════════════════════════════════════════════════
     9. POMODORO TIMER  (desktop only, floating)
  ══════════════════════════════════════════════════════════ */
  var _pom = { active: false, minutes: 25, seconds: 0, timer: null, mode: 'work', taskTitle: '' };

  function pomDisplay() {
    var el = document.getElementById('pomClock');
    var lb = document.getElementById('pomModeLabel');
    if (el) el.textContent = p2(_pom.minutes) + ':' + p2(_pom.seconds);
    if (lb) {
      lb.textContent = _pom.mode === 'break' ? '\u2615 Break time' : '\uD83C\uDF45 Focus';
      lb.style.color = _pom.mode === 'break' ? '#27ae60' : '#e74c3c';
    }
    var clock = document.getElementById('pomClock');
    if (clock) clock.style.color = _pom.mode === 'break' ? '#27ae60' : '#e74c3c';
  }

  function pomStart() {
    if (_pom.active) return;
    _pom.active = true;
    var startBtn  = document.getElementById('pomStartBtn');
    var pauseBtn  = document.getElementById('pomPauseBtn');
    if (startBtn) startBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = '';

    _pom.timer = setInterval(function () {
      if (_pom.seconds === 0) {
        if (_pom.minutes === 0) {
          clearInterval(_pom.timer); _pom.active = false;
          if (startBtn) { startBtn.style.display = ''; startBtn.textContent = '\u25B6 Restart'; }
          if (pauseBtn) pauseBtn.style.display = 'none';
          var msg = _pom.mode === 'work'
            ? '\uD83C\uDF45 Pomodoro complete! Time for a break.'
            : '\u2615 Break over! Back to work.';
          try { if ('Notification' in window && Notification.permission === 'granted') new Notification('TimeScape', { body: msg, tag: 'pom' }); } catch (_) {}
          try { window.showUndoToast && window.showUndoToast(msg); } catch (_) {}
          return;
        }
        _pom.minutes--; _pom.seconds = 59;
      } else {
        _pom.seconds--;
      }
      pomDisplay();
    }, 1000);
  }

  function pomPause() {
    clearInterval(_pom.timer); _pom.active = false;
    var startBtn = document.getElementById('pomStartBtn');
    var pauseBtn = document.getElementById('pomPauseBtn');
    if (startBtn) { startBtn.style.display = ''; startBtn.textContent = '\u25B6 Resume'; }
    if (pauseBtn) pauseBtn.style.display = 'none';
  }

  function pomReset(mode, mins) {
    clearInterval(_pom.timer); _pom.active = false;
    _pom.mode = mode || _pom.mode;
    _pom.minutes = mins || (_pom.mode === 'break' ? 5 : 25);
    _pom.seconds = 0;
    var startBtn = document.getElementById('pomStartBtn');
    var pauseBtn = document.getElementById('pomPauseBtn');
    if (startBtn) { startBtn.style.display = ''; startBtn.textContent = '\u25B6 Start'; }
    if (pauseBtn) pauseBtn.style.display = 'none';
    pomDisplay();
  }

  function injectPomodoro() {
    if (document.getElementById('dtPomodoro')) return;

    var pom = document.createElement('div');
    pom.id = 'dtPomodoro';
    pom.style.cssText = 'position:fixed;bottom:80px;left:16px;z-index:200;background:#fff;' +
      'border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,0.13);padding:12px 16px;width:220px;' +
      "font-family:'Source Sans 3',Arial,sans-serif;display:none;user-select:none";
    pom.innerHTML = [
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">',
      '  <span id="pomModeLabel" style="font-weight:700;font-size:0.9rem;color:#e74c3c">\uD83C\uDF45 Focus</span>',
      '  <button id="pomCloseBtn" style="background:none;border:none;cursor:pointer;font-size:1rem;color:#999;padding:0">\u2715</button>',
      '</div>',
      '<div id="pomTask" style="font-size:0.75rem;color:#888;margin-bottom:6px;max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>',
      '<div id="pomClock" style="font-size:2.4rem;font-weight:700;text-align:center;color:#e74c3c;letter-spacing:0.05em;margin-bottom:10px">25:00</div>',
      '<div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap">',
      '  <button id="pomStartBtn" class="small-btn" style="background:#e74c3c;color:#fff">\u25B6 Start</button>',
      '  <button id="pomPauseBtn" class="small-btn" style="background:#e67e22;color:#fff;display:none">\u23F8 Pause</button>',
      '  <button id="pomResetBtn" class="small-btn">\u21BA Reset</button>',
      '  <button id="pomBreakBtn" class="small-btn" style="background:#27ae60;color:#fff">\u2615 Break</button>',
      '</div>'
    ].join('');
    document.body.appendChild(pom);

    document.getElementById('pomCloseBtn').addEventListener('click', function () {
      pomReset('work', 25); pom.style.display = 'none';
    });
    document.getElementById('pomStartBtn').addEventListener('click', pomStart);
    document.getElementById('pomPauseBtn').addEventListener('click', pomPause);
    document.getElementById('pomResetBtn').addEventListener('click', function () { pomReset(_pom.mode); });
    document.getElementById('pomBreakBtn').addEventListener('click', function () { pomReset('break', 5); });
  }

  function injectPomLaunchBtn() {
    var taskH = document.querySelector('#page-tasks h2');
    if (!taskH || document.getElementById('pomLaunchBtn')) return;
    var btn = document.createElement('button');
    btn.id = 'pomLaunchBtn';
    btn.className = 'small-btn';
    btn.style.cssText = 'background:#e74c3c;color:#fff;margin:4px 12px 8px';
    btn.textContent = '\uD83C\uDF45 Pomodoro Timer';
    btn.addEventListener('click', function () {
      var p = document.getElementById('dtPomodoro');
      if (p) { p.style.display = p.style.display === 'none' ? 'block' : 'none'; }
    });
    taskH.insertAdjacentElement('afterend', btn);
  }

  /* Expose so tasks can start a Pomodoro */
  window.startTaskPomodoro = function (title) {
    var p = document.getElementById('dtPomodoro');
    if (!p) { injectPomodoro(); p = document.getElementById('dtPomodoro'); }
    if (p) p.style.display = 'block';
    _pom.taskTitle = title || '';
    var tEl = document.getElementById('pomTask');
    if (tEl) tEl.textContent = title ? 'Task: ' + title : '';
    pomReset('work', 25);
    pomStart();
  };

  /* ══════════════════════════════════════════════════════════
     10. TIMEZONE SELECTOR
  ══════════════════════════════════════════════════════════ */
  var TIMEZONES = [
    'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
    'America/Anchorage','Pacific/Honolulu','America/Toronto','America/Vancouver',
    'Europe/London','Europe/Dublin','Europe/Paris','Europe/Berlin','Europe/Rome',
    'Europe/Madrid','Europe/Amsterdam','Europe/Moscow','Asia/Dubai','Asia/Kolkata',
    'Asia/Bangkok','Asia/Shanghai','Asia/Tokyo','Asia/Seoul','Australia/Sydney',
    'Pacific/Auckland','Africa/Johannesburg','America/Sao_Paulo'
  ];

  function injectTimezoneSection() {
    var settings = document.getElementById('page-settings');
    if (!settings || document.getElementById('dtTzSection')) return;
    var profileSec = document.getElementById('userProfile');
    if (!profileSec) return;

    var sec = document.createElement('section');
    sec.id = 'dtTzSection';
    sec.style.cssText = 'margin-top:18px';
    sec.innerHTML = [
      '<h3>\uD83C\uDF0D Timezone</h3>',
      '<p style="font-size:0.88rem;color:#666;margin:4px 0 8px">Choose your timezone for event time display.</p>',
      '<select id="dtTzSelect" style="width:100%;max-width:380px">',
      '  <option value="">System default (' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'local') + ')</option>',
      '</select>',
      '<div style="display:flex;gap:8px;margin-top:8px">',
      '  <button id="dtTzSave" class="small-btn" style="background:#4a90e2;color:#fff">Save timezone</button>',
      '  <button id="dtTzClear" class="small-btn">Reset to system</button>',
      '</div>',
      '<div id="dtTzStatus" style="margin-top:6px;font-size:0.85rem;color:#666"></div>'
    ].join('');

    profileSec.insertAdjacentElement('afterend', sec);

    var sel = document.getElementById('dtTzSelect');
    TIMEZONES.forEach(function (tz) {
      var opt = document.createElement('option');
      opt.value = tz;
      opt.textContent = tz.replace(/_/g,' ').replace('/','\u00a0/\u00a0');
      sel.appendChild(opt);
    });
    var saved = localStorage.getItem('userTimezone') || '';
    if (saved) sel.value = saved;

    document.getElementById('dtTzSave').addEventListener('click', function () {
      var val = sel.value || '';
      localStorage.setItem('userTimezone', val);
      var st = document.getElementById('dtTzStatus');
      if (st) st.textContent = val ? 'Timezone saved: ' + val : 'Using system timezone.';
    });
    document.getElementById('dtTzClear').addEventListener('click', function () {
      localStorage.removeItem('userTimezone');
      if (sel) sel.value = '';
      var st = document.getElementById('dtTzStatus');
      if (st) st.textContent = 'Reset to system timezone.';
    });
  }

  /* ══════════════════════════════════════════════════════════
     PATCH generateCalendar to apply heatmap + conflicts + spans
  ══════════════════════════════════════════════════════════ */
  function patchGenerateCalendar() {
    if (typeof window.generateCalendar !== 'function') return;
    if (window.generateCalendar._advPatched) return;
    var orig = window.generateCalendar;
    window.generateCalendar = function () {
      orig.apply(this, arguments);
      try { applyHeatmap(); }        catch (e) { /* silent */ }
      try { detectConflicts(); }     catch (e) { /* silent */ }
      try { applyMultiDaySpans(); }  catch (e) { /* silent */ }
      try { refreshMiniMonths(); }   catch (e) { /* silent */ }
    };
    window.generateCalendar._advPatched = true;
  }

  /* ══════════════════════════════════════════════════════════
     RESPONSIVE HELPERS
  ══════════════════════════════════════════════════════════ */
  function isDesktop() {
    return window.matchMedia && window.matchMedia('(min-width: 901px)').matches;
  }

  function initDesktopFeatures() {
    if (!isDesktop()) return;
    try { injectPomodoro(); }    catch (e) { /* silent */ }
    try { injectPomLaunchBtn(); } catch (e) { /* silent */ }
    try { wireDragCreate(); }    catch (e) { /* silent */ }
  }

  function initGlobalFeatures() {
    try { patchGenerateCalendar(); }  catch (e) {}
    try { patchNLP(); }               catch (e) {}
    try { patchQuickAddRepeat(); }    catch (e) {}
    try { injectICSButton(); }        catch (e) {}
    try { injectMiniMonthSection(); } catch (e) {}
    try { injectExceptionRow(); }     catch (e) {}
    try { injectTimezoneSection(); }  catch (e) {}
  }

  /* ══════════════════════════════════════════════════════════
     EVENT LISTENERS & BOOT
  ══════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function () {
    // Give app.js time to finish wiring (it also listens to DOMContentLoaded)
    setTimeout(function () {
      initGlobalFeatures();
      initDesktopFeatures();
    }, 300);
  });

  window.addEventListener('view:show', function (e) {
    var view = e.detail && e.detail.view;
    if (view === 'calendar' || view === 'today') {
      showMiniMonthNav();
      setTimeout(function () {
        try { refreshMiniMonths(); } catch (_) {}
        if (isDesktop()) try { wireDragCreate(); } catch (_) {}
      }, 80);
    } else {
      hideMiniMonthNav();
    }
    if (view === 'tasks' && isDesktop()) {
      setTimeout(function () { try { injectPomLaunchBtn(); } catch (_) {} }, 80);
    }
    if (view === 'settings') {
      setTimeout(function () {
        try { injectICSButton(); }       catch (_) {}
        try { injectTimezoneSection(); } catch (_) {}
      }, 80);
    }
  });

  window.addEventListener('app:data:updated', function () {
    try { applyHeatmap(); }        catch (_) {}
    try { detectConflicts(); }     catch (_) {}
    try { applyMultiDaySpans(); }  catch (_) {}
    try { refreshMiniMonths(); }   catch (_) {}
  });

  window.matchMedia('(min-width: 901px)').addEventListener('change', function (mq) {
    if (mq.matches) {
      initDesktopFeatures();
    } else {
      var p = document.getElementById('dtPomodoro'); if (p) p.style.display = 'none';
    }
  });

})();
