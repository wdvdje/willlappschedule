/* Core helpers and storage */
const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const weekdayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function pad2(n){ return n<10 ? '0'+n : ''+n; }
function safeParseStorage(key, fallback){
  try{ const raw = localStorage.getItem(key); if (!raw) return fallback; return JSON.parse(raw); }
  catch(e){ console.warn('LocalStorage parse failed for', key, e); try{ localStorage.removeItem(key); }catch(_){} return fallback; }
}

/* ----- Domain color preferences ----- */
const DOMAIN_COLOR_DEFAULTS = { work: '#4a90e2', home: '#27ae60', personal: '#9b59b6', holiday: '#e74c3c' };

function getDomainColors() {
  const stored = safeParseStorage('domainColors', {});
  return Object.assign({}, DOMAIN_COLOR_DEFAULTS, stored);
}

function hexToRgba(hex, alpha) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return 'rgba(0,0,0,' + alpha + ')';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}
function remindersToMap(input){
  const map = {};
  if (!input) return map;
  if (Array.isArray(input)) {
    input.forEach((r)=>{
      if (!r || typeof r !== 'object') return;
      const date = normalizeDate(r.date || r.reminderDate || '');
      if (!date) { console.warn('Skipping malformed reminder (missing date)', r); return; }
      if (!map[date]) map[date] = [];
      const ro = { text: (r.text || r.title || '').toString(), time: r.time || '', notify: r.notify || r.reminderNotify || 'none' };
      if (r.domain) ro.domain = r.domain;
      if (r.bucketId !== undefined) ro.bucketId = r.bucketId;
      map[date].push(ro);
    });
    return map;
  }
  if (typeof input === 'object') {
    Object.keys(input).forEach((dateKey)=>{
      const date = normalizeDate(dateKey);
      if (!date) return;
      const arr = Array.isArray(input[dateKey]) ? input[dateKey] : [];
      map[date] = [];
      arr.forEach((r)=>{
        if (!r || typeof r !== 'object') return;
        const ro = { text: (r.text || r.title || '').toString(), time: r.time || '', notify: r.notify || r.reminderNotify || 'none' };
        if (r.domain) ro.domain = r.domain;
        if (r.bucketId !== undefined) ro.bucketId = r.bucketId;
        map[date].push(ro);
      });
    });
  }
  return map;
}
function getReminders(){
  const parsed = safeParseStorage('reminders', {});
  const mapped = remindersToMap(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(mapped)) {
    try { localStorage.setItem('reminders', JSON.stringify(mapped)); } catch (_) {}
  }
  return mapped;
}
function setReminders(v){ localStorage.setItem('reminders', JSON.stringify(remindersToMap(v))); }
function getTasks(){ return safeParseStorage('tasks', []); }
function setTasks(v){ localStorage.setItem('tasks', JSON.stringify(v)); }
function getEvents(){ return safeParseStorage('events', []); }
function setEvents(v){ localStorage.setItem('events', JSON.stringify(v)); }
/* Return expanded (recurring-aware) events for the given date range.
   Falls back to getEvents() if expandEvents is not available yet. */
function getExpandedEvents(startISO, endISO){
  if (window.appUtils && typeof window.appUtils.expandEvents === 'function'){
    return window.appUtils.expandEvents(startISO, endISO);
  }
  // fallback: return raw events filtered to the range
  return getEvents().filter(function(e){
    var d = normalizeDate(e.date);
    return d >= startISO && d <= endISO;
  });
}
function getJobs(){ return safeParseStorage('jobs', []); }
function setJobs(v){ localStorage.setItem('jobs', JSON.stringify(v)); }
function getInbox(){ return safeParseStorage('inbox', []); }
function setInbox(v){ localStorage.setItem('inbox', JSON.stringify(v)); }

/* Bucket storage: personalBuckets / homeBuckets (work uses jobs) */
function getBuckets(domain) {
  if (domain === 'work') {
    return getJobs().map(function(j) {
      return { id: j.id, name: j.name, emoji: j.emoji || '💼', collapsed: false };
    });
  }
  return safeParseStorage(domain + 'Buckets', []);
}
function setBuckets(domain, v) {
  if (domain === 'work') return;
  localStorage.setItem(domain + 'Buckets', JSON.stringify(v));
}
function nextBucketId(domain) {
  const buckets = getBuckets(domain);
  if (!buckets.length) return 1;
  return Math.max.apply(null, buckets.map(function(b) { return b.id || 0; })) + 1;
}
function persistBucketCollapse(domain, bucketId, collapsed) {
  if (domain === 'work') return;
  const buckets = getBuckets(domain);
  const b = buckets.find(function(x) { return x.id === bucketId; });
  if (b) { b.collapsed = collapsed; setBuckets(domain, buckets); }
}

function showAppError(msg){
  try{
    let el = document.getElementById('appError');
    if (!el){
      el = document.createElement('div');
      el.id = 'appError';
      el.style.background = '#ffecec';
      el.style.color = '#900';
      el.style.padding = '8px 12px';
      el.style.margin = '8px 16px';
      el.style.border = '1px solid #f5c6cb';
      el.style.borderRadius = '6px';
      const header = document.querySelector('header') || document.body;
      header.insertAdjacentElement('afterend', el);
    }
    el.textContent = msg;
    console.warn('App message:', msg);
  }catch(err){ console.warn('showAppError failed', err); }
}

/* Date normalization & migration */
function normalizeDate(s){
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function migrateNormalizeTasks(){
  try{
    const tasks = getTasks();
    let changed = false;
    for (let i=0;i<tasks.length;i++){
      if (!tasks[i] || typeof tasks[i] !== 'object') { changed = true; continue; }
      if (tasks[i].title == null && tasks[i].text != null) {
        tasks[i].title = String(tasks[i].text);
        changed = true;
      }
      const nd = normalizeDate(tasks[i].date);
      if (tasks[i].date !== nd){
        tasks[i].date = nd;
        changed = true;
      }
    }
    if (changed) setTasks(tasks);
  }catch(e){ console.warn('Task migration failed', e); }
}

function migrateConsistencyData(){
  try {
    migrateNormalizeTasks();

    // Canonicalize reminders to date-keyed map.
    const remRaw = safeParseStorage('reminders', {});
    const remMap = remindersToMap(remRaw);
    if (JSON.stringify(remRaw) !== JSON.stringify(remMap)) {
      localStorage.setItem('reminders', JSON.stringify(remMap));
    }

    // Normalize events for buffers, recurrence, and time aliases.
    const events = getEvents();
    let eventChanged = false;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev || typeof ev !== 'object') { eventChanged = true; continue; }

      const normDate = normalizeDate(ev.date);
      if (!normDate) {
        console.warn('Skipping malformed event (missing/invalid date)', ev);
        continue;
      }
      if (ev.date !== normDate) { ev.date = normDate; eventChanged = true; }

      if (ev.title == null && ev.text != null) { ev.title = String(ev.text); eventChanged = true; }

      // Keep both aliases while canonicalizing to time/endTime used by app.js.
      if (!ev.time && ev.startTime) { ev.time = ev.startTime; eventChanged = true; }
      if (!ev.startTime && ev.time) { ev.startTime = ev.time; eventChanged = true; }
      if (!ev.endTime && ev.end_time) { ev.endTime = ev.end_time; eventChanged = true; }

      const pre = parseInt(ev.preBuffer, 10);
      const post = parseInt(ev.postBuffer, 10);
      const normPre = Number.isFinite(pre) ? pre : 0;
      const normPost = Number.isFinite(post) ? post : 0;
      if (ev.preBuffer !== normPre) { ev.preBuffer = normPre; eventChanged = true; }
      if (ev.postBuffer !== normPost) { ev.postBuffer = normPost; eventChanged = true; }

      const repeat = (ev.repeat || 'none').toString();
      if (!['none','daily','2day','weekly','monthly','custom','weekday_ab'].includes(repeat)) {
        ev.repeat = 'none';
        eventChanged = true;
      }
      const rptUntil = ev.repeatUntil ? normalizeDate(ev.repeatUntil) : '';
      if ((ev.repeatUntil || '') !== rptUntil) { ev.repeatUntil = rptUntil; eventChanged = true; }

      if (ev.repeat === 'custom') {
        const n = parseInt(ev.repeatInterval, 10);
        const unit = (ev.repeatUnit || 'days').toString();
        const validUnit = ['days','weeks','months','years'].includes(unit) ? unit : 'days';
        const validN = Number.isFinite(n) ? Math.max(1, Math.min(30, n)) : 1;
        if (ev.repeatUnit !== validUnit) { ev.repeatUnit = validUnit; eventChanged = true; }
        if (ev.repeatInterval !== validN) { ev.repeatInterval = validN; eventChanged = true; }
      }

      if (ev.repeat === 'weekday_ab') {
        const ab = (ev.abWeek || 'a').toString().toLowerCase() === 'b' ? 'b' : 'a';
        if (ev.abWeek !== ab) { ev.abWeek = ab; eventChanged = true; }
        if (ev.abSkipHolidays !== undefined && typeof ev.abSkipHolidays !== 'boolean') {
          ev.abSkipHolidays = !!ev.abSkipHolidays; eventChanged = true;
        }
      }
    }
    if (eventChanged) setEvents(events);

    migrateDomainField();
  } catch (e) {
    console.warn('Consistency migration failed', e);
  }
}

/* holidays and themes (kept small) */
const themes = [
  {weekday:'#cce5ff',weekend:'#e0ccff'},{weekday:'#ffd6e0',weekend:'#e6ccff'},{weekday:'#d6f5d6',weekend:'#cce0ff'},
  {weekday:'#fff0b3',weekend:'#ffd9b3'},{weekday:'#e6ffe6',weekend:'#ccf2ff'},{weekday:'#ffe6cc',weekend:'#ffcccc'},
  {weekday:'#fff5cc',weekend:'#ffd6cc'},{weekday:'#e6f7ff',weekend:'#d9e6f2'},{weekday:'#ffe6b3',weekend:'#ffccb3'},
  {weekday:'#ffd9b3',weekend:'#e6ccb3'},{weekday:'#e6f0ff',weekend:'#d6e6f5'},{weekday:'#ffcccc',weekend:'#ccffcc'}
];
const holidays = {
  '01-01':{name:"New Year's Day",emoji:'🎆'},
  '02-14':{name:"Valentine's Day",emoji:'❤️'},
  '03-17':{name:"St. Patrick's Day",emoji:'🍀'},
  '04-01':{name:"April Fool's Day",emoji:'🤡'},
  '07-04':{name:"Independence Day",emoji:'🎇'},
  '10-31':{name:"Halloween",emoji:'🎃'},
  '12-25':{name:"Christmas Day",emoji:'🎅'}
};
function computeNthWeekday(year,monthIndex,weekday,n){
  const first = new Date(year,monthIndex,1);
  const firstWeekday = first.getDay();
  return 1 + ((7 + weekday - firstWeekday) % 7) + (n-1)*7;
}
function computeLastWeekday(year,monthIndex,weekday){
  const last = new Date(year,monthIndex+1,0);
  const lastWeekday = last.getDay();
  return last.getDate() - ((7 + lastWeekday - weekday) % 7);
}
function computeFederalHolidays(year){
  const map = {};
  map['01-'+pad2(computeNthWeekday(year,0,1,3))] = {name:"Martin Luther King Jr. Day",emoji:'✊'};
  map['02-'+pad2(computeNthWeekday(year,1,1,3))] = {name:"Presidents' Day",emoji:'🏛️'};
  map['05-'+pad2(computeLastWeekday(year,4,1))] = {name:"Memorial Day",emoji:'🎗️'};
  map['06-19'] = {name:"Juneteenth National Independence Day",emoji:'🏳️‍🌈'};
  map['09-'+pad2(computeNthWeekday(year,8,1,1))] = {name:"Labor Day",emoji:'🛠️'};
  map['10-'+pad2(computeNthWeekday(year,9,1,2))] = {name:"Columbus Day",emoji:'🧭'};
  map['11-'+pad2(computeNthWeekday(year,10,4,4))] = {name:"Thanksgiving",emoji:'🦃'};
  map['11-11'] = {name:"Veterans Day",emoji:'🎖️'};
  return map;
}
function getHoliday(mmdd, year){
  if (holidays[mmdd]) return holidays[mmdd];
  const c = computeFederalHolidays(year);
  return c[mmdd] || null;
}

/* app state */
var selectedMonth, selectedYear, selectedDay;

/* UI helpers */
function escapeHTML(s){ return (s+'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function osmSearchUrl(query){
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query || '')}`;
}

function osmDirectionsUrl(place){
  const hasCoords = place && typeof place.lat === 'number' && typeof place.lng === 'number';
  if (hasCoords) {
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${encodeURIComponent(place.lat + ',' + place.lng)}`;
  }
  return osmSearchUrl(place && place.address ? place.address : '');
}

/* ---------- DAILY VIEW: hourly rendering and part selection ---------- */
const DAY_PARTS = {
  morning: { start: 1, end: 9 },  // 01:00 - 09:00 (end exclusive)
  day:     { start: 9, end: 17 }, // 09:00 - 17:00
  night:   { start: 17, end: 25 } // 17:00 - 01:00 -> represent 01:00 as 25 to make span easy
};

/* Replace hourToLabel to use 24-hour format */
function hourToLabel(h){
  const hh = h % 24;
  return `${String(hh).padStart(2,'0')}:00`;
}

function getEventsForDateKey(dateKey){
  // returns expanded events (with normalized times) for the given YYYY-MM-DD
  return getExpandedEvents(dateKey, dateKey).filter(ev => ev.time || ev.endTime);
}

/* renderDailyViewForDay:
   Delegates to the calendar-style timeline renderer in daily-view.js.
   Sets the date and triggers a re-render of the vertical timeline view. */
function renderDailyViewForDay(year, monthIndex, day, partKey){
  const dateKey = `${year}-${pad2(monthIndex+1)}-${pad2(day)}`;
  // Sync day-part selector if a valid partKey is given
  if (partKey && DAY_PARTS[partKey]) {
    const sel = document.getElementById('dayPartSelect');
    if (sel) sel.value = partKey;
  }
  // Delegate to daily-view.js timeline renderer
  if (typeof window.dailyViewSetDate === 'function') {
    window.dailyViewSetDate(dateKey);
  }
}

function determinePartFromHour(hour){
  if(hour >=1 && hour < 9) return 'morning';
  if(hour >=9 && hour < 17) return 'day';
  return 'night';
}
function capitalize(s){ return s ? s[0].toUpperCase() + s.slice(1) : s; }

function parseTimeToFloat(t){
  if(!t) return null;
  const parts = t.split(':'); if(parts.length<1) return null;
  const hh = parseInt(parts[0],10) || 0; const mm = parseInt(parts[1]||'0',10) || 0;
  return hh + (mm/60);
}

function isCurrentHourForDate(year, monthIndex, day, hourCell){
  const now = new Date();
  const cmpHour = now.getHours();
  const sameDate = now.getFullYear()===year && now.getMonth()===monthIndex && now.getDate()===day;
  if(!sameDate) return false;
  // map night range where cell hour may be 24 representing 00:00
  const mapped = hourCell % 24;
  return cmpHour === mapped;
}

/* ---------- Jobs: storage and UI (modal-based, on Work page) ---------- */

/* Temporary storage for off-days being edited in the modal */
var _jobModalOffDays = [];

function showJobModal(jobId) {
  try {
    var modal = document.getElementById('jobModal');
    if (!modal) return;
    clearJobForm();
    if (jobId !== undefined && jobId !== null) {
      var jobs = getJobs();
      var job = jobs.find(function(j) { return j.id === jobId; });
      if (job) {
        document.getElementById('jobId').value = job.id;
        document.getElementById('jobName').value = job.name || '';
        document.getElementById('jobEmoji').value = job.emoji || '';
        document.getElementById('jobLocation').value = job.location || '';
        document.getElementById('jobRate').value = job.rate || '';
        document.getElementById('jobUnit').value = job.unit || 'hour';
        _jobModalOffDays = Array.isArray(job.offDays) ? job.offDays.slice() : [];
        var heading = document.getElementById('jobModalHeading');
        if (heading) heading.textContent = 'Edit Job';
      }
    } else {
      _jobModalOffDays = [];
      var heading = document.getElementById('jobModalHeading');
      if (heading) heading.textContent = 'Add Job';
    }
    renderJobOffDaysList();
    modal.classList.remove('hidden');
    setTimeout(function() {
      var nameInput = document.getElementById('jobName');
      if (nameInput) nameInput.focus();
    }, 50);
  } catch(e) { console.warn('showJobModal failed', e); }
}

function hideJobModal() {
  var modal = document.getElementById('jobModal');
  if (modal) { modal.classList.add('hidden'); }
}

function renderJobOffDaysList() {
  var ul = document.getElementById('jobOffDaysList');
  if (!ul) return;
  if (!_jobModalOffDays.length) {
    ul.innerHTML = '<li style="color:#999;font-size:0.85rem">No days off added for this job.</li>';
    return;
  }
  ul.innerHTML = '';
  _jobModalOffDays.forEach(function(entry, i) {
    var li = document.createElement('li');
    li.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #f0f0f0;font-size:0.9rem';
    var dateStr = typeof entry === 'string' ? entry : (entry.date || '');
    var label = (typeof entry === 'object' && entry.label) ? entry.label : '';
    var dateSpan = document.createElement('span');
    dateSpan.style.fontWeight = '600';
    dateSpan.textContent = dateStr;
    li.appendChild(dateSpan);
    if (label) {
      var labelSpan = document.createElement('span');
      labelSpan.style.color = '#666';
      labelSpan.textContent = label;
      li.appendChild(labelSpan);
    }
    var removeBtn = document.createElement('button');
    removeBtn.className = 'small-btn';
    removeBtn.style.cssText = 'margin-left:auto;background:#e74c3c;color:#fff;padding:2px 8px;font-size:0.78rem';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', function() {
      _jobModalOffDays.splice(i, 1);
      renderJobOffDaysList();
    });
    li.appendChild(removeBtn);
    ul.appendChild(li);
  });
}

/* render saved jobs list (no-op now — jobs render as buckets on work page) */
function renderJobs(){
  try { renderDomainPage('work'); } catch(e) { console.warn('renderJobs failed', e); }
}

/* save job from modal form (create or update) */
function saveJobFromUI(){
  try{
    var idField = document.getElementById('jobId');
    var name = (document.getElementById('jobName')||{}).value.trim();
    if (!name){ alert('Enter a job name'); return; }
    var emoji = (document.getElementById('jobEmoji')||{}).value.trim();
    var location = (document.getElementById('jobLocation')||{}).value.trim();
    var rate = (document.getElementById('jobRate')||{}).value.trim();
    var unit = (document.getElementById('jobUnit')||{}).value;
    var offDays = _jobModalOffDays.slice();

    var jobs = getJobs();
    if (idField && idField.value){
      var id = parseInt(idField.value,10);
      var idx = jobs.findIndex(function(j){ return j.id===id; });
      if (idx!==-1){
        jobs[idx] = Object.assign({}, jobs[idx], {name: name, emoji: emoji, location: location, rate: rate, unit: unit, offDays: offDays});
      }
    } else {
      var nid = jobs.length ? Math.max.apply(null, jobs.map(function(j){ return j.id; }))+1 : 1;
      jobs.push({ id: nid, name: name, emoji: emoji, location: location, rate: rate, unit: unit, offDays: offDays });
    }
    setJobs(jobs);
    hideJobModal();
    clearJobForm();
    renderJobs();
  }catch(e){ console.warn('saveJobFromUI failed', e); alert('Save failed'); }
}

/* populate modal for editing */
function editJob(id){
  showJobModal(id);
}

/* delete job */
function deleteJob(id){
  try{
    if (!confirm('Delete this job? Its items will be moved to Uncategorized.')) return;
    // Move items referencing this job to uncategorized
    var evs = getEvents();
    evs.forEach(function(ev) { if (ev.bucketId === id && getDomainOfItem(ev) === 'work') delete ev.bucketId; });
    setEvents(evs);
    var tasks = getTasks();
    tasks.forEach(function(t) { if (t.bucketId === id && getDomainOfItem(t) === 'work') delete t.bucketId; });
    setTasks(tasks);
    var rmap = getReminders();
    Object.keys(rmap).forEach(function(dk) {
      (rmap[dk] || []).forEach(function(r) { if (r.bucketId === id && getDomainOfItem(r) === 'work') delete r.bucketId; });
    });
    setReminders(rmap);
    var jobs = getJobs();
    jobs = jobs.filter(function(j){ return j.id !== id; });
    setJobs(jobs);
    renderJobs();
  }catch(e){ console.warn('deleteJob failed', e); }
}

function clearJobForm(){
  try{
    document.getElementById('jobId').value = '';
    document.getElementById('jobName').value = '';
    document.getElementById('jobEmoji').value = '';
    document.getElementById('jobLocation').value = '';
    document.getElementById('jobRate').value = '';
    document.getElementById('jobUnit').value = 'hour';
    _jobModalOffDays = [];
    renderJobOffDaysList();
  }catch(e){ /* ignore */ }
}

/* wire job UI handlers on DOM ready */
(function wireJobsUI(){
  try{
    document.addEventListener('DOMContentLoaded', function(){
      var saveBtn = document.getElementById('saveJobBtn');
      var cancelBtn = document.getElementById('cancelJobBtn');
      var addWorkBtn = document.getElementById('addWorkJobBtn');
      var addOffDayBtn = document.getElementById('addJobOffDayBtn');
      if (saveBtn) saveBtn.addEventListener('click', function(e){ e.preventDefault(); saveJobFromUI(); });
      if (cancelBtn) cancelBtn.addEventListener('click', function(e){ e.preventDefault(); hideJobModal(); });
      if (addWorkBtn) addWorkBtn.addEventListener('click', function(){ showJobModal(); });
      if (addOffDayBtn) addOffDayBtn.addEventListener('click', function() {
        var dateInp = document.getElementById('jobOffDayDate');
        var labelInp = document.getElementById('jobOffDayLabel');
        var date = dateInp ? dateInp.value : '';
        if (!date) { if (dateInp) dateInp.focus(); return; }
        var label = labelInp ? labelInp.value.trim() : '';
        _jobModalOffDays.push({ date: date, label: label });
        _jobModalOffDays.sort(function(a, b) {
          var da = typeof a === 'string' ? a : a.date;
          var db = typeof b === 'string' ? b : b.date;
          return da < db ? -1 : da > db ? 1 : 0;
        });
        if (dateInp) dateInp.value = '';
        if (labelInp) labelInp.value = '';
        renderJobOffDaysList();
      });
      // Click outside modal to close
      var modal = document.getElementById('jobModal');
      if (modal) {
        modal.addEventListener('click', function(e) { if (e.target === modal) hideJobModal(); });
      }
    });
  }catch(e){ console.warn('wireJobsUI failed', e); }
})();

/* generate calendar */
function generateCalendar(){
  const calendarEl = document.getElementById('calendar');
  const monthLabelEl = document.getElementById('monthLabel') || { textContent: '' };
  if (!calendarEl) return;

  calendarEl.innerHTML = '';
  monthLabelEl.textContent = monthNames[selectedMonth] + ' ' + selectedYear;

  for (let i=0;i<7;i++){
    const hdr = document.createElement('div');
    hdr.className = 'calendar-dayname';
    hdr.textContent = weekdayNames[i];
    calendarEl.appendChild(hdr);
  }

  const first = new Date(selectedYear, selectedMonth, 1);
  const start = first.getDay();
  const daysInMonth = new Date(selectedYear, selectedMonth+1, 0).getDate();
  const today = new Date();
  const isCurMonth = today.getFullYear()===selectedYear && today.getMonth()===selectedMonth;
  const reminders = getReminders();
  const monthStart = selectedYear+'-'+pad2(selectedMonth+1)+'-01';
  const monthEnd   = selectedYear+'-'+pad2(selectedMonth+1)+'-'+pad2(daysInMonth);
  const events = getExpandedEvents(monthStart, monthEnd);

  for (let i=0;i<start;i++) calendarEl.appendChild(document.createElement('div'));

  const theme = themes[selectedMonth] || themes[0];

  for (let day=1; day<=daysInMonth; day++){
    const dt = new Date(selectedYear, selectedMonth, day);
    const dow = dt.getDay();
    const mmdd = pad2(selectedMonth+1)+'-'+pad2(day);
    const ymd = `${selectedYear}-${pad2(selectedMonth+1)}-${pad2(day)}`;
    const cell = document.createElement('div');
    cell.className = 'day';
    cell.dataset.day = day;

    if (isCurMonth && day === today.getDate()) cell.classList.add('today');
    cell.style.backgroundColor = (dow===0||dow===6) ? theme.weekend : theme.weekday;

    const h = getHoliday(mmdd, selectedYear);
    const dayEvents = events.filter(e=>normalizeDate(e.date)===ymd);
    const dayTasks = getTasks().filter(t=> normalizeDate(t.date)===ymd );
    const dayReminders = reminders[ymd] || [];

    cell.innerHTML = `<div class="day-number">${day}</div><div class="emoji-row" aria-hidden="true"></div>`;

    if (h) cell.title = h.name;
    else if (dayEvents.length) cell.title = dayEvents.map(e=>`${e.time||''} ${e.title}`).join('\n');

    const indicators = [];
    dayEvents.forEach(ev => {
      const domain = (typeof getDomainOfItem === 'function') ? getDomainOfItem(ev) : 'personal';
      indicators.push({kind:'event', emoji: ev.emoji || '📌', title: (ev.time?`[${ev.time}] `:'') + (ev.title||''), id: ev.id, domain: domain, shortTitle: ev.title || ''});
    });
    if (h) indicators.push({kind:'holiday', emoji: h.emoji || '🏳️', title: h.name, domain: 'holiday', shortTitle: h.name});
    if (dayReminders.length) indicators.push({kind:'reminder', emoji: '🔔', title: `${dayReminders.length} reminder${dayReminders.length>1?'s':''}`, domain: 'personal', shortTitle: `${dayReminders.length} reminder${dayReminders.length>1?'s':''}`});
    if (dayTasks.length) indicators.push({kind:'task', emoji: '✅', title: `${dayTasks.length} task${dayTasks.length>1?'s':''}`, domain: 'personal', shortTitle: `${dayTasks.length} task${dayTasks.length>1?'s':''}`});

    const emojiRow = cell.querySelector('.emoji-row');
    const count = Math.max(1, indicators.length);
    const size = Math.max(12, Math.floor(28 / Math.sqrt(count)));
    const _domainColors = getDomainColors();
    indicators.forEach(ind=>{
      const sp = document.createElement('span');
      sp.className = 'event-preview ' + (ind.kind || '');
      sp.dataset.domain = ind.domain || 'personal';
      sp.dataset.shortTitle = ind.shortTitle || '';
      sp.title = ind.title || '';
      if (ind.kind === 'event' && ind.id) sp.dataset.eventId = ind.id;

      /* Mobile: emoji only (default) */
      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'ep-emoji';
      emojiSpan.textContent = ind.emoji || '';
      sp.appendChild(emojiSpan);

      /* Desktop: title label (hidden on mobile via CSS) */
      const labelSpan = document.createElement('span');
      labelSpan.className = 'ep-label';
      labelSpan.textContent = ind.shortTitle || '';
      sp.appendChild(labelSpan);

      sp.style.fontSize = size + 'px';
      const domColor = _domainColors[ind.domain] || '#9b59b6';
      sp.dataset.domainColor = domColor;
      emojiRow.appendChild(sp);
    });

    cell.addEventListener('click', ()=> showReminders(day));
    if (selectedDay === day) cell.classList.add('selected');
    calendarEl.appendChild(cell);
  }
}

/* show reminders + events for a selected day */
function showReminders(day){
  selectedDay = day;
  const calendarEl = document.getElementById('calendar');
  if (calendarEl) {
    [...calendarEl.querySelectorAll('.day')].forEach(c=>{
      const d = parseInt(c.dataset.day,10);
      c.classList.toggle('selected', d===day);
    });
  }

  const key = `${selectedYear}-${pad2(selectedMonth+1)}-${pad2(day)}`;
  const reminders = getReminders();
  const items = reminders[key] || [];

  const rd = document.getElementById('selectedDateLong');
  if (rd){
    rd.textContent = new Date(selectedYear, selectedMonth, day).toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    rd.style.display = 'block';
  }

  const mmdd = pad2(selectedMonth+1)+'-'+pad2(day);
  const h = getHoliday(mmdd, selectedYear);

  const holidayHTML = h ? `<div class="reminder-bar" style="background:#ffe5e3;border-left:4px solid #c0392b;color:#c0392b"><b>${h.emoji} ${h.name}</b></div>` : '';

  const ribbons = document.getElementById('dayTopBars');
  if (ribbons) ribbons.innerHTML = holidayHTML;

  const reminderArea = document.getElementById('reminderBar');
  if (reminderArea){
    if (items.length){
      reminderArea.innerHTML = `<div class="reminder-bar"><b>Reminders for ${monthNames[selectedMonth]} ${day}, ${selectedYear}:</b><ul>${items.map((r,i)=>`<li>${r.time?`[${r.time}] `:''}${escapeHTML(r.text)} <span class="item-controls"><button class="small-btn" onclick="editReminder(${day},${i})">Edit</button><button class="small-btn" onclick="deleteReminder(${day},${i})">Delete</button></span></li>`).join('')}</ul></div>`;
    } else {
      reminderArea.innerHTML = '';
    }
  }

  updateDayProgress(day);

  if (selectedYear != null && selectedMonth != null && day){
    const sel = document.getElementById('dayPartSelect');
    const part = (sel && sel.value && sel.value !== 'auto') ? sel.value : 'auto';
    renderDailyViewForDay(selectedYear, selectedMonth, day, part);
    const container = document.getElementById('dailyView');
    if(container){
      const nowLine = container.querySelector('.dv-now-line');
      if(nowLine) nowLine.scrollIntoView({ behavior:'smooth', block:'center' });
    }
  }
}

/* Add reminder */
function addReminder(e){
  if (e && e.preventDefault) e.preventDefault();
  let dayForKey = null;
  if (selectedDay) dayForKey = `${selectedYear}-${pad2(selectedMonth+1)}-${pad2(selectedDay)}`;
  else {
    const dateInput = document.getElementById('reminderDate');
    if (dateInput && dateInput.value) dayForKey = normalizeDate(dateInput.value);
  }
  if (!dayForKey){
    alert('Select a day on the calendar or choose a date on the Reminders page.');
    return;
  }
  const txtEl = document.getElementById('reminderInput');
  const timeEl = document.getElementById('reminderTime');
  if (!txtEl) return;
  const txt = txtEl.value.trim(); if (!txt) return;
  const time = (timeEl && timeEl.value) || '';
  const r = getReminders();
  if (!r[dayForKey]) r[dayForKey] = [];
  r[dayForKey].push({text:txt,time});
  setReminders(r);
  if (txtEl) txtEl.value=''; if (timeEl) timeEl.value='';
  const parts = dayForKey.split('-');
  if (parts.length===3){
    selectedYear = parseInt(parts[0],10);
    selectedMonth = parseInt(parts[1],10)-1;
    selectedDay = parseInt(parts[2],10);
  }
  generateCalendar();
  showReminders(selectedDay);
}

/* delete/edit reminders */
function deleteReminder(day,index){
  if (!confirm('Delete this reminder?')) return;
  const key = `${selectedYear}-${pad2(selectedMonth+1)}-${pad2(day)}`;
  const r = getReminders();
  if (!r[key]) return;
  r[key].splice(index,1);
  if (!r[key].length) delete r[key];
  setReminders(r);
  showReminders(day); generateCalendar();
}
function editReminder(day,index){
  const key = `${selectedYear}-${pad2(selectedMonth+1)}-${pad2(day)}`;
  const r = getReminders();
  const arr = r[key]||[];
  const item = arr[index];
  if (!item) return;
  document.getElementById('editKind').value='reminder';
  document.getElementById('editReminderKey').value=key;
  document.getElementById('editReminderIndex').value=index;
  document.getElementById('editText').value = item.text||'';
  document.getElementById('editDate').value = key;
  document.getElementById('editTime').value = item.time || '';
  const itemDomain = item.domain || 'personal';
  const editItemDomainEl = document.getElementById('editItemDomain');
  if (editItemDomainEl) editItemDomainEl.value = itemDomain;
  populateBucketSelect(document.getElementById('editBucket'), itemDomain, item.bucketId);
  const bRow = document.getElementById('editBucketRow');
  if (bRow) bRow.style.display = 'block';
  showModalFieldsFor('reminder'); openEditModal('Edit Reminder');
}

/* Tasks list management */
function loadTasks(){
  const tasks = getTasks();
  const list = document.getElementById('taskList');
  if (!list) return;
  list.innerHTML = '';
  const pmap = {'1':'!','2':'!!','3':'!!!'};
  tasks.forEach((t,i)=>{
    const li = document.createElement('li');
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = !!t.done;
    cb.addEventListener('change', ()=>{ const all=getTasks(); all[i].done = cb.checked; setTasks(all); updateProgress(all); updateDashboard(all); updateDayProgress(selectedDay); loadTasks(); });
    const taskTitle = t.title || t.text || '';
    const span = document.createElement('span'); span.innerHTML = ` ${escapeHTML(taskTitle)} ${t.date?`[${t.date}]`:''} ${t.time?`[${t.time}]`:''} Priority:${pmap[t.priority]||t.priority}`; span.className = `category-${t.category||''}`;
    const editBtn = document.createElement('button'); editBtn.className='small-btn'; editBtn.textContent='Edit'; editBtn.addEventListener('click', ()=> editTask(i));
    const delBtn = document.createElement('button'); delBtn.className='small-btn'; delBtn.textContent='Delete'; delBtn.addEventListener('click', ()=> deleteTask(i));
    li.appendChild(cb); li.appendChild(span); li.appendChild(editBtn); li.appendChild(delBtn);
    list.appendChild(li);
  });
  updateProgress(tasks); updateDashboard(tasks);
  updateDayProgress(selectedDay);
}
function addTask(e){
  if (e && e.preventDefault) e.preventDefault();
  const textEl = document.getElementById('newTask');
  if (!textEl) return;
  const text = textEl.value.trim(); if (!text) return;
  const category = document.getElementById('taskCategory') ? document.getElementById('taskCategory').value : 'work';
  const date = normalizeDate(document.getElementById('taskDate') ? document.getElementById('taskDate').value : '');
  const time = document.getElementById('taskTime') ? document.getElementById('taskTime').value : '';
  const priority = document.getElementById('taskPriority') ? document.getElementById('taskPriority').value : '2';
  const tasks = getTasks(); tasks.push({title:text,category,done:false,date,time,priority}); setTasks(tasks);
  if (textEl) textEl.value=''; if (document.getElementById('taskDate')) document.getElementById('taskDate').value=''; if (document.getElementById('taskTime')) document.getElementById('taskTime').value='';
  loadTasks();
}

/* task edit/delete */
function deleteTask(i){ if(!confirm('Delete this task?')) return; const tasks=getTasks(); tasks.splice(i,1); setTasks(tasks); loadTasks(); }
function editTask(i){
  const tasks=getTasks(); const t=tasks[i]; if(!t) return;
  document.getElementById('editKind').value='task';
  document.getElementById('editTaskIndex').value = i;
  document.getElementById('editText').value = t.title || t.text || '';
  document.getElementById('editDate').value = t.date||'';
  document.getElementById('editTime').value = t.time||'';
  document.getElementById('editCategory').value = t.category||'work';
  document.getElementById('editPriority').value = t.priority||'2';
  const itemDomain = t.domain || getDomainOfItem(t);
  const editItemDomainEl = document.getElementById('editItemDomain');
  if (editItemDomainEl) editItemDomainEl.value = itemDomain;
  populateBucketSelect(document.getElementById('editBucket'), itemDomain, t.bucketId);
  const bRow = document.getElementById('editBucketRow');
  if (bRow) bRow.style.display = 'block';
  showModalFieldsFor('task'); openEditModal('Edit Task');
}

/* Render events (fixed) */
function renderEvents(){
  const evs = getEvents().slice();
  const list = document.getElementById('eventList');
  if (!list) return;
  list.innerHTML = '';

  const now = new Date();

  function eventTimestamp(ev){
    const d = normalizeDate(ev.date);
    if (!d) return 0;
    if (ev.time){
      // parse as local date-time (ISO-like)
      const dt = new Date(`${d}T${ev.time}`);
      return isNaN(dt.getTime()) ? new Date(`${d}T00:00`).getTime() : dt.getTime();
    } else {
      return new Date(`${d}T23:59:59`).getTime();
    }
  }

  const upcoming = [], past = [];
  evs.forEach(ev=>{
    const ts = eventTimestamp(ev);
    if (!ts || ts >= now.getTime()) upcoming.push({ev,ts});
    else past.push({ev,ts});
  });

  upcoming.sort((a,b)=> a.ts - b.ts);
  past.sort((a,b)=> a.ts - b.ts);

  const combined = upcoming.map(x=>x.ev).concat(past.map(x=>x.ev));

  combined.forEach(e=>{
    const li = document.createElement('li');
    li.className = 'event-item';
    const isPast = (eventTimestamp(e) || 0) < now.getTime();
    if (isPast) li.classList.add('event-past');

    const bullet = document.createElement('span');
    bullet.className = 'event-bullet';
    bullet.textContent = e.emoji || '📌';
    bullet.setAttribute('aria-hidden','true');

    const content = document.createElement('div');
    content.className = 'event-content';
    const locHtml = e.location ? ` @ <a href="${osmSearchUrl(e.location)}" target="_blank">${escapeHTML(e.location)}</a>` : '';
    const timeHtml = e.time ? (e.endTime ? `[${escapeHTML(e.time)}–${escapeHTML(e.endTime)}] ` : `[${escapeHTML(e.time)}] `) : '';
    const bufferHtml = ((e.preBuffer||0) || (e.postBuffer||0)) ? ` <small style="color:#555">(${e.preBuffer||0}m pre / ${e.postBuffer||0}m post)</small>` : '';
    content.innerHTML = `<b>${escapeHTML(e.title)}</b> — ${escapeHTML(e.date)} ${timeHtml}${locHtml}${bufferHtml}`;

    const actions = document.createElement('span');
    actions.className = 'item-controls';
    const editBtn = document.createElement('button'); editBtn.className='small-btn'; editBtn.textContent='Edit'; editBtn.addEventListener('click', ()=> editEvent(e.id));
    const delBtn = document.createElement('button'); delBtn.className='small-btn'; delBtn.textContent='Delete'; delBtn.addEventListener('click', ()=> deleteEvent(e.id));
    actions.appendChild(editBtn); actions.appendChild(delBtn);

    li.appendChild(bullet);
    li.appendChild(content);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function isWeekendISO(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function parseBufferMinutes(value){
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function syncRepeatUI(prefix){
  const repeatEl = document.getElementById(prefix + 'Repeat');
  const customRow = document.getElementById(prefix + 'RepeatCustomRow');
  const abRow = document.getElementById(prefix + 'RepeatABRow');
  if (!repeatEl) return;
  const mode = repeatEl.value || 'none';
  if (customRow) customRow.style.display = mode === 'custom' ? 'flex' : 'none';
  if (abRow) abRow.style.display = mode === 'weekday_ab' ? 'flex' : 'none';
}

function readRepeatPayload(prefix, eventDate){
  const repeatEl = document.getElementById(prefix + 'Repeat');
  const untilEl = document.getElementById(prefix + 'RepeatUntil');
  const intervalEl = document.getElementById(prefix + 'RepeatInterval');
  const unitEl = document.getElementById(prefix + 'RepeatUnit');
  const abEl = document.getElementById(prefix + 'ABWeek');

  const repeat = repeatEl ? (repeatEl.value || 'none') : 'none';
  const repeatUntil = untilEl ? normalizeDate(untilEl.value || '') : '';
  const payload = { repeat, repeatUntil };

  if (repeat === 'custom') {
    const n = parseInt(intervalEl ? intervalEl.value : '1', 10);
    const unit = (unitEl ? unitEl.value : 'days') || 'days';
    payload.repeatInterval = Number.isFinite(n) ? Math.max(1, Math.min(30, n)) : 1;
    payload.repeatUnit = ['days','weeks','months','years'].includes(unit) ? unit : 'days';
  }

  if (repeat === 'weekday_ab') {
    if (isWeekendISO(eventDate)) {
      throw new Error('A/B weekday pattern requires a weekday start date.');
    }
    payload.abWeek = (abEl && (abEl.value || '').toLowerCase() === 'b') ? 'b' : 'a';
    const skipEl = document.getElementById(prefix + 'ABSkipHolidays');
    payload.abSkipHolidays = skipEl ? skipEl.checked : false;
  }

  return payload;
}

function wireRepeatControls(){
  const eventRepeat = document.getElementById('eventRepeat');
  const editRepeat = document.getElementById('editRepeat');
  if (eventRepeat) {
    eventRepeat.addEventListener('change', function(){ syncRepeatUI('event'); });
    syncRepeatUI('event');
  }
  if (editRepeat) {
    editRepeat.addEventListener('change', function(){ syncRepeatUI('edit'); });
    syncRepeatUI('edit');
  }
}

/* Add event */
function addEvent(e){
  if (e && e.preventDefault) e.preventDefault();
  const title = document.getElementById('eventTitle') ? document.getElementById('eventTitle').value.trim() : '';
  const date = normalizeDate(document.getElementById('eventDate') ? document.getElementById('eventDate').value : '');
  if (!title || !date) { alert('Event needs a title and date'); return; }
  const time = document.getElementById('eventTime') ? document.getElementById('eventTime').value || '' : '';
  const endTime = document.getElementById('eventEndTime') ? document.getElementById('eventEndTime').value || '' : '';
  const endDate = normalizeDate(document.getElementById('eventEndDate') ? document.getElementById('eventEndDate').value : '');
  const location = document.getElementById('eventLocation') ? document.getElementById('eventLocation').value.trim() : '';
  const emoji = document.getElementById('eventEmoji') ? document.getElementById('eventEmoji').value.trim() : '';
  const pre = parseBufferMinutes(document.getElementById('eventPreBuffer') ? document.getElementById('eventPreBuffer').value : 0);
  const post = parseBufferMinutes(document.getElementById('eventPostBuffer') ? document.getElementById('eventPostBuffer').value : 0);

  let repeatPayload;
  try {
    repeatPayload = readRepeatPayload('event', date);
  } catch (err) {
    alert(err && err.message ? err.message : 'Invalid recurrence settings');
    return;
  }

  const category = document.getElementById('eventCategory') ? document.getElementById('eventCategory').value || 'event' : 'event';
  const jobId = document.getElementById('eventJobId') ? document.getElementById('eventJobId').value || '' : '';
  const jobName = document.getElementById('eventJobName') ? document.getElementById('eventJobName').value || '' : '';
  const jobRate = document.getElementById('eventJobRate') ? document.getElementById('eventJobRate').value || '' : '';
  const jobUnit = document.getElementById('eventJobUnit') ? document.getElementById('eventJobUnit').value || '' : '';

  const evs = getEvents();
  const id = evs.length ? Math.max(...evs.map(e=>e.id))+1 : 1;
  const newEvent = Object.assign({
    id,title,date,time,startTime:time,endTime,endDate,location,emoji,category,preBuffer:pre,postBuffer:post
  }, repeatPayload);
  if (category === 'job') {
    if (jobId) newEvent.jobId = jobId;
    if (jobName) newEvent.jobName = jobName;
    if (jobRate) newEvent.jobRate = jobRate;
    if (jobUnit) newEvent.jobUnit = jobUnit;
  }
  evs.push(newEvent);
  setEvents(evs);
  if (document.getElementById('eventTitle')) document.getElementById('eventTitle').value='';
  if (document.getElementById('eventDate')) document.getElementById('eventDate').value='';
  if (document.getElementById('eventTime')) document.getElementById('eventTime').value='';
  if (document.getElementById('eventEndTime')) document.getElementById('eventEndTime').value='';
  if (document.getElementById('eventEndDate')) document.getElementById('eventEndDate').value='';
  if (document.getElementById('eventLocation')) document.getElementById('eventLocation').value='';
  if (document.getElementById('eventEmoji')) document.getElementById('eventEmoji').value='';
  if (document.getElementById('eventCategory')) document.getElementById('eventCategory').value='event';
  if (document.getElementById('eventJobId')) document.getElementById('eventJobId').value='';
  if (document.getElementById('eventJobName')) document.getElementById('eventJobName').value='';
  if (document.getElementById('eventJobRate')) document.getElementById('eventJobRate').value='';
  if (document.getElementById('eventJobUnit')) document.getElementById('eventJobUnit').value='';
  if (document.getElementById('eventJobRow')) document.getElementById('eventJobRow').style.display='none';
  if (document.getElementById('eventRepeat')) document.getElementById('eventRepeat').value='none';
  if (document.getElementById('eventRepeatUntil')) document.getElementById('eventRepeatUntil').value='';
  if (document.getElementById('eventRepeatInterval')) document.getElementById('eventRepeatInterval').value='1';
  if (document.getElementById('eventRepeatUnit')) document.getElementById('eventRepeatUnit').value='days';
  if (document.getElementById('eventABWeek')) document.getElementById('eventABWeek').value='a';
  if (document.getElementById('eventABSkipHolidays')) document.getElementById('eventABSkipHolidays').checked=false;
  syncRepeatUI('event');
  renderEvents(); generateCalendar();
}

/* delete/edit events */
function deleteEvent(id){ if(!confirm('Delete this event?')) return; let evs=getEvents(); evs = evs.filter(e=>e.id!==id); setEvents(evs); renderEvents(); generateCalendar(); if (selectedDay) showReminders(selectedDay); }
function editEvent(id){
  const evs = getEvents(); const idx = evs.findIndex(e=>e.id===id); if (idx===-1) return;
  const e = evs[idx];
  document.getElementById('editKind').value='event';
  document.getElementById('editEventId').value = id;
  document.getElementById('editText').value = e.title || '';
  document.getElementById('editDate').value = e.date || '';
  document.getElementById('editTime').value = e.time || '';
  document.getElementById('editEndTime').value = e.endTime || '';
  if (document.getElementById('editEndDate')) document.getElementById('editEndDate').value = e.endDate || '';
  document.getElementById('editLocation').value = e.location || '';
  document.getElementById('editEmoji').value = e.emoji || '';
  if (document.getElementById('editCategory')) document.getElementById('editCategory').value = e.category || 'event';
  document.getElementById('editPreBuffer').value = parseBufferMinutes(e.preBuffer || 5);
  document.getElementById('editPostBuffer').value = parseBufferMinutes(e.postBuffer || 5);
  document.getElementById('editRepeat').value = e.repeat || 'none';
  document.getElementById('editRepeatUntil').value = e.repeatUntil || '';
  document.getElementById('editRepeatInterval').value = e.repeatInterval || 1;
  document.getElementById('editRepeatUnit').value = e.repeatUnit || 'days';
  document.getElementById('editABWeek').value = e.abWeek || 'a';
  var editSkipHol = document.getElementById('editABSkipHolidays');
  if (editSkipHol) editSkipHol.checked = !!e.abSkipHolidays;
  syncRepeatUI('edit');
  const itemDomain = e.domain || getDomainOfItem(e);
  const editItemDomainEl = document.getElementById('editItemDomain');
  if (editItemDomainEl) editItemDomainEl.value = itemDomain;
  populateBucketSelect(document.getElementById('editBucket'), itemDomain, e.bucketId);
  const bRow = document.getElementById('editBucketRow');
  if (bRow) bRow.style.display = 'block';
  showModalFieldsFor('event'); openEditModal('Edit Event');
}

/* modal helpers */
function openEditModal(title){ const m = document.getElementById('editModal'), h = document.getElementById('editModalHeading'); if (h) h.textContent = title; if (m) m.style.display = 'flex'; }
function closeEditModal(){ const m = document.getElementById('editModal'); if (m) m.style.display = 'none'; }
function showModalFieldsFor(kind){
  const loc = document.getElementById('editLocation'), emoji = document.getElementById('editEmoji'), category = document.getElementById('editCategory'), priority = document.getElementById('editPriority');
  if (!loc || !emoji || !category || !priority) return;
  if (kind==='event'){ loc.parentElement.style.display='block'; emoji.parentElement.style.display='block'; category.parentElement.style.display='block'; priority.parentElement.style.display='none'; }
  else if (kind==='task'){ loc.parentElement.style.display='none'; emoji.parentElement.style.display='none'; category.parentElement.style.display='block'; priority.parentElement.style.display='block'; }
  else { loc.parentElement.style.display='none'; emoji.parentElement.style.display='none'; category.parentElement.style.display='none'; priority.parentElement.style.display='none'; }
}

/* edit form submit handling */
document.addEventListener('click', function(){}, true);
function saveEditHandler(e){
  e.preventDefault();
  const kind = document.getElementById('editKind').value;
  const text = document.getElementById('editText').value.trim();
  const date = normalizeDate(document.getElementById('editDate').value);
  const time = document.getElementById('editTime').value || '';
  const endTime = document.getElementById('editEndTime') ? document.getElementById('editEndTime').value || '' : '';

  if (kind === 'event'){
    const id = parseInt(document.getElementById('editEventId').value,10);
    const evs = getEvents(); const idx = evs.findIndex(x=>x.id===id); if (idx===-1){ closeEditModal(); return; }
    let repeatPayload;
    try {
      repeatPayload = readRepeatPayload('edit', date);
    } catch (err) {
      alert(err && err.message ? err.message : 'Invalid recurrence settings');
      return;
    }
    evs[idx].title = text; evs[idx].date = date; evs[idx].time = time; evs[idx].startTime = time; evs[idx].endTime = endTime; evs[idx].location = document.getElementById('editLocation').value.trim(); evs[idx].emoji = document.getElementById('editEmoji').value.trim();
    var editCatEl = document.getElementById('editCategory');
    if (editCatEl) evs[idx].category = editCatEl.value || 'event';
    evs[idx].endDate = normalizeDate(document.getElementById('editEndDate') ? document.getElementById('editEndDate').value : '') || '';
    evs[idx].preBuffer = parseBufferMinutes(document.getElementById('editPreBuffer').value);
    evs[idx].postBuffer = parseBufferMinutes(document.getElementById('editPostBuffer').value);
    evs[idx].repeat = repeatPayload.repeat;
    evs[idx].repeatUntil = repeatPayload.repeatUntil || '';
    if (repeatPayload.repeat === 'custom') {
      evs[idx].repeatInterval = repeatPayload.repeatInterval;
      evs[idx].repeatUnit = repeatPayload.repeatUnit;
      delete evs[idx].abWeek;
    } else if (repeatPayload.repeat === 'weekday_ab') {
      evs[idx].abWeek = repeatPayload.abWeek;
      evs[idx].abSkipHolidays = repeatPayload.abSkipHolidays || false;
      delete evs[idx].repeatInterval;
      delete evs[idx].repeatUnit;
    } else {
      delete evs[idx].repeatInterval;
      delete evs[idx].repeatUnit;
      delete evs[idx].abWeek;
      delete evs[idx].abSkipHolidays;
    }
    const editBucketEl = document.getElementById('editBucket');
    if (editBucketEl) {
      const bval = editBucketEl.value;
      if (bval) evs[idx].bucketId = parseInt(bval, 10);
      else delete evs[idx].bucketId;
    }
    setEvents(evs); renderEvents(); generateCalendar(); if (selectedDay) showReminders(selectedDay);
    closeEditModal();
    return;
  } else if (kind==='task'){
    const idx = parseInt(document.getElementById('editTaskIndex').value,10);
    const tasks = getTasks(); if (!tasks[idx]) { closeEditModal(); return; }
    tasks[idx].title = text; tasks[idx].date = date; tasks[idx].time = time; tasks[idx].category = document.getElementById('editCategory').value; tasks[idx].priority = document.getElementById('editPriority').value;
    const editBucketElT = document.getElementById('editBucket');
    if (editBucketElT) {
      const bvalT = editBucketElT.value;
      if (bvalT) tasks[idx].bucketId = parseInt(bvalT, 10);
      else delete tasks[idx].bucketId;
    }
    setTasks(tasks); loadTasks();
  } else if (kind==='reminder'){
    const origKey = document.getElementById('editReminderKey').value;
    const ridx = parseInt(document.getElementById('editReminderIndex').value,10);
    const r = getReminders(); const arr = r[origKey] || []; const item = arr[ridx]; if (!item){ closeEditModal(); return; }
    const newDate = date || origKey;
    arr.splice(ridx,1); if (!arr.length) delete r[origKey];
    if (!r[newDate]) r[newDate]=[];
    const newR = {text,time};
    const editItemDomainEl2 = document.getElementById('editItemDomain');
    if (editItemDomainEl2 && editItemDomainEl2.value) newR.domain = editItemDomainEl2.value;
    const editBucketElR = document.getElementById('editBucket');
    if (editBucketElR && editBucketElR.value) newR.bucketId = parseInt(editBucketElR.value, 10);
    r[newDate].push(newR);
    setReminders(r);
    const parts = newDate.split('-');
    if (parts.length===3){ selectedYear = parseInt(parts[0],10); selectedMonth = parseInt(parts[1],10)-1; selectedDay = parseInt(parts[2],10); }
    generateCalendar(); showReminders(selectedDay);
  }
  closeEditModal();
  refreshVisibleDomainPages();
}

/* progress & dashboard */
const RING_CIRCUMFERENCE = 2 * Math.PI * 18; // ~113.1

function setRing(fgId, pctId, percent, color){
  const fg = document.getElementById(fgId);
  const pctEl = document.getElementById(pctId);
  if (fg) {
    const offset = RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE;
    fg.style.strokeDashoffset = offset;
    fg.style.stroke = color;
  }
  if (pctEl) pctEl.textContent = Math.round(percent) + '%';
}

function getTodayISO(){
  const d = new Date();
  return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
}

/* Ring 1: tasks + reminders + events completion for today */
function updateCompletionRing(){
  const todayStr = getTodayISO();
  // Tasks for today
  const tasks = getTasks().filter(t => t.date && normalizeDate(t.date) === todayStr);
  const tasksDone = tasks.filter(t => t.done).length;
  // Reminders for today
  const rems = getReminders();
  const todayReminders = rems[todayStr] || [];
  const remDone = todayReminders.filter(r => r.done).length;
  // Events for today
  const todayEvents = getExpandedEvents(todayStr, todayStr);
  // Events count as "done" if their end time has passed
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let eventsDone = 0;
  todayEvents.forEach(ev => {
    const endStr = ev.endTime || '';
    if (endStr) {
      const parts = endStr.match(/(\d{1,2}):(\d{2})/);
      if (parts) {
        const endMins = parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
        if (nowMins >= endMins) eventsDone++;
        return;
      }
    }
    // No end time: treat as done only at end of day (23:59)
    if (nowMins >= 1439) eventsDone++;
  });
  const total = tasks.length + todayReminders.length + todayEvents.length;
  const done = tasksDone + remDone + eventsDone;
  const pct = total ? Math.round((done / total) * 100) : 100;
  const color = pct === 100 ? '#27ae60' : '#4a90e2';
  setRing('completionRingFg', 'completionRingPct', pct, color);
  const wrap = document.getElementById('completionRingWrap');
  if (wrap) wrap.title = done + '/' + total + ' items done today';
}

/* Ring 2: percent of day elapsed (current time as decimal hours / 24) */
function updateDayElapsedRing(){
  const now = new Date();
  const decimalHours = now.getHours() + now.getMinutes() / 60;
  const pct = Math.round((decimalHours / 24) * 100);
  const color = pct >= 75 ? '#e74c3c' : pct >= 50 ? '#e67e22' : '#f1c40f';
  setRing('dayElapsedRingFg', 'dayElapsedRingPct', pct, color);
  const wrap = document.getElementById('dayElapsedRingWrap');
  if (wrap) wrap.title = now.getHours() + 'h ' + now.getMinutes() + 'm elapsed';
}

/* Weekly salary calculation based on jobs */
function updateWeeklySalary(){
  const el = document.getElementById('weeklySalaryDisplay');
  if (!el) return;
  try {
    const todayStr = getTodayISO();
    // Determine week range (Sunday–Saturday)
    const todayDate = new Date(todayStr + 'T12:00:00');
    const dow = todayDate.getDay();
    const weekStartDate = new Date(todayDate);
    weekStartDate.setDate(todayDate.getDate() - dow);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    const weekStartISO = weekStartDate.getFullYear()+'-'+pad2(weekStartDate.getMonth()+1)+'-'+pad2(weekStartDate.getDate());
    const weekEndISO = weekEndDate.getFullYear()+'-'+pad2(weekEndDate.getMonth()+1)+'-'+pad2(weekEndDate.getDate());

    const weekEvents = getExpandedEvents(weekStartISO, weekEndISO);
    const jobs = getJobs();
    if (!jobs.length) { el.innerHTML = ''; return; }

    // Build a lookup for jobs by id
    const jobMap = {};
    jobs.forEach(j => { jobMap[j.id] = j; });

    let totalSalary = 0;
    // Count occurrences per job this week
    const jobOccurrences = {};
    weekEvents.forEach(ev => {
      const jid = ev.jobId || ev.eventJobId || '';
      if (!jid) return;
      const id = typeof jid === 'number' ? jid : parseInt(jid, 10);
      if (!jobMap[id]) return;
      jobOccurrences[id] = (jobOccurrences[id] || 0) + 1;

      // If event has its own rate snapshot, use it; otherwise use job master rate
      const job = jobMap[id];
      const rate = parseFloat(ev.jobRate || ev.eventJobRate || job.rate) || 0;
      const unit = ev.jobUnit || ev.eventJobUnit || job.unit || 'hour';

      if (unit === 'job') {
        // flat rate per occurrence
        totalSalary += rate;
      } else if (unit === 'day') {
        totalSalary += rate;
      } else {
        // hourly: calculate hours from start/end time
        let hours = 0;
        const startStr = ev.startTime || ev.time || '';
        const endStr = ev.endTime || '';
        if (startStr && endStr) {
          const sp = startStr.match(/(\d{1,2}):(\d{2})/);
          const ep = endStr.match(/(\d{1,2}):(\d{2})/);
          if (sp && ep) {
            const sm = parseInt(sp[1],10)*60+parseInt(sp[2],10);
            const em = parseInt(ep[1],10)*60+parseInt(ep[2],10);
            hours = Math.max(0, (em - sm) / 60);
          }
        }
        // fallback: if no times, assume default work hours
        var DEFAULT_WORK_HOURS = 8;
        if (!hours) hours = DEFAULT_WORK_HOURS;
        totalSalary += rate * hours;
      }
    });

    if (totalSalary > 0) {
      el.innerHTML = '💰 Est. weekly salary: <strong>$' + totalSalary.toFixed(2) + '</strong>';
    } else {
      el.innerHTML = '';
    }
  } catch(e) { el.innerHTML = ''; console.warn('weeklySalary error', e); }
}

/* Legacy wrappers: updateProgress / updateDashboard / updateDayProgress still called from other code */
function updateProgress(tasks){
  updateCompletionRing();
}
function updateDashboard(tasks){
  const total = tasks.length;
  const done = tasks.filter(t=>t.done).length;
  const categories = tasks.reduce((acc,t)=>{ acc[t.category]= (acc[t.category]||0)+1; return acc; },{});
  const summary = document.getElementById('summaryStats');
  if (summary) summary.innerHTML = `Total tasks: ${total}<br>Completed: ${done}<br>Work: ${categories.work||0}, Personal: ${categories.personal||0}, Errands: ${categories.errands||0}`;
  updateCompletionRing();
  updateDayElapsedRing();
  updateWeeklySalary();
}
function updateDayProgress(day){
  updateCompletionRing();
  updateDayElapsedRing();
}

/* Keyless autocomplete via OpenStreetMap Nominatim */
function initPlaces(){
  try{
    function fetchPlaceSuggestions(query, signal){
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`;
      return fetch(url, {
        signal,
        headers: { 'Accept': 'application/json' }
      }).then(r => {
        if (!r.ok) throw new Error('Nominatim lookup failed');
        return r.json();
      });
    }

    function attachAutocompleteUI(input, listEl){
      let abortController = null;
      let debounceTimer = null;
      input.dataset.place = '';
      function hideList(){ listEl.style.display = 'none'; listEl.innerHTML = ''; }
      input.addEventListener('input', function(){
        const q = input.value.trim();
        if (debounceTimer) clearTimeout(debounceTimer);
        if (abortController) abortController.abort();
        if (!q || q.length < 3){ hideList(); return; }

        debounceTimer = setTimeout(() => {
          abortController = new AbortController();
          fetchPlaceSuggestions(q, abortController.signal).then(preds => {
            if (!Array.isArray(preds) || !preds.length){ hideList(); return; }
            listEl.innerHTML = '';
            preds.forEach(p=>{
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.textContent = p.display_name || p.name || q;
              btn.addEventListener('click', ()=>{
                const lat = p.lat != null ? Number(p.lat) : null;
                const lng = p.lon != null ? Number(p.lon) : null;
                const address = p.display_name || input.value;
                input.value = address;
                hideList();
                input.dataset.place = JSON.stringify({
                  address,
                  lat: Number.isFinite(lat) ? lat : null,
                  lng: Number.isFinite(lng) ? lng : null,
                  placeId: p.place_id || null
                });
                input.dispatchEvent(new Event('change'));
              });
              listEl.appendChild(btn);
            });
            listEl.style.display = 'block';
          }).catch(err => {
            if (err && err.name === 'AbortError') return;
            hideList();
          });
        }, 250);
      });
      input.addEventListener('blur', ()=> setTimeout(hideList, 200));
      input.addEventListener('focus', ()=> { if (input.value && listEl.children.length) listEl.style.display = 'block'; });
      input.addEventListener('keydown', (e)=> { if (e.key === 'Enter') e.stopPropagation(); });
    }

    const evtInput = document.getElementById('eventLocation');
    const evtList = document.getElementById('eventLocationList');
    if (evtInput && evtList) attachAutocompleteUI(evtInput, evtList);

    const editInput = document.getElementById('editLocation');
    const editList = document.getElementById('editLocationList');
    if (editInput && editList) attachAutocompleteUI(editInput, editList);

    // new: attach to userHome if present
    const userHomeInput = document.getElementById('userHome');
    const userHomeList = document.getElementById('userHomeList');
    if (userHomeInput && userHomeList) attachAutocompleteUI(userHomeInput, userHomeList);

    // attach to jobLocation if present
    const jobLocInput = document.getElementById('jobLocation');
    const jobLocList = document.getElementById('jobLocationList');
    if (jobLocInput && jobLocList) attachAutocompleteUI(jobLocInput, jobLocList);

  }catch(err){ console.warn('initPlaces error', err); }
}

/* UI: overlay inputs */
function initOverlayInputs(){
  document.querySelectorAll('.overlay-input').forEach(container=>{
    const input = container.querySelector('.overlay-field');
    if(!input) return;
    const toggle = ()=> {
      if(input.value && input.value.length) container.classList.add('has-value'); else container.classList.remove('has-value');
    };
    input.addEventListener('input', toggle);
    input.addEventListener('focus', ()=> container.classList.add('focused'));
    input.addEventListener('blur', ()=> container.classList.remove('focused'));
    toggle();
  });
}

/* SPA view switching */
function showView(view, updateHash = true){
  view = view || 'today';
  /* Ensure modals are closed when switching views */
  try { hideJobModal(); } catch(_) {}
  document.querySelectorAll('[id^="page-"]').forEach(p=> p.classList.add('hidden'));
  const el = document.getElementById('page-'+view) || document.getElementById('page-today');
  if (el) el.classList.remove('hidden');
  document.querySelectorAll('.bottom-ribbon .r-item').forEach(a=>{
    const href = a.getAttribute('href') || '';
    const candidate = (a.dataset && a.dataset.view) ? a.dataset.view : (href.indexOf('#')>-1 ? href.split('#').pop() : '');
    a.classList.toggle('active', candidate === view);
  });
  if (view === 'today'){ try{ generateCalendar(); }catch(e){ console.warn(e); } if (selectedDay) try{ showReminders(selectedDay); }catch(e){ console.warn(e); } }
  else if (view === 'calendar'){ try{ generateCalendar(); }catch(e){ console.warn(e); } try{ renderCalendarSummary(); }catch(e){ console.warn(e); } }
  else if (view === 'events'){ try{ renderEvents(); }catch(e){ console.warn(e); } }
  else if (view === 'tasks'){ try{ loadTasks(); }catch(e){ console.warn(e); } }
  else if (view === 'jobs'){ try{ renderJobs(); }catch(e){ console.warn(e); } }
  else if (view === 'inbox'){ try{ renderInbox(); updateInboxBadge(); }catch(e){ console.warn(e); } }
  else if (view === 'personal' || view === 'home' || view === 'work'){ try{ renderDomainPage(view); }catch(e){ console.warn(e); } }
  if (updateHash){ const newHash = '#'+view; if (location.hash !== newHash) location.hash = newHash; }
  try { window.dispatchEvent(new CustomEvent('view:show', { detail: { view: view } })); } catch(_) {}
}
window.addEventListener('hashchange', ()=> {
  const v = (location.hash && location.hash.length>1) ? location.hash.slice(1) : 'today';
  showView(v, false);
});

/* event wiring */
function attachPageListeners(){
  try{
    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    if (prev) prev.addEventListener('click', ()=>{ selectedMonth--; if (selectedMonth<0){ selectedMonth=11; selectedYear--; } generateCalendar(); selectedDay = Math.min(selectedDay||1, new Date(selectedYear,selectedMonth+1,0).getDate()); showReminders(selectedDay); });
    if (next) next.addEventListener('click', ()=>{ selectedMonth++; if (selectedMonth>11){ selectedMonth=0; selectedYear++; } generateCalendar(); selectedDay = Math.min(selectedDay||1, new Date(selectedYear,selectedMonth+1,0).getDate()); showReminders(selectedDay); });

    const reminderForm = document.getElementById('reminderForm');
    if (reminderForm) reminderForm.addEventListener('submit', addReminder);
    const addReminderBtn = document.getElementById('addReminderBtn');
    if (addReminderBtn) addReminderBtn.addEventListener('click', addReminder);

    const eventForm = document.getElementById('eventForm');
    if (eventForm) eventForm.addEventListener('submit', addEvent);
    const addEventBtn = document.getElementById('addEventBtn');
    if (addEventBtn) addEventBtn.addEventListener('click', addEvent);

    const taskForm = document.getElementById('taskForm');
    if (taskForm) taskForm.addEventListener('submit', addTask);
    const addTaskBtn = document.getElementById('addTaskBtn');
    if (addTaskBtn) addTaskBtn.addEventListener('click', addTask);

    const cancelEdit = document.getElementById('cancelEdit');
    if (cancelEdit) cancelEdit.addEventListener('click', closeEditModal);

    const editForm = document.getElementById('editForm');
    if (editForm) editForm.addEventListener('submit', saveEditHandler);

    document.querySelectorAll('.bottom-ribbon .r-item').forEach(a=>{
      if (a.__ribbonBound) return;
      a.__ribbonBound = true;
      a.addEventListener('click', function(ev){
        const href = a.getAttribute('href') || '';
        const targetView = (a.dataset && a.dataset.view) ? a.dataset.view : (href.indexOf('#')>-1 ? href.split('#').pop() : '');
        const onIndex = location.pathname.endsWith('index.html') || location.pathname.endsWith('/') || location.pathname.endsWith('/index.html');
        const isHashOnly = href && href.trim().startsWith('#');
        if (onIndex || isHashOnly){
          ev.preventDefault();
          showView(targetView || 'today');
        }
      });
    });

    const sel = document.getElementById('dayPartSelect');
    if(sel){
      sel.addEventListener('change', ()=>{
        if (selectedYear != null && selectedMonth != null && selectedDay != null){
          const key = sel.value === 'auto' ? 'auto' : sel.value;
          renderDailyViewForDay(selectedYear, selectedMonth, selectedDay, key);
        }
      });
    }
  }catch(e){ console.warn('attachPageListeners failed', e); }
}

/* expose inline handlers */
window.editEvent = editEvent;
window.deleteEvent = deleteEvent;
window.editReminder = editReminder;
window.deleteReminder = deleteReminder;
window.showView = showView;

/* startup after DOM ready */
document.addEventListener('DOMContentLoaded', function(){
  try{
    applyDomainColorCSS();
    migrateConsistencyData();
    const now = new Date();
    selectedMonth = now.getMonth();
    selectedYear = now.getFullYear();
    selectedDay = now.getDate();
    attachPageListeners();
    const initial = (location.hash && location.hash.length>1) ? location.hash.slice(1) : 'today';
    try { showView(initial, false); } catch(e){ console.warn('showView failed', e); }
    try{ if (document.getElementById('calendar')) generateCalendar(); }catch(e){ console.warn('generateCalendar init failed',e); }
    try{ if (document.getElementById('calendar')) showReminders(selectedDay); }catch(e){ console.warn('showReminders init failed',e); }
    try{ if (document.getElementById('taskList')) loadTasks(); }catch(e){ console.warn('loadTasks failed', e); }
    try{ if (document.getElementById('eventList')) renderEvents(); }catch(e){ console.warn('renderEvents failed', e); }
    try{ if (document.getElementById('domain-buckets-work')) renderJobs(); }catch(e){ console.warn('renderJobs failed', e); }
    try{ initPlaces(); }catch(e){ console.warn('initPlaces failed', e); }
    try{ initOverlayInputs(); }catch(e){ console.warn('initOverlayInputs failed', e); }
    try{ wireRepeatControls(); }catch(e){ console.warn('wireRepeatControls failed', e); }

    // set dayPartSelect default to current part if present
    const sel = document.getElementById('dayPartSelect');
    if (sel){
      const now = new Date();
      const curPart = determinePartFromHour(now.getHours());
      // If user had a value, we keep it; otherwise set to current
      if (!sel.value || !DAY_PARTS[sel.value]) sel.value = curPart;
    }
  }catch(err){
    console.error('Init error',err);
    showAppError('Initialization error: ' + (err && err.message || err));
  }
});

/* ---------- User profile persistence & UI wiring ---------- */

/* Read user profile from localStorage */
function readUserProfile(){
  try{
    const raw = localStorage.getItem('USER_PROFILE');
    if (!raw) return { name: '', home: { address:'', placeId:'', lat:null, lng:null } };
    return JSON.parse(raw) || { name: '', home: { address:'', placeId:'', lat:null, lng:null } };
  }catch(e){ return { name: '', home: { address:'', placeId:'', lat:null, lng:null } }; }
}

/* Save profile object */
function writeUserProfile(profile){
  try{
    localStorage.setItem('USER_PROFILE', JSON.stringify(profile||{}));
  }catch(e){ console.warn('writeUserProfile failed', e); }
}

/* update profile UI elements (welcome + dashboard + settings link) */
function updateProfileUI(){
  try{
    const p = readUserProfile();
    const welcome = document.getElementById('welcomeText');
    const dashH = document.getElementById('dashboardHeading');
    if (welcome) welcome.textContent = p.name ? `Welcome, ${p.name}` : 'Welcome,';
    if (dashH) dashH.textContent = p.name ? `${p.name}'s Dashboard` : '📊 Dashboard';

    // update settings inputs if present
    const nameInput = document.getElementById('userName');
    if (nameInput && !nameInput.dataset.userset) nameInput.value = p.name || '';
    const homeInput = document.getElementById('userHome');
    if (homeInput && !homeInput.dataset.userset) homeInput.value = (p.home && p.home.address) ? p.home.address : '';

    // update home directions link
    const homeLink = document.getElementById('homeDirections');
    if (homeLink){
      if (p.home && p.home.address){
        homeLink.href = osmDirectionsUrl(p.home);
        homeLink.textContent = p.home.address;
      } else {
        homeLink.href = '#';
        homeLink.textContent = 'not set';
      }
    }
  }catch(e){ console.warn('updateProfileUI failed', e); }
}

/* Save profile from settings UI */
function saveProfileFromUI(){
  try{
    const nameInput = document.getElementById('userName');
    const homeInput = document.getElementById('userHome');
    if (!nameInput || !homeInput) return;
    const name = nameInput.value.trim();
    const homeAddr = homeInput.value.trim();

    // If the input has dataset.place (from Places autocomplete) parse it
    let homePlace = { address: homeAddr, placeId: null, lat:null, lng:null };
    try{
      if (homeInput.dataset && homeInput.dataset.place){
        const p = JSON.parse(homeInput.dataset.place);
        if (p){
          homePlace.address = p.address || p.description || homeAddr;
          if (p.placeId) homePlace.placeId = p.placeId;
          if (p.lat) homePlace.lat = p.lat;
          if (p.lng) homePlace.lng = p.lng;
          // sometimes Places details use geometry.location.lat()
        }
      }
    }catch(e){ /* ignore parse */ }

    const profile = { name: name, home: homePlace };
    writeUserProfile(profile);
    updateProfileUI();
    alert('Profile saved');
  }catch(e){ console.warn('saveProfileFromUI failed', e); alert('Save failed'); }
}

/* Clear user profile */
function clearUserProfile(){
  try{
    localStorage.removeItem('USER_PROFILE');
    updateProfileUI();
    alert('Profile cleared');
  }catch(e){ console.warn('clearUserProfile failed', e); }
}

/* Expose for debugging/buttons */
window.saveProfileFromUI = saveProfileFromUI;
window.clearUserProfile = clearUserProfile;

/* Wire profile UI on DOMContentLoaded (safe if attachPageListeners runs later) */
(function wireProfileUI(){
  try{
    document.addEventListener('DOMContentLoaded', function(){
      updateProfileUI();
      const saveBtn = document.getElementById('saveProfileBtn');
      const clearBtn = document.getElementById('clearProfileBtn');
      if (saveBtn) saveBtn.addEventListener('click', function(e){ e.preventDefault(); saveProfileFromUI(); });
      if (clearBtn) clearBtn.addEventListener('click', function(e){ e.preventDefault(); if (confirm('Clear saved profile?')) clearUserProfile(); });
      // mark inputs as user-editable so updateProfileUI doesn't overwrite while editing
      const nameInput = document.getElementById('userName');
      const homeInput = document.getElementById('userHome');
      if (nameInput){
        nameInput.addEventListener('input', ()=> { nameInput.dataset.userset = '1'; });
      }
      if (homeInput){
        homeInput.addEventListener('input', ()=> { homeInput.dataset.userset = '1'; });
      }
    });
  }catch(e){ console.warn('wireProfileUI failed', e); }
})();

/* ---------- Data backup: export/import JSON ---------- */
function getTaskCategories(){ return safeParseStorage('taskCategories', []); }

function normalizeRemindersToArray(input){
  const out = [];
  if (!input) return out;
  if (Array.isArray(input)) {
    input.forEach((r)=>{
      if (!r || typeof r !== 'object') return;
      const date = normalizeDate(r.date || r.reminderDate || '');
      if (!date) return;
      const text = (r.text || r.title || '').toString();
      out.push({ id: r.id || null, date, text, time: r.time || r.reminderTime || '', notify: r.notify || r.reminderNotify || 'none' });
    });
    return out;
  }
  if (typeof input === 'object') {
    Object.keys(input).forEach((dateKey)=>{
      const date = normalizeDate(dateKey);
      if (!date) return;
      const list = Array.isArray(input[dateKey]) ? input[dateKey] : [];
      list.forEach((r)=>{
        if (!r || typeof r !== 'object') return;
        const text = (r.text || r.title || '').toString();
        out.push({ id: r.id || null, date, text, time: r.time || r.reminderTime || '', notify: r.notify || r.reminderNotify || 'none' });
      });
    });
  }
  return out;
}

function remindersArrayToMap(remindersArray){
  const map = {};
  (remindersArray || []).forEach((r)=>{
    const date = normalizeDate(r && r.date);
    if (!date) return;
    if (!map[date]) map[date] = [];
    map[date].push({
      id: r.id || null,
      text: (r.text || r.title || '').toString(),
      time: r.time || '',
      notify: r.notify || 'none'
    });
  });
  return map;
}

function getRemindersRaw(){
  return safeParseStorage('reminders', {});
}

function getRemindersForExport(){
  return normalizeRemindersToArray(getRemindersRaw());
}

function setRemindersFromArray(arr){
  setReminders(remindersArrayToMap(arr));
}

function buildExportPayload(){
  return {
    meta: {
      schemaVersion: 1,
      appVersion: 'unknown',
      exportedAt: new Date().toISOString()
    },
    data: {
      events: getEvents(),
      tasks: getTasks(),
      reminders: getRemindersForExport(),
      jobs: getJobs(),
      taskCategories: getTaskCategories(),
      userProfile: readUserProfile(),
      userOffDays: (function(){ try { return JSON.parse(localStorage.getItem('userOffDays') || '[]'); } catch(_) { return []; } })()
    }
  };
}

function setBackupStatus(msg, isError){
  const el = document.getElementById('dataBackupStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#b00020' : '#666';
}

function downloadJson(filename, data){
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseImportPayload(parsed){
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON payload');
  const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;

  const events = Array.isArray(data.events) ? data.events : [];
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const reminders = normalizeRemindersToArray(data.reminders || []);
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  const taskCategories = Array.isArray(data.taskCategories) ? data.taskCategories : [];
  const userProfile = (data.userProfile && typeof data.userProfile === 'object') ? data.userProfile : readUserProfile();

  return { events, tasks, reminders, jobs, taskCategories, userProfile };
}

function eventKey(x){
  const title = (x && x.title ? x.title : '').toString().trim().toLowerCase();
  const date = normalizeDate(x && x.date ? x.date : '');
  const time = (x && (x.time || x.startTime) ? (x.time || x.startTime) : '').toString();
  return ['event', title, date, time].join('|');
}
function taskKey(x){
  const title = (x && (x.title || x.text) ? (x.title || x.text) : '').toString().trim().toLowerCase();
  const date = normalizeDate(x && x.date ? x.date : '');
  const time = (x && x.time ? x.time : '').toString();
  return ['task', title, date, time].join('|');
}
function reminderKey(x){
  const text = (x && (x.text || x.title) ? (x.text || x.title) : '').toString().trim().toLowerCase();
  const date = normalizeDate(x && x.date ? x.date : '');
  const time = (x && x.time ? x.time : '').toString();
  return ['reminder', text, date, time].join('|');
}
function jobKey(x){
  const name = (x && x.name ? x.name : '').toString().trim().toLowerCase();
  const location = (x && x.location ? x.location : '').toString().trim().toLowerCase();
  const rate = (x && x.rate ? x.rate : '').toString();
  const unit = (x && x.unit ? x.unit : '').toString();
  return ['job', name, location, rate, unit].join('|');
}
function categoryKey(x){
  const name = (x && x.name ? x.name : '').toString().trim().toLowerCase();
  return ['cat', name].join('|');
}

function mergeCollection(localList, importList, opts){
  const local = Array.isArray(localList) ? localList.slice() : [];
  const incoming = Array.isArray(importList) ? importList : [];
  const getId = opts.getId;
  const keyOf = opts.keyOf;
  const label = opts.label;

  const localById = new Map();
  const localByKey = new Map();
  local.forEach((item, idx)=>{
    const id = getId(item);
    if (id) localById.set(String(id), idx);
    localByKey.set(keyOf(item), idx);
  });

  const stats = { added: 0, updated: 0, skipped: 0, conflicts: 0 };

  incoming.forEach((item)=>{
    const id = getId(item);
    const byIdIdx = id ? localById.get(String(id)) : undefined;
    const byKeyIdx = localByKey.get(keyOf(item));
    const idx = (typeof byIdIdx === 'number') ? byIdIdx : byKeyIdx;

    if (typeof idx !== 'number') {
      local.push(item);
      const newIdx = local.length - 1;
      const newId = getId(item);
      if (newId) localById.set(String(newId), newIdx);
      localByKey.set(keyOf(item), newIdx);
      stats.added += 1;
      return;
    }

    const existing = local[idx];
    const same = JSON.stringify(existing) === JSON.stringify(item);
    if (same) {
      stats.skipped += 1;
      return;
    }

    stats.conflicts += 1;
    const keepImported = confirm(
      'Merge conflict in ' + label + '.\n\n' +
      'Incoming: ' + JSON.stringify(item) + '\n\n' +
      'Local: ' + JSON.stringify(existing) + '\n\n' +
      'Press OK to keep Imported, Cancel to keep Local.'
    );
    if (keepImported) {
      local[idx] = item;
      stats.updated += 1;
    } else {
      stats.skipped += 1;
    }
  });

  return { list: local, stats };
}

function refreshAfterImport(){
  try { generateCalendar(); } catch(_) {}
  try { if (selectedDay) showReminders(selectedDay); } catch(_) {}
  try { renderEvents(); } catch(_) {}
  try { loadTasks(); } catch(_) {}
  try { renderJobs(); } catch(_) {}
  try { updateProfileUI(); } catch(_) {}
  try { window.dispatchEvent(new CustomEvent('app:data:updated')); } catch(_) {}
  try { window.dispatchEvent(new Event('storage')); } catch(_) {}
}

function applyImportData(importData, mode){
  if (mode === 'overwrite') {
    if (!confirm('Overwrite existing app data with imported data?')) return null;
    setEvents(importData.events);
    setTasks(importData.tasks);
    setRemindersFromArray(importData.reminders);
    setJobs(importData.jobs);
    localStorage.setItem('taskCategories', JSON.stringify(importData.taskCategories));
    if (Array.isArray(importData.userOffDays)) localStorage.setItem('userOffDays', JSON.stringify(importData.userOffDays));
    writeUserProfile(importData.userProfile || readUserProfile());
    refreshAfterImport();
    return {
      events: { added: importData.events.length, updated: 0, skipped: 0, conflicts: 0 },
      tasks: { added: importData.tasks.length, updated: 0, skipped: 0, conflicts: 0 },
      reminders: { added: importData.reminders.length, updated: 0, skipped: 0, conflicts: 0 },
      jobs: { added: importData.jobs.length, updated: 0, skipped: 0, conflicts: 0 },
      taskCategories: { added: importData.taskCategories.length, updated: 0, skipped: 0, conflicts: 0 },
      userProfile: { added: 1, updated: 0, skipped: 0, conflicts: 0 }
    };
  }

  const mergedEvents = mergeCollection(getEvents(), importData.events, {
    label: 'events',
    getId: (x)=>x && x.id,
    keyOf: eventKey
  });
  const mergedTasks = mergeCollection(getTasks(), importData.tasks, {
    label: 'tasks',
    getId: (x)=>x && x.id,
    keyOf: taskKey
  });
  const mergedReminders = mergeCollection(getRemindersForExport(), importData.reminders, {
    label: 'reminders',
    getId: (x)=>x && x.id,
    keyOf: reminderKey
  });
  const mergedJobs = mergeCollection(getJobs(), importData.jobs, {
    label: 'jobs',
    getId: (x)=>x && x.id,
    keyOf: jobKey
  });
  const mergedCategories = mergeCollection(getTaskCategories(), importData.taskCategories, {
    label: 'task categories',
    getId: (x)=>x && x.id,
    keyOf: categoryKey
  });

  let profileStats = { added: 0, updated: 0, skipped: 1, conflicts: 0 };
  const localProfile = readUserProfile();
  const incomingProfile = importData.userProfile || localProfile;
  if (JSON.stringify(localProfile) !== JSON.stringify(incomingProfile)) {
    profileStats = { added: 0, updated: 0, skipped: 0, conflicts: 1 };
    const keepImportedProfile = confirm('Merge conflict in user profile. Press OK to keep Imported, Cancel to keep Local.');
    if (keepImportedProfile) {
      writeUserProfile(incomingProfile);
      profileStats.updated = 1;
    } else {
      profileStats.skipped = 1;
    }
  }

  setEvents(mergedEvents.list);
  setTasks(mergedTasks.list);
  setRemindersFromArray(mergedReminders.list);
  setJobs(mergedJobs.list);
  localStorage.setItem('taskCategories', JSON.stringify(mergedCategories.list));
  // Merge user off-days (union of both lists, deduplicated by date)
  if (Array.isArray(importData.userOffDays)) {
    var localOffDays = (function(){ try { return JSON.parse(localStorage.getItem('userOffDays') || '[]'); } catch(_) { return []; } })();
    var seen = {};
    var merged = [];
    localOffDays.concat(importData.userOffDays).forEach(function(entry) {
      var d = typeof entry === 'string' ? entry : (entry && entry.date ? entry.date : '');
      if (d && !seen[d]) { seen[d] = true; merged.push(entry); }
    });
    merged.sort(function(a, b) {
      var da = typeof a === 'string' ? a : a.date;
      var db = typeof b === 'string' ? b : b.date;
      return da < db ? -1 : da > db ? 1 : 0;
    });
    localStorage.setItem('userOffDays', JSON.stringify(merged));
  }
  refreshAfterImport();

  return {
    events: mergedEvents.stats,
    tasks: mergedTasks.stats,
    reminders: mergedReminders.stats,
    jobs: mergedJobs.stats,
    taskCategories: mergedCategories.stats,
    userProfile: profileStats
  };
}

function summarizeImportResult(stats){
  const keys = ['events','tasks','reminders','jobs','taskCategories','userProfile'];
  const parts = [];
  keys.forEach((k)=>{
    const s = stats[k];
    if (!s) return;
    parts.push(k + ': +' + s.added + ' ~' + s.updated + ' =' + s.skipped + ' !' + s.conflicts);
  });
  return parts.join(' | ');
}

(function wireDataBackupUI(){
  try{
    document.addEventListener('DOMContentLoaded', function(){
      const exportBtn = document.getElementById('exportDataBtn');
      const importBtn = document.getElementById('importDataBtn');
      const importFile = document.getElementById('importDataFile');
      const modeEl = document.getElementById('dataImportMode');

      if (exportBtn) {
        exportBtn.addEventListener('click', function(e){
          e.preventDefault();
          try{
            const payload = buildExportPayload();
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            downloadJson('timescape-backup-' + stamp + '.json', payload);
            setBackupStatus('Export complete at ' + new Date().toLocaleString(), false);
          }catch(err){
            console.warn('Export failed', err);
            setBackupStatus('Export failed: ' + (err && err.message ? err.message : err), true);
          }
        });
      }

      if (importBtn && importFile) {
        importBtn.addEventListener('click', function(e){
          e.preventDefault();
          importFile.value = '';
          importFile.click();
        });

        importFile.addEventListener('change', function(){
          const file = importFile.files && importFile.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = function(){
            try{
              const parsed = JSON.parse(String(reader.result || '{}'));
              const importData = parseImportPayload(parsed);
              const mode = modeEl && modeEl.value === 'merge' ? 'merge' : 'overwrite';
              const stats = applyImportData(importData, mode);
              if (!stats) {
                setBackupStatus('Import cancelled', false);
                return;
              }
              const summary = summarizeImportResult(stats);
              console.info('Import summary:', summary);
              setBackupStatus('Import complete at ' + new Date().toLocaleString(), false);
            }catch(err){
              console.warn('Import failed', err);
              setBackupStatus('Import failed: ' + (err && err.message ? err.message : err), true);
            }
          };
          reader.onerror = function(){
            setBackupStatus('Import failed: could not read file', true);
          };
          reader.readAsText(file);
        });
      }
    });
  }catch(e){
    console.warn('wireDataBackupUI failed', e);
  }
})();

/* ============================================================
   NEW FEATURES: Category Colours, Filter Bar, Week View,
   Quick-Add NLP, Search, Undo, Keyboard Shortcuts,
   Sync Status, Swipe Gestures, Enhanced Dashboard
   ============================================================ */

/* ----- Category colour map ----- */
const CAT_COLORS = {
  work:        '#4a90e2',
  personal:    '#9b59b6',
  home:        '#27ae60',
  errands:     '#e67e22',
  job:         '#f39c12',
  appointment: '#16a085',
  holiday:     '#e74c3c',
  commitment:  '#8e44ad',
  event:       '#4a90e2'
};

/* ----- Active category filter state ----- */
let activeFilter = 'all';

function wireCategoryFilters(){
  document.querySelectorAll('.cat-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.cat || 'all';
      generateCalendar();
      if (selectedDay) showReminders(selectedDay);
    });
  });
}

/* Patch generateCalendar to add colour strip and respect activeFilter */
(function patchGenerateCalendar(){
  const orig = generateCalendar;
  generateCalendar = function(){
    orig();
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    const daysInMonth = new Date(selectedYear, selectedMonth+1, 0).getDate();
    const monthStart = selectedYear+'-'+pad2(selectedMonth+1)+'-01';
    const monthEnd   = selectedYear+'-'+pad2(selectedMonth+1)+'-'+pad2(daysInMonth);
    const events = getExpandedEvents(monthStart, monthEnd);
    calendarEl.querySelectorAll('.day[data-day]').forEach(cell => {
      const day = parseInt(cell.dataset.day, 10);
      const ymd = selectedYear+'-'+pad2(selectedMonth+1)+'-'+pad2(day);
      const dayEvents = events.filter(e => normalizeDate(e.date) === ymd);

      if (activeFilter !== 'all') {
        const hasMatch = dayEvents.some(e => (e.category || 'event') === activeFilter)
          || (activeFilter === 'holiday' && !!getHoliday(pad2(selectedMonth+1)+'-'+pad2(day), selectedYear));
        cell.style.opacity = hasMatch ? '1' : '0.35';
      } else {
        cell.style.opacity = '1';
      }

      if (!dayEvents.length) return;
      const catCounts = {};
      dayEvents.forEach(e => { const c = e.category || 'event'; catCounts[c] = (catCounts[c]||0)+1; });
      const dom = Object.keys(catCounts).sort((a,b)=>catCounts[b]-catCounts[a])[0];
      const color = CAT_COLORS[dom] || '#4a90e2';
      cell.style.borderBottom = '3px solid '+color;
    });
  };
})();

/* ----- Enhanced dashboard ----- */
(function patchUpdateDashboard(){
  const orig = updateDashboard;
  updateDashboard = function(tasks){
    orig(tasks);
    try{
      const todayStr = new Date().toISOString().slice(0,10);
      const todayEvents = getExpandedEvents(todayStr, todayStr);
      const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate()+7);
      const weekEndStr = weekEnd.toISOString().slice(0,10);
      const weekEvents = getExpandedEvents(todayStr, weekEndStr);
      const pending = tasks.filter(t => !t.done).length;
      const catMap = {};
      todayEvents.forEach(e => { const c = e.category||'event'; catMap[c]=(catMap[c]||0)+1; });
      const catStr = Object.keys(catMap).map(c=>c+':'+catMap[c]).join(', ');
      const summary = document.getElementById('summaryStats');
      if (summary){
        const extra = '<br><span style="color:#4a90e2">Today: '+todayEvents.length+' event'+(todayEvents.length!==1?'s':'')+
          (catStr ? ' ('+catStr+')' : '')+
          '</span><br><span style="color:#666">Next 7 days: '+weekEvents.length+' events \u00b7 '+pending+' task'+(pending!==1?'s':'')+' pending</span>';
        summary.innerHTML += extra;
      }
    }catch(e){ /* ignore */ }
  };
})();

/* ----- Week view ----- */
let currentCalView = 'month';

function getWeekStart(year, month, day){
  const d = new Date(year, month, day);
  const dow = d.getDay();
  d.setDate(d.getDate() - dow);
  return d;
}

function renderWeekView(){
  const container = document.getElementById('weekView');
  if (!container) return;
  const ws = getWeekStart(selectedYear, selectedMonth, selectedDay || 1);
  const grid = document.createElement('div');
  grid.className = 'week-grid';
  const today = new Date();
  const todayStr = today.getFullYear()+'-'+pad2(today.getMonth()+1)+'-'+pad2(today.getDate());
  const we = new Date(ws); we.setDate(ws.getDate()+6);
  const weekStartISO = ws.getFullYear()+'-'+pad2(ws.getMonth()+1)+'-'+pad2(ws.getDate());
  const weekEndISO   = we.getFullYear()+'-'+pad2(we.getMonth()+1)+'-'+pad2(we.getDate());
  const allEvents = getExpandedEvents(weekStartISO, weekEndISO);
  const allTasks = getTasks();
  const allReminders = getReminders();

  for (let i=0; i<7; i++){
    const d = new Date(ws); d.setDate(ws.getDate()+i);
    const ymd = d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
    const isToday = ymd === todayStr;
    const isSelected = d.getFullYear()===selectedYear && d.getMonth()===selectedMonth && d.getDate()===(selectedDay||0);
    const theme = themes[d.getMonth()] || themes[0];
    const isWknd = d.getDay()===0||d.getDay()===6;

    const col = document.createElement('div');
    col.className = 'week-col';
    col.style.background = isWknd ? theme.weekend : theme.weekday;
    col.style.borderRadius = '8px'; col.style.padding = '4px';

    const hdr = document.createElement('div');
    hdr.className = 'week-col-header'+(isToday?' today':'')+(isSelected?' selected':'');
    hdr.textContent = weekdayNames[d.getDay()]+' '+d.getDate();
    hdr.style.cursor = 'pointer';
    (function(dd){ hdr.addEventListener('click', () => {
      selectedYear=dd.getFullYear(); selectedMonth=dd.getMonth(); selectedDay=dd.getDate();
      renderWeekView(); showReminders(selectedDay);
    }); })(d);
    col.appendChild(hdr);

    allEvents.filter(e=>normalizeDate(e.date)===ymd).forEach(ev=>{
      const chip=document.createElement('div'); chip.className='week-chip event';
      chip.style.borderLeftColor=CAT_COLORS[ev.category||'event']||'#4a90e2';
      chip.textContent=(ev.emoji||'')+' '+(ev.time?ev.time+' ':'')+( ev.title||'');
      chip.title=ev.title||'';
      (function(id){ chip.addEventListener('click',e=>{ e.stopPropagation(); editEvent(id); }); })(ev.id);
      col.appendChild(chip);
    });
    allTasks.filter(t=>normalizeDate(t.date)===ymd).forEach(t=>{
      const chip=document.createElement('div'); chip.className='week-chip task';
      chip.textContent='\u2705 '+(t.title||t.text||'');
      col.appendChild(chip);
    });
    const rems=allReminders[ymd]||[];
    if(rems.length){ const chip=document.createElement('div'); chip.className='week-chip reminder'; chip.textContent='\uD83D\uDD14 '+rems.length+' reminder'+(rems.length>1?'s':''); col.appendChild(chip); }

    grid.appendChild(col);
  }

  container.innerHTML=''; container.appendChild(grid);
  const ws2=new Date(ws); ws2.setDate(ws2.getDate()+6);
  const ml=document.getElementById('monthLabel');
  if(ml) ml.textContent=monthNames[ws.getMonth()]+' '+ws.getDate()+' \u2013 '+monthNames[ws2.getMonth()]+' '+ws2.getDate()+', '+ws2.getFullYear();
}

function wireViewToggle(){
  const monthBtn=document.getElementById('viewMonthBtn');
  const weekBtn=document.getElementById('viewWeekBtn');
  const calEl=document.getElementById('calendar');
  const weekEl=document.getElementById('weekView');
  if(!monthBtn||!weekBtn) return;

  function setView(v){
    currentCalView=v;
    monthBtn.classList.toggle('active',v==='month');
    weekBtn.classList.toggle('active',v==='week');
    if(calEl) calEl.style.display=v==='month'?'':'none';
    if(weekEl) weekEl.style.display=v==='week'?'':'none';
    if(v==='month') generateCalendar(); else renderWeekView();
  }

  monthBtn.addEventListener('click',()=>setView('month'));
  weekBtn.addEventListener('click',()=>setView('week'));
}

/* ----- Quick-add NLP ----- */
function parseQuickAdd(text){
  if(!text||!text.trim()) return null;
  let s=text.trim();

  let category='';
  let domain='';
  s=s.replace(/[#@](work|personal|home|errands|appointment|job|holiday|event|commitment)\b/gi,(m,c)=>{ const val=c.toLowerCase(); category=val; if(val==='work'||val==='home'||val==='personal') domain=val; return ''; }).trim();

  let time='';
  s=s.replace(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,(m,hh,mm,ap)=>{
    let h=parseInt(hh,10); const min=parseInt(mm||'0',10);
    if(ap&&ap.toLowerCase()==='pm'&&h<12) h+=12;
    if(ap&&ap.toLowerCase()==='am'&&h===12) h=0;
    time=pad2(h)+':'+pad2(min); return '';
  }).trim();

  const now2=new Date();
  let date='';
  const todayStr2=now2.getFullYear()+'-'+pad2(now2.getMonth()+1)+'-'+pad2(now2.getDate());
  function addDays2(n){ const d=new Date(now2); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }

  if(/\btoday\b/i.test(s)){ date=todayStr2; s=s.replace(/\btoday\b/i,'').trim(); }
  else if(/\btomorrow\b/i.test(s)){ date=addDays2(1); s=s.replace(/\btomorrow\b/i,'').trim(); }
  else if(/\bnext\s+(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i.test(s)){
    s=s.replace(/\bnext\s+(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i,(m,wd)=>{
      const days={sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
      const target=days[wd.slice(0,3).toLowerCase()];
      let diff=target-now2.getDay(); if(diff<=0) diff+=7;
      date=addDays2(diff); return '';
    }).trim();
  }
  else if(/\b(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i.test(s)){
    s=s.replace(/\b(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i,(m,wd)=>{
      const days={sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
      const target=days[wd.slice(0,3).toLowerCase()];
      let diff=target-now2.getDay(); if(diff<=0) diff+=7;
      date=addDays2(diff); return '';
    }).trim();
  } else {
    const mNames=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const mMatch=s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/i);
    if(mMatch){ const mo=mNames.indexOf(mMatch[1].toLowerCase())+1; date=now2.getFullYear()+'-'+pad2(mo)+'-'+pad2(parseInt(mMatch[2],10)); s=s.replace(mMatch[0],'').trim(); }
    else{
      const slashMatch=s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
      if(slashMatch){ date=now2.getFullYear()+'-'+pad2(parseInt(slashMatch[1],10))+'-'+pad2(parseInt(slashMatch[2],10)); s=s.replace(slashMatch[0],'').trim(); }
    }
  }

  const title=s.replace(/\s+/g,' ').trim()||text.trim();

  /* Smart auto-sort: detect kind as event, task, reminder, or unsorted */
  const lower=text.toLowerCase();
  const reminderKeywords=/\b(remind\s*(me)?|don'?t\s+forget|do\s+not\s+forget|remember\s+to|note\s+to\s+self|reminder)\b/i;
  const eventKeywords=/\b(meeting|appointment|dinner|lunch|breakfast|party|conference|call|interview|date night|flight|reservation|game|concert|class|lecture|webinar|session|check-?in|stand-?up|sync)\b/i;
  const taskKeywords=/\b(buy|fix|clean|finish|complete|submit|send|write|prepare|review|update|organize|schedule|book|cancel|pay|return|pick\s+up|drop\s+off|do|make|create|build|install|setup|set\s+up)\b/i;

  let kind;
  if(reminderKeywords.test(lower)){
    kind='reminder';
  } else if(date && time){
    kind='event';
  } else if(date && eventKeywords.test(lower)){
    kind='event';
  } else if(date){
    kind='event';
  } else if(!date && time && eventKeywords.test(lower)){
    kind='event';
  } else if(!date && taskKeywords.test(lower)){
    kind='task';
  } else if(!date && eventKeywords.test(lower)){
    kind='event';
  } else {
    kind='unsorted';
  }

  return { title, date:date||'', time, category, domain, kind };
}

function wireQuickAdd(){
  const input=document.getElementById('quickAddInput');
  const btn=document.getElementById('quickAddBtn');
  const prev=document.getElementById('quickAddPreview');
  if(!input) return;

  let _quickAddKindOverride='';

  function kindIcon(k){ return {event:'\uD83D\uDCC5',task:'\u2705',reminder:'\uD83D\uDD14',unsorted:'\uD83D\uDCE5'}[k]||'\u2753'; }
  function kindLabel(k){ return {event:'Event',task:'Task',reminder:'Reminder',unsorted:'Inbox (unsorted)'}[k]||k; }

  function showPreview(){
    const parsed=parseQuickAdd(input.value);
    if(!parsed||!input.value.trim()){ prev.style.display='none'; _quickAddKindOverride=''; return; }
    const effectiveKind=_quickAddKindOverride||parsed.kind;
    prev.style.display='block';
    const icon=kindIcon(effectiveKind);
    const catHtml=parsed.category?'<span style="background:'+(CAT_COLORS[parsed.category]||'#ccc')+';color:#fff;padding:1px 6px;border-radius:10px;font-size:0.8rem">'+escapeHTML(parsed.category)+'</span>':'';

    const kinds=['event','task','reminder','unsorted'];
    const kindBtns=kinds.map(function(k){
      const active=k===effectiveKind;
      return '<button data-qakind="'+k+'" style="border:'+(active?'2px solid #4a90e2':'1px solid #ccc')+';background:'+(active?'#e8f2fe':'#fff')+';border-radius:12px;padding:2px 8px;font-size:0.78rem;cursor:pointer;margin:0 2px">'+kindIcon(k)+' '+kindLabel(k)+'</button>';
    }).join('');

    prev.innerHTML=icon+' <b>'+escapeHTML(parsed.title)+'</b>'+(parsed.date?' '+parsed.date:'')+(parsed.time?' '+parsed.time:'')+(catHtml?' '+catHtml:'')+
      '<div style="margin-top:4px;font-size:0.8rem;color:#555">Sort as: '+kindBtns+'</div>';

    prev.querySelectorAll('[data-qakind]').forEach(function(b){
      b.addEventListener('click',function(e){
        e.preventDefault();
        _quickAddKindOverride=b.dataset.qakind;
        showPreview();
      });
    });
  }

  input.addEventListener('input',function(){ _quickAddKindOverride=''; showPreview(); });
  input.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); doQuickAdd(); } });
  if(btn) btn.addEventListener('click',doQuickAdd);

  function doQuickAdd(){
    const parsed=parseQuickAdd(input.value);
    if(!parsed||!parsed.title) return;
    const effectiveKind=_quickAddKindOverride||parsed.kind;
    let addedLabel='';

    if(effectiveKind==='event'){
      const evs=getEvents();
      const id=evs.length?Math.max.apply(null,evs.map(function(e){return e.id;}))+1:1;
      evs.push({ id, title:parsed.title, date:parsed.date||new Date().toISOString().slice(0,10), time:parsed.time, endTime:'', location:'', emoji:'', category:parsed.category||'event', domain:parsed.domain||'personal', repeat:'none', repeatUntil:'', preBuffer:0, postBuffer:0 });
      setEvents(evs); renderEvents(); generateCalendar(); if(selectedDay) showReminders(selectedDay);
      addedLabel='\uD83D\uDCC5 Event added!';
    } else if(effectiveKind==='reminder'){
      const dateKey=parsed.date||new Date().toISOString().slice(0,10);
      const rems=getReminders();
      if(!rems[dateKey]) rems[dateKey]=[];
      rems[dateKey].push({ text:parsed.title, time:parsed.time||'', notify:'none', domain:parsed.domain||'personal' });
      setReminders(rems); generateCalendar(); if(selectedDay) showReminders(selectedDay);
      addedLabel='\uD83D\uDD14 Reminder added for '+dateKey+'!';
    } else if(effectiveKind==='task'){
      const tasks=getTasks();
      tasks.push({ title:parsed.title, category:parsed.category||'', domain:parsed.domain||'personal', done:false, date:parsed.date||'', time:parsed.time||'', priority:'2' });
      setTasks(tasks); try{ loadTasks(); }catch(_){}
      addedLabel='\u2705 Task added!';
    } else {
      /* unsorted → inbox */
      const inbox=getInbox();
      inbox.push({ title:parsed.title, date:parsed.date||'', time:parsed.time||'', category:parsed.category||'', created:new Date().toISOString() });
      setInbox(inbox);
      updateInboxBadge();
      addedLabel='\uD83D\uDCE5 Added to Inbox — sort it when you\'re ready!';
    }

    input.value=''; prev.style.display='none'; _quickAddKindOverride='';
    showUndoToast(addedLabel);
  }
}

/* ----- Inbox badge & rendering ----- */
function updateInboxBadge(){
  const label=document.getElementById('inboxNavLabel');
  if(!label) return;
  const count=getInbox().length;
  label.textContent=count>0?'Inbox ('+count+')':'Inbox';
}

function renderInbox(){
  const list=document.getElementById('inboxList');
  const empty=document.getElementById('inboxEmpty');
  if(!list) return;
  const inbox=getInbox();
  if(!inbox.length){ list.innerHTML=''; if(empty) empty.style.display='block'; return; }
  if(empty) empty.style.display='none';

  list.innerHTML=inbox.map(function(item,i){
    const datePart=item.date?' <span style="color:#888;font-size:0.85rem">'+escapeHTML(item.date)+'</span>':'';
    const timePart=item.time?' <span style="color:#888;font-size:0.85rem">'+escapeHTML(item.time)+'</span>':'';
    const catPart=item.category?'<span style="background:'+(CAT_COLORS[item.category]||'#ccc')+';color:#fff;padding:1px 6px;border-radius:10px;font-size:0.75rem;margin-left:4px">'+escapeHTML(item.category)+'</span>':'';
    return '<div style="background:#fff;border:1px solid #e6e6e6;border-radius:10px;padding:12px 14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">'
      +'<div style="margin-bottom:6px"><b>'+escapeHTML(item.title)+'</b>'+datePart+timePart+catPart+'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap">'
      +'<button onclick="sortInboxItem('+i+',\'event\')" style="border:1px solid #4a90e2;background:#e8f2fe;border-radius:16px;padding:4px 12px;cursor:pointer;font-size:0.82rem">\uD83D\uDCC5 Event</button>'
      +'<button onclick="sortInboxItem('+i+',\'task\')" style="border:1px solid #27ae60;background:#e8f8ef;border-radius:16px;padding:4px 12px;cursor:pointer;font-size:0.82rem">\u2705 Task</button>'
      +'<button onclick="sortInboxItem('+i+',\'reminder\')" style="border:1px solid #e67e22;background:#fef5e8;border-radius:16px;padding:4px 12px;cursor:pointer;font-size:0.82rem">\uD83D\uDD14 Reminder</button>'
      +'<button onclick="deleteInboxItem('+i+')" style="border:1px solid #e74c3c;background:#fde8e8;border-radius:16px;padding:4px 12px;cursor:pointer;font-size:0.82rem">\u274C Delete</button>'
      +'</div></div>';
  }).join('');
}

function sortInboxItem(index,kind){
  const inbox=getInbox();
  if(index<0||index>=inbox.length) return;
  const item=inbox[index];
  inbox.splice(index,1);
  setInbox(inbox);

  if(kind==='event'){
    const evs=getEvents();
    const id=evs.length?Math.max.apply(null,evs.map(function(e){return e.id;}))+1:1;
    evs.push({ id, title:item.title, date:item.date||new Date().toISOString().slice(0,10), time:item.time||'', endTime:'', location:'', emoji:'', category:item.category||'event', repeat:'none', repeatUntil:'', preBuffer:0, postBuffer:0 });
    setEvents(evs);
    showUndoToast('\uD83D\uDCC5 Sorted as Event!');
  } else if(kind==='reminder'){
    const dateKey=item.date||new Date().toISOString().slice(0,10);
    const rems=getReminders();
    if(!rems[dateKey]) rems[dateKey]=[];
    rems[dateKey].push({ text:item.title, time:item.time||'', notify:'none' });
    setReminders(rems);
    showUndoToast('\uD83D\uDD14 Sorted as Reminder!');
  } else {
    const tasks=getTasks();
    tasks.push({ title:item.title, category:item.category||'', done:false, date:item.date||'', time:item.time||'', priority:'2' });
    setTasks(tasks);
    showUndoToast('\u2705 Sorted as Task!');
  }

  updateInboxBadge(); renderInbox();
  try{ generateCalendar(); }catch(_){}
  try{ if(selectedDay) showReminders(selectedDay); }catch(_){}
  try{ renderEvents(); }catch(_){}
  try{ loadTasks(); }catch(_){}
  refreshVisibleDomainPages();
}
window.sortInboxItem=sortInboxItem;

function deleteInboxItem(index){
  const inbox=getInbox();
  if(index<0||index>=inbox.length) return;
  const removed=inbox.splice(index,1)[0];
  setInbox(inbox);
  updateInboxBadge(); renderInbox();
  pushUndo({ label:'Inbox item "'+removed.title+'" deleted.', undo:function(){ const cur=getInbox(); cur.push(removed); setInbox(cur); updateInboxBadge(); renderInbox(); } });
}
window.deleteInboxItem=deleteInboxItem;

window._focusQuickAdd=function(){ const i=document.getElementById('quickAddInput'); if(i){ showView('today'); i.focus(); i.select(); } };

/* ----- Search modal ----- */
function openSearch(){
  const modal=document.getElementById('searchModal'); if(!modal) return;
  modal.style.display='flex';
  const inp=document.getElementById('searchInput'); if(inp){ inp.value=''; inp.focus(); }
  renderSearchResults('');
}
function closeSearch(){ const modal=document.getElementById('searchModal'); if(modal) modal.style.display='none'; }

function renderSearchResults(q){
  const container=document.getElementById('searchResults'); if(!container) return;
  const term=(q||'').toLowerCase().trim();
  if(!term){ container.innerHTML='<div class="empty-msg">Start typing to search\u2026</div>'; return; }
  const events=getEvents().filter(e=>(e.title||'').toLowerCase().includes(term)||(e.location||'').toLowerCase().includes(term)||(e.date||'').includes(term));
  const tasks=getTasks().filter(t=>(t.title||t.text||'').toLowerCase().includes(term)||(t.date||'').includes(term));
  const remArr=[];
  const rmap=getReminders();
  Object.keys(rmap).forEach(function(dk){ (rmap[dk]||[]).forEach(function(r){ if((r.text||'').toLowerCase().includes(term)||dk.includes(term)) remArr.push(Object.assign({},r,{date:dk})); }); });
  if(!events.length&&!tasks.length&&!remArr.length){ container.innerHTML='<div class="empty-msg">No results found.</div>'; return; }

  // Build results using DOM to avoid inline onclick (security best practice)
  container.innerHTML='';

  function makeItem(titleHtml, subText, kindLabel){ // returns element
    const row=document.createElement('div'); row.className='search-result-item';
    const body=document.createElement('div');
    const t=document.createElement('div'); t.className='search-result-title'; t.innerHTML=titleHtml;
    const s=document.createElement('div'); s.className='search-result-sub'; s.textContent=subText;
    body.appendChild(t); body.appendChild(s);
    const badge=document.createElement('span'); badge.className='search-result-kind'; badge.textContent=kindLabel;
    row.appendChild(body); row.appendChild(badge);
    return row;
  }

  if(events.length){
    const hdr=document.createElement('div'); hdr.className='search-section-header'; hdr.textContent='Events ('+events.length+')'; container.appendChild(hdr);
    events.slice(0,10).forEach(function(ev){
      const col=CAT_COLORS[ev.category||'event']||'#4a90e2';
      const titleHtml='<span style="color:'+col+'">'+(ev.emoji||'\uD83D\uDCCC')+'</span> '+escapeHTML(ev.title||'');
      const sub=[(ev.date||''),(ev.time||''),(ev.location?'@ '+ev.location:'')].filter(Boolean).join(' ');
      const row=makeItem(titleHtml,sub,'event');
      const yr=parseInt((ev.date||'').slice(0,4),10)||selectedYear;
      const mo=parseInt((ev.date||'').slice(5,7),10)-1;
      const dy=parseInt((ev.date||'').slice(8,10),10)||1;
      row.addEventListener('click',function(){ closeSearch(); selectedYear=yr; selectedMonth=mo; selectedDay=dy; showView('calendar'); generateCalendar(); showReminders(dy); });
      container.appendChild(row);
    });
  }
  if(tasks.length){
    const hdr=document.createElement('div'); hdr.className='search-section-header'; hdr.textContent='Tasks ('+tasks.length+')'; container.appendChild(hdr);
    tasks.slice(0,10).forEach(function(t){
      const titleHtml=(t.done?'\u2705':'\u2B1C')+' '+escapeHTML(t.title||t.text||'');
      const sub=[(t.date||''),(t.category?'\u00b7 '+t.category:'')].filter(Boolean).join(' ');
      const row=makeItem(titleHtml,sub,'task');
      row.addEventListener('click',function(){ closeSearch(); showView('tasks'); });
      container.appendChild(row);
    });
  }
  if(remArr.length){
    const hdr=document.createElement('div'); hdr.className='search-section-header'; hdr.textContent='Reminders ('+remArr.length+')'; container.appendChild(hdr);
    remArr.slice(0,10).forEach(function(r){
      const row=makeItem('\uD83D\uDD14 '+escapeHTML(r.text||''),[(r.date||''),(r.time||'')].filter(Boolean).join(' '),'reminder');
      row.addEventListener('click',function(){ closeSearch(); showView('reminders'); });
      container.appendChild(row);
    });
  }
}

function wireSearch(){
  const inp=document.getElementById('searchInput');
  const closeBtn=document.getElementById('closeSearchBtn');
  const modal=document.getElementById('searchModal');
  if(!inp) return;
  inp.addEventListener('input',function(){ renderSearchResults(inp.value); });
  if(closeBtn) closeBtn.addEventListener('click',closeSearch);
  if(modal) modal.addEventListener('click',function(e){ if(e.target===modal) closeSearch(); });
}

window.openSearch=openSearch; window.closeSearch=closeSearch;

/* ----- Undo toast ----- */
const UNDO_TIMEOUT_MS=6000;
const undoStack=[];
let _undoTimer=null;

function pushUndo(action){
  undoStack.push(action);
  showUndoToast(action.label||'Item deleted.');
}
function showUndoToast(msg){
  const toast=document.getElementById('undoToast'); const msgEl=document.getElementById('undoMessage');
  if(!toast) return;
  if(_undoTimer) clearTimeout(_undoTimer);
  if(msgEl) msgEl.textContent=msg;
  toast.classList.add('visible'); toast.style.opacity='1'; toast.style.pointerEvents='auto';
  _undoTimer=setTimeout(hideUndoToast,UNDO_TIMEOUT_MS);
}
function hideUndoToast(){ const t=document.getElementById('undoToast'); if(t){ t.classList.remove('visible'); t.style.opacity='0'; t.style.pointerEvents='none'; } }
function doUndo(){
  const action=undoStack.pop(); if(!action){ hideUndoToast(); return; }
  try{ action.undo(); }catch(e){ console.warn('Undo failed',e); }
  try{ generateCalendar(); }catch(_){} try{ if(selectedDay) showReminders(selectedDay); }catch(_){}
  try{ renderEvents(); }catch(_){} try{ loadTasks(); }catch(_){} hideUndoToast();
  refreshVisibleDomainPages();
}
function wireUndoBtn(){ const btn=document.getElementById('undoBtn'); if(btn) btn.addEventListener('click',doUndo); }

/* Patch delete functions for undo support */
(function patchDeleteFunctions(){
  const origDE=deleteEvent;
  deleteEvent=function(id){
    const item=getEvents().find(function(e){ return e.id===id; });
    if(!item){ origDE(id); return; }
    if(!confirm('Delete this event?')) return;
    setEvents(getEvents().filter(function(e){ return e.id!==id; }));
    renderEvents(); generateCalendar(); if(selectedDay) showReminders(selectedDay);
    pushUndo({ label:'Event "'+item.title+'" deleted.', undo:function(){ const cur=getEvents(); cur.push(item); setEvents(cur); } });
  };
  window.deleteEvent=deleteEvent;

  const origDT=deleteTask;
  deleteTask=function(i){
    const tasks=getTasks(); const item=tasks[i];
    if(!item){ origDT(i); return; }
    if(!confirm('Delete this task?')) return;
    setTasks(tasks.filter(function(_,idx){ return idx!==i; }));
    try{ loadTasks(); }catch(_){}
    const capturedIdx=i;
    pushUndo({ label:'Task "'+(item.title||item.text)+'" deleted.', undo:function(){ const cur=getTasks(); cur.splice(capturedIdx,0,item); setTasks(cur); } });
  };
  window.deleteTask=deleteTask;

  const origDR=deleteReminder;
  deleteReminder=function(day,index){
    const key=selectedYear+'-'+pad2(selectedMonth+1)+'-'+pad2(day);
    const r=getReminders(); const item=r[key]&&r[key][index];
    if(!item){ origDR(day,index); return; }
    if(!confirm('Delete this reminder?')) return;
    r[key].splice(index,1); if(!r[key].length) delete r[key];
    setReminders(r); showReminders(day); generateCalendar();
    pushUndo({ label:'Reminder "'+item.text+'" deleted.', undo:function(){ const cur=getReminders(); if(!cur[key]) cur[key]=[]; cur[key].splice(index,0,item); setReminders(cur); } });
  };
  window.deleteReminder=deleteReminder;
})();

/* ----- Keyboard shortcuts ----- */
function wireKeyboardShortcuts(){
  var VIEWS=['personal','calendar','today','home','work'];
  document.addEventListener('keydown',function(e){
    const tag=document.activeElement&&document.activeElement.tagName;
    const inInput=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); openSearch(); return; }
    if(e.key==='Escape'){ closeSearch(); closeEditModal(); hideUndoToast(); const sh=document.getElementById('shortcutHints'); if(sh) sh.style.display='none'; return; }
    if(inInput) return;
    if(e.key==='?'){ const sh=document.getElementById('shortcutHints'); if(sh) sh.style.display=sh.style.display==='none'?'block':'none'; return; }
    if(e.key==='n'||e.key==='N'||e.key==='/'){ e.preventDefault(); window._focusQuickAdd&&window._focusQuickAdd(); return; }
    if(e.key==='t'||e.key==='T'){ const now3=new Date(); selectedYear=now3.getFullYear(); selectedMonth=now3.getMonth(); selectedDay=now3.getDate(); generateCalendar(); showReminders(selectedDay); return; }
    if(e.key==='ArrowLeft'){ const b=document.getElementById('prevBtn'); if(b) b.click(); return; }
    if(e.key==='ArrowRight'){ const b=document.getElementById('nextBtn'); if(b) b.click(); return; }
    const n=parseInt(e.key,10); if(n>=1&&n<=5){ showView(VIEWS[n-1]); return; }
  });
}

/* ----- Sync status bar ----- */
function wireSyncStatusBar(){
}

/* ----- Swipe to navigate months ----- */
function wireCalendarSwipe(){
  const page=document.getElementById('page-calendar'); if(!page) return;
  let startX=null;
  page.addEventListener('touchstart',function(e){ startX=e.touches[0].clientX; },{passive:true});
  page.addEventListener('touchend',function(e){
    if(startX==null) return;
    const dx=e.changedTouches[0].clientX-startX; startX=null;
    if(Math.abs(dx)<50) return;
    const btn=dx<0?document.getElementById('nextBtn'):document.getElementById('prevBtn');
    if(btn) btn.click();
  },{passive:true});
}

/* ----- Morning Briefing ----- */
function wireMorningBriefing(){
  const enableEl=document.getElementById('morningBriefingEnabled');
  const timeEl=document.getElementById('morningBriefingTime');
  const saveBtn=document.getElementById('saveMorningBriefingBtn');
  const statusEl=document.getElementById('morningBriefingStatus');
  if(enableEl) enableEl.checked=localStorage.getItem('morningBriefingEnabled')==='1';
  if(timeEl&&localStorage.getItem('morningBriefingTime')) timeEl.value=localStorage.getItem('morningBriefingTime');
  if(saveBtn) saveBtn.addEventListener('click',function(){
    const enabled=!!(enableEl&&enableEl.checked);
    const bt=(timeEl&&timeEl.value)||'08:00';
    localStorage.setItem('morningBriefingEnabled',enabled?'1':'0');
    localStorage.setItem('morningBriefingTime',bt);
    scheduleMorningBriefing();
    if(statusEl) statusEl.textContent=enabled?'Briefing set for '+bt+' daily.':'Morning briefing disabled.';
  });
  scheduleMorningBriefing();
}

function scheduleMorningBriefing(){
  if(localStorage.getItem('morningBriefingEnabled')!=='1') return;
  const bt=localStorage.getItem('morningBriefingTime')||'08:00';
  const parts=bt.split(':'); const hh=parseInt(parts[0],10)||8; const mm=parseInt(parts[1],10)||0;
  const now4=new Date();
  const target=new Date(now4.getFullYear(),now4.getMonth(),now4.getDate(),hh,mm,0,0);
  if(target<=now4) target.setDate(target.getDate()+1);
  const delay=target.getTime()-now4.getTime();
  if(delay>0x7FFFFFFF) return; // setTimeout max delay (~24.8 days); will reschedule on next app open
  clearTimeout(window._morningBriefingTimer);
  window._morningBriefingTimer=setTimeout(function(){
    try{
      const ts=new Date().toISOString().slice(0,10);
      const evCount=getExpandedEvents(ts,ts).length;
      const tkCount=getTasks().filter(function(t){ return !t.done&&normalizeDate(t.date)===ts; }).length;
      const body=evCount+' event'+(evCount!==1?'s':'')+', '+tkCount+' task'+(tkCount!==1?'s':'')+' today';
      if('Notification' in window&&Notification.permission==='granted'){
        navigator.serviceWorker.getRegistration().then(function(reg){
          if(reg&&reg.showNotification) reg.showNotification('\u2600\uFE0F Good morning! TimeScape',{body:body,tag:'morning-briefing'});
          else try{ new Notification('\u2600\uFE0F Good morning! TimeScape',{body:body}); }catch(_){}
        }).catch(function(){ try{ new Notification('\u2600\uFE0F Good morning! TimeScape',{body:body}); }catch(_){} });
      }
    }catch(_){}
    setTimeout(scheduleMorningBriefing,60000);
  },delay);
}

/* ============================================================
   DOMAIN PAGES: Personal, Home, Work
   ============================================================ */

/* Domain metadata */
const DOMAIN_META = {
  personal: { label: 'Personal', emoji: '👤', color: '#9b59b6' },
  home:     { label: 'Home',     emoji: '🏡', color: '#27ae60' },
  work:     { label: 'Work',     emoji: '💼', color: '#4a90e2' }
};

/* Inject/update a <style> element to apply stored domain color preferences */
function applyDomainColorCSS() {
  const c = getDomainColors();
  const css = [
    '.event-preview[data-domain="work"]{--domain-color:' + c.work + ';--domain-bg:' + hexToRgba(c.work, 0.10) + '}',
    '.event-preview[data-domain="home"]{--domain-color:' + c.home + ';--domain-bg:' + hexToRgba(c.home, 0.10) + '}',
    '.event-preview[data-domain="personal"]{--domain-color:' + c.personal + ';--domain-bg:' + hexToRgba(c.personal, 0.10) + '}',
    '.event-preview[data-domain="holiday"]{--domain-color:' + c.holiday + ';--domain-bg:' + hexToRgba(c.holiday, 0.10) + '}',
    '.event-preview.reminder{--domain-color:' + c.personal + ';--domain-bg:' + hexToRgba(c.personal, 0.10) + '}',
    '.event-preview.task{--domain-color:' + c.home + ';--domain-bg:' + hexToRgba(c.home, 0.10) + '}'
  ].join('\n');
  let el = document.getElementById('domainColorStyle');
  if (!el) { el = document.createElement('style'); el.id = 'domainColorStyle'; document.head.appendChild(el); }
  el.textContent = css;
  // Sync mutable runtime objects so inline-styled JS also picks up the custom colors
  CAT_COLORS.work = c.work; CAT_COLORS.home = c.home; CAT_COLORS.personal = c.personal; CAT_COLORS.holiday = c.holiday;
  DOMAIN_META.work.color = c.work; DOMAIN_META.home.color = c.home; DOMAIN_META.personal.color = c.personal;
}

/* Wire the domain-color editor UI (settings page) */
function wireDomainColorEditor() {
  var DEFAULTS = DOMAIN_COLOR_DEFAULTS;

  function updateHexLabels() {
    var ids = { work: 'dcWork', home: 'dcHome', personal: 'dcPersonal', holiday: 'dcHoliday' };
    Object.keys(ids).forEach(function (key) {
      var inp = document.getElementById(ids[key]);
      var lbl = document.getElementById(ids[key] + 'Hex');
      if (inp && lbl) lbl.textContent = inp.value.toUpperCase();
    });
  }

  function populateInputs(colors) {
    var inp;
    if ((inp = document.getElementById('dcWork')))     inp.value = colors.work;
    if ((inp = document.getElementById('dcHome')))     inp.value = colors.home;
    if ((inp = document.getElementById('dcPersonal'))) inp.value = colors.personal;
    if ((inp = document.getElementById('dcHoliday')))  inp.value = colors.holiday;
    updateHexLabels();
  }

  ['dcWork', 'dcHome', 'dcPersonal', 'dcHoliday'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', updateHexLabels);
  });

  var saveBtn  = document.getElementById('saveDomainColorsBtn');
  var resetBtn = document.getElementById('resetDomainColorsBtn');
  var status   = document.getElementById('domainColorStatus');

  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      var colors = {
        work:     (document.getElementById('dcWork')     || {}).value || DEFAULTS.work,
        home:     (document.getElementById('dcHome')     || {}).value || DEFAULTS.home,
        personal: (document.getElementById('dcPersonal') || {}).value || DEFAULTS.personal,
        holiday:  (document.getElementById('dcHoliday')  || {}).value || DEFAULTS.holiday
      };
      localStorage.setItem('domainColors', JSON.stringify(colors));
      applyDomainColorCSS();
      if (status) {
        status.textContent = '\u2713 Saved!';
        setTimeout(function () { status.textContent = ''; }, 2500);
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      localStorage.removeItem('domainColors');
      populateInputs(DEFAULTS);
      applyDomainColorCSS();
      if (status) {
        status.textContent = '\u2713 Reset to defaults';
        setTimeout(function () { status.textContent = ''; }, 2500);
      }
    });
  }

  populateInputs(getDomainColors());
}

/* Infer domain from item category (for items without explicit domain field) */
function inferDomainFromItem(item) {
  const cat = item && item.category ? String(item.category).toLowerCase() : '';
  if (cat === 'work' || cat === 'job') return 'work';
  if (cat === 'home') return 'home';
  return 'personal';
}

/* Get the domain of an item, preferring explicit domain field */
function getDomainOfItem(item) {
  if (item && item.domain && DOMAIN_META[item.domain]) return item.domain;
  return inferDomainFromItem(item);
}

/* Migrate domain field onto existing items that lack it */
function migrateDomainField() {
  try {
    const events = getEvents();
    let evChanged = false;
    events.forEach(function(ev) {
      if (!ev.domain) { ev.domain = inferDomainFromItem(ev); evChanged = true; }
    });
    if (evChanged) setEvents(events);

    const tasks = getTasks();
    let taskChanged = false;
    tasks.forEach(function(t) {
      if (!t.domain) { t.domain = inferDomainFromItem(t); taskChanged = true; }
    });
    if (taskChanged) setTasks(tasks);

    const rmap = getReminders();
    let remChanged = false;
    Object.keys(rmap).forEach(function(dk) {
      (rmap[dk] || []).forEach(function(r) {
        if (!r.domain) { r.domain = 'personal'; remChanged = true; }
      });
    });
    if (remChanged) setReminders(rmap);
  } catch (e) {
    console.warn('migrateDomainField failed', e);
  }
}

/* Refresh domain pages that are currently visible */
function refreshVisibleDomainPages() {
  ['personal', 'home', 'work'].forEach(function(d) {
    const page = document.getElementById('page-' + d);
    if (page && !page.classList.contains('hidden')) {
      try { renderDomainPage(d); } catch(e) {}
    }
  });
}

/* Build a domain item element for the domain page list */
function buildDomainItemEl(item, domain) {
  const el = document.createElement('div');
  el.style.cssText = 'background:#fff;border:1px solid #e6e6e6;border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:flex-start;gap:10px;box-shadow:0 1px 4px rgba(0,0,0,0.05)';

  const typeEmoji = { event: '📅', task: '✅', reminder: '🔔' }[item.type] || '📌';

  const left = document.createElement('div');
  left.style.cssText = 'flex:1;text-align:left;min-width:0';

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px';

  const typeBadge = document.createElement('span');
  typeBadge.textContent = typeEmoji;
  typeBadge.style.fontSize = '1rem';

  const titleEl = document.createElement('b');
  titleEl.style.wordBreak = 'break-word';
  titleEl.textContent = item.title || '';
  if (item.done) titleEl.style.textDecoration = 'line-through';

  titleRow.appendChild(typeBadge);
  titleRow.appendChild(titleEl);

  const meta2 = document.createElement('div');
  meta2.style.cssText = 'font-size:0.82rem;color:#666';
  const prioMap = { '1': '!', '2': '!!', '3': '!!!' };
  const metaParts = [];
  if (item.date) metaParts.push(item.date);
  if (item.time) metaParts.push(item.time + (item.endTime ? '\u2013' + item.endTime : ''));
  if (item.location) metaParts.push('@ ' + item.location);
  if (item.priority) metaParts.push('Priority: ' + (prioMap[item.priority] || item.priority));
  meta2.textContent = metaParts.join(' \u00b7 ');

  left.appendChild(titleRow);
  if (meta2.textContent) left.appendChild(meta2);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex-shrink:0';

  const editBtn = document.createElement('button');
  editBtn.className = 'small-btn';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', function() {
    if (item.type === 'event') {
      try { editEvent(item.data.id); } catch(e) { console.warn(e); }
    } else if (item.type === 'task') {
      try { editTask(item.idx); } catch(e) { console.warn(e); }
    } else if (item.type === 'reminder') {
      const rparts = item.dateKey.split('-');
      if (rparts.length === 3) {
        selectedYear = parseInt(rparts[0], 10);
        selectedMonth = parseInt(rparts[1], 10) - 1;
        selectedDay = parseInt(rparts[2], 10);
      }
      try { editReminder(parseInt(rparts[2], 10), item.ridx); } catch(e) { console.warn(e); }
    }
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'small-btn';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', function() {
    if (item.type === 'event') {
      try { deleteEvent(item.data.id); } catch(e) { console.warn(e); }
    } else if (item.type === 'task') {
      try { deleteTask(item.idx); } catch(e) { console.warn(e); }
    } else if (item.type === 'reminder') {
      const rparts = item.dateKey.split('-');
      if (rparts.length === 3) {
        selectedYear = parseInt(rparts[0], 10);
        selectedMonth = parseInt(rparts[1], 10) - 1;
        selectedDay = parseInt(rparts[2], 10);
      }
      try { deleteReminder(parseInt(rparts[2], 10), item.ridx); } catch(e) { console.warn(e); }
    }
    try { renderDomainPage(domain); } catch(e) {}
  });

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  el.appendChild(left);
  el.appendChild(actions);
  return el;
}

/* Render all items for a domain */
function renderDomainPage(domain) {
  /* Delegate to bucket-based rendering if bucket container is present */
  if (document.getElementById('domain-buckets-' + domain)) {
    try { renderBucketPage(domain); } catch(e) { console.warn('renderBucketPage failed', e); }
    return;
  }
  const container = document.getElementById('domain-list-' + domain);
  if (!container) return;

  const todayStr = new Date().toISOString().slice(0, 10);
  const items = [];

  getEvents().forEach(function(ev) {
    if (getDomainOfItem(ev) === domain) {
      items.push({
        type: 'event', title: ev.title || '', date: ev.date || '',
        time: ev.time || '', endTime: ev.endTime || '', location: ev.location || '',
        sortKey: (ev.date || '9999') + (ev.time || '23:59'), data: ev
      });
    }
  });

  getTasks().forEach(function(t, idx) {
    if (getDomainOfItem(t) === domain) {
      items.push({
        type: 'task', title: t.title || t.text || '', date: t.date || '',
        time: t.time || '', priority: t.priority, done: !!t.done,
        sortKey: (t.date || '9999') + (t.time || '23:59'), data: t, idx: idx
      });
    }
  });

  const rmap = getReminders();
  Object.keys(rmap).forEach(function(dateKey) {
    (rmap[dateKey] || []).forEach(function(r, ridx) {
      if (getDomainOfItem(r) === domain) {
        items.push({
          type: 'reminder', title: r.text || '', date: dateKey,
          time: r.time || '', sortKey: dateKey + (r.time || '23:59'),
          data: r, dateKey: dateKey, ridx: ridx
        });
      }
    });
  });

  const dated = items.filter(function(i) { return !!i.date; });
  const undated = items.filter(function(i) { return !i.date; });
  const upcoming = dated.filter(function(i) { return i.sortKey >= todayStr; })
    .sort(function(a, b) { return a.sortKey.localeCompare(b.sortKey); });
  const past = dated.filter(function(i) { return i.sortKey < todayStr; })
    .sort(function(a, b) { return b.sortKey.localeCompare(a.sortKey); });
  const sorted = upcoming.concat(undated).concat(past);

  container.innerHTML = '';
  if (!sorted.length) {
    container.innerHTML = '<div style="color:#aaa;text-align:center;padding:24px 0">No items yet. Add your first one above!</div>';
    return;
  }
  sorted.forEach(function(item) {
    container.appendChild(buildDomainItemEl(item, domain));
  });
}

/* Add an event to a domain */
function addDomainEvent(domain) {
  const titleEl = document.getElementById(domain + '-ev-title');
  const dateEl  = document.getElementById(domain + '-ev-date');
  const timeEl  = document.getElementById(domain + '-ev-time');
  const endEl   = document.getElementById(domain + '-ev-endtime');
  if (!titleEl) return;
  const title = titleEl.value.trim();
  if (!title) { alert('Enter an event title'); return; }
  const date = normalizeDate(dateEl ? dateEl.value : '') || new Date().toISOString().slice(0, 10);
  const time = timeEl ? timeEl.value : '';
  const endTime = endEl ? endEl.value : '';
  const evs = getEvents();
  const id = evs.length ? Math.max.apply(null, evs.map(function(e) { return e.id; })) + 1 : 1;
  evs.push({ id, title, date, time, startTime: time, endTime, location: '', emoji: '', category: domain, domain: domain, repeat: 'none', repeatUntil: '', preBuffer: 0, postBuffer: 0 });
  setEvents(evs);
  if (titleEl) titleEl.value = '';
  if (dateEl)  dateEl.value  = '';
  if (timeEl)  timeEl.value  = '';
  if (endEl)   endEl.value   = '';
  generateCalendar();
  renderDomainPage(domain);
  showUndoToast('\uD83D\uDCC5 Event added to ' + DOMAIN_META[domain].label + '!');
}

/* Add a task to a domain */
function addDomainTask(domain) {
  const titleEl    = document.getElementById(domain + '-task-title');
  const dateEl     = document.getElementById(domain + '-task-date');
  const priorityEl = document.getElementById(domain + '-task-priority');
  if (!titleEl) return;
  const title = titleEl.value.trim();
  if (!title) { alert('Enter a task title'); return; }
  const date     = normalizeDate(dateEl ? dateEl.value : '') || '';
  const priority = priorityEl ? priorityEl.value : '2';
  const tasks = getTasks();
  tasks.push({ title, category: '', domain: domain, done: false, date, time: '', priority });
  setTasks(tasks);
  if (titleEl) titleEl.value = '';
  if (dateEl)  dateEl.value  = '';
  renderDomainPage(domain);
  try { loadTasks(); } catch(_) {}
  showUndoToast('\u2705 Task added to ' + DOMAIN_META[domain].label + '!');
}

/* Add a reminder to a domain */
function addDomainReminder(domain) {
  const textEl = document.getElementById(domain + '-rem-text');
  const dateEl = document.getElementById(domain + '-rem-date');
  const timeEl = document.getElementById(domain + '-rem-time');
  if (!textEl) return;
  const text = textEl.value.trim();
  if (!text) { alert('Enter reminder text'); return; }
  const date = normalizeDate(dateEl ? dateEl.value : '') || new Date().toISOString().slice(0, 10);
  const time = timeEl ? timeEl.value : '';
  const rmap = getReminders();
  if (!rmap[date]) rmap[date] = [];
  rmap[date].push({ text, time, notify: 'none', domain: domain });
  setReminders(rmap);
  if (textEl) textEl.value = '';
  if (dateEl) dateEl.value = '';
  if (timeEl) timeEl.value = '';
  generateCalendar();
  renderDomainPage(domain);
  showUndoToast('\uD83D\uDD14 Reminder added to ' + DOMAIN_META[domain].label + '!');
}

/* Wire domain form tabs and add buttons */
function wireDomainForms() {
  const domains = ['personal', 'home', 'work'];
  domains.forEach(function(domain) {
    const tabContainer = document.querySelector('.domain-type-tabs[data-domain="' + domain + '"]');
    if (tabContainer) {
      tabContainer.querySelectorAll('.domain-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          const type = tab.dataset.type;
          tabContainer.querySelectorAll('.domain-tab').forEach(function(t) { t.classList.remove('active'); });
          tab.classList.add('active');
          ['event', 'task', 'reminder'].forEach(function(t) {
            const panel = document.getElementById('domain-form-' + domain + '-' + t);
            if (panel) panel.classList.toggle('hidden', t !== type);
          });
        });
      });
    }

    document.querySelectorAll('.domain-add-btn[data-domain="' + domain + '"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const type = btn.dataset.type;
        if (type === 'event') addDomainEvent(domain);
        else if (type === 'task') addDomainTask(domain);
        else if (type === 'reminder') addDomainReminder(domain);
      });
    });

    [domain + '-ev-title', domain + '-task-title', domain + '-rem-text'].forEach(function(inputId) {
      const inp = document.getElementById(inputId);
      if (!inp) return;
      const type = inputId.indexOf('-ev-') !== -1 ? 'event' : (inputId.indexOf('-task-') !== -1 ? 'task' : 'reminder');
      inp.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (type === 'event') addDomainEvent(domain);
        else if (type === 'task') addDomainTask(domain);
        else if (type === 'reminder') addDomainReminder(domain);
      });
    });
  });
}

/* ============================================================
   BUCKET PAGES: Personal, Home, Work — category/bucket grouping
   ============================================================ */

/* Populate a bucket select element */
function populateBucketSelect(selectEl, domain, currentBucketId) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  const noOpt = document.createElement('option');
  noOpt.value = '';
  noOpt.textContent = '— Uncategorized —';
  selectEl.appendChild(noOpt);
  const buckets = getBuckets(domain);
  buckets.forEach(function(b) {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = (b.emoji ? b.emoji + ' ' : '') + b.name;
    selectEl.appendChild(opt);
  });
  selectEl.value = (currentBucketId !== undefined && currentBucketId !== null) ? String(currentBucketId) : '';
}

/* Add a new bucket category (Personal or Home) */
function addBucket(domain) {
  const name = (prompt('Category name:') || '').trim();
  if (!name) return;
  const buckets = getBuckets(domain);
  if (buckets.some(function(b) { return b.name.toLowerCase() === name.toLowerCase(); })) {
    alert('A category named "' + name + '" already exists.');
    return;
  }
  const emoji = (prompt('Emoji (optional, e.g. 🏃):') || '').trim();
  buckets.push({ id: nextBucketId(domain), name: name, emoji: emoji || '', collapsed: false });
  setBuckets(domain, buckets);
  renderBucketPage(domain);
}

/* Rename an existing bucket */
function renameBucket(domain, bucketId) {
  const buckets = getBuckets(domain);
  const b = buckets.find(function(x) { return x.id === bucketId; });
  if (!b) return;
  const newName = (prompt('Rename category:', b.name) || '').trim();
  if (!newName) return;
  const newEmoji = (prompt('Emoji (optional):', b.emoji || '') || '').trim();
  b.name = newName;
  b.emoji = newEmoji;
  setBuckets(domain, buckets);
  renderBucketPage(domain);
}

/* Delete a bucket and move its items to Uncategorized */
function deleteBucket(domain, bucketId) {
  if (!confirm('Delete this category? Its items will become Uncategorized.')) return;
  const evs = getEvents();
  evs.forEach(function(ev) {
    if (getDomainOfItem(ev) === domain && ev.bucketId === bucketId) delete ev.bucketId;
  });
  setEvents(evs);
  const tasks = getTasks();
  tasks.forEach(function(t) {
    if (getDomainOfItem(t) === domain && t.bucketId === bucketId) delete t.bucketId;
  });
  setTasks(tasks);
  const rmap = getReminders();
  Object.keys(rmap).forEach(function(dk) {
    (rmap[dk] || []).forEach(function(r) {
      if (getDomainOfItem(r) === domain && r.bucketId === bucketId) delete r.bucketId;
    });
  });
  setReminders(rmap);
  const buckets = getBuckets(domain);
  setBuckets(domain, buckets.filter(function(b) { return b.id !== bucketId; }));
  renderBucketPage(domain);
}

/* Build the "Add Item" collapsible panel for a bucket */
function buildBucketAddArea(domain, bucketId) {
  const wrapper = document.createElement('div');

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'bucket-add-toggle';
  toggleBtn.textContent = '＋ Add Item';

  const panel = document.createElement('div');
  panel.className = 'bucket-add-panel';

  const tabs = document.createElement('div');
  tabs.className = 'bucket-type-tabs';

  const types = [
    { key: 'event', label: '📅 Event' },
    { key: 'task', label: '✅ Task' },
    { key: 'reminder', label: '🔔 Reminder' }
  ];

  const forms = {};
  types.forEach(function(t, i) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bucket-type-tab' + (i === 0 ? ' active' : '');
    btn.dataset.type = t.key;
    btn.textContent = t.label;
    tabs.appendChild(btn);

    const form = document.createElement('div');
    form.className = 'bucket-item-form';
    form.style.display = i === 0 ? '' : 'none';
    form.dataset.type = t.key;

    if (t.key === 'event') {
      form.innerHTML = [
        '<input type="text" placeholder="Event title" class="bi-title" style="width:100%;box-sizing:border-box;margin-top:0" />',
        '<div style="display:flex;gap:6px;margin-top:6px">',
        '<input type="date" class="bi-date" style="flex:1" />',
        '<input type="time" class="bi-time" style="flex:1" />',
        '<input type="time" class="bi-endtime" style="flex:1" title="End time (optional)" />',
        '</div>',
        '<button type="button" class="bucket-add-item-btn domain-add-btn" style="margin-top:6px;font-size:0.85rem;padding:6px 10px" data-type="event">Add Event</button>'
      ].join('');
    } else if (t.key === 'task') {
      form.innerHTML = [
        '<input type="text" placeholder="Task title" class="bi-title" style="width:100%;box-sizing:border-box;margin-top:0" />',
        '<div style="display:flex;gap:6px;margin-top:6px">',
        '<input type="date" class="bi-date" style="flex:1" />',
        '<select class="bi-priority" style="width:110px"><option value="1">! Low</option><option value="2" selected>!! Med</option><option value="3">!!! High</option></select>',
        '</div>',
        '<button type="button" class="bucket-add-item-btn domain-add-btn" style="margin-top:6px;font-size:0.85rem;padding:6px 10px" data-type="task">Add Task</button>'
      ].join('');
    } else {
      form.innerHTML = [
        '<input type="text" placeholder="Reminder text" class="bi-title" style="width:100%;box-sizing:border-box;margin-top:0" />',
        '<div style="display:flex;gap:6px;margin-top:6px">',
        '<input type="date" class="bi-date" style="flex:1" />',
        '<input type="time" class="bi-time" style="flex:1" />',
        '</div>',
        '<button type="button" class="bucket-add-item-btn domain-add-btn" style="margin-top:6px;font-size:0.85rem;padding:6px 10px" data-type="reminder">Add Reminder</button>'
      ].join('');
    }

    forms[t.key] = form;
    panel.appendChild(form);
  });

  panel.insertBefore(tabs, panel.firstChild);

  tabs.querySelectorAll('.bucket-type-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      tabs.querySelectorAll('.bucket-type-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      Object.keys(forms).forEach(function(k) { forms[k].style.display = 'none'; });
      if (forms[tab.dataset.type]) forms[tab.dataset.type].style.display = '';
    });
  });

  panel.querySelectorAll('.bucket-add-item-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const type = btn.dataset.type;
      if (forms[type]) addItemToBucket(domain, bucketId, type, forms[type]);
    });
  });

  panel.querySelectorAll('.bi-title').forEach(function(inp) {
    inp.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const activeTab = tabs.querySelector('.bucket-type-tab.active');
      if (!activeTab) return;
      const type = activeTab.dataset.type;
      if (forms[type]) addItemToBucket(domain, bucketId, type, forms[type]);
    });
  });

  toggleBtn.addEventListener('click', function() {
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
    toggleBtn.textContent = !isOpen ? '▾ Add Item' : '＋ Add Item';
    if (!isOpen) {
      const firstTitle = panel.querySelector('.bucket-item-form:not([style*="none"]) .bi-title');
      if (firstTitle) setTimeout(function() { firstTitle.focus(); }, 50);
    }
  });

  wrapper.appendChild(toggleBtn);
  wrapper.appendChild(panel);
  return wrapper;
}

/* Add an item to a specific bucket */
function addItemToBucket(domain, bucketId, type, formEl) {
  const titleInp = formEl.querySelector('.bi-title');
  const dateInp = formEl.querySelector('.bi-date');
  const timeInp = formEl.querySelector('.bi-time');
  const title = titleInp ? titleInp.value.trim() : '';
  if (!title) { if (titleInp) { titleInp.focus(); titleInp.style.outline = '2px solid #e74c3c'; setTimeout(function() { titleInp.style.outline = ''; }, 1200); } return; }
  const date = normalizeDate(dateInp ? dateInp.value : '') || '';
  const time = timeInp ? timeInp.value : '';
  const bId = (bucketId !== null && bucketId !== undefined) ? bucketId : undefined;

  // For work domain, look up the job to inherit defaults (location, emoji)
  var jobDefaults = { location: '', emoji: '' };
  if (domain === 'work' && bId !== undefined) {
    var matchedJob = getJobs().find(function(j) { return j.id === bId; });
    if (matchedJob) {
      jobDefaults.location = matchedJob.location || '';
      jobDefaults.emoji = matchedJob.emoji || '';
    }
  }

  if (type === 'event') {
    const endTimeInp = formEl.querySelector('.bi-endtime');
    const endTime = endTimeInp ? endTimeInp.value : '';
    const evDate = date || new Date().toISOString().slice(0, 10);
    const evs = getEvents();
    const id = evs.length ? Math.max.apply(null, evs.map(function(x) { return x.id; })) + 1 : 1;
    const ev = { id, title, date: evDate, time, startTime: time, endTime, location: jobDefaults.location, emoji: jobDefaults.emoji, category: domain, domain: domain, repeat: 'none', repeatUntil: '', preBuffer: 0, postBuffer: 0 };
    if (bId !== undefined) ev.bucketId = bId;
    evs.push(ev);
    setEvents(evs);
    try { generateCalendar(); } catch(_) {}
    showUndoToast('📅 Event added!');
  } else if (type === 'task') {
    const priorityEl = formEl.querySelector('.bi-priority');
    const priority = priorityEl ? priorityEl.value : '2';
    const tasks = getTasks();
    const t = { title, category: domain, domain: domain, done: false, date, time, priority, emoji: jobDefaults.emoji };
    if (bId !== undefined) t.bucketId = bId;
    tasks.push(t);
    setTasks(tasks);
    try { loadTasks(); } catch(_) {}
    showUndoToast('✅ Task added!');
  } else if (type === 'reminder') {
    const rDate = date || new Date().toISOString().slice(0, 10);
    const rmap = getReminders();
    if (!rmap[rDate]) rmap[rDate] = [];
    const rObj = { text: title, time, notify: 'none', domain: domain, emoji: jobDefaults.emoji };
    if (bId !== undefined) rObj.bucketId = bId;
    rmap[rDate].push(rObj);
    setReminders(rmap);
    try { generateCalendar(); } catch(_) {}
    showUndoToast('🔔 Reminder added!');
  }

  if (titleInp) titleInp.value = '';
  if (dateInp) dateInp.value = '';
  if (timeInp) timeInp.value = '';
  const endTimeInp = formEl.querySelector('.bi-endtime');
  if (endTimeInp) endTimeInp.value = '';
  renderBucketPage(domain);
}

/* Build a single item row inside a bucket card */
function buildBucketItemEl(item, domain) {
  const el = document.createElement('div');
  el.className = 'bucket-item';
  const typeEmoji = { event: '📅', task: '✅', reminder: '🔔' }[item.type] || '📌';

  const left = document.createElement('div');
  left.style.cssText = 'flex:1;text-align:left;min-width:0';

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px';

  const badge = document.createElement('span');
  badge.textContent = typeEmoji;
  badge.style.fontSize = '0.9rem';

  const titleEl = document.createElement('b');
  titleEl.style.cssText = 'word-break:break-word;font-size:0.92rem';
  titleEl.textContent = item.title || '';
  if (item.done) titleEl.style.textDecoration = 'line-through';

  titleRow.appendChild(badge);
  titleRow.appendChild(titleEl);

  const meta = document.createElement('div');
  meta.style.cssText = 'font-size:0.78rem;color:#888';
  const prioMap = {'1':'!','2':'!!','3':'!!!'};
  const parts = [];
  if (item.date) parts.push(item.date);
  if (item.time) parts.push(item.time + (item.endTime ? '–' + item.endTime : ''));
  if (item.location) parts.push('@ ' + item.location);
  if (item.priority) parts.push(prioMap[item.priority] || item.priority);
  meta.textContent = parts.join(' · ');

  left.appendChild(titleRow);
  if (meta.textContent) left.appendChild(meta);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-direction:column;gap:3px;flex-shrink:0';

  const editBtn = document.createElement('button');
  editBtn.className = 'small-btn';
  editBtn.textContent = 'Edit';
  editBtn.style.fontSize = '0.75rem';
  editBtn.addEventListener('click', function() {
    if (item.type === 'event') {
      try { editEvent(item.data.id); } catch(e) { console.warn(e); }
    } else if (item.type === 'task') {
      try { editTask(item.idx); } catch(e) { console.warn(e); }
    } else if (item.type === 'reminder') {
      const rparts = item.dateKey.split('-');
      if (rparts.length === 3) {
        selectedYear = parseInt(rparts[0], 10);
        selectedMonth = parseInt(rparts[1], 10) - 1;
        selectedDay = parseInt(rparts[2], 10);
      }
      try { editReminder(parseInt(rparts[2], 10), item.ridx); } catch(e) { console.warn(e); }
    }
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'small-btn';
  delBtn.textContent = 'Del';
  delBtn.style.fontSize = '0.75rem';
  delBtn.addEventListener('click', function() {
    if (item.type === 'event') {
      try { deleteEvent(item.data.id); } catch(e) { console.warn(e); }
    } else if (item.type === 'task') {
      try { deleteTask(item.idx); } catch(e) { console.warn(e); }
    } else if (item.type === 'reminder') {
      const rparts = item.dateKey.split('-');
      if (rparts.length === 3) {
        selectedYear = parseInt(rparts[0], 10);
        selectedMonth = parseInt(rparts[1], 10) - 1;
        selectedDay = parseInt(rparts[2], 10);
      }
      try { deleteReminder(parseInt(rparts[2], 10), item.ridx); } catch(e) { console.warn(e); }
    }
    try { renderBucketPage(domain); } catch(e) {}
  });

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  el.appendChild(left);
  el.appendChild(actions);
  return el;
}

/* Build a complete bucket card */
function buildBucketCard(domain, bucket, items) {
  const isUncategorized = bucket.id === null;

  const card = document.createElement('div');
  card.className = 'bucket-card';

  /* Header */
  const header = document.createElement('div');
  header.className = 'bucket-header';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'bucket-title';
  if (bucket.emoji) {
    const emSp = document.createElement('span');
    emSp.textContent = bucket.emoji;
    titleDiv.appendChild(emSp);
  }
  const nameSp = document.createElement('span');
  nameSp.textContent = bucket.name;
  titleDiv.appendChild(nameSp);
  if (items.length) {
    const cnt = document.createElement('span');
    cnt.style.cssText = 'font-size:0.75rem;color:#888;font-weight:400;margin-left:4px';
    cnt.textContent = '(' + items.length + ')';
    titleDiv.appendChild(cnt);
  }
  header.appendChild(titleDiv);

  if (!isUncategorized) {
    const editBucketBtn = document.createElement('button');
    editBucketBtn.type = 'button';
    editBucketBtn.className = 'small-btn';
    editBucketBtn.textContent = '✏️';
    editBucketBtn.title = domain === 'work' ? 'Edit job' : 'Rename';
    editBucketBtn.style.cssText = 'background:none;border:none;font-size:1rem;cursor:pointer;padding:2px 4px;color:#666';
    editBucketBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (domain === 'work') { editJob(bucket.id); } else { renameBucket(domain, bucket.id); }
    });

    const delBucketBtn = document.createElement('button');
    delBucketBtn.type = 'button';
    delBucketBtn.className = 'small-btn';
    delBucketBtn.textContent = '🗑️';
    delBucketBtn.title = domain === 'work' ? 'Delete job' : 'Delete category';
    delBucketBtn.style.cssText = 'background:none;border:none;font-size:1rem;cursor:pointer;padding:2px 4px;color:#e74c3c';
    delBucketBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (domain === 'work') { deleteJob(bucket.id); } else { deleteBucket(domain, bucket.id); }
    });

    header.appendChild(editBucketBtn);
    header.appendChild(delBucketBtn);
  }

  const chevron = document.createElement('span');
  chevron.className = 'bucket-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = bucket.collapsed ? '▸' : '▾';
  header.appendChild(chevron);

  /* Body */
  const body = document.createElement('div');
  body.className = 'bucket-body';
  if (bucket.collapsed) body.style.display = 'none';

  if (!items.length) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'color:#aaa;text-align:center;padding:6px 0 2px;font-size:0.85rem';
    emptyMsg.textContent = 'No items yet.';
    body.appendChild(emptyMsg);
  } else {
    items.forEach(function(item) { body.appendChild(buildBucketItemEl(item, domain)); });
  }

  body.appendChild(buildBucketAddArea(domain, bucket.id));

  card.appendChild(header);
  card.appendChild(body);

  header.addEventListener('click', function() {
    const isCollapsed = body.style.display === 'none';
    body.style.display = isCollapsed ? '' : 'none';
    chevron.textContent = isCollapsed ? '▾' : '▸';
    if (!isUncategorized) persistBucketCollapse(domain, bucket.id, !isCollapsed);
  });

  return card;
}

/* Render the full bucket page for a domain */
function renderBucketPage(domain) {
  const container = document.getElementById('domain-buckets-' + domain);
  if (!container) return;

  container.innerHTML = '';
  const todayStr = new Date().toISOString().slice(0, 10);

  const itemsByBucket = {};
  const uncategorized = [];

  function pushItem(bucketId, item) {
    if (bucketId !== undefined && bucketId !== null) {
      if (!itemsByBucket[bucketId]) itemsByBucket[bucketId] = [];
      itemsByBucket[bucketId].push(item);
    } else {
      uncategorized.push(item);
    }
  }

  getEvents().forEach(function(ev) {
    if (getDomainOfItem(ev) !== domain) return;
    pushItem(ev.bucketId, {
      type: 'event', title: ev.title || '', date: ev.date || '',
      time: ev.time || '', endTime: ev.endTime || '', location: ev.location || '',
      sortKey: (ev.date || '9999') + (ev.time || '23:59'), data: ev
    });
  });

  getTasks().forEach(function(t, idx) {
    if (getDomainOfItem(t) !== domain) return;
    pushItem(t.bucketId, {
      type: 'task', title: t.title || t.text || '', date: t.date || '',
      time: t.time || '', priority: t.priority, done: !!t.done,
      sortKey: (t.date || '9999') + (t.time || '23:59'), data: t, idx: idx
    });
  });

  const rmap = getReminders();
  Object.keys(rmap).forEach(function(dateKey) {
    (rmap[dateKey] || []).forEach(function(r, ridx) {
      if (getDomainOfItem(r) !== domain) return;
      pushItem(r.bucketId, {
        type: 'reminder', title: r.text || '', date: dateKey,
        time: r.time || '', sortKey: dateKey + (r.time || '23:59'),
        data: r, dateKey: dateKey, ridx: ridx
      });
    });
  });

  function sortItems(arr) {
    const dated = arr.filter(function(i) { return !!i.date; });
    const undated = arr.filter(function(i) { return !i.date; });
    const upcoming = dated.filter(function(i) { return i.sortKey >= todayStr; })
      .sort(function(a, b) { return a.sortKey.localeCompare(b.sortKey); });
    const past = dated.filter(function(i) { return i.sortKey < todayStr; })
      .sort(function(a, b) { return b.sortKey.localeCompare(a.sortKey); });
    return upcoming.concat(undated).concat(past);
  }

  const buckets = getBuckets(domain);
  const hasContent = buckets.length > 0 || uncategorized.length > 0 || Object.keys(itemsByBucket).length > 0;

  if (!hasContent) {
    if (domain === 'work') {
      container.innerHTML = '<div style="color:#aaa;text-align:center;padding:32px 0">No jobs yet. Tap <b>＋ Add Job</b> above to get started.</div>';
    } else {
      container.innerHTML = '<div style="color:#aaa;text-align:center;padding:32px 0">No categories yet. Tap <b>＋ Add Category</b> to get started.</div>';
    }
    return;
  }

  buckets.forEach(function(bucket) {
    const items = sortItems(itemsByBucket[bucket.id] || []);
    container.appendChild(buildBucketCard(domain, bucket, items));
  });

  const uncatItems = sortItems(uncategorized);
  if (uncatItems.length) {
    container.appendChild(buildBucketCard(domain, { id: null, name: 'Uncategorized', emoji: '📥', collapsed: false }, uncatItems));
  }
}

/* Wire bucket page controls */
function wireBucketPages() {
  ['personal', 'home'].forEach(function(domain) {
    const cap = domain.charAt(0).toUpperCase() + domain.slice(1);
    const btn = document.getElementById('add' + cap + 'BucketBtn');
    if (btn) btn.addEventListener('click', function() { addBucket(domain); });
  });
}

/* ----- Calendar Cross-Domain Summary ----- */
let calSummaryDomainFilter = 'all';

function renderCalendarSummary() {
  const list = document.getElementById('calendarSummaryList');
  if (!list) return;

  const daysEl = document.getElementById('summaryDaysSelect');
  const days = daysEl ? parseInt(daysEl.value, 10) : 30;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + days);
  const endStr = endDate.toISOString().slice(0, 10);

  const items = [];

  getExpandedEvents(todayStr, endStr).forEach(function(ev) {
    const d = normalizeDate(ev.date);
    if (!d || d < todayStr || d > endStr) return;
    const domain = getDomainOfItem(ev);
    if (calSummaryDomainFilter !== 'all' && domain !== calSummaryDomainFilter) return;
    items.push({ type: 'event', title: ev.title || '', date: d, time: ev.time || '', domain: domain, sortKey: d + (ev.time || '23:59') });
  });

  getTasks().forEach(function(t) {
    const d = normalizeDate(t.date);
    if (!d || d < todayStr || d > endStr) return;
    const domain = getDomainOfItem(t);
    if (calSummaryDomainFilter !== 'all' && domain !== calSummaryDomainFilter) return;
    items.push({ type: 'task', title: t.title || t.text || '', date: d, time: t.time || '', domain: domain, done: !!t.done, sortKey: d + (t.time || '23:59') });
  });

  const rmap = getReminders();
  Object.keys(rmap).forEach(function(dk) {
    if (dk < todayStr || dk > endStr) return;
    (rmap[dk] || []).forEach(function(r) {
      const domain = getDomainOfItem(r);
      if (calSummaryDomainFilter !== 'all' && domain !== calSummaryDomainFilter) return;
      items.push({ type: 'reminder', title: r.text || '', date: dk, time: r.time || '', domain: domain, sortKey: dk + (r.time || '23:59') });
    });
  });

  items.sort(function(a, b) { return a.sortKey.localeCompare(b.sortKey); });

  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<div style="color:#aaa;text-align:center;padding:16px 0">No upcoming items in this range.</div>';
    return;
  }

  items.forEach(function(item) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff;border-radius:8px;margin-bottom:6px;border:1px solid #f0f0f0;font-size:0.88rem';

    const typeIcon = { event: '\uD83D\uDCC5', task: '\u2705', reminder: '\uD83D\uDD14' }[item.type] || '\uD83D\uDCCC';
    const meta = DOMAIN_META[item.domain] || DOMAIN_META.personal;

    const domainBadge = document.createElement('span');
    domainBadge.style.cssText = 'background:' + meta.color + ';color:#fff;padding:1px 7px;border-radius:10px;font-size:0.75rem;flex-shrink:0;white-space:nowrap';
    domainBadge.textContent = meta.emoji + ' ' + meta.label;

    const content = document.createElement('div');
    content.style.cssText = 'flex:1;min-width:0';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = typeIcon + ' ' + (item.title || '');
    if (item.done) titleSpan.style.textDecoration = 'line-through';

    const dateSpan = document.createElement('span');
    dateSpan.style.cssText = 'color:#888;margin-left:6px;font-size:0.8rem';
    dateSpan.textContent = item.date + (item.time ? ' ' + item.time : '');

    content.appendChild(titleSpan);
    content.appendChild(dateSpan);
    row.appendChild(domainBadge);
    row.appendChild(content);
    list.appendChild(row);
  });
}

function wireCalendarSummary() {
  document.querySelectorAll('.cal-domain-pill').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.cal-domain-pill').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      calSummaryDomainFilter = btn.dataset.domain || 'all';
      renderCalendarSummary();
    });
  });

  const daysEl = document.getElementById('summaryDaysSelect');
  if (daysEl) daysEl.addEventListener('change', renderCalendarSummary);
}

/* ----- Init all new features on DOMContentLoaded ----- */
document.addEventListener('DOMContentLoaded',function(){
  wireCategoryFilters();
  wireViewToggle();
  wireQuickAdd();
  wireSearch();
  wireUndoBtn();
  wireKeyboardShortcuts();
  wireSyncStatusBar();
  wireCalendarSwipe();
  wireMorningBriefing();
  wireDomainColorEditor();
  updateInboxBadge();
  wireDomainForms();
  wireCalendarSummary();
  wireBucketPages();
  /* Refresh day-elapsed ring every 60s */
  updateDayElapsedRing();
  updateCompletionRing();
  updateWeeklySalary();
  setInterval(function(){ updateDayElapsedRing(); updateCompletionRing(); }, 60000);
});
