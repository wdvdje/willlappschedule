/**
 * ios-native.js — iOS 26 / iPadOS 26 / macOS native-feel enhancements
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
     2.  Haptic feedback wrapper — iOS 26 richer patterns
     ────────────────────────────────────────────────────────── */
  function haptic(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern || [10]);
    } catch (_) {}
  }

  // Semantic haptic helpers (mirrors iOS impact/notification feedback)
  var haptics = {
    light:    function () { haptic([8]); },
    medium:   function () { haptic([14]); },
    heavy:    function () { haptic([22]); },
    success:  function () { haptic([10, 40, 10]); },
    warning:  function () { haptic([20, 30, 20]); },
    error:    function () { haptic([30, 20, 30, 20, 30]); },
    select:   function () { haptic([6]); },
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest(
      'button, a.r-item, a.sidebar-item, .day, .bucket-header,' +
      ' .chore-tpl-item, .dv-event-block, .cal-add-type-btn'
    );
    if (el) haptics.light();
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
          // Only animate once per show; the data attribute prevents
          // an infinite loop (animationend removes the class which
          // would re-trigger the observer).
          if (el.dataset.pageAnimated) return;
          el.dataset.pageAnimated = '1';
          el.classList.add('page-animating');
          el.addEventListener('animationend', function onEnd() {
            el.classList.remove('page-animating');
            el.removeEventListener('animationend', onEnd);
          });
        } else if (el.classList.contains('hidden')) {
          // Reset flag when page is hidden so the next show animates
          delete el.dataset.pageAnimated;
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
        haptics.select();
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
    panel.style.transition = 'transform 0.30s cubic-bezier(0.22,1,0.36,1), opacity 0.24s ease';
    panel.style.transform = 'translateY(100%) scale(0.98)';
    panel.style.opacity = '0.6';
    setTimeout(function () {
      panel.style.transition = '';
      panel.style.transform = '';
      panel.style.opacity = '';
      callback();
    }, 300);
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
        haptics.light();
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
        haptics.light();
        _animateSheetOut(panel, function () {
          panel.style.transform = '';
          closeHide();
        });
      } else {
        // Snap back with spring
        panel.style.transition = 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)';
        panel.style.transform = '';
        setTimeout(function () { panel.style.transition = ''; }, 350);
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
        haptics.medium();
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
          haptics.success();
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
    window.addEventListener('app:data:updated', _updateBadge);
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
     9.  In-app notification banner (iOS 26 Live Notification style)
         Shown when a notification fires while the app is in the foreground.
     ────────────────────────────────────────────────────────── */
  var _bannerEl = null;
  var _bannerTimer = null;

  function _getBanner() {
    if (_bannerEl) return _bannerEl;
    _bannerEl = document.createElement('div');
    _bannerEl.className = 'ios-notif-banner';
    _bannerEl.setAttribute('role', 'alert');
    _bannerEl.setAttribute('aria-live', 'assertive');
    _bannerEl.innerHTML =
      '<div class="ios-notif-banner-icon">📅</div>' +
      '<div class="ios-notif-banner-body">' +
        '<div class="ios-notif-banner-title"></div>' +
        '<div class="ios-notif-banner-text"></div>' +
      '</div>';
    document.body.appendChild(_bannerEl);
    _bannerEl.addEventListener('click', function () {
      _hideBanner();
    });
    return _bannerEl;
  }

  function _showBanner(title, body, emoji, url) {
    var banner = _getBanner();
    banner.querySelector('.ios-notif-banner-icon').textContent = emoji || '📅';
    banner.querySelector('.ios-notif-banner-title').textContent = title || 'Reminder';
    banner.querySelector('.ios-notif-banner-text').textContent = body || '';
    if (url) banner.dataset.url = url;

    banner.classList.remove('hiding');
    banner.classList.add('visible');

    if (_bannerTimer) clearTimeout(_bannerTimer);
    _bannerTimer = setTimeout(_hideBanner, 4500);

    haptics.success();
  }

  function _hideBanner() {
    if (!_bannerEl) return;
    _bannerEl.classList.add('hiding');
    _bannerEl.classList.remove('visible');
    if (_bannerTimer) { clearTimeout(_bannerTimer); _bannerTimer = null; }
    setTimeout(function () {
      if (_bannerEl) _bannerEl.classList.remove('hiding');
    }, 320);
  }

  // Expose so notifications.js can call it
  window.iosShowBanner = _showBanner;

  /* ──────────────────────────────────────────────────────────
     10. Swipe-back navigation gesture (iOS 26 edge swipe)
         Single-finger swipe from left edge navigates back in view history.
     ────────────────────────────────────────────────────────── */
  function _initSwipeBack() {
    var _startX = 0;
    var _startY = 0;
    var _active = false;
    var EDGE_ZONE = 28;    // px from left edge to trigger
    var THRESHOLD  = 80;   // horizontal swipe needed

    document.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      if (t.clientX < EDGE_ZONE) {
        _startX = t.clientX;
        _startY = t.clientY;
        _active = true;
      } else {
        _active = false;
      }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (!_active) return;
      _active = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - _startX;
      var dy = Math.abs(t.clientY - _startY);
      if (dx > THRESHOLD && dy < 60) {
        haptics.light();
        history.back();
      }
    }, { passive: true });
  }

  /* ──────────────────────────────────────────────────────────
     11. iOS push notification permission prompt
         Shown once to guide users to enable notifications.
         Only displayed when running as a standalone PWA on iOS 16.4+.
     ────────────────────────────────────────────────────────── */
  function _isStandalonePWA() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      navigator.standalone === true
    );
  }

  function _initPushPrompt() {
    // Only show if: notifications supported, permission not yet decided, running as PWA
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    if (!_isStandalonePWA()) return;
    // Don't nag more than once per session
    if (sessionStorage.getItem('pushPromptShown')) return;
    sessionStorage.setItem('pushPromptShown', '1');

    // Show the prompt banner after 3 seconds
    setTimeout(function () {
      _showBanner(
        'Enable Notifications',
        'Tap to allow reminders & event alerts.',
        '🔔',
        null
      );
      if (_bannerEl) {
        _bannerEl.addEventListener('click', function _onClick() {
          _bannerEl.removeEventListener('click', _onClick);
          Notification.requestPermission().then(function (perm) {
            if (perm === 'granted') {
              _showBanner('Notifications On', 'You\'ll get reminders for events & tasks.', '✅', null);
              // Register SW for push if not yet done
              try {
                if (window.pushClient) window.pushClient.registerSW();
              } catch (_) {}
            }
          }).catch(function () {});
        });
      }
    }, 3000);
  }

  /* ──────────────────────────────────────────────────────────
     12. iPad: adjust sidebar for orientation changes
     ────────────────────────────────────────────────────────── */
  function _initOrientationHandling() {
    var mq = window.matchMedia && window.matchMedia('(min-width: 768px)');
    if (!mq) return;

    function _onResize() {
      var sidebar = document.getElementById('desktopSidebar');
      if (!sidebar) return;
      // On very narrow widths (landscape phone), keep sidebar hidden via CSS
      // The CSS already handles this, but we dispatch an event for the app to react
      window.dispatchEvent(new CustomEvent('ios:layout:changed', {
        detail: { isWide: mq.matches }
      }));
    }

    if (mq.addEventListener) mq.addEventListener('change', _onResize);
    // Also listen for actual resize (handles Split View on iPad)
    window.addEventListener('resize', _onResize, { passive: true });
  }

  /* ──────────────────────────────────────────────────────────
     13. Wire everything up after DOM is ready
     ────────────────────────────────────────────────────────── */
  function _init() {
    _initPageTransitions();
    _initSidebar();
    _initBottomSheets();
    _initPullToRefresh();
    _initBadgeAPI();
    _initSwipeBack();
    _initPushPrompt();
    _initOrientationHandling();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    // DOM already ready (deferred script)
    _init();
  }

})();
