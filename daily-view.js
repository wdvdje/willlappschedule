(function () {
  // ...existing app scripts may run before this file ...
  const dailyView = document.getElementById('dailyView');
  const dayPartSelect = document.getElementById('dayPartSelect');
  const calendarEl = document.getElementById('calendar');
  const PRIMARY_COLOR = '#4a90e2'; // kept in sync with CSS

  function loadEvents() {
    try {
      return JSON.parse(localStorage.getItem('events') || '[]');
    } catch (e) {
      return [];
    }
  }

  function formatHourLabel(h) {
    const hh = String(h).padStart(2, '0');
    return `${hh}:00`;
  }

  function hoursForPart(part) {
    if (part === 'morning') {
      return range(1, 9); // 01–09
    } else if (part === 'day') {
      return range(9, 17); // 09–17
    } else if (part === 'night') {
      // show 17..23 then 0..1 (maps to midnight/early)
      return range(17, 24).concat(range(0, 2)); // 17–23, 00–01
    }
    return range(0, 24);
  }

  function range(start, endExclusive) {
    const arr = [];
    for (let i = start; i < endExclusive; i++) arr.push(i % 24);
    return arr;
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

  function clearDailyView() {
    dailyView.innerHTML = '';
  }

  function renderDailyView(dateStr) {
    if (!dailyView) return;
    clearDailyView();

    const part = (dayPartSelect && dayPartSelect.value) || 'day';
    const hours = hoursForPart(part);
    const events = loadEvents().filter(e => e && e.date === dateStr);

    const rows = {}; // map hour->row element
    hours.forEach(h => {
      const row = document.createElement('div');
      row.className = 'hour-row';
      row.dataset.hour = String(h);
      row.style.display = 'flex';
      row.style.alignItems = 'flex-start';
      row.style.gap = '8px';
      row.style.borderBottom = '1px solid #f0f0f0';
      row.style.padding = '8px 6px';

      const label = document.createElement('div');
      label.style.width = '72px';
      label.style.flex = '0 0 72px';
      label.style.fontSize = '0.95rem';
      label.style.color = '#666';
      label.textContent = formatHourLabel(h);

      const content = document.createElement('div');
      content.className = 'hour-content';
      content.style.flex = '1';
      content.style.minHeight = '28px';
      content.style.position = 'relative';
      content.style.display = 'flex';
      content.style.flexDirection = 'column';
      content.style.alignItems = 'stretch';

      row.appendChild(label);
      row.appendChild(content);
      dailyView.appendChild(row);
      rows[String(h)] = content;
    });

    // Place events into each hour they overlap. This also ensures events spanning hours
    // (and overnight) appear in every daily view segment they intersect.
    events.forEach(ev => {
      const startHour = parseHourFromTime(ev.startTime);
      const endHour = parseEndHourFromTime(ev.endTime, startHour);
      // If no start hour, append to the first displayed hour
      if (startHour === null) {
        const firstKey = Object.keys(rows)[0];
        if (firstKey) {
          const el = createDailyEventNode(ev);
          rows[firstKey].appendChild(el);
        }
        return;
      }

      // For each displayed hour, check overlap and add a box for that hour.
      hours.forEach(h => {
        if (eventOverlapsHour(startHour, endHour, h)) {
          const el = createDailyEventNode(ev);
          rows[String(h)].appendChild(el);
        }
      });
    });

    // helper to create visually consistent event box nodes
    function createDailyEventNode(ev) {
      const el = document.createElement('div');
      el.className = 'daily-event';
      el.style.display = 'block';
      el.style.padding = '6px 8px';
      el.style.borderRadius = '8px';
      el.style.background = 'rgba(74,144,226,0.08)'; // light tint to match calendar
      el.style.border = `1px solid rgba(74,144,226,0.22)`;
      el.style.color = '#0b3358';
      el.style.fontSize = '0.95rem';
      el.style.marginBottom = '6px';
      el.style.boxSizing = 'border-box';
      el.style.cursor = 'pointer';
      el.title = ev.title || 'Event';

      const timeText = ev.startTime ? ev.startTime + (ev.endTime ? '–' + ev.endTime : '') : '';
      const emoji = ev.emoji ? (ev.emoji + ' ') : '';
      el.textContent = `${timeText} ${emoji}${ev.title || '(untitled)'}`;

      // click to open edit modal / fallback behavior retained
      el.addEventListener('click', () => {
        if (typeof openEditModal === 'function') {
          openEditModal(ev);
          return;
        }
        const editModal = document.getElementById('editModal');
        if (editModal) {
          const editKind = document.getElementById('editKind');
          const editEventId = document.getElementById('editEventId');
          const editText = document.getElementById('editText');
          const editDate = document.getElementById('editDate');
          const editTime = document.getElementById('editTime');
          const editEndTime = document.getElementById('editEndTime');
          if (editKind) editKind.value = 'event';
          if (editEventId) editEventId.value = ev.id || '';
          if (editText) editText.value = ev.title || '';
          if (editDate) editDate.value = ev.date || '';
          if (editTime) editTime.value = ev.startTime || '';
          if (editEndTime) editEndTime.value = ev.endTime || '';
          editModal.classList.remove('hidden');
        }
      });
      return el;
    }

    // If no events, show placeholder
    if (events.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '12px';
      empty.style.color = '#666';
      empty.textContent = 'No events for this day.';
      dailyView.appendChild(empty);
    }
  }

  function refreshForSelectedDate() {
    const dateStr = getSelectedDate();
    renderDailyView(dateStr);
  }

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
