(function () {
  const loadEvents = (window.appUtils && window.appUtils.loadEvents) ? window.appUtils.loadEvents : function () {
    try { return JSON.parse(localStorage.getItem('events') || '[]') || []; } catch (e) { return []; }
  };

  const expandEvents = (window.appUtils && window.appUtils.expandEvents) ? window.appUtils.expandEvents : null;

  function getTodayDateStr() {
    const d = new Date();
    return d.toISOString().slice(0,10);
  }

  function daysBetween(aStr, bStr) {
    const a = new Date(aStr + 'T00:00:00');
    const b = new Date(bStr + 'T00:00:00');
    return Math.round((a - b) / (1000 * 60 * 60 * 24));
  }

  function createEventLI(ev, isPast) {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.gap = '8px';
    li.style.padding = '6px 0';
    if (isPast) li.style.opacity = '0.8';

    const emojiSpan = document.createElement('span');
    emojiSpan.style.width = '28px';
    emojiSpan.style.textAlign = 'center';
    emojiSpan.style.flex = '0 0 28px';
    emojiSpan.textContent = (ev.emoji && ev.emoji.trim()) ? ev.emoji.trim() : '•';

    const body = document.createElement('div');
    body.style.flex = '1';
    const title = document.createElement('div');
    title.style.fontWeight = '600';
    title.textContent = ev.title || '(untitled)';

    const meta = document.createElement('div');
    meta.style.fontSize = '0.9rem';
    meta.style.color = '#666';
    const timeText = (ev.startTime ? ev.startTime : '') + (ev.endTime ? '–' + ev.endTime : '');
    meta.textContent = [ev.date || '', timeText].filter(Boolean).join(' ');

    body.appendChild(title);
    body.appendChild(meta);

    // optional actions column (uses shared openEdit)
    const actions = document.createElement('div');
    actions.style.flex = '0 0 auto';
    actions.style.marginLeft = '8px';
    const editBtn = document.createElement('button');
    editBtn.className = 'small-btn';
    editBtn.textContent = 'Edit';
    editBtn.type = 'button';
    editBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openEdit(ev); });
    actions.appendChild(editBtn);

    li.appendChild(emojiSpan);
    li.appendChild(body);
    li.appendChild(actions);
    return li;
  }

  const openEdit = (window.appUtils && window.appUtils.openEditModalFill) ? window.appUtils.openEditModalFill : function (ev) {
    const modal = document.getElementById('editModal');
    if (!modal) { console.log('Edit event:', ev); return; }
    const setIf = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ''; };
    setIf('editKind', 'event'); setIf('editEventId', ev.id || ''); setIf('editText', ev.title || '');
    setIf('editDate', ev.date || ''); setIf('editTime', ev.startTime || ''); setIf('editEndTime', ev.endTime || '');
    setIf('editEmoji', ev.emoji || '');
    modal.classList.remove('hidden');
  };

  // Jobs helpers
  function loadJobs() {
    try { return JSON.parse(localStorage.getItem('jobs') || '[]') || []; } catch (_) { return []; }
  }
  function jobSelectEl() { return document.getElementById('eventJobId'); }
  function jobRowEl() { return document.getElementById('eventJobRow'); }
  function catEl() { return document.getElementById('eventCategory'); }
  function setHidden(id, v) { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : String(v)); }
  function fillJobSnapshot(job) {
    if (!job) { // clear
      setHidden('eventJobName',''); setHidden('eventJobRate',''); setHidden('eventJobUnit','');
      setHidden('eventJobEmoji',''); setHidden('eventJobLocation',''); return;
    }
    setHidden('eventJobName', job.name || job.jobName || '');
    setHidden('eventJobRate', job.rate || job.jobRate || '');
    setHidden('eventJobUnit', job.unit || job.jobUnit || '');
    setHidden('eventJobEmoji', job.emoji || job.jobEmoji || '');
    setHidden('eventJobLocation', job.location || job.jobLocation || '');
  }
  function renderJobOptions() {
    const sel = jobSelectEl();
    if (!sel) return;
    const jobs = loadJobs();
    sel.innerHTML = '';
    const def = document.createElement('option'); def.value = ''; def.textContent = 'Select a job…';
    sel.appendChild(def);
    jobs.forEach(j => {
      const o = document.createElement('option');
      o.value = j.id || j._id || '';
      const nm = j.name || j.jobName || 'Unnamed job';
      const em = (j.emoji || j.jobEmoji || '').trim();
      o.textContent = em ? (em + ' ' + nm) : nm;
      sel.appendChild(o);
    });
  }
  function toggleJobRow() {
    const cat = catEl() ? catEl().value : 'event';
    const row = jobRowEl();
    if (!row) return;
    const show = (cat === 'job');
    row.style.display = show ? 'flex' : 'none';
    if (!show) { fillJobSnapshot(null); const sel = jobSelectEl(); if (sel) sel.value = ''; }
  }
  function wireCategoryJobUi() {
    const cat = catEl();
    const sel = jobSelectEl();
    if (cat) {
      cat.addEventListener('change', () => {
        toggleJobRow();
      });
    }
    if (sel) {
      sel.addEventListener('change', () => {
        const id = sel.value || '';
        const jobs = loadJobs();
        const chosen = jobs.find(j => (j.id || j._id) === id);
        fillJobSnapshot(chosen || null);
      });
    }
    // initial state
    renderJobOptions();
    toggleJobRow();
  }

  function renderEventsList() {
    const listEl = document.getElementById('eventList');
    if (!listEl) return;

    listEl.innerHTML = '';
    // build a date window sufficiently wide to include repeats (past 30 days .. next 365 days)
    const today = getTodayDateStr();
    const past30 = (new Date(new Date(today + 'T00:00:00').getTime() - (30*24*60*60*1000))).toISOString().slice(0,10);
    const future365 = (new Date(new Date(today + 'T00:00:00').getTime() + (365*24*60*60*1000))).toISOString().slice(0,10);
    const events = expandEvents ? expandEvents(past30, future365) : loadEvents().slice();

    // events already sorted by expandEvents, but ensure stable sort
    events.sort((a,b) => {
      if (a.date === b.date) return (a.startTime || '').localeCompare(b.startTime || '');
      return (a.date || '').localeCompare(b.date || '');
    });

    const today2 = getTodayDateStr();
    const upcoming = [];
    const pastWithin30 = [];

    events.forEach(ev => {
      if (!ev || !ev.date) return;
      const days = daysBetween(today2, ev.date); // today - ev.date
      if (days < 0) {
        // future
        upcoming.push(ev);
      } else if (days >= 0 && days <= 30) {
        if (ev.date === today2) {
          upcoming.push(ev);
        } else {
          pastWithin30.push(ev);
        }
      } else {
        // older than 30 days -> skip rendering
      }
    });

    // Render upcoming
    if (upcoming.length) {
      const ulUp = document.createElement('ul');
      ulUp.style.listStyle = 'none';
      ulUp.style.padding = '0';
      upcoming.forEach(ev => ulUp.appendChild(createEventLI(ev, false)));
      listEl.appendChild(ulUp);
    } else {
      const none = document.createElement('div');
      none.style.color = '#666';
      none.textContent = 'No upcoming events.';
      listEl.appendChild(none);
    }

    // Render past header + items (if any)
    if (pastWithin30.length) {
      const hdr = document.createElement('h4');
      hdr.textContent = 'Past events (last 30 days)';
      hdr.style.marginTop = '12px';
      hdr.style.marginBottom = '6px';
      hdr.style.color = '#666';
      listEl.appendChild(hdr);

      const ulPast = document.createElement('ul');
      ulPast.style.listStyle = 'none';
      ulPast.style.padding = '0';
      pastWithin30.forEach(ev => ulPast.appendChild(createEventLI(ev, true)));
      listEl.appendChild(ulPast);
    }
  }

  // Header + profile status wiring
  function resolveProfileName() {
    // try a few common keys and inputs
    let name = localStorage.getItem('userName') || localStorage.getItem('settingsFullName') || localStorage.getItem('profileName') || '';
    if (!name) {
      const inputs = ['userName', 'settingsFullName', 'settingsName', 'settingsFullName'];
      for (const id of inputs) {
        const el = document.getElementById(id);
        if (el && el.value) { name = el.value.trim(); break; }
      }
    }
    return (name || '').trim();
  }

  function updateHeaderAndProfileStatus() {
    const header = document.getElementById('appHeader');
    const profileStatus = document.getElementById('profileStatus');
    const name = resolveProfileName();
    if (header) {
      header.textContent = name ? `${name}'s Planner` : '📅 TimeScape Planner';
    }
    if (profileStatus) {
      profileStatus.textContent = name ? `Name set: ${name}` : 'Name not set';
    }
  }

  // Hook save/clear buttons in settings to persist name via localStorage key 'userName'
  function wireProfileButtons() {
    const saveBtn = document.getElementById('saveProfileBtn');
    const clearBtn = document.getElementById('clearProfileBtn');
    const nameInput = document.getElementById('userName');

    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const v = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
        if (v) localStorage.setItem('userName', v);
        updateHeaderAndProfileStatus();
        // notify other tabs
        try { window.dispatchEvent(new Event('storage')); } catch (e) {}
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('userName');
        if (nameInput) nameInput.value = '';
        updateHeaderAndProfileStatus();
        try { window.dispatchEvent(new Event('storage')); } catch (e) {}
      });
    }
  }

  // refresh when storage changes (other tabs) and periodically
  window.addEventListener('storage', (e) => {
    if (!e || !e.key || e.key === 'jobs') renderJobOptions();
    updateHeaderAndProfileStatus();
    renderEventsList();
  });

  // Re-render when navigating to the Events view
  window.addEventListener('view:show', (e) => {
    const v = (e && e.detail && e.detail.view) || '';
    if (v === 'events') {
      renderJobOptions();
      toggleJobRow();
      renderEventsList();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    wireCategoryJobUi();
    wireProfileButtons();
    updateHeaderAndProfileStatus();
    renderEventsList();
    // refresh every 60s in case day rolls over
    setInterval(() => {
      updateHeaderAndProfileStatus();
      renderEventsList();
    }, 60000);
  });

  // refresh job options when settings change (e.g., jobs edited/synced)
  window.addEventListener('app:data:updated', renderJobOptions);
})();
