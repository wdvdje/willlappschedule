/**
 * desktop-personal.js — Advanced enhancements for the Personal page.
 *
 * Patches window.renderPersonalWidgets() to replace the compact widgets
 * for Meal Planner, Daily Routine, and Gym Planner with richer advanced
 * variants on all screen sizes.  On mobile the same advanced widgets are
 * rendered in a single-column layout with mobile-friendly CSS overrides
 * defined in index.html.
 *
 * Features:
 *   1. Meal Planner  — Full-week 7-column grid, drag-and-drop, favorites sidebar,
 *                      weekly nutrition summary sparkline, meal prep checklist.
 *   2. Daily Routine — Multi-phase visual timeline, progress rings, drag-to-reorder
 *                      steps, phase management, 28-day heatmap.
 *   3. Gym Planner   — Split-panel layout, weekly schedule board, per-set tracker,
 *                      progressive overload sparkline, configurable rest timer,
 *                      workout volume/duration stats.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Breakpoint helper (kept for any future per-feature gating)
  // ---------------------------------------------------------------------------
  function isDesktop() {
    return window.matchMedia('(min-width: 901px)').matches;
  }

  // ---------------------------------------------------------------------------
  // Storage helpers (mirrors desktop.js conventions)
  // ---------------------------------------------------------------------------
  function sp(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  function sk(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  // ---------------------------------------------------------------------------
  // Data accessors
  // ---------------------------------------------------------------------------
  function getMeals()       { return sp('personalMeals', {}); }
  function setMeals(v)      { sk('personalMeals', v); }
  function getGoal()        { return parseInt(localStorage.getItem('personalCalorieGoal') || '2000', 10); }
  function getFavs()        { return sp('personalMealFavorites', []); }
  function setFavs(v)       { sk('personalMealFavorites', v); }
  function getRoutines()    { return sp('personalRoutines', { morning: [], evening: [] }); }
  function setRoutines(v)   { sk('personalRoutines', v); }
  function getRouLog()      { return sp('personalRoutineLog', {}); }
  function setRouLog(v)     { sk('personalRoutineLog', v); }
  function getGym()         { return sp('personalGym', { routines: [], log: {} }); }
  function setGym(v)        { sk('personalGym', v); }
  function getPrepLog()     { return sp('personalMealPrepLog', {}); }
  function setPrepLog(v)    { sk('personalMealPrepLog', v); }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function p2(n) { return n < 10 ? '0' + n : '' + n; }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Returns array of {iso, short, label, isToday} for Sun–Sat of the current week. */
  function weekDays() {
    var now = new Date(), dow = now.getDay();
    var sun = new Date(now);
    sun.setDate(now.getDate() - dow);
    var t = todayISO(), days = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(sun);
      d.setDate(sun.getDate() + i);
      var iso = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
      days.push({ iso: iso, short: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][i],
                  label: p2(d.getMonth() + 1) + '/' + p2(d.getDate()), isToday: iso === t });
    }
    return days;
  }

  /** Returns array of ISO date strings for the last n days (oldest first). */
  function pastDays(n) {
    var out = [], base = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(base);
      d.setDate(base.getDate() - i);
      out.push(d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()));
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Routine phase data helpers (forward-/backward-compatible)
  // ---------------------------------------------------------------------------

  /**
   * Returns phases array.  If the stored routine still uses the old
   * { morning: [], evening: [] } shape, it is transparently migrated.
   */
  function getPhases() {
    var r = getRoutines();
    if (r.phases && Array.isArray(r.phases) && r.phases.length > 0) return r.phases;
    var phases = [];
    ['morning', 'evening'].forEach(function (period) {
      var steps = r[period] || [];
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

  /**
   * Persists phases and also keeps the legacy morning/evening keys in sync
   * so the mobile widget still works when not on desktop.
   */
  function savePhases(phases) {
    var r = getRoutines();
    r.phases = phases;
    var morn = phases.find(function (p) { return p.id === 'morning'; });
    var eve  = phases.find(function (p) { return p.id === 'evening'; });
    r.morning = morn ? morn.steps.map(function (s) { return typeof s === 'string' ? s : (s.text || ''); }) : (r.morning || []);
    r.evening = eve  ? eve.steps.map(function (s) { return typeof s === 'string' ? s : (s.text || ''); }) : (r.evening || []);
    setRoutines(r);
  }

  /** Mark/unmark a step index as done for today in the given phase. */
  function toggleStepDone(phaseId, stepIdx, checked) {
    var t = todayISO(), log = getRouLog();
    if (!log[t]) log[t] = {};
    if (!log[t][phaseId]) log[t][phaseId] = [];
    var arr = log[t][phaseId];
    if (checked) {
      if (arr.indexOf(stepIdx) < 0) arr.push(stepIdx);
    } else {
      log[t][phaseId] = arr.filter(function (i) { return i !== stepIdx; });
    }
    setRouLog(log);
  }

  // ---------------------------------------------------------------------------
  // Module state
  // ---------------------------------------------------------------------------
  var _gymSelectedIdx  = 0;     // currently selected routine in gym split panel
  var _gymSetsDone     = {};    // { 'ri_ei': [setNums completed] }  — survives re-renders
  var _restTimer       = null;  // { interval, remaining, total }
  var _restDuration    = 60;    // seconds (user-configurable)
  var _mealDragSrc     = null;  // meal slot drag source
  var _routineDragSrc  = null;  // routine node drag source

  // ---------------------------------------------------------------------------
  // SHARED HELPERS
  // ---------------------------------------------------------------------------

  /** Build a minimal progress ring SVG. */
  function progressRing(pct, size, color) {
    var r = (size - 6) / 2;
    var circ = 2 * Math.PI * r;
    var dash = Math.max(0, Math.min(1, pct / 100)) * circ;
    var cx = size / 2, cy = size / 2;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    var bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', r);
    bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', '#eee'); bg.setAttribute('stroke-width', '4');
    var fg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    fg.setAttribute('cx', cx); fg.setAttribute('cy', cy); fg.setAttribute('r', r);
    fg.setAttribute('fill', 'none'); fg.setAttribute('stroke', color); fg.setAttribute('stroke-width', '4');
    fg.setAttribute('stroke-dasharray', dash + ' ' + (circ - dash));
    fg.setAttribute('stroke-linecap', 'round');
    fg.setAttribute('transform', 'rotate(-90 ' + cx + ' ' + cy + ')');
    var txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', cx); txt.setAttribute('y', cy);
    txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'central');
    txt.setAttribute('font-size', Math.round(size * 0.27)); txt.setAttribute('font-weight', '700');
    txt.setAttribute('fill', pct >= 100 ? color : '#555');
    txt.textContent = pct + '%';
    svg.appendChild(bg); svg.appendChild(fg); svg.appendChild(txt);
    return svg;
  }

  /** Build a pw-card with a collapsible header (matches app.js buildPWCard). */
  function makePwCard(id, storageKey, headerHTML, buildBodyFn) {
    var card = document.createElement('div');
    card.className = 'pw-card';
    card.id = id;

    var collapsed = sp(storageKey + '_collapsed', false);
    var header = document.createElement('div');
    header.className = 'pw-header';
    header.innerHTML = headerHTML + '<span class="pw-chevron">' + (collapsed ? '▸' : '▾') + '</span>';
    card.appendChild(header);

    var body = document.createElement('div');
    body.className = 'pw-body';
    body.style.display = collapsed ? 'none' : '';
    buildBodyFn(body);
    card.appendChild(body);

    header.addEventListener('click', function () {
      var now = body.style.display === 'none';
      body.style.display = now ? '' : 'none';
      header.querySelector('.pw-chevron').textContent = now ? '▾' : '▸';
      sk(storageKey + '_collapsed', !now);
    });
    return card;
  }

  // ===========================================================================
  //  1.  MEAL PLANNER
  // ===========================================================================

  var MEAL_TYPES = [
    { key: 'breakfast', icon: '🌅', label: 'Breakfast', color: '#f39c12' },
    { key: 'lunch',     icon: '☀️',  label: 'Lunch',     color: '#27ae60' },
    { key: 'dinner',    icon: '🌙',  label: 'Dinner',    color: '#9b59b6' },
    { key: 'snacks',    icon: '🍎',  label: 'Snacks',    color: '#e74c3c' }
  ];

  function renderDeskMeal() {
    var section = document.getElementById('personalMealSection');
    if (!section) return;
    section.innerHTML = '';

    var allMeals = getMeals();
    var goal     = getGoal();
    var favs     = getFavs();
    var days     = weekDays();

    var card = makePwCard('mealCard', 'pw_meal',
      '<div class="pw-header-title">🍽️ Meal Planner</div>' +
      '<span style="font-size:0.75rem;color:#888;margin-right:6px">Weekly View</span>',
      function (body) {
        // Nutrition summary
        body.appendChild(buildMealSummary(days, allMeals, goal));

        // Grid + sidebar layout
        var layout = document.createElement('div');
        layout.className = 'dmeal-layout';

        var gridWrap = document.createElement('div');
        gridWrap.className = 'dmeal-grid-wrap';

        // 7-column week grid
        var grid = document.createElement('div');
        grid.className = 'dmeal-week-grid';
        days.forEach(function (wd) {
          grid.appendChild(buildMealDayCol(wd, allMeals, goal));
        });
        gridWrap.appendChild(grid);

        // Prep checklist (collapsible)
        var prepToggle = document.createElement('button');
        prepToggle.className = 'dmeal-prep-toggle';
        prepToggle.textContent = '🛒 Show Meal Prep Checklist';
        var prepPanel = buildMealPrepPanel(days, allMeals);
        prepPanel.style.display = 'none';
        prepToggle.addEventListener('click', function () {
          var vis = prepPanel.style.display !== 'none';
          prepPanel.style.display = vis ? 'none' : '';
          prepToggle.textContent = vis ? '🛒 Show Meal Prep Checklist' : '🛒 Hide Meal Prep Checklist';
        });
        gridWrap.appendChild(prepToggle);
        gridWrap.appendChild(prepPanel);

        layout.appendChild(gridWrap);
        layout.appendChild(buildMealFavSidebar(favs));

        body.appendChild(layout);

        // Goal row
        var goalRow = document.createElement('div');
        goalRow.className = 'meal-goal-row';
        goalRow.style.marginTop = '8px';
        goalRow.innerHTML =
          '<span>🎯 Daily goal:</span>' +
          '<input type="number" class="meal-goal-input" value="' + goal + '" min="0" step="50" />' +
          '<span>cal</span>';
        goalRow.querySelector('input').addEventListener('change', function (e) {
          localStorage.setItem('personalCalorieGoal', String(parseInt(e.target.value, 10) || 2000));
          renderDeskMeal();
        });
        body.appendChild(goalRow);
      });

    section.appendChild(card);
  }

  // ---- Meal sub-builders ----

  function buildMealSummary(days, allMeals, goal) {
    var dayCals = days.map(function (wd) {
      var day = allMeals[wd.iso];
      if (!day) return 0;
      return MEAL_TYPES.reduce(function (s, mt) { return s + (parseInt((day[mt.key] || {}).calories, 10) || 0); }, 0);
    });
    var total   = dayCals.reduce(function (a, b) { return a + b; }, 0);
    var avg     = Math.round(total / 7);
    var weekGoal = goal * 7;
    var maxCal  = Math.max.apply(null, dayCals.concat([1]));

    var el = document.createElement('div');
    el.className = 'dmeal-summary';
    el.innerHTML =
      '<div class="dmeal-summary-stat"><div class="dmeal-summary-val">' + total + '</div><div class="dmeal-summary-lbl">Total cal</div></div>' +
      '<div class="dmeal-summary-stat"><div class="dmeal-summary-val">' + avg + '</div><div class="dmeal-summary-lbl">Avg/day</div></div>' +
      '<div class="dmeal-summary-stat"><div class="dmeal-summary-val">' + weekGoal + '</div><div class="dmeal-summary-lbl">Week goal</div></div>';

    var spark = document.createElement('div');
    spark.className = 'dmeal-spark';
    dayCals.forEach(function (cal, i) {
      var pct   = cal / maxCal;
      var color = cal > goal ? '#e74c3c' : cal >= goal * 0.8 ? '#27ae60' : '#4a90e2';
      var bar   = document.createElement('div');
      bar.className = 'dmeal-spark-bar';
      bar.style.height     = Math.max(3, Math.round(pct * 28)) + 'px';
      bar.style.background = color;
      bar.title            = days[i].short + ': ' + cal + ' cal';
      spark.appendChild(bar);
    });
    el.appendChild(spark);
    return el;
  }

  function buildMealDayCol(wd, allMeals, goal) {
    var col = document.createElement('div');
    col.className = 'dmeal-day-col';

    var hdr = document.createElement('div');
    hdr.className = 'dmeal-day-header' + (wd.isToday ? ' today' : '');
    hdr.innerHTML = esc(wd.short) + '<span class="dmeal-date">' + esc(wd.label) + '</span>';
    col.appendChild(hdr);

    var dayMeals  = allMeals[wd.iso] || {};
    var totalCal  = 0;
    MEAL_TYPES.forEach(function (mt) {
      var m = dayMeals[mt.key] || { name: '', calories: 0 };
      totalCal += parseInt(m.calories, 10) || 0;
      col.appendChild(buildMealSlot(wd, mt, m));
    });

    var pct   = goal > 0 ? Math.min(100, Math.round((totalCal / goal) * 100)) : 0;
    var color = totalCal > goal ? '#e74c3c' : totalCal >= goal * 0.8 ? '#27ae60' : '#4a90e2';
    var bar   = document.createElement('div');
    bar.className = 'dmeal-cal-bar';
    bar.title     = totalCal + ' cal (' + pct + '%)';
    bar.innerHTML = '<div class="dmeal-cal-bar-fill" style="width:' + pct + '%;background:' + color + '"></div>';
    col.appendChild(bar);
    return col;
  }

  function buildMealSlot(wd, mt, m) {
    var slot = document.createElement('div');
    slot.className = 'dmeal-slot' + (m.name ? '' : ' empty');
    if (m.name) slot.style.borderTop = '2px solid ' + mt.color;

    if (m.name) {
      slot.innerHTML =
        '<div class="dmeal-slot-icon">' + mt.icon + '</div>' +
        '<div class="dmeal-slot-name">' + esc(m.name) + '</div>' +
        '<div class="dmeal-slot-cal">' + (m.calories ? m.calories + ' cal' : '—') + '</div>';
    } else {
      slot.innerHTML = '<div class="dmeal-slot-add">＋</div>';
    }

    // Click → edit popover
    slot.addEventListener('click', function () {
      var existing = document.querySelector('.dmeal-edit-popover');
      if (existing) { existing.remove(); return; }
      openMealEditPopover(slot, wd.iso, mt, m);
    });

    // Drag source
    if (m.name) {
      slot.draggable = true;
      slot.addEventListener('dragstart', function (e) {
        _mealDragSrc = { date: wd.iso, mealKey: mt.key, mealData: m };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify(_mealDragSrc));
        setTimeout(function () { slot.style.opacity = '0.45'; }, 0);
      });
      slot.addEventListener('dragend', function () {
        slot.style.opacity = '';
        _mealDragSrc = null;
      });
    }

    // Drop target
    slot.addEventListener('dragover', function (e) { e.preventDefault(); slot.classList.add('drag-over'); });
    slot.addEventListener('dragleave', function () { slot.classList.remove('drag-over'); });
    slot.addEventListener('drop', function (e) {
      e.preventDefault();
      slot.classList.remove('drag-over');
      var src = _mealDragSrc;
      if (!src) {
        try { src = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (_) { return; }
      }
      if (!src) return;
      var meals = getMeals();
      // Guard against prototype-polluting keys from drag data
      var ALLOWED_MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snacks'];
      if (src.isFav) {
        if (!meals[wd.iso]) meals[wd.iso] = {};
        meals[wd.iso][mt.key] = { name: src.mealData.name, calories: src.mealData.calories || 0 };
      } else {
        var srcDate = String(src.date || ''), srcKey = String(src.mealKey || '');
        // Only allow ISO date strings and known meal slot keys
        if (!/^\d{4}-\d{2}-\d{2}$/.test(srcDate)) return;
        if (ALLOWED_MEAL_KEYS.indexOf(srcKey) < 0) return;
        if (srcDate === wd.iso && srcKey === mt.key) return;
        if (!meals[srcDate]) meals[srcDate] = {};
        if (!meals[wd.iso])  meals[wd.iso]  = {};
        var tmp = meals[wd.iso][mt.key] || { name: '', calories: 0 };
        meals[wd.iso][mt.key] = meals[srcDate][srcKey] || { name: '', calories: 0 };
        meals[srcDate][srcKey] = tmp;
      }
      setMeals(meals);
      renderDeskMeal();
    });
    return slot;
  }

  function openMealEditPopover(slot, dateIso, mt, m) {
    var pop = document.createElement('div');
    pop.className = 'dmeal-edit-popover';

    var rect      = slot.getBoundingClientRect();
    var popWidth  = 210;
    var leftPos   = Math.min(rect.left, window.innerWidth - popWidth - 6);
    var topPos    = rect.bottom + 4;
    if (topPos + 140 > window.innerHeight) topPos = rect.top - 140;

    pop.style.top   = topPos + 'px';
    pop.style.left  = leftPos + 'px';
    pop.style.width = popWidth + 'px';

    var nameIn = document.createElement('input');
    nameIn.type        = 'text';
    nameIn.placeholder = mt.label + ' — what are you eating?';
    nameIn.value       = m.name || '';
    pop.appendChild(nameIn);

    var calIn = document.createElement('input');
    calIn.type        = 'number';
    calIn.placeholder = 'Calories';
    calIn.min         = '0';
    calIn.value       = m.calories || '';
    pop.appendChild(calIn);

    var btns = document.createElement('div');
    btns.className = 'dmeal-edit-popover-btns';

    var saveBtn = document.createElement('button');
    saveBtn.className   = 'dmeal-edit-save';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', function () {
      var meals = getMeals();
      if (!meals[dateIso]) meals[dateIso] = {};
      meals[dateIso][mt.key] = { name: nameIn.value.trim(), calories: parseInt(calIn.value, 10) || 0 };
      setMeals(meals);
      pop.remove();
      renderDeskMeal();
    });

    var cancelBtn = document.createElement('button');
    cancelBtn.className   = 'dmeal-edit-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () { pop.remove(); });

    var favBtn = document.createElement('button');
    favBtn.className   = 'dmeal-edit-fav';
    favBtn.textContent = '⭐';
    favBtn.title       = 'Save as favorite';
    favBtn.addEventListener('click', function () {
      var name = nameIn.value.trim() || m.name;
      var cal  = parseInt(calIn.value, 10) || m.calories || 0;
      if (!name) return;
      var fs = getFavs();
      if (!fs.some(function (f) { return f.name === name; })) {
        fs.push({ name: name, calories: cal });
        setFavs(fs);
      }
      favBtn.textContent = '✅';
      favBtn.disabled = true;
    });

    btns.appendChild(saveBtn);
    btns.appendChild(cancelBtn);
    btns.appendChild(favBtn);
    pop.appendChild(btns);

    document.body.appendChild(pop);
    nameIn.focus();

    nameIn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); saveBtn.click(); }
      if (e.key === 'Escape') { pop.remove(); }
    });

    setTimeout(function () {
      document.addEventListener('mousedown', function outside(ev) {
        if (!pop.contains(ev.target) && ev.target !== slot) {
          pop.remove();
          document.removeEventListener('mousedown', outside);
        }
      });
    }, 0);
  }

  function buildMealFavSidebar(favs) {
    var sidebar = document.createElement('div');
    sidebar.className = 'dmeal-fav-sidebar';

    var title = document.createElement('div');
    title.className   = 'dmeal-fav-title';
    title.textContent = '⭐ Favorites';
    sidebar.appendChild(title);

    if (!favs.length) {
      var empty = document.createElement('div');
      empty.className   = 'dmeal-fav-empty';
      empty.textContent = 'Tap ⭐ when editing a meal to save it here, then drag onto any slot.';
      sidebar.appendChild(empty);
    } else {
      favs.forEach(function (fav, fi) {
        var item = document.createElement('div');
        item.className = 'dmeal-fav-item';
        item.draggable = true;
        item.innerHTML =
          '<div class="dmeal-fav-name">' + esc(fav.name) + '</div>' +
          '<div class="dmeal-fav-cal">' + (fav.calories ? fav.calories + ' cal' : '') + '</div>' +
          '<button class="dmeal-fav-del" title="Remove">✕</button>';

        item.addEventListener('dragstart', function (e) {
          var src = { isFav: true, mealData: fav };
          _mealDragSrc = src;
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('text/plain', JSON.stringify(src));
        });
        item.addEventListener('dragend', function () { _mealDragSrc = null; });

        item.querySelector('.dmeal-fav-del').addEventListener('click', function (e) {
          e.stopPropagation();
          var fs = getFavs();
          fs.splice(fi, 1);
          setFavs(fs);
          renderDeskMeal();
        });
        sidebar.appendChild(item);
      });
    }

    // Add-to-favorites form
    var addWrap = document.createElement('div');
    addWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:6px;';
    var nameIn = document.createElement('input');
    nameIn.type        = 'text';
    nameIn.placeholder = 'Meal name';
    nameIn.style.cssText = 'font-size:0.75rem;border:1px solid #d8e0ec;border-radius:6px;padding:3px 6px;';
    var calIn = document.createElement('input');
    calIn.type        = 'number';
    calIn.placeholder = 'Calories';
    calIn.style.cssText = 'font-size:0.75rem;border:1px solid #d8e0ec;border-radius:6px;padding:3px 6px;';
    var addBtn = document.createElement('button');
    addBtn.className   = 'dmeal-fav-add-btn';
    addBtn.textContent = '＋ Save Favorite';
    addBtn.addEventListener('click', function () {
      var n = nameIn.value.trim();
      if (!n) return;
      var fs = getFavs();
      if (!fs.some(function (f) { return f.name === n; })) {
        fs.push({ name: n, calories: parseInt(calIn.value, 10) || 0 });
        setFavs(fs);
      }
      renderDeskMeal();
    });
    addWrap.appendChild(nameIn);
    addWrap.appendChild(calIn);
    addWrap.appendChild(addBtn);
    sidebar.appendChild(addWrap);
    return sidebar;
  }

  function buildMealPrepPanel(days, allMeals) {
    var panel    = document.createElement('div');
    panel.className = 'dmeal-prep-panel';
    var weekKey  = days[0].iso;
    var prepLog  = getPrepLog();
    var checked  = prepLog[weekKey] || {};
    var counts   = {};

    days.forEach(function (wd) {
      var day = allMeals[wd.iso];
      if (!day) return;
      MEAL_TYPES.forEach(function (mt) {
        var name = ((day[mt.key] || {}).name || '').trim();
        if (name) counts[name] = (counts[name] || 0) + 1;
      });
    });

    var items = Object.keys(counts);
    if (!items.length) {
      panel.innerHTML = '<div style="color:#aaa;font-size:0.82rem;text-align:center;padding:8px 0">Plan some meals to generate a prep list.</div>';
      return panel;
    }

    var heading = document.createElement('div');
    heading.style.cssText = 'font-weight:700;font-size:0.82rem;margin-bottom:8px;';
    heading.textContent = '🛒 This Week\'s Prep List';
    panel.appendChild(heading);

    items.slice().sort().forEach(function (name) {
      var row   = document.createElement('div');
      row.className = 'dmeal-prep-item';
      var cb    = document.createElement('input');
      cb.type   = 'checkbox';
      cb.checked = !!checked[name];
      cb.addEventListener('change', function () {
        var pl = getPrepLog();
        if (!pl[weekKey]) pl[weekKey] = {};
        pl[weekKey][name] = cb.checked;
        setPrepLog(pl);
        label.style.textDecoration = cb.checked ? 'line-through' : '';
        label.style.color          = cb.checked ? '#aaa' : '';
      });
      var label = document.createElement('span');
      label.textContent         = name;
      label.style.textDecoration = checked[name] ? 'line-through' : '';
      label.style.color          = checked[name] ? '#aaa' : '';
      var badge = document.createElement('span');
      badge.className   = 'dmeal-prep-count';
      if (counts[name] > 1) badge.textContent = '× ' + counts[name];

      var grocBtn = document.createElement('button');
      grocBtn.className = 'dmeal-prep-grocery-btn';
      grocBtn.textContent = '＋🛒';
      grocBtn.title = 'Add to Grocery List';
      grocBtn.setAttribute('aria-label', 'Add ' + name + ' to Grocery List');
      grocBtn.addEventListener('click', function () {
        var list = getGroceryList();
        var already = list.some(function (g) { return g.text === name; });
        if (already) {
          grocBtn.textContent = '✓';
          grocBtn.style.color = '#888';
          setTimeout(function () { grocBtn.textContent = '＋🛒'; grocBtn.style.color = ''; }, 1200);
          return;
        }
        list.push({ id: nextGroceryId(), text: name, qty: '', section: '', inCart: false, added: getTodayISO() });
        setGroceryList(list);
        if (typeof renderGroceryList === 'function') renderGroceryList();
        grocBtn.textContent = '✓ Added';
        grocBtn.style.color = '#27ae60';
        setTimeout(function () { grocBtn.textContent = '＋🛒'; grocBtn.style.color = ''; }, 1500);
      });

      row.appendChild(cb); row.appendChild(label); row.appendChild(badge); row.appendChild(grocBtn);
      panel.appendChild(row);
    });
    return panel;
  }

  // ===========================================================================
  //  2.  DAILY ROUTINE TIMELINE
  // ===========================================================================

  function renderDeskRoutine() {
    var section = document.getElementById('personalRoutineSection');
    if (!section) return;
    section.innerHTML = '';

    var phases   = getPhases();
    var t        = todayISO();
    var log      = getRouLog();

    var card = makePwCard('routineCard', 'pw_routine',
      '<div class="pw-header-title">📋 Daily Routines</div>' +
      '<span style="font-size:0.75rem;color:#888;margin-right:6px">Multi-phase Timeline</span>',
      function (body) {
        var phasesRow = document.createElement('div');
        phasesRow.className = 'droutine-phases';

        phases.forEach(function (phase, pi) {
          var phaseLog = (log[t] && log[t][phase.id]) ? log[t][phase.id] : [];
          phasesRow.appendChild(buildRoutinePhaseCol(phase, pi, phaseLog, phases));
        });

        // Add phase button
        var addBtn = document.createElement('div');
        addBtn.className = 'droutine-add-phase';
        addBtn.innerHTML = '<span style="font-size:1.3rem">＋</span><span>Add Phase</span>';
        addBtn.addEventListener('click', function () {
          var name = prompt('Phase name (e.g. "Midday Reset"):');
          if (!name || !name.trim()) return;
          var emoji = prompt('Emoji (optional):', '⏰') || '⏰';
          var start = prompt('Start time HH:MM (optional):', '12:00') || '';
          var ps = getPhases();
          ps.push({ id: 'phase_' + Date.now(), name: name.trim(), emoji: emoji.trim(), startTime: start.trim(), steps: [] });
          savePhases(ps);
          renderDeskRoutine();
        });
        phasesRow.appendChild(addBtn);
        body.appendChild(phasesRow);

        // 28-day heatmap
        body.appendChild(buildRoutineHeatmap(phases));
      });

    section.appendChild(card);
  }

  function buildRoutinePhaseCol(phase, pi, phaseLog, allPhases) {
    var col   = document.createElement('div');
    col.className = 'droutine-phase';
    var steps = phase.steps || [];

    var doneCount = phaseLog.filter(function (i) { return i < steps.length; }).length;
    var totalDur  = steps.reduce(function (s, st) { return s + (parseInt(st.duration, 10) || 0); }, 0);
    var pct       = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;

    // Phase header
    var hdr = document.createElement('div');
    hdr.className = 'droutine-phase-header';
    var ring = progressRing(pct, 34, '#9b59b6');
    ring.style.flexShrink = '0';
    hdr.appendChild(ring);

    var meta = document.createElement('div');
    meta.style.flex = '1';
    meta.innerHTML =
      '<div class="droutine-phase-name">' + esc((phase.emoji || '') + ' ' + phase.name) + '</div>' +
      '<div class="droutine-phase-meta">' +
        (totalDur ? '~' + totalDur + ' min' : '') +
        (phase.startTime ? (totalDur ? ' · ' : '') + phase.startTime : '') +
      '</div>';
    hdr.appendChild(meta);

    var menuBtn = document.createElement('button');
    menuBtn.className   = 'droutine-phase-menu-btn';
    menuBtn.textContent = '⋮';
    menuBtn.title       = 'Phase options';
    menuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      showPhaseMenu(phase, pi, allPhases, menuBtn);
    });
    hdr.appendChild(menuBtn);
    col.appendChild(hdr);

    // Phase body / timeline
    var phaseBody = document.createElement('div');
    phaseBody.className = 'droutine-phase-body';

    var timeline = document.createElement('div');
    timeline.className = 'droutine-timeline';

    steps.forEach(function (step, si) {
      var node = buildRoutineNode(step, si, phaseLog.indexOf(si) >= 0, pi, phase, allPhases);
      timeline.appendChild(node);
    });
    phaseBody.appendChild(timeline);

    // Add-step row
    var addRow = document.createElement('div');
    addRow.className = 'droutine-add-step';
    var stepIn = document.createElement('input');
    stepIn.type        = 'text';
    stepIn.placeholder = 'Add step…';
    stepIn.className   = 'droutine-step-name-in';
    var durIn = document.createElement('input');
    durIn.type        = 'number';
    durIn.placeholder = 'min';
    durIn.min         = '0';
    durIn.className   = 'droutine-dur-in';
    var addStepBtn = document.createElement('button');
    addStepBtn.textContent = '＋';
    var doAdd = function () {
      var text = stepIn.value.trim();
      if (!text) return;
      var ps = getPhases();
      if (!ps[pi].steps) ps[pi].steps = [];
      ps[pi].steps.push({ text: text, duration: parseInt(durIn.value, 10) || 0, notes: '' });
      savePhases(ps);
      renderDeskRoutine();
    };
    addStepBtn.addEventListener('click', doAdd);
    stepIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
    addRow.appendChild(stepIn); addRow.appendChild(durIn); addRow.appendChild(addStepBtn);
    phaseBody.appendChild(addRow);

    col.appendChild(phaseBody);
    return col;
  }

  function buildRoutineNode(step, si, isDone, pi, phase, allPhases) {
    var node = document.createElement('div');
    node.className = 'droutine-node' + (isDone ? ' done' : '');

    var dot = document.createElement('div');
    dot.className = 'droutine-node-dot';
    node.appendChild(dot);

    var card = document.createElement('div');
    card.className = 'droutine-node-card';

    var top = document.createElement('div');
    top.className = 'droutine-node-top';

    var handle = document.createElement('span');
    handle.className   = 'droutine-drag-handle';
    handle.textContent = '⠿';
    handle.title       = 'Drag to reorder';

    var cb = document.createElement('input');
    cb.type      = 'checkbox';
    cb.className = 'droutine-node-cb';
    cb.checked   = isDone;
    cb.addEventListener('change', function (e) {
      e.stopPropagation();
      toggleStepDone(phase.id, si, cb.checked);
      renderDeskRoutine();
    });

    var textEl = document.createElement('span');
    textEl.className   = 'droutine-node-text';
    textEl.textContent = step.text || '';

    var durEl = document.createElement('span');
    durEl.className = 'droutine-node-dur';
    if (step.duration > 0) durEl.textContent = step.duration + 'm';

    var delBtn = document.createElement('button');
    delBtn.className   = 'droutine-node-del';
    delBtn.textContent = '✕';
    delBtn.title       = 'Remove';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var ps = getPhases();
      ps[pi].steps.splice(si, 1);
      // Remap completion log indices
      var t = todayISO(), log = getRouLog();
      if (log[t] && log[t][phase.id]) {
        log[t][phase.id] = log[t][phase.id]
          .filter(function (i) { return i !== si; })
          .map(function (i) { return i > si ? i - 1 : i; });
        setRouLog(log);
      }
      savePhases(ps);
      renderDeskRoutine();
    });

    top.appendChild(handle); top.appendChild(cb); top.appendChild(textEl);
    top.appendChild(durEl); top.appendChild(delBtn);
    card.appendChild(top);

    if (step.notes) {
      var notes = document.createElement('div');
      notes.style.cssText = 'font-size:0.7rem;color:#888;margin-top:3px;padding-left:18px;';
      notes.textContent = step.notes;
      card.appendChild(notes);
    }
    node.appendChild(card);

    // Drag-and-drop reorder
    node.draggable = true;
    node.addEventListener('dragstart', function (e) {
      _routineDragSrc = { phaseIdx: pi, stepIdx: si };
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(function () { node.classList.add('drag-source'); }, 0);
    });
    node.addEventListener('dragend', function () {
      node.classList.remove('drag-source');
      _routineDragSrc = null;
    });
    node.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (_routineDragSrc) node.classList.add('drag-target');
    });
    node.addEventListener('dragleave', function () { node.classList.remove('drag-target'); });
    node.addEventListener('drop', function (e) {
      e.preventDefault();
      node.classList.remove('drag-target');
      var src = _routineDragSrc;
      if (!src || (src.phaseIdx === pi && src.stepIdx === si)) return;
      var ps = getPhases();
      var srcStep = ps[src.phaseIdx].steps.splice(src.stepIdx, 1)[0];
      // When moving within the same phase and the source came before the
      // destination, splicing out the source shifts all later indices down
      // by one — so we must decrement the destination index to compensate.
      var destIdx = (src.phaseIdx === pi && src.stepIdx < si) ? si - 1 : si;
      if (!ps[pi].steps) ps[pi].steps = [];
      ps[pi].steps.splice(destIdx, 0, srcStep);
      savePhases(ps);
      renderDeskRoutine();
    });

    return node;
  }

  function showPhaseMenu(phase, pi, allPhases, anchor) {
    var existing = document.getElementById('droutinePhaseMenu');
    if (existing) { existing.remove(); return; }

    var menu = document.createElement('div');
    menu.id = 'droutinePhaseMenu';
    menu.style.cssText =
      'position:fixed;background:#fff;border:1.5px solid #e0e6f0;border-radius:8px;' +
      'box-shadow:0 4px 18px rgba(0,0,0,0.14);z-index:1600;min-width:165px;overflow:hidden;';
    var rect = anchor.getBoundingClientRect();
    menu.style.top  = (rect.bottom + 4) + 'px';
    menu.style.left = Math.min(rect.left, window.innerWidth - 175) + 'px';

    [
      ['✏️ Rename',       function () {
        var n = prompt('Phase name:', phase.name);
        if (!n || !n.trim()) return;
        var ps = getPhases(); ps[pi].name = n.trim(); savePhases(ps); renderDeskRoutine();
      }],
      ['⏰ Set start time', function () {
        var t = prompt('Start time (HH:MM):', phase.startTime || '');
        if (t === null) return;
        var ps = getPhases(); ps[pi].startTime = t.trim(); savePhases(ps); renderDeskRoutine();
      }],
      ['🗑️ Delete phase', function () {
        if (!confirm('Delete "' + phase.name + '" and all its steps?')) return;
        var ps = getPhases(); ps.splice(pi, 1); savePhases(ps); renderDeskRoutine();
      }]
    ].forEach(function (pair) {
      var btn = document.createElement('button');
      btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 12px;background:none;border:none;' +
                          'border-bottom:1px solid #f0f0f0;cursor:pointer;font-size:0.82rem;';
      btn.textContent = pair[0];
      btn.addEventListener('mouseover', function () { btn.style.background = '#f0f6ff'; });
      btn.addEventListener('mouseout',  function () { btn.style.background = ''; });
      btn.addEventListener('click', function () { menu.remove(); pair[1](); });
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);

    setTimeout(function () {
      document.addEventListener('mousedown', function close(ev) {
        if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', close); }
      });
    }, 0);
  }

  function buildRoutineHeatmap(phases) {
    var wrap = document.createElement('div');
    wrap.className = 'droutine-heatmap';
    var title = document.createElement('div');
    title.className   = 'droutine-heatmap-title';
    title.textContent = '📅 28-Day Completion';
    wrap.appendChild(title);

    var grid = document.createElement('div');
    grid.className = 'droutine-heatmap-grid';
    var log  = getRouLog();
    var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    pastDays(28).forEach(function (dateISO) {
      var totalSteps = 0, totalDone = 0;
      phases.forEach(function (phase) {
        var sLen = (phase.steps || []).length;
        if (!sLen) return;
        totalSteps += sLen;
        var done = (log[dateISO] && log[dateISO][phase.id]) ? log[dateISO][phase.id] : [];
        totalDone += done.filter(function (i) { return i < sLen; }).length;
      });
      var pct  = totalSteps > 0 ? Math.round((totalDone / totalSteps) * 100) : 0;
      var cell = document.createElement('div');
      cell.className = 'droutine-heatmap-cell' +
        (pct === 0 ? '' : pct <= 25 ? ' lvl1' : pct <= 50 ? ' lvl2' : pct <= 75 ? ' lvl3' : ' lvl4');
      var d = new Date(dateISO + 'T00:00:00');
      cell.title = MONTHS[d.getMonth()] + ' ' + d.getDate() + ': ' + pct + '% done';
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  // ===========================================================================
  //  3.  GYM PLANNER
  // ===========================================================================

  var MUSCLE_COLORS = {
    'Chest': '#e74c3c', 'Back': '#3498db', 'Legs': '#27ae60',
    'Shoulders': '#9b59b6', 'Arms': '#f39c12', 'Core': '#1abc9c',
    'Glutes': '#e67e22', 'Cardio': '#2ecc71'
  };

  function renderDeskGym() {
    var section = document.getElementById('personalGymSection');
    if (!section) return;
    section.innerHTML = '';

    var gym   = getGym();
    var t     = todayISO();

    var card = makePwCard('gymCard', 'pw_gym',
      '<div class="pw-header-title">💪 Gym / Exercise</div>' +
      '<span style="font-size:0.75rem;color:#888;margin-right:6px">Visual Dashboard</span>',
      function (body) {
        if (!gym.routines.length) {
          body.appendChild(buildGymEmptyState());
          return;
        }
        if (_gymSelectedIdx >= gym.routines.length) _gymSelectedIdx = 0;

        var split = document.createElement('div');
        split.className = 'dgym-split';
        split.appendChild(buildGymLeft(gym));
        split.appendChild(buildGymRight(gym, _gymSelectedIdx, t));
        body.appendChild(split);
      });

    section.appendChild(card);
  }

  function buildGymEmptyState() {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'text-align:center;padding:20px 0;';
    wrap.innerHTML = '<div style="color:#aaa;margin-bottom:12px">No workout routines yet — create one to get started!</div>';
    var form = document.createElement('div');
    form.className = 'dgym-empty-form';
    var inp = document.createElement('input');
    inp.type        = 'text';
    inp.placeholder = 'Routine name (e.g. Upper Body)';
    var btn = document.createElement('button');
    btn.textContent = '＋ Create';
    btn.addEventListener('click', function () {
      var name = inp.value.trim();
      if (!name) return;
      var g = getGym();
      g.routines.push({ name: name, exercises: [] });
      setGym(g);
      _gymSelectedIdx = g.routines.length - 1;
      renderDeskGym();
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') btn.click(); });
    form.appendChild(inp); form.appendChild(btn);
    wrap.appendChild(form);
    return wrap;
  }

  function buildGymLeft(gym) {
    var left = document.createElement('div');
    left.className = 'dgym-left';

    var lbl = document.createElement('div');
    lbl.className   = 'dgym-left-title';
    lbl.textContent = 'ROUTINES';
    left.appendChild(lbl);

    var weekPlan = gym.weeklyPlan || {};
    var DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    gym.routines.forEach(function (routine, ri) {
      var assignedDays = Object.keys(weekPlan)
        .filter(function (d) { return weekPlan[d] === routine.name; })
        .map(function (d) { return DAY_NAMES[parseInt(d, 10)]; })
        .join(', ');

      var item = document.createElement('div');
      item.className = 'dgym-routine-item' + (ri === _gymSelectedIdx ? ' selected' : '');
      item.innerHTML =
        '<span class="dgym-routine-item-name">🏋️ ' + esc(routine.name) + '</span>' +
        (assignedDays ? '<span class="dgym-routine-item-days">' + esc(assignedDays) + '</span>' : '');
      item.addEventListener('click', function () {
        _gymSelectedIdx = ri;
        renderDeskGym();
      });
      left.appendChild(item);
    });

    var addBtn = document.createElement('button');
    addBtn.className   = 'dgym-add-routine';
    addBtn.textContent = '＋ New Routine';
    addBtn.addEventListener('click', function () {
      var name = prompt('Routine name:');
      if (!name || !name.trim()) return;
      var g = getGym();
      g.routines.push({ name: name.trim(), exercises: [] });
      setGym(g);
      _gymSelectedIdx = g.routines.length - 1;
      renderDeskGym();
    });
    left.appendChild(addBtn);

    // Streak
    var streak = calcGymStreak(gym);
    if (streak > 0) {
      var s = document.createElement('div');
      s.className   = 'gym-streak';
      s.textContent = '🔥 ' + streak + '-day workout streak!';
      left.appendChild(s);
    }
    return left;
  }

  function calcGymStreak(gym) {
    var streak = 0, d = new Date();
    for (var i = 0; i < 365; i++) {
      var ds = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
      if (gym.log[ds] && gym.log[ds].length > 0) { streak++; }
      else if (i === 0) { /* today not yet logged */ }
      else { break; }
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function buildGymRight(gym, ri, t) {
    var right   = document.createElement('div');
    right.className = 'dgym-right';
    var routine = gym.routines[ri];
    var isLogged = gym.log[t] && gym.log[t].indexOf(routine.name) >= 0;

    // Stats
    var totalSets = 0, totalVol = 0;
    (routine.exercises || []).forEach(function (ex) {
      var sets   = parseInt(ex.sets, 10) || 0;
      var reps   = parseInt((ex.reps || '').split('-')[0], 10) || 0;
      var weight = parseFloat((ex.weight || '').replace(/[^0-9.]/g, '')) || 0;
      totalSets += sets;
      totalVol  += sets * reps * weight;
    });
    var restContrib = _restDuration / 60;
    var estMins = totalSets > 0 ? Math.round(totalSets * (1.5 + restContrib)) : 0;

    // Header
    var hdr = document.createElement('div');
    hdr.className = 'dgym-header';
    hdr.innerHTML = '<div class="dgym-header-name">🏋️ ' + esc(routine.name) + '</div>';
    if (estMins) hdr.innerHTML += '<div class="dgym-stat-badge">⏱ ~' + estMins + ' min</div>';
    if (totalVol) hdr.innerHTML += '<div class="dgym-stat-badge">📊 ' + Math.round(totalVol).toLocaleString() + ' lb vol</div>';

    var logBtn = document.createElement('button');
    logBtn.className   = 'dgym-log-btn';
    logBtn.disabled    = isLogged;
    logBtn.textContent = isLogged ? '✅ Logged Today' : '📝 Log Workout';
    logBtn.addEventListener('click', function () {
      var g = getGym();
      if (!g.log[t]) g.log[t] = [];
      if (g.log[t].indexOf(routine.name) < 0) g.log[t].push(routine.name);
      // Record exercise history for progressive overload tracking
      if (!g.exerciseHistory) g.exerciseHistory = {};
      (routine.exercises || []).forEach(function (ex) {
        if (!ex.name) return;
        if (!g.exerciseHistory[ex.name]) g.exerciseHistory[ex.name] = [];
        g.exerciseHistory[ex.name].push({ date: t, weight: ex.weight || '', sets: ex.sets || '', reps: ex.reps || '' });
        // Cap history at 20 entries — remove oldest without creating a new array
        var hist = g.exerciseHistory[ex.name];
        if (hist.length > 20) hist.splice(0, hist.length - 20);
      });
      setGym(g);
      renderDeskGym();
    });
    hdr.appendChild(logBtn);

    var delBtn = document.createElement('button');
    delBtn.className   = 'dgym-del-routine-btn';
    delBtn.textContent = '🗑️';
    delBtn.title       = 'Delete routine';
    delBtn.addEventListener('click', function () {
      if (!confirm('Delete "' + routine.name + '"?')) return;
      var g = getGym();
      g.routines.splice(ri, 1);
      setGym(g);
      if (_gymSelectedIdx >= g.routines.length) _gymSelectedIdx = Math.max(0, g.routines.length - 1);
      renderDeskGym();
    });
    hdr.appendChild(delBtn);
    right.appendChild(hdr);

    // Rest timer (if active, show at top of right panel)
    if (_restTimer) right.appendChild(buildRestTimerEl());

    // Weekly schedule
    right.appendChild(buildGymSchedule(gym, ri, t));

    // Exercises
    var exTitle = document.createElement('div');
    exTitle.className   = 'dgym-exercises-title';
    exTitle.textContent = 'EXERCISES';
    right.appendChild(exTitle);

    var exHistory = gym.exerciseHistory || {};
    (routine.exercises || []).forEach(function (ex, ei) {
      right.appendChild(buildGymExCard(ex, ei, ri, exHistory));
    });

    // Add exercise form
    right.appendChild(buildGymAddExForm(ri));

    // Rest timer config
    var restCfg = document.createElement('div');
    restCfg.className = 'dgym-rest-config';
    var sel = document.createElement('select');
    [30, 60, 90, 120, 180].forEach(function (s) {
      var opt = document.createElement('option');
      opt.value       = s;
      opt.textContent = s < 60 ? s + 's' : (s / 60) + ' min';
      opt.selected    = _restDuration === s;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () { _restDuration = parseInt(sel.value, 10); });
    restCfg.appendChild(document.createTextNode('⏱ Rest between sets:'));
    restCfg.appendChild(sel);
    right.appendChild(restCfg);

    return right;
  }

  function buildGymSchedule(gym, ri, t) {
    var wrap     = document.createElement('div');
    wrap.className = 'dgym-schedule';
    var title    = document.createElement('div');
    title.className   = 'dgym-sched-title';
    title.textContent = '📅 WEEKLY SCHEDULE  (click a day to assign/remove this routine)';
    wrap.appendChild(title);

    var grid     = document.createElement('div');
    grid.className = 'dgym-sched-week';
    var weekPlan = gym.weeklyPlan || {};
    var todayDow = new Date().getDay();
    var DAYS     = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    DAYS.forEach(function (name, dow) {
      var cell = document.createElement('div');
      cell.className = 'dgym-sched-day' +
        (weekPlan[dow] ? ' has-routine' : '') +
        (dow === todayDow ? ' today' : '');
      cell.innerHTML =
        '<div class="dgym-sched-day-name">' + name + '</div>' +
        (weekPlan[dow] ? '<div class="dgym-sched-routine-name">' + esc(weekPlan[dow]) + '</div>' : '');
      cell.addEventListener('click', function () {
        var g  = getGym();
        var wp = g.weeklyPlan || {};
        var sel = g.routines[_gymSelectedIdx];
        if (sel) {
          if (wp[dow] === sel.name) { delete wp[dow]; }
          else                      { wp[dow] = sel.name; }
          g.weeklyPlan = wp;
          setGym(g);
          renderDeskGym();
        }
      });
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function buildGymExCard(ex, ei, ri, exHistory) {
    var card = document.createElement('div');
    card.className = 'dgym-ex-card';

    var top = document.createElement('div');
    top.className = 'dgym-ex-top';

    var name = document.createElement('div');
    name.className   = 'dgym-ex-name';
    name.textContent = ex.name;
    top.appendChild(name);

    if (ex.muscle) {
      var tag = document.createElement('span');
      tag.className = 'dgym-muscle-tag';
      var mc = MUSCLE_COLORS[ex.muscle] || '#4a90e2';
      tag.style.background = mc + '22';
      tag.style.color      = mc;
      tag.style.border     = '1px solid ' + mc + '55';
      tag.textContent = ex.muscle;
      top.appendChild(tag);
    }

    var del = document.createElement('button');
    del.className   = 'dgym-ex-del';
    del.textContent = '🗑️';
    del.title       = 'Remove';
    del.addEventListener('click', function () {
      var g = getGym();
      g.routines[ri].exercises.splice(ei, 1);
      setGym(g);
      renderDeskGym();
    });
    top.appendChild(del);
    card.appendChild(top);

    var detail = document.createElement('div');
    detail.className   = 'dgym-ex-detail';
    detail.textContent = (ex.sets || '—') + ' sets × ' + (ex.reps || '—') + ' reps' +
                         (ex.weight ? ' @ ' + ex.weight : '');
    card.appendChild(detail);

    // Per-set tracker circles
    var setCount = parseInt(ex.sets, 10) || 3;
    var stateKey = ri + '_' + ei;
    if (!_gymSetsDone[stateKey]) _gymSetsDone[stateKey] = [];
    var done     = _gymSetsDone[stateKey];

    var tracker = document.createElement('div');
    tracker.className = 'dgym-set-tracker';
    for (var s = 0; s < setCount; s++) {
      (function (setIdx) {
        var dot = document.createElement('div');
        dot.className   = 'dgym-set-dot' + (done.indexOf(setIdx) >= 0 ? ' done' : '');
        dot.textContent = setIdx + 1;
        dot.title       = 'Set ' + (setIdx + 1);
        dot.addEventListener('click', function () {
          var arr = _gymSetsDone[stateKey] || [];
          var pos = arr.indexOf(setIdx);
          if (pos >= 0) { arr.splice(pos, 1); }
          else          { arr.push(setIdx); startRestTimer(); }
          _gymSetsDone[stateKey] = arr;
          renderDeskGym();
        });
        tracker.appendChild(dot);
      })(s);
    }
    card.appendChild(tracker);

    // Progressive overload sparkline
    var hist = exHistory[ex.name];
    if (hist && hist.length >= 2) {
      card.appendChild(buildSparkline(hist));
    }

    return card;
  }

  function buildGymAddExForm(ri) {
    var form = document.createElement('div');
    form.className = 'dgym-add-ex-form';

    var nameIn   = document.createElement('input'); nameIn.type = 'text'; nameIn.placeholder = 'Exercise name'; nameIn.className = 'dgym-add-ex-name';
    var setsIn   = document.createElement('input'); setsIn.type = 'number'; setsIn.placeholder = 'Sets'; setsIn.className = 'dgym-add-ex-small';
    var repsIn   = document.createElement('input'); repsIn.type = 'text'; repsIn.placeholder = 'Reps'; repsIn.className = 'dgym-add-ex-small';
    var wtIn     = document.createElement('input'); wtIn.type = 'text'; wtIn.placeholder = 'Weight'; wtIn.className = 'dgym-add-ex-small';
    var muscleIn = document.createElement('input'); muscleIn.type = 'text'; muscleIn.placeholder = 'Muscle'; muscleIn.title = 'Muscle group (e.g. Chest, Back, Legs)'; muscleIn.className = 'dgym-add-ex-small';
    var addBtn   = document.createElement('button'); addBtn.className = 'dgym-add-ex-btn'; addBtn.textContent = '＋ Add';

    var doAdd = function () {
      var name = nameIn.value.trim();
      if (!name) return;
      var g = getGym();
      g.routines[ri].exercises.push({
        name: name, sets: setsIn.value || '', reps: repsIn.value || '',
        weight: wtIn.value || '', muscle: muscleIn.value || ''
      });
      setGym(g);
      renderDeskGym();
    };
    addBtn.addEventListener('click', doAdd);
    nameIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdd(); });

    [nameIn, setsIn, repsIn, wtIn, muscleIn, addBtn].forEach(function (el) { form.appendChild(el); });
    return form;
  }

  function buildSparkline(hist) {
    var wrap    = document.createElement('div');
    wrap.className = 'dgym-sparkline';
    var recent  = hist.slice(-8);
    var weights = recent.map(function (h) {
      return parseFloat((h.weight || '').replace(/[^0-9.]/g, '')) || 0;
    }).filter(function (w) { return w > 0; });

    if (weights.length < 2) return wrap;

    var minW  = Math.min.apply(null, weights);
    var maxW  = Math.max.apply(null, weights);
    var range = maxW - minW || 1;
    var W = 80, H = 26, r = 2;

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var pts = weights.map(function (w, i) {
      return [(i / (weights.length - 1)) * (W - 2 * r) + r,
              H - r - ((w - minW) / range) * (H - 2 * r)];
    });

    var trend = weights[weights.length - 1] - weights[weights.length - 2];
    var lineColor = trend > 0 ? '#27ae60' : trend < 0 ? '#e74c3c' : '#f39c12';

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M ' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join(' L '));
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', lineColor);
    path.setAttribute('stroke-width', '1.5'); path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);

    pts.forEach(function (pt) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', pt[0]); c.setAttribute('cy', pt[1]); c.setAttribute('r', r);
      c.setAttribute('fill', lineColor);
      svg.appendChild(c);
    });

    var trendEl = document.createElement('span');
    trendEl.className   = 'dgym-spark-trend ' + (trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat');
    trendEl.textContent = trend > 0 ? '↑ +' + trend + ' lb'
                        : trend < 0 ? '↓ ' + trend + ' lb'
                        : '→ stable';

    wrap.appendChild(svg);
    wrap.appendChild(trendEl);
    return wrap;
  }

  // ---- Rest timer ----

  function startRestTimer() {
    stopRestTimer();
    _restTimer = { remaining: _restDuration, total: _restDuration, interval: null };
    _restTimer.interval = setInterval(function () {
      if (!_restTimer) return;
      _restTimer.remaining--;
      if (_restTimer.remaining <= 0) {
        stopRestTimer();
        var sec = document.getElementById('personalGymSection');
        if (sec) renderDeskGym();
        return;
      }
      // Lightweight in-place update (avoids full re-render on every tick)
      var disp = document.getElementById('dpRestTimerDisplay');
      if (!disp) return;
      var rem   = _restTimer.remaining;
      var tot   = _restTimer.total;
      var pct   = Math.round((rem / tot) * 100);
      var mins  = Math.floor(rem / 60);
      var secs  = rem % 60;
      var txt   = disp.querySelector('.dgym-rest-timer-text');
      if (txt) txt.textContent = '⏱ Rest: ' + mins + ':' + (secs < 10 ? '0' : '') + secs + ' remaining';
      // Update ring dasharray
      var svgEl = disp.querySelector('svg');
      if (svgEl) {
        var fgEl = svgEl.querySelectorAll('circle')[1];
        if (fgEl) {
          var r2 = 15, circ2 = 2 * Math.PI * r2;
          var dash2 = (pct / 100) * circ2;
          fgEl.setAttribute('stroke-dasharray', dash2 + ' ' + (circ2 - dash2));
        }
        var txEl = svgEl.querySelector('text');
        if (txEl) txEl.textContent = pct + '%';
      }
    }, 1000);
  }

  function stopRestTimer() {
    if (_restTimer && _restTimer.interval) clearInterval(_restTimer.interval);
    _restTimer = null;
  }

  function buildRestTimerEl() {
    var wrap = document.createElement('div');
    wrap.className = 'dgym-rest-timer';
    wrap.id        = 'dpRestTimerDisplay';

    var rem   = _restTimer ? _restTimer.remaining : 0;
    var tot   = _restTimer ? _restTimer.total : _restDuration;
    var pct   = tot > 0 ? Math.round((rem / tot) * 100) : 0;
    var mins  = Math.floor(rem / 60);
    var secs  = rem % 60;

    var ring = progressRing(pct, 36, '#f39c12');
    ring.style.flexShrink = '0';
    wrap.appendChild(ring);

    var txt = document.createElement('div');
    txt.className   = 'dgym-rest-timer-text';
    txt.textContent = '⏱ Rest: ' + mins + ':' + (secs < 10 ? '0' : '') + secs + ' remaining';
    wrap.appendChild(txt);

    var skip = document.createElement('button');
    skip.className   = 'dgym-rest-timer-cancel';
    skip.textContent = '✕ Skip';
    skip.addEventListener('click', function () { stopRestTimer(); renderDeskGym(); });
    wrap.appendChild(skip);

    return wrap;
  }

  // ===========================================================================
  //  INIT & WIRING
  // ===========================================================================

  function renderAdvancedPersonalWidgets() {
    try { renderDeskMeal();    } catch (e) { console.warn('[dp] meal failed', e); }
    try { renderDeskRoutine(); } catch (e) { console.warn('[dp] routine failed', e); }
    try { renderDeskGym();     } catch (e) { console.warn('[dp] gym failed', e); }
  }

  // Keep backward-compatible alias
  var renderDesktopPersonalWidgets = renderAdvancedPersonalWidgets;

  /**
   * Patches window.renderPersonalWidgets so that the enhanced (advanced)
   * versions always replace the compact widgets for Meal, Routine, and Gym.
   * The original function still runs first so that Focus, Hydration, Sleep,
   * and Mood continue to render correctly in every scenario.
   */
  function initAdvancedPersonal() {
    if (window._dpPatched) return;
    if (typeof window.renderPersonalWidgets !== 'function') return;

    var orig = window.renderPersonalWidgets;
    window.renderPersonalWidgets = function () {
      orig();
      renderAdvancedPersonalWidgets();
    };
    window._dpPatched = true;
  }

  // Re-run init on personal page navigation (in case app.js loads after us)
  // Guard flags prevent duplicate listeners if the script ever executes twice.
  if (!window._dpViewListener) {
    window._dpViewListener = true;
    window.addEventListener('view:show', function (e) {
      if (e.detail && e.detail.view === 'personal') {
        initAdvancedPersonal();
        // If already patched the original will run both; if not patched yet we
        // need to trigger our renders directly since renderPersonalWidgets was
        // already called by app.js before we patched it.
        if (!window._dpPatched) renderAdvancedPersonalWidgets();
      }
    });
  }

  // Handle resize into desktop breakpoint — re-render so layout adjusts
  if (!window._dpMediaListener) {
    window._dpMediaListener = true;
    window.matchMedia('(min-width: 901px)').addEventListener('change', function () {
      initAdvancedPersonal();
      var page = document.getElementById('page-personal');
      if (page && !page.classList.contains('hidden')) {
        if (typeof window.renderPersonalWidgets === 'function') window.renderPersonalWidgets();
      }
    });
  }

  // Boot — poll until app.js defines renderPersonalWidgets (more reliable
  // than a single setTimeout which can miss if app.js loads slowly).
  var _tryCount = 0;
  function tryInit() {
    initAdvancedPersonal();
    if (!window._dpPatched && _tryCount++ < 50) {
      setTimeout(tryInit, 100);
    } else if (window._dpPatched) {
      // If the personal page is already visible, render immediately
      var page = document.getElementById('page-personal');
      if (page && !page.classList.contains('hidden')) {
        renderAdvancedPersonalWidgets();
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(tryInit, 50); });
  } else {
    setTimeout(tryInit, 50);
  }

})();
