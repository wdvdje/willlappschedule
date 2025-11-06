(function () {
  // storage keys
  const TASKS_KEY = 'tasks';
  const CATS_KEY = 'taskCategories';

  // DOM
  const addTaskBtn = () => document.getElementById('addTaskBtn');
  const newTaskInput = () => document.getElementById('newTask');
  const taskDateInput = () => document.getElementById('taskDate');
  const taskTimeInput = () => document.getElementById('taskTime');
  const taskCategorySelect = () => document.getElementById('taskCategory');
  const taskPrioritySelect = () => document.getElementById('taskPriority');
  const tasksContainer = () => document.getElementById('tasksContainer');

  const addCategoryBtn = () => document.getElementById('addCategoryBtn');
  const newCategoryName = () => document.getElementById('newCategoryName');
  const newCategoryColor = () => document.getElementById('newCategoryColor');
  const categoriesList = () => document.getElementById('categoriesList');
  // quick-add category modal
  const catModal = () => document.getElementById('catModal');
  const catNameInput = () => document.getElementById('catNameInput');
  const catColorInput = () => document.getElementById('catColorInput');
  const catAddBtn = () => document.getElementById('catAddBtn');
  const catCancelBtn = () => document.getElementById('catCancelBtn');
  const quickCatToggleBtn = () => document.getElementById('quickCatToggleBtn');
  const toggleTaskInputsBtn = () => document.getElementById('toggleTaskInputsBtn');
  const taskFormFields = () => document.getElementById('taskFormFields');

  // helpers
  function uid(prefix = 'id') { return prefix + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2); }
  function safeParse(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; } }
  function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function brighten(hex, amt = 0.06) {
    // return lighter rgba background derived from hex for card bg
    if (!hex || hex[0] !== '#') return hex;
    const r = parseInt(hex.substr(1,2),16);
    const g = parseInt(hex.substr(3,2),16);
    const b = parseInt(hex.substr(5,2),16);
    return `rgba(${r+Math.round((255-r)*amt)},${g+Math.round((255-g)*amt)},${b+Math.round((255-b)*amt)},0.18)`;
  }
  function textColorForBg(hex) {
    if (!hex || hex[0] !== '#') return '#000';
    const r = parseInt(hex.substr(1,2),16);
    const g = parseInt(hex.substr(3,2),16);
    const b = parseInt(hex.substr(5,2),16);
    const luminance = (0.299*r + 0.587*g + 0.114*b)/255;
    return luminance > 0.6 ? '#000' : '#fff';
  }

  // data
  function loadTasks() { return safeParse(TASKS_KEY); }
  function saveTasks(list) { save(TASKS_KEY, list || []); }
  function loadCategories() { return safeParse(CATS_KEY); }
  function saveCategories(list) { save(CATS_KEY, list || []); }

  // UI render
  function renderCategoryOptions() {
    const sel = taskCategorySelect();
    if (!sel) return;
    const cats = loadCategories();
    // reset options (keep first "No category" option)
    sel.innerHTML = '';
    const none = document.createElement('option'); none.value = ''; none.textContent = 'No category';
    sel.appendChild(none);
    cats.forEach(c => {
      const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.appendChild(o);
    });
  }

  function renderCategoriesList() {
    const list = categoriesList();
    if (!list) return;
    list.innerHTML = '';
    const cats = loadCategories();
    cats.forEach(c => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';

      const sw = document.createElement('div');
      sw.style.width = '28px'; sw.style.height = '20px'; sw.style.borderRadius = '6px';
      sw.style.background = c.color || '#ddd'; sw.style.border = '1px solid rgba(0,0,0,0.06)';

      const label = document.createElement('div'); label.textContent = c.name; label.style.flex = '1';
      const del = document.createElement('button'); del.className = 'small-btn'; del.textContent = 'Delete';
      del.addEventListener('click', () => {
        const remaining = loadCategories().filter(x => x.id !== c.id);
        saveCategories(remaining);
        // if any tasks referenced this category, clear their category
        const tasks = loadTasks().map(t => (t.category === c.id) ? Object.assign({}, t, { category: '' }) : t);
        saveTasks(tasks);
        renderCategoriesList(); renderCategoryOptions(); renderTasksList();
      });

      row.appendChild(sw); row.appendChild(label); row.appendChild(del);
      list.appendChild(row);
    });
    if (cats.length === 0) {
      const none = document.createElement('div'); none.style.color = '#666'; none.textContent = 'No categories defined.';
      list.appendChild(none);
    }
  }

  function renderTasksList() {
    const container = tasksContainer();
    if (!container) return;
    container.innerHTML = '';
    const tasks = loadTasks().slice().sort((a,b) => {
      if (a.date === b.date) return (a.time||'').localeCompare(b.time||'');
      return (a.date||'').localeCompare(b.date||'');
    });
    const cats = loadCategories().reduce((m,c)=>{ m[c.id]=c; return m; }, {});

    tasks.forEach(t => {
      const box = document.createElement('div');
      box.className = 'task-box';
      box.style.display = 'flex';
      box.style.alignItems = 'center';
      box.style.gap = '12px';
      box.style.padding = '10px';
      box.style.borderRadius = '8px';
      box.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)';
      box.style.border = '1px solid rgba(0,0,0,0.04)';
      box.style.background = '#fff';

      if (t.category && cats[t.category]) {
        box.style.background = brighten(cats[t.category].color || '#fff', 0.9);
        box.style.borderColor = (cats[t.category].color || '#ddd');
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!t.done;
      checkbox.addEventListener('change', () => toggleDone(t.id, checkbox.checked));
      checkbox.setAttribute('aria-label', 'Mark task done');

      const body = document.createElement('div'); body.style.flex = '1'; body.style.display = 'flex'; body.style.flexDirection = 'column';
      const titleRow = document.createElement('div'); titleRow.style.display = 'flex'; titleRow.style.alignItems = 'center'; titleRow.style.gap = '8px';
      const title = document.createElement('div'); title.textContent = t.title || '(no title)'; title.style.fontWeight = '600';
      if (t.done) { title.style.textDecoration = 'line-through'; title.style.opacity = '0.7'; }
      titleRow.appendChild(title);

      const meta = document.createElement('div'); meta.style.fontSize = '0.9rem'; meta.style.color = '#666';
      const datePart = t.date || ''; const timePart = t.time || '';
      meta.textContent = [datePart, timePart].filter(Boolean).join(' ');
      body.appendChild(titleRow); body.appendChild(meta);

      const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.gap = '8px'; actions.style.alignItems = 'center';
      const del = document.createElement('button'); del.className = 'small-btn'; del.textContent = 'Delete';
      del.addEventListener('click', () => deleteTask(t.id));
      actions.appendChild(del);

      box.appendChild(checkbox); box.appendChild(body); box.appendChild(actions);
      container.appendChild(box);
    });

    if (tasks.length === 0) {
      const empty = document.createElement('div'); empty.style.color = '#666'; empty.textContent = 'No tasks yet.';
      container.appendChild(empty);
    }
  }

  // actions
  function addTaskFromForm(e) {
    if (e && e.preventDefault) e.preventDefault();
    const title = (newTaskInput() && newTaskInput().value || '').trim();
    if (!title) return;
    const date = (taskDateInput() && taskDateInput().value) || '';
    const time = (taskTimeInput() && taskTimeInput().value) || '';
    const category = (taskCategorySelect() && taskCategorySelect().value) || '';
    const priority = (taskPrioritySelect() && taskPrioritySelect().value) || '1';
    const tasks = loadTasks();
    const t = { id: uid('task'), title, date, time, category, priority, done: false, created: new Date().toISOString() };
    tasks.push(t);
    saveTasks(tasks);
    if (newTaskInput()) newTaskInput().value = '';
    renderTasksList();
  }

  function toggleDone(id, done) {
    const tasks = loadTasks().map(t => t.id === id ? Object.assign({}, t, { done: !!done }) : t);
    saveTasks(tasks); renderTasksList();
  }

  function deleteTask(id) {
    const tasks = loadTasks().filter(t => t.id !== id);
    saveTasks(tasks); renderTasksList();
  }

  function addCategory() {
    const name = (newCategoryName() && newCategoryName().value || '').trim();
    const color = (newCategoryColor() && newCategoryColor().value) || '#ffd54f';
    if (!name) return;
    const cats = loadCategories();
    const c = { id: uid('cat'), name, color };
    cats.push(c);
    saveCategories(cats);
    if (newCategoryName()) newCategoryName().value = '';
    renderCategoriesList(); renderCategoryOptions(); renderTasksList();
  }

  // quick add from Tasks page (now from modal)
  function addCategoryFromModal() {
    const name = (catNameInput() && catNameInput().value || '').trim();
    const color = (catColorInput() && catColorInput().value) || '#ffd54f';
    if (!name) return;
    const cats = loadCategories();
    const c = { id: uid('cat'), name, color };
    cats.push(c);
    saveCategories(cats);
    // clear and close modal
    if (catNameInput()) catNameInput().value = '';
    if (catColorInput()) catColorInput().value = '#ffd54f';
    const m = catModal();
    if (m) m.classList.add('hidden');
    // refresh select and auto-select new category
    renderCategoryOptions();
    const sel = taskCategorySelect();
    if (sel) sel.value = c.id;
    // notify app components
    window.dispatchEvent(new CustomEvent('app:data:updated'));
  }

  // wire up (ensure runs even if DOMContentLoaded already fired)
  function init() {
    // populate categories and tasks
    renderCategoryOptions();
    renderCategoriesList();
    renderTasksList();

    // bind add task (use submit only to avoid duplicates)
    const form = document.getElementById('taskForm');
    if (form) form.addEventListener('submit', addTaskFromForm);

    // bind category add (settings page small add)
    const addCatBtnEl = addCategoryBtn();
    if (addCatBtnEl) addCatBtnEl.addEventListener('click', addCategory);

    // replace quick category toggle with modal open
    const qToggle = quickCatToggleBtn();
    if (qToggle) qToggle.addEventListener('click', () => {
      const m = catModal();
      if (!m) return;
      m.classList.remove('hidden');
      // focus name input
      setTimeout(() => { const i = catNameInput(); if (i && i.focus) i.focus(); }, 0);
    });

    // modal buttons
    const cAdd = catAddBtn();
    if (cAdd) cAdd.addEventListener('click', addCategoryFromModal);
    const cCancel = catCancelBtn();
    if (cCancel) cCancel.addEventListener('click', () => { const m = catModal(); if (m) m.classList.add('hidden'); });

    // click outside modal closes it
    const m = catModal();
    if (m) {
      m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
    }

    // bind show/hide for task inputs
    const tToggle = toggleTaskInputsBtn();
    if (tToggle) tToggle.addEventListener('click', () => {
      const panel = taskFormFields();
      if (!panel) return;
      const show = (panel.style.display === 'none' || !panel.style.display);
      panel.style.display = show ? 'block' : 'none';
      // optional: focus title when opening
      if (show) setTimeout(() => { const ti = newTaskInput(); if (ti && ti.focus) ti.focus(); }, 0);
    });

    // respond to external app changes (e.g., sync import)
    window.addEventListener('app:data:updated', () => { renderCategoryOptions(); renderCategoriesList(); renderTasksList(); });

    // storage change from other tabs
    window.addEventListener('storage', (e) => {
      if (!e.key || [TASKS_KEY, CATS_KEY].includes(e.key)) {
        renderCategoryOptions(); renderCategoriesList(); renderTasksList();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // already ready
    setTimeout(init, 0);
  }

  // expose for debugging
  window.appTasks = {
    renderTasksList, renderCategoriesList, loadTasks, loadCategories
  };
})();
