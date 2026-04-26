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
     navigator.vibrate() is not supported on iOS and silently fails.
     Fallback: Web Audio API micro-click (short oscillator burst) which
     can trigger the Taptic Engine on iOS Safari.  A second fallback
     applies a CSS :active visual-proxy class so there is always some
     tactile cue even when audio is blocked.
     ────────────────────────────────────────────────────────── */
  var _audioCtx = null;

  // Lazily create AudioContext on first user gesture so browsers allow it
  function _getAudioCtx() {
    if (_audioCtx) return _audioCtx;
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {}
    return _audioCtx;
  }

  /**
   * Play a micro-click tone through Web Audio.
   * @param {number} freq     Oscillator frequency in Hz
   * @param {number} duration Burst length in seconds
   * @param {number} gain     Peak amplitude (0–1)
   */
  function _audioTick(freq, duration, gain) {
    var ctx = _getAudioCtx();
    if (!ctx) return;
    try {
      // Resume context if it was suspended (autoplay policy)
      if (ctx.state === 'suspended') ctx.resume();

      var osc = ctx.createOscillator();
      var amp = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      amp.gain.setValueAtTime(0, ctx.currentTime);
      amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + duration * 0.1);
      amp.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (_) {}
  }

  /**
   * Core haptic driver.
   * Tries navigator.vibrate (Android/some browsers) first.
   * Falls back to Web Audio micro-click on iOS Safari.
   *
   * @param {number[]} pattern  vibrate pattern in ms
   * @param {number}   freq     Web Audio frequency (Hz)
   * @param {number}   duration Web Audio burst (s)
   * @param {number}   gain     Web Audio amplitude (0–1)
   */
  function haptic(pattern, freq, duration, gain) {
    var vibrated = false;
    try {
      if (navigator.vibrate) {
        navigator.vibrate(pattern || [10]);
        vibrated = true;
      }
    } catch (_) {}

    // iOS: navigator.vibrate is undefined — use audio micro-click instead
    if (!vibrated) {
      _audioTick(freq || 800, duration || 0.012, gain || 0.04);
    }
  }

  // Semantic haptic helpers (mirrors iOS UIImpactFeedbackGenerator patterns)
  var haptics = {
    light:   function () { haptic([8],                    800, 0.008, 0.04); },
    medium:  function () { haptic([14],                   440, 0.014, 0.07); },
    heavy:   function () { haptic([22],                   200, 0.022, 0.12); },
    success: function () { haptic([10, 40, 10],           600, 0.010, 0.05);
                           setTimeout(function () { _audioTick(900, 0.008, 0.04); }, 55); },
    warning: function () { haptic([20, 30, 20],           300, 0.020, 0.09); },
    error:   function () { haptic([30, 20, 30, 20, 30],  180, 0.030, 0.14); },
    select:  function () { haptic([6],                    1000, 0.006, 0.03); },
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest(
      'button, a.r-item, a.sidebar-item, .day, .bucket-header,' +
      ' .chore-tpl-item, .dv-event-block, .cal-add-type-btn, .more-sheet-item'
    );
    if (el) haptics.light();
  }, { passive: true });

  /* ──────────────────────────────────────────────────────────
     3.  Page transition animations (MutationObserver approach)
     Works without touching the existing router.
     Used only when the View Transitions API is unavailable (§3b).
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
     3b. View Transitions API — GPU-composited page transitions
     Safari 18+ / Chrome 111+.  Falls back to §3 when unavailable.
     Monkey-patches window.showView so the existing SPA router
     automatically benefits with no other code changes required.
     Returns true when VT is wired up (§3 is then skipped).
     ────────────────────────────────────────────────────────── */
  function _initViewTransitions() {
    if (!document.startViewTransition) return false;

    var _orig = window.showView;
    if (typeof _orig !== 'function') return false;

    window.showView = function (view, updateHash) {
      var transition = document.startViewTransition(function () {
        _orig.call(window, view, updateHash);
      });
      // Suppress rejections caused by rapid navigation interrupting a running transition
      transition.ready.catch(function () {});
      transition.finished.catch(function () {});
    };

    return true;
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
    _setupSheet('catModal', ':scope > div', function () {
      var modal = document.getElementById('catModal');
      if (modal) modal.classList.add('hidden');
    });

    // jobModal — closed by JS
    _setupSheet('jobModal', ':scope > div', function () {
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
     13. Search island button — opens global search modal
     ────────────────────────────────────────────────────────── */
  function _initSearchIsland() {
    var btn = document.getElementById('tabSearchIslandBtn');
    if (!btn) return;

    btn.addEventListener('click', function () {
      haptics.light();
      if (typeof window.openSearch === 'function') {
        window.openSearch();
      } else {
        // Fallback: show the modal directly if app.js hasn't loaded yet
        var modal = document.getElementById('searchModal');
        var inp   = document.getElementById('searchInput');
        if (modal) { modal.style.display = 'flex'; }
        if (inp)   { inp.value = ''; inp.focus(); }
      }
    });
  }

  /* ──────────────────────────────────────────────────────────
     14. Scroll edge effects — toggle body classes based on
         scroll position so the CSS mask fades work correctly.
         When at the very top, remove top fade (nothing above).
         When at the very bottom, remove bottom fade (nothing below).
     ────────────────────────────────────────────────────────── */
  function _initScrollEdgeEffects() {
    var THRESHOLD = 4; // px tolerance

    function _updateEdges() {
      var scrollEl = document.scrollingElement || document.documentElement;
      var atTop    = scrollEl.scrollTop <= THRESHOLD;
      var atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - THRESHOLD;

      document.body.classList.toggle('scroll-edge-top-off', atTop);
      document.body.classList.toggle('scroll-edge-bottom-off', atBottom);
    }

    // Run immediately and on scroll
    _updateEdges();
    window.addEventListener('scroll', _updateEdges, { passive: true });

    // Re-check when pages switch (content height changes)
    window.addEventListener('hashchange', function () {
      requestAnimationFrame(_updateEdges);
    });
    window.addEventListener('app:data:updated', function () {
      requestAnimationFrame(_updateEdges);
    });
  }

  /* ──────────────────────────────────────────────────────────
     16. More sheet — secondary navigation for the mobile tab bar
         Opens/closes via the "More ⋯" tab button.
         Items navigate to their section and close the sheet.
     ────────────────────────────────────────────────────────── */
  function _initMoreSheet() {
    var sheet   = document.getElementById('moreSheet');
    var moreBtn = document.getElementById('moreTabBtn');
    if (!sheet) return;

    var panel = sheet.querySelector('.more-sheet-panel');

    // Keep active state on More sheet items in sync with current view
    function _updateMoreActive() {
      var view = (location.hash || '#today').replace('#', '') || 'today';
      sheet.querySelectorAll('.more-sheet-item[data-view]').forEach(function (item) {
        item.classList.toggle('active', item.dataset.view === view);
      });
    }

    function _closeSheet() {
      if (sheet.classList.contains('hidden')) return;
      // Animate panel down before hiding
      if (panel) {
        panel.style.transition = 'transform 0.28s cubic-bezier(0.22,1,0.36,1), opacity 0.22s ease';
        panel.style.transform  = 'translateY(100%) scale(0.98)';
        panel.style.opacity    = '0.6';
        setTimeout(function () {
          panel.style.transition = '';
          panel.style.transform  = '';
          panel.style.opacity    = '';
          sheet.classList.add('hidden');
        }, 280);
      } else {
        sheet.classList.add('hidden');
      }
      if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
    }

    // Close on backdrop click
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet) {
        haptics.light();
        _closeSheet();
      }
    });

    // Navigate when a More item is tapped
    sheet.querySelectorAll('.more-sheet-item[data-view]').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        haptics.select();
        var view = item.dataset.view || 'today';
        _closeSheet();
        // Small delay (60 ms) so the sheet close animation has started visually
        // before the SPA router swaps the page content — prevents a jarring flash
        // where the new page appears beneath the still-open sheet.
        setTimeout(function () {
          if (location.hash.replace('#', '') !== view) {
            location.hash = view;
          }
          window.dispatchEvent(new Event('hashchange'));
        }, 60);
      });
    });

    // Drag-to-dismiss on the panel
    if (panel) {
      var _startY = 0, _dragging = false;
      panel.addEventListener('touchstart', function (e) {
        var rect  = panel.getBoundingClientRect();
        var touch = e.touches[0];
        if (touch.clientY - rect.top < 60) {
          _startY   = touch.clientY;
          _dragging = true;
        }
      }, { passive: true });
      panel.addEventListener('touchmove', function (e) {
        if (!_dragging) return;
        var dy = e.touches[0].clientY - _startY;
        if (dy > 0) {
          panel.style.transform  = 'translateY(' + dy + 'px)';
          panel.style.transition = 'none';
        }
      }, { passive: true });
      panel.addEventListener('touchend', function (e) {
        if (!_dragging) return;
        _dragging = false;
        var dy = e.changedTouches[0].clientY - _startY;
        panel.style.transition = '';
        if (dy > 90) {
          haptics.light();
          _closeSheet();
        } else {
          panel.style.transition = 'transform 0.32s cubic-bezier(0.34,1.56,0.64,1)';
          panel.style.transform  = '';
          setTimeout(function () { panel.style.transition = ''; }, 320);
        }
      }, { passive: true });
    }

    window.addEventListener('hashchange', _updateMoreActive);
    _updateMoreActive();
  }

  /* ──────────────────────────────────────────────────────────
     16b. iPadOS 26 Floating Top Navigation pill — replaced.
          Kept as empty stub to avoid reference errors in case
          any external code calls window._initIpadTopNav.
     ────────────────────────────────────────────────────────── */
  function _initIpadTopNav() { /* no-op — replaced by sidebar + More sheet */ }

  /* ──────────────────────────────────────────────────────────
     17. HTML5 Drag and Drop for bucket / task items
         Attaches draggable behaviour to .bucket-item elements.
         Fires ios:dnd:reorder custom event for the app to handle.
     ────────────────────────────────────────────────────────── */
  function _initDragAndDrop() {
    function _attachDnD(container) {
      if (!container) return;
      container.querySelectorAll('.bucket-item').forEach(function (item) {
        if (item.dataset.dndInit) return;
        item.dataset.dndInit = '1';
        item.setAttribute('draggable', 'true');

        item.addEventListener('dragstart', function (e) {
          e.dataTransfer.effectAllowed = 'move';
          // Carry the element's position index so the app can reorder
          var siblings = Array.from(item.parentNode.querySelectorAll('.bucket-item'));
          e.dataTransfer.setData('text/plain', String(siblings.indexOf(item)));
          e.dataTransfer.setData('application/x-timescape-dnd', 'bucket-item');
          item.classList.add('dnd-dragging');
          haptics.light();
        });

        item.addEventListener('dragend', function () {
          item.classList.remove('dnd-dragging');
          document.querySelectorAll('.dnd-over').forEach(function (el) {
            el.classList.remove('dnd-over');
          });
        });

        item.addEventListener('dragover', function (e) {
          if (!e.dataTransfer.types.includes('application/x-timescape-dnd')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          item.classList.add('dnd-over');
        });

        item.addEventListener('dragleave', function () {
          item.classList.remove('dnd-over');
        });

        item.addEventListener('drop', function (e) {
          e.preventDefault();
          item.classList.remove('dnd-over');
          var srcIdx = e.dataTransfer.getData('text/plain');
          var siblings = Array.from(item.parentNode.querySelectorAll('.bucket-item'));
          var tgtIdx = siblings.indexOf(item);
          if (srcIdx !== '' && String(tgtIdx) !== srcIdx) {
            window.dispatchEvent(new CustomEvent('ios:dnd:reorder', {
              detail: { sourceIndex: parseInt(srcIdx, 10), targetIndex: tgtIdx,
                        container: item.parentNode }
            }));
            haptics.success();
          }
        });
      });
    }

    // Attach to any bucket-body elements added dynamically
    var _dndObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.classList && node.classList.contains('bucket-body')) {
            _attachDnD(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('.bucket-body').forEach(_attachDnD);
          }
        });
      });
    });
    _dndObserver.observe(document.body, { childList: true, subtree: true });

    // Attach to existing elements
    document.querySelectorAll('.bucket-body').forEach(_attachDnD);
  }

  /* ──────────────────────────────────────────────────────────
     18. Custom context menus (right-click / long-press)
         Replaces long-presses with native-style popover menus
         for calendar day cells and task/bucket items.
     ────────────────────────────────────────────────────────── */
  function _initContextMenus() {
    var _menu = null;

    function _getMenu() {
      if (_menu) return _menu;
      _menu = document.createElement('div');
      _menu.className = 'ios-context-menu';
      _menu.setAttribute('role', 'menu');
      document.body.appendChild(_menu);

      // Close on outside pointer-down
      document.addEventListener('mousedown', function (e) {
        if (_menu && !_menu.contains(e.target)) _hideMenu();
      }, true);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') _hideMenu();
      });
      return _menu;
    }

    function _hideMenu() {
      if (!_menu) return;
      _menu.classList.remove('visible');
    }

    function _showMenu(x, y, items) {
      var menu = _getMenu();
      menu.innerHTML = '';
      items.forEach(function (item) {
        if (item.separator) {
          var sep = document.createElement('div');
          sep.className = 'ios-ctx-separator';
          menu.appendChild(sep);
          return;
        }
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ios-ctx-item' + (item.danger ? ' danger' : '');
        btn.setAttribute('role', 'menuitem');
        btn.innerHTML = '<span style="flex-shrink:0">' + (item.icon || '') + '</span>' +
                        '<span>' + (item.label || '') + '</span>';
        btn.addEventListener('click', function () {
          _hideMenu();
          if (typeof item.action === 'function') item.action();
          haptics.light();
        });
        menu.appendChild(btn);
      });

      // Position within viewport
      menu.style.left = '0';
      menu.style.top = '0';
      menu.classList.add('visible');
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var w = menu.offsetWidth || 200;
      var h = menu.offsetHeight || 120;
      menu.style.left = Math.max(8, Math.min(x, vw - w - 8)) + 'px';
      menu.style.top  = Math.max(8, Math.min(y, vh - h - 8)) + 'px';
    }

    document.addEventListener('contextmenu', function (e) {
      // ── Calendar day cell ──────────────────────────────────
      var day = e.target.closest('.day[data-date]');
      if (!day) {
        // Fallback: day cells may store the date in a child element
        var cell = e.target.closest('.day');
        if (cell) {
          var num = cell.querySelector('.day-number');
          if (num) day = cell;
        }
      }
      if (day) {
        e.preventDefault();
        var date = day.dataset.date || '';
        _showMenu(e.clientX, e.clientY, [
          {
            icon: '+', label: 'New Event',
            action: function () {
              var inp = document.getElementById('quickAddInput');
              if (inp) {
                inp.value = date ? 'Event on ' + date + ' ' : '';
                inp.focus();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }
          },
          {
            icon: '✅', label: 'New Task',
            action: function () {
              var inp = document.getElementById('quickAddInput');
              if (inp) {
                inp.value = date ? 'Task on ' + date + ' ' : '';
                inp.focus();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }
          },
          { separator: true },
          {
            icon: '📋', label: 'View Day',
            action: function () { if (day.click) day.click(); }
          }
        ]);
        return;
      }

      // ── Bucket / task list item ────────────────────────────
      var bucketItem = e.target.closest('.bucket-item');
      if (bucketItem) {
        e.preventDefault();
        _showMenu(e.clientX, e.clientY, [
          {
            icon: '✏️', label: 'Edit',
            action: function () {
              // Prefer a button with data-action="edit", then any .small-btn
              var btn = bucketItem.querySelector('[data-action="edit"]') ||
                        bucketItem.querySelector('.small-btn');
              if (btn) btn.click();
            }
          },
          { separator: true },
          {
            icon: '🗑️', label: 'Delete', danger: true,
            action: function () {
              // Prefer a button with data-action="delete" or aria-label containing "delete"
              var btn = bucketItem.querySelector('[data-action="delete"]') ||
                        bucketItem.querySelector('[aria-label*="elete"]') ||
                        bucketItem.querySelector('[title*="elete"]');
              if (!btn) {
                // Fall back to last button in the item row (conventional placement)
                var btns = bucketItem.querySelectorAll('button');
                if (btns.length) btn = btns[btns.length - 1];
              }
              if (btn) btn.click();
            }
          }
        ]);
      }
    });
  }

  /* ──────────────────────────────────────────────────────────
     19. Magic Keyboard shortcuts (Cmd+N = new item)
         Complements the existing Ctrl+P (command palette) and
         Ctrl+K (search) shortcuts already in desktop-calendar.js.
     ────────────────────────────────────────────────────────── */
  function _initIPadKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      // Skip if focus is in a text field or contenteditable element
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.activeElement && document.activeElement.isContentEditable) return;

      var meta = e.metaKey || e.ctrlKey;

      // Cmd+N / Ctrl+N — focus quick-add input (new item)
      if (meta && e.key === 'n') {
        e.preventDefault();
        var inp = document.getElementById('quickAddInput');
        if (inp) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          // Small delay to let scroll settle before focusing
          setTimeout(function () { inp.focus(); inp.select(); }, 80);
        }
        return;
      }

      // Cmd+, / Ctrl+, — open Settings
      if (meta && e.key === ',') {
        e.preventDefault();
        location.hash = 'settings';
        window.dispatchEvent(new Event('hashchange'));
      }
    });
  }

  /* ──────────────────────────────────────────────────────────
     15. Wire everything up after DOM is ready
     ────────────────────────────────────────────────────────── */
  function _init() {
    // §3b: View Transitions API; §3 MutationObserver is the fallback
    var vtActive = _initViewTransitions();
    if (!vtActive) _initPageTransitions();
    _initSidebar();
    _initBottomSheets();
    _initPullToRefresh();
    _initBadgeAPI();
    _initSwipeBack();
    _initPushPrompt();
    _initOrientationHandling();
    _initSearchIsland();
    _initScrollEdgeEffects();
    _initMoreSheet();          /* replaces old _initIpadTopNav */
    _initDragAndDrop();
    _initContextMenus();
    _initIPadKeyboardShortcuts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    // DOM already ready (deferred script)
    _init();
  }

})();
