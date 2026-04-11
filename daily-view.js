(function () {
  /* ────────────────────────────────────────────
     Daily-view.js – vertical calendar-style timeline
     Shows events spanning across hours, with day navigation.
     ──────────────────────────────────────────── */

  // DOM accessors (lazy – elements may not exist at eval time)
  function getDailyView() { return document.getElementById('dailyView'); }
  function getDayPartSelect() { return null; }
  function getCalendarEl() { return document.getElementById('calendar'); }

  const PRIMARY_COLOR = '#4a90e2';
  const REMINDER_COLOR = '#e67e22';
  const TASK_DEFAULT_COLOR = '#2ecc71';
  const HOUR_HEIGHT = 60; // px per hour slot
  const REMINDER_DEFAULT_DURATION = 15; // minutes
  const TASK_DEFAULT_DURATION = 30; // minutes
  const GUTTER_WIDTH = 56; // px, keep in sync with CSS .dv-gutter
  const MAX_LAYOUT_PASSES = 10;
  const SWIPE_THRESHOLD_PX = 60;
  const SWIPE_DIRECTION_RATIO = 1.5;

  // ── Shared helpers (utils.js if available, else local) ──
  const loadEvents = (window.appUtils && window.appUtils.loadEvents) ? window.appUtils.loadEvents : function () {
    try { return JSON.parse(localStorage.getItem('events') || '[]') || []; } catch (_) { return []; }
  };
  // Dynamic lookup so that expandEvents is available even if utils.js loads after this script
  function expandEvents(startISO, endISO) {
    if (window.appUtils && typeof window.appUtils.expandEvents === 'function') {
      return window.appUtils.expandEvents(startISO, endISO);
    }
    return null;
  }
  const openEditModal = (window.appUtils && window.appUtils.openEditModalFill) ? window.appUtils.openEditModalFill : null;

  // ── Date the daily-view is currently showing ──
  var currentViewDate = todayISO();

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function addDays(isoDate, n) {
    var d = new Date(isoDate + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function formatDateLong(isoDate) {
    var d = new Date(isoDate + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  // ── Reminders / tasks loaders ──
  function normalizeReminders(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(function(x) { return x && typeof x === 'object' && x.date; });
    if (typeof v === 'object') {
      var out = [];
      Object.keys(v).forEach(function(dateKey) {
        var arr = Array.isArray(v[dateKey]) ? v[dateKey] : [];
        arr.forEach(function(r) {
          if (!r || typeof r !== 'object') return;
          out.push(Object.assign({}, r, { date: dateKey }));
        });
      });
      return out;
    }
    return [];
  }
  function loadReminders() {
    try {
      return normalizeReminders(JSON.parse(localStorage.getItem('reminders') || '{}') || {});
    } catch (_) { return []; }
  }
  function loadTasksLS() {
    try { return JSON.parse(localStorage.getItem('tasks') || '[]') || []; } catch (_) { return []; }
  }
  function loadTaskCategories() {
    try {
      var arr = JSON.parse(localStorage.getItem('taskCategories') || '[]') || [];
      var map = {}; arr.forEach(function(c) { if (c && c.id) map[c.id] = c; }); return map;
    } catch (_) { return {}; }
  }

  // ── Time helpers ──
  function toMinutes(t, fallback) {
    if (fallback === undefined) fallback = null;
    if (!t) return fallback;
    var s = String(t).trim().toLowerCase();
    var m = s.match(/(\d{1,2})(?::(\d{1,2}))?/);
    if (!m) return fallback;
    var hh = parseInt(m[1] || '0', 10);
    var mm = parseInt(m[2] || '0', 10);
    if (isNaN(hh) || isNaN(mm)) return fallback;
    if (/\bpm\b/.test(s) && hh < 12) hh += 12;
    if (/\bam\b/.test(s) && hh === 12) hh = 0;
    return ((hh * 60 + mm) % 1440 + 1440) % 1440;
  }

  function formatTime(minutes) {
    var h = Math.floor((minutes % 1440) / 60);
    var m = minutes % 60;
    return pad2(h) + ':' + pad2(m);
  }

  function formatHourLabel(h) {
    return pad2(h) + ':00';
  }

  // ── Which hours to show per part-of-day filter ──
  function hoursForPart(part) {
    if (part === 'morning') return rangeArr(1, 9);
    if (part === 'day') return rangeArr(9, 17);
    if (part === 'night') return rangeArr(17, 25);   // 17..24 (00 next day shown as 24)
    // 'all'
    return rangeArr(0, 24);
  }
  function rangeArr(start, endExclusive) {
    var arr = [];
    for (var i = start; i < endExclusive; i++) arr.push(i % 24);
    return arr;
  }

  // ── lighten a hex color for event backgrounds ──
  function lightenBg(hex, alpha) {
    if (alpha === undefined) alpha = 0.18;
    if (!hex || hex[0] !== '#') return 'rgba(74,144,226,' + alpha + ')';
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var b = parseInt(hex.substr(5, 2), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  // ── Build unified items list for a date ──
  function getDayItems(dateStr) {
    var items = [];
    var cats = loadTaskCategories();

    // events
    var evs = expandEvents(dateStr, dateStr) ?? loadEvents().filter(function(e) { return e && e.date === dateStr; });
    evs.forEach(function(e) {
      var s = toMinutes(e.startTime, null);
      var eMin = toMinutes(e.endTime, null);
      var hasTimes = s !== null;
      if (s === null) s = 9 * 60; // default 9am if no time
      if (eMin === null) eMin = s + 60;
      if (eMin <= s) eMin += 1440;
      items.push({
        kind: 'event',
        title: e.title || 'Event',
        emoji: (e.emoji || '').trim(),
        startMin: s,
        endMin: eMin,
        hasTimes: hasTimes,
        color: PRIMARY_COLOR,
        raw: e
      });
    });

    // reminders
    var rems = loadReminders().filter(function(r) { return r && r.date === dateStr; });
    rems.forEach(function(r) {
      var s = toMinutes(r.time || r.reminderTime, 9 * 60);
      items.push({
        kind: 'reminder',
        title: r.text || r.title || 'Reminder',
        emoji: (r.emoji || '').trim(),
        startMin: s,
        endMin: s + REMINDER_DEFAULT_DURATION,
        hasTimes: !!(r.time || r.reminderTime),
        color: REMINDER_COLOR,
        raw: r
      });
    });

    // tasks with times
    var tasks = loadTasksLS().filter(function(t) { return t && t.date === dateStr; });
    tasks.forEach(function(t) {
      var sRaw = toMinutes(t.time, null);
      if (sRaw === null) return;
      var color = (t.category && cats[t.category] && cats[t.category].color) ? cats[t.category].color : TASK_DEFAULT_COLOR;
      items.push({
        kind: 'task',
        title: t.title || 'Task',
        emoji: (t.emoji || '').trim(),
        startMin: sRaw,
        endMin: sRaw + TASK_DEFAULT_DURATION,
        hasTimes: true,
        color: color,
        raw: t
      });
    });

    return items;
  }

  // ── Layout: place overlapping events side-by-side (column packing) ──
  function layoutColumns(items) {
    // sort by start then longer first
    items.sort(function(a, b) {
      if (a.startMin !== b.startMin) return a.startMin - b.startMin;
      return (b.endMin - b.startMin) - (a.endMin - a.startMin);
    });
    var columns = []; // each column: array of items
    items.forEach(function(item) {
      var placed = false;
      for (var c = 0; c < columns.length; c++) {
        var col = columns[c];
        var last = col[col.length - 1];
        if (last.endMin <= item.startMin) {
          col.push(item);
          item._col = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        item._col = columns.length;
        columns.push([item]);
      }
    });
    // determine total columns for each overlapping group
    // use a sweep approach
    items.forEach(function(item) {
      var maxCol = item._col;
      items.forEach(function(other) {
        if (other.startMin < item.endMin && other.endMin > item.startMin) {
          if (other._col > maxCol) maxCol = other._col;
        }
      });
      item._totalCols = maxCol + 1;
    });
    // second pass: ensure all overlapping events share the same _totalCols
    var changed = true;
    var passes = 0;
    while (changed && passes < MAX_LAYOUT_PASSES) {
      changed = false;
      passes++;
      items.forEach(function(item) {
        items.forEach(function(other) {
          if (other.startMin < item.endMin && other.endMin > item.startMin) {
            var m = Math.max(item._totalCols, other._totalCols);
            if (item._totalCols !== m) { item._totalCols = m; changed = true; }
            if (other._totalCols !== m) { other._totalCols = m; changed = true; }
          }
        });
      });
    }
    return items;
  }

  // ── Render the full daily view ──
  function renderDailyView(dateStr) {
    try {
      var dailyView = getDailyView();
      if (!dailyView) return;
      dailyView.innerHTML = '';

      var part = 'all';
      var hours = hoursForPart(part);
      var items = getDayItems(dateStr);

      // Determine the minute range shown
      var firstHour = hours[0];
      var lastHour = hours[hours.length - 1];
      // Handle overnight (night part: 17..0)
      var rangeStartMin, rangeEndMin;
      if (part === 'night') {
        rangeStartMin = 17 * 60;
        rangeEndMin = 25 * 60; // 01:00 next day
      } else if (part === 'all') {
        rangeStartMin = 0;
        rangeEndMin = 24 * 60;
      } else {
        rangeStartMin = firstHour * 60;
        rangeEndMin = (lastHour + 1) * 60;
      }
      var totalMinutes = rangeEndMin - rangeStartMin;

      // Filter items to those visible in the range
      var visibleItems = items.filter(function(item) {
        var s = item.startMin;
        var e = item.endMin;
        // for overnight events
        if (e <= s) e += 1440;
        // Check overlap with visible range
        return s < rangeEndMin && e > rangeStartMin;
      });

      // Build grid container
      var grid = document.createElement('div');
      grid.className = 'dv-grid';

      // Gutter (time labels)
      var gutter = document.createElement('div');
      gutter.className = 'dv-gutter';

      // Body (hour slots + events)
      var body = document.createElement('div');
      body.className = 'dv-body';
      body.style.position = 'relative';
      body.style.height = (hours.length * HOUR_HEIGHT) + 'px';

      // Create hour slots and labels
      hours.forEach(function(h, idx) {
        // gutter label
        var lbl = document.createElement('div');
        lbl.className = 'dv-gutter-label';
        lbl.textContent = formatHourLabel(h);
        gutter.appendChild(lbl);

        // hour slot in body (background row)
        var slot = document.createElement('div');
        slot.className = 'dv-hour-slot';
        body.appendChild(slot);

        // half-hour dashed line
        if (idx < hours.length) {
          var halfLine = document.createElement('div');
          halfLine.className = 'dv-half-line';
          halfLine.style.top = (idx * HOUR_HEIGHT + HOUR_HEIGHT / 2) + 'px';
          body.appendChild(halfLine);
        }
      });

      // Event column overlay
      var eventCol = document.createElement('div');
      eventCol.className = 'dv-event-col';

      // Layout overlapping events side-by-side
      layoutColumns(visibleItems);

      // Render event blocks
      visibleItems.forEach(function(item) {
        var s = Math.max(item.startMin, rangeStartMin);
        var e = Math.min(item.endMin > item.startMin ? item.endMin : item.endMin + 1440, rangeEndMin);
        // clamp
        var topPx = ((s - rangeStartMin) / totalMinutes) * (hours.length * HOUR_HEIGHT);
        var heightPx = ((e - s) / totalMinutes) * (hours.length * HOUR_HEIGHT);
        heightPx = Math.max(heightPx, 20); // minimum height

        var colWidth = 100 / (item._totalCols || 1);
        var leftPct = (item._col || 0) * colWidth;

        var block = document.createElement('button');
        block.type = 'button';
        block.className = 'dv-event-block';
        block.style.top = topPx + 'px';
        block.style.height = heightPx + 'px';
        block.style.left = leftPct + '%';
        block.style.width = (colWidth - 1) + '%';
        block.style.right = 'auto';
        block.style.background = lightenBg(item.color || PRIMARY_COLOR, 0.18);
        block.style.borderLeftColor = item.color || PRIMARY_COLOR;
        block.title = item.title || '';

        // Content
        var emojiStr = item.emoji ? item.emoji : (item.kind === 'event' ? '' : item.kind === 'reminder' ? '🔔' : '✅');
        var timeStr = '';
        if (item.hasTimes) {
          timeStr = formatTime(item.startMin);
          if (item.endMin > item.startMin && item.kind === 'event') {
            timeStr += ' – ' + formatTime(item.endMin % 1440);
          }
        }

        var html = '';
        if (emojiStr) html += '<span class="dv-ev-emoji">' + emojiStr + '</span>';
        html += '<span class="dv-ev-title">' + escapeHTML(item.title) + '</span>';
        if (timeStr) html += '<br><span class="dv-ev-time">' + escapeHTML(timeStr) + '</span>';
        block.innerHTML = html;

        // Click to edit
        block.addEventListener('click', function(ev) {
          ev.stopPropagation();
          if (item.kind === 'event') {
            if (openEditModal) openEditModal(item.raw); else console.log('Edit event:', item.raw);
          } else {
            var modal = document.getElementById('editModal');
            if (!modal) return;
            var setIf = function(id, value) { var el = document.getElementById(id); if (el) el.value = value || ''; };
            setIf('editKind', item.kind);
            setIf('editText', item.title || '');
            var hh = pad2(Math.floor(item.startMin % 1440 / 60));
            var mm = pad2(Math.floor(item.startMin % 60));
            setIf('editDate', currentViewDate);
            setIf('editTime', hh + ':' + mm);
            modal.classList.remove('hidden');
          }
        });

        eventCol.appendChild(block);
      });

      body.appendChild(eventCol);

      // Current time indicator (only if viewing today)
      if (dateStr === todayISO()) {
        var now = new Date();
        var nowMin = now.getHours() * 60 + now.getMinutes();
        if (nowMin >= rangeStartMin && nowMin < rangeEndMin) {
          var nowPx = ((nowMin - rangeStartMin) / totalMinutes) * (hours.length * HOUR_HEIGHT);
          var nowLine = document.createElement('div');
          nowLine.className = 'dv-now-line';
          nowLine.style.top = nowPx + 'px';
          var nowDot = document.createElement('div');
          nowDot.className = 'dv-now-dot';
          nowLine.appendChild(nowDot);
          body.appendChild(nowLine);
        }
      }

      grid.appendChild(gutter);
      grid.appendChild(body);
      dailyView.appendChild(grid);

      // Empty state
      if (visibleItems.length === 0) {
        var empty = document.createElement('div');
        empty.style.padding = '16px';
        empty.style.color = '#888';
        empty.style.textAlign = 'center';
        empty.style.fontSize = '0.9rem';
        empty.textContent = 'No scheduled items for this time period.';
        dailyView.appendChild(empty);
      }

      // Update info text
      var info = document.getElementById('dailyViewInfo');
      if (info) {
        info.textContent = visibleItems.length + ' item' + (visibleItems.length !== 1 ? 's' : '');
      }

      // Auto-scroll: if viewing today, scroll to current time; otherwise scroll to first event or 8 AM
      (function() {
        var scrollTarget = 8 * HOUR_HEIGHT; // default: 8 AM
        if (dateStr === todayISO()) {
          var now2 = new Date();
          var nowMin2 = now2.getHours() * 60 + now2.getMinutes();
          scrollTarget = ((nowMin2 - rangeStartMin) / totalMinutes) * (hours.length * HOUR_HEIGHT);
        } else if (visibleItems.length > 0) {
          var earliest = visibleItems.reduce(function(min, item) {
            return item.startMin < min ? item.startMin : min;
          }, Infinity);
          scrollTarget = ((earliest - rangeStartMin) / totalMinutes) * (hours.length * HOUR_HEIGHT);
        }
        // Center the target in the visible area
        var containerHeight = dailyView.clientHeight || 480;
        dailyView.scrollTop = Math.max(0, scrollTarget - containerHeight / 3);
      })();
    } catch (err) {
      console.error('daily-view render error', err);
    }
  }

  function escapeHTML(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Day navigation ──
  function updateDateDisplay() {
    var titleEl = document.getElementById('selectedDateLong');
    if (titleEl) {
      titleEl.textContent = formatDateLong(currentViewDate);
      titleEl.dataset.date = currentViewDate;
      titleEl.style.display = 'block';
    }
    // Sync calendar selection if on calendar view
    syncCalendarSelection(currentViewDate);
  }

  function syncCalendarSelection(dateStr) {
    // Update the calendar's selected day if the calendar element exists
    var parts = dateStr.split('-');
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var day = parseInt(parts[2], 10);

    // Update the global selectedYear/Month/Day
    if (typeof selectedYear !== 'undefined') window.selectedYear = year;
    if (typeof selectedMonth !== 'undefined') window.selectedMonth = month;
    if (typeof selectedDay !== 'undefined') window.selectedDay = day;

    // Regenerate calendar to highlight selected day, then show reminders/day bars
    if (typeof generateCalendar === 'function') {
      try { generateCalendar(); } catch(e) { /* ignore */ }
    }
    if (typeof showReminders === 'function') {
      try { showReminders(day); } catch(e) { /* ignore */ }
    }
  }

  function navigateDay(offset) {
    currentViewDate = addDays(currentViewDate, offset);
    updateDateDisplay();
    renderDailyView(currentViewDate);
  }

  function goToToday() {
    currentViewDate = todayISO();
    updateDateDisplay();
    renderDailyView(currentViewDate);
  }

  function getSelectedDate() {
    return currentViewDate;
  }
  // Expose for other scripts
  window.dailyViewGetDate = getSelectedDate;
  window.dailyViewSetDate = function(isoDate) {
    if (isoDate && typeof isoDate === 'string') {
      currentViewDate = isoDate;
      renderDailyView(currentViewDate);
    }
  };
  window.dailyViewRefresh = function() {
    renderDailyView(currentViewDate);
  };

  function refreshForSelectedDate() {
    updateDateDisplay();
    renderDailyView(currentViewDate);
  }

  // ── Wire up day nav buttons ──
  function wireNavButtons() {
    var prevBtn = document.getElementById('dayNavPrev');
    var nextBtn = document.getElementById('dayNavNext');
    var todayBtn = document.getElementById('dayNavToday');

    if (prevBtn) prevBtn.addEventListener('click', function() { navigateDay(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function() { navigateDay(1); });
    if (todayBtn) todayBtn.addEventListener('click', function() { goToToday(); });
  }

  // ── (Day part selector removed – full 24h scrollable view) ──

  // ── Listen for data changes ──
  window.addEventListener('app:data:updated', refreshForSelectedDate);
  window.addEventListener('storage', function(e) {
    if (!e || !e.key || ['reminders', 'tasks', 'events', 'taskCategories'].includes(e.key)) refreshForSelectedDate();
  });

  // Re-render when navigating to the Today view
  window.addEventListener('view:show', function(e) {
    var v = (e && e.detail && e.detail.view) || '';
    if (v === 'today') refreshForSelectedDate();
  });

  // Calendar day click → update daily view date
  var calEl = getCalendarEl();
  if (calEl) {
    calEl.addEventListener('click', function(ev) {
      var dayEl = ev.target.closest('.day');
      if (!dayEl) return;

      // toggle .selected among siblings
      var prev = calEl.querySelector('.day.selected');
      if (prev) prev.classList.remove('selected');
      dayEl.classList.add('selected');

      // Build date from day element
      if (dayEl.dataset.date) {
        currentViewDate = dayEl.dataset.date;
      } else {
        var label = dayEl.querySelector('.day-number');
        if (label && label.textContent) {
          var monthLabel = document.getElementById('monthLabel');
          var monthText = monthLabel ? monthLabel.textContent : '';
          try {
            var dayNum = parseInt(label.textContent.trim(), 10);
            if (!isNaN(dayNum)) {
              var dt = new Date(monthText + ' ' + dayNum);
              if (!isNaN(dt)) {
                currentViewDate = dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
                dayEl.dataset.date = currentViewDate;
              }
            }
          } catch (e) { /* ignore */ }
        }
      }
      refreshForSelectedDate();
    });
  }

  // ── Keyboard navigation ──
  document.addEventListener('keydown', function(e) {
    // Only when today page is visible
    var todayPage = document.getElementById('page-today');
    if (!todayPage || todayPage.classList.contains('hidden')) return;
    // Don't interfere with inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    if (e.key === 'ArrowLeft') { navigateDay(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { navigateDay(1); e.preventDefault(); }
  });

  // ── Swipe gesture for mobile ──
  (function() {
    var touchStartX = 0;
    var touchStartY = 0;
    var swiping = false;

    var dv = getDailyView();
    if (!dv) return;

    dv.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        swiping = true;
      }
    }, { passive: true });

    dv.addEventListener('touchend', function(e) {
      if (!swiping) return;
      swiping = false;
      var touch = e.changedTouches[0];
      var dx = touch.clientX - touchStartX;
      var dy = touch.clientY - touchStartY;
      // Require horizontal swipe (at least 60px, and more horizontal than vertical)
      if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * SWIPE_DIRECTION_RATIO) {
        if (dx > 0) navigateDay(-1); // swipe right → previous day
        else navigateDay(1);          // swipe left → next day
      }
    }, { passive: true });
  })();

  // ── Initialize ──
  document.addEventListener('DOMContentLoaded', function() {
    wireNavButtons();
    refreshForSelectedDate();
  });

  // Also try immediately (in case DOMContentLoaded already fired)
  setTimeout(function() {
    wireNavButtons();
    refreshForSelectedDate();
  }, 200);
})();
