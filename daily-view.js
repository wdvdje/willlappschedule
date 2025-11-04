(function () {
  // ...existing app scripts may run before this file ...
  const dailyView = document.getElementById('dailyView');
  const dayPartSelect = document.getElementById('dayPartSelect');
  const calendarEl = document.getElementById('calendar');
  const PRIMARY_COLOR = '#4a90e2'; // kept in sync with CSS

  // use shared loader if available, fallback to local impl
  const loadEvents = (window.appUtils && window.appUtils.loadEvents) ? window.appUtils.loadEvents : function () {
    try { return JSON.parse(localStorage.getItem('events') || '[]') || []; } catch (_) { return []; }
  };
  const openEditModal = (window.appUtils && window.appUtils.openEditModalFill) ? window.appUtils.openEditModalFill : null;

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

      // squares container: holds small interactive rounded squares for events overlapping this hour
      const squares = document.createElement('div');
      squares.className = 'hour-squares';
      squares.style.flex = '1';
      squares.style.display = 'flex';
      squares.style.flexWrap = 'wrap';
      squares.style.gap = '6px';
      squares.style.minHeight = '40px';
      squares.style.alignItems = 'center';

      row.appendChild(label);
      row.appendChild(squares);
      dailyView.appendChild(row);
      rows[String(h)] = squares;
    });

    // Place events into each hour they overlap. This also ensures events spanning hours
    // (and overnight) appear in every daily view segment they intersect.
    events.forEach(ev => {
      const startHour = parseHourFromTime(ev.startTime);
      const endHour = parseEndHourFromTime(ev.endTime, startHour);
      // If no start hour, append a single square to the first displayed hour
      if (startHour === null) {
        const firstKey = Object.keys(rows)[0];
        if (firstKey) {
          const sq = createEventSquare(ev);
          rows[firstKey].appendChild(sq);
        }
        return;
      }

      // For each displayed hour, check overlap and add a square for that hour.
      hours.forEach(h => {
        if (eventOverlapsHour(startHour, endHour, h)) {
          const sq = createEventSquare(ev);
          rows[String(h)].appendChild(sq);
        }
      });
    });

    // helper: create small rounded interactive square for an event (shows emoji or colored dot)
    function createEventSquare(ev) {
      const btn = document.createElement('button');
      btn.className = 'event-square';
      btn.type = 'button';
      btn.style.width = '36px';
      btn.style.height = '36px';
      btn.style.borderRadius = '8px';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.padding = '0';
      btn.style.border = `1px solid rgba(74,144,226,0.28)`;
      btn.style.background = 'white';
      btn.style.cursor = 'pointer';
      btn.title = ev.title || 'Event';
      btn.setAttribute('aria-label', ev.title || 'Event');

      // emoji or colored dot
      const inner = document.createElement('span');
      inner.style.fontSize = '18px';
      inner.style.lineHeight = '1';
      if (ev.emoji && ev.emoji.trim()) {
        inner.textContent = ev.emoji.trim();
      } else {
        inner.textContent = '•';
        inner.style.color = PRIMARY_COLOR;
        inner.style.fontSize = '20px';
      }
      btn.appendChild(inner);

      // click/keyboard handlers
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (openEditModal) { openEditModal(ev); return; }
        const modal = document.getElementById('editModal');
        if (!modal) { console.log('Edit requested:', ev); return; }
        const setIf = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ''; };
        setIf('editKind', 'event'); setIf('editEventId', ev.id || ''); setIf('editText', ev.title || '');
        setIf('editDate', ev.date || ''); setIf('editTime', ev.startTime || ''); setIf('editEndTime', ev.endTime || '');
        setIf('editEmoji', ev.emoji || '');
        modal.classList.remove('hidden');
      });
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
      });
      return btn;
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
