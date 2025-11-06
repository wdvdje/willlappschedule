// Minimal shared helpers used by other view scripts
(function () {
  function loadEvents(storageKey = 'events') {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]') || [];
    } catch (e) {
      return [];
    }
  }

  // --- Edit modal helpers/wiring ---
  function hideEditModal() {
    const m = document.getElementById('editModal');
    if (!m) return;
    m.classList.add('hidden');
  }
  function showEditModal() {
    const m = document.getElementById('editModal');
    if (!m) return;
    if (!m.classList.contains('hidden')) return; // already visible
    m.classList.remove('hidden');
    // focus first input
    setTimeout(() => {
      const el = document.getElementById('editText');
      if (el && el.focus) try { el.focus(); } catch(_) {}
    }, 0);
  }
  function wireEditModalOnce() {
    const m = document.getElementById('editModal');
    if (!m || m.dataset.wired === '1') return;
    m.dataset.wired = '1';
    const cancel = document.getElementById('cancelEdit');
    if (cancel) cancel.addEventListener('click', (e) => { e.preventDefault(); hideEditModal(); });
    // click outside panel closes
    m.addEventListener('click', (e) => {
      if (e.target === m) hideEditModal();
    });
    // escape closes
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !m.classList.contains('hidden')) hideEditModal();
    });
  }
  document.addEventListener('DOMContentLoaded', wireEditModalOnce);

  function openEditModalFill(ev) {
    // populate existing edit modal if present; otherwise log
    const editModal = document.getElementById('editModal');
    if (!editModal) {
      console.log('openEditModalFill:', ev);
      return;
    }
    const setIf = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || '';
    };
    setIf('editKind', 'event');
    setIf('editEventId', ev.id || '');
    setIf('editText', ev.title || '');
    setIf('editDate', ev.date || '');
    setIf('editTime', ev.startTime || '');
    setIf('editEndTime', ev.endTime || '');
    setIf('editEmoji', ev.emoji || '');
    showEditModal();
  }

  // date helpers
  function parseISO(d) { return d ? new Date(d + 'T00:00:00') : null; }
  function toISODate(dt) { return dt.toISOString().slice(0,10); }
  function addDaysISO(dateISO, days) {
    const dt = parseISO(dateISO);
    dt.setDate(dt.getDate() + days);
    return toISODate(dt);
  }

  // expandEvents(startISO, endISO): returns occurrences (including non-repeating) whose date falls within [startISO,endISO]
  // Each occurrence is a shallow clone of the base event with .occurrenceDate and ._baseId set to original id.
  function expandEvents(startISO, endISO, storageKey = 'events') {
    const start = parseISO(startISO);
    const end = parseISO(endISO);
    if (!start || !end) return [];
    const events = loadEvents(storageKey);
    const out = [];
    events.forEach(ev => {
      if (!ev || !ev.date) return;
      const baseDate = ev.date;
      const repeat = (ev.repeat || 'none'); // expected value strings from UI
      const until = ev.repeatUntil || null; // optional YYYY-MM-DD

      // helper to push occurrence if in range
      const pushIfInRange = (dISO) => {
        const dt = parseISO(dISO);
        if (dt >= start && dt <= end) {
          const occ = Object.assign({}, ev);
          occ.occurrenceDate = dISO;
          occ.date = dISO; // make date property be the occurrence date for downstream code
          occ._baseId = ev.id || ev._id || null;
          out.push(occ);
        }
      };

      // non repeating -> push if in range
      if (!repeat || repeat === 'none') {
        pushIfInRange(baseDate);
        return;
      }

      // repeating: iterate from baseDate to end, advancing according to rule, stop at repeatUntil if present
      let d = baseDate;
      const maxLoop = 2000; // safety cap
      let loops = 0;
      while (true) {
        if (loops++ > maxLoop) break;
        // stop if beyond end or beyond repeatUntil
        if (parseISO(d) > end) break;
        if (until && parseISO(d) > parseISO(until)) break;
        // push occurrence if >= start and <= end
        pushIfInRange(d);
        // advance
        if (repeat === 'daily') d = addDaysISO(d, 1);
        else if (repeat === '2day') d = addDaysISO(d, 2);
        else if (repeat === 'weekly') d = addDaysISO(d, 7);
        else if (repeat === 'monthly') {
          // advance month, keep day number where possible
          const dt = parseISO(d);
          const day = dt.getDate();
          dt.setMonth(dt.getMonth() + 1);
          // if month overflowed to next month adjust last day
          if (dt.getDate() < day) { dt.setDate(0); } // move to last day of prev month if needed
          d = toISODate(dt);
        } else {
          // unknown rule: break
          break;
        }
        // stop when d built beyond reasonable date
        if (parseISO(d) > parseISO('2100-01-01')) break;
      }
    });
    // sort by date asc
    out.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    return out;
  }

  // expose
  window.appUtils = window.appUtils || {};
  window.appUtils.loadEvents = loadEvents;
  window.appUtils.openEditModalFill = openEditModalFill;
  window.appUtils.expandEvents = expandEvents;
  window.appUtils.hideEditModal = hideEditModal;
  window.appUtils.showEditModal = showEditModal;
})();
