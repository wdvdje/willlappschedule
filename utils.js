// Minimal shared helpers used by other view scripts
(function () {
  function loadEvents(storageKey = 'events') {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]') || [];
    } catch (e) {
      return [];
    }
  }

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
    editModal.classList.remove('hidden');
  }

  // expose
  window.appUtils = window.appUtils || {};
  window.appUtils.loadEvents = loadEvents;
  window.appUtils.openEditModalFill = openEditModalFill;
})();
