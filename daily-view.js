(function () {
  // ...existing app scripts may run before this file ...
  const dailyView = document.getElementById('dailyView');
  const dayPartSelect = document.getElementById('dayPartSelect');
  const calendarEl = document.getElementById('calendar');
  const PRIMARY_COLOR = '#4a90e2'; // kept in sync with CSS
  const REMINDER_COLOR = '#e67e22';
  const TASK_DEFAULT_COLOR = '#2ecc71';

  // use shared loader if available, fallback to local impl
  const loadEvents = (window.appUtils && window.appUtils.loadEvents) ? window.appUtils.loadEvents : function () {
    try { return JSON.parse(localStorage.getItem('events') || '[]') || []; } catch (_) { return []; }
  };
  const expandEvents = (window.appUtils && window.appUtils.expandEvents) ? window.appUtils.expandEvents : null;
  const openEditModal = (window.appUtils && window.appUtils.openEditModalFill) ? window.appUtils.openEditModalFill : null;

  // local loaders for reminders and tasks
  function loadReminders() {
    try { return JSON.parse(localStorage.getItem('reminders') || '[]') || []; } catch (_) { return []; }
  }
  function loadTasksLS() {
    try { return JSON.parse(localStorage.getItem('tasks') || '[]') || []; } catch (_) { return []; }
  }
  function loadTaskCategories() {
    try {
      const arr = JSON.parse(localStorage.getItem('taskCategories') || '[]') || [];
      const map = {}; arr.forEach(c => { if (c && c.id) map[c.id] = c; });
      return map;
    } catch (_) { return {}; }
  }

  function formatHourLabel(h) {
    const hh = String(h).padStart(2, '0');
    return `${hh}:00`;
  }

  // inclusive hours helper: returns array of hours (0..23) between start and end inclusive.
  function hoursForPart(part) {
    if (part === 'morning') return hoursInclusive(1, 9);   // 01..09
    if (part === 'day') return hoursInclusive(9, 17);      // 09..17
    if (part === 'night') return hoursInclusiveOvernight(17, 1); // 17..23 and 00..01
    return hoursInclusive(0, 23);
  }

  function hoursInclusive(start, end) {
    const arr = [];
    let h = start;
    while (true) {
      arr.push(((h % 24) + 24) % 24);
      if (h === end) break;
      h = (h + 1) % 24;
    }
    return arr;
  }

  function hoursInclusiveOvernight(start, end) { // start > end e.g. 17..1
    return hoursInclusive(start, end);
  }

  function normalizeHourForCompare(h) {
    // returns 0..23 number
    return ((h % 24) + 24) % 24;
  }

  function getSelectedDate() {
    // prefer a selected '.day' element with data-date
    const sel = document.querySelector('#calendar .day.selected');
    if (sel && sel.dataset && sel.dataset.date) return sel.dataset.date;
    // fallback to hidden selectedDateLong value (if app sets it)
    const selLong = document.getElementById('selectedDateLong');
    if (selLong && selLong.dataset && selLong.dataset.date) return selLong.dataset.date;
    // otherwise return today
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function parseHourFromTime(t) {
    if (!t) return null;
    const parts = String(t).split(':');
    const h = parseInt(parts[0], 10);
    return isNaN(h) ? null : normalizeHourForCompare(h);
  }

  function parseEndHourFromTime(t, fallbackStart) {
    if (!t) return (typeof fallbackStart === 'number') ? fallbackStart + 1 : null;
    const parts = String(t).split(':');
    const h = parseInt(parts[0], 10);
    return isNaN(h) ? null : normalizeHourForCompare(h);
  }

  // returns true if event span [start,end) overlaps displayed hour (hour)
  function eventOverlapsHour(evStart, evEnd, hour) {
    // normalize into numeric ranges possibly >24 to handle overnight spans
    let s = evStart;
    let e = evEnd;
    if (s === null) return false;
    if (e === null) e = s + 1;
    if (e <= s) e += 24; // overnight span
    // test hour candidates hour and hour+24
    const candidates = [hour, hour + 24];
    return candidates.some(hc => hc >= s && hc < e);
  }

  // helper: parse "HH:MM" into minutes since 00:00 (0..1439)
  function toMinutes(t, fallback = null) {
    if (!t || typeof t !== 'string' || t.indexOf(':') < 0) return fallback;
    const [hh, mm] = t.split(':').map(n => parseInt(n || '0', 10));
    if (isNaN(hh) || isNaN(mm)) return fallback;
    return ((hh * 60 + mm) % (24 * 60) + 24 * 60) % (24 * 60);
  }

  // lighten a hex color for background RGBA
  function lightenBg(hex, alpha = 0.18) {
    if (!hex || hex[0] !== '#') return `rgba(74,144,226,${alpha})`;
    const r = parseInt(hex.substr(1,2),16);
    const g = parseInt(hex.substr(3,2),16);
    const b = parseInt(hex.substr(5,2),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Build unified day items with time bounds in minutes (0..1440 or end may exceed start for overnight)
  function getDayItems(dateStr) {
    const items = [];
    const cats = loadTaskCategories();

    // events (expanded to exact date)
    const evs = expandEvents ? expandEvents(dateStr, dateStr) : loadEvents().filter(e => e && e.date === dateStr);
    evs.forEach(e => {
      const s = toMinutes(e.startTime, 9 * 60);
      let eMin = toMinutes(e.endTime, null);
      if (eMin === null) eMin = s + 60; // default 60m
      if (eMin <= s) eMin += 24 * 60;   // overnight
      items.push({
        kind: 'event',
        title: e.title || 'Event',
        emoji: (e.emoji || '').trim(),
        startMin: s,
        endMin: eMin,
        color: PRIMARY_COLOR,
        raw: e
      });
    });

    // reminders (only those on this date)
    const rems = loadReminders().filter(r => r && r.date === dateStr);
    rems.forEach(r => {
      const s = toMinutes(r.time || r.reminderTime, 9 * 60);
      let eMin = s + 5; // default 5m
      items.push({
        kind: 'reminder',
        title: r.text || r.title || 'Reminder',
        emoji: (r.emoji || '').trim(),
        startMin: s,
        endMin: eMin,
        color: REMINDER_COLOR,
        raw: r
      });
    });

    // tasks (only those on this date and with time)
    const tasks = loadTasksLS().filter(t => t && t.date === dateStr);
    tasks.forEach(t => {
      const sRaw = toMinutes(t.time, null);
      if (sRaw === null) return; // only place tasks with time
      const s = sRaw;
      const dur = 30; // default 30m
      const color = (t.category && cats[t.category] && cats[t.category].color) ? cats[t.category].color : TASK_DEFAULT_COLOR;
      items.push({
        kind: 'task',
        title: t.title || 'Task',
        emoji: (t.emoji || '').trim(),
        startMin: s,
        endMin: s + dur,
        color,
        raw: t
      });
    });

    return items;
  }

  function clearDailyView() {
    dailyView.innerHTML = '';
  }

  function renderDailyView(dateStr) {
    if (!dailyView) return;
    clearDailyView();

    const part = (dayPartSelect && dayPartSelect.value) || 'day';
    const hours = hoursForPart(part);
    // build unified items for this date
    const items = getDayItems(dateStr);

    const rows = {}; // map hour->row element
    hours.forEach(h => {
      const row = document.createElement('div');
      row.className = 'hour-row';
      row.dataset.hour = String(h);
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.borderBottom = '1px solid #f0f0f0';
      row.style.padding = '8px 6px';

      const label = document.createElement('div');
      label.style.width = '72px';
      label.style.flex = '0 0 72px';
      label.style.fontSize = '0.95rem';
      label.style.color = '#666';
      label.textContent = formatHourLabel(h);

      // timeline container: relative so we can absolutely position span-boxes
      const timeline = document.createElement('div');
      timeline.className = 'hour-squares';
      timeline.style.flex = '1';
      timeline.style.position = 'relative';
      timeline.style.height = '44px';
      timeline.style.background = 'linear-gradient(to right, rgba(0,0,0,0.03) 0%, transparent 0%), transparent';
      timeline.style.borderRadius = '8px';

      row.appendChild(label);
      row.appendChild(timeline);
      dailyView.appendChild(row);
      rows[String(h)] = timeline;
    });

    // For each item, split across rows by overlap and draw time-span blocks
    items.forEach(item => {
      hours.forEach(h => {
        const hourStart = h * 60;
        const hourEnd = hourStart + 60;
        // normalize end to allow overnight spans (end might be > 1440)
        let s = item.startMin;
        let e = item.endMin;
        if (e <= s) e += 24 * 60; // overnight item
        // test overlap candidates for base hour and hour+1440 (to handle 00..01 after midnight segment)
        const spans = [
          { s, e, hS: hourStart, hE: hourEnd },
          { s: s + 1440, e: e + 1440, hS: hourStart + 1440, hE: hourEnd + 1440 }
        ];
        for (const seg of spans) {
          const overlapS = Math.max(seg.s, seg.hS);
          const overlapE = Math.min(seg.e, seg.hE);
          const dur = overlapE - overlapS;
          if (dur > 0) {
            const leftPct = ((overlapS - seg.hS) / 60) * 100;
            const widthPct = (dur / 60) * 100;
            const el = createTimeBlock(item, leftPct, widthPct);
            rows[String(h)].appendChild(el);
            break; // draw only once per actual hour
          }
        }
      });
    });

    // helper: create a time-span block positioned within an hour row
    function createTimeBlock(item, leftPct, widthPct) {
      const box = document.createElement('button');
      box.type = 'button';
      box.style.position = 'absolute';
      box.style.left = `${Math.max(0, Math.min(100, leftPct))}%`;
      box.style.width = `${Math.max(4, Math.min(100 - leftPct, widthPct))}%`;
      box.style.top = '6px';
      box.style.bottom = '6px';
      box.style.borderRadius = '8px';
      box.style.border = '1px solid rgba(0,0,0,0.06)';
      box.style.background = lightenBg(item.color || PRIMARY_COLOR, 0.22);
      box.style.display = 'inline-flex';
      box.style.alignItems = 'center';
      box.style.justifyContent = 'flex-start';
      box.style.gap = '6px';
      box.style.padding = '0 8px';
      box.style.cursor = 'pointer';
      box.style.overflow = 'hidden';
      box.title = item.title || '';
      // inner content
      const em = document.createElement('span');
      em.style.fontSize = '16px';
      em.textContent = item.emoji ? item.emoji : (item.kind === 'event' ? '•' : item.kind === 'reminder' ? '🔔' : '✅');
      const tt = document.createElement('span');
      tt.style.fontSize = '12px';
      tt.style.whiteSpace = 'nowrap';
      tt.style.textOverflow = 'ellipsis';
      tt.style.overflow = 'hidden';
      tt.textContent = item.title || '';
      box.appendChild(em); box.appendChild(tt);
      // click -> open appropriate editor (events already supported)
      box.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.kind === 'event') {
          openEditModal ? openEditModal(item.raw) : console.log('Edit event:', item.raw);
        } else {
          const modal = document.getElementById('editModal');
          if (!modal) return;
          const setIf = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ''; };
          setIf('editKind', item.kind);
          setIf('editText', item.title || '');
          // infer date/time from mins
          const hh = String(Math.floor(item.startMin % (24*60) / 60)).padStart(2,'0');
          const mm = String(Math.floor(item.startMin % 60)).padStart(2,'0');
          setIf('editDate', getSelectedDate());
          setIf('editTime', `${hh}:${mm}`);
          modal.classList.remove('hidden');
        }
      });
      return box;
    }

    // If no items, show placeholder
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '12px';
      empty.style.color = '#666';
      empty.textContent = 'No items for this day.';
      dailyView.appendChild(empty);
    }
  }

  function refreshForSelectedDate() {
    const dateStr = getSelectedDate();
    renderDailyView(dateStr);
  }

  // Re-render when navigating to the Calendar view
  window.addEventListener('view:show', (e) => {
    const v = (e && e.detail && e.detail.view) || '';
    if (v === 'calendar') refreshForSelectedDate();
  });

  // wire day part selector
  if (dayPartSelect) {
    dayPartSelect.addEventListener('change', refreshForSelectedDate);
  }

  // delegated click on calendar to set selection (non-destructive: will add .selected)
  if (calendarEl) {
    calendarEl.addEventListener('click', (ev) => {
      const dayEl = ev.target.closest('.day');
      if (!dayEl) return;
      // toggle .selected among siblings
      const prev = calendarEl.querySelector('.day.selected');
      if (prev) prev.classList.remove('selected');
      dayEl.classList.add('selected');

      // ensure data-date exists; if not try to derive from visible label
      if (!dayEl.dataset.date) {
        const label = dayEl.querySelector('.day-number');
        if (label && label.textContent) {
          // try to build a YYYY-MM-DD using current month shown in #monthLabel
          const monthLabel = document.getElementById('monthLabel');
          const monthText = monthLabel ? monthLabel.textContent : '';
          try {
            const dayNum = parseInt(label.textContent.trim(), 10);
            if (!isNaN(dayNum)) {
              // try to parse monthLabel like "October 2025"
              const dt = new Date(monthText + ' ' + dayNum);
              if (!isNaN(dt)) {
                dayEl.dataset.date = dt.toISOString().slice(0,10);
              }
            }
          } catch (e) { /* ignore */ }
        }
      }

      refreshForSelectedDate();
    });
  }

  // initial render on load
  document.addEventListener('DOMContentLoaded', () => {
    refreshForSelectedDate();
  });

  // also try to render shortly after script runs (in case DOMContent already fired)
  setTimeout(refreshForSelectedDate, 200);
})();
