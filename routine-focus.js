/**
 * routine-focus.js — Full-Screen Focus Mode for Daily Routines
 *
 * Features:
 *   1. Full-screen overlay showing the current routine step prominently
 *   2. Countdown timer per step (respects the step's duration field)
 *   3. Tap / keyboard shortcut to complete and advance to next step
 *   4. Swipe-left gesture to advance, swipe-right to go back
 *   5. Overall phase progress bar across the top
 *   6. Snooze (+5 min) and skip buttons
 *   7. Audio/vibration cue when a step timer completes
 *   8. Exposed as window.routineFocus so other scripts can call open()
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Storage helpers (same keys used by desktop-personal.js / app.js)
  // ---------------------------------------------------------------------------
  function sp(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  function sk(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function getPhases() {
    var r = sp('personalRoutines', {});
    if (r.phases && Array.isArray(r.phases) && r.phases.length > 0) return r.phases;
    var phases = [];
    ['morning', 'evening'].forEach(function (period) {
      var steps = r[period] || [];
      if (!steps.length) return;
      phases.push({
        id: period,
        name: period === 'morning' ? 'Morning' : 'Evening',
        emoji: period === 'morning' ? '🌅' : '🌙',
        startTime: period === 'morning' ? '06:30' : '21:00',
        steps: steps.map(function (s) {
          return typeof s === 'string' ? { text: s, duration: 0, notes: '' } : s;
        })
      });
    });
    return phases;
  }

  function getRouLog() { return sp('personalRoutineLog', {}); }
  function setRouLog(v) { sk('personalRoutineLog', v); }

  function getStepDoneArr(phaseId) {
    var t = todayISO(), log = getRouLog();
    return (log[t] && log[t][phaseId]) ? log[t][phaseId] : [];
  }

  function markStepDone(phaseId, stepIdx) {
    var t = todayISO(), log = getRouLog();
    if (!log[t]) log[t] = {};
    if (!log[t][phaseId]) log[t][phaseId] = [];
    if (log[t][phaseId].indexOf(stepIdx) < 0) log[t][phaseId].push(stepIdx);
    setRouLog(log);
  }

  function markStepUndone(phaseId, stepIdx) {
    var t = todayISO(), log = getRouLog();
    if (!log[t] || !log[t][phaseId]) return;
    log[t][phaseId] = log[t][phaseId].filter(function (i) { return i !== stepIdx; });
    setRouLog(log);
  }

  // ---------------------------------------------------------------------------
  // Module state
  // ---------------------------------------------------------------------------
  var _phaseIdx  = 0;   // which phase is active
  var _stepIdx   = 0;   // which step within the phase is active
  var _timerSec  = 0;   // countdown remaining in seconds
  var _timerInterval = null;
  var _phases    = [];

  // ---------------------------------------------------------------------------
  // Audio cue (simple beep via Web Audio API)
  // ---------------------------------------------------------------------------
  function beep() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (_) {}
    try { if (navigator.vibrate) navigator.vibrate([100, 50, 100]); } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Build the focus overlay DOM (backdrop + slide-up sheet)
  // ---------------------------------------------------------------------------
  function buildOverlay() {
    /* Backdrop — dimmed scrim so user can see the app is still behind */
    var backdrop = document.createElement('div');
    backdrop.id = 'routineFocusBackdrop';
    backdrop.addEventListener('click', close);
    document.body.appendChild(backdrop);

    /* Sheet — slides up from the bottom */
    var overlay = document.createElement('div');
    overlay.id = 'routineFocusOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Routine Focus Mode');

    /* Drag handle bar for visual cue */
    var handle = document.createElement('div');
    handle.className = 'rf-drag-handle';
    overlay.appendChild(handle);

    /* Close on Escape */
    overlay._keyHandler = function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); advance(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goBack(); }
    };
    document.addEventListener('keydown', overlay._keyHandler);

    /* Swipe support */
    var _touchStartX = 0;
    overlay.addEventListener('touchstart', function (e) {
      _touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    overlay.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - _touchStartX;
      if (Math.abs(dx) > 60) {
        if (dx < 0) advance();
        else goBack();
      }
    }, { passive: true });

    document.body.appendChild(overlay);
    return overlay;
  }

  function getOverlay() { return document.getElementById('routineFocusOverlay'); }
  function getBackdrop() { return document.getElementById('routineFocusBackdrop'); }

  // ---------------------------------------------------------------------------
  // Render current state into the overlay
  // ---------------------------------------------------------------------------
  function render() {
    var overlay = getOverlay();
    if (!overlay) return;

    var phase = _phases[_phaseIdx];
    if (!phase) { close(); return; }

    var steps      = phase.steps || [];
    var doneArr    = getStepDoneArr(phase.id);
    var totalSteps = steps.length;
    var doneCount  = doneArr.filter(function (i) { return i < totalSteps; }).length;
    var pct        = totalSteps > 0 ? Math.round(doneCount / totalSteps * 100) : 0;
    var step       = steps[_stepIdx] || null;

    overlay.innerHTML = '';

    /* Restore the drag handle after clearing innerHTML */
    var handle = document.createElement('div');
    handle.className = 'rf-drag-handle';
    overlay.appendChild(handle);

    /* ---- top bar ---- */
    var topBar = document.createElement('div');
    topBar.className = 'rf-top-bar';

    /* Focus mode badge — makes it immediately obvious this is a Focus overlay */
    var modeBadge = document.createElement('div');
    modeBadge.className = 'rf-mode-badge';
    modeBadge.textContent = '🎯 Focus Mode';
    topBar.appendChild(modeBadge);

    var progressTrack = document.createElement('div');
    progressTrack.className = 'rf-progress-track';
    var progressFill = document.createElement('div');
    progressFill.className = 'rf-progress-fill';
    progressFill.style.width = pct + '%';
    progressTrack.appendChild(progressFill);
    topBar.appendChild(progressTrack);

    var phaseLabel = document.createElement('div');
    phaseLabel.className = 'rf-phase-label';
    phaseLabel.textContent = (phase.emoji || '') + ' ' + (phase.name || 'Routine');
    topBar.appendChild(phaseLabel);

    var stepCounter = document.createElement('div');
    stepCounter.className = 'rf-step-counter';
    stepCounter.textContent = doneCount + ' / ' + totalSteps + ' done';
    topBar.appendChild(stepCounter);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'rf-close-btn';
    closeBtn.innerHTML = '✕ <span style="font-size:0.7rem;opacity:0.7">Exit Focus</span>';
    closeBtn.setAttribute('aria-label', 'Close Focus Mode');
    closeBtn.addEventListener('click', close);
    topBar.appendChild(closeBtn);

    overlay.appendChild(topBar);

    /* ---- phase selector (if multiple phases) ---- */
    if (_phases.length > 1) {
      var phaseTabs = document.createElement('div');
      phaseTabs.className = 'rf-phase-tabs';
      _phases.forEach(function (ph, pi) {
        var tab = document.createElement('button');
        tab.className = 'rf-phase-tab' + (pi === _phaseIdx ? ' active' : '');
        tab.textContent = (ph.emoji || '') + ' ' + ph.name;
        tab.addEventListener('click', function () {
          _phaseIdx = pi;
          _stepIdx  = findFirstUndoneStep(_phases[pi]);
          stopTimer();
          startTimerForCurrentStep();
          render();
        });
        phaseTabs.appendChild(tab);
      });
      overlay.appendChild(phaseTabs);
    }

    /* ---- step list (compact) ---- */
    var stepList = document.createElement('div');
    stepList.className = 'rf-step-list';
    steps.forEach(function (s, si) {
      var isDone = doneArr.indexOf(si) >= 0;
      var isActive = si === _stepIdx;
      var row = document.createElement('div');
      row.className = 'rf-step-row' + (isDone ? ' done' : '') + (isActive ? ' active' : '');
      var dot = document.createElement('span');
      dot.className = 'rf-step-dot';
      dot.textContent = isDone ? '✓' : (isActive ? '▶' : '○');
      var txt = document.createElement('span');
      txt.className = 'rf-step-row-text';
      txt.textContent = s.text || '';
      row.appendChild(dot);
      row.appendChild(txt);
      if (s.duration > 0) {
        var dur = document.createElement('span');
        dur.className = 'rf-step-row-dur';
        dur.textContent = s.duration + 'm';
        row.appendChild(dur);
      }
      row.addEventListener('click', function () {
        _stepIdx = si;
        stopTimer();
        startTimerForCurrentStep();
        render();
      });
      stepList.appendChild(row);
    });
    overlay.appendChild(stepList);

    /* ---- main step card ---- */
    var card = document.createElement('div');
    card.className = 'rf-step-card';

    if (step) {
      var stepEmoji = document.createElement('div');
      stepEmoji.className = 'rf-step-emoji';
      stepEmoji.textContent = step.emoji || '🔹';
      card.appendChild(stepEmoji);

      var stepText = document.createElement('div');
      stepText.className = 'rf-step-title';
      stepText.textContent = step.text || '';
      card.appendChild(stepText);

      if (step.notes) {
        var notesEl = document.createElement('div');
        notesEl.className = 'rf-step-notes';
        notesEl.textContent = step.notes;
        card.appendChild(notesEl);
      }

      /* sub-tasks */
      if (step.subTasks && step.subTasks.length) {
        var subList = document.createElement('div');
        subList.className = 'rf-subtask-list';
        var t = todayISO(), log = getRouLog();
        var subDone = ((log[t] && log[t][phase.id + '_sub_' + _stepIdx]) || []);
        step.subTasks.forEach(function (st, sti) {
          var subRow = document.createElement('label');
          subRow.className = 'rf-subtask-row';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = subDone.indexOf(sti) >= 0;
          cb.addEventListener('change', function () {
            var l = getRouLog();
            var key = phase.id + '_sub_' + _stepIdx;
            if (!l[t]) l[t] = {};
            if (!l[t][key]) l[t][key] = [];
            if (cb.checked) {
              if (l[t][key].indexOf(sti) < 0) l[t][key].push(sti);
            } else {
              l[t][key] = l[t][key].filter(function (i) { return i !== sti; });
            }
            setRouLog(l);
          });
          subRow.appendChild(cb);
          subRow.appendChild(document.createTextNode(st));
          subList.appendChild(subRow);
        });
        card.appendChild(subList);
      }

      /* timer display */
      var timerWrap = document.createElement('div');
      timerWrap.className = 'rf-timer-wrap';
      var timerDisplay = document.createElement('div');
      timerDisplay.id = 'rfTimerDisplay';
      timerDisplay.className = 'rf-timer-display';
      timerDisplay.textContent = _timerSec > 0 ? formatTimer(_timerSec) : (step.duration > 0 ? formatTimer(step.duration * 60) : '');
      timerWrap.appendChild(timerDisplay);

      if (step.duration > 0 && _timerSec <= 0) {
        var startTimerBtn = document.createElement('button');
        startTimerBtn.className = 'rf-timer-start-btn';
        startTimerBtn.textContent = '▶ Start Timer';
        startTimerBtn.addEventListener('click', function () {
          _timerSec = step.duration * 60;
          startTimerTick();
          render();
        });
        timerWrap.appendChild(startTimerBtn);
      }

      if (_timerSec > 0) {
        var snoozeBtn = document.createElement('button');
        snoozeBtn.className = 'rf-snooze-btn';
        snoozeBtn.textContent = '+5 min';
        snoozeBtn.title = 'Snooze 5 minutes';
        snoozeBtn.addEventListener('click', function () {
          _timerSec += 300;
          updateTimerDisplay();
        });
        timerWrap.appendChild(snoozeBtn);
      }
      card.appendChild(timerWrap);
    } else {
      /* All steps done */
      var doneMsg = document.createElement('div');
      doneMsg.className = 'rf-all-done';
      doneMsg.innerHTML = '<span style="font-size:3rem">🎉</span><br>All steps complete!';
      card.appendChild(doneMsg);
    }

    overlay.appendChild(card);

    /* ---- action buttons ---- */
    var actions = document.createElement('div');
    actions.className = 'rf-actions';

    var backBtn = document.createElement('button');
    backBtn.className = 'rf-back-btn';
    backBtn.textContent = '← Back';
    backBtn.disabled = (_stepIdx === 0 && _phaseIdx === 0);
    backBtn.addEventListener('click', goBack);
    actions.appendChild(backBtn);

    if (step) {
      var isDone = doneArr.indexOf(_stepIdx) >= 0;
      var doneBtn = document.createElement('button');
      doneBtn.className = 'rf-done-btn' + (isDone ? ' undone' : '');
      doneBtn.textContent = isDone ? '↩ Mark Undone' : '✓ Done';
      doneBtn.addEventListener('click', function () {
        if (isDone) markStepUndone(phase.id, _stepIdx);
        else        markStepDone(phase.id, _stepIdx);
        stopTimer();
        if (!isDone) {
          /* advance to next undone step automatically */
          var nextIdx = findNextUndoneStep(steps, _stepIdx + 1, getStepDoneArr(phase.id));
          if (nextIdx !== -1) {
            _stepIdx = nextIdx;
            startTimerForCurrentStep();
          }
        }
        render();
        /* Notify other parts of the app */
        window.dispatchEvent(new CustomEvent('app:data:updated'));
      });
      actions.appendChild(doneBtn);

      var skipBtn = document.createElement('button');
      skipBtn.className = 'rf-skip-btn';
      skipBtn.textContent = 'Skip →';
      skipBtn.addEventListener('click', function () {
        advance();
      });
      actions.appendChild(skipBtn);
    }

    overlay.appendChild(actions);

    /* ---- hint text ---- */
    var hint = document.createElement('div');
    hint.className = 'rf-hint';
    hint.textContent = 'Swipe left/right or use ← → keys to navigate • Esc to close';
    overlay.appendChild(hint);
  }

  // ---------------------------------------------------------------------------
  // Timer helpers
  // ---------------------------------------------------------------------------
  function formatTimer(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return p2(m) + ':' + p2(s);
  }

  function updateTimerDisplay() {
    var el = document.getElementById('rfTimerDisplay');
    if (el) el.textContent = _timerSec > 0 ? formatTimer(_timerSec) : '00:00';
  }

  function startTimerTick() {
    stopTimer();
    _timerInterval = setInterval(function () {
      if (_timerSec > 0) {
        _timerSec--;
        updateTimerDisplay();
        if (_timerSec === 0) {
          beep();
          stopTimer();
          render(); /* re-render to show Start Timer button again */
        }
      }
    }, 1000);
  }

  function stopTimer() {
    if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  }

  function startTimerForCurrentStep() {
    stopTimer();
    _timerSec = 0;
    var phase = _phases[_phaseIdx];
    if (!phase) return;
    var step = (phase.steps || [])[_stepIdx];
    if (step && step.duration > 0) {
      /* Auto-start if step has a duration */
      _timerSec = step.duration * 60;
      startTimerTick();
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------
  function findFirstUndoneStep(phase) {
    var steps = phase.steps || [];
    var doneArr = getStepDoneArr(phase.id);
    for (var i = 0; i < steps.length; i++) {
      if (doneArr.indexOf(i) < 0) return i;
    }
    return 0; // all done – start at beginning
  }

  function findNextUndoneStep(steps, fromIdx, doneArr) {
    for (var i = fromIdx; i < steps.length; i++) {
      if (doneArr.indexOf(i) < 0) return i;
    }
    return -1;
  }

  function advance() {
    var phase = _phases[_phaseIdx];
    if (!phase) return;
    var steps = phase.steps || [];
    stopTimer();
    if (_stepIdx < steps.length - 1) {
      _stepIdx++;
      startTimerForCurrentStep();
    } else if (_phaseIdx < _phases.length - 1) {
      /* Move to next phase */
      _phaseIdx++;
      _stepIdx = findFirstUndoneStep(_phases[_phaseIdx]);
      startTimerForCurrentStep();
    }
    render();
  }

  function goBack() {
    stopTimer();
    if (_stepIdx > 0) {
      _stepIdx--;
    } else if (_phaseIdx > 0) {
      _phaseIdx--;
      _stepIdx = (_phases[_phaseIdx].steps || []).length - 1;
      if (_stepIdx < 0) _stepIdx = 0;
    }
    startTimerForCurrentStep();
    render();
  }

  // ---------------------------------------------------------------------------
  // Open / close
  // ---------------------------------------------------------------------------
  function open(opts) {
    opts = opts || {};
    /* Remove any existing overlay and backdrop */
    var existing = getOverlay();
    if (existing) existing.remove();
    var existingBd = getBackdrop();
    if (existingBd) existingBd.remove();

    _phases = getPhases();

    /* Filter to today's active phases if day-of-week scheduling is in effect */
    var todayDow = new Date().getDay();
    _phases = _phases.filter(function (ph) {
      if (!ph.days || !ph.days.length) return true;
      return ph.days.indexOf(todayDow) >= 0;
    });

    if (!_phases.length) {
      alert('No routine phases scheduled for today. Set up your routine in the Personal page.');
      return;
    }

    /* Start at the requested phase/step or find the first undone step */
    _phaseIdx = Math.max(0, Math.min(opts.phaseIdx || 0, _phases.length - 1));
    if (typeof opts.stepIdx === 'number') {
      _stepIdx = opts.stepIdx;
    } else {
      _stepIdx = findFirstUndoneStep(_phases[_phaseIdx]);
    }

    stopTimer();
    buildOverlay();
    startTimerForCurrentStep();
    render();

    /* Prevent body scroll */
    document.body.style.overflow = 'hidden';
  }

  function close() {
    stopTimer();
    var overlay = getOverlay();
    if (overlay) {
      if (overlay._keyHandler) document.removeEventListener('keydown', overlay._keyHandler);
      overlay.remove();
    }
    var backdrop = getBackdrop();
    if (backdrop) backdrop.remove();
    document.body.style.overflow = '';
    /* Refresh any routine widgets that are visible */
    window.dispatchEvent(new CustomEvent('app:data:updated'));
  }

  // ---------------------------------------------------------------------------
  // Inject styles
  // ---------------------------------------------------------------------------
  var STYLES = [
    /* Backdrop — dimmed scrim so app is visibly behind the sheet */
    '#routineFocusBackdrop {',
    '  position: fixed; inset: 0; z-index: 9999;',
    '  background: rgba(0,0,0,0.55); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);',
    '  animation: rfBackdropIn 0.25s ease forwards;',
    '}',
    '@keyframes rfBackdropIn {',
    '  from { opacity: 0; }',
    '  to   { opacity: 1; }',
    '}',
    /* Sheet — slides up from bottom, leaving rounded top corners */
    '#routineFocusOverlay {',
    '  position: fixed; left: 0; right: 0; bottom: 0; z-index: 10000;',
    '  max-height: 92vh;',
    '  background: linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%);',
    '  color: #fff; display: flex; flex-direction: column;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '  border-radius: 20px 20px 0 0;',
    '  overflow-y: auto; -webkit-overflow-scrolling: touch;',
    '  box-shadow: 0 -8px 40px rgba(0,0,0,0.45);',
    '  animation: rfSheetIn 0.32s cubic-bezier(0.32, 0.72, 0, 1) forwards;',
    '}',
    '@keyframes rfSheetIn {',
    '  from { transform: translateY(100%); }',
    '  to   { transform: translateY(0); }',
    '}',
    /* Drag handle pill at the top of the sheet */
    '.rf-drag-handle {',
    '  width: 40px; height: 5px; background: rgba(255,255,255,0.25);',
    '  border-radius: 3px; margin: 10px auto 2px; flex-shrink: 0;',
    '}',
    '.rf-top-bar {',
    '  display: flex; align-items: center; gap: 8px;',
    '  padding: 6px 16px 8px; flex-shrink: 0; flex-wrap: wrap;',
    '}',
    /* Mode badge — immediately signals what this panel is */
    '.rf-mode-badge {',
    '  background: rgba(74,144,226,0.25); border: 1px solid rgba(74,144,226,0.5);',
    '  color: #7eb8f7; border-radius: 20px; padding: 3px 10px;',
    '  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.03em;',
    '  white-space: nowrap; flex-shrink: 0;',
    '}',
    '.rf-progress-track {',
    '  flex: 1; height: 6px; background: rgba(255,255,255,0.15); border-radius: 3px; overflow: hidden;',
    '  min-width: 60px;',
    '}',
    '.rf-progress-fill {',
    '  height: 100%; background: linear-gradient(90deg, #4a90e2, #7b68ee); border-radius: 3px;',
    '  transition: width 0.4s ease;',
    '}',
    '.rf-phase-label { font-size: 0.85rem; font-weight: 700; opacity: 0.9; white-space: nowrap; }',
    '.rf-step-counter { font-size: 0.75rem; opacity: 0.65; white-space: nowrap; }',
    '.rf-close-btn {',
    '  background: rgba(255,255,255,0.12); border: none; color: #fff;',
    '  height: 32px; border-radius: 16px; padding: 0 12px; cursor: pointer;',
    '  font-size: 0.88rem; display: flex; align-items: center; gap: 4px;',
    '  flex-shrink: 0; transition: background 0.2s; white-space: nowrap;',
    '}',
    '.rf-close-btn:hover { background: rgba(255,255,255,0.25); }',
    '.rf-phase-tabs {',
    '  display: flex; gap: 8px; padding: 4px 16px 8px; overflow-x: auto;',
    '  -webkit-overflow-scrolling: touch; flex-shrink: 0;',
    '}',
    '.rf-phase-tab {',
    '  background: rgba(255,255,255,0.08); border: 1.5px solid rgba(255,255,255,0.15);',
    '  color: rgba(255,255,255,0.75); border-radius: 20px; padding: 5px 14px;',
    '  font-size: 0.8rem; cursor: pointer; white-space: nowrap; transition: all 0.2s;',
    '}',
    '.rf-phase-tab.active, .rf-phase-tab:hover {',
    '  background: rgba(74,144,226,0.35); border-color: #4a90e2; color: #fff;',
    '}',
    '.rf-step-list {',
    '  display: flex; flex-direction: column; gap: 4px;',
    '  padding: 0 16px 8px; flex-shrink: 0; max-height: 140px; overflow-y: auto;',
    '}',
    '.rf-step-row {',
    '  display: flex; align-items: center; gap: 8px; padding: 6px 10px;',
    '  border-radius: 8px; cursor: pointer; transition: background 0.2s;',
    '  font-size: 0.82rem; opacity: 0.65;',
    '}',
    '.rf-step-row:hover { background: rgba(255,255,255,0.08); opacity: 1; }',
    '.rf-step-row.active { background: rgba(74,144,226,0.25); opacity: 1; font-weight: 600; }',
    '.rf-step-row.done { opacity: 0.4; text-decoration: line-through; }',
    '.rf-step-dot { width: 18px; flex-shrink: 0; text-align: center; }',
    '.rf-step-row-text { flex: 1; }',
    '.rf-step-row-dur { font-size: 0.72rem; opacity: 0.7; }',
    '.rf-step-card {',
    '  flex: 1; display: flex; flex-direction: column; align-items: center;',
    '  justify-content: center; padding: 20px 24px; text-align: center; min-height: 180px;',
    '}',
    '.rf-step-emoji { font-size: 3rem; margin-bottom: 12px; }',
    '.rf-step-title {',
    '  font-size: clamp(1.4rem, 5vw, 2.2rem); font-weight: 700;',
    '  line-height: 1.25; margin-bottom: 10px; max-width: 500px;',
    '}',
    '.rf-step-notes {',
    '  font-size: 0.9rem; opacity: 0.7; max-width: 420px; margin-bottom: 12px;',
    '  background: rgba(255,255,255,0.07); border-radius: 8px; padding: 8px 12px;',
    '}',
    '.rf-subtask-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }',
    '.rf-subtask-row {',
    '  display: flex; align-items: center; gap: 8px; font-size: 0.85rem;',
    '  background: rgba(255,255,255,0.07); border-radius: 8px; padding: 6px 12px;',
    '  cursor: pointer;',
    '}',
    '.rf-subtask-row input[type="checkbox"] { accent-color: #4a90e2; width: 16px; height: 16px; }',
    '.rf-timer-wrap {',
    '  display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 8px;',
    '}',
    '.rf-timer-display {',
    '  font-size: clamp(2rem, 8vw, 3.5rem); font-weight: 800; font-variant-numeric: tabular-nums;',
    '  letter-spacing: 0.04em; color: #7eb8f7;',
    '}',
    '.rf-timer-start-btn {',
    '  background: rgba(74,144,226,0.3); border: 1.5px solid #4a90e2; color: #fff;',
    '  border-radius: 20px; padding: 6px 18px; font-size: 0.85rem; cursor: pointer;',
    '  transition: background 0.2s;',
    '}',
    '.rf-timer-start-btn:hover { background: rgba(74,144,226,0.55); }',
    '.rf-snooze-btn {',
    '  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);',
    '  color: rgba(255,255,255,0.8); border-radius: 16px; padding: 4px 12px;',
    '  font-size: 0.78rem; cursor: pointer; transition: background 0.2s;',
    '}',
    '.rf-snooze-btn:hover { background: rgba(255,255,255,0.2); }',
    '.rf-all-done { font-size: 1.3rem; font-weight: 700; opacity: 0.9; }',
    '.rf-actions {',
    '  display: flex; justify-content: center; gap: 12px; padding: 12px 16px;',
    '  flex-shrink: 0;',
    '}',
    '.rf-back-btn, .rf-skip-btn {',
    '  background: rgba(255,255,255,0.1); border: 1.5px solid rgba(255,255,255,0.2);',
    '  color: #fff; border-radius: 24px; padding: 10px 22px;',
    '  font-size: 0.9rem; cursor: pointer; transition: background 0.2s;',
    '}',
    '.rf-back-btn:disabled { opacity: 0.3; cursor: default; }',
    '.rf-back-btn:not(:disabled):hover, .rf-skip-btn:hover { background: rgba(255,255,255,0.2); }',
    '.rf-done-btn {',
    '  background: linear-gradient(135deg, #27ae60, #2ecc71); border: none;',
    '  color: #fff; border-radius: 24px; padding: 10px 32px;',
    '  font-size: 1rem; font-weight: 700; cursor: pointer; transition: transform 0.15s, opacity 0.2s;',
    '}',
    '.rf-done-btn:hover { transform: scale(1.04); }',
    '.rf-done-btn.undone { background: linear-gradient(135deg, #e74c3c, #c0392b); }',
    '.rf-hint {',
    '  text-align: center; font-size: 0.72rem; opacity: 0.35;',
    '  padding: 4px 16px 14px; flex-shrink: 0;',
    '}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('routineFocusStyles')) return;
    var el = document.createElement('style');
    el.id = 'routineFocusStyles';
    el.textContent = STYLES;
    document.head.appendChild(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  window.routineFocus = {
    open: open,
    close: close
  };

})();
