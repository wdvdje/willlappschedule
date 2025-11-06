(function () {
  // offsets in minutes
  const OFFSETS = { none: null, at: 0, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '1d': 1440 };
  const timers = new Map(); // key -> timeout id

  function el(id){ return document.getElementById(id); }
  function now(){ return new Date(); }
  function parseISODate(d){ return d ? new Date(d + 'T00:00:00') : null; }

  function dateFromParts(dateISO, timeStr, fallback = '09:00') {
    const base = parseISODate(dateISO);
    const raw = String(timeStr || fallback).trim().toLowerCase();
    let hh = 9, mm = 0;
    const m = raw.match(/(\d{1,2})(?::(\d{1,2}))?/);
    if (m) {
      hh = parseInt(m[1] || '0', 10) || 0;
      mm = parseInt(m[2] || '0', 10) || 0;
      const isAM = /\bam\b/.test(raw);
      const isPM = /\bpm\b/.test(raw);
      if (isPM && hh < 12) hh += 12;
      if (isAM && hh === 12) hh = 0;
    }
    base.setHours(hh, mm, 0, 0);
    return base;
  }

  function minutesOffset(value) {
    if (!value) return null;
    return OFFSETS.hasOwnProperty(value) ? OFFSETS[value] : null;
  }

  async function ensurePermissionAndSW() {
    try { window.pushClient && (await window.pushClient.registerSW()); } catch(_) {}
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    try {
      const res = await Notification.requestPermission();
      return res === 'granted';
    } catch (_) { return false; }
  }

  async function showNotif(payload) {
    const hasPerm = await ensurePermissionAndSW();
    if (!hasPerm) return;
    const title = (payload.emoji ? payload.emoji + ' ' : '') + (payload.title || 'Reminder');
    const options = {
      body: payload.body || '',
      tag: payload.tag || ('ts-' + Date.now()),
      icon: payload.icon || '/icon-192.png',
      data: { url: payload.url || 'index.html#calendar' },
      renotify: false
    };
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) return reg.showNotification(title, options);
    } catch(_) {}
    try { new Notification(title, options); } catch(_) {}
  }

  function keyFor(kind, id, dateISO) { return [kind, id || 'noid', dateISO || 'nodate'].join('|'); }
  function clearTimer(key) {
    const t = timers.get(key);
    if (t) { clearTimeout(t); timers.delete(key); }
  }

  function scheduleAt(key, when, payload) {
    clearTimer(key);
    const delay = when.getTime() - now().getTime();
    if (delay <= 0) {
      // fire soon if within last 5 minutes; otherwise skip
      if (delay > -5 * 60 * 1000) setTimeout(() => showNotif(payload), 500);
      return;
    }
    const id = setTimeout(() => {
      timers.delete(key);
      showNotif(payload);
    }, Math.min(delay, 0x7FFFFFFF)); // clamp to max setTimeout
    timers.set(key, id);
  }

  function readOffsetFromSelect(selectId, fallback = 'none') {
    const sel = el(selectId);
    return sel && sel.value ? sel.value : fallback;
  }

  // ensure value is an array (coerce objects/maps or single item into array)
  function ensureArray(v) {
    if (Array.isArray(v)) return v;
    if (v == null) return [];
    if (typeof v === 'object') return Object.values(v);
    return [v];
  }

  // schedule reminders
  function scheduleReminders() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem('reminders') || '[]'); } catch(_) { list = []; }
    list = ensureArray(list);
    if (!Array.isArray(list)) { try { list = ensureArray(list); } catch(_) { list = []; } }
    const offsetSel = readOffsetFromSelect('reminderNotify', 'none');
    list.forEach((r, idx) => {
      if (!r || !r.date) return;
      const offsetVal = r.notify || r.reminderNotify || offsetSel || 'none';
      const offsetMin = minutesOffset(offsetVal);
      if (offsetMin == null) return;
      const when = dateFromParts(r.date, r.time || r.reminderTime || '09:00');
      when.setMinutes(when.getMinutes() - offsetMin);
      const key = keyFor('reminder', r.id || ('idx' + idx), r.date);
      const title = r.text || r.title || 'Reminder';
      const emoji = r.emoji || '';
      const body = [r.date, r.time].filter(Boolean).join(' • ');
      const url = 'index.html#reminders';
      scheduleAt(key, when, { title, body, emoji, url, tag: key });
    });
  }

  // schedule events (expand repeats and use eventNotify)
  function scheduleEvents() {
    const expand = window.appUtils && window.appUtils.expandEvents;
    const loadEvents = window.appUtils && window.appUtils.loadEvents;
    if (!loadEvents) return;
    const offsetSel = readOffsetFromSelect('eventNotify', 'none');
    // schedule for next 30 days
    const start = new Date(); const end = new Date(); end.setDate(end.getDate() + 30);
    const startISO = start.toISOString().slice(0,10);
    const endISO = end.toISOString().slice(0,10);
    const events = expand ? expand(startISO, endISO) : (loadEvents().filter(e => e && e.date >= startISO && e.date <= endISO));
    events.forEach((ev, idx) => {
      const offsetVal = ev.notify || ev.eventNotify || offsetSel || 'none';
      const offsetMin = minutesOffset(offsetVal);
      if (offsetMin == null) return;
      const dateISO = ev.date;
      const when = dateFromParts(dateISO, ev.startTime || '09:00');
      when.setMinutes(when.getMinutes() - offsetMin);
      const baseId = ev._baseId || ev.id || ('idx' + idx);
      const key = keyFor('event', baseId, dateISO);
      const title = ev.title || 'Event';
      const emoji = ev.emoji || '';
      const timeText = (ev.startTime ? ev.startTime : '') + (ev.endTime ? '–' + ev.endTime : '');
      const loc = ev.location || ev.place || '';
      const parts = [dateISO, timeText, loc].filter(Boolean);
      const body = parts.join(' • ');
      const url = 'index.html#events';
      scheduleAt(key, when, { title, body, emoji, url, tag: key });
    });
  }

  // on submit, schedule immediately using current form values (helps even if app.js hasn't persisted new fields yet)
  function wireFormHooks() {
    const evForm = el('eventForm');
    if (evForm) {
      evForm.addEventListener('submit', () => {
        try {
          const title = (el('eventTitle') && el('eventTitle').value) || 'Event';
          const emoji = (el('eventEmoji') && el('eventEmoji').value) || '';
          const dateISO = (el('eventDate') && el('eventDate').value) || '';
          const startTime = (el('eventTime') && el('eventTime').value) || '09:00';
          const offsetVal = readOffsetFromSelect('eventNotify', 'none');
          const offsetMin = minutesOffset(offsetVal);
          if (dateISO && offsetMin != null) {
            const when = dateFromParts(dateISO, startTime);
            when.setMinutes(when.getMinutes() - offsetMin);
            const key = keyFor('event', 'temp-' + Date.now(), dateISO);
            const body = [dateISO, startTime, (el('eventLocation') && el('eventLocation').value) || ''].filter(Boolean).join(' • ');
            scheduleAt(key, when, { title, body, emoji, url: 'index.html#events', tag: key });
          }
        } catch(_) {}
      }, { capture: true });
    }
    const rForm = el('reminderForm');
    if (rForm) {
      rForm.addEventListener('submit', (e) => {
        // prevent page reload or default form submission
        if (e && e.preventDefault) e.preventDefault();
        try {
          const text = (el('reminderInput') && el('reminderInput').value) || 'Reminder';
          const dateISO = (el('reminderDate') && el('reminderDate').value) || '';
          const time = (el('reminderTime') && el('reminderTime').value) || '09:00';
          const offsetVal = readOffsetFromSelect('reminderNotify', 'none');
          const offsetMin = minutesOffset(offsetVal);
          // persist the reminder so daily view and other parts see it
          if (dateISO) {
            const reminders = JSON.parse(localStorage.getItem('reminders') || '[]');
            const newRem = { id: 'rem:' + Date.now().toString(36), date: dateISO, time: time, text: text, notify: offsetVal || 'none' };
            reminders.push(newRem);
            localStorage.setItem('reminders', JSON.stringify(reminders));
            // also notify listeners that watch storage (some modules rely on storage event)
            try { window.dispatchEvent(new Event('storage')); } catch (e) { /* ignore */ }
            // schedule immediate notification (if offset set)
            if (offsetMin != null) {
              const when = dateFromParts(dateISO, time);
              when.setMinutes(when.getMinutes() - offsetMin);
              const key = keyFor('reminder', newRem.id, dateISO);
              const body = [dateISO, time].filter(Boolean).join(' • ');
              scheduleAt(key, when, { title: text, body, emoji: '', url: 'index.html#reminders', tag: key });
            }
            // notify app to refresh UI (daily view, reminders lists)
            window.dispatchEvent(new CustomEvent('app:data:updated'));
            // keep in same view (no navigation) — done via preventDefault
          }
        } catch(_) {}
      }, { capture: true });
    }
  }

  function rescheduleAll() {
    // clear existing timers
    Array.from(timers.keys()).forEach(k => clearTimer(k));
    scheduleReminders();
    scheduleEvents();
  }

  function init() {
    wireFormHooks();
    rescheduleAll();
    // reschedule on data updates or storage changes
    window.addEventListener('app:data:updated', rescheduleAll);
    window.addEventListener('storage', (e) => {
      if (!e || !e.key || ['events','reminders'].includes(e.key)) rescheduleAll();
    });
    // also re-evaluate when view changes (in case user sets offsets)
    window.addEventListener('view:show', rescheduleAll);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
