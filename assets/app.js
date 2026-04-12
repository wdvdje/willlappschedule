/* Core helpers and storage */
const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const weekdayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function pad2(n){ return n<10 ? '0'+n : ''+n; }
function generateTaskId(){ return 'task:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2); }
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
        var otHoursEl = document.getElementById('jobOvertimeHours');
        var otMultEl  = document.getElementById('jobOvertimeMultiplier');
        if (otHoursEl) otHoursEl.value = job.overtimeHours != null ? job.overtimeHours : '';
        if (otMultEl)  otMultEl.value  = job.overtimeMultiplier != null ? job.overtimeMultiplier : '';
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
    var overtimeHoursRaw = (document.getElementById('jobOvertimeHours')||{}).value;
    var overtimeMultRaw  = (document.getElementById('jobOvertimeMultiplier')||{}).value;
    var overtimeHours      = overtimeHoursRaw      ? parseFloat(overtimeHoursRaw)      : null;
    var overtimeMultiplier = overtimeMultRaw  ? parseFloat(overtimeMultRaw)  : null;

    var jobs = getJobs();
    if (idField && idField.value){
      var id = parseInt(idField.value,10);
      var idx = jobs.findIndex(function(j){ return j.id===id; });
      if (idx!==-1){
        jobs[idx] = Object.assign({}, jobs[idx], {name: name, emoji: emoji, location: location, rate: rate, unit: unit, offDays: offDays, overtimeHours: overtimeHours, overtimeMultiplier: overtimeMultiplier});
      }
    } else {
      var nid = jobs.length ? Math.max.apply(null, jobs.map(function(j){ return j.id; }))+1 : 1;
      jobs.push({ id: nid, name: name, emoji: emoji, location: location, rate: rate, unit: unit, offDays: offDays, overtimeHours: overtimeHours, overtimeMultiplier: overtimeMultiplier });
    }
    setJobs(jobs);
    hideJobModal();
    clearJobForm();
    renderJobs();
    renderCategoryFilterBar();
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
    renderCategoryFilterBar();
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
    var otHours = document.getElementById('jobOvertimeHours');
    var otMult  = document.getElementById('jobOvertimeMultiplier');
    if (otHours) otHours.value = '';
    if (otMult)  otMult.value  = '';
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
      reminderArea.innerHTML = `<div class="reminder-bar"><b>Reminders for ${monthNames[selectedMonth]} ${day}, ${selectedYear}:</b><ul>${items.map((r,i)=>{
        const checked = r.done ? 'checked' : '';
        const doneStyle = r.done ? ' style="text-decoration:line-through;opacity:0.7"' : '';
        return `<li><input type="checkbox" ${checked} onchange="toggleReminderDone(${day},${i},this.checked)"><span${doneStyle}>${r.time?`[${r.time}] `:''}${escapeHTML(r.text)}</span> <span class="item-controls"><button class="small-btn" onclick="editReminder(${day},${i})">Edit</button><button class="small-btn" onclick="deleteReminder(${day},${i})">Delete</button></span></li>`;
      }).join('')}</ul></div>`;
    } else {
      reminderArea.innerHTML = '';
    }
  }

  updateDayProgress(day);

  /* Refresh weather widget for new selected week */
  if (typeof renderDashboardWeather === 'function') {
    try { renderDashboardWeather(); } catch(_){}
  }

  if (selectedYear != null && selectedMonth != null && day){
    renderDailyViewForDay(selectedYear, selectedMonth, day);
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
function toggleReminderDone(day, index, done){
  const key = `${selectedYear}-${pad2(selectedMonth+1)}-${pad2(day)}`;
  const r = getReminders();
  if (!r[key] || !r[key][index]) return;
  r[key][index].done = !!done;
  setReminders(r);
  showReminders(day);
  updateCompletionRing();
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
  const tasks = getTasks(); tasks.push({id:generateTaskId(),title:text,category,done:false,date,time,priority}); setTasks(tasks);
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
    // Use setAttribute for reliable SVG rendering across all platforms
    // (iOS WebKit standalone PWA mode may ignore style-based SVG properties)
    fg.setAttribute('stroke-dasharray', String(RING_CIRCUMFERENCE));
    fg.setAttribute('stroke-dashoffset', String(offset));
    fg.setAttribute('stroke', color);
  }
  if (pctEl) pctEl.textContent = Math.round(percent) + '%';
}

function getTodayISO(){
  const d = new Date();
  return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
}

/* --- Off-day detection helper --- */
const OFF_DAY_LABEL = '—';

/* Returns the date string the dashboard rings should use.
   Prefers the daily-view's selected date, falls back to today. */
function getViewedDateISO(){
  if (typeof window.dailyViewGetDate === 'function') {
    var d = window.dailyViewGetDate();
    if (d && typeof d === 'string') return d;
  }
  return getTodayISO();
}

function isOffDay(dateStr){
  if (!dateStr) dateStr = getTodayISO();
  const yr = parseInt(dateStr.split('-')[0], 10);

  // Check federal holidays
  function nthWeekday(year, month, weekday, nth) {
    var count = 0;
    for (var day = 1; day <= 31; day++) {
      var dt = new Date(year, month, day);
      if (dt.getMonth() !== month) break;
      if (dt.getDay() === weekday) {
        count++;
        if (count === nth) return day;
      }
    }
    return 1;
  }
  function lastWeekday(year, month, weekday) {
    var last = new Date(year, month + 1, 0);
    return last.getDate() - ((7 + last.getDay() - weekday) % 7);
  }
  var federalHolidays = [
    yr+'-01-01', yr+'-06-19', yr+'-07-04', yr+'-11-11', yr+'-12-25',
    yr+'-01-'+pad2(nthWeekday(yr,0,1,3)),
    yr+'-02-'+pad2(nthWeekday(yr,1,1,3)),
    yr+'-05-'+pad2(lastWeekday(yr,4,1)),
    yr+'-09-'+pad2(nthWeekday(yr,8,1,1)),
    yr+'-10-'+pad2(nthWeekday(yr,9,1,2)),
    yr+'-11-'+pad2(nthWeekday(yr,10,4,4))
  ];
  if (federalHolidays.indexOf(dateStr) !== -1) return true;

  // Check user-defined off-days
  try {
    var userOffDays = JSON.parse(localStorage.getItem('userOffDays') || '[]');
    if (Array.isArray(userOffDays)) {
      for (var i = 0; i < userOffDays.length; i++) {
        var entry = userOffDays[i];
        var entryDate = typeof entry === 'string' ? entry : (entry && entry.date ? entry.date : '');
        if (entryDate === dateStr) return true;
      }
    }
  } catch(_) {}

  return false;
}

/* --- Active hours helpers --- */
function getActiveHours(){
  var start = parseInt(localStorage.getItem('dayStartHour') || '', 10);
  var end = parseInt(localStorage.getItem('dayEndHour') || '', 10);
  if (isNaN(start) || start < 0 || start > 23) start = 0;
  if (isNaN(end) || end < 1 || end > 24) end = 24;
  if (end <= start) { start = 0; end = 24; }
  return { start: start, end: end };
}

/* Ring 1: tasks + reminders + events completion for the viewed date */
function updateCompletionRing(){
  const wrap = document.getElementById('completionRingWrap');
  const labelEl = wrap ? wrap.querySelector('.ring-label') : null;
  const viewDate = getViewedDateISO();
  const todayStr = getTodayISO();

  // Off-day: show gray ring with "Off Day"
  if (isOffDay(viewDate)) {
    setRing('completionRingFg', 'completionRingPct', 0, '#999');
    const pctEl = document.getElementById('completionRingPct');
    if (pctEl) pctEl.textContent = OFF_DAY_LABEL;
    if (wrap) wrap.title = 'This day is an off day';
    if (labelEl) labelEl.textContent = 'Off Day';
    return;
  }
  if (labelEl) labelEl.textContent = 'Completed';

  const isFuture = viewDate > todayStr;
  const isPast = viewDate < todayStr;

  // Tasks for this date
  const tasks = getTasks().filter(t => t.date && normalizeDate(t.date) === viewDate);
  const tasksDone = tasks.filter(t => t.done).length;
  // Reminders for this date
  const rems = getReminders();
  const dateReminders = rems[viewDate] || [];
  const remDone = dateReminders.filter(r => r.done).length;
  // Events for this date
  const dateEvents = getExpandedEvents(viewDate, viewDate);

  let eventsDone = 0;
  if (isPast) {
    // Past day: all events are considered done
    eventsDone = dateEvents.length;
  } else if (isFuture) {
    // Future day: no events are done yet
    eventsDone = 0;
  } else {
    // Today: use current time to determine which events are done
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    dateEvents.forEach(ev => {
      // If event has an end time, use it
      const endStr = ev.endTime || '';
      if (endStr) {
        const parts = endStr.match(/(\d{1,2}):(\d{2})/);
        if (parts) {
          const endMins = parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
          if (nowMins >= endMins) eventsDone++;
          return;
        }
      }
      // No end time: if event has a start time, consider done once start time has passed
      const startStr = ev.time || '';
      if (startStr) {
        const sp = startStr.match(/(\d{1,2}):(\d{2})/);
        if (sp) {
          const startMins = parseInt(sp[1], 10) * 60 + parseInt(sp[2], 10);
          if (nowMins >= startMins) eventsDone++;
          return;
        }
      }
      // No start or end time (all-day event): treat as done at end of day
      if (nowMins >= 1439) eventsDone++;
    });
  }

  const total = tasks.length + dateReminders.length + dateEvents.length;
  const done = tasksDone + remDone + eventsDone;
  const pct = total ? Math.round((done / total) * 100) : (isFuture ? 0 : 100);
  const color = pct === 100 ? '#27ae60' : '#4a90e2';
  setRing('completionRingFg', 'completionRingPct', pct, color);
  if (wrap) wrap.title = done + '/' + total + ' items done';
}

/* Ring 2: percent of active day elapsed */
function updateDayElapsedRing(){
  const wrap = document.getElementById('dayElapsedRingWrap');
  const labelEl = wrap ? wrap.querySelector('.ring-label') : null;
  const viewDate = getViewedDateISO();
  const todayStr = getTodayISO();

  // Off-day: show gray ring with "Off Day"
  if (isOffDay(viewDate)) {
    setRing('dayElapsedRingFg', 'dayElapsedRingPct', 0, '#999');
    const pctEl = document.getElementById('dayElapsedRingPct');
    if (pctEl) pctEl.textContent = OFF_DAY_LABEL;
    if (wrap) wrap.title = 'This day is an off day';
    if (labelEl) labelEl.textContent = 'Off Day';
    return;
  }
  if (labelEl) labelEl.textContent = 'Day Elapsed';

  const active = getActiveHours();
  const totalActive = active.end - active.start;
  let pct;

  if (viewDate > todayStr) {
    // Future day: 0% elapsed
    pct = 0;
  } else if (viewDate < todayStr) {
    // Past day: 100% elapsed
    pct = 100;
  } else {
    // Today: use current time
    const now = new Date();
    const decimalHours = now.getHours() + now.getMinutes() / 60;
    if (decimalHours <= active.start) {
      pct = 0;
    } else if (decimalHours >= active.end) {
      pct = 100;
    } else {
      pct = Math.round(((decimalHours - active.start) / totalActive) * 100);
    }
  }
  const color = pct >= 75 ? '#e74c3c' : pct >= 50 ? '#e67e22' : '#f1c40f';
  setRing('dayElapsedRingFg', 'dayElapsedRingPct', pct, color);
  if (viewDate === todayStr) {
    const now = new Date();
    const decimalHours = now.getHours() + now.getMinutes() / 60;
    const elapsed = Math.max(0, decimalHours - active.start);
    const elH = Math.floor(elapsed);
    const elM = Math.round((elapsed - elH) * 60);
    if (wrap) wrap.title = elH + 'h ' + elM + 'm of ' + totalActive + 'h active day elapsed';
  } else if (viewDate < todayStr) {
    if (wrap) wrap.title = 'Past day – fully elapsed';
  } else {
    if (wrap) wrap.title = 'Future day – not yet started';
  }
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

    // Build lookups by id and by name (for category:'job' events that only store jobName)
    const jobById = {}, jobByName = {};
    jobs.forEach(j => {
      if (j.id != null) jobById[j.id] = j;
      if (j.name) jobByName[j.name.toLowerCase()] = j;
    });

    let totalSalary = 0;
    weekEvents.forEach(ev => {
      // Mirror the filter from calcEarnings() in desktop.js:
      // include category:'job' events and work-domain events linked to a bucket/job
      const cat = (ev.category || 'event').toLowerCase();
      const isJobCategory = (cat === 'job');
      const isWorkWithBucket = ((cat === 'work' || ev.domain === 'work') && ev.bucketId != null);
      if (!isJobCategory && !isWorkWithBucket) return;

      // Resolve the job using the same chain as calcEarnings():
      //   jobId → bucketId → jobName → inline jobRate snapshot
      let job = null;
      const jid = ev.jobId || ev.eventJobId;
      if (jid != null) {
        const id = typeof jid === 'number' ? jid : parseInt(jid, 10);
        job = jobById[id] || null;
      }
      if (!job && ev.bucketId != null) job = jobById[ev.bucketId] || null;
      if (!job && ev.jobName) job = jobByName[(ev.jobName || '').toLowerCase()] || null;
      if (!job && ev.jobRate) job = { rate: ev.jobRate, unit: ev.jobUnit || 'hour' };
      if (!job) return;

      // If event has its own rate snapshot, use it; otherwise use job master rate
      const rate = parseFloat(ev.jobRate || ev.eventJobRate || job.rate) || 0;
      const unit = ev.jobUnit || ev.eventJobUnit || job.unit || 'hour';

      if (unit === 'job' || unit === 'day') {
        totalSalary += rate;
      } else {
        // hourly: only count when both start and end times are present
        const startStr = ev.startTime || ev.time || '';
        const endStr = ev.endTime || '';
        if (startStr && endStr) {
          const sp = startStr.match(/(\d{1,2}):(\d{2})/);
          const ep = endStr.match(/(\d{1,2}):(\d{2})/);
          if (sp && ep) {
            let sm = parseInt(sp[1],10)*60+parseInt(sp[2],10);
            let em = parseInt(ep[1],10)*60+parseInt(ep[2],10);
            if (em <= sm) em += 1440; // handle overnight shifts
            const hours = (em - sm) / 60;
            totalSalary += rate * hours;
          }
        }
      }
    });

    if (totalSalary > 0) {
      el.innerHTML = '💰 Est. weekly salary: <strong>$' + totalSalary.toFixed(2) + '</strong> <span style="font-size:0.8rem;color:#4a90e2;margin-left:4px">View details ›</span>';
      el.onclick = function(){ showView('work'); };
      el.title = 'View detailed earnings on Work page';
    } else {
      el.innerHTML = '';
      el.onclick = null;
    }
  } catch(e) { el.innerHTML = ''; console.warn('weeklySalary error', e); }
}

/* ── Dashboard Weather Widget (Open-Meteo, no API key) ─────── */
var _dashWeatherCache = null;
var _dashWeatherCacheDate = null;
var _dashWeatherUnit = '°C';
var _DASH_WMO_EMOJI = {
  0:'☀️',1:'🌤️',2:'⛅',3:'☁️',
  45:'🌫️',48:'🌫️',
  51:'🌦️',53:'🌦️',55:'🌦️',
  61:'🌧️',63:'🌧️',65:'🌧️',
  71:'🌨️',73:'🌨️',75:'🌨️',77:'🌨️',
  80:'🌦️',81:'🌦️',82:'⛈️',
  85:'🌨️',86:'🌨️',
  95:'⛈️',96:'⛈️',99:'⛈️'
};
var _DASH_WMO_DESC = {
  0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
  45:'Fog',48:'Depositing fog',
  51:'Light drizzle',53:'Moderate drizzle',55:'Dense drizzle',
  61:'Light rain',63:'Moderate rain',65:'Heavy rain',
  71:'Light snow',73:'Moderate snow',75:'Heavy snow',77:'Snow grains',
  80:'Light showers',81:'Moderate showers',82:'Violent showers',
  85:'Light snow showers',86:'Heavy snow showers',
  95:'Thunderstorm',96:'Thunderstorm w/ hail',99:'Severe thunderstorm'
};

function renderDashboardWeather(){
  var section = document.getElementById('weatherWidgetSection');
  var container = document.getElementById('weatherWidgetContent');
  if (!section || !container) return;

  /* Determine the week of the selected day (Sun–Sat) */
  var selY = selectedYear != null ? selectedYear : new Date().getFullYear();
  var selM = selectedMonth != null ? selectedMonth : new Date().getMonth();
  var selD = selectedDay || new Date().getDate();
  var selDate = new Date(selY, selM, selD);
  var selISO = selY + '-' + pad2(selM + 1) + '-' + pad2(selD);

  /* If we have cached data, render immediately */
  if (_dashWeatherCache) {
    _renderWeatherCards(container, section, selDate, selISO);
  }

  /* Fetch fresh data if needed */
  var today = getTodayISO();
  if (_dashWeatherCacheDate === today && _dashWeatherCache) return;
  if (!navigator.geolocation) {
    container.innerHTML = '<p class="weather-widget-note">Location access is needed for weather data.</p>';
    section.style.display = '';
    return;
  }

  /* Detect if user likely prefers Fahrenheit (US locale) */
  var _useFahrenheit = /^en-US/i.test(navigator.language || '');
  var tempUnit = _useFahrenheit ? '&temperature_unit=fahrenheit' : '';

  navigator.geolocation.getCurrentPosition(function(pos){
    var lat = pos.coords.latitude.toFixed(4);
    var lon = pos.coords.longitude.toFixed(4);
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&daily=weathercode,temperature_2m_max,temperature_2m_min&forecast_days=16&timezone=auto' + tempUnit;
    fetch(url).then(function(r){ return r.json(); }).then(function(data){
      if (!data.daily) return;
      _dashWeatherCache = {};
      _dashWeatherCacheDate = today;
      _dashWeatherUnit = _useFahrenheit ? '°F' : '°C';
      var dates = data.daily.time || [];
      var codes = data.daily.weathercode || [];
      var highs = data.daily.temperature_2m_max || [];
      var lows  = data.daily.temperature_2m_min || [];
      for (var i = 0; i < dates.length; i++){
        _dashWeatherCache[dates[i]] = {
          emoji: _DASH_WMO_EMOJI[codes[i]] || '🌡️',
          desc:  _DASH_WMO_DESC[codes[i]] || '',
          high:  Math.round(highs[i]),
          low:   Math.round(lows[i])
        };
      }
      _renderWeatherCards(container, section, selDate, selISO);
    }).catch(function(){ /* silent fail */ });
  }, function(){
    container.innerHTML = '<p class="weather-widget-note">Enable location access to see weather.</p>';
    section.style.display = '';
  }, { timeout: 8000 });
}

function _renderWeatherCards(container, section, selDate, selISO){
  if (!_dashWeatherCache) return;
  var dow = selDate.getDay();
  var weekStart = new Date(selDate);
  weekStart.setDate(selDate.getDate() - dow);

  var todayISO = getTodayISO();
  var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var html = '<div class="weather-week-grid">';
  var hasAny = false;

  for (var i = 0; i < 7; i++){
    var d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    var iso = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    var w = _dashWeatherCache[iso];
    var cls = 'weather-day-card';
    if (iso === selISO) cls += ' wdc-selected';
    if (iso === todayISO) cls += ' wdc-today';

    html += '<div class="' + cls + '">';
    html += '<div class="weather-day-name">' + dayNames[d.getDay()] + '</div>';
    html += '<div class="weather-day-date">' + (d.getMonth()+1) + '/' + d.getDate() + '</div>';
    if (w){
      hasAny = true;
      html += '<div class="weather-day-icon">' + w.emoji + '</div>';
      html += '<div class="weather-day-high">' + w.high + _dashWeatherUnit + '</div>';
      html += '<div class="weather-day-low">' + w.low + _dashWeatherUnit + '</div>';
      html += '<div class="weather-day-desc">' + escapeHTML(w.desc) + '</div>';
    } else {
      html += '<div class="weather-day-icon">—</div>';
      html += '<div class="weather-day-high">—</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  html += '<p class="weather-widget-note">Powered by Open-Meteo · Temperatures in ' + _dashWeatherUnit + '</p>';

  if (hasAny){
    container.innerHTML = html;
    section.style.display = '';
  }
}

/* ── Work Page Earnings – state ──────────────────────────────── */
var _workEarningsMode = 'week';   // 'week' | 'month'
var _workEarningsOffset = 0;      // 0=current, -1=prev, +1=next
var _workEarningsExpanded = {};   // { [jobKey]: bool }
var _workEarningsSettingsOpen = false;
var DEFAULT_OT_MULTIPLIER = 1.5;

function getEarningsSettings(){
  return safeParseStorage('earningsSettings', { weeklyGoal: 0, monthlyGoal: 0, taxRate: 0 });
}
function setEarningsSettings(v){ localStorage.setItem('earningsSettings', JSON.stringify(v)); }

/* ── HTML escape helper ─────────────────────────────────────── */
function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── Core earnings computation for any date range ────────────── */
function computeEarningsForRange(startISO, endISO){
  var jobs = getJobs();
  var jobById = {}, jobByName = {};
  jobs.forEach(function(j){
    if (j.id != null) jobById[j.id] = j;
    if (j.name) jobByName[j.name.toLowerCase()] = j;
  });

  var events = getExpandedEvents(startISO, endISO);

  // Pass 1: collect per-job raw events
  var rawByJob = {};
  events.forEach(function(ev){
    var cat = (ev.category || 'event').toLowerCase();
    var isJobCat  = (cat === 'job');
    var isWorkBkt = ((cat === 'work' || ev.domain === 'work') && ev.bucketId != null);
    if (!isJobCat && !isWorkBkt) return;

    var job = null;
    var jid = ev.jobId || ev.eventJobId;
    if (jid != null){
      var id = typeof jid === 'number' ? jid : parseInt(jid, 10);
      job = jobById[id] || null;
    }
    if (!job && ev.bucketId != null) job = jobById[ev.bucketId] || null;
    if (!job && ev.jobName)          job = jobByName[(ev.jobName||'').toLowerCase()] || null;
    if (!job && ev.jobRate)          job = { rate: ev.jobRate, unit: ev.jobUnit || 'hour', name: ev.title || 'Unknown', emoji: '' };
    if (!job) return;

    var rate = parseFloat(ev.jobRate || ev.eventJobRate || job.rate) || 0;
    var unit = ev.jobUnit || ev.eventJobUnit || job.unit || 'hour';
    var evHours = 0, flatEarnings = 0;

    if (unit === 'job' || unit === 'day'){
      flatEarnings = rate;
    } else {
      var sStr = ev.startTime || ev.time || '';
      var eStr = ev.endTime || '';
      if (sStr && eStr){
        var sp = sStr.match(/(\d{1,2}):(\d{2})/);
        var ep = eStr.match(/(\d{1,2}):(\d{2})/);
        if (sp && ep){
          var sm = parseInt(sp[1],10)*60+parseInt(sp[2],10);
          var em = parseInt(ep[1],10)*60+parseInt(ep[2],10);
          if (em <= sm) em += 1440;
          evHours = (em - sm) / 60;
          flatEarnings = rate * evHours;
        }
      }
    }
    if (flatEarnings <= 0 && evHours <= 0) return;

    var jobKey = (job.id != null) ? 'id_'+job.id : 'name_'+(job.name||'').toLowerCase();
    if (!rawByJob[jobKey]) rawByJob[jobKey] = { job: job, rate: rate, unit: unit, items: [] };
    rawByJob[jobKey].items.push({ ev: ev, hours: evHours, flatEarnings: flatEarnings, rate: rate });
  });

  // Build day map
  var DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var startDate = new Date(startISO + 'T12:00:00');
  var endDate   = new Date(endISO   + 'T12:00:00');
  var dayMap = {};
  for (var d = new Date(startDate); d <= endDate; d.setDate(d.getDate()+1)){
    var iso = d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
    dayMap[iso] = { iso: iso, label: DAY_NAMES[d.getDay()]+' '+(d.getMonth()+1)+'/'+d.getDate(), earnings: 0, hours: 0 };
  }

  var totalGross = 0, totalHours = 0;
  var jobEarnings = {};

  // Pass 2: apply overtime per job and accumulate
  Object.keys(rawByJob).forEach(function(jobKey){
    var raw = rawByJob[jobKey];
    var job = raw.job;
    var unit = raw.unit;
    var otThreshold  = parseFloat(job.overtimeHours)      || 0;
    var otMultiplier = parseFloat(job.overtimeMultiplier) || DEFAULT_OT_MULTIPLIER;

    var je = {
      name: job.name || 'Unknown', emoji: job.emoji || '💼',
      location: job.location || '', rate: raw.rate, unit: unit,
      overtimeMultiplier: otMultiplier,
      totalEarnings: 0, totalHours: 0,
      regularHours: 0, overtimeHours: 0,
      regularEarnings: 0, overtimeEarnings: 0,
      shifts: 0, shifts_detail: []
    };
    jobEarnings[jobKey] = je;

    var accHours = 0;
    // Sort items by date for correct OT accumulation
    raw.items.sort(function(a,b){
      return (normalizeDate(a.ev.date)||'') < (normalizeDate(b.ev.date)||'') ? -1 : 1;
    });

    raw.items.forEach(function(item){
      var h = item.hours, r = item.rate;
      var evEarnings, regH = 0, otH = 0, isOT = false;

      if (unit === 'job' || unit === 'day'){
        evEarnings = item.flatEarnings;
        je.regularEarnings += evEarnings;
      } else if (otThreshold > 0 && h > 0){
        if (accHours >= otThreshold){
          otH = h; regH = 0;
          evEarnings = r * otMultiplier * otH;
          isOT = true;
        } else if (accHours + h > otThreshold){
          regH = otThreshold - accHours; otH = h - regH;
          evEarnings = r * regH + r * otMultiplier * otH;
          isOT = (otH > 0);
        } else {
          regH = h; otH = 0; evEarnings = r * regH;
        }
        je.regularHours    += regH; je.overtimeHours    += otH;
        je.regularEarnings += r * regH; je.overtimeEarnings += r * otMultiplier * otH;
      } else {
        evEarnings = item.flatEarnings;
        regH = h; je.regularHours += regH; je.regularEarnings += evEarnings;
      }

      accHours          += h;
      je.totalEarnings  += evEarnings;
      je.totalHours     += h;
      je.shifts         += 1;

      // Assign to day
      var evDate = normalizeDate(item.ev.date);
      if (dayMap[evDate]){
        dayMap[evDate].earnings += evEarnings;
        dayMap[evDate].hours    += h;
      }

      var sStr = item.ev.startTime || item.ev.time || '';
      var eStr = item.ev.endTime || '';
      var timeRange = (sStr && eStr) ? sStr+'–'+eStr : (sStr||'');
      je.shifts_detail.push({
        date: evDate, title: item.ev.title || '',
        timeRange: timeRange, hours: h, earnings: evEarnings,
        regularHours: regH, overtimeHours: otH, isOT: isOT
      });

      totalGross += evEarnings;
      totalHours += h;
    });
  });

  var dayData = Object.keys(dayMap).sort().map(function(k){ return dayMap[k]; });
  return { totalGross: totalGross, totalHours: totalHours, dayData: dayData, jobEarnings: jobEarnings };
}

/* ── SVG bar chart ───────────────────────────────────────────── */
function buildEarningsChart(earningsData, mode, todayStr){
  var bars;
  if (mode === 'week'){
    bars = earningsData.dayData.map(function(d){
      return { label: d.label.slice(0,3), value: d.earnings, iso: d.iso };
    });
  } else {
    var weekMap = {};
    earningsData.dayData.forEach(function(d){
      var dt = new Date(d.iso + 'T12:00:00');
      var ws = new Date(dt); ws.setDate(dt.getDate() - dt.getDay());
      var wKey = ws.getFullYear()+'-'+pad2(ws.getMonth()+1)+'-'+pad2(ws.getDate());
      if (!weekMap[wKey]) weekMap[wKey] = { label: (ws.getMonth()+1)+'/'+ws.getDate(), value: 0, iso: wKey };
      weekMap[wKey].value += d.earnings;
    });
    bars = Object.keys(weekMap).sort().map(function(k){ return weekMap[k]; });
  }

  var maxVal = 0;
  bars.forEach(function(b){ if (b.value > maxVal) maxVal = b.value; });
  if (!bars.length || maxVal <= 0) return '';

  var W = 280, H = 72, PAD_L = 4, PAD_R = 4, PAD_T = 16, PAD_B = 20;
  var chartH = H - PAD_T - PAD_B;
  var n = bars.length;
  var barW = Math.max(4, Math.floor((W - PAD_L - PAD_R) / n) - 3);
  var gap  = Math.floor((W - PAD_L - PAD_R - n * barW) / (n + 1));

  var svg = '<div class="we-chart-wrap"><svg width="100%" height="'+H+'" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">';
  bars.forEach(function(b, i){
    var x = PAD_L + gap + i * (barW + gap);
    var barH = Math.max(2, Math.round(chartH * (b.value / maxVal)));
    var y = PAD_T + chartH - barH;
    var isToday = (b.iso === todayStr);
    var fill = isToday ? '#4a90e2' : '#a0c4ef';
    svg += '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+barH+'" fill="'+fill+'" rx="2"/>';
    svg += '<text x="'+(x+barW/2)+'" y="'+(H-5)+'" text-anchor="middle" font-size="8" fill="#999">'+escHtml(b.label)+'</text>';
    if (barH >= 12 && b.value > 0){
      svg += '<text x="'+(x+barW/2)+'" y="'+(y-3)+'" text-anchor="middle" font-size="8" fill="#27ae60">$'+Math.round(b.value)+'</text>';
    }
  });
  svg += '</svg></div>';
  return svg;
}

/* ── CSV export ──────────────────────────────────────────────── */
function exportEarningsCSV(){
  try {
    var todayStr = getTodayISO();
    var todayDate = new Date(todayStr + 'T12:00:00');
    var startDate, endDate;
    if (_workEarningsMode === 'week'){
      var dow = todayDate.getDay();
      startDate = new Date(todayDate);
      startDate.setDate(todayDate.getDate() - dow + (_workEarningsOffset * 7));
      endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6);
    } else {
      var y = todayDate.getFullYear(), m = todayDate.getMonth() + _workEarningsOffset;
      while (m < 0){ m += 12; y--; } while (m > 11){ m -= 12; y++; }
      startDate = new Date(y, m, 1); endDate = new Date(y, m+1, 0);
    }
    var sISO = startDate.getFullYear()+'-'+pad2(startDate.getMonth()+1)+'-'+pad2(startDate.getDate());
    var eISO = endDate.getFullYear()+'-'+pad2(endDate.getMonth()+1)+'-'+pad2(endDate.getDate());
    var data = computeEarningsForRange(sISO, eISO);

    var rows = ['Date,Job,Location,Time,Hours,Rate,Unit,Regular Hours,Regular Earnings,Overtime Hours,Overtime Earnings,Total Earnings'];
    Object.keys(data.jobEarnings).forEach(function(key){
      var je = data.jobEarnings[key];
      je.shifts_detail.forEach(function(s){
        rows.push([
          s.date,
          '"'+je.name.replace(/"/g,'""')+'"',
          '"'+(je.location||'').replace(/"/g,'""')+'"',
          '"'+s.timeRange+'"',
          s.hours.toFixed(2),
          je.rate.toFixed(2), je.unit,
          s.regularHours.toFixed(2), (je.rate * s.regularHours).toFixed(2),
          s.overtimeHours.toFixed(2), (je.rate * je.overtimeMultiplier * s.overtimeHours).toFixed(2),
          s.earnings.toFixed(2)
        ].join(','));
      });
    });

    var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    var url  = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'earnings-'+sISO+'--'+eISO+'.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  } catch(e){ console.warn('exportEarningsCSV error', e); }
}

/* ── Save inline earnings settings ──────────────────────────── */
function saveEarningsSettingsFromUI(){
  var wg = parseFloat((document.getElementById('we-weekly-goal')||{}).value)  || 0;
  var mg = parseFloat((document.getElementById('we-monthly-goal')||{}).value) || 0;
  var tr = parseFloat((document.getElementById('we-tax-rate')||{}).value)     || 0;
  setEarningsSettings({ weeklyGoal: wg, monthlyGoal: mg, taxRate: tr });
  _workEarningsSettingsOpen = false;
  renderWorkEarnings();
}

/* ── Delegated event handler (attached once) ─────────────────── */
function wireWorkEarningsHandlers(){
  var section = document.getElementById('workEarningsSection');
  if (!section || section._weWired) return;
  section._weWired = true;
  section.addEventListener('click', function(e){
    if (e.target.tagName === 'INPUT') return; // let inputs receive focus normally

    var actionBtn = e.target.closest('[data-we-action]');
    if (actionBtn){
      var action = actionBtn.dataset.weAction;
      if      (action === 'prev')            { _workEarningsOffset--; renderWorkEarnings(); }
      else if (action === 'next')            { _workEarningsOffset++; renderWorkEarnings(); }
      else if (action === 'today')           { _workEarningsOffset = 0; renderWorkEarnings(); }
      else if (action === 'mode-week')       { _workEarningsMode = 'week';  _workEarningsOffset = 0; renderWorkEarnings(); }
      else if (action === 'mode-month')      { _workEarningsMode = 'month'; _workEarningsOffset = 0; renderWorkEarnings(); }
      else if (action === 'export')          { exportEarningsCSV(); }
      else if (action === 'toggle-settings') { _workEarningsSettingsOpen = !_workEarningsSettingsOpen; renderWorkEarnings(); }
      else if (action === 'save-settings')   { saveEarningsSettingsFromUI(); }
      return;
    }

    var card = e.target.closest('[data-we-job]');
    if (card){
      var key = card.dataset.weJob;
      _workEarningsExpanded[key] = !_workEarningsExpanded[key];
      var shifts  = card.querySelector('.earnings-job-shifts');
      var chevron = card.querySelector('.we-card-chevron');
      if (shifts)  shifts.classList.toggle('open', !!_workEarningsExpanded[key]);
      if (chevron) chevron.textContent = _workEarningsExpanded[key] ? '▾' : '▸';
    }
  });
}

/* ── Expanded Job Earnings Analytics (Work page) ─────────────── */
function renderWorkEarnings(){
  var container = document.getElementById('workEarningsContent');
  if (!container) return;
  try {
    var todayStr  = getTodayISO();
    var todayDate = new Date(todayStr + 'T12:00:00');
    var settings  = getEarningsSettings();
    var taxRate   = parseFloat(settings.taxRate)  || 0;
    var goalAmt   = _workEarningsMode === 'week'
                    ? (parseFloat(settings.weeklyGoal)  || 0)
                    : (parseFloat(settings.monthlyGoal) || 0);

    /* ── Compute date ranges ───────────────────────────────── */
    var startDate, endDate, prevStartDate, prevEndDate, periodLabel;
    var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    if (_workEarningsMode === 'week'){
      var dow = todayDate.getDay();
      startDate = new Date(todayDate);
      startDate.setDate(todayDate.getDate() - dow + (_workEarningsOffset * 7));
      endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6);
      periodLabel = 'Week of '+(startDate.getMonth()+1)+'/'+startDate.getDate()+' – '+(endDate.getMonth()+1)+'/'+endDate.getDate();
      prevStartDate = new Date(startDate); prevStartDate.setDate(startDate.getDate() - 7);
      prevEndDate   = new Date(endDate);   prevEndDate.setDate(endDate.getDate() - 7);
    } else {
      var y = todayDate.getFullYear(), m = todayDate.getMonth() + _workEarningsOffset;
      while (m < 0){ m += 12; y--; } while (m > 11){ m -= 12; y++; }
      startDate = new Date(y, m, 1); endDate = new Date(y, m+1, 0);
      periodLabel = MONTH_NAMES[m] + ' ' + y;
      var pm = m - 1, py = y;
      if (pm < 0){ pm = 11; py--; }
      prevStartDate = new Date(py, pm, 1); prevEndDate = new Date(py, pm+1, 0);
    }

    var startISO     = startDate.getFullYear()+'-'+pad2(startDate.getMonth()+1)+'-'+pad2(startDate.getDate());
    var endISO       = endDate.getFullYear()+'-'+pad2(endDate.getMonth()+1)+'-'+pad2(endDate.getDate());
    var prevStartISO = prevStartDate.getFullYear()+'-'+pad2(prevStartDate.getMonth()+1)+'-'+pad2(prevStartDate.getDate());
    var prevEndISO   = prevEndDate.getFullYear()+'-'+pad2(prevEndDate.getMonth()+1)+'-'+pad2(prevEndDate.getDate());

    var curr = computeEarningsForRange(startISO, endISO);
    var prev = computeEarningsForRange(prevStartISO, prevEndISO);

    /* ── Build HTML ────────────────────────────────────────── */
    var html = '';
    var isCurrentPeriod = (_workEarningsOffset === 0);

    /* Controls bar */
    html += '<div class="we-controls">';
    html += '<button class="we-nav-btn" data-we-action="prev">&#8249; Prev</button>';
    html += '<div class="we-mode-toggle">';
    html += '<button class="we-mode-btn'+(_workEarningsMode==='week'?' active':'')+'" data-we-action="mode-week">Week</button>';
    html += '<button class="we-mode-btn'+(_workEarningsMode==='month'?' active':'')+'" data-we-action="mode-month">Month</button>';
    html += '</div>';
    if (!isCurrentPeriod) html += '<button class="we-nav-btn" data-we-action="today">Today</button>';
    html += '<button class="we-nav-btn" data-we-action="next">Next &#8250;</button>';
    html += '<button class="we-export-btn" data-we-action="export" title="Export CSV">&#8595; CSV</button>';
    html += '<button class="we-settings-btn" data-we-action="toggle-settings" title="Earnings settings">&#9881;</button>';
    html += '</div>';

    /* Inline settings panel */
    if (_workEarningsSettingsOpen){
      html += '<div class="we-settings-panel">';
      html += '<strong style="font-size:0.93rem">&#9881; Earnings Settings</strong>';
      html += '<div class="we-settings-row">';
      html += '<div><label for="we-weekly-goal">Weekly goal ($)</label><input id="we-weekly-goal" type="number" min="0" step="1" value="'+escHtml(settings.weeklyGoal||'')+'" placeholder="0" /></div>';
      html += '<div><label for="we-monthly-goal">Monthly goal ($)</label><input id="we-monthly-goal" type="number" min="0" step="1" value="'+escHtml(settings.monthlyGoal||'')+'" placeholder="0" /></div>';
      html += '<div><label for="we-tax-rate">Tax rate (%)</label><input id="we-tax-rate" type="number" min="0" max="100" step="0.5" value="'+escHtml(settings.taxRate||'')+'" placeholder="0" /></div>';
      html += '</div>';
      html += '<button class="we-nav-btn" data-we-action="save-settings" style="margin-top:8px;background:#4a90e2;color:#fff;border-color:#4a90e2">Save</button>';
      html += '</div>';
    }

    /* Period label */
    html += '<div class="work-earnings-week-label">'+escHtml(periodLabel)+'</div>';

    if (curr.totalGross <= 0){
      html += '<div class="earnings-empty">No job earnings this period. Schedule job events to see earnings here.</div>';
      container.innerHTML = html;
      wireWorkEarningsHandlers();
      return;
    }

    /* Total */
    html += '<div class="work-earnings-total">$'+curr.totalGross.toFixed(2)+'</div>';

    /* Comparison badge */
    if (prev.totalGross > 0){
      var diff = curr.totalGross - prev.totalGross;
      var periodWord = _workEarningsMode === 'week' ? 'last week' : 'last month';
      if (Math.abs(diff) < 0.01){
        html += '<div class="we-comparison same">Same as '+escHtml(periodWord)+'</div>';
      } else {
        var pct = Math.round(Math.abs(diff) / prev.totalGross * 100);
        if (diff > 0){
          html += '<div class="we-comparison up">+$'+diff.toFixed(2)+' ('+pct+'%) &#9650; vs '+escHtml(periodWord)+'</div>';
        } else {
          html += '<div class="we-comparison down">&#8722;$'+Math.abs(diff).toFixed(2)+' ('+pct+'%) &#9660; vs '+escHtml(periodWord)+'</div>';
        }
      }
    }

    /* Tax estimator */
    if (taxRate > 0){
      var taxAmt = curr.totalGross * taxRate / 100;
      var netAmt = curr.totalGross - taxAmt;
      html += '<div class="we-tax-line">Est. tax ('+taxRate+'%): <strong>$'+taxAmt.toFixed(2)+'</strong> &nbsp;&#183;&nbsp; Est. net: <strong>$'+netAmt.toFixed(2)+'</strong></div>';
    }

    /* Goal progress bar */
    if (goalAmt > 0){
      var goalPct = Math.min(curr.totalGross / goalAmt * 100, 100);
      var overGoal = curr.totalGross >= goalAmt;
      var goalLabel = _workEarningsMode === 'week' ? 'Weekly goal' : 'Monthly goal';
      html += '<div class="we-goal-bar-wrap">';
      html += '<div class="we-goal-bar-label"><span>'+escHtml(goalLabel)+'</span><span>$'+curr.totalGross.toFixed(2)+' / $'+goalAmt.toFixed(2)+'</span></div>';
      html += '<div class="we-goal-bar-outer"><div class="we-goal-bar-inner'+(overGoal?' over':'')+'" style="width:'+goalPct.toFixed(1)+'%"></div></div>';
      html += '</div>';
    }

    /* Bar chart */
    html += buildEarningsChart(curr, _workEarningsMode, todayStr);

    /* Per-day table */
    html += '<table class="earnings-day-table"><thead><tr><th>Day</th><th class="edt-hours">Hours</th><th class="edt-amount">Earned</th></tr></thead><tbody>';
    curr.dayData.forEach(function(dd){
      var isToday = dd.iso === todayStr;
      html += '<tr'+(isToday?' class="edt-today"':'')+'>'+
              '<td>'+escHtml(dd.label)+(isToday?' <strong>·</strong>':'')+' </td>'+
              '<td class="edt-hours">'+(dd.hours > 0 ? dd.hours.toFixed(1)+'h' : '–')+'</td>'+
              '<td class="edt-amount">'+(dd.earnings > 0 ? '$'+dd.earnings.toFixed(2) : '–')+'</td>'+
              '</tr>';
    });
    html += '</tbody></table>';

    /* Per-job expandable cards */
    var jobKeys = Object.keys(curr.jobEarnings);
    if (jobKeys.length > 0){
      html += '<h4 style="margin:12px 0 8px;font-size:0.95rem;color:#666">By Job</h4>';
      html += '<div class="earnings-job-cards">';
      jobKeys.sort(function(a,b){ return curr.jobEarnings[b].totalEarnings - curr.jobEarnings[a].totalEarnings; });
      jobKeys.forEach(function(key){
        var je = curr.jobEarnings[key];
        var isExpanded = !!_workEarningsExpanded[key];
        var meta;
        if (je.unit === 'hour'){
          meta = je.totalHours.toFixed(1)+'h';
          if (je.overtimeHours > 0){
            meta += ' ('+je.regularHours.toFixed(1)+'h reg + '+je.overtimeHours.toFixed(1)+'h OT)';
          }
          meta += ' · $'+je.rate.toFixed(2)+'/hr · '+je.shifts+' shift'+(je.shifts!==1?'s':'');
        } else {
          meta = '$'+je.rate.toFixed(2)+'/'+je.unit+' · '+je.shifts+' shift'+(je.shifts!==1?'s':'');
        }
        html += '<div class="earnings-job-card" data-we-job="'+escHtml(key)+'">';
        html += '<span class="earnings-job-emoji">'+escHtml(je.emoji)+'</span>';
        html += '<div class="earnings-job-info">';
        html += '<div class="earnings-job-name">'+escHtml(je.name)+'</div>';
        html += '<div class="earnings-job-meta">'+escHtml(meta)+'</div>';
        if (je.overtimeEarnings > 0){
          html += '<div style="font-size:0.78rem;color:#856404;margin-top:2px">$'+je.regularEarnings.toFixed(2)+' reg + $'+je.overtimeEarnings.toFixed(2)+' OT</div>';
        }
        html += '</div>';
        html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">';
        html += '<div class="earnings-job-total">$'+je.totalEarnings.toFixed(2)+'</div>';
        html += '<span class="we-card-chevron" style="font-size:0.85rem;color:#aaa">'+(isExpanded?'▾':'▸')+'</span>';
        html += '</div>';
        html += '<div class="earnings-job-shifts'+(isExpanded?' open':'') +'">';
        je.shifts_detail.forEach(function(s){
          html += '<div class="earnings-job-shift-row">';
          html += '<span style="color:#888;min-width:72px">'+escHtml(s.date)+'</span>';
          if (s.timeRange) html += '<span style="color:#666">'+escHtml(s.timeRange)+'</span>';
          if (s.title)     html += '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(s.title)+'</span>';
          if (s.hours > 0) html += '<span style="color:#888">'+s.hours.toFixed(1)+'h</span>';
          html += '<span style="font-weight:600;color:#27ae60;margin-left:4px">$'+s.earnings.toFixed(2)+'</span>';
          if (s.isOT)      html += '<span class="earnings-ot-badge">OT</span>';
          html += '</div>';
        });
        html += '</div>'; // .earnings-job-shifts
        html += '</div>'; // .earnings-job-card
      });
      html += '</div>';
    }

    /* Earnings by Location */
    var locationMap = {};
    jobKeys.forEach(function(key){
      var je = curr.jobEarnings[key];
      if (je.location){
        if (!locationMap[je.location]) locationMap[je.location] = { earnings: 0, hours: 0, jobs: [] };
        locationMap[je.location].earnings += je.totalEarnings;
        locationMap[je.location].hours    += je.totalHours;
        locationMap[je.location].jobs.push(je.name);
      }
    });
    var locKeys = Object.keys(locationMap);
    if (locKeys.length > 0){
      html += '<div class="we-location-section">';
      html += '<h4 style="margin:12px 0 6px;font-size:0.95rem;color:#666">By Location</h4>';
      locKeys.sort(function(a,b){ return locationMap[b].earnings - locationMap[a].earnings; });
      locKeys.forEach(function(loc){
        var ld = locationMap[loc];
        html += '<div class="we-location-group">';
        html += '<span class="we-location-name">&#128205; '+escHtml(loc);
        if (ld.hours > 0) html += ' <span class="we-location-jobs">'+ld.hours.toFixed(1)+'h</span>';
        html += '</span>';
        html += '<span class="we-location-jobs">'+escHtml(ld.jobs.join(', '))+'</span>';
        html += '<span class="we-location-amount">$'+ld.earnings.toFixed(2)+'</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    container.innerHTML = html;
    wireWorkEarningsHandlers();
  } catch(e) {
    container.innerHTML = '<div class="earnings-empty">Unable to calculate earnings.</div>';
    console.warn('renderWorkEarnings error', e);
  }
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
  try { var ctm = document.getElementById('choreTemplateModal'); if (ctm) ctm.classList.add('hidden'); } catch(_) {}
  document.querySelectorAll('[id^="page-"]').forEach(p=> p.classList.add('hidden'));
  const el = document.getElementById('page-'+view) || document.getElementById('page-today');
  if (el) el.classList.remove('hidden');
  document.querySelectorAll('.bottom-ribbon .r-item').forEach(a=>{
    const href = a.getAttribute('href') || '';
    const candidate = (a.dataset && a.dataset.view) ? a.dataset.view : (href.indexOf('#')>-1 ? href.split('#').pop() : '');
    a.classList.toggle('active', candidate === view);
  });
  if (view === 'today'){ try{ generateCalendar(); }catch(e){ console.warn(e); } if (selectedDay) try{ showReminders(selectedDay); }catch(e){ console.warn(e); } try{ updateCompletionRing(); updateDayElapsedRing(); }catch(e){ console.warn(e); } }
  else if (view === 'calendar'){ try{ generateCalendar(); }catch(e){ console.warn(e); } try{ renderCalendarSummary(); }catch(e){ console.warn(e); } }
  else if (view === 'events'){ try{ renderEvents(); }catch(e){ console.warn(e); } }
  else if (view === 'tasks'){ try{ loadTasks(); }catch(e){ console.warn(e); } }
  else if (view === 'jobs'){ try{ renderJobs(); }catch(e){ console.warn(e); } }
  else if (view === 'inbox'){ try{ renderInbox(); updateInboxBadge(); }catch(e){ console.warn(e); } }
  else if (view === 'personal' || view === 'home' || view === 'work'){ try{ renderDomainPage(view); }catch(e){ console.warn(e); } if(view==='work'){ try{ renderWorkEarnings(); }catch(e){ console.warn(e); } } }
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

    // dayPartSelect removed – full 24h scrollable view is now used
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

    // dayPartSelect removed – full 24h scrollable view is now used
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
      userOffDays: (function(){ try { return JSON.parse(localStorage.getItem('userOffDays') || '[]'); } catch(_) { return []; } })(),
      dayStartHour: localStorage.getItem('dayStartHour') || null,
      dayEndHour: localStorage.getItem('dayEndHour') || null,
      personalBuckets: safeParseStorage('personalBuckets', []),
      homeBuckets: safeParseStorage('homeBuckets', []),
      domainColors: safeParseStorage('domainColors', {}),
      personalMeals: safeParseStorage('personalMeals', {}),
      personalCalorieGoal: localStorage.getItem('personalCalorieGoal') || null,
      personalSleep: safeParseStorage('personalSleep', {}),
      personalGym: safeParseStorage('personalGym', {}),
      personalFocus: safeParseStorage('personalFocus', {}),
      personalRoutines: safeParseStorage('personalRoutines', {}),
      personalRoutineLog: safeParseStorage('personalRoutineLog', {}),
      personalHydration: safeParseStorage('personalHydration', {}),
      personalMood: safeParseStorage('personalMood', [])
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
  const personalBuckets = Array.isArray(data.personalBuckets) ? data.personalBuckets : [];
  const homeBuckets = Array.isArray(data.homeBuckets) ? data.homeBuckets : [];
  const domainColors = (data.domainColors && typeof data.domainColors === 'object' && !Array.isArray(data.domainColors)) ? data.domainColors : {};
  const userOffDays = Array.isArray(data.userOffDays) ? data.userOffDays : undefined;
  const dayStartHour = data.dayStartHour != null ? data.dayStartHour : undefined;
  const dayEndHour = data.dayEndHour != null ? data.dayEndHour : undefined;

  return { events, tasks, reminders, jobs, taskCategories, userProfile, personalBuckets, homeBuckets, domainColors, userOffDays, dayStartHour, dayEndHour };
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
    if (importData.dayStartHour != null) localStorage.setItem('dayStartHour', importData.dayStartHour);
    if (importData.dayEndHour != null) localStorage.setItem('dayEndHour', importData.dayEndHour);
    if (Array.isArray(importData.personalBuckets)) localStorage.setItem('personalBuckets', JSON.stringify(importData.personalBuckets));
    if (Array.isArray(importData.homeBuckets)) localStorage.setItem('homeBuckets', JSON.stringify(importData.homeBuckets));
    if (importData.domainColors && typeof importData.domainColors === 'object' && Object.keys(importData.domainColors).length > 0) localStorage.setItem('domainColors', JSON.stringify(importData.domainColors));
    // Personal page widget data
    ['personalMeals', 'personalSleep', 'personalGym', 'personalFocus', 'personalRoutines', 'personalRoutineLog', 'personalHydration'].forEach(function(key) {
      if (importData[key] && typeof importData[key] === 'object') localStorage.setItem(key, JSON.stringify(importData[key]));
    });
    if (Array.isArray(importData.personalMood)) localStorage.setItem('personalMood', JSON.stringify(importData.personalMood));
    if (importData.personalCalorieGoal != null) localStorage.setItem('personalCalorieGoal', importData.personalCalorieGoal);
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
  // Merge active hours (prefer imported if local has no custom setting)
  if (importData.dayStartHour != null && !localStorage.getItem('dayStartHour')) localStorage.setItem('dayStartHour', importData.dayStartHour);
  if (importData.dayEndHour != null && !localStorage.getItem('dayEndHour')) localStorage.setItem('dayEndHour', importData.dayEndHour);
  // Merge personal/home buckets (union, deduplicated by id)
  ['personalBuckets', 'homeBuckets'].forEach(function(key) {
    if (Array.isArray(importData[key]) && importData[key].length) {
      var local = safeParseStorage(key, []);
      var seenIds = {};
      var merged = [];
      local.concat(importData[key]).forEach(function(b) {
        if (!b) return;
        var bid = b.id != null ? b.id : b.name;
        if (!seenIds[bid]) { seenIds[bid] = true; merged.push(b); }
      });
      localStorage.setItem(key, JSON.stringify(merged));
    }
  });
  // Merge domain colors (prefer imported values for keys not already set locally)
  if (importData.domainColors && typeof importData.domainColors === 'object' && Object.keys(importData.domainColors).length > 0) {
    var localDC = safeParseStorage('domainColors', {});
    Object.keys(importData.domainColors).forEach(function(k) {
      if (!localDC[k]) localDC[k] = importData.domainColors[k];
    });
    localStorage.setItem('domainColors', JSON.stringify(localDC));
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
let activeFilterBucket = null; // { domain, bucketId } when filtering by a specific bucket

/* Build the category filter bar dynamically from user buckets across all 3 domains */
function renderCategoryFilterBar() {
  const bar = document.getElementById('categoryFilterBar');
  if (!bar) return;

  // Clear and rebuild with grouped sections
  bar.innerHTML = '';

  // --- Domains section ---
  var domainsLabel = document.createElement('span');
  domainsLabel.style.cssText = 'font-size:0.8rem;color:#666;margin-right:2px;font-weight:600';
  domainsLabel.textContent = 'Domains:';
  bar.appendChild(domainsLabel);

  // "All" button
  const allBtn = document.createElement('button');
  allBtn.className = 'cat-filter-btn' + (activeFilter === 'all' && !activeFilterBucket ? ' active' : '');
  allBtn.dataset.cat = 'all';
  allBtn.textContent = 'All';
  bar.appendChild(allBtn);

  // Domain-level buttons
  var domains = ['personal', 'home', 'work'];
  domains.forEach(function(domain) {
    var meta = DOMAIN_META[domain];
    if (!meta) return;

    var domBtn = document.createElement('button');
    domBtn.className = 'cat-filter-btn' + (activeFilter === domain && !activeFilterBucket ? ' active' : '');
    domBtn.dataset.cat = domain;
    domBtn.textContent = meta.emoji + ' ' + meta.label;
    domBtn.style.fontWeight = '600';
    bar.appendChild(domBtn);
  });

  // --- Buckets section ---
  var hasBuckets = false;
  domains.forEach(function(domain) {
    var buckets = getBuckets(domain);
    if (buckets.length) hasBuckets = true;
  });

  if (hasBuckets) {
    var bucketsLabel = document.createElement('span');
    bucketsLabel.style.cssText = 'font-size:0.8rem;color:#666;margin-right:2px;margin-left:6px;font-weight:600';
    bucketsLabel.textContent = 'Buckets:';
    bar.appendChild(bucketsLabel);

    domains.forEach(function(domain) {
      var buckets = getBuckets(domain);
      buckets.forEach(function(b) {
        var btn = document.createElement('button');
        var isActive = activeFilterBucket && activeFilterBucket.domain === domain && activeFilterBucket.bucketId === b.id;
        btn.className = 'cat-filter-btn' + (isActive ? ' active' : '');
        btn.dataset.cat = 'bucket';
        btn.dataset.bucketDomain = domain;
        btn.dataset.bucketId = String(b.id);
        btn.textContent = (b.emoji ? b.emoji + ' ' : '') + b.name;
        btn.style.fontSize = '0.78rem';
        bar.appendChild(btn);
      });
    });
  }

  // Wire click handlers
  bar.querySelectorAll('.cat-filter-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      bar.querySelectorAll('.cat-filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');

      if (btn.dataset.cat === 'bucket') {
        activeFilter = 'bucket';
        activeFilterBucket = {
          domain: btn.dataset.bucketDomain,
          bucketId: parseInt(btn.dataset.bucketId, 10)
        };
      } else {
        activeFilter = btn.dataset.cat || 'all';
        activeFilterBucket = null;
      }
      generateCalendar();
      if (selectedDay) showReminders(selectedDay);
    });
  });
}

function wireCategoryFilters(){
  renderCategoryFilterBar();

  // Wire the Filter toggle button
  var toggleBtn = document.getElementById('categoryFilterToggle');
  var bar = document.getElementById('categoryFilterBar');
  var arrow = document.getElementById('filterArrow');
  if (toggleBtn && bar) {
    toggleBtn.onclick = function(e) {
      e.stopPropagation();
      var isOpen = bar.style.display === 'flex';
      bar.style.display = isOpen ? 'none' : 'flex';
      toggleBtn.setAttribute('aria-expanded', String(!isOpen));
      if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
    };
  }

  // Re-render filter bar when data changes (buckets may have been added/removed)
  window.addEventListener('app:data:updated', renderCategoryFilterBar);
  window.addEventListener('storage', function(e) {
    if (!e.key || e.key.indexOf('Buckets') !== -1 || e.key === 'jobs') {
      renderCategoryFilterBar();
    }
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
        let hasMatch;
        if (activeFilter === 'bucket' && activeFilterBucket) {
          // Filter by specific bucket within a domain
          hasMatch = dayEvents.some(e => getDomainOfItem(e) === activeFilterBucket.domain && e.bucketId === activeFilterBucket.bucketId);
        } else {
          // Filter by domain (personal, home, work)
          hasMatch = dayEvents.some(e => getDomainOfItem(e) === activeFilter);
        }
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
      tasks.push({ id:generateTaskId(), title:parsed.title, category:parsed.category||'', domain:parsed.domain||'personal', done:false, date:parsed.date||'', time:parsed.time||'', priority:'2' });
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
  const viewDate = getViewedDateISO();
  const tasks = getTasks().filter(function(t){ return t.date && normalizeDate(t.date) === viewDate && !t.done; });
  const rems = (getReminders()[viewDate] || []).filter(function(r){ return !r.done; });
  const dailyCount = tasks.length + rems.length;
  const unsortedCount = getInbox().length;
  const total = dailyCount + unsortedCount;
  label.textContent = total > 0 ? 'Inbox (' + total + ')' : 'Inbox';
}

/* Render daily items (tasks + reminders for viewed day) in the inbox */
function renderInboxDailyItems(){
  const list = document.getElementById('inboxDailyList');
  const empty = document.getElementById('inboxDailyEmpty');
  const heading = document.getElementById('inboxDailyHeading');
  if (!list) return;

  const viewDate = getViewedDateISO();
  const todayStr = getTodayISO();

  // Update heading to reflect the viewed date
  if (heading) {
    if (viewDate === todayStr) {
      heading.textContent = '\uD83D\uDCCB Today\u2019s Items';
    } else {
      var d = new Date(viewDate + 'T12:00:00');
      heading.textContent = '\uD83D\uDCCB Items for ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  // Get tasks for this date
  const tasks = getTasks().filter(function(t){ return t.date && normalizeDate(t.date) === viewDate; });
  // Get reminders for this date
  const allRems = getReminders();
  const dateReminders = allRems[viewDate] || [];

  if (tasks.length === 0 && dateReminders.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  var html = '';

  // Render tasks
  tasks.forEach(function(t, idx){
    var checked = t.done ? 'checked' : '';
    var doneStyle = t.done ? 'text-decoration:line-through;opacity:0.6' : '';
    var timePart = t.time ? ' <span style="color:#888;font-size:0.85rem">[' + escapeHTML(t.time) + ']</span>' : '';
    var priorityMap = {'1':'!','2':'!!','3':'!!!'};
    var prioLabel = t.priority ? ' <span style="color:#e74c3c;font-size:0.8rem">' + (priorityMap[t.priority] || '') + '</span>' : '';
    html += '<div style="background:#e8f8ef;border:1px solid #27ae60;border-radius:10px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px">'
      + '<input type="checkbox" ' + checked + ' onchange="toggleInboxTaskDone(\'' + escapeHTML(t.id) + '\',this.checked)" style="width:18px;height:18px;cursor:pointer;flex-shrink:0">'
      + '<div style="flex:1;' + doneStyle + '">'
      + '<span style="font-weight:600">\u2705 ' + escapeHTML(t.title || '') + '</span>' + timePart + prioLabel
      + '</div></div>';
  });

  // Render reminders
  dateReminders.forEach(function(r, idx){
    var checked = r.done ? 'checked' : '';
    var doneStyle = r.done ? 'text-decoration:line-through;opacity:0.6' : '';
    var timePart = r.time ? ' <span style="color:#888;font-size:0.85rem">[' + escapeHTML(r.time) + ']</span>' : '';
    html += '<div style="background:#fef5e8;border:1px solid #e67e22;border-radius:10px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px">'
      + '<input type="checkbox" ' + checked + ' onchange="toggleInboxReminderDone(\'' + escapeHTML(viewDate) + '\',' + idx + ',this.checked)" style="width:18px;height:18px;cursor:pointer;flex-shrink:0">'
      + '<div style="flex:1;' + doneStyle + '">'
      + '<span style="font-weight:600">\uD83D\uDD14 ' + escapeHTML(r.text || r.title || '') + '</span>' + timePart
      + '</div></div>';
  });

  list.innerHTML = html;
}

/* Toggle task done state from inbox */
function toggleInboxTaskDone(taskId, done){
  const tasks = getTasks();
  for (var i = 0; i < tasks.length; i++){
    if (tasks[i] && String(tasks[i].id) === String(taskId)){
      tasks[i].done = !!done;
      break;
    }
  }
  setTasks(tasks);
  renderInboxDailyItems();
  updateInboxBadge();
  updateCompletionRing();
  // Re-render daily view and task list if visible
  if (typeof window.dailyViewRefresh === 'function') try { window.dailyViewRefresh(); } catch(_){}
  if (typeof loadTasks === 'function') try { loadTasks(); } catch(_){}
}
window.toggleInboxTaskDone = toggleInboxTaskDone;

/* Toggle reminder done state from inbox */
function toggleInboxReminderDone(dateKey, index, done){
  const r = getReminders();
  if (r[dateKey] && r[dateKey][index]){
    r[dateKey][index].done = !!done;
    setReminders(r);
  }
  renderInboxDailyItems();
  updateInboxBadge();
  updateCompletionRing();
  // Re-render daily view and reminder bar if visible
  if (typeof window.dailyViewRefresh === 'function') try { window.dailyViewRefresh(); } catch(_){}
  if (typeof showReminders === 'function' && typeof selectedDay !== 'undefined') try { showReminders(selectedDay); } catch(_){}
}
window.toggleInboxReminderDone = toggleInboxReminderDone;

/* Render unsorted inbox items */
function renderInbox(){
  renderInboxDailyItems();

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
  tasks.push({ id: generateTaskId(), title, category: '', domain: domain, done: false, date, time: '', priority });
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
  renderCategoryFilterBar();
}
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
  renderCategoryFilterBar();
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
  renderCategoryFilterBar();
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
      var energyOpts = domain === 'home' ?
        ('<select class="bi-energy" style="width:110px"><option value="">⚡ Energy</option>' +
          Object.keys(_ENERGY_LABELS).map(function(k){ return '<option value="'+k+'">'+_ENERGY_LABELS[k]+'</option>'; }).join('') +
          '</select>') : '';
      form.innerHTML = [
        '<input type="text" placeholder="Task title" class="bi-title" style="width:100%;box-sizing:border-box;margin-top:0" />',
        '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">',
        '<input type="date" class="bi-date" style="flex:1;min-width:110px" />',
        '<select class="bi-priority" style="width:110px"><option value="1">! Low</option><option value="2" selected>!! Med</option><option value="3">!!! High</option></select>',
        energyOpts,
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
    const energyEl = formEl.querySelector('.bi-energy');
    const energy = energyEl ? energyEl.value : '';
    const tasks = getTasks();
    const t = { id: generateTaskId(), title, category: domain, domain: domain, done: false, date, time, priority, emoji: jobDefaults.emoji };
    if (domain === 'home' && energy) t.energy = energy;
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

  /* For home tasks: show a done checkbox */
  if (domain === 'home' && item.type === 'task') {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!item.done;
    cb.style.cssText = 'width:16px;height:16px;cursor:pointer;flex-shrink:0;margin-right:2px';
    cb.title = item.done ? 'Mark as not done' : 'Mark as done';
    cb.addEventListener('change', function() {
      const tasks = getTasks();
      const t = tasks.find(function(x) { return x.id === item.data.id; });
      if (t) {
        t.done = cb.checked;
        setTasks(tasks);
        if (cb.checked && t.bucketId != null) {
          try { updateHomeStreak(t.bucketId); } catch(e) {}
        }
      }
      try { renderBucketPage(domain); } catch(e) {}
    });
    titleRow.appendChild(cb);
  }

  const badge = document.createElement('span');
  badge.textContent = typeEmoji;
  badge.style.fontSize = '0.9rem';

  const titleEl = document.createElement('b');
  titleEl.style.cssText = 'word-break:break-word;font-size:0.92rem';
  titleEl.textContent = item.title || '';
  if (item.done) titleEl.style.textDecoration = 'line-through';

  titleRow.appendChild(badge);
  titleRow.appendChild(titleEl);

  /* Energy badge for home tasks */
  if (domain === 'home' && item.type === 'task' && item.data.energy) {
    const energyBadge = document.createElement('span');
    energyBadge.className = 'energy-badge ' + item.data.energy;
    energyBadge.textContent = _ENERGY_LABELS[item.data.energy] || item.data.energy;
    titleRow.appendChild(energyBadge);
  }

  const meta = document.createElement('div');
  meta.style.cssText = 'font-size:0.78rem;color:#888';
  const prioMap = {'1':'!','2':'!!','3':'!!!'};
  const parts = [];
  if (item.date) parts.push(item.date);
  if (item.time) parts.push(item.time + (item.endTime ? '–' + item.endTime : ''));
  if (item.location) parts.push('@ ' + item.location);
  if (item.priority) parts.push(prioMap[item.priority] || item.priority);
  /* Show recurrence label for home tasks */
  if (domain === 'home' && item.type === 'task' && item.data.repeat && item.data.repeat !== 'none') {
    parts.push('🔁 ' + (_REPEAT_LABELS[item.data.repeat] || item.data.repeat));
  }
  meta.textContent = parts.join(' · ');

  left.appendChild(titleRow);
  if (meta.textContent) left.appendChild(meta);

  /* Sub-steps for home tasks */
  if (domain === 'home' && item.type === 'task') {
    const taskData = item.data;
    const steps = Array.isArray(taskData.steps) ? taskData.steps : [];
    const stepsWrap = document.createElement('div');

    if (steps.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'steps-list';
      steps.forEach(function(step, si) {
        const li = document.createElement('li');
        if (step.done) li.className = 'done-step';
        const scb = document.createElement('input');
        scb.type = 'checkbox';
        scb.checked = !!step.done;
        scb.addEventListener('change', function() {
          toggleTaskStep(taskData.id, si, scb.checked);
          try { renderBucketPage(domain); } catch(e) {}
        });
        const stepText = document.createElement('span');
        stepText.textContent = step.text;
        li.appendChild(scb);
        li.appendChild(stepText);
        ul.appendChild(li);
      });
      stepsWrap.appendChild(ul);
    }

    /* Add step input row */
    const stepsAddRow = document.createElement('div');
    stepsAddRow.className = 'steps-add-row';
    stepsAddRow.style.display = 'none';
    const stepInput = document.createElement('input');
    stepInput.type = 'text';
    stepInput.className = 'steps-add-input';
    stepInput.placeholder = 'Add a step…';
    const stepAddBtn = document.createElement('button');
    stepAddBtn.className = 'steps-add-btn';
    stepAddBtn.type = 'button';
    stepAddBtn.textContent = '＋';
    stepAddBtn.addEventListener('click', function() {
      const text = stepInput.value.trim();
      if (!text) return;
      var tasks = getTasks();
      var t = tasks.find(function(x) { return x.id === taskData.id; });
      if (t) {
        if (!Array.isArray(t.steps)) t.steps = [];
        t.steps.push({ text: text, done: false });
        setTasks(tasks);
      }
      try { renderBucketPage(domain); } catch(e) {}
    });
    stepInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); stepAddBtn.click(); }
    });
    stepsAddRow.appendChild(stepInput);
    stepsAddRow.appendChild(stepAddBtn);
    stepsWrap.appendChild(stepsAddRow);

    const toggleStepsBtn = document.createElement('button');
    toggleStepsBtn.className = 'steps-toggle-btn';
    toggleStepsBtn.type = 'button';
    toggleStepsBtn.textContent = steps.length > 0 ? '+ add step' : '+ add steps';
    toggleStepsBtn.addEventListener('click', function() {
      const isOpen = stepsAddRow.style.display !== 'none';
      stepsAddRow.style.display = isOpen ? 'none' : 'flex';
      if (!isOpen) setTimeout(function() { stepInput.focus(); }, 50);
    });
    stepsWrap.appendChild(toggleStepsBtn);
    left.appendChild(stepsWrap);
  }

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
  /* Show streak badge for home domain buckets */
  if (domain === 'home' && !isUncategorized && bucket.id != null) {
    try {
      const streaks = getHomeStreaks();
      const s = streaks[bucket.id];
      if (s && s.streak > 0) {
        const streakBadge = document.createElement('span');
        streakBadge.className = 'streak-badge';
        streakBadge.title = s.streak + '-day completion streak';
        streakBadge.textContent = '🔥 ' + s.streak;
        titleDiv.appendChild(streakBadge);
      }
    } catch(e) {}
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

  /* Home-specific pre-render */
  if (domain === 'home') {
    try { renderHomeDashboard(); } catch(e) {}
    try { renderGroceryList(); } catch(e) {}
    try { renderHomeEnergyFilter(); } catch(e) {}
  }

  /* Personal-specific pre-render */
  if (domain === 'personal') {
    try { renderPersonalWidgets(); } catch(e) { console.warn('renderPersonalWidgets failed', e); }
  }

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
    /* Apply energy filter for home domain */
    if (domain === 'home' && _homeEnergyFilter !== 'all' && t.energy && t.energy !== _homeEnergyFilter) return;
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
  wireHomePage();
}

/* ============================================================
   HOME PAGE FEATURES: Dashboard, Streaks, Energy Tags,
   Sub-steps, Chore Templates, Grocery List
   ============================================================ */

/* ── Grocery List storage ───────────────────────────────────── */
function getGroceryList() { return safeParseStorage('groceryList', []); }
function setGroceryList(v) { localStorage.setItem('groceryList', JSON.stringify(v)); }
function nextGroceryId() {
  const list = getGroceryList();
  return list.length ? Math.max.apply(null, list.map(function(i) { return i.id || 0; })) + 1 : 1;
}

/* ── Home Streak storage ─────────────────────────────────────── */
function getHomeStreaks() { return safeParseStorage('homeStreaks', {}); }
function setHomeStreaks(v) { localStorage.setItem('homeStreaks', JSON.stringify(v)); }
function updateHomeStreak(bucketId) {
  if (bucketId == null) return;
  var today = getTodayISO();
  var streaks = getHomeStreaks();
  var s = streaks[bucketId] || { lastDone: '', streak: 0 };
  if (s.lastDone === today) return;
  var yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  var yestISO = yesterday.toISOString().slice(0, 10);
  if (s.lastDone === yestISO) s.streak = (s.streak || 0) + 1;
  else if (s.lastDone === '') s.streak = 1;
  else s.streak = 1;
  s.lastDone = today;
  streaks[bucketId] = s;
  setHomeStreaks(streaks);
}

/* ── Energy filter state ─────────────────────────────────────── */
var _homeEnergyFilter = 'all';

/* ── Chore templates ─────────────────────────────────────────── */
var DEFAULT_CHORE_TEMPLATES = [
  { emoji: '🍽️', name: 'Dishes',               repeat: 'daily',   energy: 'low',    defaultDate: 0 },
  { emoji: '💊', name: 'Take Medication',       repeat: 'daily',   energy: 'low',    defaultDate: 0 },
  { emoji: '📬', name: 'Check mail',            repeat: 'daily',   energy: 'low',    defaultDate: 0 },
  { emoji: '🐾', name: 'Feed pets',             repeat: 'daily',   energy: 'low',    defaultDate: 0 },
  { emoji: '👕', name: 'Laundry',               repeat: 'weekly',  energy: 'medium', defaultDate: 0 },
  { emoji: '🧹', name: 'Sweep / Vacuum',        repeat: 'weekly',  energy: 'medium', defaultDate: 0 },
  { emoji: '🗑️', name: 'Take out trash',       repeat: 'weekly',  energy: 'low',    defaultDate: 0 },
  { emoji: '🧺', name: 'Put away laundry',      repeat: 'weekly',  energy: 'medium', defaultDate: 0 },
  { emoji: '🪟', name: 'Wipe surfaces',         repeat: 'weekly',  energy: 'low',    defaultDate: 0 },
  { emoji: '🛒', name: 'Groceries',             repeat: 'weekly',  energy: 'high',   defaultDate: 0 },
  { emoji: '🧼', name: 'Clean bathroom',        repeat: 'weekly',  energy: 'high',   defaultDate: 0 },
  { emoji: '🧽', name: 'Clean kitchen',         repeat: 'weekly',  energy: 'high',   defaultDate: 0 },
  { emoji: '🌱', name: 'Water plants',          repeat: '2day',    energy: 'low',    defaultDate: 0 },
  { emoji: '🪣', name: 'Mop floors',            repeat: 'monthly', energy: 'high',   defaultDate: 0 }
];

var _REPEAT_LABELS = { daily: 'daily', '2day': 'every 2 days', weekly: 'weekly', monthly: 'monthly', none: 'once' };
var _ENERGY_LABELS = { low: '🟢 Low', medium: '🟡 Medium', high: '🔴 High' };

/* ── User-customisable chore template storage ────────────────── */
var CHORE_TPL_KEY = 'choreTemplatesCustom';

function getChoreTemplates() {
  var stored = safeParseStorage(CHORE_TPL_KEY, null);
  if (stored === null) return DEFAULT_CHORE_TEMPLATES.map(function(t) {
    return { id: generateChoreTplId(), emoji: t.emoji, name: t.name, repeat: t.repeat, energy: t.energy, defaultDate: t.defaultDate, defaultBucketId: undefined };
  });
  return stored;
}

function setChoreTemplates(list) {
  localStorage.setItem(CHORE_TPL_KEY, JSON.stringify(list));
}

function generateChoreTplId() {
  return 'ctpl:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
}

/* ── Render Home Dashboard ───────────────────────────────────── */
function renderHomeDashboard() {
  var el = document.getElementById('homeDashboard');
  if (!el) return;

  var today = getTodayISO();
  var allTasks = getTasks().filter(function(t) { return getDomainOfItem(t) === 'home'; });
  var todayTasks = allTasks.filter(function(t) { return t.date === today; });
  var doneTodayCount = todayTasks.filter(function(t) { return t.done; }).length;
  var totalToday = todayTasks.length;
  var overdueTasks = allTasks.filter(function(t) {
    return t.date && t.date < today && !t.done;
  });
  var thisWeekEnd = new Date(); thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);
  var weekEndISO = thisWeekEnd.toISOString().slice(0, 10);
  var upcomingTasks = allTasks.filter(function(t) {
    return t.date && t.date > today && t.date <= weekEndISO && !t.done;
  });

  var pct = totalToday > 0 ? Math.round((doneTodayCount / totalToday) * 100) : 0;
  var circumference = 113.1;
  var offset = circumference - (pct / 100) * circumference;
  var ringColor = pct === 100 ? '#27ae60' : '#4a90e2';

  var html = '<div class="home-dashboard">';
  html += '<p class="home-dash-title">🏡 Today\'s Chores</p>';
  html += '<div class="home-dash-stats">';
  // Progress ring
  html += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">';
  html += '<svg viewBox="0 0 44 44" style="width:64px;height:64px">';
  html += '<circle class="ring-bg" cx="22" cy="22" r="18"/>';
  html += '<circle class="ring-fg" cx="22" cy="22" r="18" stroke="' + ringColor + '" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '" transform="rotate(-90 22 22)"/>';
  html += '<text class="ring-pct" x="22" y="22">' + pct + '%</text>';
  html += '</svg>';
  html += '<span class="ring-label">Done</span>';
  html += '</div>';
  // Stat pills
  html += '<div style="display:flex;flex-direction:column;gap:6px;flex:1">';
  html += '<div style="display:flex;gap:6px">';
  html += '<div class="home-stat-pill"><span class="home-stat-num done">' + doneTodayCount + '/' + totalToday + '</span><span class="home-stat-label">Today</span></div>';
  html += '<div class="home-stat-pill"><span class="home-stat-num overdue">' + overdueTasks.length + '</span><span class="home-stat-label">Overdue</span></div>';
  html += '<div class="home-stat-pill"><span class="home-stat-num">' + upcomingTasks.length + '</span><span class="home-stat-label">This week</span></div>';
  html += '</div>';
  html += '</div>';
  html += '</div>'; // home-dash-stats

  // Nudges for overdue tasks
  if (overdueTasks.length > 0) {
    html += '<div style="margin-top:8px">';
    var nudges = overdueTasks.slice(0, 3);
    nudges.forEach(function(t) {
      var daysAgo = Math.round((new Date(today) - new Date(t.date)) / 86400000);
      var label = daysAgo === 1 ? 'yesterday' : daysAgo + ' days ago';
      html += '<div class="home-nudge"><span class="home-nudge-title">' + (t.emoji || '📋') + ' ' + escapeHTML(t.title || '') + '</span>';
      html += ' <span style="font-weight:400">was due ' + label + '</span></div>';
    });
    if (overdueTasks.length > 3) {
      html += '<div style="font-size:0.8rem;color:#888;margin-top:2px">…and ' + (overdueTasks.length - 3) + ' more overdue</div>';
    }
    html += '</div>';
  }

  html += '</div>'; // home-dashboard
  el.innerHTML = html;
}

/* ── Render Energy Filter Bar ───────────────────────────────── */
function renderHomeEnergyFilter() {
  var bar = document.getElementById('homeEnergyFilter');
  if (!bar) return;
  bar.innerHTML = '';
  var filters = [
    { key: 'all',    label: 'All' },
    { key: 'low',    label: '🟢 Easy' },
    { key: 'medium', label: '🟡 Medium' },
    { key: 'high',   label: '🔴 Hard' }
  ];
  filters.forEach(function(f) {
    var btn = document.createElement('button');
    btn.className = 'energy-filter-btn' + (_homeEnergyFilter === f.key ? ' active' : '');
    btn.textContent = f.label;
    btn.addEventListener('click', function() {
      _homeEnergyFilter = f.key;
      renderHomeEnergyFilter();
      renderBucketPage('home');
    });
    bar.appendChild(btn);
  });
}

/* ── Render Grocery List ─────────────────────────────────────── */
function renderGroceryList() {
  var section = document.getElementById('homeGrocerySection');
  if (!section) return;
  var list = getGroceryList();
  var inCartCount = list.filter(function(i) { return i.inCart; }).length;
  var pendingCount = list.length - inCartCount;

  var el = document.createElement('div');
  el.className = 'grocery-section';

  // Header
  var header = document.createElement('div');
  header.className = 'grocery-header';
  var headerTitle = document.createElement('div');
  headerTitle.className = 'grocery-header-title';
  headerTitle.innerHTML = '🛒 Grocery List <span style="font-size:0.75rem;color:#888;font-weight:400;margin-left:4px">(' + pendingCount + ' pending' + (inCartCount ? ', ' + inCartCount + ' in cart' : '') + ')</span>';
  var chevron = document.createElement('span');
  chevron.className = 'bucket-chevron';
  var isCollapsed = safeParseStorage('groceryCollapsed', false);
  chevron.textContent = isCollapsed ? '▸' : '▾';
  header.appendChild(headerTitle);
  header.appendChild(chevron);

  // Body
  var body = document.createElement('div');
  body.className = 'grocery-body';
  if (isCollapsed) body.style.display = 'none';

  // Add form
  var addRow = document.createElement('div');
  addRow.className = 'grocery-add-row';
  addRow.innerHTML = [
    '<input type="text" id="groceryItemInput" class="grocery-add-input" placeholder="Item name…" autocomplete="off" />',
    '<input type="text" id="groceryQtyInput" class="grocery-qty-input" placeholder="Qty" />',
    '<select id="grocerySectionSel" class="grocery-section-sel">',
    '<option value="">Section…</option>',
    '<option value="Produce">🥦 Produce</option>',
    '<option value="Dairy">🥛 Dairy</option>',
    '<option value="Meat">🥩 Meat</option>',
    '<option value="Bakery">🍞 Bakery</option>',
    '<option value="Frozen">🧊 Frozen</option>',
    '<option value="Pantry">🥫 Pantry</option>',
    '<option value="Beverages">🧃 Beverages</option>',
    '<option value="Household">🧹 Household</option>',
    '<option value="Other">📦 Other</option>',
    '</select>',
    '<button class="grocery-add-btn" id="groceryAddBtn">＋ Add</button>'
  ].join('');
  body.appendChild(addRow);

  // Item list
  var ul = document.createElement('ul');
  ul.className = 'grocery-items';
  if (!list.length) {
    var empty = document.createElement('li');
    empty.style.cssText = 'color:#aaa;text-align:center;padding:10px 0;font-size:0.88rem';
    empty.textContent = 'No items yet.';
    ul.appendChild(empty);
  } else {
    list.forEach(function(item) {
      var li = document.createElement('li');
      li.className = 'grocery-item' + (item.inCart ? ' in-cart' : '');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!item.inCart;
      cb.style.cssText = 'width:16px;height:16px;cursor:pointer;flex-shrink:0';
      cb.title = item.inCart ? 'Remove from cart' : 'Mark in cart';
      cb.addEventListener('change', function() {
        var l = getGroceryList();
        var idx = l.findIndex(function(x) { return x.id === item.id; });
        if (idx !== -1) { l[idx].inCart = cb.checked; setGroceryList(l); }
        renderGroceryList();
      });
      var textSpan = document.createElement('span');
      textSpan.className = 'grocery-item-text';
      textSpan.textContent = item.text;
      var qtySpan = document.createElement('span');
      qtySpan.className = 'grocery-item-qty';
      qtySpan.textContent = item.qty || '';
      var secSpan = document.createElement('span');
      secSpan.className = 'grocery-item-section';
      secSpan.style.display = item.section ? '' : 'none';
      secSpan.textContent = item.section || '';
      var delBtn = document.createElement('button');
      delBtn.className = 'grocery-item-del';
      delBtn.textContent = '✕';
      delBtn.title = 'Remove';
      delBtn.addEventListener('click', function() {
        var l = getGroceryList();
        setGroceryList(l.filter(function(x) { return x.id !== item.id; }));
        renderGroceryList();
      });
      li.appendChild(cb);
      li.appendChild(textSpan);
      if (item.qty) li.appendChild(qtySpan);
      if (item.section) li.appendChild(secSpan);
      li.appendChild(delBtn);
      ul.appendChild(li);
    });
    if (inCartCount > 0) {
      var clearBtn = document.createElement('button');
      clearBtn.className = 'grocery-clear-btn';
      clearBtn.textContent = 'Clear ' + inCartCount + ' in-cart item' + (inCartCount > 1 ? 's' : '');
      clearBtn.addEventListener('click', function() {
        setGroceryList(getGroceryList().filter(function(i) { return !i.inCart; }));
        renderGroceryList();
      });
      body.appendChild(ul);
      body.appendChild(clearBtn);
      el.appendChild(header);
      el.appendChild(body);
      section.innerHTML = '';
      section.appendChild(el);
      wireGroceryList();
      return;
    }
  }
  body.appendChild(ul);
  el.appendChild(header);
  el.appendChild(body);
  section.innerHTML = '';
  section.appendChild(el);
  wireGroceryList();

  // Collapse toggle
  header.addEventListener('click', function(e) {
    if (e.target.closest('.grocery-add-row, .grocery-items, .grocery-add-btn')) return;
    var collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    chevron.textContent = collapsed ? '▾' : '▸';
    localStorage.setItem('groceryCollapsed', JSON.stringify(!collapsed));
  });
}

function wireGroceryList() {
  var addBtn = document.getElementById('groceryAddBtn');
  var inp = document.getElementById('groceryItemInput');
  var qtyInp = document.getElementById('groceryQtyInput');
  var secSel = document.getElementById('grocerySectionSel');

  function doAdd() {
    var text = inp ? inp.value.trim() : '';
    if (!text) { if (inp) { inp.focus(); inp.style.outline = '2px solid #e74c3c'; setTimeout(function(){ inp.style.outline=''; }, 1200); } return; }
    var qty = qtyInp ? qtyInp.value.trim() : '';
    var section = secSel ? secSel.value : '';
    var list = getGroceryList();
    list.push({ id: nextGroceryId(), text: text, qty: qty, section: section, inCart: false, added: getTodayISO() });
    setGroceryList(list);
    renderGroceryList();
  }

  if (addBtn) addBtn.addEventListener('click', doAdd);
  if (inp) inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
}

/* ── Chore Template Modal ────────────────────────────────────── */
var _choreModalMode = 'pick'; // 'pick' or 'manage'

function openChoreTemplateModal() {
  _choreModalMode = 'pick';
  renderChoreTemplateModalContent();
  var modal = document.getElementById('choreTemplateModal');
  if (modal) modal.classList.remove('hidden');
}

function renderChoreTemplateModalContent() {
  var grid = document.getElementById('choreTemplateGrid');
  var bucketSel = document.getElementById('choreTemplateBucket');
  var bucketRow = document.querySelector('.chore-tpl-bucket-row');
  var titleEl = document.querySelector('.chore-tpl-title');
  var manageBtn = document.getElementById('choreManagePresetsBtn');
  // Scroll modal panel to top so title/mode change is visible
  var panel = document.querySelector('.chore-tpl-panel');
  if (panel) panel.scrollTop = 0;
  if (!grid) return;

  var templates = getChoreTemplates();
  var homeBuckets = getBuckets('home');

  if (_choreModalMode === 'pick') {
    // --- Pick mode (original behaviour + manage button) ---
    if (titleEl) titleEl.textContent = '⚡ Quick Chore';
    if (bucketRow) bucketRow.style.display = 'flex';
    if (manageBtn) { manageBtn.textContent = '✏️ Manage Presets'; manageBtn.onclick = function() { _choreModalMode = 'manage'; renderChoreTemplateModalContent(); }; }

    // Populate bucket dropdown
    if (bucketSel) {
      bucketSel.innerHTML = '<option value="">— Uncategorized —</option>';
      homeBuckets.forEach(function(b) {
        var opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = (b.emoji ? b.emoji + ' ' : '') + b.name;
        bucketSel.appendChild(opt);
      });
    }

    // Build template grid
    grid.innerHTML = '';
    templates.forEach(function(tpl) {
      var btn = document.createElement('button');
      btn.className = 'chore-tpl-item';
      btn.type = 'button';
      // Show linked bucket if set
      var bucketLabel = '';
      if (tpl.defaultBucketId !== undefined && tpl.defaultBucketId !== null) {
        var linkedBucket = homeBuckets.find(function(b) { return b.id === tpl.defaultBucketId; });
        if (linkedBucket) bucketLabel = ' → ' + (linkedBucket.emoji ? linkedBucket.emoji + ' ' : '') + escapeHTML(linkedBucket.name);
      }
      btn.innerHTML = '<span class="tpl-emoji">' + tpl.emoji + '</span>' +
        '<span><span class="tpl-name">' + escapeHTML(tpl.name) + '</span>' +
        '<span class="tpl-meta">' + (_REPEAT_LABELS[tpl.repeat] || tpl.repeat) + ' · ' + _ENERGY_LABELS[tpl.energy] + (bucketLabel ? bucketLabel : '') + '</span></span>';
      btn.addEventListener('click', function() {
        // Use bucket selector override, else template default, else undefined
        var bId;
        if (bucketSel && bucketSel.value) {
          bId = parseInt(bucketSel.value, 10);
        } else if (tpl.defaultBucketId !== undefined && tpl.defaultBucketId !== null) {
          bId = tpl.defaultBucketId;
        }
        addChoreFromTemplate(tpl, bId);
        var modal = document.getElementById('choreTemplateModal');
        if (modal) modal.classList.add('hidden');
      });
      grid.appendChild(btn);
    });

    if (templates.length === 0) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#888;font-size:0.88rem">No presets configured. Tap "✏️ Manage Presets" to add some.</p>';
    }
  } else {
    // --- Manage mode ---
    if (titleEl) titleEl.textContent = '✏️ Manage Chore Presets';
    if (bucketRow) bucketRow.style.display = 'none';
    if (manageBtn) { manageBtn.textContent = '⬅ Back'; manageBtn.onclick = function() { _choreModalMode = 'pick'; renderChoreTemplateModalContent(); }; }

    grid.innerHTML = '';

    // Add new preset row
    var addRow = document.createElement('div');
    addRow.className = 'chore-tpl-manage-add';
    addRow.innerHTML =
      '<input type="text" id="newChoreTplEmoji" placeholder="😀" maxlength="4" class="chore-tpl-emoji-input" />' +
      '<input type="text" id="newChoreTplName" placeholder="Chore name…" class="chore-tpl-name-input" />' +
      '<select id="newChoreTplRepeat" class="chore-tpl-sel">' +
        '<option value="daily">Daily</option><option value="2day">Every 2 days</option>' +
        '<option value="weekly" selected>Weekly</option><option value="monthly">Monthly</option><option value="none">Once</option>' +
      '</select>' +
      '<select id="newChoreTplEnergy" class="chore-tpl-sel">' +
        '<option value="low">🟢 Low</option><option value="medium">🟡 Medium</option><option value="high">🔴 High</option>' +
      '</select>' +
      '<select id="newChoreTplBucket" class="chore-tpl-sel"><option value="">No default bucket</option></select>' +
      '<button type="button" id="addChoreTplBtn" class="chore-tpl-add-btn">+ Add</button>';
    grid.appendChild(addRow);

    // Populate new-preset bucket dropdown
    var newBucketSel = addRow.querySelector('#newChoreTplBucket');
    homeBuckets.forEach(function(b) {
      var opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = (b.emoji ? b.emoji + ' ' : '') + b.name;
      newBucketSel.appendChild(opt);
    });

    addRow.querySelector('#addChoreTplBtn').addEventListener('click', function() {
      var emoji = (document.getElementById('newChoreTplEmoji').value || '📋').trim();
      var name = (document.getElementById('newChoreTplName').value || '').trim();
      if (!name) { document.getElementById('newChoreTplName').focus(); return; }
      var repeat = document.getElementById('newChoreTplRepeat').value;
      var energy = document.getElementById('newChoreTplEnergy').value;
      var bVal = document.getElementById('newChoreTplBucket').value;
      var tpls = getChoreTemplates();
      tpls.push({ id: generateChoreTplId(), emoji: emoji, name: name, repeat: repeat, energy: energy, defaultDate: 0, defaultBucketId: bVal ? parseInt(bVal, 10) : undefined });
      setChoreTemplates(tpls);
      renderChoreTemplateModalContent();
    });

    // List existing presets
    templates.forEach(function(tpl) {
      var row = document.createElement('div');
      row.className = 'chore-tpl-manage-row';

      // Bucket label
      var linkedBucketLabel = 'No default bucket';
      if (tpl.defaultBucketId !== undefined && tpl.defaultBucketId !== null) {
        var lb = homeBuckets.find(function(b) { return b.id === tpl.defaultBucketId; });
        if (lb) linkedBucketLabel = (lb.emoji ? lb.emoji + ' ' : '') + lb.name;
      }

      row.innerHTML =
        '<span class="tpl-emoji" style="font-size:1.3rem;flex-shrink:0">' + tpl.emoji + '</span>' +
        '<span class="chore-tpl-manage-info">' +
          '<span class="tpl-name">' + escapeHTML(tpl.name) + '</span>' +
          '<span class="tpl-meta">' + (_REPEAT_LABELS[tpl.repeat] || tpl.repeat) + ' · ' + _ENERGY_LABELS[tpl.energy] + '</span>' +
          '<span class="tpl-meta" style="color:#4a90e2">🔗 ' + escapeHTML(linkedBucketLabel) + '</span>' +
        '</span>' +
        '<button type="button" class="chore-tpl-edit-btn" title="Edit">✏️</button>' +
        '<button type="button" class="chore-tpl-del-btn" title="Delete">🗑️</button>';

      // Delete
      row.querySelector('.chore-tpl-del-btn').addEventListener('click', function() {
        var tpls = getChoreTemplates().filter(function(t) { return t.id !== tpl.id; });
        setChoreTemplates(tpls);
        renderChoreTemplateModalContent();
      });

      // Edit – replace row with inline edit form
      row.querySelector('.chore-tpl-edit-btn').addEventListener('click', function() {
        row.innerHTML = '';
        row.className = 'chore-tpl-manage-edit';
        row.innerHTML =
          '<input type="text" class="chore-tpl-emoji-input" value="' + escapeHTML(tpl.emoji) + '" maxlength="4" />' +
          '<input type="text" class="chore-tpl-name-input" value="' + escapeHTML(tpl.name) + '" />' +
          '<select class="chore-tpl-sel edit-repeat"></select>' +
          '<select class="chore-tpl-sel edit-energy"></select>' +
          '<select class="chore-tpl-sel edit-bucket"><option value="">No default bucket</option></select>' +
          '<button type="button" class="chore-tpl-save-btn">💾 Save</button>' +
          '<button type="button" class="chore-tpl-cancel-btn">Cancel</button>';

        // populate selects
        var repSel = row.querySelector('.edit-repeat');
        [['daily','Daily'],['2day','Every 2 days'],['weekly','Weekly'],['monthly','Monthly'],['none','Once']].forEach(function(p) {
          var o = document.createElement('option'); o.value = p[0]; o.textContent = p[1];
          if (p[0] === tpl.repeat) o.selected = true;
          repSel.appendChild(o);
        });
        var enSel = row.querySelector('.edit-energy');
        [['low','🟢 Low'],['medium','🟡 Medium'],['high','🔴 High']].forEach(function(p) {
          var o = document.createElement('option'); o.value = p[0]; o.textContent = p[1];
          if (p[0] === tpl.energy) o.selected = true;
          enSel.appendChild(o);
        });
        var bkSel = row.querySelector('.edit-bucket');
        homeBuckets.forEach(function(b) {
          var o = document.createElement('option'); o.value = b.id; o.textContent = (b.emoji ? b.emoji + ' ' : '') + b.name;
          if (tpl.defaultBucketId !== undefined && tpl.defaultBucketId !== null && b.id === tpl.defaultBucketId) o.selected = true;
          bkSel.appendChild(o);
        });

        row.querySelector('.chore-tpl-save-btn').addEventListener('click', function() {
          var editedName = (row.querySelector('.chore-tpl-name-input').value || '').trim();
          if (!editedName) { row.querySelector('.chore-tpl-name-input').focus(); return; }
          var tpls = getChoreTemplates();
          var idx = tpls.findIndex(function(t) { return t.id === tpl.id; });
          if (idx === -1) { renderChoreTemplateModalContent(); return; }
          tpls[idx].emoji = (row.querySelector('.chore-tpl-emoji-input').value || '📋').trim();
          tpls[idx].name = editedName;
          tpls[idx].repeat = repSel.value;
          tpls[idx].energy = enSel.value;
          var bv = bkSel.value;
          tpls[idx].defaultBucketId = bv ? parseInt(bv, 10) : undefined;
          setChoreTemplates(tpls);
          renderChoreTemplateModalContent();
        });

        row.querySelector('.chore-tpl-cancel-btn').addEventListener('click', function() {
          renderChoreTemplateModalContent();
        });
      });

      grid.appendChild(row);
    });

    if (templates.length === 0) {
      var emptyMsg = document.createElement('p');
      emptyMsg.style.cssText = 'text-align:center;color:#888;font-size:0.88rem;margin-top:8px';
      emptyMsg.textContent = 'No presets yet. Use the form above to add one.';
      grid.appendChild(emptyMsg);
    }

    // Reset to defaults button
    var resetRow = document.createElement('div');
    resetRow.style.cssText = 'text-align:center;margin-top:12px';
    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'chore-tpl-reset-btn';
    resetBtn.textContent = '↩ Reset to Defaults';
    resetBtn.addEventListener('click', function() {
      if (!confirm('Reset all chore presets to the built-in defaults? Your customisations will be lost.')) return;
      localStorage.removeItem(CHORE_TPL_KEY);
      renderChoreTemplateModalContent();
    });
    resetRow.appendChild(resetBtn);
    grid.appendChild(resetRow);
  }
}

function addChoreFromTemplate(tpl, bucketId) {
  var today = getTodayISO();
  var tasks = getTasks();
  var newTask = {
    id: generateTaskId(),
    title: tpl.name,
    emoji: tpl.emoji,
    category: 'home',
    domain: 'home',
    done: false,
    date: today,
    time: '',
    priority: '2',
    energy: tpl.energy,
    steps: []
  };
  if (tpl.repeat !== 'none') newTask.repeat = tpl.repeat;
  if (bucketId !== undefined && bucketId !== null) newTask.bucketId = bucketId;
  tasks.push(newTask);
  setTasks(tasks);
  try { renderBucketPage('home'); } catch(e) {}
  showUndoToast(tpl.emoji + ' ' + tpl.name + ' added!');
}

/* ── Sub-step helpers ────────────────────────────────────────── */
function saveTaskSteps(taskId, steps) {
  var tasks = getTasks();
  var t = tasks.find(function(x) { return x.id === taskId; });
  if (t) { t.steps = steps; setTasks(tasks); }
}

function toggleTaskStep(taskId, stepIdx, done) {
  var tasks = getTasks();
  var t = tasks.find(function(x) { return x.id === taskId; });
  if (t && t.steps && t.steps[stepIdx] !== undefined) {
    t.steps[stepIdx].done = done;
    setTasks(tasks);
  }
}

/* ── Wire Home Page ──────────────────────────────────────────── */
function wireHomePage() {
  // Chore template button
  var tplBtn = document.getElementById('choreTemplateBtn');
  if (tplBtn) tplBtn.addEventListener('click', openChoreTemplateModal);

  // Chore template modal close
  var closeBtn = document.getElementById('choreTemplateClose');
  if (closeBtn) closeBtn.addEventListener('click', function() {
    var modal = document.getElementById('choreTemplateModal');
    if (modal) modal.classList.add('hidden');
  });
  var modal = document.getElementById('choreTemplateModal');
  if (modal) modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

/* ============================================================
   PERSONAL PAGE FEATURES: Meal Tracker, Sleep Manager,
   Gym Planner, Daily Focus, Routines, Hydration, Mood
   ============================================================ */

/* ── Helper: build collapsible personal widget card ─────────── */
function buildPWCard(id, emoji, title, renderBody, storageKey) {
  var card = document.createElement('div');
  card.className = 'pw-card';
  card.id = id;

  var header = document.createElement('div');
  header.className = 'pw-header';
  var headerTitle = document.createElement('div');
  headerTitle.className = 'pw-header-title';
  headerTitle.textContent = emoji + ' ' + title;
  var chevron = document.createElement('span');
  chevron.className = 'pw-chevron';
  var isCollapsed = safeParseStorage(storageKey + '_collapsed', false);
  chevron.textContent = isCollapsed ? '▸' : '▾';
  header.appendChild(headerTitle);
  header.appendChild(chevron);

  var body = document.createElement('div');
  body.className = 'pw-body';
  body.style.display = isCollapsed ? 'none' : '';

  renderBody(body);

  card.appendChild(header);
  card.appendChild(body);

  header.addEventListener('click', function() {
    var nowCollapsed = body.style.display === 'none';
    body.style.display = nowCollapsed ? '' : 'none';
    chevron.textContent = nowCollapsed ? '▾' : '▸';
    localStorage.setItem(storageKey + '_collapsed', JSON.stringify(!nowCollapsed));
  });

  return card;
}

/* ══════════════════════════════════════════════════════════════
   1. MEAL TRACKER
   ══════════════════════════════════════════════════════════════ */

function getPersonalMeals() {
  var data = safeParseStorage('personalMeals', {});
  var today = getTodayISO();
  if (!data[today]) data[today] = { breakfast: { name: '', calories: 0 }, lunch: { name: '', calories: 0 }, dinner: { name: '', calories: 0 }, snacks: { name: '', calories: 0 } };
  return data;
}
function setPersonalMeals(data) { localStorage.setItem('personalMeals', JSON.stringify(data)); }
function getCalorieGoal() { return parseInt(localStorage.getItem('personalCalorieGoal') || '2000', 10); }
function setCalorieGoal(v) { localStorage.setItem('personalCalorieGoal', String(v)); }

function renderMealTracker() {
  var section = document.getElementById('personalMealSection');
  if (!section) return;
  section.innerHTML = '';

  var today = getTodayISO();
  var allMeals = getPersonalMeals();
  var meals = allMeals[today];
  var goal = getCalorieGoal();
  var mealTypes = [
    { key: 'breakfast', icon: '🌅', label: 'Breakfast' },
    { key: 'lunch', icon: '☀️', label: 'Lunch' },
    { key: 'dinner', icon: '🌙', label: 'Dinner' },
    { key: 'snacks', icon: '🍎', label: 'Snacks' }
  ];

  var card = buildPWCard('mealCard', '🍽️', 'Meal Tracker', function(body) {
    var totalCal = 0;
    mealTypes.forEach(function(mt) {
      var m = meals[mt.key] || { name: '', calories: 0 };
      totalCal += (parseInt(m.calories, 10) || 0);

      var row = document.createElement('div');
      row.className = 'meal-row';
      row.innerHTML =
        '<div class="meal-icon">' + mt.icon + '</div>' +
        '<div class="meal-info">' +
          '<div class="meal-label">' + mt.label + '</div>' +
          '<div class="meal-name">' + escapeHTML(m.name || 'Not planned') + '</div>' +
        '</div>' +
        '<div class="meal-cal">' + (m.calories ? m.calories + ' cal' : '—') + '</div>' +
        '<button class="meal-edit-btn" data-meal="' + mt.key + '">✏️</button>';
      body.appendChild(row);

      // Edit panel (hidden by default)
      var panel = document.createElement('div');
      panel.className = 'meal-edit-panel';
      panel.id = 'mealEdit_' + mt.key;
      panel.style.display = 'none';
      panel.innerHTML =
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
          '<input type="text" class="meal-name-input" placeholder="What are you eating?" value="' + escapeHTML(m.name || '') + '" />' +
          '<input type="number" class="meal-cal-input" placeholder="Cal" min="0" value="' + (m.calories || '') + '" />' +
          '<button class="meal-save-btn" data-meal="' + mt.key + '">Save</button>' +
          '<button class="meal-cancel-btn" data-meal="' + mt.key + '">Cancel</button>' +
        '</div>';
      body.appendChild(panel);
    });

    // Progress bar
    var pct = goal > 0 ? Math.min(100, Math.round((totalCal / goal) * 100)) : 0;
    var barColor = pct > 100 ? '#e74c3c' : pct >= 80 ? '#27ae60' : '#4a90e2';
    var progress = document.createElement('div');
    progress.className = 'meal-progress';
    progress.innerHTML =
      '<div class="meal-progress-bar"><div class="meal-progress-fill" style="width:' + pct + '%;background:' + barColor + '"></div></div>' +
      '<div class="meal-progress-text">' + totalCal + ' / ' + goal + ' cal</div>';
    body.appendChild(progress);

    // Goal setting
    var goalRow = document.createElement('div');
    goalRow.className = 'meal-goal-row';
    goalRow.innerHTML =
      '<span>🎯 Daily goal:</span>' +
      '<input type="number" class="meal-goal-input" id="mealGoalInput" value="' + goal + '" min="0" step="50" />' +
      '<span>cal</span>';
    body.appendChild(goalRow);

    // Wire events
    body.querySelectorAll('.meal-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key = btn.dataset.meal;
        var p = document.getElementById('mealEdit_' + key);
        if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
      });
    });
    body.querySelectorAll('.meal-save-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key = btn.dataset.meal;
        var panel = document.getElementById('mealEdit_' + key);
        if (!panel) return;
        var nameInput = panel.querySelector('.meal-name-input');
        var calInput = panel.querySelector('.meal-cal-input');
        var data = getPersonalMeals();
        if (!data[today]) data[today] = {};
        data[today][key] = { name: nameInput.value.trim(), calories: parseInt(calInput.value, 10) || 0 };
        setPersonalMeals(data);
        renderMealTracker();
      });
    });
    body.querySelectorAll('.meal-cancel-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key = btn.dataset.meal;
        var p = document.getElementById('mealEdit_' + key);
        if (p) p.style.display = 'none';
      });
    });
    var goalInput = body.querySelector('#mealGoalInput');
    if (goalInput) goalInput.addEventListener('change', function() {
      setCalorieGoal(parseInt(goalInput.value, 10) || 2000);
      renderMealTracker();
    });
  }, 'pw_meal');

  section.appendChild(card);
}

/* ══════════════════════════════════════════════════════════════
   2. SLEEP / BEDTIME MANAGER
   ══════════════════════════════════════════════════════════════ */

function getPersonalSleep() { return safeParseStorage('personalSleep', { targetBedtime: '22:30', targetWake: '07:00', log: {} }); }
function setPersonalSleep(data) { localStorage.setItem('personalSleep', JSON.stringify(data)); }

function renderSleepTracker() {
  var section = document.getElementById('personalSleepSection');
  if (!section) return;
  section.innerHTML = '';

  var sleep = getPersonalSleep();
  var today = getTodayISO();
  var todayLog = sleep.log[today];

  var card = buildPWCard('sleepCard', '😴', 'Bedtime Manager', function(body) {
    // Target times
    var targetRow = document.createElement('div');
    targetRow.innerHTML =
      '<div class="sleep-row">' +
        '<label>🌙 Bedtime:</label>' +
        '<input type="time" id="sleepTargetBed" value="' + (sleep.targetBedtime || '22:30') + '" />' +
      '</div>' +
      '<div class="sleep-row">' +
        '<label>☀️ Wake up:</label>' +
        '<input type="time" id="sleepTargetWake" value="' + (sleep.targetWake || '07:00') + '" />' +
      '</div>';
    body.appendChild(targetRow);

    // Status
    var status = document.createElement('div');
    status.className = 'sleep-status';
    if (todayLog) {
      var actualBed = todayLog.bedtime || '';
      var actualWake = todayLog.wakeTime || '';
      var duration = '';
      if (actualBed && actualWake) {
        var bedM = timeToMinutes(actualBed);
        var wakeM = timeToMinutes(actualWake);
        var diff = wakeM > bedM ? wakeM - bedM : (1440 - bedM) + wakeM;
        var hrs = Math.floor(diff / 60);
        var mins = diff % 60;
        duration = hrs + 'h ' + mins + 'm';
      }
      status.innerHTML =
        '<div class="sleep-status-icon">✅</div>' +
        '<div class="sleep-status-text">' +
          '<div class="sleep-status-label">Logged today</div>' +
          '<div class="sleep-status-detail">Bed: ' + (actualBed || '—') + ' → Wake: ' + (actualWake || '—') + (duration ? ' (' + duration + ')' : '') + '</div>' +
        '</div>';
    } else {
      status.innerHTML =
        '<div class="sleep-status-icon">🔲</div>' +
        '<div class="sleep-status-text">' +
          '<div class="sleep-status-label">Not logged yet</div>' +
          '<div class="sleep-status-detail">Log your sleep for today</div>' +
        '</div>' +
        '<button class="sleep-log-btn" id="sleepLogBtn">Log Sleep</button>';
    }
    body.appendChild(status);

    // Log panel (hidden)
    var logPanel = document.createElement('div');
    logPanel.className = 'meal-edit-panel';
    logPanel.id = 'sleepLogPanel';
    logPanel.style.display = todayLog ? 'none' : 'none';
    logPanel.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<label style="font-size:0.85rem">Bed:</label>' +
        '<input type="time" id="sleepActualBed" value="' + (sleep.targetBedtime || '22:30') + '" />' +
        '<label style="font-size:0.85rem">Wake:</label>' +
        '<input type="time" id="sleepActualWake" value="' + (sleep.targetWake || '07:00') + '" />' +
        '<button class="meal-save-btn" id="sleepSaveBtn">Save</button>' +
        '<button class="meal-cancel-btn" id="sleepCancelBtn">Cancel</button>' +
      '</div>';
    body.appendChild(logPanel);

    // Sleep consistency streak
    var streak = calcSleepStreak(sleep);
    if (streak > 0) {
      var streakEl = document.createElement('div');
      streakEl.className = 'sleep-streak';
      streakEl.textContent = '🔥 ' + streak + '-day sleep logging streak!';
      body.appendChild(streakEl);
    }

    // Wire events
    var bedInput = body.querySelector('#sleepTargetBed');
    var wakeInput = body.querySelector('#sleepTargetWake');
    if (bedInput) bedInput.addEventListener('change', function() {
      var s = getPersonalSleep(); s.targetBedtime = bedInput.value; setPersonalSleep(s);
    });
    if (wakeInput) wakeInput.addEventListener('change', function() {
      var s = getPersonalSleep(); s.targetWake = wakeInput.value; setPersonalSleep(s);
    });
    var logBtn = body.querySelector('#sleepLogBtn');
    if (logBtn) logBtn.addEventListener('click', function() {
      var p = document.getElementById('sleepLogPanel');
      if (p) p.style.display = 'block';
    });
    var saveBtn = body.querySelector('#sleepSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', function() {
      var s = getPersonalSleep();
      var actualBed = document.getElementById('sleepActualBed');
      var actualWake = document.getElementById('sleepActualWake');
      s.log[today] = { bedtime: actualBed ? actualBed.value : '', wakeTime: actualWake ? actualWake.value : '' };
      setPersonalSleep(s);
      renderSleepTracker();
    });
    var cancelBtn = body.querySelector('#sleepCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', function() {
      var p = document.getElementById('sleepLogPanel');
      if (p) p.style.display = 'none';
    });
  }, 'pw_sleep');

  section.appendChild(card);
}

function timeToMinutes(t) {
  if (!t) return 0;
  var parts = t.split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

function calcSleepStreak(sleep) {
  var streak = 0;
  var d = new Date();
  for (var i = 0; i < 365; i++) {
    var ds = d.toISOString().slice(0, 10);
    if (sleep.log[ds]) streak++;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/* ══════════════════════════════════════════════════════════════
   3. GYM / EXERCISE PLANNER
   ══════════════════════════════════════════════════════════════ */

function getPersonalGym() { return safeParseStorage('personalGym', { routines: [], log: {} }); }
function setPersonalGym(data) { localStorage.setItem('personalGym', JSON.stringify(data)); }

function renderGymPlanner() {
  var section = document.getElementById('personalGymSection');
  if (!section) return;
  section.innerHTML = '';

  var gym = getPersonalGym();
  var today = getTodayISO();

  var card = buildPWCard('gymCard', '💪', 'Gym / Exercise', function(body) {
    // Add routine
    var addRow = document.createElement('div');
    addRow.className = 'gym-routine-add';
    addRow.innerHTML =
      '<input type="text" id="gymRoutineNameInput" placeholder="New routine name (e.g. Upper Body, Leg Day)" />' +
      '<button id="gymAddRoutineBtn">＋ Add</button>';
    body.appendChild(addRow);

    // Routines
    if (!gym.routines.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'color:#aaa;text-align:center;padding:12px 0;font-size:0.88rem';
      empty.textContent = 'No routines yet. Create one above!';
      body.appendChild(empty);
    }

    gym.routines.forEach(function(routine, ri) {
      var rDiv = document.createElement('div');
      rDiv.className = 'gym-routine';

      var rHeader = document.createElement('div');
      rHeader.className = 'gym-routine-header';
      rHeader.innerHTML =
        '<span class="gym-routine-name">🏋️ ' + escapeHTML(routine.name) + '</span>' +
        '<button class="gym-del-btn" data-ri="' + ri + '" title="Delete routine">🗑️</button>';
      rDiv.appendChild(rHeader);

      // Exercises
      (routine.exercises || []).forEach(function(ex, ei) {
        var exRow = document.createElement('div');
        exRow.className = 'gym-exercise';
        exRow.innerHTML =
          '<span class="gym-exercise-name">' + escapeHTML(ex.name) + '</span>' +
          '<span class="gym-exercise-detail">' + (ex.sets || '—') + ' × ' + (ex.reps || '—') + (ex.weight ? ' @ ' + ex.weight : '') + '</span>' +
          '<button class="gym-del-btn" data-ri="' + ri + '" data-ei="' + ei + '" title="Remove">✕</button>';
        rDiv.appendChild(exRow);
      });

      // Add exercise form
      var exAdd = document.createElement('div');
      exAdd.className = 'gym-add-row';
      exAdd.innerHTML =
        '<input type="text" class="gym-name-input" placeholder="Exercise name" data-ri="' + ri + '" />' +
        '<input type="number" class="gym-small-input" placeholder="Sets" min="1" data-ri="' + ri + '" />' +
        '<input type="text" class="gym-small-input" placeholder="Reps" data-ri="' + ri + '" />' +
        '<input type="text" class="gym-small-input" placeholder="Weight" data-ri="' + ri + '" style="width:60px" />' +
        '<button class="gym-add-btn" data-ri="' + ri + '">＋</button>';
      rDiv.appendChild(exAdd);

      // Log workout button
      var todayLogged = gym.log[today] && gym.log[today].indexOf(routine.name) >= 0;
      var logBtn = document.createElement('button');
      logBtn.className = 'gym-log-btn';
      logBtn.textContent = todayLogged ? '✅ Logged today' : '📝 Log workout';
      logBtn.disabled = todayLogged;
      logBtn.style.opacity = todayLogged ? '0.6' : '1';
      logBtn.dataset.ri = ri;
      logBtn.dataset.rname = routine.name;
      rDiv.appendChild(logBtn);

      body.appendChild(rDiv);
    });

    // Gym streak
    var streak = calcGymStreak(gym);
    if (streak > 0) {
      var streakEl = document.createElement('div');
      streakEl.className = 'gym-streak';
      streakEl.textContent = '🔥 ' + streak + '-day workout streak!';
      body.appendChild(streakEl);
    }

    // Wire events
    var addRoutineBtn = body.querySelector('#gymAddRoutineBtn');
    if (addRoutineBtn) addRoutineBtn.addEventListener('click', function() {
      var input = document.getElementById('gymRoutineNameInput');
      var name = input ? input.value.trim() : '';
      if (!name) { alert('Enter a routine name'); return; }
      var g = getPersonalGym();
      g.routines.push({ name: name, exercises: [] });
      setPersonalGym(g);
      renderGymPlanner();
    });

    body.querySelectorAll('.gym-routine-header .gym-del-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!confirm('Delete this routine?')) return;
        var g = getPersonalGym();
        g.routines.splice(parseInt(btn.dataset.ri, 10), 1);
        setPersonalGym(g);
        renderGymPlanner();
      });
    });

    body.querySelectorAll('.gym-exercise .gym-del-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var g = getPersonalGym();
        var ri = parseInt(btn.dataset.ri, 10);
        var ei = parseInt(btn.dataset.ei, 10);
        g.routines[ri].exercises.splice(ei, 1);
        setPersonalGym(g);
        renderGymPlanner();
      });
    });

    body.querySelectorAll('.gym-add-row .gym-add-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ri = parseInt(btn.dataset.ri, 10);
        var row = btn.parentElement;
        var inputs = row.querySelectorAll('input');
        var name = inputs[0].value.trim();
        if (!name) { alert('Enter exercise name'); return; }
        var g = getPersonalGym();
        g.routines[ri].exercises.push({
          name: name,
          sets: inputs[1].value || '',
          reps: inputs[2].value || '',
          weight: inputs[3].value || ''
        });
        setPersonalGym(g);
        renderGymPlanner();
      });
    });

    body.querySelectorAll('.gym-log-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var g = getPersonalGym();
        if (!g.log[today]) g.log[today] = [];
        var rname = btn.dataset.rname;
        if (g.log[today].indexOf(rname) < 0) g.log[today].push(rname);
        setPersonalGym(g);
        renderGymPlanner();
      });
    });
  }, 'pw_gym');

  section.appendChild(card);
}

function calcGymStreak(gym) {
  var streak = 0;
  var d = new Date();
  for (var i = 0; i < 365; i++) {
    var ds = d.toISOString().slice(0, 10);
    if (gym.log[ds] && gym.log[ds].length > 0) streak++;
    else if (i > 0) break; // allow today to not be logged yet
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/* ══════════════════════════════════════════════════════════════
   4a. DAILY FOCUS / TOP 3 PRIORITIES
   ══════════════════════════════════════════════════════════════ */

function getPersonalFocus() { return safeParseStorage('personalFocus', {}); }
function setPersonalFocus(data) { localStorage.setItem('personalFocus', JSON.stringify(data)); }

function renderDailyFocus() {
  var section = document.getElementById('personalFocusSection');
  if (!section) return;
  section.innerHTML = '';

  var today = getTodayISO();
  var allFocus = getPersonalFocus();
  var items = allFocus[today] || [];

  var card = buildPWCard('focusCard', '🎯', 'Today\'s Top Priorities', function(body) {
    // Info text
    var info = document.createElement('div');
    info.style.cssText = 'font-size:0.82rem;color:#888;margin-bottom:8px';
    info.textContent = 'Pick up to 3 must-do items to reduce overwhelm. Resets daily.';
    body.appendChild(info);

    // Items
    items.forEach(function(item, idx) {
      var row = document.createElement('div');
      row.className = 'focus-item' + (item.done ? ' done' : '');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = item.done;
      cb.addEventListener('change', function() {
        var f = getPersonalFocus();
        if (f[today] && f[today][idx]) f[today][idx].done = cb.checked;
        setPersonalFocus(f);
        renderDailyFocus();
      });
      var text = document.createElement('span');
      text.className = 'focus-item-text';
      text.textContent = item.text;
      var del = document.createElement('button');
      del.className = 'focus-del-btn';
      del.textContent = '✕';
      del.addEventListener('click', function() {
        var f = getPersonalFocus();
        if (f[today]) f[today].splice(idx, 1);
        setPersonalFocus(f);
        renderDailyFocus();
      });
      row.appendChild(cb);
      row.appendChild(text);
      row.appendChild(del);
      body.appendChild(row);
    });

    // Add row (max 3)
    if (items.length < 3) {
      var addRow = document.createElement('div');
      addRow.className = 'focus-add-row';
      addRow.innerHTML =
        '<input type="text" id="focusAddInput" placeholder="What\'s your #' + (items.length + 1) + ' priority?" />' +
        '<button class="focus-add-btn" id="focusAddBtn">Add</button>';
      body.appendChild(addRow);
    }

    // Completion message
    if (items.length > 0 && items.every(function(i) { return i.done; })) {
      var msg = document.createElement('div');
      msg.style.cssText = 'text-align:center;padding:8px;font-size:0.9rem;color:#27ae60;font-weight:600;margin-top:6px';
      msg.textContent = '🎉 All priorities completed! Great job!';
      body.appendChild(msg);
    }

    // Wire
    var addBtn = body.querySelector('#focusAddBtn');
    if (addBtn) addBtn.addEventListener('click', function() {
      var input = document.getElementById('focusAddInput');
      var text = input ? input.value.trim() : '';
      if (!text) return;
      var f = getPersonalFocus();
      if (!f[today]) f[today] = [];
      if (f[today].length >= 3) { alert('Maximum 3 priorities per day'); return; }
      f[today].push({ text: text, done: false });
      setPersonalFocus(f);
      renderDailyFocus();
    });
    var addInput = body.querySelector('#focusAddInput');
    if (addInput) addInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); if (addBtn) addBtn.click(); }
    });
  }, 'pw_focus');

  section.appendChild(card);
}

/* ══════════════════════════════════════════════════════════════
   4b. ROUTINE CHECKLISTS (Morning & Evening)
   ══════════════════════════════════════════════════════════════ */

function getPersonalRoutines() { return safeParseStorage('personalRoutines', { morning: [], evening: [] }); }
function setPersonalRoutines(data) { localStorage.setItem('personalRoutines', JSON.stringify(data)); }
function getPersonalRoutineLog() { return safeParseStorage('personalRoutineLog', {}); }
function setPersonalRoutineLog(data) { localStorage.setItem('personalRoutineLog', JSON.stringify(data)); }

function renderRoutineChecklist() {
  var section = document.getElementById('personalRoutineSection');
  if (!section) return;
  section.innerHTML = '';

  var routines = getPersonalRoutines();
  var today = getTodayISO();
  var log = getPersonalRoutineLog();
  if (!log[today]) log[today] = { morning: [], evening: [] };
  var todayLog = log[today];

  var card = buildPWCard('routineCard', '📋', 'Daily Routines', function(body) {
    var info = document.createElement('div');
    info.style.cssText = 'font-size:0.82rem;color:#888;margin-bottom:8px';
    info.textContent = 'Build consistent morning & evening routines. Checked items reset each day.';
    body.appendChild(info);

    ['morning', 'evening'].forEach(function(period) {
      var emoji = period === 'morning' ? '🌅' : '🌙';
      var label = document.createElement('div');
      label.className = 'routine-section-label';
      label.textContent = emoji + ' ' + period.charAt(0).toUpperCase() + period.slice(1) + ' Routine';
      body.appendChild(label);

      var items = routines[period] || [];
      var checked = todayLog[period] || [];

      items.forEach(function(item, idx) {
        var isDone = checked.indexOf(idx) >= 0;
        var row = document.createElement('div');
        row.className = 'routine-item' + (isDone ? ' done' : '');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = isDone;
        cb.addEventListener('change', function() {
          var l = getPersonalRoutineLog();
          if (!l[today]) l[today] = { morning: [], evening: [] };
          if (!l[today][period]) l[today][period] = [];
          if (cb.checked) {
            if (l[today][period].indexOf(idx) < 0) l[today][period].push(idx);
          } else {
            l[today][period] = l[today][period].filter(function(i) { return i !== idx; });
          }
          setPersonalRoutineLog(l);
          renderRoutineChecklist();
        });
        var sp = document.createElement('span');
        sp.textContent = item;
        var del = document.createElement('button');
        del.className = 'routine-del-btn';
        del.textContent = '✕';
        del.addEventListener('click', function() {
          var r = getPersonalRoutines();
          r[period].splice(idx, 1);
          setPersonalRoutines(r);
          // Also clean up log indices
          var l = getPersonalRoutineLog();
          if (l[today] && l[today][period]) {
            l[today][period] = l[today][period].filter(function(i) { return i < r[period].length; });
            setPersonalRoutineLog(l);
          }
          renderRoutineChecklist();
        });
        row.appendChild(cb);
        row.appendChild(sp);
        row.appendChild(del);
        body.appendChild(row);
      });

      // Progress
      if (items.length > 0) {
        var doneCount = checked.filter(function(i) { return i < items.length; }).length;
        var pct = Math.round((doneCount / items.length) * 100);
        var prog = document.createElement('div');
        prog.style.cssText = 'font-size:0.78rem;color:' + (pct === 100 ? '#27ae60' : '#888') + ';margin:2px 0 6px;font-weight:600';
        prog.textContent = pct === 100 ? '✅ Complete!' : doneCount + '/' + items.length + ' done';
        body.appendChild(prog);
      }
    });

    // Add item form
    var addRow = document.createElement('div');
    addRow.className = 'routine-add-row';
    addRow.innerHTML =
      '<input type="text" id="routineAddInput" placeholder="Add routine step…" />' +
      '<select id="routineAddPeriod">' +
        '<option value="morning">🌅 Morning</option>' +
        '<option value="evening">🌙 Evening</option>' +
      '</select>' +
      '<button class="routine-add-btn" id="routineAddBtn">＋</button>';
    body.appendChild(addRow);

    var addBtn = body.querySelector('#routineAddBtn');
    if (addBtn) addBtn.addEventListener('click', function() {
      var input = document.getElementById('routineAddInput');
      var periodSel = document.getElementById('routineAddPeriod');
      var text = input ? input.value.trim() : '';
      var period = periodSel ? periodSel.value : 'morning';
      if (!text) return;
      var r = getPersonalRoutines();
      if (!r[period]) r[period] = [];
      r[period].push(text);
      setPersonalRoutines(r);
      renderRoutineChecklist();
    });
    var addInput = body.querySelector('#routineAddInput');
    if (addInput) addInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); if (addBtn) addBtn.click(); }
    });
  }, 'pw_routine');

  section.appendChild(card);
}

/* ══════════════════════════════════════════════════════════════
   4c. HYDRATION TRACKER
   ══════════════════════════════════════════════════════════════ */

function getPersonalHydration() { return safeParseStorage('personalHydration', { goal: 8, log: {} }); }
function setPersonalHydration(data) { localStorage.setItem('personalHydration', JSON.stringify(data)); }

function renderHydrationTracker() {
  var section = document.getElementById('personalHydrationSection');
  if (!section) return;
  section.innerHTML = '';

  var hydration = getPersonalHydration();
  var today = getTodayISO();
  var count = hydration.log[today] || 0;
  var goal = hydration.goal || 8;

  var card = buildPWCard('hydrationCard', '💧', 'Hydration', function(body) {
    // Glass display
    var display = document.createElement('div');
    display.className = 'hydration-display';

    var glasses = document.createElement('div');
    glasses.className = 'hydration-glasses';
    for (var i = 0; i < goal; i++) {
      var glass = document.createElement('div');
      glass.className = 'hydration-glass' + (i < count ? ' filled' : '');
      glass.dataset.idx = i;
      glass.innerHTML = '<div class="hydration-water"></div>';
      glass.addEventListener('click', (function(idx) {
        return function() {
          var h = getPersonalHydration();
          h.log[today] = idx + 1;
          setPersonalHydration(h);
          renderHydrationTracker();
        };
      })(i));
      glasses.appendChild(glass);
    }
    display.appendChild(glasses);

    var countEl = document.createElement('div');
    countEl.className = 'hydration-count';
    countEl.textContent = count + '/' + goal;
    display.appendChild(countEl);
    body.appendChild(display);

    // Completed message
    if (count >= goal) {
      var msg = document.createElement('div');
      msg.style.cssText = 'text-align:center;font-size:0.85rem;color:#27ae60;font-weight:600;margin-top:6px';
      msg.textContent = '🎉 Hydration goal reached!';
      body.appendChild(msg);
    }

    // Controls
    var controls = document.createElement('div');
    controls.className = 'hydration-goal-row';
    controls.innerHTML =
      '<span>🎯 Goal:</span>' +
      '<input type="number" class="hydration-goal-input" id="hydrationGoalInput" value="' + goal + '" min="1" max="20" />' +
      '<span>glasses</span>' +
      '<button class="hydration-reset" id="hydrationResetBtn">Reset today</button>';
    body.appendChild(controls);

    // Wire
    var goalInput = body.querySelector('#hydrationGoalInput');
    if (goalInput) goalInput.addEventListener('change', function() {
      var h = getPersonalHydration();
      h.goal = parseInt(goalInput.value, 10) || 8;
      setPersonalHydration(h);
      renderHydrationTracker();
    });
    var resetBtn = body.querySelector('#hydrationResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', function() {
      var h = getPersonalHydration();
      h.log[today] = 0;
      setPersonalHydration(h);
      renderHydrationTracker();
    });
  }, 'pw_hydration');

  section.appendChild(card);
}

/* ══════════════════════════════════════════════════════════════
   4d. MOOD / ENERGY CHECK-IN
   ══════════════════════════════════════════════════════════════ */

function getPersonalMood() { return safeParseStorage('personalMood', []); }
function setPersonalMood(data) { localStorage.setItem('personalMood', JSON.stringify(data)); }

function renderMoodCheckin() {
  var section = document.getElementById('personalMoodSection');
  if (!section) return;
  section.innerHTML = '';

  var moods = getPersonalMood();
  var today = getTodayISO();
  var todayEntry = moods.find(function(m) { return m.date === today; });

  var moodOptions = [
    { emoji: '😊', label: 'Great' },
    { emoji: '🙂', label: 'Good' },
    { emoji: '😐', label: 'Okay' },
    { emoji: '😟', label: 'Low' },
    { emoji: '😢', label: 'Rough' }
  ];
  var energyOptions = ['🟢 High', '🟡 Medium', '🔴 Low'];

  var card = buildPWCard('moodCard', '🧠', 'Mood & Energy Check-in', function(body) {
    if (todayEntry) {
      var checked = document.createElement('div');
      checked.style.cssText = 'text-align:center;padding:8px';
      checked.innerHTML =
        '<div style="font-size:2rem">' + todayEntry.mood + '</div>' +
        '<div style="font-size:0.88rem;font-weight:600;margin:4px 0">Feeling: ' + todayEntry.moodLabel + '</div>' +
        '<div style="font-size:0.82rem;color:#888">Energy: ' + todayEntry.energy + '</div>' +
        (todayEntry.note ? '<div style="font-size:0.82rem;color:#666;margin-top:4px;font-style:italic">"' + escapeHTML(todayEntry.note) + '"</div>' : '');
      body.appendChild(checked);
    } else {
      // Mood selection
      var moodLabel = document.createElement('div');
      moodLabel.style.cssText = 'font-size:0.85rem;font-weight:600;text-align:center;margin-bottom:6px';
      moodLabel.textContent = 'How are you feeling today?';
      body.appendChild(moodLabel);

      var moodRow = document.createElement('div');
      moodRow.className = 'mood-row';
      moodOptions.forEach(function(opt) {
        var btn = document.createElement('button');
        btn.className = 'mood-btn';
        btn.textContent = opt.emoji;
        btn.title = opt.label;
        btn.dataset.mood = opt.emoji;
        btn.dataset.label = opt.label;
        btn.addEventListener('click', function() {
          moodRow.querySelectorAll('.mood-btn').forEach(function(b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
        });
        moodRow.appendChild(btn);
      });
      body.appendChild(moodRow);

      // Energy level
      var energyLabel = document.createElement('div');
      energyLabel.style.cssText = 'font-size:0.85rem;font-weight:600;text-align:center;margin-bottom:6px';
      energyLabel.textContent = 'Energy level:';
      body.appendChild(energyLabel);

      var energyRow = document.createElement('div');
      energyRow.className = 'mood-energy-row';
      energyOptions.forEach(function(opt) {
        var btn = document.createElement('button');
        btn.className = 'mood-energy-btn';
        btn.textContent = opt;
        btn.dataset.energy = opt;
        btn.addEventListener('click', function() {
          energyRow.querySelectorAll('.mood-energy-btn').forEach(function(b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
        });
        energyRow.appendChild(btn);
      });
      body.appendChild(energyRow);

      // Note
      var noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.className = 'mood-note-input';
      noteInput.placeholder = 'Optional: quick note about your day…';
      noteInput.id = 'moodNoteInput';
      body.appendChild(noteInput);

      // Save
      var saveBtn = document.createElement('button');
      saveBtn.className = 'mood-save-btn';
      saveBtn.textContent = '💾 Save Check-in';
      saveBtn.addEventListener('click', function() {
        var selectedMood = moodRow.querySelector('.mood-btn.selected');
        var selectedEnergy = energyRow.querySelector('.mood-energy-btn.selected');
        if (!selectedMood) { alert('Please select a mood'); return; }
        if (!selectedEnergy) { alert('Please select an energy level'); return; }
        var data = getPersonalMood();
        data.unshift({
          date: today,
          mood: selectedMood.dataset.mood,
          moodLabel: selectedMood.dataset.label,
          energy: selectedEnergy.dataset.energy,
          note: noteInput.value.trim()
        });
        // Keep only last 30 days
        if (data.length > 30) data = data.slice(0, 30);
        setPersonalMood(data);
        renderMoodCheckin();
      });
      body.appendChild(saveBtn);
    }

    // History (last 7 entries)
    var recent = moods.filter(function(m) { return m.date !== today || todayEntry; }).slice(0, 7);
    if (recent.length > 0) {
      var histLabel = document.createElement('div');
      histLabel.style.cssText = 'font-size:0.85rem;font-weight:600;margin-top:12px;margin-bottom:4px';
      histLabel.textContent = '📊 Recent History';
      body.appendChild(histLabel);

      var hist = document.createElement('div');
      hist.className = 'mood-history';
      recent.forEach(function(m) {
        var row = document.createElement('div');
        row.className = 'mood-history-item';
        row.innerHTML =
          '<span class="mood-history-date">' + formatShortDate(m.date) + '</span>' +
          '<span class="mood-history-mood">' + m.mood + '</span>' +
          '<span class="mood-history-energy">' + m.energy + '</span>' +
          '<span class="mood-history-note">' + escapeHTML(m.note || '') + '</span>';
        hist.appendChild(row);
      });
      body.appendChild(hist);
    }
  }, 'pw_mood');

  section.appendChild(card);
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T00:00:00');
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + d.getDate();
}

/* ══════════════════════════════════════════════════════════════
   PERSONAL PAGE RENDER ORCHESTRATOR
   ══════════════════════════════════════════════════════════════ */

function renderPersonalWidgets() {
  try { renderDailyFocus(); } catch(e) { console.warn('renderDailyFocus failed', e); }
  try { renderRoutineChecklist(); } catch(e) { console.warn('renderRoutineChecklist failed', e); }
  try { renderMealTracker(); } catch(e) { console.warn('renderMealTracker failed', e); }
  try { renderHydrationTracker(); } catch(e) { console.warn('renderHydrationTracker failed', e); }
  try { renderSleepTracker(); } catch(e) { console.warn('renderSleepTracker failed', e); }
  try { renderGymPlanner(); } catch(e) { console.warn('renderGymPlanner failed', e); }
  try { renderMoodCheckin(); } catch(e) { console.warn('renderMoodCheckin failed', e); }
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

/* ═══════════════════════════════════════════════════════════════
   Header "Add Item" popup — lets users add Event / Task / Reminder
   with domain + bucket selection (or Unassigned → Inbox)
   ═══════════════════════════════════════════════════════════════ */
function initCalendarAddItemPopup() {
  var headerBtn = document.getElementById('headerAddItemBtn');
  if (!headerBtn || document.getElementById('calAddItemOverlay')) return;

  /* --- Overlay backdrop --- */
  var overlay = document.createElement('div');
  overlay.id = 'calAddItemOverlay';
  document.body.appendChild(overlay);

  /* --- Modal panel --- */
  var modal = document.createElement('div');
  modal.id = 'calAddItemModal';

  /* Step 1 — choose type */
  var step1 = document.createElement('div');
  step1.id = 'calAddStep1';
  step1.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:8px;align-items:stretch">' +
      '<button type="button" class="cal-add-type-btn" data-item-type="event">📅 Add Event</button>' +
      '<button type="button" class="cal-add-type-btn" data-item-type="task">✅ Add Task</button>' +
      '<button type="button" class="cal-add-type-btn" data-item-type="reminder">🔔 Add Reminder</button>' +
    '</div>';

  /* Step 2 — form */
  var step2 = document.createElement('div');
  step2.id = 'calAddStep2';
  step2.style.display = 'none';

  modal.appendChild(step1);
  modal.appendChild(step2);
  document.body.appendChild(modal);

  /* State */
  var chosenType = '';

  /* Open / close */
  function openModal() {
    overlay.classList.add('open');
    modal.classList.add('open');
    step1.style.display = '';
    step2.style.display = 'none';
    chosenType = '';
  }
  function closeModal() {
    overlay.classList.remove('open');
    modal.classList.remove('open');
  }

  headerBtn.addEventListener('click', openModal);
  overlay.addEventListener('click', closeModal);

  /* Show the header button on all main views */
  headerBtn.style.display = '';
  window.addEventListener('view:show', function(e) {
    var view = e.detail && e.detail.view;
    headerBtn.style.display = (view === 'settings' || view === 'inbox') ? 'none' : '';
  });
  var initHash = (location.hash && location.hash.length > 1) ? location.hash.slice(1) : 'today';
  headerBtn.style.display = (initHash === 'settings' || initHash === 'inbox') ? 'none' : '';

  /* Step 1 → Step 2 */
  step1.querySelectorAll('.cal-add-type-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      chosenType = btn.dataset.itemType;
      step1.style.display = 'none';
      step2.style.display = '';
      buildStep2(chosenType);
    });
  });

  function buildStep2(type) {
    var typeLabel = { event: '📅 Event', task: '✅ Task', reminder: '🔔 Reminder' }[type] || type;
    var domains = ['personal', 'home', 'work'];

    /* Build domain + bucket options */
    var domainOptions = '';
    domainOptions += '<option value="inbox">📥 Unassigned (Inbox)</option>';
    domains.forEach(function(d) {
      var meta = DOMAIN_META[d];
      if (!meta) return;
      domainOptions += '<option value="' + d + '">' + meta.emoji + ' ' + meta.label + '</option>';
    });

    var html = '<h3 style="margin:0 0 10px;font-size:1rem;text-align:center">' + typeLabel + '</h3>';

    /* Domain selector */
    html += '<div style="margin-bottom:8px"><label style="font-size:0.82rem;font-weight:600">Domain</label>' +
      '<select id="calAddDomain" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px">' + domainOptions + '</select></div>';

    /* Bucket selector (populated dynamically) */
    html += '<div id="calAddBucketRow" style="margin-bottom:8px;display:none"><label style="font-size:0.82rem;font-weight:600">Bucket</label>' +
      '<select id="calAddBucket" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px"></select></div>';

    /* Title */
    html += '<div style="margin-bottom:8px"><label style="font-size:0.82rem;font-weight:600">Title</label>' +
      '<input id="calAddTitle" type="text" placeholder="Title" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px" /></div>';

    /* Emoji */
    html += '<div style="margin-bottom:8px"><label style="font-size:0.82rem;font-weight:600">Emoji</label>' +
      '<input id="calAddEmoji" type="text" placeholder="🎉" style="width:70px;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px" /></div>';

    /* Type-specific fields */
    if (type === 'event') {
      html += '<div style="display:flex;gap:6px;margin-bottom:8px">' +
        '<div style="flex:1"><label style="font-size:0.82rem;font-weight:600">Date</label><input id="calAddDate" type="date" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px" /></div>' +
        '<div style="flex:1"><label style="font-size:0.82rem;font-weight:600">Start</label><input id="calAddTime" type="time" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px" /></div>' +
        '<div style="flex:1"><label style="font-size:0.82rem;font-weight:600">End</label><input id="calAddEndTime" type="time" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px" /></div>' +
        '</div>';
      html += '<div style="margin-bottom:8px"><label style="font-size:0.82rem;font-weight:600">Location</label>' +
        '<input id="calAddLocation" type="text" placeholder="Location (optional)" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px" /></div>';
    } else if (type === 'task') {
      html += '<div style="display:flex;gap:6px;margin-bottom:8px">' +
        '<div style="flex:1"><label style="font-size:0.82rem;font-weight:600">Date</label><input id="calAddDate" type="date" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px" /></div>' +
        '<div style="width:130px"><label style="font-size:0.82rem;font-weight:600">Priority</label><select id="calAddPriority" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px"><option value="1">! Low</option><option value="2" selected>!! Med</option><option value="3">!!! High</option></select></div>' +
        '</div>';
    } else {
      html += '<div style="display:flex;gap:6px;margin-bottom:8px">' +
        '<div style="flex:1"><label style="font-size:0.82rem;font-weight:600">Date</label><input id="calAddDate" type="date" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px" /></div>' +
        '<div style="flex:1"><label style="font-size:0.82rem;font-weight:600">Time</label><input id="calAddTime" type="time" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px" /></div>' +
        '</div>';
    }

    /* Buttons */
    html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">' +
      '<button type="button" id="calAddBack" style="padding:7px 14px;border:1px solid #ddd;border-radius:8px;background:#f5f5f5;cursor:pointer;font-size:0.88rem">Back</button>' +
      '<button type="button" id="calAddSave" style="padding:7px 14px;border:none;border-radius:8px;background:#4a90e2;color:#fff;cursor:pointer;font-size:0.88rem;font-weight:600">Save</button>' +
      '</div>';

    step2.innerHTML = html;

    /* Pre-fill date with selected day if available */
    var dateInp = document.getElementById('calAddDate');
    if (dateInp && window.selectedYear != null && window.selectedMonth != null && window.selectedDay) {
      dateInp.value = window.selectedYear + '-' + pad2(window.selectedMonth + 1) + '-' + pad2(window.selectedDay);
    }

    /* Wire domain change to update buckets */
    var domSel = document.getElementById('calAddDomain');
    if (domSel) domSel.addEventListener('change', function() { updateBucketOptions(domSel.value); });
    updateBucketOptions(domSel ? domSel.value : 'inbox');

    /* Wire Back */
    var backBtn = document.getElementById('calAddBack');
    if (backBtn) backBtn.addEventListener('click', function() {
      step2.style.display = 'none';
      step1.style.display = '';
    });

    /* Wire Save */
    var saveBtn = document.getElementById('calAddSave');
    if (saveBtn) saveBtn.addEventListener('click', function() { saveCalendarItem(type); });

    /* Wire Enter key on title */
    var titleInp = document.getElementById('calAddTitle');
    if (titleInp) {
      titleInp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); saveCalendarItem(type); }
      });
      setTimeout(function() { titleInp.focus(); }, 80);
    }
  }

  function updateBucketOptions(domain) {
    var row = document.getElementById('calAddBucketRow');
    var sel = document.getElementById('calAddBucket');
    if (!row || !sel) return;

    if (domain === 'inbox') {
      row.style.display = 'none';
      return;
    }

    var buckets = getBuckets(domain);
    if (!buckets.length) {
      row.style.display = 'none';
      return;
    }

    row.style.display = '';
    sel.innerHTML = '<option value="">— No bucket —</option>';
    buckets.forEach(function(b) {
      var opt = document.createElement('option');
      opt.value = String(b.id);
      opt.textContent = (b.emoji || '') + ' ' + (b.name || 'Bucket ' + b.id);
      sel.appendChild(opt);
    });
  }

  function saveCalendarItem(type) {
    var titleInp = document.getElementById('calAddTitle');
    var title = titleInp ? titleInp.value.trim() : '';
    if (!title) {
      if (titleInp) { titleInp.focus(); titleInp.style.outline = '2px solid #e74c3c'; setTimeout(function() { titleInp.style.outline = ''; }, 1200); }
      return;
    }

    var domSel = document.getElementById('calAddDomain');
    var domain = domSel ? domSel.value : 'inbox';
    var bucketSel = document.getElementById('calAddBucket');
    var bucketId = (bucketSel && bucketSel.value) ? parseInt(bucketSel.value, 10) : undefined;
    var emojiInp = document.getElementById('calAddEmoji');
    var emoji = emojiInp ? emojiInp.value.trim() : '';
    var dateInp = document.getElementById('calAddDate');
    var date = normalizeDate(dateInp ? dateInp.value : '') || '';
    var timeInp = document.getElementById('calAddTime');
    var time = timeInp ? timeInp.value : '';

    if (domain === 'inbox') {
      /* Send to inbox — capture type-specific fields for later assignment */
      var inboxItem = { title: title, emoji: emoji, type: type, date: date, time: time, created: new Date().toISOString() };
      if (type === 'event') {
        var eti = document.getElementById('calAddEndTime');
        var eli = document.getElementById('calAddLocation');
        if (eti && eti.value) inboxItem.endTime = eti.value;
        if (eli && eli.value.trim()) inboxItem.location = eli.value.trim();
      } else if (type === 'task') {
        var epi = document.getElementById('calAddPriority');
        if (epi) inboxItem.priority = epi.value;
      }
      var inbox = getInbox();
      inbox.push(inboxItem);
      setInbox(inbox);
      updateInboxBadge();
      closeModal();
      showUndoToast('📥 Item added to Inbox!');
      try { generateCalendar(); } catch(_) {}
      return;
    }

    if (type === 'event') {
      var endTimeInp = document.getElementById('calAddEndTime');
      var endTime = endTimeInp ? endTimeInp.value : '';
      var locationInp = document.getElementById('calAddLocation');
      var location = locationInp ? locationInp.value.trim() : '';
      var evDate = date || new Date().toISOString().slice(0, 10);
      var evs = getEvents();
      var id = evs.length ? Math.max.apply(null, evs.map(function(x) { return x.id; })) + 1 : 1;
      var ev = { id: id, title: title, date: evDate, time: time, startTime: time, endTime: endTime, location: location, emoji: emoji, category: domain, domain: domain, repeat: 'none', repeatUntil: '', preBuffer: 0, postBuffer: 0 };
      if (bucketId !== undefined && !isNaN(bucketId)) ev.bucketId = bucketId;
      evs.push(ev);
      setEvents(evs);
      showUndoToast('📅 Event added!');
    } else if (type === 'task') {
      var priorityEl = document.getElementById('calAddPriority');
      var priority = priorityEl ? priorityEl.value : '2';
      var tasks = getTasks();
      var t = { id: generateTaskId(), title: title, category: domain, domain: domain, done: false, date: date, time: time, priority: priority, emoji: emoji };
      if (bucketId !== undefined && !isNaN(bucketId)) t.bucketId = bucketId;
      tasks.push(t);
      setTasks(tasks);
      showUndoToast('✅ Task added!');
    } else if (type === 'reminder') {
      var rDate = date || new Date().toISOString().slice(0, 10);
      var rmap = getReminders();
      if (!rmap[rDate]) rmap[rDate] = [];
      var rObj = { text: title, time: time, notify: 'none', domain: domain, emoji: emoji };
      if (bucketId !== undefined && !isNaN(bucketId)) rObj.bucketId = bucketId;
      rmap[rDate].push(rObj);
      setReminders(rmap);
      showUndoToast('🔔 Reminder added!');
    }

    closeModal();
    try { generateCalendar(); } catch(_) {}
    try { renderCalendarSummary(); } catch(_) {}
    if (window.selectedDay) { try { showReminders(window.selectedDay); } catch(_) {} }
  }
}

/* ----- Init all new features on DOMContentLoaded ----- */
document.addEventListener('DOMContentLoaded',function(){
  try {
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
  } catch(e) { console.warn('Feature wiring error', e); }
  try { initCalendarAddItemPopup(); } catch(e) { console.warn('Add-item popup init error', e); }
  /* Refresh rings immediately and every 60s */
  updateDayElapsedRing();
  updateCompletionRing();
  updateWeeklySalary();
  renderDashboardWeather();
  setInterval(function(){ updateDayElapsedRing(); updateCompletionRing(); }, 60000);

  /* Re-update rings when the daily-view date changes */
  window.addEventListener('dailyview:datechange', function(){
    updateCompletionRing();
    updateDayElapsedRing();
    renderDashboardWeather();
  });
});
