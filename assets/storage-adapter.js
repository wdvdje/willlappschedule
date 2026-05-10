(function () {
  if (window.appStorage) return;

  function getLocalStorage() {
    try {
      return window.localStorage || null;
    } catch (_) {
      return null;
    }
  }

  const ls = getLocalStorage();

  const storage = {
    getItem: function getItem(key, fallback) {
      const fb = (typeof fallback === 'undefined') ? '' : fallback;
      try {
        if (!ls) return fb;
        const value = ls.getItem(key);
        return value == null ? fb : value;
      } catch (_) {
        return fb;
      }
    },

    setItem: function setItem(key, value) {
      const raw = value == null ? '' : String(value);
      try {
        if (ls) ls.setItem(key, raw);
      } catch (_) {}
      return raw;
    },

    removeItem: function removeItem(key) {
      try {
        if (ls) ls.removeItem(key);
      } catch (_) {}
    },

    getJSON: function getJSON(key, fallback) {
      const raw = storage.getItem(key, '');
      if (!raw) return fallback;
      try {
        return JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    },

    setJSON: function setJSON(key, value) {
      try {
        storage.setItem(key, JSON.stringify(value));
        return true;
      } catch (_) {
        return false;
      }
    }
  };

  window.appStorage = storage;
})();
