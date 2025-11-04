(function () {
  // Utility: parse events from localStorage (expected array of {id,title,date,startTime,endTime,emoji,...})
  function loadEvents() {
    try {
      return JSON.parse(localStorage.getItem('events') || '[]') || [];
    } catch (e) {
      return [];
    }
  }

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

    // optional actions column
    const actions = document.createElement('div');
    actions.style.flex = '0 0 auto';
    actions.style.marginLeft = '8px';
    const editBtn = document.createElement('button');
    editBtn.className = 'small-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEdit(ev));
    actions.appendChild(editBtn);

    li.appendChild(emojiSpan);
    li.appendChild(body);
    li.appendChild(actions);
    return li;
  }

  function openEdit(ev) {
    // Try to use existing edit modal; fall back to console
    const editModal = document.getElementById('editModal');
    if (!editModal) {
      console.log('Edit event:', ev);
      return;
    }
    const editKind = document.getElementById('editKind');
    const editEventId = document.getElementById('editEventId');
    const editText = document.getElementById('editText');
    const editDate = document.getElementById('editDate');
    const editTime = document.getElementById('editTime');
    const editEndTime = document.getElementById('editEndTime');
    const editEmoji = document.getElementById('editEmoji');

    if (editKind) editKind.value = 'event';
    if (editEventId) editEventId.value = ev.id || '';
    if (editText) editText.value = ev.title || '';
    if (editDate) editDate.value = ev.date || '';
    if (editTime) editTime.value = ev.startTime || '';
    if (editEndTime) editEndTime.value = ev.endTime || '';
    if (editEmoji) editEmoji.value = ev.emoji || '';
    editModal.classList.remove('hidden');
  }

  function renderEventsList() {
    const listEl = document.getElementById('eventList');
    if (!listEl) return;

    listEl.innerHTML = '';
    const events = loadEvents().slice().sort((a,b) => {
      // sort by date then startTime
      if (a.date === b.date) return (a.startTime || '').localeCompare(b.startTime || '');
      return (a.date || '').localeCompare(b.date || '');
    });

    const today = getTodayDateStr();
    const upcoming = [];
    const pastWithin30 = [];

    events.forEach(ev => {
      if (!ev || !ev.date) return;
      const days = daysBetween(today, ev.date); // today - ev.date
      if (days < 0) {
        // future
        upcoming.push(ev);
      } else if (days >= 0 && days <= 30) {
        // past within 30 days or today (days 0..30)
        // treat days === 0 as past only if startTime < now? Keep simple: if date < today we mark past, if date == today it's upcoming/current
        if (ev.date === today) {
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
  window.addEventListener('storage', () => {
    updateHeaderAndProfileStatus();
    renderEventsList();
  });

  document.addEventListener('DOMContentLoaded', () => {
    wireProfileButtons();
    updateHeaderAndProfileStatus();
    renderEventsList();
    // refresh every 60s in case day rolls over
    setInterval(() => {
      updateHeaderAndProfileStatus();
      renderEventsList();
    }, 60000);
  });
})();
