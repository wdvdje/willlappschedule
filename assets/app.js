/* Core helpers and storage */
const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const weekdayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function pad2(n){ return n<10 ? '0'+n : ''+n; }

/* ── Haptic feedback helper (uses navigator.vibrate where available) ── */
function haptic(pattern) {
  try {
    if (navigator.vibrate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigator.vibrate(pattern || 30);
    }
  } catch (_) {}
}
/* Preset patterns */
haptic.complete = function() { haptic([30, 20, 30]); };
haptic.delete   = function() { haptic(60); };
haptic.timer    = function() { haptic([60, 40, 60, 40, 120]); };
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
      if (!['none','daily','2day','weekday','weekly','monthly','custom','weekday_ab'].includes(repeat)) {
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
        var ppTypeEl = document.getElementById('jobPayPeriodType');
        var ppStartEl = document.getElementById('jobPayPeriodStart');
        if (ppTypeEl) ppTypeEl.value = (job.payPeriod && job.payPeriod.type) || '';
        if (ppStartEl) ppStartEl.value = (job.payPeriod && job.payPeriod.startDate) || '';
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
        jobs[idx] = Object.assign({}, jobs[idx], {name: name, emoji: emoji, location: location, rate: rate, unit: unit, offDays: offDays, overtimeHours: overtimeHours, overtimeMultiplier: overtimeMultiplier, payPeriod: { type: document.getElementById('jobPayPeriodType').value, startDate: document.getElementById('jobPayPeriodStart').value }});
      }
    } else {
      var nid = jobs.length ? Math.max.apply(null, jobs.map(function(j){ return j.id; }))+1 : 1;
      jobs.push({ id: nid, name: name, emoji: emoji, location: location, rate: rate, unit: unit, offDays: offDays, overtimeHours: overtimeHours, overtimeMultiplier: overtimeMultiplier, payPeriod: { type: document.getElementById('jobPayPeriodType').value, startDate: document.getElementById('jobPayPeriodStart').value } });
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
    var ppType = document.getElementById('jobPayPeriodType');
    var ppStart = document.getElementById('jobPayPeriodStart');
    if (ppType) ppType.value = '';
    if (ppStart) ppStart.value = '';
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

  for (let i=0;i<start;i++) {
    const ec = document.createElement('div');
    ec.className = 'day day-empty';
    calendarEl.appendChild(ec);
  }

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
    /* Cap at 5 items so the cell doesn't grow beyond a reasonable height */
    const visibleIndicators = indicators.slice(0, 5);
    visibleIndicators.forEach(ind=>{
      const sp = document.createElement('span');
      sp.className = 'event-preview ' + (ind.kind || '');
      sp.dataset.domain = ind.domain || 'personal';
      sp.dataset.shortTitle = ind.shortTitle || '';
      sp.title = ind.title || '';
      if (ind.kind === 'event' && ind.id) sp.dataset.eventId = ind.id;
      if (ind.kind === 'reminder') {
        sp.dataset.reminderDate = ymd;
        sp.style.cursor = 'pointer';
        (function(capturedYmd, capturedDay){
          sp.addEventListener('click', function(e){
            e.stopPropagation();
            const rems = getReminders();
            const arr = rems[capturedYmd] || [];
            if (!arr.length) return;
            if (arr.length === 1) { editReminder(capturedDay, 0); }
            else { showCalendarItemPicker(capturedYmd, 'reminder'); }
          });
        })(ymd, day);
      }
      if (ind.kind === 'task') {
        sp.dataset.taskDate = ymd;
        sp.style.cursor = 'pointer';
        (function(capturedYmd){
          sp.addEventListener('click', function(e){
            e.stopPropagation();
            const allT = getTasks();
            const dayT = allT.filter(function(t){ return normalizeDate(t.date) === capturedYmd; });
            if (!dayT.length) return;
            if (dayT.length === 1) {
              const idx = allT.findIndex(function(t){ return t.id != null ? t.id === dayT[0].id : t === dayT[0]; });
              if (idx !== -1) editTask(idx);
            } else { showCalendarItemPicker(capturedYmd, 'task'); }
          });
        })(ymd);
      }

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

    /* Mobile long-press: show daily summary modal */
    (function(dayNum, cellEl){
      var LONG_PRESS_MS = 500;
      var MOBILE_MAX_PX = 900;
      var _lpTimer = null;
      var _lpFired = false;
      cellEl.addEventListener('touchstart', function(e){
        _lpFired = false;
        var isMobile = window.innerWidth <= MOBILE_MAX_PX;
        if (!isMobile) return;
        _lpTimer = setTimeout(function(){
          _lpFired = true;
          showMobileDailySummary(selectedYear, selectedMonth, dayNum);
        }, LONG_PRESS_MS);
      }, {passive: true});
      cellEl.addEventListener('touchend', function(e){
        if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
        if (_lpFired) { e.preventDefault(); }
      });
      cellEl.addEventListener('touchmove', function(){
        if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
      }, {passive: true});
      cellEl.addEventListener('touchcancel', function(){
        if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
      }, {passive: true});
    })(day, cell);

    if (selectedDay === day) cell.classList.add('selected');
    calendarEl.appendChild(cell);
  }
  const totalCells = start + daysInMonth;
  const remainder = totalCells % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      const ec = document.createElement('div');
      ec.className = 'day day-empty';
      calendarEl.appendChild(ec);
    }
  }
}

/* ── Calendar item picker modal (click reminder/task aggregate → pick individual item) ── */
function showCalendarItemPicker(ymd, kind) {
  var existing = document.getElementById('calItemPickerModal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'calItemPickerModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;';

  var panel = document.createElement('div');
  panel.style.cssText = 'background:#fff;border-radius:14px;padding:16px 18px;min-width:240px;max-width:340px;width:90%;box-shadow:0 4px 28px rgba(0,0,0,0.22);';

  var heading = document.createElement('h3');
  heading.style.cssText = 'margin:0 0 12px;font-size:1rem;color:#333;';

  var allTasks = getTasks();
  var items = [];
  if (kind === 'reminder') {
    heading.textContent = '🔔 Select a Reminder to Edit';
    var rems = getReminders();
    var arr = rems[ymd] || [];
    arr.forEach(function(rem, i) {
      var capturedI = i;
      var capturedDay = parseInt(ymd.split('-')[2], 10);
      var capturedYear = parseInt(ymd.split('-')[0], 10);
      var capturedMonth = parseInt(ymd.split('-')[1], 10) - 1;
      items.push({
        label: (rem.text || '') + (rem.time ? '  [' + rem.time + ']' : ''),
        action: function() {
          overlay.remove();
          window.selectedYear = capturedYear;
          window.selectedMonth = capturedMonth;
          editReminder(capturedDay, capturedI);
        }
      });
    });
  } else if (kind === 'task') {
    heading.textContent = '✅ Select a Task to Edit';
    var dayTasks = allTasks.filter(function(t){ return normalizeDate(t.date) === ymd; });
    dayTasks.forEach(function(t) {
      var idx = allTasks.findIndex(function(x){ return x.id != null ? x.id === t.id : x === t; });
      var capturedIdx = idx;
      items.push({
        label: (t.title || t.text || 'Task') + (t.time ? '  [' + t.time + ']' : ''),
        action: function() { overlay.remove(); if (capturedIdx !== -1) editTask(capturedIdx); }
      });
    });
  }

  panel.appendChild(heading);
  items.forEach(function(item) {
    var btn = document.createElement('button');
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 12px;margin-bottom:6px;border:1px solid #e0e6f0;border-radius:8px;background:#f7f9fc;cursor:pointer;font-size:0.88rem;color:#333;';
    btn.textContent = item.label;
    btn.addEventListener('click', item.action);
    panel.appendChild(btn);
  });

  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'display:block;width:100%;margin-top:4px;padding:8px;background:#eee;border:none;border-radius:8px;cursor:pointer;font-size:0.88rem;color:#555;';
  cancelBtn.addEventListener('click', function(){ overlay.remove(); });
  panel.appendChild(cancelBtn);

  overlay.appendChild(panel);
  overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

/* ── Mobile daily summary modal (long-press) ── */
function showMobileDailySummary(year, month, day){
  var existing = document.getElementById('mobileDaySummaryModal');
  if (existing) existing.remove();

  var ymd = year + '-' + pad2(month + 1) + '-' + pad2(day);
  var dateObj = new Date(year, month, day);
  var dateTitle = dateObj.toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'});

  // Gather data
  var events = getExpandedEvents(ymd, ymd);
  var tasks = getTasks().filter(function(t){ return normalizeDate(t.date) === ymd; });
  var reminders = getReminders();
  var dayReminders = reminders[ymd] || [];
  var mmdd = pad2(month + 1) + '-' + pad2(day);
  var holiday = (typeof getHoliday === 'function') ? getHoliday(mmdd, year) : null;
  var domainColors = getDomainColors();

  // Build content
  var html = '';

  if (holiday) {
    html += '<div class="mds-section mds-holiday"><span>' + (holiday.emoji || '🏳️') + ' ' + escapeHTML(holiday.name) + '</span></div>';
  }

  // Events
  if (events.length) {
    html += '<div class="mds-section"><div class="mds-section-title">📅 Events</div>';
    events.forEach(function(ev){
      var domain = (typeof getDomainOfItem === 'function') ? getDomainOfItem(ev) : 'personal';
      var color = domainColors[domain] || '#9b59b6';
      var time = ev.time ? ('<span class="mds-time">' + escapeHTML(ev.time) + (ev.endTime ? ' – ' + escapeHTML(ev.endTime) : '') + '</span>') : '';
      html += '<div class="mds-item" style="border-left-color:' + color + '">' +
        (ev.emoji ? '<span class="mds-emoji">' + ev.emoji + '</span>' : '') +
        '<div class="mds-item-body">' +
        '<span class="mds-item-title">' + escapeHTML(ev.title || 'Untitled') + '</span>' +
        time +
        '</div></div>';
    });
    html += '</div>';
  }

  // Tasks
  if (tasks.length) {
    html += '<div class="mds-section"><div class="mds-section-title">✅ Tasks</div>';
    tasks.forEach(function(t){
      var done = t.done || t.completed;
      html += '<div class="mds-item mds-task' + (done ? ' mds-done' : '') + '">' +
        '<span class="mds-check">' + (done ? '☑' : '☐') + '</span>' +
        '<span class="mds-item-title">' + escapeHTML(t.text || t.title || '') + '</span>' +
        (t.time ? '<span class="mds-time">' + escapeHTML(t.time) + '</span>' : '') +
        '</div>';
    });
    html += '</div>';
  }

  // Reminders
  if (dayReminders.length) {
    html += '<div class="mds-section"><div class="mds-section-title">🔔 Reminders</div>';
    dayReminders.forEach(function(r){
      var done = r.done;
      html += '<div class="mds-item mds-reminder' + (done ? ' mds-done' : '') + '">' +
        '<span class="mds-item-title">' + escapeHTML(r.text || r.title || '') + '</span>' +
        (r.time ? '<span class="mds-time">' + escapeHTML(r.time) + '</span>' : '') +
        '</div>';
    });
    html += '</div>';
  }

  if (!events.length && !tasks.length && !dayReminders.length && !holiday) {
    html += '<div class="mds-empty">No events, tasks, or reminders for this day.</div>';
  }

  // Create modal
  var overlay = document.createElement('div');
  overlay.id = 'mobileDaySummaryModal';
  overlay.className = 'mobile-day-summary-modal';
  overlay.innerHTML =
    '<div class="mds-card">' +
      '<div class="mds-header">' +
        '<span class="mds-title">' + escapeHTML(dateTitle) + '</span>' +
        '<button class="mds-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="mds-body">' + html + '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  // Close handlers
  overlay.querySelector('.mds-close').addEventListener('click', function(){ overlay.remove(); });
  overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });
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
    /* Share-day button (Web Share API) */
    var existShareBtn = rd.parentNode && rd.parentNode.querySelector('#shareDayBtn');
    if (!existShareBtn && navigator.share && rd.parentNode) {
      var shareDayBtn = document.createElement('button');
      shareDayBtn.id = 'shareDayBtn';
      shareDayBtn.className = 'small-btn';
      shareDayBtn.title = 'Share this day';
      shareDayBtn.textContent = '↗ Share day';
      shareDayBtn.style.cssText = 'margin-left:8px;font-size:0.78rem;vertical-align:middle';
      shareDayBtn.addEventListener('click', function() { shareDaySchedule(selectedYear, selectedMonth, day); });
      rd.insertAdjacentElement('afterend', shareDayBtn);
    }
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
  renderReminderPageList();
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
  renderReminderPageList();
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
  if (done) haptic.complete();
  showReminders(day);
  updateCompletionRing();
  renderReminderPageList();
}

/* Render all reminders (across all dates) on the Reminders page */
function renderReminderPageList() {
  const list = document.getElementById('reminderPageList');
  if (!list) return;
  list.innerHTML = '';

  const rmap = getReminders();
  const now = new Date();

  // Flatten all reminders into a sorted list
  const allItems = [];
  Object.keys(rmap).sort().forEach(function(dateKey) {
    const arr = rmap[dateKey];
    if (!Array.isArray(arr)) return;
    arr.forEach(function(rem, idx) {
      allItems.push({ dateKey, idx, rem });
    });
  });

  if (!allItems.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state-msg';
    empty.innerHTML = '<span style="font-size:2rem;display:block;margin-bottom:8px">⏰</span><strong>No reminders yet</strong><br><span style="color:#888;font-size:0.9rem">Use the form above to add your first reminder.</span>';
    empty.style.cssText = 'list-style:none;text-align:center;padding:32px 16px;color:#555';
    list.appendChild(empty);
    return;
  }

  // Split into upcoming / past
  const upcoming = [], past = [];
  allItems.forEach(function(item) {
    const dt = new Date(item.dateKey + (item.rem.time ? 'T' + item.rem.time : 'T23:59:59'));
    if (isNaN(dt.getTime()) || dt >= now) upcoming.push(item);
    else past.push(item);
  });

  function renderGroup(items, label) {
    if (!items.length) return;
    if (label) {
      const hdr = document.createElement('li');
      hdr.style.cssText = 'list-style:none;font-weight:700;font-size:0.8rem;text-transform:uppercase;color:#aaa;letter-spacing:0.06em;padding:10px 0 4px';
      hdr.textContent = label;
      list.appendChild(hdr);
    }
    items.forEach(function(item) {
      const li = document.createElement('li');
      li.className = 'event-item' + (item.rem.done ? ' event-past' : '');

      const bullet = document.createElement('span');
      bullet.className = 'event-bullet';
      bullet.textContent = '⏰';
      bullet.setAttribute('aria-hidden', 'true');

      const contentEl = document.createElement('div');
      contentEl.className = 'event-content';
      const timeHtml = item.rem.time ? `[${escapeHTML(item.rem.time)}] ` : '';
      const doneStyle = item.rem.done ? ' style="text-decoration:line-through;opacity:0.6"' : '';
      contentEl.innerHTML = `<span${doneStyle}><b>${escapeHTML(item.dateKey)}</b> — ${timeHtml}${escapeHTML(item.rem.text || '')}</span>`;

      const actions = document.createElement('span');
      actions.className = 'item-controls';

      const doneChk = document.createElement('input');
      doneChk.type = 'checkbox';
      doneChk.checked = !!item.rem.done;
      doneChk.title = 'Mark done';
      doneChk.style.cssText = 'margin-right:4px;cursor:pointer';
      doneChk.addEventListener('change', function() {
        const r = getReminders();
        if (r[item.dateKey] && r[item.dateKey][item.idx]) {
          r[item.dateKey][item.idx].done = doneChk.checked;
          setReminders(r);
          if (doneChk.checked) haptic.complete();
          renderReminderPageList();
        }
      });

      const editBtn = document.createElement('button');
      editBtn.className = 'small-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', function() {
        const parts = item.dateKey.split('-');
        if (parts.length === 3) {
          selectedYear  = parseInt(parts[0], 10);
          selectedMonth = parseInt(parts[1], 10) - 1;
          selectedDay   = parseInt(parts[2], 10);
        }
        editReminder(parseInt(parts[2], 10), item.idx);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'small-btn';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', function() {
        if (!confirm('Delete this reminder?')) return;
        const r = getReminders();
        if (r[item.dateKey]) {
          r[item.dateKey].splice(item.idx, 1);
          if (!r[item.dateKey].length) delete r[item.dateKey];
          setReminders(r);
          renderReminderPageList();
          generateCalendar();
        }
      });

      actions.appendChild(doneChk);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      li.appendChild(bullet);
      li.appendChild(contentEl);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  renderGroup(upcoming, upcoming.length && past.length ? 'Upcoming' : null);
  renderGroup(past, past.length ? 'Past' : null);
}

/* Tasks list management */
function loadTasks(){
  const tasks = getTasks();
  const list = document.getElementById('taskList');
  if (!list) return;
  list.innerHTML = '';
  const pmap = {'1':'!','2':'!!','3':'!!!'};
  if (!tasks.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state-msg';
    empty.innerHTML = '<span style="font-size:2rem;display:block;margin-bottom:8px">✅</span><strong>No tasks yet</strong><br><span style="color:#888;font-size:0.9rem">Tap <b>＋ Add</b> to create your first task.</span>';
    empty.style.cssText = 'list-style:none;text-align:center;padding:32px 16px;color:#555';
    list.appendChild(empty);
    updateProgress(tasks); updateDashboard(tasks); updateDayProgress(selectedDay);
    return;
  }
  tasks.forEach((t,i)=>{
    const li = document.createElement('li');
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = !!t.done;
    cb.addEventListener('change', ()=>{ const all=getTasks(); all[i].done = cb.checked; setTasks(all); updateProgress(all); updateDashboard(all); updateDayProgress(selectedDay); if(cb.checked) haptic.complete(); loadTasks(); });
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

  if (!combined.length) {
    var empty = document.createElement('li');
    empty.className = 'empty-state-msg';
    empty.innerHTML = '<span style="font-size:2rem;display:block;margin-bottom:8px">📅</span><strong>No events yet</strong><br><span style="color:#888;font-size:0.9rem">Tap the <b>＋ Add</b> button to create your first event.</span>';
    empty.style.cssText = 'list-style:none;text-align:center;padding:32px 16px;color:#555';
    list.appendChild(empty);
    return;
  }

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
    /* Single-event ICS download */
    const icsBtn = document.createElement('button'); icsBtn.className='small-btn'; icsBtn.textContent='📅'; icsBtn.title='Add to Apple Calendar'; icsBtn.addEventListener('click', ()=> downloadSingleEventICS(e));
    /* Web Share */
    if (navigator.share) {
      const shareBtn = document.createElement('button'); shareBtn.className='small-btn'; shareBtn.textContent='↗'; shareBtn.title='Share event'; shareBtn.addEventListener('click', ()=> shareEvent(e));
      actions.appendChild(shareBtn);
    }
    actions.appendChild(icsBtn); actions.appendChild(editBtn); actions.appendChild(delBtn);

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

/* ─── Advanced Item Specifications helpers ─── */
var _advSpecCounter = 0;

function buildAdvSpecRow(spec) {
  spec = spec || {};
  var idx = _advSpecCounter++;
  var div = document.createElement('div');
  div.className = 'adv-spec-row';
  div.dataset.advIdx = idx;
  div.style.cssText = 'border:1px solid #ccc;border-radius:8px;padding:8px;margin-top:6px;position:relative;';

  div.innerHTML =
    '<button type="button" class="adv-spec-remove" style="position:absolute;top:4px;right:6px;background:none;border:none;font-size:1.1em;cursor:pointer;color:#e74c3c" title="Remove">&times;</button>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<div style="flex:1;min-width:120px"><label style="font-size:0.85em">Start time</label><input type="time" class="advSpec-time" value="' + (spec.time || '') + '" style="width:100%"></div>' +
      '<div style="flex:1;min-width:120px"><label style="font-size:0.85em">End time</label><input type="time" class="advSpec-endTime" value="' + (spec.endTime || '') + '" style="width:100%"></div>' +
      '<div style="min-width:100px"><label style="font-size:0.85em">Pre-buffer</label><select class="advSpec-preBuffer" style="width:100%"><option value="0"' + ((spec.preBuffer || 0) === 0 ? ' selected' : '') + '>None</option><option value="5"' + (parseInt(spec.preBuffer,10) === 5 ? ' selected' : '') + '>5 min</option><option value="10"' + (parseInt(spec.preBuffer,10) === 10 ? ' selected' : '') + '>10 min</option><option value="15"' + (parseInt(spec.preBuffer,10) === 15 ? ' selected' : '') + '>15 min</option><option value="20"' + (parseInt(spec.preBuffer,10) === 20 ? ' selected' : '') + '>20 min</option><option value="25"' + (parseInt(spec.preBuffer,10) === 25 ? ' selected' : '') + '>25 min</option><option value="30"' + (parseInt(spec.preBuffer,10) === 30 ? ' selected' : '') + '>30 min</option></select></div>' +
      '<div style="min-width:100px"><label style="font-size:0.85em">Post-buffer</label><select class="advSpec-postBuffer" style="width:100%"><option value="0"' + ((spec.postBuffer || 0) === 0 ? ' selected' : '') + '>None</option><option value="5"' + (parseInt(spec.postBuffer,10) === 5 ? ' selected' : '') + '>5 min</option><option value="10"' + (parseInt(spec.postBuffer,10) === 10 ? ' selected' : '') + '>10 min</option><option value="15"' + (parseInt(spec.postBuffer,10) === 15 ? ' selected' : '') + '>15 min</option><option value="20"' + (parseInt(spec.postBuffer,10) === 20 ? ' selected' : '') + '>20 min</option><option value="25"' + (parseInt(spec.postBuffer,10) === 25 ? ' selected' : '') + '>25 min</option><option value="30"' + (parseInt(spec.postBuffer,10) === 30 ? ' selected' : '') + '>30 min</option></select></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">' +
      '<label style="min-width:60px;margin:0;font-size:0.85em">Repeat</label>' +
      '<select class="advSpec-repeat" style="width:160px">' +
        '<option value="none"' + (spec.repeat === 'none' || !spec.repeat ? ' selected' : '') + '>None</option>' +
        '<option value="daily"' + (spec.repeat === 'daily' ? ' selected' : '') + '>Every day</option>' +
        '<option value="2day"' + (spec.repeat === '2day' ? ' selected' : '') + '>Every 2 days</option>' +
        '<option value="weekday"' + (spec.repeat === 'weekday' ? ' selected' : '') + '>Every weekday (Mon-Fri)</option>' +
        '<option value="weekly"' + (spec.repeat === 'weekly' ? ' selected' : '') + '>Every week</option>' +
        '<option value="monthly"' + (spec.repeat === 'monthly' ? ' selected' : '') + '>Every month</option>' +
        '<option value="custom"' + (spec.repeat === 'custom' ? ' selected' : '') + '>Custom interval</option>' +
        '<option value="weekday_ab"' + (spec.repeat === 'weekday_ab' ? ' selected' : '') + '>A/B weekday pattern</option>' +
      '</select>' +
      '<label style="min-width:40px;margin:0;font-size:0.85em">Until</label>' +
      '<input type="date" class="advSpec-repeatUntil" value="' + (spec.repeatUntil || '') + '" style="width:150px">' +
    '</div>' +
    '<div class="advSpec-customRow" style="' + (spec.repeat === 'custom' ? 'display:flex;' : 'display:none;') + 'gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">' +
      '<label style="min-width:60px;margin:0;font-size:0.85em">Every</label>' +
      '<input type="number" class="advSpec-repeatInterval" min="1" max="30" value="' + (spec.repeatInterval || 1) + '" style="width:70px">' +
      '<select class="advSpec-repeatUnit" style="width:110px">' +
        '<option value="days"' + (spec.repeatUnit === 'days' || !spec.repeatUnit ? ' selected' : '') + '>Days</option>' +
        '<option value="weeks"' + (spec.repeatUnit === 'weeks' ? ' selected' : '') + '>Weeks</option>' +
        '<option value="months"' + (spec.repeatUnit === 'months' ? ' selected' : '') + '>Months</option>' +
        '<option value="years"' + (spec.repeatUnit === 'years' ? ' selected' : '') + '>Years</option>' +
      '</select>' +
    '</div>' +
    '<div class="advSpec-abRow" style="' + (spec.repeat === 'weekday_ab' ? 'display:flex;' : 'display:none;') + 'gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">' +
      '<label style="min-width:100px;margin:0;font-size:0.85em">Start template</label>' +
      '<select class="advSpec-abWeek" style="width:190px">' +
        '<option value="a"' + (spec.abWeek === 'a' || !spec.abWeek ? ' selected' : '') + '>A week (Mon/Wed/Fri)</option>' +
        '<option value="b"' + (spec.abWeek === 'b' ? ' selected' : '') + '>B week (Tue/Thu)</option>' +
      '</select>' +
      '<label style="display:flex;align-items:center;gap:4px;margin:0;cursor:pointer;font-size:0.85em"><input type="checkbox" class="advSpec-abSkipHolidays"' + (spec.abSkipHolidays ? ' checked' : '') + '> Skip holidays</label>' +
    '</div>';

  // Wire repeat change handler for this row
  var repSel = div.querySelector('.advSpec-repeat');
  repSel.addEventListener('change', function() {
    var mode = repSel.value;
    var cr = div.querySelector('.advSpec-customRow');
    var ar = div.querySelector('.advSpec-abRow');
    if (cr) cr.style.display = mode === 'custom' ? 'flex' : 'none';
    if (ar) ar.style.display = mode === 'weekday_ab' ? 'flex' : 'none';
  });

  // Wire remove button
  div.querySelector('.adv-spec-remove').addEventListener('click', function() {
    div.remove();
  });

  return div;
}

function readAdvancedSpecs(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return [];
  var rows = container.querySelectorAll('.adv-spec-row');
  var specs = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var time = row.querySelector('.advSpec-time').value || '';
    var endTime = row.querySelector('.advSpec-endTime').value || '';
    var repeat = row.querySelector('.advSpec-repeat').value || 'none';
    var repeatUntil = row.querySelector('.advSpec-repeatUntil').value || '';
    var spec = { time: time, endTime: endTime, repeat: repeat, repeatUntil: repeatUntil };
    var preEl = row.querySelector('.advSpec-preBuffer');
    var postEl = row.querySelector('.advSpec-postBuffer');
    spec.preBuffer = preEl ? (parseInt(preEl.value, 10) || 0) : 0;
    spec.postBuffer = postEl ? (parseInt(postEl.value, 10) || 0) : 0;
    if (repeat === 'custom') {
      var n = parseInt(row.querySelector('.advSpec-repeatInterval').value, 10);
      spec.repeatInterval = Number.isFinite(n) ? Math.max(1, Math.min(30, n)) : 1;
      spec.repeatUnit = row.querySelector('.advSpec-repeatUnit').value || 'days';
    }
    if (repeat === 'weekday_ab') {
      spec.abWeek = row.querySelector('.advSpec-abWeek').value || 'a';
      spec.abSkipHolidays = row.querySelector('.advSpec-abSkipHolidays').checked || false;
    }
    specs.push(spec);
  }
  return specs;
}

function populateAdvancedSpecs(containerId, specs) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(specs)) return;
  for (var i = 0; i < specs.length; i++) {
    container.appendChild(buildAdvSpecRow(specs[i]));
  }
}

function wireAdvancedSpecButtons() {
  var addBtn = document.getElementById('eventAddAdvSpec');
  if (addBtn) {
    addBtn.addEventListener('click', function() {
      var list = document.getElementById('eventAdvSpecList');
      if (list) list.appendChild(buildAdvSpecRow());
    });
  }
  var editAddBtn = document.getElementById('editAddAdvSpec');
  if (editAddBtn) {
    editAddBtn.addEventListener('click', function() {
      var list = document.getElementById('editAdvSpecList');
      if (list) list.appendChild(buildAdvSpecRow());
    });
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
  // Read advanced item specifications (additional time/repeat schedules)
  var advSpecs = readAdvancedSpecs('eventAdvSpecList');
  if (advSpecs.length) newEvent.advancedSpecs = advSpecs;
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
  // Clear advanced specs list
  var advSpecListEl = document.getElementById('eventAdvSpecList');
  if (advSpecListEl) advSpecListEl.innerHTML = '';
  syncRepeatUI('event');
  renderEvents(); generateCalendar();
}

/* delete/edit events */
function deleteEvent(id){ if(!confirm('Delete this event?')) return; let evs=getEvents(); evs = evs.filter(e=>e.id!==id); setEvents(evs); renderEvents(); generateCalendar(); if (selectedDay) showReminders(selectedDay); }
function editEvent(id, occurrenceDate){
  const evs = getEvents(); const idx = evs.findIndex(e=>e.id===id); if (idx===-1) return;
  const e = evs[idx];
  const isRepeating = e.repeat && e.repeat !== 'none';

  // When an occurrence date is provided for a repeating event, ask user which scope to edit
  let editingThisOccurrence = false;
  if (occurrenceDate && isRepeating) {
    const editAll = confirm('This is a repeating event. Edit all events in the series?\n\nOK = Edit all events\nCancel = Edit just this occurrence');
    editingThisOccurrence = !editAll;
  }

  // If editing a specific occurrence that already has an exception, pre-fill from it
  const exc = editingThisOccurrence && e.repeatExceptions && e.repeatExceptions[occurrenceDate] ? e.repeatExceptions[occurrenceDate] : null;
  const eff = exc ? Object.assign({}, e, exc) : e;

  document.getElementById('editKind').value='event';
  document.getElementById('editEventId').value = id;
  document.getElementById('editText').value = eff.title || '';
  document.getElementById('editDate').value = editingThisOccurrence ? (occurrenceDate || eff.date || '') : (e.date || '');
  document.getElementById('editTime').value = eff.time || '';
  document.getElementById('editEndTime').value = eff.endTime || '';
  if (document.getElementById('editEndDate')) document.getElementById('editEndDate').value = editingThisOccurrence ? '' : (e.endDate || '');
  document.getElementById('editLocation').value = eff.location || '';
  document.getElementById('editEmoji').value = eff.emoji || '';
  if (document.getElementById('editCategory')) document.getElementById('editCategory').value = eff.category || 'event';
  document.getElementById('editPreBuffer').value = parseBufferMinutes(eff.preBuffer || 0);
  document.getElementById('editPostBuffer').value = parseBufferMinutes(eff.postBuffer || 0);

  // Store the occurrence date (empty string = editing all)
  const occEl = document.getElementById('editOccurrenceDate');
  if (occEl) occEl.value = editingThisOccurrence ? (occurrenceDate || '') : '';

  // Show/hide repeat section and advanced specs based on editing mode
  const repSection = document.getElementById('editRepeatSection');
  if (repSection) repSection.style.display = editingThisOccurrence ? 'none' : '';
  const advSection = document.getElementById('editAdvancedSpecs');
  if (advSection) advSection.style.display = editingThisOccurrence ? 'none' : '';

  if (!editingThisOccurrence) {
    document.getElementById('editRepeat').value = e.repeat || 'none';
    document.getElementById('editRepeatUntil').value = e.repeatUntil || '';
    document.getElementById('editRepeatInterval').value = e.repeatInterval || 1;
    document.getElementById('editRepeatUnit').value = e.repeatUnit || 'days';
    document.getElementById('editABWeek').value = e.abWeek || 'a';
    var editSkipHol = document.getElementById('editABSkipHolidays');
    if (editSkipHol) editSkipHol.checked = !!e.abSkipHolidays;
    syncRepeatUI('edit');
    // Populate advanced item specifications in edit modal
    populateAdvancedSpecs('editAdvSpecList', e.advancedSpecs || []);
  } else {
    populateAdvancedSpecs('editAdvSpecList', []);
  }
  const itemDomain = e.domain || getDomainOfItem(e);
  const editItemDomainEl = document.getElementById('editItemDomain');
  if (editItemDomainEl) editItemDomainEl.value = itemDomain;
  populateBucketSelect(document.getElementById('editBucket'), itemDomain, e.bucketId);
  const bRow = document.getElementById('editBucketRow');
  if (bRow) bRow.style.display = 'block';
  showModalFieldsFor('event'); openEditModal(editingThisOccurrence ? 'Edit This Occurrence' : 'Edit Event');
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

    // Handle single-occurrence edit: save as exception rather than modifying base event
    const occEl = document.getElementById('editOccurrenceDate');
    const occDate = occEl ? occEl.value.trim() : '';
    if (occDate) {
      const before = Object.assign({}, evs[idx]);
      if (!evs[idx].repeatExceptions) evs[idx].repeatExceptions = {};
      const exc = {
        title: text, time: time, startTime: time, endTime: endTime,
        location: document.getElementById('editLocation').value.trim(),
        emoji: document.getElementById('editEmoji').value.trim(),
        preBuffer: parseBufferMinutes(document.getElementById('editPreBuffer').value),
        postBuffer: parseBufferMinutes(document.getElementById('editPostBuffer').value)
      };
      const excCatEl = document.getElementById('editCategory');
      if (excCatEl) exc.category = excCatEl.value || 'event';
      evs[idx].repeatExceptions[occDate] = exc;
      setEvents(evs); renderEvents(); generateCalendar(); if (selectedDay) showReminders(selectedDay);
      pushUndo({ label: 'Edit to occurrence of "' + evs[idx].title + '" undone.', undo: function() {
        const cur = getEvents(); const ci = cur.findIndex(function(x){ return x.id === before.id; });
        if (ci !== -1) { cur[ci] = before; setEvents(cur); renderEvents(); generateCalendar(); if (selectedDay) showReminders(selectedDay); }
      }});
      closeEditModal();
      return;
    }

    /* Capture snapshot for undo */
    const before = Object.assign({}, evs[idx]);
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
    // Save advanced item specifications
    var editAdvSpecs = readAdvancedSpecs('editAdvSpecList');
    if (editAdvSpecs.length) evs[idx].advancedSpecs = editAdvSpecs;
    else delete evs[idx].advancedSpecs;
    setEvents(evs); renderEvents(); generateCalendar(); if (selectedDay) showReminders(selectedDay);
    pushUndo({ label: 'Edit to event "' + text + '" undone.', undo: function() {
      const cur = getEvents(); const ci = cur.findIndex(function(x){ return x.id === before.id; });
      if (ci !== -1) { cur[ci] = before; setEvents(cur); renderEvents(); generateCalendar(); if (selectedDay) showReminders(selectedDay); }
    }});
    closeEditModal();
    return;
  } else if (kind==='task'){
    const idx = parseInt(document.getElementById('editTaskIndex').value,10);
    const tasks = getTasks(); if (!tasks[idx]) { closeEditModal(); return; }
    const beforeTask = Object.assign({}, tasks[idx]);
    tasks[idx].title = text; tasks[idx].date = date; tasks[idx].time = time; tasks[idx].category = document.getElementById('editCategory').value; tasks[idx].priority = document.getElementById('editPriority').value;
    const editBucketElT = document.getElementById('editBucket');
    if (editBucketElT) {
      const bvalT = editBucketElT.value;
      if (bvalT) tasks[idx].bucketId = parseInt(bvalT, 10);
      else delete tasks[idx].bucketId;
    }
    setTasks(tasks); loadTasks();
    pushUndo({ label: 'Edit to task "' + text + '" undone.', undo: function() {
      const cur = getTasks(); const ci = cur.findIndex(function(t){ return t.id === beforeTask.id; });
      if (ci !== -1) { cur[ci] = beforeTask; setTasks(cur); loadTasks(); }
    }});
  } else if (kind==='reminder'){
    const origKey = document.getElementById('editReminderKey').value;
    const ridx = parseInt(document.getElementById('editReminderIndex').value,10);
    const r = getReminders(); const arr = r[origKey] || []; const item = arr[ridx]; if (!item){ closeEditModal(); return; }
    const beforeReminder = Object.assign({}, item);
    const beforeKey = origKey;
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
    renderReminderPageList();
    pushUndo({ label: 'Edit to reminder "' + text + '" undone.', undo: function() {
      const cur = getReminders();
      /* Remove the edited version */
      if (cur[newDate]) { cur[newDate] = cur[newDate].filter(function(x){ return x.text !== newR.text || x.time !== newR.time; }); if (!cur[newDate].length) delete cur[newDate]; }
      /* Restore original */
      if (!cur[beforeKey]) cur[beforeKey] = [];
      cur[beforeKey].splice(ridx, 0, beforeReminder);
      setReminders(cur);
      const bp = beforeKey.split('-');
      if (bp.length===3){ selectedYear=parseInt(bp[0],10); selectedMonth=parseInt(bp[1],10)-1; selectedDay=parseInt(bp[2],10); }
      generateCalendar(); showReminders(selectedDay);
    }});
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

/* Weekly salary display — content is managed by renderTodayEarningsPreview() in the right column widget */
function updateWeeklySalary(){
  // no-op: earnings are rendered by renderTodayEarningsPreview() into weeklySalaryDisplay
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
    /* Scroll the week grid so today's card is centred in the visible area */
    var grid = container.querySelector('.weather-week-grid');
    var todayCard = grid && grid.querySelector('.wdc-today');
    if (grid && todayCard) {
      var scrollTarget = todayCard.offsetLeft - (grid.offsetWidth - todayCard.offsetWidth) / 2;
      grid.scrollLeft = Math.max(0, scrollTarget);
    }
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
  if (view === 'today'){ try{ generateCalendar(); }catch(e){ console.warn(e); } if (selectedDay) try{ showReminders(selectedDay); }catch(e){ console.warn(e); } try{ updateCompletionRing(); updateDayElapsedRing(); }catch(e){ console.warn(e); } try{ renderInboxWidget(); }catch(e){ console.warn(e); } }
  else if (view === 'calendar'){ try{ generateCalendar(); }catch(e){ console.warn(e); } try{ renderCalendarSummary(); }catch(e){ console.warn(e); } }
  else if (view === 'events'){ try{ renderEvents(); }catch(e){ console.warn(e); } }
  else if (view === 'tasks'){ try{ loadTasks(); }catch(e){ console.warn(e); } }
  else if (view === 'reminders'){ try{ renderReminderPageList(); }catch(e){ console.warn(e); } }
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
window.editTask = editTask;
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
    try{ wireAdvancedSpecButtons(); }catch(e){ console.warn('wireAdvancedSpecButtons failed', e); }

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
      personalMood: safeParseStorage('personalMood', []),
      personalMealFavorites: safeParseStorage('personalMealFavorites', []),
      personalMealPrepLog: safeParseStorage('personalMealPrepLog', {})
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

/* ── Single-event ICS download (one tap → Apple Calendar on iOS) ── */
function downloadSingleEventICS(ev) {
  function escICS(s){ return (s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n'); }
  function toICSDate(dateStr, timeStr){
    if (!dateStr) return '';
    var d = dateStr.replace(/-/g,'');
    if (!timeStr) return d;
    return d + 'T' + timeStr.replace(/:/g,'') + '00';
  }
  function datePlusOne(dateStr){
    var d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate());
  }
  var uid = 'ev-' + (ev.id||Date.now()) + '@timescape.app';
  var hasTime = !!ev.time;
  var lines = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TimeScape Planner//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + uid,
    'SUMMARY:' + escICS((ev.emoji ? ev.emoji + ' ' : '') + (ev.title||''))
  ];
  if (hasTime) {
    lines.push('DTSTART:' + toICSDate(ev.date, ev.time));
    lines.push('DTEND:' + toICSDate(ev.endDate||ev.date, ev.endTime||ev.time));
  } else {
    lines.push('DTSTART;VALUE=DATE:' + (ev.date||'').replace(/-/g,''));
    lines.push('DTEND;VALUE=DATE:' + (ev.endDate ? ev.endDate.replace(/-/g,'') : datePlusOne(ev.date)));
  }
  if (ev.location) lines.push('LOCATION:' + escICS(ev.location));
  lines.push('END:VEVENT','END:VCALENDAR');
  var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (ev.title||'event').replace(/[^a-z0-9]/gi,'-').toLowerCase() + '.ics';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ── Web Share API ── */
function shareEvent(ev) {
  var text = (ev.emoji ? ev.emoji + ' ' : '') + (ev.title||'');
  if (ev.date) text += '\n📅 ' + ev.date;
  if (ev.time) text += ' ' + ev.time + (ev.endTime ? '–'+ev.endTime : '');
  if (ev.location) text += '\n📍 ' + ev.location;
  navigator.share({ title: ev.title||'Event', text: text }).catch(function(){});
}

function shareDaySchedule(year, month, day) {
  var dateKey = year + '-' + pad2(month+1) + '-' + pad2(day);
  var dateLabel = new Date(year, month, day).toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  var lines = [dateLabel, ''];
  var evs = getEvents().filter(function(e){ return e.date === dateKey; });
  evs.sort(function(a,b){ return (a.time||'').localeCompare(b.time||''); });
  evs.forEach(function(e){ lines.push((e.emoji||'📅')+' '+(e.time?e.time+' ':'')+e.title+(e.location?' @ '+e.location:'')); });
  var reminders = (getReminders()[dateKey]||[]);
  reminders.forEach(function(r){ lines.push('🔔 '+(r.time?r.time+' ':'')+r.text); });
  var tasks = getTasks().filter(function(t){ return t.date === dateKey; });
  tasks.forEach(function(t){ lines.push((t.done?'✅':'⬜')+' '+t.title); });
  var text = lines.join('\n').trim() || dateLabel;
  navigator.share({ title: 'Schedule for ' + dateLabel, text: text }).catch(function(){});
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
  const personalMeals = (data.personalMeals && typeof data.personalMeals === 'object' && !Array.isArray(data.personalMeals)) ? data.personalMeals : undefined;
  const personalCalorieGoal = data.personalCalorieGoal != null ? data.personalCalorieGoal : undefined;
  const personalSleep = (data.personalSleep && typeof data.personalSleep === 'object' && !Array.isArray(data.personalSleep)) ? data.personalSleep : undefined;
  const personalGym = (data.personalGym && typeof data.personalGym === 'object' && !Array.isArray(data.personalGym)) ? data.personalGym : undefined;
  const personalFocus = (data.personalFocus && typeof data.personalFocus === 'object' && !Array.isArray(data.personalFocus)) ? data.personalFocus : undefined;
  const personalRoutines = (data.personalRoutines && typeof data.personalRoutines === 'object' && !Array.isArray(data.personalRoutines)) ? data.personalRoutines : undefined;
  const personalRoutineLog = (data.personalRoutineLog && typeof data.personalRoutineLog === 'object' && !Array.isArray(data.personalRoutineLog)) ? data.personalRoutineLog : undefined;
  const personalHydration = (data.personalHydration && typeof data.personalHydration === 'object' && !Array.isArray(data.personalHydration)) ? data.personalHydration : undefined;
  const personalMood = Array.isArray(data.personalMood) ? data.personalMood : undefined;
  const personalMealFavorites = Array.isArray(data.personalMealFavorites) ? data.personalMealFavorites : undefined;
  const personalMealPrepLog = (data.personalMealPrepLog && typeof data.personalMealPrepLog === 'object' && !Array.isArray(data.personalMealPrepLog)) ? data.personalMealPrepLog : undefined;

  return { events, tasks, reminders, jobs, taskCategories, userProfile, personalBuckets, homeBuckets, domainColors, userOffDays, dayStartHour, dayEndHour,
    personalMeals, personalCalorieGoal, personalSleep, personalGym, personalFocus, personalRoutines, personalRoutineLog, personalHydration, personalMood,
    personalMealFavorites, personalMealPrepLog };
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
  try { renderInboxWidget(); } catch(_) {}
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
    ['personalMeals', 'personalSleep', 'personalGym', 'personalFocus', 'personalRoutines', 'personalRoutineLog', 'personalHydration', 'personalMealPrepLog'].forEach(function(key) {
      if (importData[key] && typeof importData[key] === 'object') localStorage.setItem(key, JSON.stringify(importData[key]));
    });
    if (Array.isArray(importData.personalMood)) localStorage.setItem('personalMood', JSON.stringify(importData.personalMood));
    if (Array.isArray(importData.personalMealFavorites)) localStorage.setItem('personalMealFavorites', JSON.stringify(importData.personalMealFavorites));
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
  // Merge personal page widget data (imported wins for object keys not yet set locally; arrays are replaced if non-empty)
  ['personalMeals', 'personalSleep', 'personalGym', 'personalFocus', 'personalRoutines', 'personalRoutineLog', 'personalHydration', 'personalMealPrepLog'].forEach(function(key) {
    if (importData[key] && typeof importData[key] === 'object') {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(importData[key]));
    }
  });
  if (Array.isArray(importData.personalMood) && importData.personalMood.length && !localStorage.getItem('personalMood')) {
    localStorage.setItem('personalMood', JSON.stringify(importData.personalMood));
  }
  if (Array.isArray(importData.personalMealFavorites) && importData.personalMealFavorites.length && !localStorage.getItem('personalMealFavorites')) {
    localStorage.setItem('personalMealFavorites', JSON.stringify(importData.personalMealFavorites));
  }
  if (importData.personalCalorieGoal != null && !localStorage.getItem('personalCalorieGoal')) {
    localStorage.setItem('personalCalorieGoal', importData.personalCalorieGoal);
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
    function handleFilterToggle(e) {
      e.stopPropagation();
      if (e.type === 'touchend') e.preventDefault();
      var isOpen = bar.style.display === 'flex';
      bar.style.display = isOpen ? 'none' : 'flex';
      toggleBtn.setAttribute('aria-expanded', String(!isOpen));
      if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
    }
    toggleBtn.addEventListener('click', handleFilterToggle);
    toggleBtn.addEventListener('touchend', handleFilterToggle);
  }

  // Wire the View dropdown toggle button
  var viewToggle = document.getElementById('viewDropdownToggle');
  var viewBar = document.getElementById('viewDropdownBar');
  var viewArrow = document.getElementById('viewArrow');
  if (viewToggle && viewBar) {
    function handleViewToggle(e) {
      e.stopPropagation();
      if (e.type === 'touchend') e.preventDefault();
      var isOpen = viewBar.style.display === 'flex';
      viewBar.style.display = isOpen ? 'none' : 'flex';
      viewToggle.setAttribute('aria-expanded', String(!isOpen));
      if (viewArrow) viewArrow.textContent = isOpen ? '▸' : '▾';
    }
    viewToggle.addEventListener('click', handleViewToggle);
    viewToggle.addEventListener('touchend', handleViewToggle);
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
  const today = new Date();
  const todayStr = today.getFullYear()+'-'+pad2(today.getMonth()+1)+'-'+pad2(today.getDate());
  const we = new Date(ws); we.setDate(ws.getDate()+6);
  const weekStartISO = ws.getFullYear()+'-'+pad2(ws.getMonth()+1)+'-'+pad2(ws.getDate());
  const weekEndISO   = we.getFullYear()+'-'+pad2(we.getMonth()+1)+'-'+pad2(we.getDate());
  const allEvents = getExpandedEvents(weekStartISO, weekEndISO);
  const allTasks = getTasks();
  const allReminders = getReminders();

  const isDesk = window.matchMedia && window.matchMedia('(min-width: 901px)').matches;

  function buildCol(i) {
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
      (function(evCopy){ chip.addEventListener('click',e=>{ e.stopPropagation(); editEvent(evCopy.id, evCopy.occurrenceDate); }); })(ev);
      col.appendChild(chip);
    });
    allTasks.filter(t=>normalizeDate(t.date)===ymd).forEach(t=>{
      const chip=document.createElement('div'); chip.className='week-chip task';
      chip.textContent='\u2705 '+(t.title||t.text||'');
      col.appendChild(chip);
    });
    const rems=allReminders[ymd]||[];
    if(rems.length){ const chip=document.createElement('div'); chip.className='week-chip reminder'; chip.textContent='\uD83D\uDD14 '+rems.length+' reminder'+(rems.length>1?'s':''); col.appendChild(chip); }

    return col;
  }

  container.innerHTML='';

  if (isDesk) {
    /* Desktop: 4 days on first row (left), 3 days on second row (right) */
    const wrapper = document.createElement('div');
    wrapper.className = 'week-grid-wrapper';
    const row1 = document.createElement('div');
    row1.className = 'week-row-split week-row-first';
    const row2 = document.createElement('div');
    row2.className = 'week-row-split week-row-second';
    for (let i = 0; i < 7; i++) {
      const col = buildCol(i);
      if (i < 4) row1.appendChild(col);
      else row2.appendChild(col);
    }
    wrapper.appendChild(row1);
    wrapper.appendChild(row2);
    container.appendChild(wrapper);
  } else {
    /* Mobile: original 7-column grid */
    const grid = document.createElement('div');
    grid.className = 'week-grid';
    for (let i = 0; i < 7; i++) {
      grid.appendChild(buildCol(i));
    }
    container.appendChild(grid);
  }

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
  const todayISO = getTodayISO();
  const tasks = getTasks().filter(function(t){ return t.date && normalizeDate(t.date) === viewDate && !t.done; });
  const rems = (getReminders()[viewDate] || []).filter(function(r){ return !r.done; });
  const dailyCount = tasks.length + rems.length;
  const unsortedCount = getInbox().length;
  const overdueCount = getTasks().filter(function(t){ return t.date && normalizeDate(t.date) < todayISO && !t.done; }).length;
  const total = dailyCount + unsortedCount + overdueCount;
  label.textContent = total > 0 ? 'Inbox (' + total + ')' : 'Inbox';
}

/* Render daily items (tasks + reminders + events for viewed day) in the inbox */
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
  // Get calendar events for this date (timed events)
  var dateEvents = [];
  try {
    dateEvents = getEvents().filter(function(ev){
      return ev.date && normalizeDate(ev.date) === viewDate;
    });
    // sort by time
    dateEvents.sort(function(a, b){ return (a.time || '').localeCompare(b.time || ''); });
  } catch(_) {}

  if (tasks.length === 0 && dateReminders.length === 0 && dateEvents.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  var html = '';

  // Render calendar events
  dateEvents.forEach(function(ev, evIdx){
    var timePart = ev.time ? ' <span style="color:#888;font-size:0.85rem">[' + escapeHTML(ev.time) + (ev.endTime ? '–' + escapeHTML(ev.endTime) : '') + ']</span>' : '';
    var locPart = ev.location ? ' <span style="color:#888;font-size:0.82rem">\uD83D\uDCCD ' + escapeHTML(ev.location) + '</span>' : '';
    var driveId = ev.location ? 'inbox-drive-' + evIdx : '';
    var drivePart = ev.location ? ' <span id="' + driveId + '" style="color:#2980b9;font-size:0.82rem;margin-left:4px"></span>' : '';
    html += '<div style="background:#eaf3fb;border:1px solid #4a90e2;border-radius:10px;padding:10px 14px;margin-bottom:8px">'
      + '<div style="font-weight:600">\uD83D\uDCC5 ' + escapeHTML(ev.emoji || '') + ' ' + escapeHTML(ev.title || '') + timePart + '</div>'
      + '<div style="font-size:0.85rem;color:#555;margin-top:2px">' + locPart + drivePart + '</div>'
      + '</div>';
  });

  // Render tasks
  tasks.forEach(function(t){
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

  // Async: populate driving times for events with locations (rate-limited to 1 req/s per Nominatim policy)
  var profile = readUserProfile();
  if (profile.home && typeof profile.home.lat === 'number' && typeof profile.home.lng === 'number') {
    var eventsWithLocation = dateEvents.filter(function(ev){ return !!ev.location; });
    eventsWithLocation.forEach(function(ev, i){
      var driveId = 'inbox-drive-' + dateEvents.indexOf(ev);
      setTimeout(function(){
        var el = document.getElementById(driveId);
        if (!el) return;
        el.textContent = '\u23F3';
        inboxFetchDrivingTime(profile.home.lat, profile.home.lng, ev.location).then(function(mins){
          if (el && mins !== null) {
            el.textContent = '\uD83D\uDE97 ~' + mins + ' min from home';
          } else if (el) {
            el.textContent = '';
          }
        }).catch(function(){ if (el) el.textContent = ''; });
      }, i * 1100); // stagger by 1.1 s to respect Nominatim 1 req/s limit
    });
  }
}

/* Geocode an address string via Nominatim, returning {lat, lng} or null */
function inboxGeocodeAddress(address){
  var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(address);
  return fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'TimeScapePlanner/1.0 (https://github.com/wdvdje/willlappschedule)'
    }
  }).then(function(r){
    if (!r.ok) return null;
    return r.json();
  }).then(function(results){
    if (!results || !results.length) return null;
    var lat = parseFloat(results[0].lat);
    var lng = parseFloat(results[0].lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat: lat, lng: lng };
  }).catch(function(){ return null; });
}

/* Fetch driving duration in minutes via OSRM between two lat/lng pairs */
function inboxFetchDrivingTime(fromLat, fromLng, toAddress){
  return inboxGeocodeAddress(toAddress).then(function(dest){
    if (!dest) return null;
    var url = 'https://router.project-osrm.org/route/v1/driving/'
      + fromLng + ',' + fromLat + ';'
      + dest.lng + ',' + dest.lat
      + '?overview=false';
    return fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function(r){
        if (!r.ok) return null;
        return r.json();
      }).then(function(data){
        if (!data || !data.routes || !data.routes.length) return null;
        var secs = data.routes[0].duration;
        return Math.ceil(secs / 60);
      }).catch(function(){ return null; });
  });
}

/* Render overdue tasks (incomplete tasks past their due date) in the inbox */
function renderInboxOverdueTasks(){
  var listEl = document.getElementById('inboxOverdueList');
  var emptyEl = document.getElementById('inboxOverdueEmpty');
  var headingEl = document.getElementById('inboxOverdueHeading');
  if (!listEl) return;

  var todayISO = getTodayISO();
  var overdue = getTasks().filter(function(t){
    return t.date && normalizeDate(t.date) < todayISO && !t.done;
  }).sort(function(a, b){ return (a.date || '').localeCompare(b.date || ''); });

  if (headingEl) headingEl.style.display = overdue.length > 0 ? 'block' : 'none';
  if (emptyEl) emptyEl.style.display = overdue.length === 0 ? 'block' : 'none';

  if (overdue.length === 0) { listEl.innerHTML = ''; return; }

  var html = '';
  overdue.forEach(function(t){
    var today = new Date(todayISO + 'T12:00:00');
    var due = new Date(t.date + 'T12:00:00');
    var daysAgo = Math.round((today - due) / 86400000);
    var agoLabel = daysAgo === 1 ? 'yesterday' : daysAgo + ' days ago';
    var priorityMap = {'1':'!','2':'!!','3':'!!!'};
    var prioLabel = t.priority ? ' <span style="color:#e74c3c;font-size:0.8rem">' + (priorityMap[t.priority] || '') + '</span>' : '';
    html += '<div style="background:#fdf0f0;border:1px solid #e74c3c;border-radius:10px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px">'
      + '<input type="checkbox" onchange="toggleInboxTaskDone(\'' + escapeHTML(t.id) + '\',this.checked)" style="width:18px;height:18px;cursor:pointer;flex-shrink:0">'
      + '<div style="flex:1">'
      + '<span style="font-weight:600">' + escapeHTML(t.title || '') + '</span>' + prioLabel
      + ' <span style="color:#c0392b;font-size:0.82rem">· due ' + escapeHTML(agoLabel) + '</span>'
      + '</div>'
      + '<button class="small-btn" onclick="deleteOverdueTask(\'' + escapeHTML(t.id) + '\')" style="flex-shrink:0">Delete</button>'
      + '</div>';
  });
  listEl.innerHTML = html;
}

/* Delete a task from the overdue list */
function deleteOverdueTask(id){
  var tasks = getTasks().filter(function(t){ return String(t.id) !== String(id); });
  setTasks(tasks);
  renderInboxOverdueTasks();
  updateInboxBadge();
  try { renderInboxWidget(); } catch(_){}
}
window.deleteOverdueTask = deleteOverdueTask;


/* Render inbox preview widget on the Today dashboard */
function renderInboxWidget(){
  const container = document.getElementById('inboxWidgetList');
  if (!container) return;

  const todayStr = getTodayISO();

  // Get tasks for today
  const tasks = getTasks().filter(function(t){ return t.date && normalizeDate(t.date) === todayStr; });
  // Get reminders for today
  const allRems = getReminders();
  const todayReminders = allRems[todayStr] || [];

  if (tasks.length === 0 && todayReminders.length === 0) {
    container.innerHTML = '<p class="inbox-widget-empty">🎉 Nothing scheduled for today!</p>';
    return;
  }

  var html = '';

  // Render tasks
  tasks.forEach(function(t){
    var checked = t.done ? 'checked' : '';
    var doneClass = t.done ? ' done' : '';
    var timePart = t.time ? ' <span class="item-meta">[' + escapeHTML(t.time) + ']</span>' : '';
    var priorityMap = {'1':'!','2':'!!','3':'!!!'};
    var prioLabel = t.priority ? ' <span style="color:#e74c3c;font-size:0.78rem">' + (priorityMap[t.priority] || '') + '</span>' : '';
    html += '<div class="inbox-widget-item task-item">'
      + '<input type="checkbox" ' + checked + ' onchange="toggleInboxWidgetTaskDone(\'' + escapeHTML(t.id) + '\',this.checked)">'
      + '<div class="item-content">'
      + '<span class="item-title' + doneClass + '">✅ ' + escapeHTML(t.title || '') + '</span>' + timePart + prioLabel
      + '</div></div>';
  });

  // Render reminders
  todayReminders.forEach(function(r, idx){
    var checked = r.done ? 'checked' : '';
    var doneClass = r.done ? ' done' : '';
    var timePart = r.time ? ' <span class="item-meta">[' + escapeHTML(r.time) + ']</span>' : '';
    html += '<div class="inbox-widget-item reminder-item">'
      + '<input type="checkbox" ' + checked + ' onchange="toggleInboxWidgetReminderDone(\'' + escapeHTML(todayStr) + '\',' + idx + ',this.checked)">'
      + '<div class="item-content">'
      + '<span class="item-title' + doneClass + '">🔔 ' + escapeHTML(r.text || r.title || '') + '</span>' + timePart
      + '</div></div>';
  });

  container.innerHTML = html;
}
window.renderInboxWidget = renderInboxWidget;

/* Toggle task done state from inbox widget on dashboard */
function toggleInboxWidgetTaskDone(taskId, done){
  const tasks = getTasks();
  for (var i = 0; i < tasks.length; i++){
    if (tasks[i] && String(tasks[i].id) === String(taskId)){
      tasks[i].done = !!done;
      break;
    }
  }
  setTasks(tasks);
  renderInboxWidget();
  renderInboxDailyItems();
  renderInboxOverdueTasks();
  updateInboxBadge();
  updateCompletionRing();
  if (typeof window.dailyViewRefresh === 'function') try { window.dailyViewRefresh(); } catch(_){}
  if (typeof loadTasks === 'function') try { loadTasks(); } catch(_){}
}
window.toggleInboxWidgetTaskDone = toggleInboxWidgetTaskDone;

/* Toggle reminder done state from inbox widget on dashboard */
function toggleInboxWidgetReminderDone(dateKey, index, done){
  const r = getReminders();
  if (r[dateKey] && r[dateKey][index]){
    r[dateKey][index].done = !!done;
    setReminders(r);
  }
  renderInboxWidget();
  renderInboxDailyItems();
  updateInboxBadge();
  updateCompletionRing();
  if (typeof window.dailyViewRefresh === 'function') try { window.dailyViewRefresh(); } catch(_){}
  if (typeof showReminders === 'function' && typeof selectedDay !== 'undefined') try { showReminders(selectedDay); } catch(_){}
}
window.toggleInboxWidgetReminderDone = toggleInboxWidgetReminderDone;

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
  renderInboxOverdueTasks();
  renderInboxDailyItems();
  try { renderInboxWidget(); } catch(_){}
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
  try { renderInboxWidget(); } catch(_){}
  updateInboxBadge();
  updateCompletionRing();
  // Re-render daily view and reminder bar if visible
  if (typeof window.dailyViewRefresh === 'function') try { window.dailyViewRefresh(); } catch(_){}
  if (typeof showReminders === 'function' && typeof selectedDay !== 'undefined') try { showReminders(selectedDay); } catch(_){}
}
window.toggleInboxReminderDone = toggleInboxReminderDone;

/* Render unsorted inbox items */
function renderInbox(){
  renderInboxOverdueTasks();
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
    var typeLabel = '';
    if (item.type === 'event') typeLabel = '<span style="background:#4a90e2;color:#fff;padding:1px 6px;border-radius:10px;font-size:0.75rem;margin-left:4px">📅 Event</span>';
    else if (item.type === 'task') typeLabel = '<span style="background:#27ae60;color:#fff;padding:1px 6px;border-radius:10px;font-size:0.75rem;margin-left:4px">✅ Task</span>';
    else if (item.type === 'reminder') typeLabel = '<span style="background:#e67e22;color:#fff;padding:1px 6px;border-radius:10px;font-size:0.75rem;margin-left:4px">🔔 Reminder</span>';

    var actionButtons = '';
    if (item.type) {
      /* Type is already known — show domain assignment buttons */
      actionButtons =
        '<button onclick="sortInboxItemToDomain('+i+',\'personal\')" style="border:1px solid #9b59b6;background:#f3e8fa;border-radius:16px;padding:4px 12px;cursor:pointer;font-size:0.82rem">👤 Personal</button>'
        +'<button onclick="sortInboxItemToDomain('+i+',\'home\')" style="border:1px solid #27ae60;background:#e8f8ef;border-radius:16px;padding:4px 12px;cursor:pointer;font-size:0.82rem">🏡 Home</button>'
        +'<button onclick="sortInboxItemToDomain('+i+',\'work\')" style="border:1px solid #4a90e2;background:#e8f2fe;border-radius:16px;padding:4px 12px;cursor:pointer;font-size:0.82rem">💼 Work</button>';
    } else {
      /* Type is unknown — show type selection buttons */
      actionButtons =
        '<button onclick="sortInboxItem('+i+',\'event\')" style="border:1px solid #4a90e2;background:#e8f2fe;border-radius:16px;padding:4px 12px;cursor:pointer;font-size:0.82rem">\uD83D\uDCC5 Event</button>'
        +'<button onclick="sortInboxItem('+i+',\'task\')" style="border:1px solid #27ae60;background:#e8f8ef;border-radius:16px;padding:4px 12px;cursor:pointer;font-size:0.82rem">\u2705 Task</button>'
        +'<button onclick="sortInboxItem('+i+',\'reminder\')" style="border:1px solid #e67e22;background:#fef5e8;border-radius:16px;padding:4px 12px;cursor:pointer;font-size:0.82rem">\uD83D\uDD14 Reminder</button>';
    }
    actionButtons += '<button onclick="deleteInboxItem('+i+')" style="border:1px solid #e74c3c;background:#fde8e8;border-radius:16px;padding:4px 12px;cursor:pointer;font-size:0.82rem">\u274C Delete</button>';

    var headerLabel = item.type ? ' <span style="font-size:0.82rem;color:#666">Choose domain:</span>' : '';

    return '<div style="background:#fff;border:1px solid #e6e6e6;border-radius:10px;padding:12px 14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">'
      +'<div style="margin-bottom:6px"><b>'+escapeHTML(item.title)+'</b>'+typeLabel+datePart+timePart+catPart+'</div>'
      +headerLabel
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">'
      +actionButtons
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
    var ev={ id:id, title:item.title, date:item.date||new Date().toISOString().slice(0,10), time:item.time||'', endTime:item.endTime||'', location:item.location||'', emoji:item.emoji||'', category:item.category||'event', repeat:'none', repeatUntil:'', preBuffer:0, postBuffer:0 };
    if (item.advancedSpecs && item.advancedSpecs.length) ev.advancedSpecs = item.advancedSpecs;
    evs.push(ev);
    setEvents(evs);
    showUndoToast('\uD83D\uDCC5 Sorted as Event!');
  } else if(kind==='reminder'){
    const dateKey=item.date||new Date().toISOString().slice(0,10);
    const rems=getReminders();
    if(!rems[dateKey]) rems[dateKey]=[];
    rems[dateKey].push({ text:item.title, time:item.time||'', notify:'none', emoji:item.emoji||'' });
    setReminders(rems);
    showUndoToast('\uD83D\uDD14 Sorted as Reminder!');
  } else {
    const tasks=getTasks();
    tasks.push({ id:generateTaskId(), title:item.title, category:item.category||'', done:false, date:item.date||'', time:item.time||'', priority:item.priority||'2', emoji:item.emoji||'' });
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

/* Sort an inbox item that already has a type into a specific domain */
function sortInboxItemToDomain(index, domain) {
  var inbox = getInbox();
  if (index < 0 || index >= inbox.length) return;
  var item = inbox[index];
  var kind = item.type || 'event';
  inbox.splice(index, 1);
  setInbox(inbox);

  if (kind === 'event') {
    var evs = getEvents();
    var id = evs.length ? Math.max.apply(null, evs.map(function(e) { return e.id; })) + 1 : 1;
    var ev = { id: id, title: item.title, date: item.date || new Date().toISOString().slice(0, 10), time: item.time || '', startTime: item.time || '', endTime: item.endTime || '', location: item.location || '', emoji: item.emoji || '', category: domain, domain: domain, repeat: 'none', repeatUntil: '', preBuffer: 0, postBuffer: 0 };
    if (item.advancedSpecs && item.advancedSpecs.length) ev.advancedSpecs = item.advancedSpecs;
    evs.push(ev);
    setEvents(evs);
    showUndoToast('\uD83D\uDCC5 Event added to ' + (DOMAIN_META[domain] ? DOMAIN_META[domain].label : domain) + '!');
  } else if (kind === 'reminder') {
    var dateKey = item.date || new Date().toISOString().slice(0, 10);
    var rems = getReminders();
    if (!rems[dateKey]) rems[dateKey] = [];
    rems[dateKey].push({ text: item.title, time: item.time || '', notify: 'none', domain: domain, emoji: item.emoji || '' });
    setReminders(rems);
    showUndoToast('\uD83D\uDD14 Reminder added to ' + (DOMAIN_META[domain] ? DOMAIN_META[domain].label : domain) + '!');
  } else {
    var tasks = getTasks();
    tasks.push({ id: generateTaskId(), title: item.title, category: domain, domain: domain, done: false, date: item.date || '', time: item.time || '', priority: item.priority || '2', emoji: item.emoji || '' });
    setTasks(tasks);
    showUndoToast('\u2705 Task added to ' + (DOMAIN_META[domain] ? DOMAIN_META[domain].label : domain) + '!');
  }

  updateInboxBadge(); renderInbox();
  try { generateCalendar(); } catch(_) {}
  try { if (selectedDay) showReminders(selectedDay); } catch(_) {}
  try { renderEvents(); } catch(_) {}
  try { loadTasks(); } catch(_) {}
  refreshVisibleDomainPages();
}
window.sortInboxItemToDomain = sortInboxItemToDomain;

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
  deleteEvent=function(id, occurrenceDate){
    const item=getEvents().find(function(e){ return e.id===id; });
    if(!item){ origDE(id); return; }
    const isRepeating = item.repeat && item.repeat !== 'none';

    if(occurrenceDate && isRepeating){
      // Ask user: delete just this occurrence, or the whole series
      const deleteAll=confirm('This is a repeating event.\n\nOK = Delete all events in the series\nCancel = Delete just this occurrence');
      if(deleteAll){
        if(!confirm('Delete all events in the series "' + (item.title||'') + '"?')) return;
        haptic.delete();
        setEvents(getEvents().filter(function(e){ return e.id!==id; }));
        renderEvents(); generateCalendar(); if(selectedDay) showReminders(selectedDay);
        pushUndo({ label:'Event series "'+item.title+'" deleted.', undo:function(){ const cur=getEvents(); cur.push(item); setEvents(cur); } });
      } else {
        // Mark this single occurrence as skipped
        haptic.delete();
        const evs=getEvents(); const idx=evs.findIndex(function(e){ return e.id===id; });
        if(idx!==-1){
          if(!evs[idx].repeatExceptions) evs[idx].repeatExceptions={};
          evs[idx].repeatExceptions[occurrenceDate]={_skipped:true};
          const capturedBefore=Object.assign({},evs[idx]);
          const capturedOccDate=occurrenceDate;
          setEvents(evs); renderEvents(); generateCalendar(); if(selectedDay) showReminders(selectedDay);
          pushUndo({ label:'Removed occurrence of "'+item.title+'" on '+occurrenceDate+'.', undo:function(){
            const cur=getEvents(); const ci=cur.findIndex(function(e){ return e.id===capturedBefore.id; });
            if(ci!==-1){ if(cur[ci].repeatExceptions) delete cur[ci].repeatExceptions[capturedOccDate]; setEvents(cur); renderEvents(); generateCalendar(); if(selectedDay) showReminders(selectedDay); }
          }});
        }
      }
      return;
    }

    if(!confirm('Delete this event?')) return;
    haptic.delete();
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
    haptic.delete();
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
    haptic.delete();
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
    var msg = enabled ? 'Briefing set for '+bt+' daily.' : 'Morning briefing disabled.';
    // Inform users about limitations unless Notification Trigger API is available
    if(enabled && _isIOSPWA() && typeof TimestampTrigger === 'undefined'){
      msg += ' Note: on iOS, the app must be open at the scheduled time to deliver the notification.';
    }
    if(statusEl) statusEl.textContent=msg;
  });
  scheduleMorningBriefing();
}

/* Detect iOS standalone PWA mode */
function _isIOSPWA(){
  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  return isIOS && isStandalone;
}

var BRIEFING_CATCHUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

function _fireMorningBriefing(){
  try{
    var ts=new Date().toISOString().slice(0,10);
    var evCount=getExpandedEvents(ts,ts).length;
    var tkCount=getTasks().filter(function(t){ return !t.done&&normalizeDate(t.date)===ts; }).length;
    var body=evCount+' event'+(evCount!==1?'s':'')+', '+tkCount+' task'+(tkCount!==1?'s':'')+' today';
    if('Notification' in window&&Notification.permission==='granted'){
      navigator.serviceWorker.getRegistration().then(function(reg){
        if(reg&&reg.showNotification) reg.showNotification('\u2600\uFE0F Good morning! TimeScape',{body:body,tag:'morning-briefing'});
        else try{ new Notification('\u2600\uFE0F Good morning! TimeScape',{body:body}); }catch(_){}
      }).catch(function(){ try{ new Notification('\u2600\uFE0F Good morning! TimeScape',{body:body}); }catch(_){} });
    }
  }catch(_){}
}

function scheduleMorningBriefing(){
  if(localStorage.getItem('morningBriefingEnabled')!=='1') return;
  var bt=localStorage.getItem('morningBriefingTime')||'08:00';
  var parts=bt.split(':'); var hh=parseInt(parts[0],10)||8; var mm=parseInt(parts[1],10)||0;
  var now4=new Date();
  var target=new Date(now4.getFullYear(),now4.getMonth(),now4.getDate(),hh,mm,0,0);

  // If we just resumed past the target time (e.g. iOS PWA waking up), fire immediately
  var firedKey = 'morningBriefingFired_' + now4.toISOString().slice(0,10);
  if(target<=now4){
    var diff = now4.getTime()-target.getTime();
    // Fire if within a 30-minute window and not already fired today
    if(diff < BRIEFING_CATCHUP_WINDOW_MS && !localStorage.getItem(firedKey)){
      localStorage.setItem(firedKey, '1');
      _fireMorningBriefing();
    }
    target.setDate(target.getDate()+1);
  }
  var delay=target.getTime()-now4.getTime();
  if(delay>0x7FFFFFFF) return; // setTimeout max delay (~24.8 days); will reschedule on next app open
  clearTimeout(window._morningBriefingTimer);
  window._morningBriefingTimer=setTimeout(function(){
    var todayKey = 'morningBriefingFired_' + new Date().toISOString().slice(0,10);
    if(!localStorage.getItem(todayKey)){
      localStorage.setItem(todayKey, '1');
      _fireMorningBriefing();
    }
    setTimeout(scheduleMorningBriefing,60000);
  },delay);
}

// Re-check morning briefing when app resumes from background (important for iOS PWA)
document.addEventListener('visibilitychange', function(){
  if(!document.hidden) scheduleMorningBriefing();
});

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

var _REPEAT_LABELS = { daily: 'daily', '2day': 'every 2 days', weekday: 'every weekday', weekly: 'weekly', monthly: 'monthly', none: 'once' };
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
  html += '<div class="progress-ring-wrap" style="flex-shrink:0">';
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
  var totalCost = list.reduce(function(sum, i) { return sum + (parseFloat(i.price) || 0); }, 0);

  var el = document.createElement('div');
  el.className = 'grocery-section';

  // Header
  var header = document.createElement('div');
  header.className = 'grocery-header';
  var headerTitle = document.createElement('div');
  headerTitle.className = 'grocery-header-title';
  headerTitle.innerHTML = '🛒 Grocery List <span style="font-size:0.75rem;color:#888;font-weight:400;margin-left:4px">(' + pendingCount + ' pending' + (inCartCount ? ', ' + inCartCount + ' in cart' : '') + (totalCost > 0 ? ' · $' + totalCost.toFixed(2) : '') + ')</span>';
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
    '<input type="number" id="groceryPriceInput" class="grocery-price-input" placeholder="Price" min="0" step="0.01" style="width:60px;font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px" />',
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
      var priceSpan = document.createElement('span');
      priceSpan.className = 'grocery-item-price';
      priceSpan.style.cssText = 'font-size:0.78rem;color:#27ae60;font-weight:600;margin-left:4px;white-space:nowrap';
      priceSpan.textContent = item.price ? '$' + parseFloat(item.price).toFixed(2) : '';
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
      if (item.price) li.appendChild(priceSpan);
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
  var priceInp = document.getElementById('groceryPriceInput');
  var secSel = document.getElementById('grocerySectionSel');

  function doAdd() {
    var text = inp ? inp.value.trim() : '';
    if (!text) { if (inp) { inp.focus(); inp.style.outline = '2px solid #e74c3c'; setTimeout(function(){ inp.style.outline=''; }, 1200); } return; }
    var qty = qtyInp ? qtyInp.value.trim() : '';
    var price = priceInp ? parseFloat(priceInp.value) || 0 : 0;
    var section = secSel ? secSel.value : '';
    var list = getGroceryList();
    list.push({ id: nextGroceryId(), text: text, qty: qty, price: price, section: section, inCart: false, added: getTodayISO() });
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
        '<option value="weekday">Every weekday</option>' +
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
        [['daily','Daily'],['2day','Every 2 days'],['weekday','Every weekday'],['weekly','Weekly'],['monthly','Monthly'],['none','Once']].forEach(function(p) {
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

/* ── Helper: build personal widget card ─────────────────────── */
function buildPWCard(id, emoji, title, renderBody) {
  var card = document.createElement('div');
  card.className = 'pw-card';
  card.id = id;

  var header = document.createElement('div');
  header.className = 'pw-header';
  var headerTitle = document.createElement('div');
  headerTitle.className = 'pw-header-title';
  headerTitle.textContent = emoji + ' ' + title;
  header.appendChild(headerTitle);

  var body = document.createElement('div');
  body.className = 'pw-body';

  renderBody(body);

  card.appendChild(header);
  card.appendChild(body);

  return card;
}

/* ══════════════════════════════════════════════════════════════
   1. MEAL TRACKER
   ══════════════════════════════════════════════════════════════ */

function getPersonalMeals() {
  var data = safeParseStorage('personalMeals', {});
  var today = getTodayISO();
  if (!data[today]) data[today] = { breakfast: { name: '', calories: 0, time: '' }, lunch: { name: '', calories: 0, time: '' }, dinner: { name: '', calories: 0, time: '' }, snacks: { name: '', calories: 0, time: '' } };
  return data;
}
function setPersonalMeals(data) { localStorage.setItem('personalMeals', JSON.stringify(data)); }
function getCalorieGoal() { return parseInt(localStorage.getItem('personalCalorieGoal') || '2000', 10); }
function setCalorieGoal(v) { localStorage.setItem('personalCalorieGoal', String(v)); }

/* Track which day of the week is selected in the meal tracker */
var _mealSelectedDate = null;
var _MEAL_DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var _MEAL_DAY_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* Return an array of { iso, label, dayName } for each day (Sun–Sat) of the current week */
function getMealWeekDays() {
  var today = new Date();
  var dow = today.getDay(); // 0=Sun
  var sun = new Date(today);
  sun.setDate(today.getDate() - dow);
  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(sun);
    d.setDate(sun.getDate() + i);
    days.push({
      iso: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()),
      label: pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()),
      dayName: _MEAL_DAY_SHORT[i]
    });
  }
  return days;
}

/* Check if a day's meals are filled (all 4 meal names non-empty) */
function isMealDayComplete(allMeals, dateISO) {
  var day = allMeals[dateISO];
  if (!day) return 'empty';
  var keys = ['breakfast', 'lunch', 'dinner', 'snacks'];
  var filled = 0;
  keys.forEach(function(k) {
    if (day[k] && day[k].name && day[k].name.trim()) filled++;
  });
  if (filled === 4) return 'complete';
  if (filled > 0) return 'partial';
  return 'empty';
}

/* Ensure an "Eating Tracker" bucket exists in the personal domain; returns its id */
/* ensureEatingTrackerBucket and syncMealWeekTasks removed —
   meal data lives in personalMeals localStorage and is displayed
   within the Meal Planner widget itself, not as separate bucket tasks. */

function renderMealTracker() {
  var section = document.getElementById('personalMealSection');
  if (!section) return;
  section.innerHTML = '';

  var today = getTodayISO();
  var weekDays = getMealWeekDays();

  /* Default selected date to today */
  if (!_mealSelectedDate || !weekDays.some(function(wd) { return wd.iso === _mealSelectedDate; })) {
    _mealSelectedDate = today;
  }

  var selectedDate = _mealSelectedDate;
  var allMeals = getPersonalMeals();

  /* Use in-memory defaults for selected date if no meals saved yet (lazy — only persists on save) */
  if (!allMeals[selectedDate]) {
    allMeals[selectedDate] = { breakfast: { name: '', calories: 0, time: '' }, lunch: { name: '', calories: 0, time: '' }, dinner: { name: '', calories: 0, time: '' }, snacks: { name: '', calories: 0, time: '' } };
  }

  var meals = allMeals[selectedDate];
  var goal = getCalorieGoal();
  var mealTypes = [
    { key: 'breakfast', icon: '🌅', label: 'Breakfast' },
    { key: 'lunch', icon: '☀️', label: 'Lunch' },
    { key: 'dinner', icon: '🌙', label: 'Dinner' },
    { key: 'snacks', icon: '🍎', label: 'Snacks' }
  ];

  var card = buildPWCard('mealCard', '🍽️', 'Meal Tracker', function(body) {
    /* ── Day selector ── */
    var daySelector = document.createElement('div');
    daySelector.className = 'meal-day-selector';
    weekDays.forEach(function(wd) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'meal-day-btn' + (wd.iso === selectedDate ? ' active' : '');
      btn.innerHTML = '<span>' + wd.dayName + '</span><span class="meal-day-label">' + wd.label + '</span>';
      if (wd.iso === today) btn.title = 'Today';
      btn.addEventListener('click', function() {
        _mealSelectedDate = wd.iso;
        renderMealTracker();
      });
      daySelector.appendChild(btn);
    });
    body.appendChild(daySelector);

    /* ── Meal rows for selected day ── */
    var totalCal = 0;
    mealTypes.forEach(function(mt) {
      var m = meals[mt.key] || { name: '', calories: 0 };
      totalCal += (parseInt(m.calories, 10) || 0);

      var row = document.createElement('div');
      row.className = 'meal-row';
      row.innerHTML =
        '<div class="meal-icon">' + mt.icon + '</div>' +
        '<div class="meal-info">' +
          '<div class="meal-label">' + mt.label + (m.time ? ' <span style="font-size:0.78rem;color:#888">@ ' + escapeHTML(m.time) + '</span>' : '') + '</div>' +
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
          '<input type="time" class="meal-time-input" placeholder="Time" value="' + escapeHTML(m.time || '') + '" title="When will you eat?" />' +
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

    /* ── Weekly completion status dots ── */
    var weekStatus = document.createElement('div');
    weekStatus.className = 'meal-week-status';
    var completeCount = 0;
    weekDays.forEach(function(wd) {
      var status = isMealDayComplete(allMeals, wd.iso);
      if (status === 'complete') completeCount++;
      var dot = document.createElement('span');
      dot.className = 'meal-week-dot ' + status;
      dot.title = wd.dayName + ': ' + status;
      weekStatus.appendChild(dot);
    });
    var weekLabel = document.createElement('span');
    weekLabel.className = 'meal-week-label';
    weekLabel.textContent = completeCount + '/7 days planned';
    weekStatus.appendChild(weekLabel);
    body.appendChild(weekStatus);

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
        var timeInput = panel.querySelector('.meal-time-input');
        var data = getPersonalMeals();
        if (!data[selectedDate]) data[selectedDate] = {};
        data[selectedDate][key] = { name: nameInput.value.trim(), calories: parseInt(calInput.value, 10) || 0, time: timeInput ? timeInput.value : '' };
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

function getPersonalSleep() {
  var data = safeParseStorage('personalSleep', { targetBedtime: '22:30', targetWake: '07:00', log: {} });
  /* Migrate: ensure per-day schedule exists */
  if (!data.schedule) {
    var defaultBed = data.targetBedtime || '22:30';
    var defaultWake = data.targetWake || '07:00';
    data.schedule = {};
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(day) {
      data.schedule[day] = { bedtime: defaultBed, wake: defaultWake };
    });
    setPersonalSleep(data);
  }
  return data;
}
function setPersonalSleep(data) { localStorage.setItem('personalSleep', JSON.stringify(data)); }

/* Get the planned wake time for a given date ISO string */
function getSleepWakeForDate(dateISO) {
  var sleep = getPersonalSleep();
  if (!sleep.schedule) return sleep.targetWake || '07:00';
  var d = new Date(dateISO + 'T12:00:00');
  var dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  var daySchedule = sleep.schedule[dayName];
  return daySchedule ? daySchedule.wake : (sleep.targetWake || '07:00');
}

/* Get the planned bedtime for a given date ISO string */
function getSleepBedtimeForDate(dateISO) {
  var sleep = getPersonalSleep();
  if (!sleep.schedule) return sleep.targetBedtime || '22:30';
  var d = new Date(dateISO + 'T12:00:00');
  var dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  var daySchedule = sleep.schedule[dayName];
  return daySchedule ? daySchedule.bedtime : (sleep.targetBedtime || '22:30');
}

function renderSleepTracker() {
  var section = document.getElementById('personalSleepSection');
  if (!section) return;
  section.innerHTML = '';

  var sleep = getPersonalSleep();
  var today = getTodayISO();
  var todayLog = sleep.log[today];
  var DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  var card = buildPWCard('sleepCard', '😴', 'Bedtime Manager', function(body) {
    /* ── Per-day schedule grid ── */
    var info = document.createElement('div');
    info.style.cssText = 'font-size:0.82rem;color:#888;margin-bottom:8px';
    info.textContent = 'Plan when you sleep and wake up each day of the week.';
    body.appendChild(info);

    var scheduleGrid = document.createElement('div');
    scheduleGrid.style.cssText = 'display:grid;grid-template-columns:auto 1fr 1fr;gap:4px 8px;align-items:center;margin-bottom:12px';

    /* Header row */
    var hDay = document.createElement('div');
    hDay.style.cssText = 'font-weight:600;font-size:0.8rem;color:#888';
    hDay.textContent = 'Day';
    var hBed = document.createElement('div');
    hBed.style.cssText = 'font-weight:600;font-size:0.8rem;color:#888;text-align:center';
    hBed.textContent = '🌙 Bedtime';
    var hWake = document.createElement('div');
    hWake.style.cssText = 'font-weight:600;font-size:0.8rem;color:#888;text-align:center';
    hWake.textContent = '☀️ Wake';
    scheduleGrid.appendChild(hDay);
    scheduleGrid.appendChild(hBed);
    scheduleGrid.appendChild(hWake);

    DAYS.forEach(function(day) {
      var ds = sleep.schedule[day] || { bedtime: '22:30', wake: '07:00' };
      var dayLabel = document.createElement('div');
      dayLabel.style.cssText = 'font-size:0.85rem;font-weight:600';
      dayLabel.textContent = day;

      var bedInput = document.createElement('input');
      bedInput.type = 'time';
      bedInput.value = ds.bedtime || '22:30';
      bedInput.style.cssText = 'font-size:0.8rem;border:1px solid #ddd;border-radius:6px;padding:3px 4px;width:100%';
      bedInput.dataset.day = day;
      bedInput.dataset.field = 'bedtime';

      var wakeInput = document.createElement('input');
      wakeInput.type = 'time';
      wakeInput.value = ds.wake || '07:00';
      wakeInput.style.cssText = 'font-size:0.8rem;border:1px solid #ddd;border-radius:6px;padding:3px 4px;width:100%';
      wakeInput.dataset.day = day;
      wakeInput.dataset.field = 'wake';

      scheduleGrid.appendChild(dayLabel);
      scheduleGrid.appendChild(bedInput);
      scheduleGrid.appendChild(wakeInput);

      function onScheduleChange() {
        var s = getPersonalSleep();
        if (!s.schedule) s.schedule = {};
        if (!s.schedule[day]) s.schedule[day] = {};
        s.schedule[day].bedtime = bedInput.value;
        s.schedule[day].wake = wakeInput.value;
        setPersonalSleep(s);
        /* Update routine phase times to match */
        syncRoutineTimesFromSleep();
      }
      bedInput.addEventListener('change', onScheduleChange);
      wakeInput.addEventListener('change', onScheduleChange);
    });
    body.appendChild(scheduleGrid);

    // Status (today's logged sleep)
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
      var todayDay = DAYS[new Date().getDay()];
      var todaySched = sleep.schedule[todayDay] || { bedtime: '22:30', wake: '07:00' };
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
    var todayDayForLog = DAYS[new Date().getDay()];
    var todaySchedForLog = sleep.schedule[todayDayForLog] || { bedtime: '22:30', wake: '07:00' };
    var logPanel = document.createElement('div');
    logPanel.className = 'meal-edit-panel';
    logPanel.id = 'sleepLogPanel';
    logPanel.style.display = 'none';
    logPanel.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<label style="font-size:0.85rem">Bed:</label>' +
        '<input type="time" id="sleepActualBed" value="' + (todaySchedForLog.bedtime || '22:30') + '" />' +
        '<label style="font-size:0.85rem">Wake:</label>' +
        '<input type="time" id="sleepActualWake" value="' + (todaySchedForLog.wake || '07:00') + '" />' +
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

/**
 * Sync routine phase start times based on bedtime manager schedule.
 * Morning routine start time = wake time for the current day.
 * Evening routine end time = bedtime for the current day, so
 * evening start time = bedtime - total evening routine duration.
 * This is stored as a per-day override in the routine data.
 */
function syncRoutineTimesFromSleep() {
  var sleep = getPersonalSleep();
  if (!sleep.schedule) return;
  var routines = getPersonalRoutines();

  /* Build per-day routine time overrides */
  if (!routines.sleepScheduleTimes) routines.sleepScheduleTimes = {};
  var DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  /* Calculate total duration of each routine period */
  var morningDur = 0, eveningDur = 0;
  var DEFAULT_STEP_DURATION = 10; /* minutes per step when duration not specified */
  if (routines.phases && Array.isArray(routines.phases)) {
    routines.phases.forEach(function(phase) {
      var dur = (phase.steps || []).reduce(function(s, st) { return s + (parseInt(st.duration, 10) || DEFAULT_STEP_DURATION); }, 0);
      if (phase.id === 'morning') morningDur = dur;
      if (phase.id === 'evening') eveningDur = dur;
    });
  } else {
    (routines.morning || []).forEach(function() { morningDur += DEFAULT_STEP_DURATION; });
    (routines.evening || []).forEach(function() { eveningDur += DEFAULT_STEP_DURATION; });
  }

  DAYS.forEach(function(day) {
    var sched = sleep.schedule[day];
    if (!sched) return;
    routines.sleepScheduleTimes[day] = {
      morningStart: sched.wake || '07:00',
      eveningEnd: sched.bedtime || '22:30'
    };
    /* Compute evening start: bedtime minus total evening routine duration */
    if (sched.bedtime && eveningDur > 0) {
      var bedMin = timeToMinutes(sched.bedtime);
      var evStart = bedMin - eveningDur;
      if (evStart < 0) evStart += 1440;
      var evH = Math.floor(evStart / 60);
      var evM = evStart % 60;
      routines.sleepScheduleTimes[day].eveningStart = pad2(evH) + ':' + pad2(evM);
    }
  });

  setPersonalRoutines(routines);
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
    if (gym.log[ds] && gym.log[ds].length > 0) {
      streak++;
    } else if (i === 0) {
      // Today not logged yet — skip but continue checking previous days
    } else {
      break;
    }
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

  // Get today's tasks for the task picker
  var allTasks = getTasks();
  var todayTasks = allTasks.filter(function(t) { return t.date === today && !t.done; });
  // Filter out tasks already added as priorities
  var existingTexts = items.map(function(i) { return i.text; });
  var availableTasks = todayTasks.filter(function(t) {
    return existingTexts.indexOf(t.title) < 0;
  });

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

      // Task picker: select from today's assigned tasks
      if (availableTasks.length > 0) {
        var pickerLabel = document.createElement('div');
        pickerLabel.style.cssText = 'font-size:0.78rem;color:#888;margin-top:8px;margin-bottom:4px';
        pickerLabel.textContent = '— or pick from today\'s tasks —';
        body.appendChild(pickerLabel);

        var pickerWrap = document.createElement('div');
        pickerWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px';
        availableTasks.forEach(function(task) {
          var taskBtn = document.createElement('button');
          taskBtn.style.cssText = 'text-align:left;background:#f0f6ff;border:1px solid #d0dff5;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:6px';
          var pmap = {'1':'!','2':'!!','3':'!!!'};
          var priLabel = task.priority ? ' <span style="color:#e74c3c;font-weight:600">' + (pmap[task.priority] || '') + '</span>' : '';
          taskBtn.innerHTML = '<span>＋</span><span>' + escapeHTML(task.title) + priLabel + '</span>';
          taskBtn.addEventListener('click', function() {
            var f = getPersonalFocus();
            if (!f[today]) f[today] = [];
            if (f[today].length >= 3) { alert('Maximum 3 priorities per day'); return; }
            f[today].push({ text: task.title, done: false, taskId: task.id });
            setPersonalFocus(f);
            renderDailyFocus();
          });
          pickerWrap.appendChild(taskBtn);
        });
        body.appendChild(pickerWrap);
      }
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
          // Remap log indices: remove deleted index, shift higher indices down
          var l = getPersonalRoutineLog();
          if (l[today] && l[today][period]) {
            l[today][period] = l[today][period]
              .filter(function(i) { return i !== idx; })
              .map(function(i) { return i > idx ? i - 1 : i; });
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
   8. BUDGET WIDGET
   ══════════════════════════════════════════════════════════════ */

function getPersonalBudget() { return safeParseStorage('personalBudget', { bills: [], oneTimeExpenses: [], categories: [], payPeriods: [] }); }
function setPersonalBudget(data) { localStorage.setItem('personalBudget', JSON.stringify(data)); }

function calcBudgetJobIncome() {
  /* Calculate total job earnings from the last 30 days */
  var jobs = safeParseStorage('jobs', []);
  if (!jobs.length) return 0;
  var events = safeParseStorage('events', []);
  /* Count job events in the last 30 days */
  var now = new Date();
  var thirtyAgo = new Date(now);
  thirtyAgo.setDate(now.getDate() - 30);
  var startISO = thirtyAgo.toISOString().slice(0, 10);
  var endISO   = now.toISOString().slice(0, 10);
  var expanded;
  if (typeof getExpandedEvents === 'function') {
    try { expanded = getExpandedEvents(startISO, endISO); } catch (_) { expanded = null; }
  }
  if (!expanded) expanded = events;

  var byId = {}, byName = {};
  jobs.forEach(function(j) {
    if (j.id) byId[j.id] = j;
    if (j.name) byName[j.name.toLowerCase()] = j;
  });

  var total = 0;
  expanded.forEach(function(ev) {
    var d = normalizeDate(ev.date);
    if (!d || d < startISO || d > endISO) return;
    var cat = (ev.category || '').toLowerCase();
    var isJob = (cat === 'job') || ((cat === 'work' || ev.domain === 'work') && ev.bucketId != null);
    if (!isJob) return;
    var job = null;
    if (ev.jobId) job = byId[ev.jobId];
    if (!job && ev.bucketId != null) job = byId[ev.bucketId];
    if (!job && ev.jobName) job = byName[(ev.jobName || '').toLowerCase()];
    if (!job && ev.jobRate)  job = { rate: ev.jobRate, unit: ev.jobUnit || 'hour' };
    if (!job) return;
    var rate = parseFloat(job.rate || 0);
    var unit = job.unit || 'hour';
    if (unit === 'job' || unit === 'day') {
      total += rate;
    } else if (unit === 'hour' && ev.time && ev.endTime) {
      var sm = timeToMinutes(ev.time), em = timeToMinutes(ev.endTime);
      if (em <= sm) em += 1440;
      total += rate * ((em - sm) / 60);
    }
  });
  return total;
}

function calcBudgetGrocerySpending() {
  var list = safeParseStorage('groceryList', []);
  return list.reduce(function(sum, item) { return sum + (parseFloat(item.price) || 0); }, 0);
}

/** Create a reminder in the Budget bucket for a recurring bill */
function createBudgetBillReminder(bill) {
  if (!bill.dueDate) return;
  var reminders = getReminders();
  var dateKey = bill.dueDate;
  if (!reminders[dateKey]) reminders[dateKey] = [];
  // Check if reminder already exists for this bill
  var reminderText = 'Bill due: ' + bill.name + ' ($' + (parseFloat(bill.amount) || 0).toFixed(2) + ')';
  var exists = reminders[dateKey].some(function(r) {
    return r.bucketId === 'budget' && r.text === reminderText;
  });
  if (!exists) {
    reminders[dateKey].push({
      text: reminderText,
      time: '09:00',
      notify: '1d',
      domain: 'personal',
      bucketId: 'budget'
    });
    setReminders(reminders);
  }
}

function calcNextPayDate(startDate, type) {
  var start = new Date(startDate + 'T00:00:00');
  if (isNaN(start.getTime())) return new Date();
  var now = new Date();
  var next = new Date(start);

  if (type === 'weekly') {
    while (next < now) next.setDate(next.getDate() + 7);
  } else if (type === 'biweekly') {
    while (next < now) next.setDate(next.getDate() + 14);
  } else if (type === 'semimonthly') {
    // Pay on the start day and start day + ~15 days (1st/15th pattern)
    var day = start.getDate();
    var altDay = day <= 15 ? day + 15 : day - 15;
    if (altDay < 1) altDay = 1;
    if (altDay > 28) altDay = 28;
    var d1 = Math.min(day, altDay);
    var d2 = Math.max(day, altDay);
    next = new Date(now.getFullYear(), now.getMonth(), d1);
    if (next < now) {
      next = new Date(now.getFullYear(), now.getMonth(), d2);
    }
    if (next < now) {
      next = new Date(now.getFullYear(), now.getMonth() + 1, d1);
    }
  } else {
    while (next < now) next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function renderBudgetWidget() {
  var section = document.getElementById('personalBudgetSection');
  if (!section) return;
  section.innerHTML = '';

  var budget = getPersonalBudget();
  var bills = budget.bills || [];
  var oneTimeExpenses = budget.oneTimeExpenses || [];
  var budgetCategories = budget.categories || [];

  var card = buildPWCard('budgetCard', '💰', 'Budget', function(body) {
    /* ── Income ── */
    var incomeSection = document.createElement('div');
    incomeSection.style.cssText = 'margin-bottom:10px';
    var jobIncome = calcBudgetJobIncome();
    incomeSection.innerHTML =
      '<div style="font-weight:600;font-size:0.88rem;margin-bottom:4px">📈 Income (last 30 days)</div>' +
      '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.85rem">' +
        '<span>Job earnings</span>' +
        '<span style="color:#27ae60;font-weight:600">$' + jobIncome.toFixed(2) + '</span>' +
      '</div>';
    body.appendChild(incomeSection);

    /* ── Budget Categories ── */
    var catSection = document.createElement('div');
    catSection.style.cssText = 'margin-bottom:10px';
    catSection.innerHTML = '<div style="font-weight:600;font-size:0.88rem;margin-bottom:4px">🏷️ Budget Categories</div>';

    if (budgetCategories.length) {
      budgetCategories.forEach(function(cat, ci) {
        var catRow = document.createElement('div');
        catRow.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin:2px 4px 2px 0;padding:3px 8px;background:' + (cat.color || '#e8f0fe') + '22;border:1px solid ' + (cat.color || '#4a90e2') + '55;border-radius:12px;font-size:0.78rem;color:' + (cat.color || '#4a90e2');
        catRow.innerHTML = escapeHTML(cat.name) +
          '<button class="budget-cat-del" data-ci="' + ci + '" style="background:none;border:none;cursor:pointer;font-size:0.7rem;color:#aaa;padding:0 2px" title="Remove">✕</button>';
        catSection.appendChild(catRow);
      });
    }

    var addCatRow = document.createElement('div');
    addCatRow.style.cssText = 'display:flex;gap:4px;align-items:center;margin-top:4px;flex-wrap:wrap';
    addCatRow.innerHTML =
      '<input type="text" id="budgetCatName" placeholder="Category name" style="flex:1;min-width:80px;font-size:0.78rem;border:1px solid #ddd;border-radius:8px;padding:4px 6px" />' +
      '<input type="color" id="budgetCatColor" value="#4a90e2" style="width:28px;height:28px;border:none;border-radius:4px;padding:0;cursor:pointer" />' +
      '<button id="budgetAddCatBtn" style="background:#4a90e2;color:#fff;border:none;border-radius:8px;padding:4px 8px;font-size:0.78rem;cursor:pointer;white-space:nowrap">＋ Add</button>';
    catSection.appendChild(addCatRow);
    body.appendChild(catSection);

    /* ── Recurring bills ── */
    var billsSection = document.createElement('div');
    billsSection.style.cssText = 'margin-bottom:10px';
    var billsTotal = bills.reduce(function(s, b) { return s + (parseFloat(b.amount) || 0); }, 0);
    billsSection.innerHTML =
      '<div style="font-weight:600;font-size:0.88rem;margin-bottom:4px">📋 Recurring Bills' +
        '<span style="font-weight:400;font-size:0.78rem;color:#888;margin-left:6px">$' + billsTotal.toFixed(2) + '/mo</span>' +
      '</div>';

    bills.forEach(function(bill, bi) {
      var bRow = document.createElement('div');
      bRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:0.85rem;border-bottom:1px solid #f5f5f5';
      var catTag = bill.category ? '<span style="font-size:0.72rem;color:#888;margin-left:4px">(' + escapeHTML(bill.category) + ')</span>' : '';
      var dateTag = bill.dueDate ? '<span style="font-size:0.72rem;color:#4a90e2;margin-left:4px">📅 ' + escapeHTML(bill.dueDate) + '</span>' : '';
      var repeatTag = (bill.repeat && bill.repeat !== 'monthly') ? '<span style="font-size:0.72rem;color:#9b59b6;margin-left:4px">🔄 ' + escapeHTML(bill.repeat) + '</span>' : '';
      bRow.innerHTML =
        '<span>' + escapeHTML(bill.name) + catTag + dateTag + repeatTag + '</span>' +
        '<span style="display:flex;align-items:center;gap:6px">' +
          '<span style="color:#e74c3c;font-weight:600">$' + (parseFloat(bill.amount) || 0).toFixed(2) + '</span>' +
          '<button class="budget-bill-del" data-bi="' + bi + '" style="background:none;border:none;cursor:pointer;font-size:0.8rem;color:#aaa;padding:2px" title="Remove">✕</button>' +
        '</span>';
      billsSection.appendChild(bRow);
    });

    /* Add bill form with date and category */
    var addBillRow = document.createElement('div');
    addBillRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap';
    var catOptions = '<option value="">Category</option>';
    budgetCategories.forEach(function(c) { catOptions += '<option value="' + escapeHTML(c.name) + '">' + escapeHTML(c.name) + '</option>'; });
    addBillRow.innerHTML =
      '<input type="text" id="budgetBillName" placeholder="Bill name" style="flex:1;min-width:100px;font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px" />' +
      '<input type="number" id="budgetBillAmount" placeholder="Amount" min="0" step="0.01" style="width:80px;font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px" />' +
      '<input type="date" id="budgetBillDate" title="Due date (creates a reminder)" style="font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px" />' +
      '<select id="budgetBillCategory" style="font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px">' + catOptions + '</select>' +
      '<select id="budgetBillRepeat" style="font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px">' +
        '<option value="monthly" selected>Monthly</option>' +
        '<option value="weekly">Weekly</option>' +
        '<option value="biweekly">Biweekly</option>' +
        '<option value="quarterly">Quarterly</option>' +
        '<option value="yearly">Yearly</option>' +
      '</select>' +
      '<button id="budgetAddBillBtn" style="background:#4a90e2;color:#fff;border:none;border-radius:8px;padding:6px 10px;font-size:0.82rem;cursor:pointer;white-space:nowrap">＋ Add</button>';
    billsSection.appendChild(addBillRow);
    body.appendChild(billsSection);

    /* ── Pay Periods ── */
    var payPeriods = budget.payPeriods || [];
    var ppSection = document.createElement('div');
    ppSection.style.cssText = 'margin-bottom:10px';
    ppSection.innerHTML = '<div style="font-weight:600;font-size:0.88rem;margin-bottom:4px">💰 Pay Periods</div>';

    payPeriods.forEach(function(pp, pi) {
      var ppRow = document.createElement('div');
      ppRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:0.85rem;border-bottom:1px solid #f5f5f5';
      var nextPay = pp.startDate ? calcNextPayDate(pp.startDate, pp.type) : null;
      var nextPayStr = nextPay ? nextPay.toISOString().slice(0, 10) : '';
      var jobTag = pp.jobName ? '<span style="font-size:0.72rem;color:#888;margin-left:4px">(' + escapeHTML(pp.jobName) + ')</span>' : '';
      var nextTag = nextPayStr ? '<span style="font-size:0.72rem;color:#27ae60;margin-left:4px">Next: ' + escapeHTML(nextPayStr) + '</span>' : '';
      ppRow.innerHTML =
        '<span>' + escapeHTML(pp.type || 'monthly') + jobTag +
          '<span style="font-size:0.72rem;color:#4a90e2;margin-left:4px">📅 ' + escapeHTML(pp.startDate || '') + '</span>' +
          nextTag +
        '</span>' +
        '<span style="display:flex;align-items:center;gap:6px">' +
          '<span style="color:#27ae60;font-weight:600">$' + (parseFloat(pp.amount) || 0).toFixed(2) + '</span>' +
          '<button class="budget-pp-del" data-pi="' + pi + '" style="background:none;border:none;cursor:pointer;font-size:0.8rem;color:#aaa;padding:2px" title="Remove">✕</button>' +
        '</span>';
      ppSection.appendChild(ppRow);
    });

    var addPPToggle = document.createElement('button');
    addPPToggle.id = 'budgetAddPayPeriodToggle';
    addPPToggle.style.cssText = 'background:none;border:1px dashed #ccc;border-radius:8px;padding:4px 10px;font-size:0.78rem;cursor:pointer;color:#888;margin-top:4px;width:100%';
    addPPToggle.textContent = '＋ Add Pay Period';
    ppSection.appendChild(addPPToggle);

    var addPPForm = document.createElement('div');
    addPPForm.id = 'budgetAddPPForm';
    addPPForm.style.cssText = 'display:none;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap';
    var workBuckets = typeof getBuckets === 'function' ? getBuckets('work') : [];
    var jobOptions = '<option value="">Job (optional)</option>';
    workBuckets.forEach(function(wb) { jobOptions += '<option value="' + escapeHTML(wb.name) + '">' + (wb.emoji ? escapeHTML(wb.emoji) + ' ' : '') + escapeHTML(wb.name) + '</option>'; });
    addPPForm.innerHTML =
      '<select id="budgetPPType" style="font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px">' +
        '<option value="weekly">Weekly</option>' +
        '<option value="biweekly" selected>Biweekly</option>' +
        '<option value="semimonthly">Semi-monthly</option>' +
        '<option value="monthly">Monthly</option>' +
      '</select>' +
      '<input type="date" id="budgetPPStart" title="First pay date" style="font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px" />' +
      '<input type="number" id="budgetPPAmount" placeholder="Amount" min="0" step="0.01" style="width:80px;font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px" />' +
      '<select id="budgetPPJob" style="font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px">' + jobOptions + '</select>' +
      '<button id="budgetAddPayPeriodBtn" style="background:#27ae60;color:#fff;border:none;border-radius:8px;padding:6px 10px;font-size:0.82rem;cursor:pointer;white-space:nowrap">＋ Add</button>';
    ppSection.appendChild(addPPForm);
    body.appendChild(ppSection);

    /* ── One-Time Expenses ── */
    var oneTimeSection = document.createElement('div');
    oneTimeSection.style.cssText = 'margin-bottom:10px';
    var oneTimeTotal = oneTimeExpenses.reduce(function(s, e) { return s + (parseFloat(e.amount) || 0); }, 0);
    oneTimeSection.innerHTML =
      '<div style="font-weight:600;font-size:0.88rem;margin-bottom:4px">🧾 One-Time Expenses' +
        '<span style="font-weight:400;font-size:0.78rem;color:#888;margin-left:6px">$' + oneTimeTotal.toFixed(2) + '</span>' +
      '</div>';

    oneTimeExpenses.forEach(function(exp, ei) {
      var eRow = document.createElement('div');
      eRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:0.85rem;border-bottom:1px solid #f5f5f5';
      var catTag = exp.category ? '<span style="font-size:0.72rem;color:#888;margin-left:4px">(' + escapeHTML(exp.category) + ')</span>' : '';
      var dateTag = exp.date ? '<span style="font-size:0.72rem;color:#888;margin-left:4px">📅 ' + escapeHTML(exp.date) + '</span>' : '';
      eRow.innerHTML =
        '<span>' + escapeHTML(exp.name) + catTag + dateTag + '</span>' +
        '<span style="display:flex;align-items:center;gap:6px">' +
          '<span style="color:#e74c3c;font-weight:600">$' + (parseFloat(exp.amount) || 0).toFixed(2) + '</span>' +
          '<button class="budget-onetime-del" data-ei="' + ei + '" style="background:none;border:none;cursor:pointer;font-size:0.8rem;color:#aaa;padding:2px" title="Remove">✕</button>' +
        '</span>';
      oneTimeSection.appendChild(eRow);
    });

    /* Add one-time expense form */
    var addOneTimeRow = document.createElement('div');
    addOneTimeRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap';
    addOneTimeRow.innerHTML =
      '<input type="text" id="budgetOneTimeName" placeholder="Expense name" style="flex:1;min-width:100px;font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px" />' +
      '<input type="number" id="budgetOneTimeAmount" placeholder="Amount" min="0" step="0.01" style="width:80px;font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px" />' +
      '<input type="date" id="budgetOneTimeDate" style="font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px" />' +
      '<select id="budgetOneTimeCategory" style="font-size:0.82rem;border:1px solid #ddd;border-radius:8px;padding:6px 8px">' + catOptions + '</select>' +
      '<button id="budgetAddOneTimeBtn" style="background:#9b59b6;color:#fff;border:none;border-radius:8px;padding:6px 10px;font-size:0.82rem;cursor:pointer;white-space:nowrap">＋ Add</button>';
    oneTimeSection.appendChild(addOneTimeRow);
    body.appendChild(oneTimeSection);

    /* ── Expenses Summary ── */
    var grocerySpend = calcBudgetGrocerySpending();
    var expenseSection = document.createElement('div');
    expenseSection.style.cssText = 'margin-bottom:10px';
    var totalExpenses = billsTotal + oneTimeTotal + grocerySpend;
    expenseSection.innerHTML =
      '<div style="font-weight:600;font-size:0.88rem;margin-bottom:4px">💸 Expenses</div>' +
      (grocerySpend > 0 ?
        '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.85rem">' +
          '<span>Groceries</span>' +
          '<span style="color:#e74c3c;font-weight:600">$' + grocerySpend.toFixed(2) + '</span>' +
        '</div>' : '') +
      (billsTotal > 0 ?
        '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.85rem">' +
          '<span>Recurring bills</span>' +
          '<span style="color:#e74c3c;font-weight:600">$' + billsTotal.toFixed(2) + '</span>' +
        '</div>' : '') +
      (oneTimeTotal > 0 ?
        '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.85rem">' +
          '<span>One-time expenses</span>' +
          '<span style="color:#e74c3c;font-weight:600">$' + oneTimeTotal.toFixed(2) + '</span>' +
        '</div>' : '') +
      '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:0.88rem;font-weight:700;border-top:1px solid #eee;margin-top:4px">' +
        '<span>Total expenses</span>' +
        '<span style="color:#e74c3c">$' + totalExpenses.toFixed(2) + '</span>' +
      '</div>';
    body.appendChild(expenseSection);

    /* ── Net / summary ── */
    var net = jobIncome - totalExpenses;
    var netColor = net >= 0 ? '#27ae60' : '#e74c3c';
    var summaryEl = document.createElement('div');
    summaryEl.style.cssText = 'display:flex;justify-content:space-between;padding:8px;background:#f8f9fa;border-radius:8px;font-size:0.95rem;font-weight:700';
    summaryEl.innerHTML =
      '<span>Net (30 days)</span>' +
      '<span style="color:' + netColor + '">' + (net >= 0 ? '+' : '') + '$' + net.toFixed(2) + '</span>';
    body.appendChild(summaryEl);

    /* ── Analytics Button ── */
    var analyticsBtn = document.createElement('button');
    analyticsBtn.style.cssText = 'margin-top:10px;width:100%;background:#27ae60;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:0.88rem;cursor:pointer;font-weight:600';
    analyticsBtn.textContent = '📊 View Budget Analytics';
    analyticsBtn.addEventListener('click', function() {
      openBudgetAnalyticsModal(budget, jobIncome, billsTotal, oneTimeTotal, grocerySpend);
    });
    body.appendChild(analyticsBtn);

    /* ── Wire events ── */
    body.querySelectorAll('.budget-bill-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.dataset.bi, 10);
        var b = getPersonalBudget();
        b.bills.splice(idx, 1);
        setPersonalBudget(b);
        renderBudgetWidget();
      });
    });

    body.querySelectorAll('.budget-onetime-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.dataset.ei, 10);
        var b = getPersonalBudget();
        if (!b.oneTimeExpenses) b.oneTimeExpenses = [];
        b.oneTimeExpenses.splice(idx, 1);
        setPersonalBudget(b);
        renderBudgetWidget();
      });
    });

    body.querySelectorAll('.budget-cat-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.dataset.ci, 10);
        var b = getPersonalBudget();
        if (!b.categories) b.categories = [];
        b.categories.splice(idx, 1);
        setPersonalBudget(b);
        renderBudgetWidget();
      });
    });

    /* Wire add category */
    var addCatBtn = body.querySelector('#budgetAddCatBtn');
    if (addCatBtn) addCatBtn.addEventListener('click', function() {
      var nameInput = document.getElementById('budgetCatName');
      var colorInput = document.getElementById('budgetCatColor');
      var name = nameInput ? nameInput.value.trim() : '';
      if (!name) return;
      var b = getPersonalBudget();
      if (!b.categories) b.categories = [];
      if (b.categories.some(function(c) { return c.name.toLowerCase() === name.toLowerCase(); })) {
        alert('Category "' + name + '" already exists.');
        return;
      }
      b.categories.push({ name: name, color: colorInput ? colorInput.value : '#4a90e2' });
      setPersonalBudget(b);
      renderBudgetWidget();
    });

    /* Wire add bill */
    var addBillBtn = body.querySelector('#budgetAddBillBtn');
    if (addBillBtn) addBillBtn.addEventListener('click', function() {
      var nameInput = document.getElementById('budgetBillName');
      var amtInput = document.getElementById('budgetBillAmount');
      var dateInput = document.getElementById('budgetBillDate');
      var catInput = document.getElementById('budgetBillCategory');
      var repeatInput = document.getElementById('budgetBillRepeat');
      var name = nameInput ? nameInput.value.trim() : '';
      var amount = amtInput ? parseFloat(amtInput.value) || 0 : 0;
      var dueDate = dateInput ? dateInput.value : '';
      var category = catInput ? catInput.value : '';
      var repeat = repeatInput ? repeatInput.value : 'monthly';
      if (!name) return;
      var b = getPersonalBudget();
      var newBill = { name: name, amount: amount };
      if (dueDate) newBill.dueDate = dueDate;
      if (category) newBill.category = category;
      newBill.repeat = repeat;
      b.bills.push(newBill);
      setPersonalBudget(b);
      // Create a reminder for the bill if a date was provided
      if (dueDate) {
        createBudgetBillReminder(newBill);
      }
      renderBudgetWidget();
    });

    /* Wire add one-time expense */
    var addOneTimeBtn = body.querySelector('#budgetAddOneTimeBtn');
    if (addOneTimeBtn) addOneTimeBtn.addEventListener('click', function() {
      var nameInput = document.getElementById('budgetOneTimeName');
      var amtInput = document.getElementById('budgetOneTimeAmount');
      var dateInput = document.getElementById('budgetOneTimeDate');
      var catInput = document.getElementById('budgetOneTimeCategory');
      var name = nameInput ? nameInput.value.trim() : '';
      var amount = amtInput ? parseFloat(amtInput.value) || 0 : 0;
      var date = dateInput ? dateInput.value : '';
      var category = catInput ? catInput.value : '';
      if (!name) return;
      var b = getPersonalBudget();
      if (!b.oneTimeExpenses) b.oneTimeExpenses = [];
      var newExpense = { name: name, amount: amount };
      if (date) newExpense.date = date;
      if (category) newExpense.category = category;
      b.oneTimeExpenses.push(newExpense);
      setPersonalBudget(b);
      renderBudgetWidget();
    });

    /* Wire pay period delete */
    body.querySelectorAll('.budget-pp-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.dataset.pi, 10);
        var b = getPersonalBudget();
        if (!b.payPeriods) b.payPeriods = [];
        b.payPeriods.splice(idx, 1);
        setPersonalBudget(b);
        renderBudgetWidget();
      });
    });

    /* Wire add pay period toggle */
    var ppToggle = body.querySelector('#budgetAddPayPeriodToggle');
    if (ppToggle) ppToggle.addEventListener('click', function() {
      var form = document.getElementById('budgetAddPPForm');
      if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    });

    /* Wire add pay period */
    var addPPBtn = body.querySelector('#budgetAddPayPeriodBtn');
    if (addPPBtn) addPPBtn.addEventListener('click', function() {
      var typeInput = document.getElementById('budgetPPType');
      var startInput = document.getElementById('budgetPPStart');
      var amtInput = document.getElementById('budgetPPAmount');
      var jobInput = document.getElementById('budgetPPJob');
      var type = typeInput ? typeInput.value : 'biweekly';
      var startDate = startInput ? startInput.value : '';
      var amount = amtInput ? parseFloat(amtInput.value) || 0 : 0;
      var jobName = jobInput ? jobInput.value : '';
      if (!startDate || !amount) return;
      var b = getPersonalBudget();
      if (!b.payPeriods) b.payPeriods = [];
      var newPP = { type: type, startDate: startDate, amount: amount };
      if (jobName) newPP.jobName = jobName;
      b.payPeriods.push(newPP);
      setPersonalBudget(b);
      renderBudgetWidget();
    });
  }, 'pw_budget');

  section.appendChild(card);
}

/** Opens a small modal showing budget analytics */
function openBudgetAnalyticsModal(budget, jobIncome, billsTotal, oneTimeTotal, grocerySpend) {
  var existing = document.getElementById('budgetAnalyticsModal');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'budgetAnalyticsModal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:2000;display:flex;align-items:center;justify-content:center';

  var modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:14px;max-width:480px;width:90%;max-height:80vh;overflow-y:auto;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.2)';

  // Header
  var hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px';
  hdr.innerHTML = '<div style="font-weight:700;font-size:1.1rem">📊 Budget Analytics</div>';
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:none;border:none;font-size:1.2rem;cursor:pointer;color:#888';
  closeBtn.addEventListener('click', function() { overlay.remove(); });
  hdr.appendChild(closeBtn);
  modal.appendChild(hdr);

  var totalExpenses = billsTotal + oneTimeTotal + grocerySpend;
  var net = jobIncome - totalExpenses;

  // Overview
  var overview = document.createElement('div');
  overview.style.cssText = 'margin-bottom:16px';
  overview.innerHTML =
    '<div style="font-weight:600;font-size:0.92rem;margin-bottom:8px">Overview</div>' +
    '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.88rem"><span>💰 Total Income</span><span style="color:#27ae60;font-weight:600">$' + jobIncome.toFixed(2) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.88rem"><span>💸 Total Expenses</span><span style="color:#e74c3c;font-weight:600">$' + totalExpenses.toFixed(2) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.95rem;font-weight:700;border-top:2px solid #eee;margin-top:4px"><span>Net</span><span style="color:' + (net >= 0 ? '#27ae60' : '#e74c3c') + '">' + (net >= 0 ? '+' : '') + '$' + net.toFixed(2) + '</span></div>';
  modal.appendChild(overview);

  // Savings Rate
  var savingsSection = document.createElement('div');
  savingsSection.style.cssText = 'margin-bottom:16px;padding:10px;background:#f8f9fa;border-radius:8px';
  var savingsRate = jobIncome > 0 ? ((jobIncome - totalExpenses) / jobIncome * 100) : 0;
  var savingsColor = savingsRate >= 20 ? '#27ae60' : savingsRate >= 0 ? '#f39c12' : '#e74c3c';
  var savingsLabel = savingsRate >= 20 ? '✅ Great' : savingsRate >= 0 ? '⚠️ Fair' : '🔴 Negative';
  savingsSection.innerHTML =
    '<div style="font-weight:600;font-size:0.92rem;margin-bottom:6px">💹 Savings Rate</div>' +
    '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="font-size:1.4rem;font-weight:700;color:' + savingsColor + '">' + savingsRate.toFixed(1) + '%</span>' +
      '<span style="font-size:0.82rem;color:#888">' + savingsLabel + '</span>' +
    '</div>';
  modal.appendChild(savingsSection);

  // Monthly Cash Flow Chart
  var cashFlowSection = document.createElement('div');
  cashFlowSection.style.cssText = 'margin-bottom:16px';
  var maxVal = Math.max(jobIncome, totalExpenses, 1);
  var incomeBarW = Math.round((jobIncome / maxVal) * 100);
  var expenseBarW = Math.round((totalExpenses / maxVal) * 100);
  cashFlowSection.innerHTML =
    '<div style="font-weight:600;font-size:0.92rem;margin-bottom:8px">📊 Monthly Cash Flow</div>' +
    '<div style="margin-bottom:6px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:0.82rem"><span style="width:60px">Income</span>' +
        '<div style="flex:1;background:#eee;border-radius:4px;height:18px;overflow:hidden"><div style="width:' + incomeBarW + '%;height:100%;background:#27ae60;border-radius:4px;transition:width 0.3s"></div></div>' +
        '<span style="font-size:0.78rem;color:#27ae60;min-width:70px;text-align:right">$' + jobIncome.toFixed(2) + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;font-size:0.82rem"><span style="width:60px">Expenses</span>' +
        '<div style="flex:1;background:#eee;border-radius:4px;height:18px;overflow:hidden"><div style="width:' + expenseBarW + '%;height:100%;background:#e74c3c;border-radius:4px;transition:width 0.3s"></div></div>' +
        '<span style="font-size:0.78rem;color:#e74c3c;min-width:70px;text-align:right">$' + totalExpenses.toFixed(2) + '</span>' +
      '</div>' +
    '</div>';
  modal.appendChild(cashFlowSection);

  // Expense breakdown bar
  var breakdownTitle = document.createElement('div');
  breakdownTitle.style.cssText = 'font-weight:600;font-size:0.92rem;margin-bottom:8px';
  breakdownTitle.textContent = 'Expense Breakdown';
  modal.appendChild(breakdownTitle);

  var segments = [];
  if (billsTotal > 0) segments.push({ label: 'Recurring Bills', amount: billsTotal, color: '#e74c3c' });
  if (oneTimeTotal > 0) segments.push({ label: 'One-Time', amount: oneTimeTotal, color: '#9b59b6' });
  if (grocerySpend > 0) segments.push({ label: 'Groceries', amount: grocerySpend, color: '#f39c12' });

  if (segments.length > 0 && totalExpenses > 0) {
    var barWrap = document.createElement('div');
    barWrap.style.cssText = 'display:flex;height:22px;border-radius:6px;overflow:hidden;margin-bottom:8px';
    segments.forEach(function(seg) {
      var pct = (seg.amount / totalExpenses) * 100;
      var segEl = document.createElement('div');
      segEl.style.cssText = 'height:100%;background:' + seg.color;
      segEl.style.width = pct + '%';
      segEl.title = seg.label + ': $' + seg.amount.toFixed(2) + ' (' + Math.round(pct) + '%)';
      barWrap.appendChild(segEl);
    });
    modal.appendChild(barWrap);

    // Legend
    var legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px';
    segments.forEach(function(seg) {
      var pct = Math.round((seg.amount / totalExpenses) * 100);
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:0.82rem';
      item.innerHTML = '<span style="width:10px;height:10px;border-radius:50%;background:' + seg.color + ';display:inline-block"></span>' +
        escapeHTML(seg.label) + ' $' + seg.amount.toFixed(2) + ' (' + pct + '%)';
      legend.appendChild(item);
    });
    modal.appendChild(legend);
  } else {
    var noData = document.createElement('div');
    noData.style.cssText = 'color:#aaa;font-size:0.85rem;padding:8px 0';
    noData.textContent = 'No expenses to analyze.';
    modal.appendChild(noData);
  }

  // Category breakdown with colored bars
  var bills = budget.bills || [];
  var oneTimeExpenses = budget.oneTimeExpenses || [];
  var allExpenseItems = [];
  bills.forEach(function(b) { allExpenseItems.push({ category: b.category || 'Uncategorized', amount: parseFloat(b.amount) || 0 }); });
  oneTimeExpenses.forEach(function(e) { allExpenseItems.push({ category: e.category || 'Uncategorized', amount: parseFloat(e.amount) || 0 }); });

  if (allExpenseItems.length > 0) {
    var catTitle = document.createElement('div');
    catTitle.style.cssText = 'font-weight:600;font-size:0.92rem;margin-bottom:8px;margin-top:8px;border-top:1px solid #eee;padding-top:12px';
    catTitle.textContent = 'By Category';
    modal.appendChild(catTitle);

    var catTotals = {};
    allExpenseItems.forEach(function(item) {
      var cat = item.category || 'Uncategorized';
      catTotals[cat] = (catTotals[cat] || 0) + item.amount;
    });

    var catColors = ['#e74c3c', '#3498db', '#27ae60', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#2ecc71'];
    var catKeys = Object.keys(catTotals).sort(function(a, b) { return catTotals[b] - catTotals[a]; });
    var catMax = catKeys.length > 0 ? catTotals[catKeys[0]] : 1;
    catKeys.forEach(function(cat, i) {
      var row = document.createElement('div');
      row.style.cssText = 'padding:4px 0;font-size:0.85rem';
      var color = catColors[i % catColors.length];
      var catPct = totalExpenses > 0 ? Math.round((catTotals[cat] / totalExpenses) * 100) : 0;
      var barW = catMax > 0 ? Math.round((catTotals[cat] / catMax) * 100) : 0;
      row.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">' +
          '<div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:' + color + ';display:inline-block"></span>' + escapeHTML(cat) + '</div>' +
          '<span style="font-weight:600">$' + catTotals[cat].toFixed(2) + ' <span style="font-weight:400;color:#888;font-size:0.78rem">(' + catPct + '%)</span></span>' +
        '</div>' +
        '<div style="background:#eee;border-radius:3px;height:8px;overflow:hidden"><div style="width:' + barW + '%;height:100%;background:' + color + ';border-radius:3px"></div></div>';
      modal.appendChild(row);
    });
  }

  // Bills Timeline (next 30 days)
  var timelineBills = (budget.bills || []).filter(function(b) { return b.dueDate; });
  if (timelineBills.length > 0) {
    var tlTitle = document.createElement('div');
    tlTitle.style.cssText = 'font-weight:600;font-size:0.92rem;margin-bottom:8px;margin-top:12px;border-top:1px solid #eee;padding-top:12px';
    tlTitle.textContent = '📅 Bills Timeline (Next 30 Days)';
    modal.appendChild(tlTitle);

    var now = new Date();
    var thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    var upcoming = [];
    timelineBills.forEach(function(bill) {
      var dueDate = new Date(bill.dueDate + 'T00:00:00');
      // For recurring bills, find the next occurrence
      var repeat = bill.repeat || 'monthly';
      var next = new Date(dueDate);
      if (repeat === 'weekly') {
        while (next < now) next.setDate(next.getDate() + 7);
      } else if (repeat === 'biweekly') {
        while (next < now) next.setDate(next.getDate() + 14);
      } else if (repeat === 'quarterly') {
        while (next < now) next.setMonth(next.getMonth() + 3);
      } else if (repeat === 'yearly') {
        while (next < now) next.setFullYear(next.getFullYear() + 1);
      } else {
        while (next < now) next.setMonth(next.getMonth() + 1);
      }
      if (next <= thirtyDays) {
        upcoming.push({ name: bill.name, date: next, amount: parseFloat(bill.amount) || 0 });
      }
    });
    upcoming.sort(function(a, b) { return a.date - b.date; });

    if (upcoming.length > 0) {
      upcoming.forEach(function(item) {
        var daysUntil = Math.ceil((item.date - now) / (24 * 60 * 60 * 1000));
        var urgency = daysUntil <= 3 ? '#e74c3c' : daysUntil <= 7 ? '#f39c12' : '#888';
        var tlRow = document.createElement('div');
        tlRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:0.82rem;border-bottom:1px solid #f5f5f5';
        tlRow.innerHTML =
          '<span>' + escapeHTML(item.name) + ' <span style="color:' + urgency + ';font-size:0.72rem">' + (daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : 'in ' + daysUntil + ' days') + '</span></span>' +
          '<span style="color:#e74c3c;font-weight:600">$' + item.amount.toFixed(2) + '</span>';
        modal.appendChild(tlRow);
      });
    } else {
      var noUpcoming = document.createElement('div');
      noUpcoming.style.cssText = 'color:#aaa;font-size:0.82rem;padding:4px 0';
      noUpcoming.textContent = 'No bills due in the next 30 days.';
      modal.appendChild(noUpcoming);
    }
  }

  // Annual Projection
  var annualSection = document.createElement('div');
  annualSection.style.cssText = 'margin-top:12px;border-top:1px solid #eee;padding-top:12px';
  var annualIncome = jobIncome * 12;
  var annualRecurring = billsTotal * 12;
  var annualOneTime = oneTimeTotal;
  var annualGrocery = grocerySpend * 12;
  var annualExpenses = annualRecurring + annualOneTime + annualGrocery;
  var annualNet = annualIncome - annualExpenses;
  annualSection.innerHTML =
    '<div style="font-weight:600;font-size:0.92rem;margin-bottom:8px">📈 Annual Projection</div>' +
    '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.82rem"><span>Projected Income (12 mo)</span><span style="color:#27ae60;font-weight:600">$' + annualIncome.toFixed(2) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.82rem"><span>Recurring Bills (12 mo)</span><span style="color:#e74c3c">$' + annualRecurring.toFixed(2) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.82rem"><span>Groceries (12 mo)</span><span style="color:#e74c3c">$' + annualGrocery.toFixed(2) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.82rem"><span>One-Time Expenses</span><span style="color:#e74c3c">$' + annualOneTime.toFixed(2) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:0.88rem;font-weight:700;border-top:1px solid #eee;margin-top:4px"><span>Net Annual</span><span style="color:' + (annualNet >= 0 ? '#27ae60' : '#e74c3c') + '">' + (annualNet >= 0 ? '+' : '') + '$' + annualNet.toFixed(2) + '</span></div>';
  modal.appendChild(annualSection);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

/* ══════════════════════════════════════════════════════════════
   PERSONAL PAGE RENDER ORCHESTRATOR
   ══════════════════════════════════════════════════════════════ */

function renderPersonalWidgets() {
  try { renderDailyFocus(); } catch(e) { console.warn('renderDailyFocus failed', e); }
  try { renderBudgetWidget(); } catch(e) { console.warn('renderBudgetWidget failed', e); }
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
      /* Repeat controls for the principal event */
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">' +
        '<div style="flex:1;min-width:130px"><label style="font-size:0.82rem;font-weight:600">Repeat</label>' +
        '<select id="calAddRepeat" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px">' +
          '<option value="none">None</option>' +
          '<option value="daily">Every day</option>' +
          '<option value="2day">Every 2 days</option>' +
          '<option value="weekday">Every weekday (Mon-Fri)</option>' +
          '<option value="weekly">Every week</option>' +
          '<option value="monthly">Every month</option>' +
          '<option value="custom">Custom interval</option>' +
          '<option value="weekday_ab">A/B weekday pattern</option>' +
        '</select></div>' +
        '<div style="flex:1;min-width:130px"><label style="font-size:0.82rem;font-weight:600">Until</label>' +
        '<input id="calAddRepeatUntil" type="date" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box;margin-top:2px" /></div>' +
      '</div>';
      /* Custom interval row (shown when repeat = custom) */
      html += '<div id="calAddCustomRow" style="display:none;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap">' +
        '<label style="font-size:0.82rem;font-weight:600;min-width:50px">Every</label>' +
        '<input id="calAddRepeatInterval" type="number" min="1" max="30" value="1" aria-label="Repeat interval number" style="width:70px;padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box" />' +
        '<select id="calAddRepeatUnit" aria-label="Repeat interval unit" style="padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box">' +
          '<option value="days">Days</option>' +
          '<option value="weeks">Weeks</option>' +
          '<option value="months">Months</option>' +
          '<option value="years">Years</option>' +
        '</select>' +
      '</div>';
      /* A/B weekday pattern row (shown when repeat = weekday_ab) */
      html += '<div id="calAddAbRow" style="display:none;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap">' +
        '<label style="font-size:0.82rem;font-weight:600;min-width:100px">Start template</label>' +
        '<select id="calAddAbWeek" aria-label="A/B week template" style="padding:6px 8px;border:1px solid #ddd;border-radius:8px;font-size:0.88rem;box-sizing:border-box">' +
          '<option value="a">A week (Mon/Wed/Fri)</option>' +
          '<option value="b">B week (Tue/Thu)</option>' +
        '</select>' +
        '<label style="display:flex;align-items:center;gap:4px;margin:0;cursor:pointer;font-size:0.82rem"><input type="checkbox" id="calAddAbSkipHolidays"> Skip holidays</label>' +
      '</div>';
      /* Advanced Item Specifications */
      html += '<details style="margin-top:4px;margin-bottom:8px">' +
        '<summary style="cursor:pointer;font-weight:600;font-size:0.82rem">Advanced Item Specifications</summary>' +
        '<p style="margin:4px 0;font-size:0.8em;color:#888">Add additional time &amp; repeat schedules for this event.</p>' +
        '<div id="calAddAdvSpecList"></div>' +
        '<button type="button" id="calAddAdvSpecBtn" class="small-btn" style="margin-top:4px;font-size:0.78rem">+ Add time / repeat schedule</button>' +
        '</details>';
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

    /* Wire principal repeat dropdown (event only) */
    var calRepeatSel = document.getElementById('calAddRepeat');
    if (calRepeatSel) {
      calRepeatSel.addEventListener('change', function() {
        var mode = calRepeatSel.value;
        var cr = document.getElementById('calAddCustomRow');
        var ar = document.getElementById('calAddAbRow');
        if (cr) cr.style.display = mode === 'custom' ? 'flex' : 'none';
        if (ar) ar.style.display = mode === 'weekday_ab' ? 'flex' : 'none';
      });
    }

    /* Wire advanced specs button (event only) */
    var calAdvSpecBtn = document.getElementById('calAddAdvSpecBtn');
    if (calAdvSpecBtn) {
      calAdvSpecBtn.addEventListener('click', function() {
        var list = document.getElementById('calAddAdvSpecList');
        if (list) list.appendChild(buildAdvSpecRow());
      });
    }

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
        /* Principal repeat */
        var inboxRepSel = document.getElementById('calAddRepeat');
        var inboxRepVal = inboxRepSel ? inboxRepSel.value : 'none';
        if (inboxRepVal && inboxRepVal !== 'none') {
          inboxItem.repeat = inboxRepVal;
          var inboxRU = document.getElementById('calAddRepeatUntil');
          if (inboxRU && inboxRU.value) inboxItem.repeatUntil = inboxRU.value;
          if (inboxRepVal === 'custom') {
            var inboxRI = document.getElementById('calAddRepeatInterval');
            var inboxRUnit = document.getElementById('calAddRepeatUnit');
            inboxItem.repeatInterval = inboxRI ? Math.max(1, Math.min(30, parseInt(inboxRI.value, 10) || 1)) : 1;
            inboxItem.repeatUnit = inboxRUnit ? inboxRUnit.value : 'days';
          }
          if (inboxRepVal === 'weekday_ab') {
            var inboxAbW = document.getElementById('calAddAbWeek');
            var inboxAbH = document.getElementById('calAddAbSkipHolidays');
            inboxItem.abWeek = inboxAbW ? inboxAbW.value : 'a';
            inboxItem.abSkipHolidays = inboxAbH ? inboxAbH.checked : false;
          }
        }
        var inboxAdvSpecs = readAdvancedSpecs('calAddAdvSpecList');
        if (inboxAdvSpecs.length) inboxItem.advancedSpecs = inboxAdvSpecs;
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
      /* Read principal repeat values */
      var repSel = document.getElementById('calAddRepeat');
      var repVal = repSel ? repSel.value : 'none';
      var repUntilInp = document.getElementById('calAddRepeatUntil');
      var repUntil = repUntilInp ? repUntilInp.value : '';
      var ev = { id: id, title: title, date: evDate, time: time, startTime: time, endTime: endTime, location: location, emoji: emoji, category: domain, domain: domain, repeat: repVal || 'none', repeatUntil: repUntil, preBuffer: 0, postBuffer: 0 };
      if (repVal === 'custom') {
        var riInp = document.getElementById('calAddRepeatInterval');
        var ruInp = document.getElementById('calAddRepeatUnit');
        ev.repeatInterval = riInp ? Math.max(1, Math.min(30, parseInt(riInp.value, 10) || 1)) : 1;
        ev.repeatUnit = ruInp ? ruInp.value : 'days';
      }
      if (repVal === 'weekday_ab') {
        var abWInp = document.getElementById('calAddAbWeek');
        var abHInp = document.getElementById('calAddAbSkipHolidays');
        ev.abWeek = abWInp ? abWInp.value : 'a';
        ev.abSkipHolidays = abHInp ? abHInp.checked : false;
      }
      if (bucketId !== undefined && !isNaN(bucketId)) ev.bucketId = bucketId;
      var calAdvSpecs = readAdvancedSpecs('calAddAdvSpecList');
      if (calAdvSpecs.length) ev.advancedSpecs = calAdvSpecs;
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

/* ----- Clipboard copy utility ----- */
function copyToClipboard(text, btn, successLabel) {
  successLabel = successLabel || '✅ Copied!';
  var original = btn.textContent;
  function onCopied() { btn.textContent = successLabel; setTimeout(function(){ btn.textContent = original; }, 2000); }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(onCopied).catch(function() {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); onCopied();
    });
  } else {
    var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); onCopied();
  }
}

/* ----- Siri Shortcuts / iOS Deep Links (Settings page) ----- */
function wireSiriShortcuts() {
  var container = document.getElementById('siriLinksList');
  if (!container) return;
  var base = location.origin + location.pathname;
  var links = [
    { emoji: '🏠', label: 'Open Today view',    hash: '#today' },
    { emoji: '🗓️', label: 'Open Calendar',      hash: '#calendar' },
    { emoji: '👤', label: 'Open Personal',       hash: '#personal' },
    { emoji: '🏡', label: 'Open Home',           hash: '#home' },
    { emoji: '💼', label: 'Open Work',           hash: '#work' },
    { emoji: '📥', label: 'Open Inbox',          hash: '#inbox' },
    { emoji: '⚙️', label: 'Open Settings',       hash: '#settings' }
  ];
  container.innerHTML = '';
  links.forEach(function(item) {
    var url = base + item.hash;
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;background:#f5f7fa;border-radius:8px;padding:8px 12px';
    var lbl = document.createElement('span');
    lbl.style.cssText = 'flex:1;font-size:0.88rem';
    lbl.textContent = item.emoji + ' ' + item.label;
    var urlSpan = document.createElement('code');
    urlSpan.style.cssText = 'font-size:0.78rem;color:#333;background:#e8eaf0;padding:2px 6px;border-radius:4px;word-break:break-all;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    urlSpan.title = url;
    urlSpan.textContent = url;
    var copyBtn = document.createElement('button');
    copyBtn.className = 'small-btn';
    copyBtn.style.cssText = 'flex-shrink:0;font-size:0.75rem';
    copyBtn.textContent = '📋 Copy';
    copyBtn.addEventListener('click', function() { copyToClipboard(url, copyBtn); });
    row.appendChild(lbl); row.appendChild(urlSpan); row.appendChild(copyBtn);
    container.appendChild(row);
  });

  /* --- JSON Import via URL section --- */
  var importSection = document.createElement('div');
  importSection.style.cssText = 'margin-top:16px;padding:12px;background:#f0f4ff;border:1px solid #c4d4f0;border-radius:10px';
  importSection.innerHTML =
    '<h4 style="margin:0 0 6px;font-size:0.95rem">📲 Import JSON via iOS Shortcut</h4>' +
    '<p style="margin:0 0 8px;font-size:0.85rem;color:#555;line-height:1.5">' +
      'Create an iOS Shortcut that reads a JSON file and opens this URL to import data automatically:' +
    '</p>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
      '<code id="importShortcutUrl" style="flex:1;font-size:0.78rem;color:#333;background:#e8eaf0;padding:4px 8px;border-radius:4px;word-break:break-all">' + base + '?importData=BASE64_ENCODED_JSON</code>' +
      '<button id="copyImportUrl" class="small-btn" style="flex-shrink:0;font-size:0.75rem">📋 Copy</button>' +
    '</div>' +
    '<details style="margin-top:6px">' +
      '<summary style="cursor:pointer;font-size:0.85rem;font-weight:600;color:#4a90e2">📖 How to set up the iOS Shortcut</summary>' +
      '<ol style="font-size:0.83rem;color:#444;line-height:1.8;padding-left:18px;margin:6px 0 0">' +
        '<li>Open the <strong>Shortcuts</strong> app on your iPhone</li>' +
        '<li>Create a new shortcut</li>' +
        '<li>Add <strong>"Get File"</strong> action — set to pick a <code>.json</code> file</li>' +
        '<li>Add <strong>"Base64 Encode"</strong> action on the file contents</li>' +
        '<li>Add <strong>"Text"</strong> action that combines: <code>' + base + '?importData=</code> with the Base64 output from the previous step</li>' +
        '<li>Add <strong>"Open URLs"</strong> action with the Text as input</li>' +
        '<li>Run the shortcut — your data will be imported automatically!</li>' +
      '</ol>' +
    '</details>';
  container.appendChild(importSection);

  var copyImportBtn = document.getElementById('copyImportUrl');
  if (copyImportBtn) {
    copyImportBtn.addEventListener('click', function() { copyToClipboard(base + '?importData=BASE64_ENCODED_JSON', copyImportBtn); });
  }
}

/* ----- Handle URL-based JSON import (for iOS Shortcuts) ----- */
function handleUrlImport() {
  var params = new URLSearchParams(window.location.search);
  var importB64 = params.get('importData');
  if (!importB64) return;

  try {
    var jsonStr = atob(importB64);
    var parsed = JSON.parse(jsonStr);
    var importData = parseImportPayload(parsed);
    var stats = applyImportData(importData, 'merge');
    if (stats) {
      var summary = summarizeImportResult(stats);
      console.info('URL import summary:', summary);
      showUndoToast('📲 Data imported successfully!');
    }
  } catch (err) {
    console.warn('URL import failed', err);
    alert('Import failed: ' + (err && err.message ? err.message : err));
  }

  /* Clean up the URL to remove the import parameter */
  if (window.history && window.history.replaceState) {
    var cleanUrl = window.location.origin + window.location.pathname + (window.location.hash || '#today');
    window.history.replaceState({}, '', cleanUrl);
  }
}

/* ----- First-run onboarding / Empty states ----- */
function wireFirstRunOnboarding() {
  var STORAGE_KEY = 'ts_onboarding_done';
  if (localStorage.getItem(STORAGE_KEY)) return;

  /* Show onboarding only when there's truly no data — read storage once */
  var events = getEvents(), tasks = getTasks(), reminders = getReminders();
  var hasData = events.length > 0 || tasks.length > 0 || Object.keys(reminders).length > 0;
  if (hasData) { localStorage.setItem(STORAGE_KEY, '1'); return; }

  /* Build modal */
  var overlay = document.createElement('div');
  overlay.id = 'onboardingOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:20000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';

  var panel = document.createElement('div');
  panel.style.cssText = 'background:#fff;border-radius:20px;max-width:440px;width:100%;padding:28px 24px;box-shadow:0 8px 40px rgba(0,0,0,0.25);text-align:center';

  panel.innerHTML =
    '<div style="font-size:3rem;margin-bottom:12px">📅</div>' +
    '<h2 style="margin:0 0 8px;font-size:1.3rem;color:#222">Welcome to TimeScape!</h2>' +
    '<p style="color:#555;font-size:0.93rem;margin:0 0 20px;line-height:1.6">Here\'s how to get started in 3 quick steps:</p>' +
    '<ol style="text-align:left;padding-left:20px;margin:0 0 20px;font-size:0.92rem;line-height:2;color:#333">' +
      '<li>Tap the <strong>＋ Add</strong> button in the header to create your first event, task, or reminder.</li>' +
      '<li>Use the <strong>bottom navigation</strong> to switch between Today, Calendar, Personal, Home, and Work views.</li>' +
      '<li>Press <strong>?</strong> on a keyboard anytime to see all keyboard shortcuts.</li>' +
    '</ol>' +
    '<button id="onboardingDismiss" style="background:#4a90e2;color:#fff;border:none;border-radius:12px;padding:12px 32px;font-size:1rem;cursor:pointer;font-weight:600">Let\'s go! 🚀</button>';

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  document.getElementById('onboardingDismiss').addEventListener('click', function() {
    overlay.remove();
    localStorage.setItem(STORAGE_KEY, '1');
  });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) { overlay.remove(); localStorage.setItem(STORAGE_KEY, '1'); } });
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
  try { wireSiriShortcuts(); } catch(e) { console.warn('Siri shortcuts init error', e); }
  try { handleUrlImport(); } catch(e) { console.warn('URL import error', e); }
  try { wireFirstRunOnboarding(); } catch(e) { console.warn('Onboarding init error', e); }
  /* Refresh rings immediately and every 60s */
  updateDayElapsedRing();
  updateCompletionRing();
  updateWeeklySalary();
  renderDashboardWeather();
  try { renderInboxWidget(); } catch(e) { console.warn('renderInboxWidget init error', e); }
  setInterval(function(){ updateDayElapsedRing(); updateCompletionRing(); }, 60000);

  /* Re-update rings when the daily-view date changes */
  window.addEventListener('dailyview:datechange', function(){
    updateCompletionRing();
    updateDayElapsedRing();
    renderDashboardWeather();
  });
});


/* ======================================================================
   TODAY-PAGE PREVIEW RENDERERS
   ====================================================================== */

/* Module-level Pomodoro timer state — avoids leaking intervals on re-render */
var _pomState = { interval: null, running: false, phase: 'focus', remaining: 25 * 60, sessions: 0, bound: false };

function _fvTimeToMins(t) {
  if (!t) return 0;
  var p = (t || '').split(':');
  if (p.length < 2) return parseInt(p[0], 10) * 60 || 0;
  return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
}

function _fvBarChart(bars, W, H, padT, padB, padL, padR, todayIso) {
  var maxVal = 0;
  bars.forEach(function(b) { if (b.value > maxVal) maxVal = b.value; });
  if (!bars.length || maxVal <= 0) return '<div class="fv-chart-empty">No data yet</div>';
  var chartH = H - padT - padB;
  var n = bars.length;
  var barW = Math.max(4, Math.floor((W - padL - padR) / n) - 3);
  var gap = Math.floor((W - padL - padR - n * barW) / (n + 1));
  var svg = '<svg width="100%" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';
  bars.forEach(function(b, i) {
    var x = padL + gap + i * (barW + gap);
    var bh = Math.max(2, Math.round(chartH * (b.value / maxVal)));
    var y = padT + chartH - bh;
    var isToday = todayIso && b.iso === todayIso;
    svg += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + bh + '" fill="' + (isToday ? '#4a90e2' : '#a0c4ef') + '" rx="2"/>';
    svg += '<text x="' + (x + barW / 2) + '" y="' + (H - 3) + '" text-anchor="middle" font-size="7" fill="#999">' + b.label + '</text>';
    if (bh >= 12 && b.value > 0) svg += '<text x="' + (x + barW / 2) + '" y="' + (y - 2) + '" text-anchor="middle" font-size="7" fill="#555">' + b.value + '</text>';
  });
  svg += '</svg>';
  return '<div class="fv-chart-wrap">' + svg + '</div>';
}

function renderTodayFocusPreview() {
  var el = document.getElementById('todayFocusPreviewContent');
  if (!el) return;
  var today = getTodayISO();
  var items = getPersonalFocus()[today] || [];
  if (!items.length) {
    el.innerHTML = '<span style="font-size:0.82rem;color:var(--ios-text-3)">No priorities set yet.</span>';
    return;
  }
  var done = items.filter(function(i) { return i.done; }).length;
  var html = '<div class="tdp-focus-items">';
  items.forEach(function(item, idx) {
    html += '<div class="tdp-focus-item' + (item.done ? ' done' : '') + '" data-idx="' + idx + '">' +
      '<span class="tdp-focus-cb">' + (item.done ? '\u2705' : '\u2b1c') + '</span>' +
      '<span class="tdp-focus-text">' + escapeHTML(item.text) + '</span></div>';
  });
  html += '</div><div style="font-size:0.78rem;color:var(--ios-text-3);margin-top:5px">' + done + '/' + items.length + ' done</div>';
  el.innerHTML = html;
  el.querySelectorAll('.tdp-focus-item').forEach(function(row) {
    row.addEventListener('click', function() {
      var idx = parseInt(row.dataset.idx, 10);
      var f = getPersonalFocus();
      if (!f[today] || !f[today][idx]) return;
      f[today][idx].done = !f[today][idx].done;
      setPersonalFocus(f);
      renderTodayFocusPreview();
    });
  });
}

function renderTodayHydrationPreview() {
  var el = document.getElementById('todayHydrationPreviewContent');
  if (!el) return;
  var h = getPersonalHydration();
  var today = getTodayISO();
  var count = typeof h.log[today] === 'number' ? h.log[today] : 0;
  var goal = h.goal || 8;
  var glasses = '';
  for (var i = 0; i < Math.min(goal, 10); i++) {
    glasses += '<span class="tdp-hydration-glass' + (i < count ? ' filled' : '') + '">\ud83d\udca7</span>';
  }
  el.innerHTML =
    '<div class="tdp-hydration-glasses">' + glasses + '</div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px">' +
      '<span style="font-size:0.78rem;color:var(--ios-text-3)">' + count + '/' + goal + ' glasses</span>' +
      '<button class="tdp-add-btn" id="tdpHydAdd">+1 \ud83d\udca7</button></div>';
  var btn = el.querySelector('#tdpHydAdd');
  if (btn) btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var hy = getPersonalHydration();
    if (!hy.log) hy.log = {};
    hy.log[today] = Math.min((hy.log[today] || 0) + 1, hy.goal || 8);
    setPersonalHydration(hy);
    renderTodayHydrationPreview();
  });
}

function renderTodaySleepPreview() {
  var el = document.getElementById('todaySleepPreviewContent');
  if (!el) return;
  var sleep = getPersonalSleep();
  var today = getTodayISO();
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var sched = (sleep.schedule && sleep.schedule[DAYS[new Date().getDay()]]) || { bedtime: '22:30', wake: '07:00' };
  var logged = sleep.log && sleep.log[today];
  if (logged && logged.bedtime && logged.wakeTime) {
    var bm = _fvTimeToMins(logged.bedtime), wm = _fvTimeToMins(logged.wakeTime);
    var dur = wm > bm ? wm - bm : (1440 - bm) + wm;
    el.innerHTML = '<div class="tdp-sleep-row">\u2705 ' + escapeHTML(logged.bedtime) + ' \u2192 ' + escapeHTML(logged.wakeTime) +
      ' <span style="color:var(--ios-text-3);font-size:0.78rem">(' + Math.floor(dur / 60) + 'h ' + (dur % 60) + 'm)</span></div>';
  } else {
    el.innerHTML = '<div class="tdp-sleep-row">\ud83c\udf19 Bed <strong>' + escapeHTML(sched.bedtime) + '</strong>' +
      '&nbsp;\u2600\ufe0f Wake <strong>' + escapeHTML(sched.wake) + '</strong></div>' +
      '<div style="font-size:0.75rem;color:var(--ios-text-3);margin-top:3px">Not logged yet</div>';
  }
}

function renderTodayRoutinePreview() {
  var el = document.getElementById('todayRoutinePreviewContent');
  if (!el) return;
  var routines = getPersonalRoutines();
  var today = getTodayISO();
  var log = getPersonalRoutineLog();
  var todayLog = log[today] || {};
  var total = (routines.morning || []).length;
  var done = ((todayLog.morning || [])).length;
  if (!total) {
    el.innerHTML = '<span style="font-size:0.82rem;color:var(--ios-text-3)">No morning routine set up yet.</span>';
    return;
  }
  var pct = Math.round(done / total * 100);
  el.innerHTML =
    '<div style="font-size:0.82rem;color:var(--ios-text-3);margin-bottom:5px">Morning: ' + done + '/' + total + ' steps</div>' +
    '<div class="tdp-routine-bar"><div class="tdp-routine-bar-fill" style="width:' + pct + '%"></div></div>';
}

function renderTodayMoodPreview() {
  var el = document.getElementById('todayMoodPreviewContent');
  if (!el) return;
  var moods = getPersonalMood();
  var today = getTodayISO();
  var entry = moods.find(function(m) { return m.date === today; });
  if (entry) {
    el.innerHTML =
      '<div class="tdp-mood-checked"><span style="font-size:1.5rem">' + escapeHTML(entry.mood) + '</span>' +
        '<div style="margin-left:8px"><div style="font-size:0.85rem;font-weight:600">' + escapeHTML(entry.moodLabel) + '</div>' +
          '<div style="font-size:0.75rem;color:var(--ios-text-3)">' + escapeHTML(entry.energy) + '</div></div></div>';
    return;
  }
  var opts = [{e:'\ud83d\ude0a',l:'Great'},{e:'\ud83d\ude42',l:'Good'},{e:'\ud83d\ude10',l:'Okay'},{e:'\ud83d\ude1f',l:'Low'},{e:'\ud83d\ude22',l:'Rough'}];
  el.innerHTML =
    '<div style="font-size:0.75rem;color:var(--ios-text-3);margin-bottom:5px">How are you feeling?</div>' +
    '<div class="tdp-mood-quick-row">' + opts.map(function(o) {
      return '<button class="tdp-mood-btn" data-mood="' + o.e + '" data-label="' + o.l + '">' + o.e + '</button>';
    }).join('') + '</div>';
  el.querySelectorAll('.tdp-mood-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var data = getPersonalMood();
      data = data.filter(function(m) { return m.date !== today; });
      data.unshift({ date: today, mood: btn.dataset.mood, moodLabel: btn.dataset.label, energy: '\ud83d\udfe1 Medium', note: '' });
      if (data.length > 90) data = data.slice(0, 90);
      setPersonalMood(data);
      renderTodayMoodPreview();
    });
  });
}

function renderTodayBudgetPreview() {
  var el = document.getElementById('todayBudgetPreviewContent');
  if (!el) return;
  var budget = getPersonalBudget();
  var bills = budget.bills || [];
  var oneTime = budget.oneTimeExpenses || [];
  var jobIncome = typeof calcBudgetJobIncome === 'function' ? calcBudgetJobIncome() : 0;
  var billsTotal = bills.reduce(function(s, b) { return s + (parseFloat(b.amount) || 0); }, 0);
  var oneTimeTotal = oneTime.reduce(function(s, e) { return s + (parseFloat(e.amount) || 0); }, 0);
  var net = jobIncome - billsTotal - oneTimeTotal;
  var netColor = net >= 0 ? '#27ae60' : '#e74c3c';
  el.innerHTML =
    '<div class="tdp-budget-row"><span style="font-size:0.8rem;color:var(--ios-text-3)">📈 Income (30d)</span><span style="font-size:0.82rem;font-weight:600;color:#27ae60">$' + jobIncome.toFixed(2) + '</span></div>' +
    '<div class="tdp-budget-row"><span style="font-size:0.8rem;color:var(--ios-text-3)">📋 Bills/mo</span><span style="font-size:0.82rem;color:#e74c3c">$' + billsTotal.toFixed(2) + '</span></div>' +
    '<div class="tdp-budget-row tdp-budget-net"><span style="font-size:0.8rem;font-weight:600">💵 Net</span><span style="font-size:0.82rem;font-weight:700;color:' + netColor + '">' + (net >= 0 ? '+' : '') + '$' + net.toFixed(2) + '</span></div>';
}



function renderWeatherAppFull(container) {
  container.innerHTML = '';

  var useFahrenheit = /^en-US/i.test(navigator.language || '');
  var unitParam = useFahrenheit ? '&temperature_unit=fahrenheit' : '';
  var unitLabel = useFahrenheit ? '°F' : '°C';

  var WMO_E = {0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌧️',55:'🌧️',
    61:'🌧️',63:'🌧️',65:'🌧️',71:'❄️',73:'❄️',75:'❄️',80:'🌦️',81:'🌦️',82:'⛈️',
    95:'⛈️',96:'⛈️',99:'⛈️'};
  var WMO_D = {0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
    45:'Foggy',48:'Icy fog',51:'Light drizzle',53:'Drizzle',55:'Dense drizzle',
    61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',
    80:'Showers',81:'Showers',82:'Heavy showers',95:'Thunderstorm',96:'Thunderstorm',99:'Thunderstorm'};
  var WMO_GRAD = {
    0:'linear-gradient(160deg,#1a6fc4 0%,#3aafe8 60%,#87ceeb 100%)',
    1:'linear-gradient(160deg,#1e7fd4 0%,#4ab8ef 60%,#b0d8f5 100%)',
    2:'linear-gradient(160deg,#4a7fa8 0%,#7ab0cb 60%,#b8cfe0 100%)',
    3:'linear-gradient(160deg,#5a6a7a 0%,#8098aa 60%,#b0bec8 100%)',
    45:'linear-gradient(160deg,#6a7a8a 0%,#96a6b0 100%)',
    48:'linear-gradient(160deg,#6a7a8a 0%,#96a6b0 100%)',
    61:'linear-gradient(160deg,#2d4e78 0%,#4a72a0 60%,#7098c0 100%)',
    63:'linear-gradient(160deg,#2d4e78 0%,#4a72a0 60%,#7098c0 100%)',
    65:'linear-gradient(160deg,#1e3a5a 0%,#2d5280 100%)',
    71:'linear-gradient(160deg,#6888a8 0%,#b0c8e0 60%,#d8e8f4 100%)',
    73:'linear-gradient(160deg,#6888a8 0%,#b0c8e0 100%)',
    75:'linear-gradient(160deg,#5878a0 0%,#a0b8d8 100%)',
    80:'linear-gradient(160deg,#3a5e84 0%,#5a88b0 60%,#90b8d8 100%)',
    95:'linear-gradient(160deg,#2a3848 0%,#445868 100%)',
    96:'linear-gradient(160deg,#2a3848 0%,#445868 100%)',
    99:'linear-gradient(160deg,#1a2838 0%,#344858 100%)'
  };
  var DN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var DNS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Skeleton shell while loading
  container.innerHTML =
    '<div class="wnative-shell">' +
      '<div class="wnative-hero wnative-loading">' +
        '<div class="wnative-hero-emoji">🌤️</div>' +
        '<div class="wnative-hero-temp">--</div>' +
        '<div class="wnative-hero-desc">Requesting location…</div>' +
        '<div class="wnative-hero-loc">📍 Locating…</div>' +
      '</div>' +
      '<div class="wnative-hourly-wrap"><div class="wnative-hourly-strip" id="wnHourly"></div></div>' +
      '<div class="wnative-daily-wrap" id="wnDaily"></div>' +
      '<div class="wnative-footer">Powered by Open-Meteo · No API key required</div>' +
    '</div>';

  if (!navigator.geolocation) {
    container.querySelector('.wnative-hero-desc').textContent = 'Location access required to show weather.';
    return;
  }

  navigator.geolocation.getCurrentPosition(function(pos) {
    var lat = pos.coords.latitude, lon = pos.coords.longitude;
    var latF = lat.toFixed(4), lonF = lon.toFixed(4);
    var today = new Date().toISOString().slice(0,10);
    var nowHour = new Date().getHours();

    // Reverse geocode city name via Nominatim (User-Agent required by OSM policy)
    var cityLabel = latF + ', ' + lonF;
    fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + latF + '&lon=' + lonF, {
        headers: { 'User-Agent': 'willlappschedule/1.0 (weather feature)' }
      })
      .then(function(r){ return r.json(); })
      .then(function(g){
        var c = (g && g.address) ? (g.address.city || g.address.town || g.address.village || g.address.county || '') : '';
        if (c) {
          cityLabel = c;
          var loc = container.querySelector('.wnative-hero-loc');
          if (loc) loc.textContent = '📍 ' + c;
        }
      }).catch(function(){});

    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latF + '&longitude=' + lonF +
      '&current_weather=true' +
      '&hourly=temperature_2m,apparent_temperature,precipitation_probability,weathercode,windspeed_10m,relativehumidity_2m,uv_index' +
      '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
      '&forecast_days=16&timezone=auto' + unitParam;

    fetch(url).then(function(r){ return r.json(); }).then(function(d) {
      if (!d || !d.hourly || !d.daily) {
        container.querySelector('.wnative-hero-desc').textContent = 'Weather data unavailable.';
        return;
      }

      var cw = d.current_weather || {};
      var curCode = cw.weathercode != null ? cw.weathercode : (d.daily.weathercode ? d.daily.weathercode[0] : 0);
      var curTemp = cw.temperature != null ? Math.round(cw.temperature) : '--';
      var curWind = cw.windspeed != null ? Math.round(cw.windspeed) : '--';
      var curEmoji = WMO_E[curCode] || '🌡️';
      var curDesc  = WMO_D[curCode] || '';
      var todayHi  = d.daily.temperature_2m_max ? Math.round(d.daily.temperature_2m_max[0]) : '--';
      var todayLo  = d.daily.temperature_2m_min ? Math.round(d.daily.temperature_2m_min[0]) : '--';
      var todayPrec = d.daily.precipitation_probability_max ? (d.daily.precipitation_probability_max[0] || 0) : 0;

      // Derive humidity & UV from current hour
      var hT = d.hourly.time || [];
      var hHum = d.hourly.relativehumidity_2m || [];
      var hUV  = d.hourly.uv_index || [];
      var curHum = '--', curUV = '--';
      for (var i = 0; i < hT.length; i++) {
        if (hT[i] && hT[i].slice(0,10) === today && parseInt(hT[i].slice(11,13),10) === nowHour) {
          curHum = Math.round(hHum[i] || 0);
          curUV  = (hUV[i] || 0).toFixed(1);
          break;
        }
      }

      // Sunrise / Sunset
      var todaySunrise = d.daily.sunrise ? d.daily.sunrise[0] : null;
      var todaySunset  = d.daily.sunset  ? d.daily.sunset[0]  : null;
      var srLabel = todaySunrise ? todaySunrise.slice(11,16) : '--';
      var ssLabel = todaySunset  ? todaySunset.slice(11,16)  : '--';

      // Dynamic gradient background — use actual sunrise/sunset for day/night if available
      var grad = WMO_GRAD[curCode] || WMO_GRAD[0];
      var isNight = false;
      if (todaySunrise && todaySunset) {
        var nowMs = Date.now();
        var srMs  = new Date(todaySunrise).getTime();
        var ssMs  = new Date(todaySunset).getTime();
        isNight = nowMs < srMs || nowMs > ssMs;
      } else {
        isNight = nowHour >= 20 || nowHour < 6;
      }
      if (isNight) {
        grad = 'linear-gradient(160deg,#0d1b2a 0%,#1a2e45 60%,#243450 100%)';
      }

      // Build hero
      var heroEl = container.querySelector('.wnative-hero');
      if (heroEl) {
        heroEl.classList.remove('wnative-loading');
        heroEl.style.background = grad;
        heroEl.innerHTML =
          '<div class="wnative-hero-top">' +
            '<div class="wnative-hero-loc">📍 ' + escapeHTML(cityLabel) + '</div>' +
          '</div>' +
          '<div class="wnative-hero-main">' +
            '<div class="wnative-hero-emoji">' + curEmoji + '</div>' +
            '<div class="wnative-hero-temp">' + curTemp + unitLabel + '</div>' +
          '</div>' +
          '<div class="wnative-hero-desc">' + escapeHTML(curDesc) + '</div>' +
          '<div class="wnative-hero-hilo">H:' + todayHi + unitLabel + ' · L:' + todayLo + unitLabel + '</div>' +
          '<div class="wnative-stats-row">' +
            '<div class="wnative-stat"><span class="wnative-stat-val">💧 ' + curHum + '%</span><span class="wnative-stat-lbl">Humidity</span></div>' +
            '<div class="wnative-stat"><span class="wnative-stat-val">🌬️ ' + curWind + ' km/h</span><span class="wnative-stat-lbl">Wind</span></div>' +
            '<div class="wnative-stat"><span class="wnative-stat-val">🌧️ ' + todayPrec + '%</span><span class="wnative-stat-lbl">Precip</span></div>' +
            '<div class="wnative-stat"><span class="wnative-stat-val">☀️ ' + curUV + '</span><span class="wnative-stat-lbl">UV Index</span></div>' +
            '<div class="wnative-stat"><span class="wnative-stat-val">🌅 ' + srLabel + '</span><span class="wnative-stat-lbl">Sunrise</span></div>' +
            '<div class="wnative-stat"><span class="wnative-stat-val">🌇 ' + ssLabel + '</span><span class="wnative-stat-lbl">Sunset</span></div>' +
          '</div>';
      }

      // Hourly forecast strip (today, from current hour, next 24 hours)
      var hourlyEl = container.querySelector('#wnHourly');
      if (hourlyEl) {
        var hTmp = d.hourly.temperature_2m || [];
        var hFl  = d.hourly.apparent_temperature || [];
        var hPr  = d.hourly.precipitation_probability || [];
        var hWC  = d.hourly.weathercode || [];
        var hHHTML = '';
        var count = 0;
        for (var j = 0; j < hT.length && count < 25; j++) {
          if (!hT[j]) continue;
          var hDate = hT[j].slice(0,10);
          var hHour = parseInt(hT[j].slice(11,13),10);
          // Start from previous full hour relative to now, show 25 slots
          if (hDate < today || (hDate === today && hHour < nowHour)) continue;
          var isNow = hDate === today && hHour === nowHour;
          var hEmoji = WMO_E[hWC[j]] || '🌡️';
          hHHTML += '<div class="wnative-hour-card' + (isNow ? ' wnh-now' : '') + '">' +
            '<div class="wnh-time">' + (isNow ? 'Now' : hT[j].slice(11,16)) + '</div>' +
            '<div class="wnh-icon">' + hEmoji + '</div>' +
            '<div class="wnh-temp">' + Math.round(hTmp[j] || 0) + unitLabel + '</div>' +
            '<div class="wnh-precip">' + (hPr[j] || 0) + '%</div>' +
            '</div>';
          count++;
        }
        hourlyEl.innerHTML = hHHTML || '<p class="wnative-empty">No hourly data</p>';
      }

      // Daily forecast
      var dailyEl = container.querySelector('#wnDaily');
      if (dailyEl) {
        var dD = d.daily.time || [];
        var dC = d.daily.weathercode || [];
        var dHi = d.daily.temperature_2m_max || [];
        var dLo = d.daily.temperature_2m_min || [];
        var dP  = d.daily.precipitation_probability_max || [];
        var dSr = d.daily.sunrise || [];
        var dSs = d.daily.sunset  || [];

        // Compute global min/max for temp bar scaling
        var allHi = dHi.filter(function(v){ return v != null; });
        var allLo = dLo.filter(function(v){ return v != null; });
        var globalMin = allLo.length ? Math.min.apply(null, allLo) : 0;
        var globalMax = allHi.length ? Math.max.apply(null, allHi) : 40;
        var globalRange = Math.max(globalMax - globalMin, 1);

        var dHTML = '<div class="wnative-daily-heading">16-Day Forecast</div>';
        for (var di = 0; di < dD.length; di++) {
          if (!dD[di]) continue;
          var dObj  = new Date(dD[di] + 'T12:00:00');
          var dEmoji = WMO_E[dC[di]] || '🌡️';
          var dDesc  = WMO_D[dC[di]] || '';
          var isToday = dD[di] === today;
          var hi = dHi[di] != null ? Math.round(dHi[di]) : '--';
          var lo = dLo[di] != null ? Math.round(dLo[di]) : '--';
          var precip = dP[di] || 0;
          var srStr = dSr[di] ? dSr[di].slice(11,16) : null;
          var ssStr = dSs[di] ? dSs[di].slice(11,16) : null;

          // Temperature bar proportional to global range
          var barLo  = dLo[di] != null ? ((dLo[di] - globalMin) / globalRange * 100).toFixed(1) : 0;
          var barWid = dHi[di] != null && dLo[di] != null ? (((dHi[di] - dLo[di]) / globalRange) * 100).toFixed(1) : 20;

          dHTML += '<div class="wnative-day-row' + (isToday ? ' wnd-today' : '') + '">' +
            '<div class="wnd-day">' + (isToday ? 'Today' : DNS[dObj.getDay()]) +
              '<div class="wnd-date">' + (dObj.getMonth()+1) + '/' + dObj.getDate() + '</div>' +
            '</div>' +
            '<div class="wnd-icon" title="' + escapeHTML(dDesc) + '">' + dEmoji + '</div>' +
            '<div class="wnd-desc">' + escapeHTML(dDesc) + '</div>' +
            '<div class="wnd-precip" title="Precipitation probability"><span class="wnd-precip-drop">💧</span>' + precip + '%</div>' +
            '<div class="wnd-bar-wrap">' +
              '<span class="wnd-lo">' + lo + '</span>' +
              '<div class="wnd-bar-track">' +
                '<div class="wnd-bar-fill" style="margin-left:' + barLo + '%;width:' + barWid + '%"></div>' +
              '</div>' +
              '<span class="wnd-hi">' + hi + '</span>' +
            '</div>' +
            (srStr ? '<div class="wnd-suntime">🌅 ' + srStr + ' · 🌇 ' + ssStr + '</div>' : '') +
          '</div>';
        }
        dailyEl.innerHTML = dHTML;
      }
    }).catch(function() {
      var h = container.querySelector('.wnative-hero-desc');
      if (h) h.textContent = 'Unable to fetch weather data. Check connection.';
    });
  }, function() {
    var h = container.querySelector('.wnative-hero-desc');
    if (h) h.textContent = 'Enable location access to see weather.';
  }, { timeout: 8000 });
}

function renderSleepAppFull(container) {
  container.innerHTML = '';
  var sleep=getPersonalSleep(), today=getTodayISO();
  var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], todayDay=DAYS[new Date().getDay()];
  var todaySched=sleep.schedule[todayDay]||{bedtime:'22:30',wake:'07:00'};
  var todayLog=sleep.log&&sleep.log[today];
  var layout=document.createElement('div'); layout.className='app-full-two-col';
  var left=document.createElement('div'); left.className='app-full-col';
  var right=document.createElement('div'); right.className='app-full-col';

  var lHTML='<h3 class="app-full-col-heading">\ud83d\ude34 Sleep Schedule</h3><div class="app-sleep-sched-grid"><div class="assg-h">Day</div><div class="assg-h">\ud83c\udf19 Bedtime</div><div class="assg-h">\u2600\ufe0f Wake</div>';
  DAYS.forEach(function(day){
    var ds=sleep.schedule[day]||{bedtime:'22:30',wake:'07:00'};
    lHTML+='<div class="assg-day'+(day===todayDay?' assg-today':'')+'">' +day+'</div>'+
      '<input class="assg-time" type="time" data-day="'+day+'" data-field="bedtime" value="'+(ds.bedtime||'22:30')+'"/>'+
      '<input class="assg-time" type="time" data-day="'+day+'" data-field="wake" value="'+(ds.wake||'07:00')+'"/>';
  });
  lHTML+='</div>';
  lHTML+='<h4 class="app-full-section-heading">\ud83d\udcdd Today\'s Sleep Log</h4><div class="app-sleep-log-form">';
  if(todayLog){
    var bm=_fvTimeToMins(todayLog.bedtime||''),wm=_fvTimeToMins(todayLog.wakeTime||'');
    var dur=wm>bm?wm-bm:(1440-bm)+wm;
    var stars=todayLog.quality?'\u2b50'.repeat(todayLog.quality)+'\u2606'.repeat(5-todayLog.quality):'';
    lHTML+='<div class="app-sleep-logged-ok">\u2705 '+escapeHTML(todayLog.bedtime||'\u2014')+' \u2192 '+escapeHTML(todayLog.wakeTime||'\u2014')+' <em>('+Math.floor(dur/60)+'h '+(dur%60)+'m)</em>'+(stars?' '+stars:'')+'</div><button id="sleepFvEdit" class="app-fv-link-btn">Edit log</button>';
  }
  var qualOpts=[5,4,3,2,1].map(function(n){return '<option value="'+n+'"'+(todayLog&&todayLog.quality===n?' selected':'')+'>'+ '\u2b50'.repeat(n)+' '+['','Bad','Poor','Okay','Good','Great'][n]+'</option>';}).join('');
  lHTML+='<div id="sleepFvForm"'+(todayLog?' style="display:none"':'')+' class="app-sleep-log-inner">'+
    '<label>Bed <input type="time" id="sleepFvBed" value="'+(todayLog?(todayLog.bedtime||''):todaySched.bedtime)+'"/></label>'+
    '<label>Wake <input type="time" id="sleepFvWake" value="'+(todayLog?(todayLog.wakeTime||''):todaySched.wake)+'"/></label>'+
    '<label>Quality <select id="sleepFvQual" class="app-fv-select"><option value="">\u2014</option>'+qualOpts+'</select></label>'+
    '<button id="sleepFvSave" class="app-fv-save-btn">Save</button>'+
    (todayLog?'<button id="sleepFvCancel" class="app-fv-cancel-btn">Cancel</button>':'')+
    '</div></div>';
  var wakeMin=_fvTimeToMins(todaySched.wake);
  var cyclePills=[4,5,6].map(function(c){
    var bm=((wakeMin-c*90-14)+1440)%1440;
    return '<span class="app-fv-pill">'+pad2(Math.floor(bm/60))+':'+pad2(bm%60)+' ('+c+' cycles)</span>';
  }).join('');
  lHTML+='<div class="app-sleep-alarm-box"><strong>\ud83d\udca1 Ideal bedtimes for '+todaySched.wake+' wake:</strong><div class="app-sleep-cycle-pills">'+cyclePills+'</div></div>';
  left.innerHTML=lHTML;

  var past14=[];
  for(var ni=13;ni>=0;ni--){
    var dd=new Date();dd.setDate(dd.getDate()-ni);
    var iso=dd.getFullYear()+'-'+pad2(dd.getMonth()+1)+'-'+pad2(dd.getDate());
    var e=sleep.log&&sleep.log[iso]; var dur2=0;
    if(e&&e.bedtime&&e.wakeTime){var b=_fvTimeToMins(e.bedtime),w=_fvTimeToMins(e.wakeTime);dur2=w>b?w-b:(1440-b)+w;}
    past14.push({iso:iso,dur:dur2,quality:e?(e.quality||0):0});
  }
  var maxDur=Math.max.apply(null,past14.map(function(d){return d.dur;}));
  if(maxDur<1)maxDur=480;
  var SW=240,SH=90,PL2=8,PT2=14,PB2=16;
  var bw=Math.floor((SW-PL2*2)/14)-2,ch=SH-PT2-PB2;
  var svgH='<svg width="100%" height="'+SH+'" viewBox="0 0 '+SW+' '+SH+'" preserveAspectRatio="none">';
  past14.forEach(function(d,i){
    var x=PL2+i*(bw+2),barH=d.dur>0?Math.max(3,Math.round(ch*d.dur/maxDur)):0,y=PT2+ch-barH;
    var fill=d.quality>=4?'#27ae60':d.quality>=3?'#4a90e2':d.quality>=1?'#e67e22':(d.dur>0?'#a0c4ef':'#eee');
    if(d.dur>0){svgH+='<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+barH+'" fill="'+fill+'" rx="2"/>';if(barH>12)svgH+='<text x="'+(x+bw/2)+'" y="'+(y-2)+'" text-anchor="middle" font-size="6.5" fill="#666">'+Math.floor(d.dur/60)+'h</text>';}
    if(i%4===0){var dd2=new Date(d.iso+'T12:00:00');svgH+='<text x="'+(x+bw/2)+'" y="'+(SH-2)+'" text-anchor="middle" font-size="6" fill="#aaa">'+(dd2.getMonth()+1)+'/'+(dd2.getDate())+'</text>';}
  });
  svgH+='</svg>';
  var schedVals=DAYS.map(function(d){var s=sleep.schedule[d]||{bedtime:'22:30',wake:'07:00'};var b2=_fvTimeToMins(s.bedtime),w2=_fvTimeToMins(s.wake);return w2>b2?w2-b2:(1440-b2)+w2;});
  var avgTarget=Math.round(schedVals.reduce(function(a,b){return a+b;},0)/7);
  var debt=past14.reduce(function(acc,d){return acc+Math.max(0,avgTarget-d.dur);},0);
  var rHTML='<h3 class="app-full-col-heading">\ud83d\udcca 14-Night History</h3><div class="app-sleep-chart">'+svgH+'</div>'+
    '<p style="font-size:0.72rem;color:var(--ios-text-3);margin:4px 0 10px">Green=great \u00b7 Blue=good \u00b7 Orange=poor \u00b7 Gray=unrated</p>'+
    '<div class="app-sleep-debt-row"><span>\ud83d\udca4 14-day sleep debt</span><span class="app-sleep-debt-val'+(debt>60?' app-sleep-debt-red':'')+'">'+
    (debt>0?Math.floor(debt/60)+'h '+(debt%60)+'m':'None \u2705')+'</span></div>';
  var tips=[
    ['\ud83d\udcf1','Avoid blue light 1h before bed \u2014 use Night Shift or dark mode'],
    ['\u2615','Caffeine cutoff: 6h before bedtime (coffee lingers 5\u20137h)'],
    ['\ud83c\udf21\ufe0f','Keep bedroom cool (18\u201319\u00b0C / 65\u201367\u00b0F) for deeper sleep'],
    ['\ud83c\udf05','Get morning sunlight within 1h of waking \u2014 resets circadian clock'],
    ['\ud83c\udf77','Alcohol disrupts REM sleep \u2014 avoid within 3h of bedtime']
  ];
  rHTML+='<div class="app-sleep-tips"><h4 class="app-full-section-heading">\ud83e\udde0 Circadian Rhythm Tips</h4>';
  tips.forEach(function(t){rHTML+='<div class="app-sleep-tip-row"><span>'+t[0]+'</span><span>'+t[1]+'</span></div>';});
  rHTML+='</div>';
  right.innerHTML=rHTML;
  layout.appendChild(left); layout.appendChild(right); container.appendChild(layout);

  container.querySelectorAll('.assg-time').forEach(function(inp){
    inp.addEventListener('change',function(){var s=getPersonalSleep();if(!s.schedule[inp.dataset.day])s.schedule[inp.dataset.day]={};s.schedule[inp.dataset.day][inp.dataset.field]=inp.value;setPersonalSleep(s);});
  });
  var editBtn=container.querySelector('#sleepFvEdit');
  if(editBtn)editBtn.addEventListener('click',function(){var f=container.querySelector('#sleepFvForm');if(f)f.style.display='';});
  var cancelBtn=container.querySelector('#sleepFvCancel');
  if(cancelBtn)cancelBtn.addEventListener('click',function(){var f=container.querySelector('#sleepFvForm');if(f)f.style.display='none';});
  var saveBtn=container.querySelector('#sleepFvSave');
  if(saveBtn)saveBtn.addEventListener('click',function(){
    var bed=container.querySelector('#sleepFvBed'),wake=container.querySelector('#sleepFvWake'),qual=container.querySelector('#sleepFvQual');
    var s=getPersonalSleep();if(!s.log)s.log={};
    s.log[today]={bedtime:bed?bed.value:'',wakeTime:wake?wake.value:'',quality:qual&&qual.value?parseInt(qual.value,10):0};
    setPersonalSleep(s);renderSleepAppFull(container);
  });
}

function renderMoodAppFull(container) {
  container.innerHTML='';
  var moods=getPersonalMood(),today=getTodayISO();
  var todayEntry=moods.find(function(m){return m.date===today;});
  var MOODS=[{e:'\ud83d\ude0a',l:'Great'},{e:'\ud83d\ude42',l:'Good'},{e:'\ud83d\ude10',l:'Okay'},{e:'\ud83d\ude1f',l:'Low'},{e:'\ud83d\ude22',l:'Rough'}];
  var MOOD_SCORE={Great:5,Good:4,Okay:3,Low:2,Rough:1};
  var ENERGY_OPT=['\ud83d\udfe2 High','\ud83d\udfe1 Medium','\ud83d\udd34 Low'];
  var layout=document.createElement('div');layout.className='app-full-two-col';
  var left=document.createElement('div');left.className='app-full-col';
  var right=document.createElement('div');right.className='app-full-col';

  var lHTML='<h3 class="app-full-col-heading">\ud83d\ude0a Today\'s Check-in</h3>';
  if(todayEntry){
    lHTML+='<div class="app-mood-checked"><span style="font-size:2rem">'+escapeHTML(todayEntry.mood)+'</span>'+
      '<div style="margin-left:10px"><div style="font-weight:700">'+escapeHTML(todayEntry.moodLabel)+'</div>'+
      '<div style="font-size:0.82rem;color:var(--ios-text-3)">'+escapeHTML(todayEntry.energy)+'</div>'+
      (todayEntry.note?'<div style="font-size:0.8rem;font-style:italic;color:var(--ios-text-3)">\u201c'+escapeHTML(todayEntry.note)+'\u201d</div>':'')+
      '</div></div><button id="moodFvEdit" class="app-fv-link-btn">Edit today\'s entry</button>';
  }
  lHTML+='<div id="moodFvForm"'+(todayEntry?' style="display:none"':'')+' class="app-mood-form">'+
    '<div class="app-mood-emoji-row">'+MOODS.map(function(m){return '<button class="app-mood-emoji-btn" data-mood="'+m.e+'" data-label="'+m.l+'" title="'+m.l+'">'+m.e+'</button>';}).join('')+'</div>'+
    '<div class="app-mood-energy-row">'+ENERGY_OPT.map(function(o){return '<button class="app-mood-energy-btn" data-energy="'+escapeHTML(o)+'">'+escapeHTML(o)+'</button>';}).join('')+'</div>'+
    '<input type="text" id="moodFvNote" class="app-fv-note-input" placeholder="Optional note\u2026" value="'+escapeHTML(todayEntry?(todayEntry.note||''):'')+'"/>'+
    '<button id="moodFvSave" class="app-fv-save-btn">\ud83d\udcbe Save Check-in</button>'+
    (todayEntry?'<button id="moodFvCancel" class="app-fv-cancel-btn">Cancel</button>':'')+
    '</div>';
  lHTML+='<h4 class="app-full-section-heading">\ud83d\udccb Recent History</h4><div class="app-mood-history-list">';
  moods.slice(0,10).forEach(function(m){
    lHTML+='<div class="app-mood-hist-row"><span class="app-mood-hist-date">'+escapeHTML(m.date||'')+'</span><span style="font-size:1.1rem">'+escapeHTML(m.mood||'')+'</span><span style="font-size:0.8rem">'+escapeHTML(m.moodLabel||'')+'</span><span style="font-size:0.75rem;color:var(--ios-text-3)">'+escapeHTML(m.energy||'')+'</span>'+(m.note?'<span style="font-size:0.75rem;font-style:italic;color:var(--ios-text-3)">'+escapeHTML(m.note)+'</span>':'')+'</div>';
  });
  if(!moods.length)lHTML+='<p style="color:var(--ios-text-3);font-size:0.85rem">No entries yet.</p>';
  lHTML+='</div>';
  left.innerHTML=lHTML;

  var past30=[];
  for(var ni=29;ni>=0;ni--){var dd=new Date();dd.setDate(dd.getDate()-ni);var iso=dd.getFullYear()+'-'+pad2(dd.getMonth()+1)+'-'+pad2(dd.getDate());past30.push({iso:iso,entry:moods.find(function(m){return m.date===iso;})});}
  var MCOL={Great:'#27ae60',Good:'#4a90e2',Okay:'#f39c12',Low:'#e67e22',Rough:'#e74c3c'};
  var rHTML='<h3 class="app-full-col-heading">\ud83d\udcc5 30-Day Mood</h3><div class="app-mood-heatmap">';
  past30.forEach(function(d){var color=d.entry&&MCOL[d.entry.moodLabel]?MCOL[d.entry.moodLabel]:'#eee';rHTML+='<div class="app-mood-hm-cell" style="background:'+color+'" title="'+d.iso+(d.entry?' \u00b7 '+d.entry.moodLabel:'')+'"></div>';});
  rHTML+='</div><div class="app-mood-hm-legend">'+Object.keys(MCOL).map(function(k){return '<span><span style="background:'+MCOL[k]+';width:9px;height:9px;border-radius:2px;display:inline-block;vertical-align:middle;margin-right:3px"></span>'+k+'</span>';}).join('')+'</div>';

  var trend14=[];
  for(var ti=13;ti>=0;ti--){var td=new Date();td.setDate(td.getDate()-ti);var tIso=td.getFullYear()+'-'+pad2(td.getMonth()+1)+'-'+pad2(td.getDate());var te=moods.find(function(m){return m.date===tIso;});trend14.push({score:te?(MOOD_SCORE[te.moodLabel]||null):null});}
  var validPts=trend14.filter(function(d){return d.score!=null;});
  rHTML+='<h4 class="app-full-section-heading" style="margin-top:14px">\ud83d\udcc8 Mood Trend (14 days)</h4>';
  if(validPts.length>1){
    var TW=220,TH=55,stepX=TW/13;
    var tPts=trend14.map(function(d,i){return{x:i*stepX,y:d.score!=null?(TH-5-(d.score-1)/4*(TH-10)):null};});
    var pathD='';tPts.forEach(function(p){if(p.y==null)return;pathD+=(pathD===''?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1);});
    var svgT='<svg width="100%" height="'+TH+'" viewBox="0 0 '+TW+' '+TH+'" preserveAspectRatio="none"><path d="'+pathD+'" fill="none" stroke="#4a90e2" stroke-width="2" stroke-linejoin="round"/>';
    tPts.forEach(function(p){if(p.y==null)return;svgT+='<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3" fill="#4a90e2"/>';});
    svgT+='</svg>';
    rHTML+='<div class="fv-chart-wrap">'+svgT+'</div>';
  } else {
    rHTML+='<p style="font-size:0.82rem;color:var(--ios-text-3)">Need more entries for a trend chart.</p>';
  }
  rHTML+='<h4 class="app-full-section-heading" style="margin-top:14px">\ud83d\udd0d Patterns</h4>';
  var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],byDow={};
  DOW.forEach(function(d){byDow[d]=[];});
  moods.forEach(function(m){var d2=new Date((m.date||'')+'T12:00:00');if(!isNaN(d2)&&m.moodLabel)byDow[DOW[d2.getDay()]].push(MOOD_SCORE[m.moodLabel]||0);});
  var dowAvg=DOW.map(function(d){var arr=byDow[d];return{day:d,avg:arr.length?arr.reduce(function(a,b){return a+b;},0)/arr.length:null};}).filter(function(d){return d.avg!=null;});
  if(dowAvg.length>=2){
    var best=dowAvg.reduce(function(a,b){return b.avg>a.avg?b:a;});
    var worst=dowAvg.reduce(function(a,b){return b.avg<a.avg?b:a;});
    rHTML+='<div class="app-mood-patterns"><span>\ud83d\ude0a Best day: <strong>'+best.day+'</strong> (avg '+best.avg.toFixed(1)+'/5)</span><span>\ud83d\ude1f Toughest: <strong>'+worst.day+'</strong> (avg '+worst.avg.toFixed(1)+'/5)</span></div>';
  } else {
    rHTML+='<p style="font-size:0.82rem;color:var(--ios-text-3)">Log more entries to see day-of-week patterns.</p>';
  }
  right.innerHTML=rHTML;
  layout.appendChild(left);layout.appendChild(right);container.appendChild(layout);

  var editBtn2=container.querySelector('#moodFvEdit');
  if(editBtn2)editBtn2.addEventListener('click',function(){var f=container.querySelector('#moodFvForm');if(f)f.style.display='';});
  var cancelBtn2=container.querySelector('#moodFvCancel');
  if(cancelBtn2)cancelBtn2.addEventListener('click',function(){var f=container.querySelector('#moodFvForm');if(f)f.style.display='none';});
  container.querySelectorAll('.app-mood-emoji-btn').forEach(function(btn){btn.addEventListener('click',function(){container.querySelectorAll('.app-mood-emoji-btn').forEach(function(b){b.classList.remove('selected');});btn.classList.add('selected');});});
  container.querySelectorAll('.app-mood-energy-btn').forEach(function(btn){btn.addEventListener('click',function(){container.querySelectorAll('.app-mood-energy-btn').forEach(function(b){b.classList.remove('selected');});btn.classList.add('selected');});});
  if(todayEntry){var mb=container.querySelector('[data-mood="'+todayEntry.mood+'"]');if(mb)mb.classList.add('selected');var eb=container.querySelector('[data-energy="'+todayEntry.energy+'"]');if(eb)eb.classList.add('selected');}
  var saveBtn2=container.querySelector('#moodFvSave');
  if(saveBtn2)saveBtn2.addEventListener('click',function(){
    var sm=container.querySelector('.app-mood-emoji-btn.selected');
    var se=container.querySelector('.app-mood-energy-btn.selected');
    var noteInp=container.querySelector('#moodFvNote');
    if(!sm||!se){var errEl=container.querySelector('#moodFvSaveErr');if(!errEl){errEl=document.createElement('span');errEl.id='moodFvSaveErr';errEl.style.cssText='color:#e74c3c;font-size:0.78rem;margin-left:6px';saveBtn2.parentNode.insertBefore(errEl,saveBtn2.nextSibling);}errEl.textContent='Select a mood and energy level.';return;}
    var data=getPersonalMood();
    data=data.filter(function(m){return m.date!==today;});
    data.unshift({date:today,mood:sm.dataset.mood,moodLabel:sm.dataset.label,energy:se.dataset.energy,note:noteInp?noteInp.value.trim():''});
    if(data.length>90)data=data.slice(0,90);
    setPersonalMood(data);renderMoodAppFull(container);
  });
}

function renderFocusAppFull(container) {
  container.innerHTML='';
  var today=getTodayISO(),allFocus=getPersonalFocus(),items=allFocus[today]||[];
  var layout=document.createElement('div');layout.className='app-full-two-col';
  var left=document.createElement('div');left.className='app-full-col';
  var right=document.createElement('div');right.className='app-full-col';
  var lHTML='<h3 class="app-full-col-heading">\ud83c\udfaf Today\'s Priorities</h3><p style="font-size:0.82rem;color:var(--ios-text-3);margin:0 0 10px">Up to 3 must-do items. Resets daily.</p>';
  items.forEach(function(item,idx){
    lHTML+='<div class="app-focus-row'+(item.done?' done':'')+'"><input type="checkbox" class="app-focus-cb" data-idx="'+idx+'"'+(item.done?' checked':'')+' /><span class="app-focus-text">'+escapeHTML(item.text)+'</span>'+(item.timeBlock?'<span class="app-focus-time-tag">\u23f0 '+escapeHTML(item.timeBlock)+'</span>':'')+'<button class="app-focus-del" data-del="'+idx+'" aria-label="Remove">\u2715</button></div>';
  });
  if(items.length<3){lHTML+='<div class="app-focus-add-row"><input type="text" id="focusFvInput" class="app-fv-text-input" placeholder="Priority #'+(items.length+1)+'\u2026"/><input type="time" id="focusFvTime" class="app-fv-time-small" title="Optional time block"/><button id="focusFvAdd" class="app-fv-save-btn">Add</button></div>';}
  if(items.length&&items.every(function(i){return i.done;})){lHTML+='<div class="app-focus-done-msg">\ud83c\udf89 All priorities completed!</div>';}
  lHTML+='<h4 class="app-full-section-heading" style="margin-top:20px">\ud83c\udf45 Pomodoro Timer</h4><div class="app-pomodoro"><div class="app-pom-display" id="pomFvDisplay">25:00</div><div class="app-pom-phase" id="pomFvPhase">Focus</div><div class="app-pom-controls"><button id="pomFvStart" class="app-fv-save-btn">\u25b6 Start</button><button id="pomFvPause" class="app-fv-cancel-btn" style="display:none">\u23f8 Pause</button><button id="pomFvReset" class="app-fv-link-btn">\u21ba Reset</button></div><div class="app-pom-counter" id="pomFvCounter">Sessions: 0</div></div>';
  left.innerHTML=lHTML;

  var DAY_N=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var rHTML='<h3 class="app-full-col-heading">\ud83d\udcc5 Weekly Completion</h3><div class="app-focus-heatmap">';
  for(var ni=6;ni>=0;ni--){var dd=new Date();dd.setDate(dd.getDate()-ni);var iso=dd.getFullYear()+'-'+pad2(dd.getMonth()+1)+'-'+pad2(dd.getDate());var dayItems=allFocus[iso]||[];var done2=dayItems.filter(function(x){return x.done;}).length;var total=dayItems.length;var cls=total>0&&done2===total?' all-done':total>0&&done2>0?' part-done':'';rHTML+='<div class="app-focus-hm-cell'+cls+'"><span class="app-focus-hm-day">'+DAY_N[dd.getDay()]+'</span><span class="app-focus-hm-score">'+(total>0?done2+'/'+total:'\u2013')+'</span></div>';}
  rHTML+='</div><h4 class="app-full-section-heading" style="margin-top:14px">\ud83d\udcdd Priority History</h4><div class="app-focus-history">';
  var hasHist=false;
  for(var hi=6;hi>=1;hi--){var hd=new Date();hd.setDate(hd.getDate()-hi);var hIso=hd.getFullYear()+'-'+pad2(hd.getMonth()+1)+'-'+pad2(hd.getDate());var dayItems2=allFocus[hIso]||[];if(!dayItems2.length)continue;hasHist=true;rHTML+='<div class="app-focus-hist-day"><strong>'+DAY_N[hd.getDay()]+' '+(hd.getMonth()+1)+'/'+(hd.getDate())+'</strong>';dayItems2.forEach(function(item){rHTML+='<div class="app-focus-hist-item'+(item.done?' done':'')+'">'+( item.done?'\u2705':'\u2b1c')+' '+escapeHTML(item.text)+'</div>';});rHTML+='</div>';}
  if(!hasHist)rHTML+='<p style="font-size:0.82rem;color:var(--ios-text-3)">No history yet.</p>';
  rHTML+='</div>';
  right.innerHTML=rHTML;
  layout.appendChild(left);layout.appendChild(right);container.appendChild(layout);

  container.querySelectorAll('.app-focus-cb').forEach(function(cb){cb.addEventListener('change',function(){var idx=parseInt(cb.dataset.idx,10);var f=getPersonalFocus();if(!f[today]||!f[today][idx])return;f[today][idx].done=cb.checked;setPersonalFocus(f);renderFocusAppFull(container);});});
  container.querySelectorAll('.app-focus-del').forEach(function(btn){btn.addEventListener('click',function(){var idx=parseInt(btn.dataset.del,10);var f=getPersonalFocus();if(f[today])f[today].splice(idx,1);setPersonalFocus(f);renderFocusAppFull(container);});});
  var addBtn=container.querySelector('#focusFvAdd');
  if(addBtn)addBtn.addEventListener('click',function(){var inp=container.querySelector('#focusFvInput');var tInp=container.querySelector('#focusFvTime');var text=inp?inp.value.trim():'';if(!text)return;var f=getPersonalFocus();if(!f[today])f[today]=[];if(f[today].length>=3){var errEl=container.querySelector('#focusFvAddErr');if(!errEl){errEl=document.createElement('span');errEl.id='focusFvAddErr';errEl.style.cssText='color:#e74c3c;font-size:0.78rem;display:block;margin-top:3px';addBtn.parentNode.appendChild(errEl);}errEl.textContent='Maximum 3 priorities per day.';return;}f[today].push({text:text,done:false,timeBlock:tInp&&tInp.value?tInp.value:''});setPersonalFocus(f);renderFocusAppFull(container);});
  var addInp=container.querySelector('#focusFvInput');
  if(addInp)addInp.addEventListener('keydown',function(e){if(e.key==='Enter'&&addBtn)addBtn.click();});

  // Pomodoro timer — use module-level _pomState to survive re-renders
  var POM_FOCUS=25*60,POM_BREAK=5*60;
  var pom=_pomState;
  // Clear any leftover interval from a previous render
  if(pom.interval){clearInterval(pom.interval);pom.interval=null;pom.running=false;}
  function updatePomDisp(){var m=Math.floor(pom.remaining/60),s=pom.remaining%60;var disp=container.querySelector('#pomFvDisplay');var phase=container.querySelector('#pomFvPhase');var cnt=container.querySelector('#pomFvCounter');if(disp)disp.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;if(phase)phase.textContent=pom.phase==='focus'?'\ud83c\udf45 Focus':'\u2615 Break';if(cnt)cnt.textContent='Sessions: '+pom.sessions;}
  var startBtn=container.querySelector('#pomFvStart'),pauseBtn=container.querySelector('#pomFvPause'),resetBtn=container.querySelector('#pomFvReset');
  if(startBtn)startBtn.addEventListener('click',function(){if(pom.running)return;pom.running=true;startBtn.style.display='none';if(pauseBtn)pauseBtn.style.display='';pom.interval=setInterval(function(){pom.remaining--;if(pom.remaining<=0){if(pom.phase==='focus'){pom.sessions++;pom.phase='break';pom.remaining=POM_BREAK;}else{pom.phase='focus';pom.remaining=POM_FOCUS;}}updatePomDisp();},1000);});
  if(pauseBtn)pauseBtn.addEventListener('click',function(){clearInterval(pom.interval);pom.interval=null;pom.running=false;startBtn.style.display='';pauseBtn.style.display='none';});
  if(resetBtn)resetBtn.addEventListener('click',function(){clearInterval(pom.interval);pom.interval=null;pom.running=false;pom.phase='focus';pom.remaining=POM_FOCUS;if(startBtn)startBtn.style.display='';if(pauseBtn)pauseBtn.style.display='none';updatePomDisp();});
  updatePomDisp();
}

function renderHydrationAppFull(container) {
  container.innerHTML='';
  var hyd=getPersonalHydration(),today=getTodayISO();
  if(!hyd.log)hyd.log={};if(!hyd.typeLog)hyd.typeLog={};if(!hyd.goalByDay)hyd.goalByDay={};
  var count=typeof hyd.log[today]==='number'?hyd.log[today]:0,goal=hyd.goal||8;
  var TYPES=[{id:'water',label:'Water',emoji:'\ud83d\udca7'},{id:'coffee',label:'Coffee',emoji:'\u2615'},{id:'tea',label:'Tea',emoji:'\ud83c\udf75'},{id:'juice',label:'Juice',emoji:'\ud83e\udd64'}];
  var layout=document.createElement('div');layout.className='app-full-two-col';
  var left=document.createElement('div');left.className='app-full-col';
  var right=document.createElement('div');right.className='app-full-col';
  var lHTML='<h3 class="app-full-col-heading">\ud83d\udca7 Today\'s Hydration</h3><div class="app-hydration-glasses">';
  for(var i=0;i<Math.min(goal,12);i++){lHTML+='<span class="app-hydration-glass'+(i<count?' filled':'')+'" data-gi="'+i+'">\ud83d\udca7</span>';}
  lHTML+='</div><div class="app-hydration-count-row"><span class="app-hydration-count-big">'+count+'</span><span style="color:var(--ios-text-3)"> / '+goal+' glasses</span></div>';
  lHTML+='<h4 class="app-full-section-heading">Quick Add by Type</h4><div class="app-hydration-type-row">';
  TYPES.forEach(function(dt){lHTML+='<button class="app-hyd-type-btn" data-type="'+dt.id+'" data-label="'+dt.label+'" data-emoji="'+dt.emoji+'">'+dt.emoji+'<span>'+dt.label+'</span></button>';});
  lHTML+='</div><div class="app-hydration-goal-row"><span>\ud83c\udfaf Goal:</span><input type="number" id="hydFvGoal" value="'+goal+'" min="1" max="20" class="app-fv-num-input"/><span>glasses</span><button id="hydFvReset" class="app-fv-link-btn" style="margin-left:auto">Reset today</button></div>';
  var todayLogs=Array.isArray(hyd.typeLog)?hyd.typeLog.filter(function(e){return e.date===today;}):[];
  lHTML+='<h4 class="app-full-section-heading" style="margin-top:14px">\ud83d\udccb Today\'s Log</h4>';
  if(todayLogs.length){lHTML+='<div class="app-hydration-time-log">';todayLogs.slice().reverse().forEach(function(e){lHTML+='<div class="app-hyd-log-row"><span>'+escapeHTML(e.emoji||'\ud83d\udca7')+'</span><span>'+escapeHTML(e.label||'Water')+'</span><span style="color:var(--ios-text-3);font-size:0.75rem">'+escapeHTML(e.time||'')+'</span></div>';});lHTML+='</div>';}
  else{lHTML+='<p style="font-size:0.82rem;color:var(--ios-text-3)">No drinks logged today yet.</p>';}
  left.innerHTML=lHTML;

  var DAY_S=['Su','Mo','Tu','We','Th','Fr','Sa'];
  var past7=[];
  for(var ni=6;ni>=0;ni--){var dd=new Date();dd.setDate(dd.getDate()-ni);var iso=dd.getFullYear()+'-'+pad2(dd.getMonth()+1)+'-'+pad2(dd.getDate());past7.push({label:DAY_S[dd.getDay()],value:typeof hyd.log[iso]==='number'?hyd.log[iso]:0,iso:iso});}
  var total7=past7.reduce(function(a,d){return a+d.value;},0);
  var bestDay=past7.reduce(function(a,b){return b.value>a.value?b:a;});
  var rHTML='<h3 class="app-full-col-heading">\ud83d\udcca 7-Day History</h3>'+_fvBarChart(past7,220,90,14,18,10,10,today)+
    '<p style="font-size:0.72rem;color:var(--ios-text-3);margin:4px 0 12px">Goal: '+goal+' glasses/day</p>'+
    '<div class="app-hydration-stats">'+
    '<div class="app-hyd-stat"><span class="app-hyd-stat-val">'+total7+'</span><span class="app-hyd-stat-lbl">Total this week</span></div>'+
    '<div class="app-hyd-stat"><span class="app-hyd-stat-val">'+(total7/7).toFixed(1)+'</span><span class="app-hyd-stat-lbl">Daily average</span></div>'+
    '<div class="app-hyd-stat"><span class="app-hyd-stat-val">'+bestDay.value+'</span><span class="app-hyd-stat-lbl">Best ('+bestDay.label+')</span></div></div>';
  var DAY_FULL=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  rHTML+='<h4 class="app-full-section-heading" style="margin-top:14px">\ud83d\uddd3\ufe0f Goal by Day</h4><div class="app-hyd-day-goals">';
  DAY_FULL.forEach(function(day){rHTML+='<div class="app-hyd-day-goal-row"><span style="min-width:36px">'+day+'</span><input type="number" class="app-hyd-day-inp app-fv-num-small" data-day="'+day+'" value="'+((hyd.goalByDay&&hyd.goalByDay[day])||goal)+'" min="1" max="20"/></div>';});
  rHTML+='</div>';
  right.innerHTML=rHTML;
  layout.appendChild(left);layout.appendChild(right);container.appendChild(layout);

  container.querySelectorAll('.app-hydration-glass').forEach(function(el){el.addEventListener('click',function(){var idx=parseInt(el.dataset.gi,10);var h=getPersonalHydration();if(!h.log)h.log={};h.log[today]=idx+1;setPersonalHydration(h);renderHydrationAppFull(container);});});
  container.querySelectorAll('.app-hyd-type-btn').forEach(function(btn){btn.addEventListener('click',function(){var h=getPersonalHydration();if(!h.log)h.log={};if(!Array.isArray(h.typeLog))h.typeLog=[];h.log[today]=(h.log[today]||0)+1;var now=new Date();var dt=TYPES.find(function(d){return d.id===btn.dataset.type;})||TYPES[0];h.typeLog.push({date:today,time:pad2(now.getHours())+':'+pad2(now.getMinutes()),label:btn.dataset.label,emoji:dt.emoji});setPersonalHydration(h);renderHydrationAppFull(container);});});
  var goalInp=container.querySelector('#hydFvGoal');
  if(goalInp)goalInp.addEventListener('change',function(){var h=getPersonalHydration();h.goal=parseInt(goalInp.value,10)||8;setPersonalHydration(h);renderHydrationAppFull(container);});
  var resetBtn=container.querySelector('#hydFvReset');
  if(resetBtn)resetBtn.addEventListener('click',function(){var h=getPersonalHydration();if(!h.log)h.log={};h.log[today]=0;setPersonalHydration(h);renderHydrationAppFull(container);});
  container.querySelectorAll('.app-hyd-day-inp').forEach(function(inp){inp.addEventListener('change',function(){var h=getPersonalHydration();if(!h.goalByDay)h.goalByDay={};h.goalByDay[inp.dataset.day]=parseInt(inp.value,10)||8;setPersonalHydration(h);});});
}


/* ══════════════════════════════════════════════════════════════
   MEAL PLANNER — FULL-SCREEN TABBED DASHBOARD
   ══════════════════════════════════════════════════════════════ */

var _MF_TYPES = [
  { key: 'breakfast', icon: '🌅', label: 'Breakfast', color: '#f39c12' },
  { key: 'lunch',     icon: '☀️',  label: 'Lunch',     color: '#27ae60' },
  { key: 'dinner',    icon: '🌙',  label: 'Dinner',    color: '#9b59b6' },
  { key: 'snacks',    icon: '🍎',  label: 'Snacks',    color: '#e74c3c' }
];

function getMacroGoals() {
  return safeParseStorage('personalMacroGoals', { protein: 150, carbs: 200, fat: 65 });
}
function setMacroGoals(v) { localStorage.setItem('personalMacroGoals', JSON.stringify(v)); }
function getPersonalRecipes() { return safeParseStorage('personalRecipes', []); }
function setPersonalRecipes(v) { localStorage.setItem('personalRecipes', JSON.stringify(v)); }

function renderMealAppFull(container) {
  var tab = container._mfTab || 'today';
  container._mfTab = tab;
  container.innerHTML = '';
  var TABS = [
    { key: 'today',     label: '📅 Today' },
    { key: 'week',      label: '📊 Week' },
    { key: 'nutrition', label: '🧬 Nutrition' },
    { key: 'recipes',   label: '📖 Recipes' },
    { key: 'favorites', label: '⭐ Favorites' }
  ];
  var tabBar = document.createElement('div');
  tabBar.className = 'mf-tab-bar';
  TABS.forEach(function(t) {
    var btn = document.createElement('button');
    btn.className = 'mf-tab-btn' + (t.key === tab ? ' active' : '');
    btn.textContent = t.label;
    btn.addEventListener('click', function() {
      container._mfTab = t.key;
      renderMealAppFull(container);
    });
    tabBar.appendChild(btn);
  });
  container.appendChild(tabBar);
  var body = document.createElement('div');
  body.className = 'mf-tab-body';
  container.appendChild(body);
  if (tab === 'today')         _mfToday(body, container);
  else if (tab === 'week')     _mfWeek(body, container);
  else if (tab === 'nutrition')_mfNutrition(body, container);
  else if (tab === 'recipes')  _mfRecipes(body, container);
  else if (tab === 'favorites')_mfFavorites(body, container);
}

/* SVG donut ring helper */
function _mfDonut(pct, size, color, label) {
  var r = (size - 8) / 2, cx = size / 2, cy = size / 2;
  var circ = 2 * Math.PI * r;
  var dash = Math.min(pct, 1) * circ;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#e0e0e0" stroke-width="7"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="7"' +
    ' stroke-dasharray="' + dash.toFixed(1) + ' ' + circ.toFixed(1) + '"' +
    ' stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>' +
    '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" font-size="' + Math.round(size * 0.16) + '" font-weight="700" fill="currentColor">' + label + '</text>' +
    '</svg>';
}

/* Sparkline SVG helper */
function _mfSparkline(values, W, H, color) {
  if (!values || values.length < 2) return '<div class="fv-chart-empty">No data</div>';
  var max = Math.max.apply(null, values);
  if (max <= 0) return '<div class="fv-chart-empty">No data</div>';
  var n = values.length;
  var pts = values.map(function(v, i) {
    var x = (i / (n - 1)) * (W - 8) + 4;
    var y = H - 6 - (v / max) * (H - 12);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  return '<svg width="100%" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
    '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/>' +
    '</svg>';
}

/* ── Tab 1: Today ── */
function _mfToday(body, container) {
  var today = getTodayISO();
  var allMeals = getPersonalMeals();
  var goal = getCalorieGoal();
  var macroGoals = getMacroGoals();
  var todayMeals = allMeals[today] || {};
  var totalCal = 0, totalP = 0, totalC = 0, totalF = 0;
  _MF_TYPES.forEach(function(t) {
    var m = todayMeals[t.key] || {};
    totalCal += (parseInt(m.calories, 10) || 0);
    totalP   += (parseInt(m.protein,  10) || 0);
    totalC   += (parseInt(m.carbs,    10) || 0);
    totalF   += (parseInt(m.fat,      10) || 0);
  });
  var calPct = goal > 0 ? totalCal / goal : 0;
  var pPct   = macroGoals.protein > 0 ? totalP / macroGoals.protein : 0;
  var cPct   = macroGoals.carbs   > 0 ? totalC / macroGoals.carbs   : 0;
  var fPct   = macroGoals.fat     > 0 ? totalF / macroGoals.fat     : 0;
  var calColor = calPct > 1 ? '#e74c3c' : (calPct > 0.8 ? '#27ae60' : 'var(--ios-accent, #4a90e2)');
  var wrap = document.createElement('div');
  wrap.className = 'mf-today-wrap';
  var chartCol = document.createElement('div');
  chartCol.className = 'mf-today-charts';
  chartCol.innerHTML =
    '<div class="mf-donut-main">' +
      _mfDonut(calPct, 120, calColor, Math.round(calPct * 100) + '%') +
      '<div class="mf-donut-main-label"><strong>' + totalCal + '</strong> / ' + goal + ' cal</div>' +
    '</div>' +
    '<div class="mf-macro-rings">' +
      '<div class="mf-macro-ring-item">' +
        _mfDonut(pPct, 64, '#e74c3c', Math.round(pPct * 100) + '%') +
        '<div class="mf-macro-ring-lbl">Protein<br><span>' + totalP + '/' + macroGoals.protein + 'g</span></div>' +
      '</div>' +
      '<div class="mf-macro-ring-item">' +
        _mfDonut(cPct, 64, '#f39c12', Math.round(cPct * 100) + '%') +
        '<div class="mf-macro-ring-lbl">Carbs<br><span>' + totalC + '/' + macroGoals.carbs + 'g</span></div>' +
      '</div>' +
      '<div class="mf-macro-ring-item">' +
        _mfDonut(fPct, 64, '#9b59b6', Math.round(fPct * 100) + '%') +
        '<div class="mf-macro-ring-lbl">Fat<br><span>' + totalF + '/' + macroGoals.fat + 'g</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="mf-goal-row"><label>🎯 Goal: <input type="number" class="app-fv-num-input mf-cal-goal-inp" value="' + goal + '" min="0" step="50"/> cal</label></div>';
  var timelineCol = document.createElement('div');
  timelineCol.className = 'mf-today-timeline';
  var tlHTML = '<h3 class="app-full-col-heading">🍽️ Today\'s Meals</h3>';
  _MF_TYPES.forEach(function(t) {
    var m = todayMeals[t.key] || {};
    var hasMeal = !!(m.name && m.name.trim());
    var macroHtml = '';
    if (m.protein || m.carbs || m.fat) {
      macroHtml = '<div class="mf-meal-macros">' +
        (m.protein ? '<span class="mf-macro-pill protein">P ' + m.protein + 'g</span>' : '') +
        (m.carbs   ? '<span class="mf-macro-pill carbs">C ' + m.carbs + 'g</span>' : '') +
        (m.fat     ? '<span class="mf-macro-pill fat">F ' + m.fat + 'g</span>' : '') +
        (m.fiber   ? '<span class="mf-macro-pill fiber">Fi ' + m.fiber + 'g</span>' : '') +
        '</div>';
    }
    var noteHtml = m.notes ? '<div class="mf-meal-notes">' + escapeHTML(m.notes) + '</div>' : '';
    tlHTML +=
      '<div class="mf-meal-card" style="--meal-color:' + t.color + '">' +
        '<div class="mf-meal-card-bar"></div>' +
        '<div class="mf-meal-card-body">' +
          '<div class="mf-meal-card-row">' +
            '<span class="mf-meal-icon">' + t.icon + '</span>' +
            '<div class="mf-meal-card-info">' +
              '<div class="mf-meal-card-label">' + escapeHTML(t.label) +
                (m.time ? ' <span class="mf-meal-time">@ ' + escapeHTML(m.time) + '</span>' : '') +
              '</div>' +
              '<div class="mf-meal-card-name">' + escapeHTML(m.name || 'Not planned') + '</div>' +
              macroHtml + noteHtml +
            '</div>' +
            '<div class="mf-meal-card-right">' +
              (hasMeal ? '<span class="mf-meal-cal-badge">' + (m.calories || 0) + ' cal</span>' : '') +
              '<button class="mf-meal-edit-btn" data-meal="' + t.key + '">✏️</button>' +
            '</div>' +
          '</div>' +
          '<div class="mf-meal-edit-panel" id="mfEdit_' + t.key + '" style="display:none">' +
            '<input type="text" class="mf-inp mf-inp-name app-fv-text-input" placeholder="What are you eating?" value="' + escapeHTML(m.name || '') + '"/>' +
            '<div class="mf-inp-row">' +
              '<input type="number" class="mf-inp mf-inp-cal app-fv-num-small" placeholder="Cal" min="0" value="' + (m.calories || '') + '"/>' +
              '<input type="time" class="mf-inp mf-inp-time app-fv-time-small" value="' + escapeHTML(m.time || '') + '" title="Meal time"/>' +
            '</div>' +
            '<div class="mf-inp-row">' +
              '<label class="mf-macro-inp-lbl">P<input type="number" class="mf-inp mf-inp-macro app-fv-num-small" data-macro="protein" placeholder="g" min="0" value="' + (m.protein || '') + '"/></label>' +
              '<label class="mf-macro-inp-lbl">C<input type="number" class="mf-inp mf-inp-macro app-fv-num-small" data-macro="carbs" placeholder="g" min="0" value="' + (m.carbs || '') + '"/></label>' +
              '<label class="mf-macro-inp-lbl">F<input type="number" class="mf-inp mf-inp-macro app-fv-num-small" data-macro="fat" placeholder="g" min="0" value="' + (m.fat || '') + '"/></label>' +
              '<label class="mf-macro-inp-lbl">Fi<input type="number" class="mf-inp mf-inp-macro app-fv-num-small" data-macro="fiber" placeholder="g" min="0" value="' + (m.fiber || '') + '"/></label>' +
            '</div>' +
            '<input type="text" class="mf-inp mf-inp-notes app-fv-note-input" placeholder="Notes (optional)" value="' + escapeHTML(m.notes || '') + '"/>' +
            '<div class="mf-edit-btns">' +
              '<button class="app-fv-save-btn mf-save-btn" data-meal="' + t.key + '">Save</button>' +
              '<button class="app-fv-cancel-btn mf-cancel-btn" data-meal="' + t.key + '">Cancel</button>' +
              '<button class="app-fv-link-btn mf-fav-btn" data-meal="' + t.key + '" title="Save as favourite">⭐ Fav</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  });
  tlHTML += '<div class="mf-quick-row">' +
    '<button class="app-fv-link-btn mf-quick-fav-btn">⭐ Quick-add from Favorites</button>' +
    '<button class="app-fv-link-btn mf-quick-water-btn">💧 Log Water</button>' +
    '</div>' +
    '<div id="mfQuickFavPanel" style="display:none;margin-top:6px"></div>';
  timelineCol.innerHTML = tlHTML;
  wrap.appendChild(chartCol);
  wrap.appendChild(timelineCol);
  body.appendChild(wrap);
  /* Wire: cal goal */
  var calGoalInp = chartCol.querySelector('.mf-cal-goal-inp');
  if (calGoalInp) {
    calGoalInp.addEventListener('change', function() {
      setCalorieGoal(parseInt(calGoalInp.value, 10) || 2000);
      renderMealAppFull(container);
    });
  }
  /* Wire: edit toggles */
  body.querySelectorAll('.mf-meal-edit-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var panel = body.querySelector('#mfEdit_' + btn.dataset.meal);
      if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  });
  /* Wire: cancel */
  body.querySelectorAll('.mf-cancel-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var panel = body.querySelector('#mfEdit_' + btn.dataset.meal);
      if (panel) panel.style.display = 'none';
    });
  });
  /* Wire: save */
  body.querySelectorAll('.mf-save-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var key = btn.dataset.meal;
      var panel = body.querySelector('#mfEdit_' + key);
      if (!panel) return;
      var nameInp  = panel.querySelector('.mf-inp-name');
      var calInp   = panel.querySelector('.mf-inp-cal');
      var timeInp  = panel.querySelector('.mf-inp-time');
      var notesInp = panel.querySelector('.mf-inp-notes');
      var meals = getPersonalMeals();
      if (!meals[today]) meals[today] = {};
      var entry = {
        name:     nameInp  ? nameInp.value.trim() : '',
        calories: calInp   ? (parseInt(calInp.value,  10) || 0) : 0,
        time:     timeInp  ? timeInp.value : '',
        notes:    notesInp ? notesInp.value.trim() : ''
      };
      panel.querySelectorAll('.mf-inp-macro').forEach(function(inp) {
        entry[inp.dataset.macro] = parseInt(inp.value, 10) || 0;
      });
      meals[today][key] = entry;
      setPersonalMeals(meals);
      renderMealAppFull(container);
    });
  });
  /* Wire: fav star */
  body.querySelectorAll('.mf-fav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var key = btn.dataset.meal;
      var panel = body.querySelector('#mfEdit_' + key);
      if (!panel) return;
      var nameInp = panel.querySelector('.mf-inp-name');
      var calInp  = panel.querySelector('.mf-inp-cal');
      var pInp    = panel.querySelector('[data-macro="protein"]');
      var cInp    = panel.querySelector('[data-macro="carbs"]');
      var fInp    = panel.querySelector('[data-macro="fat"]');
      var name = nameInp ? nameInp.value.trim() : '';
      if (!name) return;
      var favs = safeParseStorage('personalMealFavorites', []);
      favs.push({
        name:     name,
        calories: calInp ? (parseInt(calInp.value, 10) || 0) : 0,
        protein:  pInp   ? (parseInt(pInp.value,  10) || 0) : 0,
        carbs:    cInp   ? (parseInt(cInp.value,  10) || 0) : 0,
        fat:      fInp   ? (parseInt(fInp.value,  10) || 0) : 0
      });
      localStorage.setItem('personalMealFavorites', JSON.stringify(favs));
      btn.textContent = '✅ Saved!';
      setTimeout(function() { btn.textContent = '⭐ Fav'; }, 1500);
    });
  });
  /* Wire: quick-add from favorites */
  var quickFavBtn = body.querySelector('.mf-quick-fav-btn');
  var quickFavPanel = body.querySelector('#mfQuickFavPanel');
  if (quickFavBtn && quickFavPanel) {
    quickFavBtn.addEventListener('click', function() {
      if (quickFavPanel.style.display !== 'none') { quickFavPanel.style.display = 'none'; return; }
      var favs = safeParseStorage('personalMealFavorites', []);
      var recFavs = getPersonalRecipes().filter(function(r) { return r.favorite; });
      var allFavs = favs.concat(recFavs.map(function(r) {
        return { name: r.name, calories: r.totals ? (r.totals.calories || 0) : 0,
          protein: r.totals ? (r.totals.protein || 0) : 0,
          carbs:   r.totals ? (r.totals.carbs   || 0) : 0,
          fat:     r.totals ? (r.totals.fat     || 0) : 0 };
      }));
      if (!allFavs.length) {
        quickFavPanel.innerHTML = '<p style="color:var(--ios-text-3);font-size:0.82rem;padding:6px 0">No favorites saved yet.</p>';
        quickFavPanel.style.display = 'block';
        return;
      }
      var html = '<div class="mf-quick-fav-list">';
      allFavs.forEach(function(fav, fi) {
        html += '<div class="mf-quick-fav-item">' +
          '<div><strong>' + escapeHTML(fav.name || '') + '</strong><span class="mf-meal-time"> ' + (fav.calories || 0) + ' cal</span></div>' +
          '<select class="app-fv-select mf-fav-slot-sel" data-fi="' + fi + '">' +
            '<option value="">→ slot</option>' +
            '<option value="breakfast">Breakfast</option><option value="lunch">Lunch</option>' +
            '<option value="dinner">Dinner</option><option value="snacks">Snacks</option>' +
          '</select>' +
          '<button class="app-fv-save-btn mf-fav-use-btn" data-fi="' + fi + '">Add</button>' +
          '</div>';
      });
      html += '</div>';
      quickFavPanel.innerHTML = html;
      quickFavPanel.style.display = 'block';
      quickFavPanel.querySelectorAll('.mf-fav-use-btn').forEach(function(useBtn) {
        useBtn.addEventListener('click', function() {
          var fi = parseInt(useBtn.dataset.fi, 10);
          var sel = quickFavPanel.querySelector('.mf-fav-slot-sel[data-fi="' + fi + '"]');
          var slot = sel ? sel.value : '';
          if (!slot) return;
          var fav = allFavs[fi];
          var meals = getPersonalMeals();
          if (!meals[today]) meals[today] = {};
          meals[today][slot] = { name: fav.name || '', calories: fav.calories || 0,
            protein: fav.protein || 0, carbs: fav.carbs || 0, fat: fav.fat || 0, time: '' };
          setPersonalMeals(meals);
          renderMealAppFull(container);
        });
      });
    });
  }
  /* Wire: log water shortcut */
  var waterBtn = body.querySelector('.mf-quick-water-btn');
  if (waterBtn) {
    waterBtn.addEventListener('click', function() {
      var h = safeParseStorage('personalHydration', { goal: 8, log: {} });
      if (!h.log) h.log = {};
      var cur = typeof h.log[today] === 'number' ? h.log[today] : 0;
      h.log[today] = cur + 1;
      localStorage.setItem('personalHydration', JSON.stringify(h));
      waterBtn.textContent = '✅ +1 glass logged!';
      setTimeout(function() { waterBtn.textContent = '💧 Log Water'; }, 1500);
    });
  }
}

/* ── Tab 2: Week ── */
function _mfWeek(body, container) {
  var today = getTodayISO();
  var allMeals = getPersonalMeals();
  var goal = getCalorieGoal();
  var macroGoals = getMacroGoals();
  var days = getMealWeekDays();
  var weekTotals = days.map(function(wd) {
    var day = allMeals[wd.iso] || {};
    var cal = 0, p = 0, c = 0, f = 0;
    _MF_TYPES.forEach(function(t) {
      var m = day[t.key] || {};
      cal += parseInt(m.calories, 10) || 0;
      p   += parseInt(m.protein,  10) || 0;
      c   += parseInt(m.carbs,    10) || 0;
      f   += parseInt(m.fat,      10) || 0;
    });
    return { iso: wd.iso, dayName: wd.dayName, label: wd.label, cal: cal, p: p, c: c, f: f, isToday: wd.iso === today };
  });
  var avg = Math.round(weekTotals.reduce(function(s, d) { return s + d.cal; }, 0) / 7);
  var best = weekTotals.reduce(function(b, d) { return d.cal > b.cal ? d : b; }, weekTotals[0]);
  var streak = 0;
  for (var si = weekTotals.length - 1; si >= 0; si--) { if (weekTotals[si].cal > 0) streak++; else break; }
  var html = '<h3 class="app-full-col-heading">📊 This Week</h3><div class="mf-week-grid">';
  weekTotals.forEach(function(d) {
    var pct = goal > 0 ? Math.min(100, Math.round(d.cal / goal * 100)) : 0;
    var barColor = pct > 100 ? '#e74c3c' : (pct >= 80 ? '#27ae60' : 'var(--ios-accent)');
    var meals = allMeals[d.iso] || {};
    var pills = _MF_TYPES.map(function(t) {
      var m = meals[t.key] || {};
      return m.name ? '<div class="mf-week-pill" style="border-left:3px solid ' + t.color + '">' + escapeHTML(m.name.length > 12 ? m.name.slice(0, 12) + '…' : m.name) + '</div>' : '';
    }).join('');
    html += '<div class="mf-week-col' + (d.isToday ? ' today' : '') + '">' +
      '<div class="mf-week-col-hdr">' + d.dayName + '<span class="mf-week-col-date">' + d.label + '</span></div>' +
      '<div class="mf-week-meals">' + (pills || '<div class="mf-week-empty">—</div>') + '</div>' +
      '<div class="mf-week-cal-total">' + (d.cal ? d.cal + ' cal' : '—') + '</div>' +
      '<div class="mf-week-bar-wrap"><div class="mf-week-bar-fill" style="width:' + pct + '%;background:' + barColor + '"></div></div>' +
      '<div class="mf-week-pct">' + pct + '%</div>' +
    '</div>';
  });
  html += '</div>';
  html += '<div class="mf-week-stats">' +
    '<div class="mf-week-stat"><div class="mf-week-stat-val">' + avg + '</div><div class="mf-week-stat-lbl">Avg cal/day</div></div>' +
    '<div class="mf-week-stat"><div class="mf-week-stat-val">' + (best.cal || 0) + '</div><div class="mf-week-stat-lbl">Best day (' + best.dayName + ')</div></div>' +
    '<div class="mf-week-stat"><div class="mf-week-stat-val">' + streak + '</div><div class="mf-week-stat-lbl">Day streak</div></div>' +
  '</div>';
  var macros = [
    { key: 'p', label: 'Protein', color: '#e74c3c' },
    { key: 'c', label: 'Carbs',   color: '#f39c12' },
    { key: 'f', label: 'Fat',     color: '#9b59b6' }
  ];
  html += '<h4 class="app-full-section-heading">📈 Weekly Macro Trends</h4><div class="mf-macro-trends">';
  macros.forEach(function(macro) {
    var vals = weekTotals.map(function(d) { return d[macro.key]; });
    var weekAvg = Math.round(vals.reduce(function(a, b) { return a + b; }, 0) / 7);
    html += '<div class="mf-macro-trend-row">' +
      '<div class="mf-macro-trend-lbl" style="color:' + macro.color + '">' + macro.label + '</div>' +
      '<div class="mf-macro-trend-spark">' + _mfSparkline(vals, 180, 36, macro.color) + '</div>' +
      '<div class="mf-macro-trend-avg">' + weekAvg + 'g avg</div>' +
    '</div>';
  });
  html += '</div>';
  body.innerHTML = html;
}

/* ── Tab 3: Nutrition ── */
function _mfNutrition(body, container) {
  var today = getTodayISO();
  var allMeals = getPersonalMeals();
  var goal = getCalorieGoal();
  var macroGoals = getMacroGoals();
  var todayMeals = allMeals[today] || {};
  var totals = { cal: 0, p: 0, c: 0, f: 0, fi: 0, sug: 0, sod: 0 };
  _MF_TYPES.forEach(function(t) {
    var m = todayMeals[t.key] || {};
    totals.cal += parseInt(m.calories, 10) || 0;
    totals.p   += parseInt(m.protein,  10) || 0;
    totals.c   += parseInt(m.carbs,    10) || 0;
    totals.f   += parseInt(m.fat,      10) || 0;
    totals.fi  += parseInt(m.fiber,    10) || 0;
    totals.sug += parseInt(m.sugar,    10) || 0;
    totals.sod += parseInt(m.sodium,   10) || 0;
  });
  var calFromP = totals.p * 4, calFromC = totals.c * 4, calFromF = totals.f * 9;
  var ratioTotal = calFromP + calFromC + calFromF || 1;
  var pRatioPct = Math.round(calFromP / ratioTotal * 100);
  var cRatioPct = Math.round(calFromC / ratioTotal * 100);
  var fRatioPct = 100 - pRatioPct - cRatioPct;
  var rows = [
    { label: '🔥 Calories', val: totals.cal, tgt: goal,               unit: 'cal', color: 'var(--ios-accent)' },
    { label: '🥩 Protein',  val: totals.p,   tgt: macroGoals.protein, unit: 'g',   color: '#e74c3c' },
    { label: '🍞 Carbs',    val: totals.c,   tgt: macroGoals.carbs,   unit: 'g',   color: '#f39c12' },
    { label: '🥑 Fat',      val: totals.f,   tgt: macroGoals.fat,     unit: 'g',   color: '#9b59b6' },
    { label: '🌿 Fiber',    val: totals.fi,  tgt: 25,                 unit: 'g',   color: '#27ae60' },
    { label: '🍬 Sugar',    val: totals.sug, tgt: 50,                 unit: 'g',   color: '#e67e22' },
    { label: '🧂 Sodium',   val: totals.sod, tgt: 2300,               unit: 'mg',  color: '#3498db' }
  ];
  var html = '<h3 class="app-full-col-heading">🧬 Nutrition Details</h3><div class="mf-nutrition-table">';
  rows.forEach(function(row) {
    var pct = row.tgt > 0 ? Math.min(100, Math.round(row.val / row.tgt * 100)) : 0;
    html += '<div class="mf-nut-row">' +
      '<div class="mf-nut-label">' + row.label + '</div>' +
      '<div class="mf-nut-bar-wrap"><div class="mf-nut-bar-fill" style="width:' + pct + '%;background:' + row.color + '"></div></div>' +
      '<div class="mf-nut-vals">' + row.val + ' / ' + row.tgt + ' ' + row.unit + ' <span class="mf-nut-pct">(' + pct + '%)</span></div>' +
    '</div>';
  });
  html += '</div>';
  html += '<h4 class="app-full-section-heading">⚖️ Macro Ratio (% of calories)</h4>' +
    '<div class="mf-ratio-bar">' +
      '<div class="mf-ratio-seg" style="width:' + pRatioPct + '%;background:#e74c3c" title="Protein ' + pRatioPct + '%"></div>' +
      '<div class="mf-ratio-seg" style="width:' + cRatioPct + '%;background:#f39c12" title="Carbs ' + cRatioPct + '%"></div>' +
      '<div class="mf-ratio-seg" style="width:' + fRatioPct + '%;background:#9b59b6" title="Fat ' + fRatioPct + '%"></div>' +
    '</div>' +
    '<div class="mf-ratio-legend">' +
      '<span style="color:#e74c3c">🥩 P ' + pRatioPct + '%</span>' +
      '<span style="color:#f39c12">🍞 C ' + cRatioPct + '%</span>' +
      '<span style="color:#9b59b6">🥑 F ' + fRatioPct + '%</span>' +
    '</div>';
  var mGoals = getMacroGoals();
  html += '<h4 class="app-full-section-heading">⚙️ Macro Goals</h4>' +
    '<div class="mf-macro-goals-form">' +
      '<label class="mf-mg-lbl">Protein (g)<input type="number" class="app-fv-num-input mf-mg-inp" data-macro="protein" value="' + mGoals.protein + '" min="0"/></label>' +
      '<label class="mf-mg-lbl">Carbs (g)<input type="number" class="app-fv-num-input mf-mg-inp" data-macro="carbs"   value="' + mGoals.carbs   + '" min="0"/></label>' +
      '<label class="mf-mg-lbl">Fat (g)<input type="number" class="app-fv-num-input mf-mg-inp" data-macro="fat"     value="' + mGoals.fat     + '" min="0"/></label>' +
      '<button class="app-fv-save-btn mf-mg-save-btn">Save Goals</button>' +
    '</div>';
  var days = getMealWeekDays();
  var weekMacros = { cal: [], p: [], c: [], f: [] };
  days.forEach(function(wd) {
    var day = allMeals[wd.iso] || {};
    var wCal = 0, wP = 0, wC = 0, wF = 0;
    _MF_TYPES.forEach(function(t) {
      var m = day[t.key] || {};
      wCal += parseInt(m.calories, 10) || 0;
      wP   += parseInt(m.protein,  10) || 0;
      wC   += parseInt(m.carbs,    10) || 0;
      wF   += parseInt(m.fat,      10) || 0;
    });
    weekMacros.cal.push(wCal); weekMacros.p.push(wP); weekMacros.c.push(wC); weekMacros.f.push(wF);
  });
  html += '<h4 class="app-full-section-heading">📈 7-Day Macro Trends</h4><div class="mf-nut-sparks">' +
    '<div class="mf-nut-spark-item"><div class="mf-nut-spark-lbl" style="color:var(--ios-accent)">Calories</div>' + _mfSparkline(weekMacros.cal, 140, 36, 'var(--ios-accent)') + '</div>' +
    '<div class="mf-nut-spark-item"><div class="mf-nut-spark-lbl" style="color:#e74c3c">Protein</div>' + _mfSparkline(weekMacros.p, 140, 36, '#e74c3c') + '</div>' +
    '<div class="mf-nut-spark-item"><div class="mf-nut-spark-lbl" style="color:#f39c12">Carbs</div>' + _mfSparkline(weekMacros.c, 140, 36, '#f39c12') + '</div>' +
    '<div class="mf-nut-spark-item"><div class="mf-nut-spark-lbl" style="color:#9b59b6">Fat</div>' + _mfSparkline(weekMacros.f, 140, 36, '#9b59b6') + '</div>' +
  '</div>';
  body.innerHTML = html;
  var mgSave = body.querySelector('.mf-mg-save-btn');
  if (mgSave) {
    mgSave.addEventListener('click', function() {
      var goals = getMacroGoals();
      body.querySelectorAll('.mf-mg-inp').forEach(function(inp) {
        goals[inp.dataset.macro] = parseInt(inp.value, 10) || 0;
      });
      setMacroGoals(goals);
      renderMealAppFull(container);
    });
  }
}

/* ── Tab 4: Recipes Hub ── */
function _mfRecipes(body, container) {
  var recipes = getPersonalRecipes();
  container._mfRecipeMode = container._mfRecipeMode || 'list';
  var mode = container._mfRecipeMode;
  if (mode === 'create' || mode === 'edit') {
    _mfRecipeForm(body, container, mode === 'edit' ? container._mfEditRecipeIdx : null);
    return;
  }
  var html = '<h3 class="app-full-col-heading">📖 Recipes Hub</h3>' +
    '<div class="mf-recipe-toolbar">' +
      '<input type="text" class="app-fv-text-input mf-recipe-search" placeholder="🔍 Search recipes…"/>' +
      '<button class="app-fv-save-btn mf-recipe-new-btn">＋ New Recipe</button>' +
    '</div>';
  if (!recipes.length) {
    html += '<div class="mf-recipe-empty">No recipes yet. Create your first recipe!</div>';
  } else {
    html += '<div class="mf-recipe-list" id="mfRecipeList">';
    recipes.forEach(function(r, ri) {
      var tags = (r.tags || []).map(function(t) { return '<span class="mf-recipe-tag">' + escapeHTML(t) + '</span>'; }).join('');
      html += '<div class="mf-recipe-card" data-ri="' + ri + '">' +
        '<div class="mf-recipe-card-top">' +
          '<span class="mf-recipe-emoji">' + escapeHTML(r.emoji || '🍽️') + '</span>' +
          '<div class="mf-recipe-card-info">' +
            '<div class="mf-recipe-card-name">' + escapeHTML(r.name || '') + '</div>' +
            '<div class="mf-recipe-card-meta">' + (r.servings || 1) + ' serving' + ((r.servings || 1) !== 1 ? 's' : '') + (r.totals ? ' · ' + (r.totals.calories || 0) + ' cal/serving' : '') + '</div>' +
            (r.totals ? '<div class="mf-recipe-card-macros">P ' + (r.totals.protein || 0) + 'g · C ' + (r.totals.carbs || 0) + 'g · F ' + (r.totals.fat || 0) + 'g</div>' : '') +
            (tags ? '<div class="mf-recipe-tags">' + tags + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="mf-recipe-card-actions">' +
          '<button class="app-fv-save-btn mf-recipe-add-btn" data-ri="' + ri + '" style="font-size:0.76rem;padding:4px 10px">📅 Add to Meal</button>' +
          '<button class="app-fv-link-btn mf-recipe-fav-btn" data-ri="' + ri + '">' + (r.favorite ? '⭐ Saved' : '⭐ Fav') + '</button>' +
          '<button class="app-fv-link-btn mf-recipe-edit-btn" data-ri="' + ri + '">✏️ Edit</button>' +
          '<button class="app-fv-link-btn mf-recipe-del-btn" data-ri="' + ri + '">🗑️</button>' +
        '</div>' +
        '<div class="mf-recipe-add-panel" id="mfRecipeAdd_' + ri + '" style="display:none">' +
          '<select class="app-fv-select mf-recipe-day-sel">' +
            getMealWeekDays().map(function(wd) { return '<option value="' + wd.iso + '">' + wd.dayName + ' ' + wd.label + '</option>'; }).join('') +
          '</select>' +
          '<select class="app-fv-select mf-recipe-slot-sel">' +
            '<option value="breakfast">Breakfast</option><option value="lunch">Lunch</option>' +
            '<option value="dinner">Dinner</option><option value="snacks">Snacks</option>' +
          '</select>' +
          '<button class="app-fv-save-btn mf-recipe-confirm-add-btn" data-ri="' + ri + '">Add</button>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
  }
  body.innerHTML = html;
  var searchInp = body.querySelector('.mf-recipe-search');
  if (searchInp) {
    searchInp.addEventListener('input', function() {
      var q = searchInp.value.toLowerCase();
      body.querySelectorAll('.mf-recipe-card').forEach(function(card) {
        var name = (card.querySelector('.mf-recipe-card-name') || {}).textContent || '';
        card.style.display = name.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
      });
    });
  }
  var newBtn = body.querySelector('.mf-recipe-new-btn');
  if (newBtn) {
    newBtn.addEventListener('click', function() {
      container._mfRecipeMode = 'create';
      renderMealAppFull(container);
    });
  }
  body.querySelectorAll('.mf-recipe-add-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var ri = btn.dataset.ri;
      var panel = body.querySelector('#mfRecipeAdd_' + ri);
      if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    });
  });
  body.querySelectorAll('.mf-recipe-confirm-add-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var ri = parseInt(btn.dataset.ri, 10);
      var panel = body.querySelector('#mfRecipeAdd_' + ri);
      var recipe = recipes[ri];
      if (!recipe || !panel) return;
      var daySel  = panel.querySelector('.mf-recipe-day-sel');
      var slotSel = panel.querySelector('.mf-recipe-slot-sel');
      var dateISO = daySel  ? daySel.value  : getTodayISO();
      var slot    = slotSel ? slotSel.value : 'breakfast';
      var meals = getPersonalMeals();
      if (!meals[dateISO]) meals[dateISO] = {};
      meals[dateISO][slot] = {
        name:     recipe.name || '',
        calories: recipe.totals ? (recipe.totals.calories || 0) : 0,
        protein:  recipe.totals ? (recipe.totals.protein  || 0) : 0,
        carbs:    recipe.totals ? (recipe.totals.carbs    || 0) : 0,
        fat:      recipe.totals ? (recipe.totals.fat      || 0) : 0,
        recipeId: recipe.id || ''
      };
      setPersonalMeals(meals);
      panel.style.display = 'none';
      btn.textContent = '✅ Added!';
      setTimeout(function() { btn.textContent = 'Add'; }, 1500);
    });
  });
  body.querySelectorAll('.mf-recipe-fav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var ri = parseInt(btn.dataset.ri, 10);
      var recs = getPersonalRecipes();
      if (!recs[ri]) return;
      recs[ri].favorite = !recs[ri].favorite;
      setPersonalRecipes(recs);
      renderMealAppFull(container);
    });
  });
  body.querySelectorAll('.mf-recipe-edit-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      container._mfRecipeMode = 'edit';
      container._mfEditRecipeIdx = parseInt(btn.dataset.ri, 10);
      renderMealAppFull(container);
    });
  });
  body.querySelectorAll('.mf-recipe-del-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (!confirm('Delete this recipe?')) return;
      var ri = parseInt(btn.dataset.ri, 10);
      var recs = getPersonalRecipes();
      recs.splice(ri, 1);
      setPersonalRecipes(recs);
      renderMealAppFull(container);
    });
  });
}

function _mfRecipeForm(body, container, editIdx) {
  var isEdit = editIdx != null;
  var recipes = getPersonalRecipes();
  var recipe = isEdit ? (recipes[editIdx] || {}) : {};
  var ingredients = recipe.ingredients && recipe.ingredients.length
    ? recipe.ingredients
    : [{ name: '', amount: '', unit: 'g', calories: 0, protein: 0, carbs: 0, fat: 0 }];
  var html = '<div class="mf-recipe-form-header">' +
    '<button class="app-fv-link-btn mf-recipe-back-btn">← Back</button>' +
    '<h3 class="app-full-col-heading" style="margin-bottom:0">' + (isEdit ? '✏️ Edit Recipe' : '＋ New Recipe') + '</h3>' +
  '</div>' +
  '<div class="mf-recipe-form">' +
    '<div class="mf-rf-row">' +
      '<label class="mf-rf-lbl">Emoji<input type="text" class="mf-inp app-fv-num-small mf-rf-emoji" maxlength="2" value="' + escapeHTML(recipe.emoji || '🍽️') + '"/></label>' +
      '<label class="mf-rf-lbl" style="flex:1">Name<input type="text" class="mf-inp app-fv-text-input mf-rf-name" placeholder="e.g. Chicken Stir Fry" value="' + escapeHTML(recipe.name || '') + '"/></label>' +
      '<label class="mf-rf-lbl">Servings<input type="number" class="mf-inp app-fv-num-small mf-rf-servings" min="1" value="' + (recipe.servings || 1) + '"/></label>' +
    '</div>' +
    '<label class="mf-rf-lbl">Tags (comma-separated)<input type="text" class="mf-inp app-fv-text-input mf-rf-tags" placeholder="e.g. high-protein, vegetarian" value="' + escapeHTML((recipe.tags || []).join(', ')) + '"/></label>' +
    '<label class="mf-rf-lbl">Description<input type="text" class="mf-inp app-fv-text-input mf-rf-desc" placeholder="Optional" value="' + escapeHTML(recipe.description || '') + '"/></label>' +
    '<h4 class="app-full-section-heading">🥗 Ingredients</h4>' +
    '<div class="mf-ing-header"><span>Name</span><span>Amt</span><span>Unit</span><span>Cal</span><span>P g</span><span>C g</span><span>F g</span><span></span></div>' +
    '<div class="mf-ing-list" id="mfIngList">';
  ingredients.forEach(function(ing, ii) { html += _mfIngRow(ing); });
  html += '</div><button class="app-fv-link-btn mf-add-ing-btn">＋ Add Ingredient</button>' +
    '<div class="mf-rf-totals" id="mfRfTotals"></div>' +
    '<div class="mf-rf-actions">' +
      '<button class="app-fv-save-btn mf-rf-save-btn">' + (isEdit ? 'Update' : 'Save Recipe') + '</button>' +
      (isEdit ? '<button class="app-fv-link-btn mf-rf-fav-btn">⭐ ' + (recipe.favorite ? 'Remove Fav' : 'Save as Fav') + '</button>' : '') +
    '</div>' +
  '</div>';
  body.innerHTML = html;
  function recalcTotals() {
    var t = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    body.querySelectorAll('.mf-ing-row').forEach(function(row) {
      t.calories += parseInt((row.querySelector('.mf-ing-cal') || {}).value, 10) || 0;
      t.protein  += parseInt((row.querySelector('.mf-ing-p')   || {}).value, 10) || 0;
      t.carbs    += parseInt((row.querySelector('.mf-ing-c')   || {}).value, 10) || 0;
      t.fat      += parseInt((row.querySelector('.mf-ing-f')   || {}).value, 10) || 0;
    });
    var srv = Math.max(1, parseInt((body.querySelector('.mf-rf-servings') || {}).value, 10) || 1);
    var div = body.querySelector('#mfRfTotals');
    if (div) {
      div.innerHTML = '<div class="mf-rf-total-row">' +
        '<span>Per serving (' + srv + '):</span>' +
        '<span>🔥 ' + Math.round(t.calories / srv) + ' cal</span>' +
        '<span>🥩 P ' + Math.round(t.protein / srv) + 'g</span>' +
        '<span>🍞 C ' + Math.round(t.carbs / srv) + 'g</span>' +
        '<span>🥑 F ' + Math.round(t.fat / srv) + 'g</span>' +
      '</div>';
    }
    return { calories: Math.round(t.calories / srv), protein: Math.round(t.protein / srv), carbs: Math.round(t.carbs / srv), fat: Math.round(t.fat / srv) };
  }
  recalcTotals();
  body.addEventListener('input', recalcTotals);
  body.querySelectorAll('.mf-ing-row').forEach(function(row) { _mfWireIngRow(row, body); });
  var addIngBtn = body.querySelector('.mf-add-ing-btn');
  if (addIngBtn) {
    addIngBtn.addEventListener('click', function() {
      var list = body.querySelector('#mfIngList');
      if (!list) return;
      var tmp = document.createElement('div');
      tmp.innerHTML = _mfIngRow({ name: '', amount: '', unit: 'g', calories: 0, protein: 0, carbs: 0, fat: 0 });
      var row = tmp.firstElementChild;
      list.appendChild(row);
      _mfWireIngRow(row, body);
    });
  }
  var backBtn = body.querySelector('.mf-recipe-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', function() {
      container._mfRecipeMode = 'list';
      renderMealAppFull(container);
    });
  }
  var saveBtn = body.querySelector('.mf-rf-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      var name = (body.querySelector('.mf-rf-name') || {}).value || '';
      if (!name.trim()) { alert('Please enter a recipe name.'); return; }
      var srv  = Math.max(1, parseInt((body.querySelector('.mf-rf-servings') || {}).value, 10) || 1);
      var tags = ((body.querySelector('.mf-rf-tags') || {}).value || '').split(',').map(function(t) { return t.trim(); }).filter(Boolean);
      var ings = [];
      body.querySelectorAll('.mf-ing-row').forEach(function(row) {
        ings.push({
          name:     (row.querySelector('.mf-ing-name') || {}).value || '',
          amount:   (row.querySelector('.mf-ing-amt')  || {}).value || '',
          unit:     (row.querySelector('.mf-ing-unit') || {}).value || 'g',
          calories: parseInt((row.querySelector('.mf-ing-cal') || {}).value, 10) || 0,
          protein:  parseInt((row.querySelector('.mf-ing-p')   || {}).value, 10) || 0,
          carbs:    parseInt((row.querySelector('.mf-ing-c')   || {}).value, 10) || 0,
          fat:      parseInt((row.querySelector('.mf-ing-f')   || {}).value, 10) || 0
        });
      });
      var totals = recalcTotals();
      var recs = getPersonalRecipes();
      var rec = {
        id:          isEdit ? (recipe.id || Date.now().toString(36) + Math.random().toString(36).slice(2)) : Date.now().toString(36) + Math.random().toString(36).slice(2),
        name:        name.trim(),
        emoji:       (body.querySelector('.mf-rf-emoji') || {}).value || '🍽️',
        description: (body.querySelector('.mf-rf-desc') || {}).value || '',
        tags:        tags,
        servings:    srv,
        ingredients: ings,
        totals:      totals,
        favorite:    isEdit ? (recipe.favorite || false) : false
      };
      if (isEdit) { recs[editIdx] = rec; } else { recs.push(rec); }
      setPersonalRecipes(recs);
      container._mfRecipeMode = 'list';
      renderMealAppFull(container);
    });
  }
  var favBtn = body.querySelector('.mf-rf-fav-btn');
  if (favBtn && isEdit) {
    favBtn.addEventListener('click', function() {
      var recs = getPersonalRecipes();
      if (!recs[editIdx]) return;
      recs[editIdx].favorite = !recs[editIdx].favorite;
      setPersonalRecipes(recs);
      container._mfRecipeMode = 'list';
      renderMealAppFull(container);
    });
  }
}

function _mfIngRow(ing) {
  var units = ['g','oz','cup','tbsp','tsp','ml','piece'];
  var unitOpts = units.map(function(u) { return '<option value="' + u + '"' + (ing.unit === u ? ' selected' : '') + '>' + u + '</option>'; }).join('');
  return '<div class="mf-ing-row">' +
    '<input type="text" class="mf-ing-name app-fv-text-input" placeholder="Ingredient" value="' + escapeHTML(ing.name || '') + '"/>' +
    '<input type="text" class="mf-ing-amt app-fv-num-small" placeholder="Amt" value="' + escapeHTML(String(ing.amount || '')) + '"/>' +
    '<select class="mf-ing-unit app-fv-select">' + unitOpts + '</select>' +
    '<input type="number" class="mf-ing-cal app-fv-num-small" placeholder="Cal" min="0" value="' + (ing.calories || '') + '"/>' +
    '<input type="number" class="mf-ing-p app-fv-num-small" placeholder="P" min="0" value="' + (ing.protein || '') + '"/>' +
    '<input type="number" class="mf-ing-c app-fv-num-small" placeholder="C" min="0" value="' + (ing.carbs || '') + '"/>' +
    '<input type="number" class="mf-ing-f app-fv-num-small" placeholder="F" min="0" value="' + (ing.fat || '') + '"/>' +
    '<button class="mf-ing-del-btn app-fv-link-btn" title="Remove">✕</button>' +
  '</div>';
}

function _mfWireIngRow(row, body) {
  var delBtn = row ? row.querySelector('.mf-ing-del-btn') : null;
  if (delBtn) {
    delBtn.addEventListener('click', function() {
      row.remove();
      body.dispatchEvent(new Event('input'));
    });
  }
}

/* ── Tab 5: Favorites ── */
function _mfFavorites(body, container) {
  var favs = safeParseStorage('personalMealFavorites', []);
  var recFavs = getPersonalRecipes().filter(function(r) { return r.favorite; });
  var sortBy = container._mfFavSort || 'name';
  container._mfFavSort = sortBy;
  var allFavs = favs.map(function(f, i) {
    return { _type: 'manual', _idx: i, name: f.name || '', calories: f.calories || 0, protein: f.protein || 0, carbs: f.carbs || 0, fat: f.fat || 0 };
  }).concat(recFavs.map(function(r) {
    return { _type: 'recipe', _id: r.id, name: r.name || '',
      calories: r.totals ? (r.totals.calories || 0) : 0,
      protein:  r.totals ? (r.totals.protein  || 0) : 0,
      carbs:    r.totals ? (r.totals.carbs    || 0) : 0,
      fat:      r.totals ? (r.totals.fat      || 0) : 0 };
  }));
  if (sortBy === 'calories') { allFavs.sort(function(a, b) { return b.calories - a.calories; }); }
  else { allFavs.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); }); }
  var html = '<h3 class="app-full-col-heading">⭐ Favorites</h3>' +
    '<div class="mf-fav-toolbar">' +
      '<span style="font-size:0.82rem;color:var(--ios-text-3)">' + allFavs.length + ' saved</span>' +
      '<div class="mf-fav-sort">Sort: ' +
        '<button class="app-fv-link-btn mf-fav-sort-btn' + (sortBy === 'name' ? ' active' : '') + '" data-sort="name">Name</button> | ' +
        '<button class="app-fv-link-btn mf-fav-sort-btn' + (sortBy === 'calories' ? ' active' : '') + '" data-sort="calories">Calories</button>' +
      '</div>' +
    '</div>';
  if (!allFavs.length) {
    html += '<div class="mf-recipe-empty">No favorites yet. Star meals or recipes to save them here.</div>';
  } else {
    html += '<div class="mf-fav-list">';
    allFavs.forEach(function(fav, fi) {
      html += '<div class="mf-fav-item">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
          '<div class="mf-fav-item-info">' +
            '<div class="mf-fav-item-name">' + escapeHTML(fav.name) + (fav._type === 'recipe' ? ' <span class="mf-recipe-tag">recipe</span>' : '') + '</div>' +
            '<div class="mf-fav-item-macros">' + fav.calories + ' cal' +
              (fav.protein ? ' · P ' + fav.protein + 'g' : '') +
              (fav.carbs   ? ' · C ' + fav.carbs   + 'g' : '') +
              (fav.fat     ? ' · F ' + fav.fat     + 'g' : '') +
            '</div>' +
          '</div>' +
          '<div class="mf-fav-item-actions">' +
            '<button class="app-fv-save-btn mf-fav-add-today-btn" data-fi="' + fi + '" style="font-size:0.74rem;padding:3px 8px">➕ Add</button>' +
            (fav._type === 'manual' ? '<button class="app-fv-link-btn mf-fav-del-btn" data-idx="' + fav._idx + '" style="color:#e74c3c" title="Remove">✕</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="mf-fav-add-panel" id="mfFavAdd_' + fi + '" style="display:none;gap:6px;flex-wrap:wrap;margin-top:6px">' +
          '<select class="app-fv-select mf-fav-slot-sel">' +
            '<option value="breakfast">Breakfast</option><option value="lunch">Lunch</option>' +
            '<option value="dinner">Dinner</option><option value="snacks">Snacks</option>' +
          '</select>' +
          '<button class="app-fv-save-btn mf-fav-confirm-btn" data-fi="' + fi + '">Add to Today</button>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
  }
  html += '<h4 class="app-full-section-heading">＋ New Favorite</h4>' +
    '<div class="mf-new-fav-form">' +
      '<input type="text" class="app-fv-text-input mf-nf-name" placeholder="Meal name"/>' +
      '<input type="number" class="app-fv-num-small mf-nf-cal" placeholder="Cal" min="0"/>' +
      '<label class="mf-macro-inp-lbl">P<input type="number" class="app-fv-num-small mf-nf-p" placeholder="g" min="0"/></label>' +
      '<label class="mf-macro-inp-lbl">C<input type="number" class="app-fv-num-small mf-nf-c" placeholder="g" min="0"/></label>' +
      '<label class="mf-macro-inp-lbl">F<input type="number" class="app-fv-num-small mf-nf-f" placeholder="g" min="0"/></label>' +
      '<button class="app-fv-save-btn mf-nf-save-btn">Save</button>' +
    '</div>';
  body.innerHTML = html;
  body.querySelectorAll('.mf-fav-sort-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      container._mfFavSort = btn.dataset.sort;
      renderMealAppFull(container);
    });
  });
  body.querySelectorAll('.mf-fav-add-today-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var panel = body.querySelector('#mfFavAdd_' + btn.dataset.fi);
      if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    });
  });
  body.querySelectorAll('.mf-fav-confirm-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var fi = parseInt(btn.dataset.fi, 10);
      var fav = allFavs[fi];
      if (!fav) return;
      var panel = body.querySelector('#mfFavAdd_' + fi);
      var slotSel = panel ? panel.querySelector('.mf-fav-slot-sel') : null;
      var slot = slotSel ? slotSel.value : 'breakfast';
      var today = getTodayISO();
      var meals = getPersonalMeals();
      if (!meals[today]) meals[today] = {};
      meals[today][slot] = { name: fav.name, calories: fav.calories || 0, protein: fav.protein || 0, carbs: fav.carbs || 0, fat: fav.fat || 0, time: '' };
      setPersonalMeals(meals);
      if (panel) panel.style.display = 'none';
      btn.textContent = '✅ Added!';
      setTimeout(function() { btn.textContent = 'Add to Today'; }, 1500);
    });
  });
  body.querySelectorAll('.mf-fav-del-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(btn.dataset.idx, 10);
      var fs = safeParseStorage('personalMealFavorites', []);
      fs.splice(idx, 1);
      localStorage.setItem('personalMealFavorites', JSON.stringify(fs));
      renderMealAppFull(container);
    });
  });
  var nfSave = body.querySelector('.mf-nf-save-btn');
  if (nfSave) {
    nfSave.addEventListener('click', function() {
      var name = (body.querySelector('.mf-nf-name') || {}).value || '';
      if (!name.trim()) return;
      var fs = safeParseStorage('personalMealFavorites', []);
      fs.push({
        name:     name.trim(),
        calories: parseInt((body.querySelector('.mf-nf-cal') || {}).value, 10) || 0,
        protein:  parseInt((body.querySelector('.mf-nf-p')   || {}).value, 10) || 0,
        carbs:    parseInt((body.querySelector('.mf-nf-c')   || {}).value, 10) || 0,
        fat:      parseInt((body.querySelector('.mf-nf-f')   || {}).value, 10) || 0
      });
      localStorage.setItem('personalMealFavorites', JSON.stringify(fs));
      renderMealAppFull(container);
    });
  }
}


function renderGymAppFull(container) {
  container.innerHTML='';
  var gym=getPersonalGym(),today=getTodayISO();
  var routines=gym.routines||[],log=gym.log||{},todayLog=log[today]||{};
  var layout=document.createElement('div');layout.className='app-full-two-col';
  var left=document.createElement('div');left.className='app-full-col';
  var right=document.createElement('div');right.className='app-full-col';
  var lHTML='<h3 class="app-full-col-heading">\ud83c\udfcb\ufe0f Today\'s Workout</h3>';
  if(!routines.length){lHTML+='<p style="font-size:0.85rem;color:var(--ios-text-3)">No routines set up yet. Go to the Personal page to add gym routines.</p>';}
  else{routines.forEach(function(routine,ri){lHTML+='<div class="app-gym-routine"><div class="app-gym-routine-name">'+escapeHTML(routine.name||'Routine '+(ri+1))+'</div>';(routine.exercises||[]).forEach(function(ex,ei){var exLog=(todayLog[ri]&&todayLog[ri][ei])||{sets:ex.sets||3,reps:ex.reps||10,weight:''};lHTML+='<div class="app-gym-ex-row"><span class="app-gym-ex-name">'+escapeHTML(ex.name||'')+'</span><input type="number" class="app-gym-inp app-fv-num-small" data-ri="'+ri+'" data-ei="'+ei+'" data-field="sets" value="'+(exLog.sets||3)+'" min="1" max="20"/><span style="font-size:0.75rem;color:var(--ios-text-3)">\u00d7</span><input type="number" class="app-gym-inp app-fv-num-small" data-ri="'+ri+'" data-ei="'+ei+'" data-field="reps" value="'+(exLog.reps||10)+'" min="1" max="100"/><input type="number" class="app-gym-inp app-fv-num-small" data-ri="'+ri+'" data-ei="'+ei+'" data-field="weight" value="'+(exLog.weight||'')+'" min="0" step="2.5" placeholder="kg"/></div>';});lHTML+='</div>';});lHTML+='<button id="gymFvSave" class="app-fv-save-btn" style="margin-top:10px">\ud83d\udcbe Save Today\'s Log</button>';}
  left.innerHTML=lHTML;
  var bodyM=safeParseStorage('personalBodyMeasurements',[]),latestM=bodyM[bodyM.length-1]||{};
  var rHTML='<h3 class="app-full-col-heading">\ud83d\udcaa 1-Rep Max Calculator</h3><p style="font-size:0.82rem;color:var(--ios-text-3);margin:0 0 10px">Epley formula: weight \u00d7 (1 + reps/30)</p><div class="app-1rm-form"><label>Weight <input type="number" id="ormWeight" class="app-fv-num-input" placeholder="kg" min="0" step="2.5"/></label><label>Reps <input type="number" id="ormReps" class="app-fv-num-input" placeholder="reps" min="1" max="30"/></label><button id="ormCalc" class="app-fv-save-btn">Calculate</button></div><div id="ormResult" class="app-1rm-result"></div>';
  rHTML+='<h4 class="app-full-section-heading" style="margin-top:20px">\ud83d\udccf Body Measurements</h4><div class="app-body-measure-form"><label>Body weight (kg) <input type="number" id="bmWeight" class="app-fv-num-input" value="'+(latestM.weight||'')+'" min="0" step="0.1"/></label><label>Body fat % <input type="number" id="bmFat" class="app-fv-num-input" value="'+(latestM.fat||'')+'" min="0" max="60" step="0.1"/></label><button id="bmSave" class="app-fv-save-btn">Log Today</button></div>';
  if(bodyM.length){var weightBars=bodyM.slice(-8).map(function(m){return{label:(m.date||'').slice(5),value:parseFloat(m.weight)||0,iso:m.date||''};});if(weightBars.some(function(b){return b.value>0;})){rHTML+='<h4 class="app-full-section-heading" style="margin-top:12px">Weight trend</h4>'+_fvBarChart(weightBars,220,70,12,16,8,8,today);}rHTML+='<div class="app-body-history">';bodyM.slice(-5).reverse().forEach(function(m){rHTML+='<div class="app-body-hist-row"><span style="color:var(--ios-text-3);font-size:0.78rem">'+escapeHTML(m.date||'')+'</span><span>'+(m.weight?m.weight+' kg':'')+'</span><span>'+(m.fat?m.fat+'% fat':'')+'</span></div>';});rHTML+='</div>';}
  right.innerHTML=rHTML;
  layout.appendChild(left);layout.appendChild(right);container.appendChild(layout);
  container.querySelectorAll('.app-gym-inp').forEach(function(inp){inp.addEventListener('change',function(){var ri=parseInt(inp.dataset.ri,10),ei=parseInt(inp.dataset.ei,10);var g=getPersonalGym();if(!g.log)g.log={};if(!g.log[today])g.log[today]={};if(!g.log[today][ri])g.log[today][ri]={};if(!g.log[today][ri][ei])g.log[today][ri][ei]={};g.log[today][ri][ei][inp.dataset.field]=parseFloat(inp.value)||0;setPersonalGym(g);});});
  var saveGym=container.querySelector('#gymFvSave');if(saveGym)saveGym.addEventListener('click',function(){saveGym.textContent='\u2705 Saved!';setTimeout(function(){saveGym.textContent='\ud83d\udcbe Save Today\'s Log';},1500);});
  var ormCalc=container.querySelector('#ormCalc');if(ormCalc)ormCalc.addEventListener('click',function(){var wt=parseFloat((container.querySelector('#ormWeight')||{}).value)||0;var rp=parseInt((container.querySelector('#ormReps')||{}).value,10)||0;var res=container.querySelector('#ormResult');if(!wt||!rp){if(res)res.textContent='Enter weight and reps.';return;}var orm=(wt*(1+rp/30)).toFixed(1);if(res)res.innerHTML='<strong>'+orm+' kg</strong> estimated 1RM';});
  var bmSave=container.querySelector('#bmSave');if(bmSave)bmSave.addEventListener('click',function(){var wtInp=container.querySelector('#bmWeight'),fatInp=container.querySelector('#bmFat');var bm=safeParseStorage('personalBodyMeasurements',[]);bm=bm.filter(function(m){return m.date!==today;});bm.push({date:today,weight:parseFloat((wtInp||{}).value)||0,fat:parseFloat((fatInp||{}).value)||0});if(bm.length>90)bm=bm.slice(-90);localStorage.setItem('personalBodyMeasurements',JSON.stringify(bm));renderGymAppFull(container);});
}

function renderRoutineAppFull(container) {
  container.innerHTML = '';

  /* ── Use the advanced multi-phase widget from desktop-personal.js if loaded ── */
  if (typeof window.renderDeskRoutineWidget === 'function') {
    try {
      window.renderDeskRoutineWidget(); /* renders into personalRoutineSection */
      var routineSection = document.getElementById('personalRoutineSection');
      if (routineSection) {
        routineSection.classList.remove('hidden');
        container.appendChild(routineSection);
        return;
      }
      /* personalRoutineSection not found — fall through to basic view */
    } catch(e) { /* render failed — fall through to basic view */ }
  }

  /* ── Fallback: basic two-column view ── */
  var routines=getPersonalRoutines(),today=getTodayISO(),log=getPersonalRoutineLog();
  if(!log[today])log[today]={morning:[],evening:[]};
  var todayLog=log[today];
  var layout=document.createElement('div');layout.className='app-full-two-col';
  var left=document.createElement('div');left.className='app-full-col';
  var right=document.createElement('div');right.className='app-full-col';
  function buildPeriod(period,emoji){
    var items=routines[period]||[],checked=todayLog[period]||[],done=checked.length,total=items.length,pct=total>0?Math.round(done/total*100):0;
    var h='<h4 class="app-full-section-heading">'+emoji+' '+period.charAt(0).toUpperCase()+period.slice(1)+' Routine ('+done+'/'+total+')</h4>';
    if(total)h+='<div class="app-routine-pbar"><div style="width:'+pct+'%;background:'+(pct===100?'#27ae60':'var(--ios-accent)')+';height:5px;border-radius:3px"></div></div>';
    items.forEach(function(item,idx){var isDone=checked.indexOf(idx)>=0;h+='<div class="app-routine-item'+(isDone?' done':'')+'" data-period="'+period+'" data-idx="'+idx+'"><input type="checkbox" class="app-routine-cb"'+(isDone?' checked':'')+'/><span>'+escapeHTML(typeof item==='string'?item:(item.text||item.name||''))+'</span></div>';});
    if(!total)h+='<p style="font-size:0.82rem;color:var(--ios-text-3)">No steps yet.</p>';
    return h;
  }
  left.innerHTML='<h3 class="app-full-col-heading">\ud83c\udf05 Daily Routine</h3>'+buildPeriod('morning','\ud83c\udf05');
  var heatHTML='<h3 class="app-full-col-heading">\ud83c\udf19 Evening & History</h3>'+buildPeriod('evening','\ud83c\udf19');
  heatHTML+='<h4 class="app-full-section-heading" style="margin-top:16px">\ud83d\udcc5 28-Day Completion</h4><div class="app-routine-heatmap">';
  for(var ni=27;ni>=0;ni--){var dd=new Date();dd.setDate(dd.getDate()-ni);var iso=dd.getFullYear()+'-'+pad2(dd.getMonth()+1)+'-'+pad2(dd.getDate());var dLog=log[iso]||{};var dDone=((dLog.morning||[]).length)+((dLog.evening||[]).length);var dTotal=(routines.morning||[]).length+(routines.evening||[]).length;var cls=dTotal>0&&dDone===dTotal?' all-done':dDone>0?' part-done':'';heatHTML+='<div class="app-routine-hm-cell'+cls+'" title="'+iso+'"></div>';}
  heatHTML+='</div>';
  var exportLines=[];['morning','evening'].forEach(function(p){exportLines.push(p.charAt(0).toUpperCase()+p.slice(1)+' Routine:');(routines[p]||[]).forEach(function(item,i){exportLines.push('  '+(i+1)+'. '+(typeof item==='string'?item:(item.text||item.name||'')));});});
  heatHTML+='<button id="routineFvExport" class="app-fv-link-btn" style="margin-top:10px">\ud83d\udccb Copy routine as text</button>';
  right.innerHTML=heatHTML;
  layout.appendChild(left);layout.appendChild(right);container.appendChild(layout);
  container.querySelectorAll('.app-routine-cb').forEach(function(cb){cb.addEventListener('change',function(){var row=cb.closest('[data-period]');if(!row)return;var period=row.dataset.period,idx=parseInt(row.dataset.idx,10);var l=getPersonalRoutineLog();if(!l[today])l[today]={morning:[],evening:[]};if(!l[today][period])l[today][period]=[];if(cb.checked){if(l[today][period].indexOf(idx)<0)l[today][period].push(idx);}else{l[today][period]=l[today][period].filter(function(i){return i!==idx;});}setPersonalRoutineLog(l);renderRoutineAppFull(container);});});
  var expBtn=container.querySelector('#routineFvExport');if(expBtn)expBtn.addEventListener('click',function(){try{navigator.clipboard.writeText(exportLines.join('\n'));expBtn.textContent='\u2705 Copied!';setTimeout(function(){expBtn.textContent='\ud83d\udccb Copy routine as text';},2000);}catch(e){alert(exportLines.join('\n'));}});
}

function renderBudgetAppFull(container) {
  container.innerHTML='';
  var budget=getPersonalBudget(),bills=budget.bills||[],oneTime=budget.oneTimeExpenses||[];
  var layout=document.createElement('div');layout.className='app-full-two-col';
  var left=document.createElement('div');left.className='app-full-col';
  var right=document.createElement('div');right.className='app-full-col';
  var jobIncome=typeof calcBudgetJobIncome==='function'?calcBudgetJobIncome():0;
  var billsTotal=bills.reduce(function(s,b){return s+(parseFloat(b.amount)||0);},0);
  var oneTimeTotal=oneTime.reduce(function(s,e){return s+(parseFloat(e.amount)||0);},0);
  var netMonthly=jobIncome-billsTotal-oneTimeTotal;
  var lHTML='<h3 class="app-full-col-heading">\ud83d\udcb0 Budget Overview</h3>'+
    '<div class="app-budget-summary-row"><span>\ud83d\udcc8 Income (30 days)</span><span style="color:#27ae60;font-weight:700">$'+jobIncome.toFixed(2)+'</span></div>'+
    '<div class="app-budget-summary-row"><span>\ud83d\udccb Recurring Bills/mo</span><span style="color:#e74c3c">$'+billsTotal.toFixed(2)+'</span></div>'+
    '<div class="app-budget-summary-row"><span>\ud83d\udcb8 One-time Expenses</span><span style="color:#e74c3c">$'+oneTimeTotal.toFixed(2)+'</span></div>'+
    '<div class="app-budget-summary-row app-budget-net"><span>\ud83d\udcb5 Net (approx)</span><span style="color:'+(netMonthly>=0?'#27ae60':'#e74c3c')+';font-weight:700">'+(netMonthly>=0?'+':'')+'$'+netMonthly.toFixed(2)+'</span></div>';
  lHTML+='<div class="app-budget-toggle-row"><span>\ud83d\udccb Bills</span><label style="display:flex;align-items:center;gap:4px;font-size:0.8rem"><input type="checkbox" id="budgFvAnnual"/><span>Show annual</span></label></div><div id="budgFvBillsList" class="app-budget-bills-list">';
  bills.forEach(function(bill){lHTML+='<div class="app-budget-bill-row"><span>'+escapeHTML(bill.emoji||'\ud83d\udcb3')+' '+escapeHTML(bill.name||'')+'</span><span class="app-budget-bill-amt" data-monthly="'+(bill.amount||0)+'">$'+parseFloat(bill.amount||0).toFixed(2)+'/mo</span></div>';});
  if(!bills.length)lHTML+='<p style="font-size:0.82rem;color:var(--ios-text-3)">No bills added yet.</p>';
  lHTML+='</div>';
  left.innerHTML=lHTML;
  var savings=safeParseStorage('personalSavingsGoals',[]);
  var rHTML='<h3 class="app-full-col-heading">\ud83c\udfe6 Savings Goals</h3>';
  savings.forEach(function(goal,gi){var pct=goal.target>0?Math.min(100,Math.round((goal.current||0)/goal.target*100)):0;rHTML+='<div class="app-savings-goal"><div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:4px"><span>'+escapeHTML(goal.emoji||'\ud83c\udfaf')+' '+escapeHTML(goal.name||'')+'</span><span style="color:var(--ios-text-3)">'+(goal.current||0)+' / $'+goal.target+'</span></div><div class="app-savings-bar"><div style="width:'+pct+'%;background:#27ae60;height:5px;border-radius:3px"></div></div><div style="font-size:0.75rem;color:var(--ios-text-3);margin-top:2px">'+pct+'% complete</div><div style="display:flex;gap:4px;margin-top:4px"><input type="number" class="app-savings-inp app-fv-num-small" data-gi="'+gi+'" value="'+(goal.current||0)+'" min="0" step="10" placeholder="Current"/><button class="app-savings-upd app-fv-save-btn" data-gi="'+gi+'" style="padding:3px 8px;font-size:0.78rem">Update</button></div></div>';});
  rHTML+='<div class="app-savings-add-form"><input type="text" id="savGoalName" class="app-fv-text-input" placeholder="Goal name (e.g. Car)"/><input type="number" id="savGoalTarget" class="app-fv-num-input" placeholder="Target $" min="0"/><input type="text" id="savGoalEmoji" class="app-fv-num-small" placeholder="\ud83c\udfaf" maxlength="2" style="width:38px;text-align:center"/><button id="savGoalAdd" class="app-fv-save-btn">\uff0b Add Goal</button></div>';
  var catMap={};bills.forEach(function(b){var c=b.category||'Other';catMap[c]=(catMap[c]||0)+(parseFloat(b.amount)||0);});oneTime.forEach(function(e){var c=e.category||'Other';catMap[c]=(catMap[c]||0)+(parseFloat(e.amount)||0);});
  var catKeys=Object.keys(catMap).sort(function(a,b){return catMap[b]-catMap[a];});
  if(catKeys.length){rHTML+='<h4 class="app-full-section-heading" style="margin-top:16px">\ud83d\udcca Spending by Category</h4>'+_fvBarChart(catKeys.map(function(k){return{label:k.slice(0,8),value:Math.round(catMap[k]),iso:''};}).slice(0,8),220,80,12,18,8,8,'');}
  right.innerHTML=rHTML;
  layout.appendChild(left);layout.appendChild(right);container.appendChild(layout);
  var annualToggle=container.querySelector('#budgFvAnnual');if(annualToggle)annualToggle.addEventListener('change',function(){container.querySelectorAll('.app-budget-bill-amt').forEach(function(el){var mo=parseFloat(el.dataset.monthly)||0;el.textContent=annualToggle.checked?'$'+(mo*12).toFixed(2)+'/yr':'$'+mo.toFixed(2)+'/mo';});});
  container.querySelectorAll('.app-savings-upd').forEach(function(btn){btn.addEventListener('click',function(){var gi=parseInt(btn.dataset.gi,10);var inp=container.querySelector('.app-savings-inp[data-gi="'+gi+'"]');var goals=safeParseStorage('personalSavingsGoals',[]);if(!goals[gi])return;goals[gi].current=parseFloat((inp||{}).value)||0;localStorage.setItem('personalSavingsGoals',JSON.stringify(goals));renderBudgetAppFull(container);});});
  var savAdd=container.querySelector('#savGoalAdd');if(savAdd)savAdd.addEventListener('click',function(){var nameInp=container.querySelector('#savGoalName'),tgtInp=container.querySelector('#savGoalTarget'),emojiInp=container.querySelector('#savGoalEmoji');var name=nameInp?nameInp.value.trim():'',target=parseFloat((tgtInp||{}).value)||0;if(!name||!target)return;var goals=safeParseStorage('personalSavingsGoals',[]);goals.push({name:name,target:target,current:0,emoji:(emojiInp?emojiInp.value.trim():'')||'\ud83c\udfaf'});localStorage.setItem('personalSavingsGoals',JSON.stringify(goals));renderBudgetAppFull(container);});
}

function renderJobsAppFull(container) {
  container.innerHTML = '';
  var earningsSection = document.getElementById('workEarningsSection');
  if (earningsSection) {
    earningsSection.classList.remove('hidden');
    container.appendChild(earningsSection);
    if (typeof window.renderWorkEarnings === 'function') {
      try { window.renderWorkEarnings(); } catch (_) {}
    }
    return;
  }
  container.innerHTML =
    '<p style="color:var(--ios-text-3);font-size:0.9rem;text-align:center;padding:24px 0">' +
    '\ud83d\udcbc Navigate to the <a href="#work" style="color:var(--ios-accent)">Work</a> page to set up jobs first.</p>';
}

window.renderTodayFocusPreview     = renderTodayFocusPreview;
window.renderTodayHydrationPreview = renderTodayHydrationPreview;
window.renderTodaySleepPreview     = renderTodaySleepPreview;
window.renderTodayRoutinePreview   = renderTodayRoutinePreview;
window.renderTodayMoodPreview      = renderTodayMoodPreview;
window.renderTodayBudgetPreview    = renderTodayBudgetPreview;
window.renderWeatherAppFull   = renderWeatherAppFull;
window.renderSleepAppFull     = renderSleepAppFull;
window.renderMoodAppFull      = renderMoodAppFull;
window.renderFocusAppFull     = renderFocusAppFull;
window.renderHydrationAppFull = renderHydrationAppFull;
window.renderMealAppFull      = renderMealAppFull;
window.renderGymAppFull       = renderGymAppFull;
window.renderRoutineAppFull   = renderRoutineAppFull;
window.renderBudgetAppFull    = renderBudgetAppFull;
window.renderJobsAppFull      = renderJobsAppFull;

/* ══════════════════════════════════════════════════════════════
   JOURNAL APP
   ══════════════════════════════════════════════════════════════ */

/* ── Data helpers ── */
function getJournalEntries() { return safeParseStorage('journalEntries', []); }
function setJournalEntries(v) { try { localStorage.setItem('journalEntries', JSON.stringify(v)); } catch(_) {} }
function getJournalFolders() { return safeParseStorage('journalFolders', []); }
function setJournalFolders(v) { try { localStorage.setItem('journalFolders', JSON.stringify(v)); } catch(_) {} }
function generateJournalId() { return 'j:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2); }

/* Safe HTML-to-plain-text using a temporary DOM element (avoids regex-based tag stripping). */
function _jvStripHtml(html) {
  try {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  } catch(_) {
    /* Fallback: return empty string rather than potentially unsafe content */
    return '';
  }
}

/* ── Streak counter ── */
function calcJournalStreak() {
  var entries = getJournalEntries();
  if (!entries.length) return 0;
  var days = new Set(entries.map(function(e) {
    var d = new Date(e.createdAt || 0);
    return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
  }));
  var streak = 0;
  var d = new Date();
  while (true) {
    var iso = d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
    if (!days.has(iso)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/* ── Today preview widget ── */
function renderTodayJournalPreview() {
  var el = document.getElementById('todayJournalPreviewContent');
  if (!el) return;
  var entries = getJournalEntries();
  if (!entries.length) {
    el.innerHTML = '<p style="font-size:0.82rem;color:var(--ios-text-3,#aaa);text-align:center;padding:6px 0">No entries yet.</p>';
    return;
  }
  var recent = entries.slice().sort(function(a, b) { return (b.createdAt||0) - (a.createdAt||0); }).slice(0, 3);
  el.innerHTML = recent.map(function(e) {
    var d = new Date(e.createdAt || Date.now());
    var dateStr = monthNames[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
    var preview = e.title || _jvStripHtml(e.body || '').slice(0, 40) || 'Untitled';
    return '<div style="font-size:0.82rem;padding:3px 0;border-bottom:1px solid var(--ios-border,#f0f0f0);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' +
      '<span style="color:var(--ios-text-3,#999);margin-right:5px">' + escapeHTML(dateStr) + '</span>' +
      (e.mood ? e.mood + ' ' : '') +
      escapeHTML(preview) +
      '</div>';
  }).join('');
}

/* ── Medium widget ── */
function renderJournalWidget() {
  var section = document.getElementById('personalJournalSection');
  if (!section) return;
  section.innerHTML = '';

  var entries = getJournalEntries();
  var folders = getJournalFolders();
  var _selectedMood = '😐';

  var card = buildPWCard('journalCard', '📓', 'Journal', function(body) {
    /* Quick-add area */
    var qa = document.createElement('div');
    qa.style.cssText = 'margin-bottom:12px';
    qa.innerHTML =
      '<input type="text" id="jwTitleInp" placeholder="Entry title…" ' +
        'style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:8px;padding:6px 10px;font-size:0.88rem;margin-bottom:6px;outline:none" />' +
      '<textarea id="jwBodyInp" placeholder="Write something…" rows="3" ' +
        'style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:8px;padding:6px 10px;font-size:0.88rem;resize:none;outline:none"></textarea>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:6px">' +
        '<span id="jwMoodToggle" style="font-size:1.15rem;cursor:pointer" title="Set mood">😐</span>' +
        '<div id="jwMoodPicker" style="display:none;gap:5px">' +
          '<span class="jw-mood-opt" data-mood="😊" style="font-size:1.2rem;cursor:pointer" title="Happy">😊</span>' +
          '<span class="jw-mood-opt" data-mood="😐" style="font-size:1.2rem;cursor:pointer" title="Neutral">😐</span>' +
          '<span class="jw-mood-opt" data-mood="😟" style="font-size:1.2rem;cursor:pointer" title="Sad">😟</span>' +
          '<span class="jw-mood-opt" data-mood="😠" style="font-size:1.2rem;cursor:pointer" title="Angry">😠</span>' +
          '<span class="jw-mood-opt" data-mood="🥳" style="font-size:1.2rem;cursor:pointer" title="Excited">🥳</span>' +
          '<span class="jw-mood-opt" data-mood="😴" style="font-size:1.2rem;cursor:pointer" title="Tired">😴</span>' +
        '</div>' +
        '<button id="jwSaveBtn" style="margin-left:auto;background:#4a90e2;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:0.82rem;cursor:pointer;font-weight:600">＋ Save</button>' +
      '</div>';
    body.appendChild(qa);

    /* Recent entries list */
    var recentDiv = document.createElement('div');
    var recent = entries.slice().sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); }).slice(0, 5);
    if (recent.length) {
      recentDiv.innerHTML = '<div style="font-weight:700;font-size:0.75rem;color:var(--ios-text-3,#888);margin-bottom:5px;letter-spacing:0.04em;text-transform:uppercase">Recent</div>';
      recent.forEach(function(e) {
        var d = new Date(e.createdAt || Date.now());
        var dateStr = monthNames[d.getMonth()].slice(0, 3) + ' ' + pad2(d.getDate());
        var folder = folders.find(function(f){ return f.id === e.folderId; });
        var bodyText = _jvStripHtml(e.body || '').trim();
        var preview = e.title || bodyText.slice(0, 50) || 'Untitled';
        var row = document.createElement('div');
        row.className = 'jw-recent-row';
        row.innerHTML =
          '<span class="jw-recent-date">' + escapeHTML(dateStr) + '</span>' +
          (folder ? '<span class="jw-recent-folder">' + escapeHTML(folder.emoji||'📁') + '</span>' : '') +
          '<span class="jw-recent-title">' + escapeHTML(preview.slice(0, 40)) + '</span>' +
          (e.mood ? '<span class="jw-recent-mood">' + e.mood + '</span>' : '');
        row.dataset.jid = e.id;
        recentDiv.appendChild(row);
      });
    } else {
      recentDiv.innerHTML = '<p style="font-size:0.82rem;color:var(--ios-text-3,#aaa);text-align:center;padding:10px 0">No entries yet. Start writing!</p>';
    }
    body.appendChild(recentDiv);
  });

  /* Wire mood toggle */
  var moodToggle = card.querySelector('#jwMoodToggle');
  var moodPicker = card.querySelector('#jwMoodPicker');
  if (moodToggle) {
    moodToggle.addEventListener('click', function() {
      moodPicker.style.display = moodPicker.style.display === 'flex' ? 'none' : 'flex';
    });
  }
  card.querySelectorAll('.jw-mood-opt').forEach(function(opt) {
    opt.addEventListener('click', function() {
      _selectedMood = opt.dataset.mood;
      if (moodToggle) moodToggle.textContent = _selectedMood;
      if (moodPicker) moodPicker.style.display = 'none';
    });
  });

  /* Wire save */
  var saveBtn = card.querySelector('#jwSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      var titleInp = card.querySelector('#jwTitleInp');
      var bodyInp  = card.querySelector('#jwBodyInp');
      var title    = titleInp ? titleInp.value.trim() : '';
      var bodyText = bodyInp  ? bodyInp.value.trim()  : '';
      if (!title && !bodyText) return;
      var allEntries = getJournalEntries();
      allEntries.unshift({
        id: generateJournalId(),
        title: title,
        body: escapeHTML(bodyText).replace(/\n/g, '<br>'),
        folderId: null,
        tags: [],
        mood: _selectedMood,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        starred: false
      });
      setJournalEntries(allEntries);
      if (titleInp) titleInp.value = '';
      if (bodyInp)  bodyInp.value  = '';
      _selectedMood = '😐';
      if (moodToggle) moodToggle.textContent = '😐';
      haptic.complete();
      renderJournalWidget();
      if (typeof renderTodayJournalPreview === 'function') renderTodayJournalPreview();
    });
  }

  /* Click recent entry → open full view at that entry */
  card.querySelectorAll('.jw-recent-row').forEach(function(row) {
    row.addEventListener('click', function() {
      window._journalOpenEntryId = row.dataset.jid;
      if (typeof window.openAppDetail === 'function') {
        window.openAppDetail('journal', { fullscreen: true });
      }
    });
  });

  section.appendChild(card);
}

/* ── Full-screen 3-panel view ── */
function renderJournalAppFull(container) {
  container.innerHTML = '';

  var _jState = {
    folderId:      null,      /* null = All Entries; '__starred__' = Starred */
    entryId:       null,
    search:        '',
    sort:          'newest',
    panel:         'folders', /* mobile nav: 'folders' | 'list' | 'editor' */
    focusMode:     false,
    autosaveTimer: null
  };

  /* If widget opened a specific entry, jump straight to editor */
  if (window._journalOpenEntryId) {
    _jState.entryId = window._journalOpenEntryId;
    _jState.panel   = 'editor';
    window._journalOpenEntryId = null;
  }

  /* ── Root layout ── */
  var root = document.createElement('div');
  root.className = 'jv-root';
  root.dataset.panel = _jState.panel;

  var sidebar    = document.createElement('div'); sidebar.className    = 'jv-sidebar';
  var listPanel  = document.createElement('div'); listPanel.className  = 'jv-list-panel';
  var editorPanel= document.createElement('div'); editorPanel.className= 'jv-editor-panel';

  root.appendChild(sidebar);
  root.appendChild(listPanel);
  root.appendChild(editorPanel);
  container.appendChild(root);

  /* ── Helpers ── */
  function rebuild() {
    renderSidebar();
    renderList();
    renderEditor();
    root.dataset.panel = _jState.panel;
  }

  /* ══════════════════════════════════════
     SIDEBAR — Folders
     ══════════════════════════════════════ */
  function renderSidebar() {
    sidebar.innerHTML = '';

    var entries = getJournalEntries();
    var folders = getJournalFolders();

    var heading = document.createElement('div');
    heading.className = 'jv-sidebar-heading';
    heading.textContent = '📂 Folders';
    sidebar.appendChild(heading);

    /* All Entries */
    _appendFolderItem(sidebar, '📚', 'All Entries', entries.length, null);

    /* Starred */
    var starCount = entries.filter(function(e){ return e.starred; }).length;
    _appendFolderItem(sidebar, '⭐', 'Starred', starCount, '__starred__');

    /* User folders */
    folders.forEach(function(f) {
      var count = entries.filter(function(e){ return e.folderId === f.id; }).length;
      var item = _appendFolderItem(sidebar, f.emoji || '📁', f.name, count, f.id);
      /* Delete button */
      var del = document.createElement('button');
      del.className = 'jv-folder-del';
      del.textContent = '✕';
      del.title = 'Delete folder';
      del.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!confirm('Delete folder "' + f.name + '"?\nEntries will move to All Entries.')) return;
        var flds = getJournalFolders().filter(function(x){ return x.id !== f.id; });
        setJournalFolders(flds);
        var ents = getJournalEntries().map(function(x){ if (x.folderId === f.id) x.folderId = null; return x; });
        setJournalEntries(ents);
        if (_jState.folderId === f.id) { _jState.folderId = null; _jState.entryId = null; }
        rebuild();
      });
      item.appendChild(del);
    });

    /* Add folder form */
    var addForm = document.createElement('div');
    addForm.className = 'jv-add-folder-form';
    addForm.innerHTML =
      '<input type="text" id="jvFolderEmoji" placeholder="📁" maxlength="2" class="jv-folder-emoji-inp" />' +
      '<input type="text" id="jvFolderName"  placeholder="New folder…"   class="jv-folder-name-inp"  />' +
      '<button id="jvAddFolderBtn" class="jv-add-folder-btn" title="Add folder">＋</button>';
    addForm.querySelector('#jvAddFolderBtn').addEventListener('click', function() {
      var emojiInp = addForm.querySelector('#jvFolderEmoji');
      var nameInp  = addForm.querySelector('#jvFolderName');
      var name = nameInp ? nameInp.value.trim() : '';
      if (!name) return;
      var flds = getJournalFolders();
      flds.push({ id: generateJournalId(), name: name, emoji: (emojiInp ? emojiInp.value.trim() : '') || '📁' });
      setJournalFolders(flds);
      if (nameInp)  nameInp.value  = '';
      if (emojiInp) emojiInp.value = '';
      rebuild();
    });
    sidebar.appendChild(addForm);

    /* Streak */
    var streak = calcJournalStreak();
    if (streak > 0) {
      var streakEl = document.createElement('div');
      streakEl.className = 'jv-streak';
      streakEl.textContent = '🔥 ' + streak + '-day streak!';
      sidebar.appendChild(streakEl);
    }
  }

  function _appendFolderItem(parent, emoji, name, count, fid) {
    var item = document.createElement('div');
    item.className = 'jv-folder-item' + (_jState.folderId === fid ? ' active' : '');
    item.innerHTML =
      '<span class="jv-folder-emoji">' + escapeHTML(emoji) + '</span>' +
      '<span class="jv-folder-name">'  + escapeHTML(name)  + '</span>' +
      '<span class="jv-folder-count">' + count + '</span>';
    item.addEventListener('click', function(e) {
      if (e.target.classList.contains('jv-folder-del')) return;
      _jState.folderId = fid;
      _jState.entryId  = null;
      _jState.panel    = 'list';
      rebuild();
    });
    parent.appendChild(item);
    return item;
  }

  /* ══════════════════════════════════════
     ENTRY LIST — Middle column
     ══════════════════════════════════════ */
  function renderList() {
    listPanel.innerHTML = '';

    var entries = getJournalEntries();
    var folders = getJournalFolders();

    /* Mobile back → folders */
    var mBack = document.createElement('button');
    mBack.className = 'jv-mobile-back jv-mobile-only';
    mBack.textContent = '← Folders';
    mBack.addEventListener('click', function() { _jState.panel = 'folders'; root.dataset.panel = 'folders'; });
    listPanel.appendChild(mBack);

    /* Header: search + sort + new */
    var hdr = document.createElement('div');
    hdr.className = 'jv-list-header';
    hdr.innerHTML =
      '<input type="text" class="jv-search" placeholder="🔍 Search entries…" value="' + escapeHTML(_jState.search) + '" />' +
      '<div class="jv-list-controls">' +
        '<select class="jv-sort-select">' +
          '<option value="newest"' + (_jState.sort==='newest'?' selected':'') + '>Newest</option>' +
          '<option value="oldest"' + (_jState.sort==='oldest'?' selected':'') + '>Oldest</option>' +
          '<option value="edited"' + (_jState.sort==='edited'?' selected':'') + '>Last edited</option>' +
        '</select>' +
        '<button class="jv-new-entry-btn" id="jvNewEntryBtn">＋ New</button>' +
      '</div>';
    listPanel.appendChild(hdr);

    hdr.querySelector('.jv-search').addEventListener('input', function(e) {
      _jState.search = e.target.value;
      renderList();
    });
    hdr.querySelector('.jv-sort-select').addEventListener('change', function(e) {
      _jState.sort = e.target.value;
      renderList();
    });
    hdr.querySelector('#jvNewEntryBtn').addEventListener('click', _createNewEntry);

    /* Filter */
    var filtered = entries;
    if (_jState.folderId === '__starred__') {
      filtered = entries.filter(function(e){ return e.starred; });
    } else if (_jState.folderId !== null) {
      filtered = entries.filter(function(e){ return e.folderId === _jState.folderId; });
    }

    /* Search */
    var q = _jState.search.toLowerCase().trim();
    if (q) {
      filtered = filtered.filter(function(e) {
        var bodyPlain = _jvStripHtml(e.body || '').toLowerCase();
        return (e.title || '').toLowerCase().indexOf(q) !== -1 || bodyPlain.indexOf(q) !== -1;
      });
    }

    /* Sort */
    if (_jState.sort === 'oldest') {
      filtered.sort(function(a,b){ return (a.createdAt||0)-(b.createdAt||0); });
    } else if (_jState.sort === 'edited') {
      filtered.sort(function(a,b){ return (b.updatedAt||0)-(a.updatedAt||0); });
    } else {
      filtered.sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); });
    }

    /* Starred entries float to top */
    var starred = filtered.filter(function(e){ return e.starred; });
    var rest    = filtered.filter(function(e){ return !e.starred; });
    filtered = starred.concat(rest);

    /* Entry rows */
    var listEl = document.createElement('div');
    listEl.className = 'jv-entries-list';

    if (!filtered.length) {
      listEl.innerHTML = '<div class="jv-entries-empty">' +
        (q ? 'No entries matching "<strong>' + escapeHTML(q) + '</strong>".' : 'No entries here yet.<br><small>Tap <strong>＋ New</strong> to start.</small>') +
        '</div>';
    } else {
      filtered.forEach(function(e) {
        var d = new Date(e.createdAt || Date.now());
        var dateStr = monthNames[d.getMonth()].slice(0,3) + ' ' + pad2(d.getDate()) + ', ' + d.getFullYear();
        var folder  = folders.find(function(f){ return f.id === e.folderId; });
        var bodyText = _jvStripHtml(e.body || '').trim();
        var wc = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;

        var row = document.createElement('div');
        row.className = 'jv-entry-row' + (e.id === _jState.entryId ? ' active' : '');
        row.dataset.jid = e.id;
        row.innerHTML =
          '<div class="jv-entry-row-top">' +
            '<span class="jv-entry-date">' + escapeHTML(dateStr) + '</span>' +
            (e.starred ? '<span class="jv-entry-star">⭐</span>' : '') +
            (e.mood    ? '<span class="jv-entry-mood">'  + e.mood   + '</span>' : '') +
          '</div>' +
          '<div class="jv-entry-title">' + escapeHTML(e.title || 'Untitled') + '</div>' +
          '<div class="jv-entry-preview">' + escapeHTML(bodyText.slice(0, 80)) + '</div>' +
          '<div class="jv-entry-meta">' +
            (folder ? '<span class="jv-entry-folder-tag">' + escapeHTML(folder.emoji||'📁') + ' ' + escapeHTML(folder.name) + '</span>' : '') +
            '<span class="jv-entry-wc">' + wc + ' words</span>' +
          '</div>';

        row.addEventListener('click', function() {
          _jState.entryId = e.id;
          _jState.panel   = 'editor';
          /* Highlight selection without full list re-render */
          listEl.querySelectorAll('.jv-entry-row').forEach(function(r) {
            r.classList.toggle('active', r.dataset.jid === e.id);
          });
          renderEditor();
          root.dataset.panel = 'editor';
        });
        listEl.appendChild(row);
      });
    }
    listPanel.appendChild(listEl);
  }

  /* ══════════════════════════════════════
     EDITOR — Right column
     ══════════════════════════════════════ */
  function renderEditor() {
    editorPanel.innerHTML = '';

    /* Mobile back → list */
    var mBack = document.createElement('button');
    mBack.className = 'jv-mobile-back jv-mobile-only';
    mBack.textContent = '← Entries';
    mBack.addEventListener('click', function() { _jState.panel = 'list'; root.dataset.panel = 'list'; });
    editorPanel.appendChild(mBack);

    if (!_jState.entryId) {
      var empty = document.createElement('div');
      empty.className = 'jv-editor-empty';
      empty.innerHTML = '<div style="font-size:2.5rem">📓</div><p>Select an entry or tap <strong>＋ New</strong> to start writing.</p>';
      editorPanel.appendChild(empty);
      return;
    }

    var entries = getJournalEntries();
    var idx = entries.findIndex(function(e){ return e.id === _jState.entryId; });
    if (idx === -1) { _jState.entryId = null; renderEditor(); return; }
    var entry = entries[idx];

    /* ── Toolbar ── */
    var toolbar = document.createElement('div');
    toolbar.className = 'jv-toolbar';

    var toolDefs = [
      { cmd:'bold',                 html:'<b>B</b>',  title:'Bold (Ctrl+B)' },
      { cmd:'italic',               html:'<i>I</i>',  title:'Italic (Ctrl+I)' },
      { cmd:'underline',            html:'<u>U</u>',  title:'Underline (Ctrl+U)' },
      { cmd:'strikeThrough',        html:'<s>S</s>',  title:'Strikethrough' },
      { sep:true },
      { cmd:'h1',                   html:'H1',         title:'Heading 1' },
      { cmd:'h2',                   html:'H2',         title:'Heading 2' },
      { cmd:'h3',                   html:'H3',         title:'Heading 3' },
      { sep:true },
      { cmd:'insertUnorderedList',  html:'•',          title:'Bullet list' },
      { cmd:'insertOrderedList',    html:'1.',         title:'Numbered list' },
      { cmd:'checklist',            html:'☑',          title:'Checklist item' },
      { sep:true },
      { cmd:'blockquote',           html:'❝',          title:'Block quote' },
      { cmd:'insertHorizontalRule', html:'—',          title:'Horizontal rule' }
    ];

    toolDefs.forEach(function(def) {
      if (def.sep) {
        var sep = document.createElement('span');
        sep.className = 'jv-toolbar-sep';
        toolbar.appendChild(sep);
        return;
      }
      var btn = document.createElement('button');
      btn.className = 'jv-toolbar-btn';
      btn.innerHTML = def.html;
      btn.title = def.title;
      btn.type  = 'button';
      btn.addEventListener('mousedown', function(e) {
        e.preventDefault(); /* keep editor focus */
        var ed = editorPanel.querySelector('.jv-editor-body');
        if (!ed) return;
        ed.focus();
        var _headingTags = { h1: '<h1>', h2: '<h2>', h3: '<h3>' };
        if (_headingTags[def.cmd]) {
          document.execCommand('formatBlock', false, _headingTags[def.cmd]);
        } else if (def.cmd === 'checklist') {
          document.execCommand('insertHTML', false,
            '<div><label><input type="checkbox"> <span>&#8203;</span></label></div>');
        } else if (def.cmd === 'blockquote') {
          document.execCommand('formatBlock', false, '<blockquote>');
        } else {
          document.execCommand(def.cmd, false, null);
        }
      });
      toolbar.appendChild(btn);
    });

    /* Focus-mode toggle */
    var focusBtn = document.createElement('button');
    focusBtn.className = 'jv-toolbar-btn jv-focus-btn' + (_jState.focusMode ? ' active' : '');
    focusBtn.innerHTML = '⛶';
    focusBtn.title = 'Distraction-free mode';
    focusBtn.type  = 'button';
    focusBtn.addEventListener('click', function() {
      _jState.focusMode = !_jState.focusMode;
      root.classList.toggle('jv-focus-mode', _jState.focusMode);
      focusBtn.classList.toggle('active', _jState.focusMode);
    });
    toolbar.appendChild(focusBtn);

    /* Export button */
    var exportBtn = document.createElement('button');
    exportBtn.className = 'jv-toolbar-btn';
    exportBtn.innerHTML = '📋';
    exportBtn.title = 'Copy entry as plain text';
    exportBtn.type  = 'button';
    exportBtn.addEventListener('click', function() {
      var ed = editorPanel.querySelector('.jv-editor-body');
      var titleEl = editorPanel.querySelector('.jv-title-input');
      var titleVal = titleEl ? titleEl.value.trim() : '';
      var text = (titleVal ? titleVal + '\n\n' : '') + (ed ? (ed.innerText || '') : '');
      try {
        navigator.clipboard.writeText(text).then(function() {
          exportBtn.innerHTML = '✅';
          setTimeout(function(){ exportBtn.innerHTML = '📋'; }, 1500);
        });
      } catch(_) { alert(text); }
    });
    toolbar.appendChild(exportBtn);

    /* Delete entry */
    var delBtn = document.createElement('button');
    delBtn.className = 'jv-toolbar-btn jv-del-btn';
    delBtn.innerHTML = '🗑';
    delBtn.title = 'Delete entry';
    delBtn.type  = 'button';
    delBtn.addEventListener('click', function() {
      if (!confirm('Delete this entry? This cannot be undone.')) return;
      var ents = getJournalEntries().filter(function(e){ return e.id !== _jState.entryId; });
      setJournalEntries(ents);
      _jState.entryId = null;
      _jState.panel   = 'list';
      rebuild();
    });
    toolbar.appendChild(delBtn);

    editorPanel.appendChild(toolbar);

    /* ── Title input ── */
    var titleInp = document.createElement('input');
    titleInp.type = 'text';
    titleInp.className = 'jv-title-input';
    titleInp.placeholder = 'Entry title…';
    titleInp.value = entry.title || '';
    editorPanel.appendChild(titleInp);

    /* ── Date stamp ── */
    var dateStamp = document.createElement('div');
    dateStamp.className = 'jv-date-stamp';
    var d = new Date(entry.createdAt || Date.now());
    dateStamp.textContent = d.toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' }) +
                            ' · ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    editorPanel.appendChild(dateStamp);

    /* ── Editor body ── */
    var editorBody = document.createElement('div');
    editorBody.className = 'jv-editor-body';
    editorBody.contentEditable = 'true';
    editorBody.spellcheck = true;
    editorBody.innerHTML = entry.body || '';
    editorPanel.appendChild(editorBody);

    /* ── Footer ── */
    var footer = document.createElement('div');
    footer.className = 'jv-editor-footer';
    footer.style.position = 'relative'; /* for mood popup */

    /* Folder picker */
    var allFolders = getJournalFolders();
    var folderOpts = '<option value="">📚 All Entries</option>';
    allFolders.forEach(function(f) {
      folderOpts += '<option value="' + escapeHTML(f.id) + '"' + (entry.folderId===f.id?' selected':'') + '>' +
        escapeHTML(f.emoji||'📁') + ' ' + escapeHTML(f.name) + '</option>';
    });
    var folderSel = document.createElement('select');
    folderSel.className = 'jv-footer-select';
    folderSel.innerHTML = folderOpts;
    footer.appendChild(folderSel);

    /* Tags input */
    var tagsInp = document.createElement('input');
    tagsInp.type = 'text';
    tagsInp.className = 'jv-tags-input';
    tagsInp.placeholder = '🏷 tags, comma-sep';
    tagsInp.value = (entry.tags || []).join(', ');
    footer.appendChild(tagsInp);

    /* Mood picker */
    var moodBtn = document.createElement('span');
    moodBtn.className = 'jv-footer-mood';
    moodBtn.title = 'Change mood';
    moodBtn.textContent = entry.mood || '😐';
    moodBtn.setAttribute('role', 'button');
    moodBtn.addEventListener('click', function() {
      var existing = footer.querySelector('.jv-mood-popup');
      if (existing) { existing.remove(); return; }
      var popup = document.createElement('div');
      popup.className = 'jv-mood-popup';
      ['😊','😐','😟','😠','🥳','😴','🤒','🥰'].forEach(function(m) {
        var b = document.createElement('button');
        b.className = 'jv-mood-popup-btn';
        b.textContent = m;
        b.type = 'button';
        b.addEventListener('click', function() {
          moodBtn.textContent = m;
          popup.remove();
          _saveEntry();
        });
        popup.appendChild(b);
      });
      footer.appendChild(popup);
    });
    footer.appendChild(moodBtn);

    /* Star toggle */
    var starBtn = document.createElement('button');
    starBtn.className = 'jv-footer-star-btn' + (entry.starred ? ' active' : '');
    starBtn.title = entry.starred ? 'Unstar entry' : 'Star entry';
    starBtn.textContent = entry.starred ? '⭐' : '☆';
    starBtn.type = 'button';
    starBtn.addEventListener('click', function() { _saveEntry(true); });
    footer.appendChild(starBtn);

    /* Word count */
    var wcEl = document.createElement('span');
    wcEl.className = 'jv-wc';

    /* Save status */
    var saveStatus = document.createElement('span');
    saveStatus.className = 'jv-save-status';

    footer.appendChild(wcEl);
    footer.appendChild(saveStatus);
    editorPanel.appendChild(footer);

    /* ── Word count updater ── */
    function _updateWC() {
      var text = editorBody.innerText || '';
      var wc = text.trim() ? text.trim().split(/\s+/).length : 0;
      var rt = Math.max(1, Math.ceil(wc / 200));
      wcEl.textContent = wc + ' words · ' + rt + ' min';
    }
    _updateWC();

    /* ── Save ── */
    function _saveEntry(toggleStar) {
      if (_jState.autosaveTimer) { clearTimeout(_jState.autosaveTimer); _jState.autosaveTimer = null; }
      var ents = getJournalEntries();
      var i = ents.findIndex(function(e){ return e.id === _jState.entryId; });
      if (i === -1) return;
      ents[i].title    = titleInp.value.trim();
      ents[i].body     = editorBody.innerHTML;
      ents[i].folderId = folderSel.value || null;
      ents[i].tags     = tagsInp.value.split(',').map(function(t){ return t.trim(); }).filter(Boolean);
      ents[i].mood     = moodBtn.textContent;
      ents[i].updatedAt = Date.now();
      if (toggleStar) {
        ents[i].starred = !ents[i].starred;
        starBtn.classList.toggle('active', ents[i].starred);
        starBtn.textContent = ents[i].starred ? '⭐' : '☆';
        starBtn.title = ents[i].starred ? 'Unstar entry' : 'Star entry';
      }
      setJournalEntries(ents);
      saveStatus.textContent = 'Saved ✓';
      saveStatus.style.color = '#27ae60';
      setTimeout(function(){ saveStatus.textContent = ''; }, 2000);
      /* Refresh list row title live */
      var listRow = listPanel.querySelector('[data-jid="' + _jState.entryId + '"] .jv-entry-title');
      if (listRow) listRow.textContent = ents[i].title || 'Untitled';
      if (typeof renderTodayJournalPreview === 'function') renderTodayJournalPreview();
    }

    function _scheduleAutosave() {
      if (_jState.autosaveTimer) clearTimeout(_jState.autosaveTimer);
      saveStatus.textContent = '…';
      saveStatus.style.color = '#bbb';
      _jState.autosaveTimer = setTimeout(_saveEntry, 1000);
    }

    editorBody.addEventListener('input', function() { _updateWC(); _scheduleAutosave(); });
    titleInp.addEventListener('input', _scheduleAutosave);
    folderSel.addEventListener('change', _saveEntry);
    tagsInp.addEventListener('change', _saveEntry);
  }

  /* ══════════════════════════════════════
     CREATE NEW ENTRY
     ══════════════════════════════════════ */
  function _createNewEntry() {
    var now = new Date();
    var dateStr = now.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
    var timeStr = now.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    var entry = {
      id:        generateJournalId(),
      title:     dateStr + ' — ' + timeStr,
      body:      '',
      folderId:  (_jState.folderId === '__starred__' || _jState.folderId === null) ? null : _jState.folderId,
      tags:      [],
      mood:      '😐',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      starred:   false
    };
    var ents = getJournalEntries();
    ents.unshift(entry);
    setJournalEntries(ents);
    _jState.entryId = entry.id;
    _jState.panel   = 'editor';
    rebuild();
    setTimeout(function() {
      var ti = editorPanel.querySelector('.jv-title-input');
      if (ti) { ti.focus(); ti.select(); }
    }, 40);
  }

  /* Initial render */
  rebuild();
}

window.renderJournalWidget       = renderJournalWidget;
window.renderJournalAppFull      = renderJournalAppFull;
window.renderTodayJournalPreview = renderTodayJournalPreview;
