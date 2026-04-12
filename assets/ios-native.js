/**
 * ios-native.js — iOS 26 / macOS native-feel enhancements
 * Runs after all other scripts.  Feature-detects everything.
 */
(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────
     1.  Dark mode auto-detection
     Bridge OS preference → existing body.dark-mode class system
     ────────────────────────────────────────────────────────── */
  var _dmq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');

  function _applyDarkMode() {
    if (!_dmq) return;
    // Only override if user hasn't manually saved a preference
    var override = localStorage.getItem('darkModeManual');
    if (override !== null) return;
    document.body.classList.toggle('dark-mode', _dmq.matches);
  }

  // Run immediately (body is available by the time this deferred script runs)
  _applyDarkMode();

  if (_dmq && _dmq.addEventListener) {
    _dmq.addEventListener('change', _applyDarkMode);
  }

  /* ──────────────────────────────────────────────────────────
     2.  Haptic feedback wrapper
     ────────────────────────────────────────────────────────── */
  function haptic(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern || [10]);
    } catch (_) {}
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest(
      'button, a.r-item, a.sidebar-item, .day, .bucket-header,' +
      ' .chore-tpl-item, .dv-event-block, .cal-add-type-btn'
    );
    if (el) haptic([8]);
  }, { passive: true });

  /* ──────────────────────────────────────────────────────────
     3.  Page transition animations (MutationObserver approach)
     Works without touching the existing router.
     ────────────────────────────────────────────────────────── */
  function _initPageTransitions() {
    var pages = document.querySelectorAll('.page');
    if (!pages.length) return;

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        var el = m.target;
        if (el.classList.contains('page') && !el.classList.contains('hidden')) {
          el.classList.add('page-animating');
          el.addEventListener('animationend', function onEnd() {
            el.classList.remove('page-animating');
            el.removeEventListener('animationend', onEnd);
          });
        }
      });
    });

    pages.forEach(function (p) {
      observer.observe(p, { attributes: true, attributeFilter: ['class'] });
    });
  }

  /* ──────────────────────────────────────────────────────────
     4.  Desktop sidebar wiring
     ────────────────────────────────────────────────────────── */
  function _initSidebar() {
    var sidebar = document.getElementById('desktopSidebar');
    if (!sidebar) return;

    var items = sidebar.querySelectorAll('.sidebar-item[data-view]');

    function _updateActive() {
      var view = (location.hash || '#today').replace('#', '') || 'today';
      items.forEach(function (item) {
        item.classList.toggle('active', item.dataset.view === view);
      });
      // Also update the sidebar app title from profile
      try {
        var name = localStorage.getItem('userName') || '';
        var titleEl = sidebar.querySelector('.sidebar-app-title');
        if (titleEl) titleEl.textContent = name ? name + '\u2019s Planner' : '\uD83D\uDCC5 TimeScape';
      } catch (_) {}
    }

    items.forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        var view = item.dataset.view || 'today';
        haptic([10]);
        if (location.hash.replace('#', '') !== view) {
          location.hash = view;
        }
        window.dispatchEvent(new Event('hashchange'));
      });
    });

    window.addEventListener('hashchange', _updateActive);
    _updateActive();
  }

  /* ──────────────────────────────────────────────────────────
     5.  Bottom-sheet drag-to-dismiss  +  backdrop-tap close
         Also injects drag handles into modal panels.
     ────────────────────────────────────────────────────────── */
  function _animateSheetOut(panel, callback) {
    panel.style.transition = 'transform 0.28s cubic-bezier(0.25,1,0.5,1)';
    panel.style.transform = 'translateY(100%)';
    setTimeout(function () {
      panel.style.transition = '';
      panel.style.transform = '';
      callback();
    }, 280);
  }

  function _setupSheet(overlayId, panelSelector, closeHide) {
    var overlay = document.getElementById(overlayId);
    if (!overlay) return;

    var panel = overlay.querySelector(panelSelector);
    if (!panel) return;

    // Inject drag handle if not already present
    if (!panel.querySelector('.sheet-handle')) {
      var handle = document.createElement('div');
      handle.className = 'sheet-handle';
      panel.insertBefore(handle, panel.firstChild);
    }

    // Backdrop tap → dismiss
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        _animateSheetOut(panel, function () {
          closeHide();
        });
      }
    });

    // Touch drag to dismiss
    var _startY = 0;
    var _dragging = false;

    panel.addEventListener('touchstart', function (e) {
      // Only start drag from the handle area or near top of panel
      var rect = panel.getBoundingClientRect();
      var touch = e.touches[0];
      if (touch.clientY - rect.top < 60) {
        _startY = touch.clientY;
        _dragging = true;
      }
    }, { passive: true });

    panel.addEventListener('touchmove', function (e) {
      if (!_dragging) return;
      var dy = e.touches[0].clientY - _startY;
      if (dy > 0) {
        panel.style.transform = 'translateY(' + dy + 'px)';
        panel.style.transition = 'none';
        panel.style.animationName = 'none';
      }
    }, { passive: true });

    panel.addEventListener('touchend', function (e) {
      if (!_dragging) return;
      _dragging = false;
      var dy = e.changedTouches[0].clientY - _startY;
      panel.style.transition = '';
      panel.style.animationName = '';
      if (dy > 110) {
        _animateSheetOut(panel, function () {
          panel.style.transform = '';
          closeHide();
        });
      } else {
        panel.style.transform = '';
      }
    }, { passive: true });
  }

  function _initBottomSheets() {
    // editModal — closed by JS adding .hidden class
    _setupSheet('editModal', '.panel', function () {
      var modal = document.getElementById('editModal');
      if (modal) modal.classList.add('hidden');
    });

    // catModal — closed by JS
    _setupSheet('catModal', '> div', function () {
      var modal = document.getElementById('catModal');
      if (modal) modal.classList.add('hidden');
    });

    // jobModal — closed by JS
    _setupSheet('jobModal', '> div', function () {
      var modal = document.getElementById('jobModal');
      if (modal) modal.classList.add('hidden');
    });

    // chore template modal
    _setupSheet('choreTemplateModal', '.chore-tpl-panel', function () {
      var modal = document.getElementById('choreTemplateModal');
      if (modal) modal.classList.add('hidden');
    });
  }

  /* ──────────────────────────────────────────────────────────
     6.  Pull-to-refresh
     ────────────────────────────────────────────────────────── */
  function _initPullToRefresh() {
    var indicator = document.getElementById('pullRefreshIndicator');
    if (!indicator) return;

    var _startY = 0;
    var _refreshing = false;
    var _active = false;
    var THRESHOLD = 65;

    document.addEventListener('touchstart', function (e) {
      if (window.scrollY === 0) {
        _startY = e.touches[0].clientY;
        _active = true;
      } else {
        _active = false;
      }
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (!_active || _refreshing) return;
      var dy = e.touches[0].clientY - _startY;
      if (dy > 8) {
        var progress = Math.min(dy / THRESHOLD, 1);
        indicator.style.opacity = progress;
        var translateY = Math.min(dy * 0.55, 44);
        indicator.style.transform = 'translateX(-50%) translateY(' + translateY + 'px) rotate(' + (dy * 2.5) + 'deg)';
        if (dy >= THRESHOLD) {
          indicator.classList.add('ptr-pulling');
        }
      }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (!_active || _refreshing) return;
      _active = false;
      var dy = e.changedTouches[0].clientY - _startY;

      if (dy >= THRESHOLD && window.scrollY === 0) {
        _refreshing = true;
        indicator.classList.remove('ptr-pulling');
        indicator.classList.add('ptr-refreshing');
        haptic([20, 60, 20]);
        indicator.querySelector('span').style.animation = '';

        // Trigger data refresh
        setTimeout(function () {
          try { if (typeof generateCalendar === 'function') generateCalendar(); } catch (_) {}
          try { if (typeof renderDailyView === 'function') renderDailyView(); } catch (_) {}
          try { if (typeof renderInbox === 'function') renderInbox(); } catch (_) {}
        }, 200);

        setTimeout(function () {
          indicator.classList.remove('ptr-pulling', 'ptr-refreshing');
          indicator.style.opacity = '';
          indicator.style.transform = '';
          _refreshing = false;
        }, 1200);
      } else {
        indicator.classList.remove('ptr-pulling', 'ptr-refreshing');
        indicator.style.opacity = '';
        indicator.style.transform = '';
      }
    }, { passive: true });
  }

  /* ──────────────────────────────────────────────────────────
     7.  App Badging API
         Shows count of incomplete today's tasks + reminders
     ────────────────────────────────────────────────────────── */
  function _initBadgeAPI() {
    if (!navigator.setAppBadge) return;

    function _updateBadge() {
      try {
        var today = new Date().toISOString().slice(0, 10);
        var count = 0;

        var tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
        tasks.forEach(function (t) {
          if (!t.done && t.date === today) count++;
        });

        var reminders = JSON.parse(localStorage.getItem('reminders') || '{}');
        Object.values(reminders).forEach(function (list) {
          if (Array.isArray(list)) {
            list.forEach(function (r) {
              if (!r.done && r.date === today) count++;
            });
          }
        });

        if (count > 0) {
          navigator.setAppBadge(count).catch(function () {});
        } else {
          navigator.clearAppBadge().catch(function () {});
        }
      } catch (_) {}
    }

    _updateBadge();
    setInterval(_updateBadge, 60000);
    window.addEventListener('storage', _updateBadge);
  }

  /* ──────────────────────────────────────────────────────────
     8.  Web Share API helper
         Exposed globally so other scripts can call it
     ────────────────────────────────────────────────────────── */
  window.iosShareItem = function (title, text, url) {
    if (navigator.share) {
      navigator.share({
        title: title || document.title,
        text: text || '',
        url: url || location.href
      }).catch(function () {});
    } else {
      try {
        navigator.clipboard.writeText(url || location.href);
        // brief toast
        var toast = document.getElementById('undoToast');
        var msg = document.getElementById('undoMessage');
        if (toast && msg) {
          msg.textContent = 'Link copied!';
          toast.classList.add('visible');
          setTimeout(function () { toast.classList.remove('visible'); }, 2000);
        }
      } catch (_) {}
    }
  };

  /* ──────────────────────────────────────────────────────────
     9.  Wire everything up after DOM is ready
     ────────────────────────────────────────────────────────── */
  function _init() {
    _initPageTransitions();
    _initSidebar();
    _initBottomSheets();
    _initPullToRefresh();
    _initBadgeAPI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    // DOM already ready (deferred script)
    _init();
  }

})();
