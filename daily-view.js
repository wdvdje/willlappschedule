(function () {
  /* ────────────────────────────────────────────
     Daily-view.js – vertical calendar-style timeline
     Shows events spanning across hours, with day navigation.
     ──────────────────────────────────────────── */

  // DOM accessors (lazy – elements may not exist at eval time)
  function getDailyView() { return document.getElementById('dailyView'); }
  function getCalendarEl() { return document.getElementById('calendar'); }

  // Fallback colors (used only when domain colors from settings are unavailable)
  const FALLBACK_COLORS = { work: '#4a90e2', home: '#27ae60', personal: '#9b59b6', holiday: '#e74c3c' };
  var DOMAIN_COLORS_STORAGE_KEY = 'domainColors';

  // Retrieve user-configured domain colors, falling back to defaults
  function getDomainColorsLocal() {
    if (typeof getDomainColors === 'function') return getDomainColors();
    try {
      var stored = JSON.parse(localStorage.getItem(DOMAIN_COLORS_STORAGE_KEY) || '{}');
      return Object.assign({}, FALLBACK_COLORS, stored);
    } catch (_) { return Object.assign({}, FALLBACK_COLORS); }
  }

  // Determine the domain of an event, using the global helper when available
  function getDomainLocal(item) {
    if (typeof getDomainOfItem === 'function') return getDomainOfItem(item);
    if (item && item.domain) return item.domain;
    return 'personal';
  }

  // Resolve a display color for an item: domain color > category color > fallback
  function resolveItemColor(item, domainColors, cats) {
    var domain = getDomainLocal(item);
    if (domainColors[domain]) return domainColors[domain];
    if (item.category && cats && cats[item.category] && cats[item.category].color) return cats[item.category].color;
    return domainColors.personal || FALLBACK_COLORS.personal;
  }
  const HOUR_HEIGHT = 60; // px per hour slot
  const REMINDER_DEFAULT_DURATION = 15; // minutes
  const TASK_DEFAULT_DURATION = 30; // minutes
  const ROUTINE_DEFAULT_DURATION = 15; // minutes
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

  var dvCompact = false;
  var _nowLineTimer = null;

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

  // ── Routine phases loader (compatible with old & new format) ──
  // When dateStr is provided, adjusts morning/evening start times based on bedtime manager schedule.
  function loadRoutinePhases(dateStr) {
    try {
      var r = JSON.parse(localStorage.getItem('personalRoutines') || '{}') || {};
      var phases;
      // New format: { phases: [...] }
      if (r.phases && Array.isArray(r.phases) && r.phases.length > 0) {
        phases = r.phases.map(function(p) { return JSON.parse(JSON.stringify(p)); }); // deep copy
      } else {
        // Old format: { morning: [...], evening: [...] } – convert to phases
        phases = [];
        ['morning', 'evening'].forEach(function (period) {
          var steps = r[period] || [];
          if (steps.length > 0) {
            phases.push({
              id: period,
              name: period === 'morning' ? 'Morning' : 'Evening',
              emoji: period === 'morning' ? '🌅' : '🌙',
              startTime: period === 'morning' ? '06:30' : '21:00',
              steps: steps
            });
          }
        });
      }

      /* Apply per-day overrides from bedtime manager if available */
      if (dateStr && r.sleepScheduleTimes) {
        var d = new Date(dateStr + 'T12:00:00');
        var dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
        var dayTimes = r.sleepScheduleTimes[dayName];
        if (dayTimes) {
          phases.forEach(function(phase) {
            if (phase.id === 'morning' && dayTimes.morningStart) {
              phase.startTime = dayTimes.morningStart;
              /* Use stored morningEnd; fall back to computing from step durations */
              if (dayTimes.morningEnd) {
                phase.endTime = dayTimes.morningEnd;
              } else {
                /* 10 min per step matches the DEFAULT_STEP_DURATION used in syncRoutineTimesFromSleep */
                var DEFAULT_STEP_DUR = 10;
                var totalDur = (phase.steps || []).reduce(function(sum, step) {
                  return sum + (parseInt(step.duration, 10) || DEFAULT_STEP_DUR);
                }, 0);
                if (totalDur > 0) {
                  var startM = toMinutes(dayTimes.morningStart, null);
                  if (startM !== null) {
                    phase.endTime = formatTime((startM + totalDur) % 1440);
                  }
                }
              }
            }
            if (phase.id === 'evening' && dayTimes.eveningStart) {
              phase.startTime = dayTimes.eveningStart;
              if (dayTimes.eveningEnd) phase.endTime = dayTimes.eveningEnd;
            }
          });
        }
      }

      return phases;
    } catch (_) { return []; }
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
    var domainColors = getDomainColorsLocal();

    // events – use domain-aware color from settings
    var evs = expandEvents(dateStr, dateStr) ?? loadEvents().filter(function(e) { return e && e.date === dateStr; });
    evs.forEach(function(e) {
      var s = toMinutes(e.startTime, null);
      var eMin = toMinutes(e.endTime, null);
      var hasTimes = s !== null;
      if (s === null) s = 9 * 60; // default 9am if no time
      if (eMin === null) eMin = s + 60;
      if (eMin <= s) eMin += 1440;
      var domain = getDomainLocal(e);
      items.push({
        kind: 'event',
        title: e.title || 'Event',
        emoji: (e.emoji || '').trim(),
        startMin: s,
        endMin: eMin,
        hasTimes: hasTimes,
        color: domainColors[domain] || domainColors.personal,
        raw: e,
        preBuffer: parseInt(e.preBuffer, 10) || 0,
        postBuffer: parseInt(e.postBuffer, 10) || 0
      });
    });

    // reminders – use personal domain color
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
        color: domainColors[getDomainLocal(r)] || domainColors.personal,
        raw: r
      });
    });

    // tasks with times – use domain color, falling back to category color
    var tasks = loadTasksLS().filter(function(t) { return t && t.date === dateStr; });
    tasks.forEach(function(t) {
      var sRaw = toMinutes(t.time, null);
      if (sRaw === null) return;
      items.push({
        kind: 'task',
        title: t.title || 'Task',
        emoji: (t.emoji || '').trim(),
        startMin: sRaw,
        endMin: sRaw + TASK_DEFAULT_DURATION,
        hasTimes: true,
        color: resolveItemColor(t, domainColors, cats),
        raw: t
      });
    });

    // daily routine phases (shown every day) – use personal domain color
    var phases = loadRoutinePhases(dateStr);
    phases.forEach(function(phase) {
      var s = toMinutes(phase.startTime, null);
      if (s === null) return;
      var eMin = phase.endTime ? toMinutes(phase.endTime, null) : null;
      if (eMin === null) eMin = s + ROUTINE_DEFAULT_DURATION;
      if (eMin <= s) eMin += 1440;
      items.push({
        kind: 'routine',
        title: (phase.name || 'Routine'),
        emoji: (phase.emoji || '📋').trim(),
        startMin: s,
        endMin: eMin,
        hasTimes: true,
        color: domainColors.personal,
        raw: phase
      });
    });

    // meals with scheduled times – show as reminders on the daily view
    var MEAL_LABELS = { breakfast: 'Eat Breakfast', lunch: 'Eat Lunch', dinner: 'Eat Dinner', snacks: 'Eat Snack' };
    var MEAL_EMOJIS = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snacks: '🍎' };
    try {
      var allMeals = JSON.parse(localStorage.getItem('personalMeals') || '{}') || {};
      var dayMeals = allMeals[dateStr];
      if (dayMeals) {
        ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(function(mk) {
          var meal = dayMeals[mk];
          if (!meal || !meal.name || !meal.time) return;
          var s = toMinutes(meal.time, null);
          if (s === null) return;
          items.push({
            kind: 'meal',
            title: (MEAL_LABELS[mk] || 'Eat') + ': ' + meal.name,
            emoji: MEAL_EMOJIS[mk] || '🍽️',
            startMin: s,
            endMin: s + REMINDER_DEFAULT_DURATION,
            hasTimes: true,
            color: domainColors.personal,
            raw: { mealKey: mk, meal: meal }
          });
        });
      }
    } catch (_) {}

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

      // Clear previous now-line timer
      if (_nowLineTimer) { clearInterval(_nowLineTimer); _nowLineTimer = null; }

      var part = 'all';
      var hours = hoursForPart(part);
      var items = getDayItems(dateStr);

      // Compact mode: trim hours to events range (±1 hour padding)
      if (dvCompact && items.length > 0) {
        var minStart = items.reduce(function(m, i) { return Math.min(m, i.startMin); }, Infinity);
        var maxEnd   = items.reduce(function(m, i) { return Math.max(m, i.endMin); }, -Infinity);
        var hStart = Math.max(0, Math.floor(minStart / 60) - 1);
        var hEnd   = Math.min(23, Math.ceil(maxEnd / 60));
        hours = rangeArr(hStart, hEnd + 1);
      }

      // Determine the minute range shown
      var firstHour = hours[0];
      var lastHour = hours[hours.length - 1];
      // Handle overnight (night part: 17..0)
      var rangeStartMin, rangeEndMin;
      if (part === 'night') {
        rangeStartMin = 17 * 60;
        rangeEndMin = 25 * 60; // 01:00 next day
      } else if (part === 'all' && !dvCompact) {
        rangeStartMin = 0;
        rangeEndMin = 24 * 60;
      } else {
        rangeStartMin = firstHour * 60;
        rangeEndMin = (lastHour + 1) * 60;
      }
      var totalMinutes = rangeEndMin - rangeStartMin;

      // Update day summary chips row
      var chipRow = document.getElementById('dvDaySummaryRow');
      if (chipRow) {
        var counts = {};
        items.forEach(function(item) { counts[item.kind] = (counts[item.kind] || 0) + 1; });
        var chipDefs = [
          { kind: 'event',    emoji: '📅', label: 'event' },
          { kind: 'task',     emoji: '✅', label: 'task' },
          { kind: 'reminder', emoji: '🔔', label: 'reminder' },
          { kind: 'routine',  emoji: '🌅', label: 'routine' },
          { kind: 'meal',     emoji: '🍽️', label: 'meal' }
        ];
        var chipsHtml = chipDefs.filter(function(c) { return counts[c.kind]; }).map(function(c) {
          var n = counts[c.kind];
          return '<span class="dv-summary-chip">' + c.emoji + ' ' + n + ' ' + c.label + (n !== 1 ? 's' : '') + '</span>';
        }).join('');
        chipRow.innerHTML = chipsHtml;
        chipRow.style.display = chipsHtml ? '' : 'none';
      }

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
        slot.dataset.hour = h;

        // Inline add-event button (desktop only, shown on hover via CSS)
        // h is a forEach callback parameter, so it is already properly closed over.
        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'dv-add-btn';
        addBtn.title = 'Add event at ' + formatHourLabel(h);
        addBtn.textContent = '+';
        addBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          var timeStr    = pad2(h) + ':00';
          var endTimeStr = pad2((h + 1) % 24) + ':00';
          if (window.appUtils && typeof window.appUtils.openEditModalFill === 'function') {
            window.appUtils.openEditModalFill({ date: dateStr, startTime: timeStr, endTime: endTimeStr, time: timeStr });
          }
        });
        slot.appendChild(addBtn);

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
        if (item.raw && item.raw.done && (item.kind === 'task' || item.kind === 'reminder')) {
          block.classList.add('dv-item-done');
        }
        block.style.top = topPx + 'px';
        block.style.height = heightPx + 'px';
        block.style.left = leftPct + '%';
        block.style.width = (colWidth - 1) + '%';
        block.style.right = 'auto';
        block.style.background = lightenBg(item.color || FALLBACK_COLORS.work, 0.18);
        block.style.borderLeftColor = item.color || FALLBACK_COLORS.work;
        block.title = item.title || '';

        // Content
        var emojiStr = item.emoji ? item.emoji : (item.kind === 'event' ? '' : item.kind === 'reminder' ? '🔔' : item.kind === 'routine' ? '📋' : '✅');
        var timeStr = '';
        if (item.hasTimes) {
          timeStr = formatTime(item.startMin);
          if (item.endMin > item.startMin && item.kind === 'event') {
            timeStr += ' – ' + formatTime(item.endMin % 1440);
          }
        }

        var html = '';

        // Add checkbox for tasks and reminders
        if (item.kind === 'task' || item.kind === 'reminder') {
          var isDone = !!(item.raw && item.raw.done);
          html += '<input type="checkbox" class="dv-item-checkbox" ' + (isDone ? 'checked' : '') + '>';
        }

        if (emojiStr) html += '<span class="dv-ev-emoji">' + emojiStr + '</span>';
        var titleClass = 'dv-ev-title';
        if (item.raw && item.raw.done && (item.kind === 'task' || item.kind === 'reminder')) {
          titleClass += ' dv-title-done';
        }
        html += '<span class="' + titleClass + '">' + escapeHTML(item.title) + '</span>';
        if (timeStr) html += '<br><span class="dv-ev-time">' + escapeHTML(timeStr) + '</span>';
        // Show buffer annotations as notes within the event block
        if (item.hasTimes && (item.preBuffer > 0 || item.postBuffer > 0)) {
          var bufParts = [];
          if (item.preBuffer > 0) bufParts.push('🚗 ' + item.preBuffer + 'm before');
          if (item.postBuffer > 0) bufParts.push(item.postBuffer + 'm after');
          html += '<br><span class="dv-ev-buffer-note">' + bufParts.join(' · ') + '</span>';
        }
        block.innerHTML = html;

        // Wire up checkbox for tasks and reminders
        var checkbox = block.querySelector('.dv-item-checkbox');
        if (checkbox) {
          checkbox.addEventListener('click', function(ev) {
            ev.stopPropagation();
          });
          checkbox.addEventListener('change', (function(itm, cb) {
            return function() {
              toggleDailyViewItemDone(itm, cb.checked, dateStr);
            };
          })(item, checkbox));
        }

        // Click to edit
        block.addEventListener('click', function(ev) {
          ev.stopPropagation();
          if (item.kind === 'routine') return; // routines are not editable from daily view
          if (item.kind === 'event') {
            var evId = item.raw && (item.raw._baseId || item.raw.id);
            var evOccDate = item.raw && item.raw.occurrenceDate;
            if (typeof editEvent === 'function') {
              editEvent(evId, evOccDate);
            } else if (openEditModal) {
              openEditModal(item.raw);
            } else {
              console.log('Edit event:', item.raw);
            }
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

        // Render pre-buffer block (travel/prep time before the event)
        if (item.preBuffer > 0 && item.hasTimes) {
          var preEnd = s; // align to the event's visual start
          var preStart = Math.max(preEnd - item.preBuffer, rangeStartMin);
          if (preEnd > preStart) {
            var preTopPx = ((preStart - rangeStartMin) / totalMinutes) * (hours.length * HOUR_HEIGHT);
            var preHeightPx = ((preEnd - preStart) / totalMinutes) * (hours.length * HOUR_HEIGHT);
            if (preHeightPx >= 2) {
              var preBuf = document.createElement('div');
              preBuf.className = 'dv-buffer-block dv-buffer-pre';
              preBuf.style.top = preTopPx + 'px';
              preBuf.style.height = preHeightPx + 'px';
              preBuf.style.left = leftPct + '%';
              preBuf.style.width = (colWidth - 1) + '%';
              preBuf.title = item.preBuffer + ' min travel/prep before ' + escapeHTML(item.title);
              preBuf.innerHTML = '<span class="dv-buffer-label">🚗 ' + item.preBuffer + 'm</span>';
              eventCol.appendChild(preBuf);
            }
          }
        }

        // Render post-buffer block (wind-down/travel time after the event)
        if (item.postBuffer > 0 && item.hasTimes) {
          var postStart = e; // align to the event's visual end
          var postEnd = Math.min(postStart + item.postBuffer, rangeEndMin);
          if (postEnd > postStart) {
            var postTopPx = ((postStart - rangeStartMin) / totalMinutes) * (hours.length * HOUR_HEIGHT);
            var postHeightPx = ((postEnd - postStart) / totalMinutes) * (hours.length * HOUR_HEIGHT);
            if (postHeightPx >= 2) {
              var postBuf = document.createElement('div');
              postBuf.className = 'dv-buffer-block dv-buffer-post';
              postBuf.style.top = postTopPx + 'px';
              postBuf.style.height = postHeightPx + 'px';
              postBuf.style.left = leftPct + '%';
              postBuf.style.width = (colWidth - 1) + '%';
              postBuf.title = item.postBuffer + ' min wind-down after ' + escapeHTML(item.title);
              postBuf.innerHTML = '<span class="dv-buffer-label">' + item.postBuffer + 'm</span>';
              eventCol.appendChild(postBuf);
            }
          }
        }
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
          var nowLabel = document.createElement('span');
          nowLabel.className = 'dv-now-label';
          nowLabel.textContent = formatTime(nowMin);
          nowLine.appendChild(nowLabel);
          body.appendChild(nowLine);

          // Update position and label every minute.
          // Captured variables (rangeStartMin, totalMinutes, nowLine, nowLabel) remain
          // valid for the lifetime of this timer because _nowLineTimer is cleared at the
          // very start of the next renderDailyView call (before any DOM mutation), so
          // this callback can never fire against a stale/detached element.
          _nowLineTimer = setInterval(function() {
            var n = new Date();
            var nMin = n.getHours() * 60 + n.getMinutes();
            if (nMin >= rangeStartMin && nMin < rangeEndMin) {
              var px = ((nMin - rangeStartMin) / totalMinutes) * (hours.length * HOUR_HEIGHT);
              nowLine.style.top = px + 'px';
              nowLabel.textContent = formatTime(nMin);
            }
          }, 60000);
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
          var currentTime = new Date();
          var currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
          scrollTarget = ((currentMinutes - rangeStartMin) / totalMinutes) * (hours.length * HOUR_HEIGHT);
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

  // ── Toggle done state for tasks/reminders from daily-view ──
  function toggleDailyViewItemDone(item, done, dateStr) {
    if (item.kind === 'task') {
      // Update task in localStorage
      try {
        var tasks = JSON.parse(localStorage.getItem('tasks') || '[]') || [];
        for (var i = 0; i < tasks.length; i++) {
          if (tasks[i] && tasks[i].id && item.raw && tasks[i].id === item.raw.id) {
            tasks[i].done = !!done;
            break;
          }
        }
        localStorage.setItem('tasks', JSON.stringify(tasks));
      } catch (_) {}
    } else if (item.kind === 'reminder') {
      // Update reminder in localStorage
      try {
        var raw = JSON.parse(localStorage.getItem('reminders') || '{}');
        // Reminders can be stored as map { date: [...] } or array
        if (Array.isArray(raw)) {
          for (var j = 0; j < raw.length; j++) {
            if (raw[j] && raw[j].date === dateStr &&
                (raw[j].text || '') === (item.raw.text || '') &&
                (raw[j].time || '') === (item.raw.time || '')) {
              raw[j].done = !!done;
              break;
            }
          }
        } else if (raw && typeof raw === 'object') {
          var arr = raw[dateStr] || [];
          for (var k = 0; k < arr.length; k++) {
            if (arr[k] &&
                (arr[k].text || '') === (item.raw.text || '') &&
                (arr[k].time || '') === (item.raw.time || '')) {
              arr[k].done = !!done;
              break;
            }
          }
          raw[dateStr] = arr;
        }
        localStorage.setItem('reminders', JSON.stringify(raw));
      } catch (_) {}
    }
    // Re-render the daily view to reflect the change
    renderDailyView(dateStr);
    // Update the completion ring
    if (typeof updateCompletionRing === 'function') updateCompletionRing();
    // Re-render the task list if it exists
    if (typeof loadTasks === 'function') {
      try { loadTasks(); } catch (_) {}
    }
    // Re-render reminders sidebar if applicable
    if (typeof showReminders === 'function' && typeof selectedDay !== 'undefined') {
      try { showReminders(selectedDay); } catch (_) {}
    }
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

    // Highlight the selected day in the calendar grid without
    // regenerating the entire calendar or re-rendering reminders.
    // The callers (refreshForSelectedDate, navigateDay, goToToday)
    // already render the daily view; calling generateCalendar and
    // showReminders here caused a redundant cascade that could block
    // the main thread for several seconds on slower devices.
    var calEl = getCalendarEl();
    if (calEl) {
      calEl.querySelectorAll('.day').forEach(function(c) {
        c.classList.toggle('selected', parseInt(c.dataset.day, 10) === day);
      });
    }
  }

  function notifyDateChange() {
    window.dispatchEvent(new CustomEvent('dailyview:datechange', { detail: { date: currentViewDate } }));
  }

  function navigateDay(offset) {
    currentViewDate = addDays(currentViewDate, offset);
    updateDateDisplay();
    // Call showReminders to update reminder bars & trigger daily view render
    if (typeof showReminders === 'function') {
      var day = parseInt(currentViewDate.split('-')[2], 10);
      if (!isNaN(day)) {
        try { showReminders(day); } catch(e) { console.warn('showReminders error', e); renderDailyView(currentViewDate); }
      } else { renderDailyView(currentViewDate); }
    } else { renderDailyView(currentViewDate); }
    notifyDateChange();
  }

  function goToToday() {
    currentViewDate = todayISO();
    updateDateDisplay();
    if (typeof showReminders === 'function') {
      var day = parseInt(currentViewDate.split('-')[2], 10);
      if (!isNaN(day)) {
        try { showReminders(day); } catch(e) { console.warn('showReminders error', e); renderDailyView(currentViewDate); }
      } else { renderDailyView(currentViewDate); }
    } else { renderDailyView(currentViewDate); }
    notifyDateChange();
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
      notifyDateChange();
    }
  };
  window.dailyViewRefresh = function() {
    renderDailyView(currentViewDate);
  };

  function refreshForSelectedDate() {
    updateDateDisplay();
    // Delegate rendering to showReminders (app.js) which updates reminder
    // bars, holiday info, day progress AND triggers renderDailyView via
    // renderDailyViewForDay → dailyViewSetDate.  Only fall back to a
    // direct renderDailyView when showReminders is not yet available.
    if (typeof showReminders === 'function') {
      var day = parseInt(currentViewDate.split('-')[2], 10);
      if (!isNaN(day)) {
        try { showReminders(day); } catch(e) {
          console.warn('showReminders error', e);
          renderDailyView(currentViewDate);
        }
      } else {
        renderDailyView(currentViewDate);
      }
    } else {
      renderDailyView(currentViewDate);
    }
    notifyDateChange();
  }

  // ── Wire up day nav buttons ──
  function wireNavButtons() {
    var prevBtn    = document.getElementById('dayNavPrev');
    var nextBtn    = document.getElementById('dayNavNext');
    var todayBtn   = document.getElementById('dayNavToday');
    var compactBtn = document.getElementById('dvCompactToggle');

    if (prevBtn)  prevBtn.addEventListener('click',  function() { navigateDay(-1); });
    if (nextBtn)  nextBtn.addEventListener('click',  function() { navigateDay(1); });
    if (todayBtn) todayBtn.addEventListener('click', function() { goToToday(); });
    if (compactBtn) {
      compactBtn.addEventListener('click', function() {
        dvCompact = !dvCompact;
        compactBtn.classList.toggle('active', dvCompact);
        renderDailyView(currentViewDate);
      });
    }
  }

  // ── (Day part selector removed – full 24h scrollable view) ──

  // ── Listen for data changes ──
  window.addEventListener('app:data:updated', refreshForSelectedDate);
  window.addEventListener('storage', function(e) {
    if (!e || !e.key || ['reminders', 'tasks', 'events', 'taskCategories', 'personalRoutines'].includes(e.key)) refreshForSelectedDate();
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
  var _dailyViewInitialized = false;
  function initOnce() {
    if (_dailyViewInitialized) return;
    _dailyViewInitialized = true;
    wireNavButtons();
    refreshForSelectedDate();
  }

  document.addEventListener('DOMContentLoaded', initOnce);

  // Fallback in case DOMContentLoaded already fired before this script loaded
  if (document.readyState !== 'loading') {
    setTimeout(initOnce, 200);
  }
})();
