/* Core helpers and storage */
const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const weekdayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function pad2(n){ return n<10 ? '0'+n : ''+n; }
function safeParseStorage(key, fallback){
  try{ const raw = localStorage.getItem(key); if (!raw) return fallback; return JSON.parse(raw); }
  catch(e){ console.warn('LocalStorage parse failed for', key, e); try{ localStorage.removeItem(key); }catch(_){} return fallback; }
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
      map[date].push({ text: (r.text || r.title || '').toString(), time: r.time || '', notify: r.notify || r.reminderNotify || 'none' });
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
        map[date].push({ text: (r.text || r.title || '').toString(), time: r.time || '', notify: r.notify || r.reminderNotify || 'none' });
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
function getJobs(){ return safeParseStorage('jobs', []); }
function setJobs(v){ localStorage.setItem('jobs', JSON.stringify(v)); }
function getInbox(){ return safeParseStorage('inbox', []); }
function setInbox(v){ localStorage.setItem('inbox', JSON.stringify(v)); }

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
      }
    }
    if (eventChanged) setEvents(events);
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
let selectedMonth, selectedYear, selectedDay;

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
  // returns events (with normalized times) for the given YYYY-MM-DD
  return getEvents().filter(ev => normalizeDate(ev.date) === dateKey && (ev.time || ev.endTime));
}

/* Updated renderDailyViewForDay:
   - If partKey not provided or invalid, compute the part that contains the current hour.
   - Color hour-label background to match the calendar day (weekday/weekend theme).
   - Show events for the date, placing them in any hour they overlap; display start–end in 24h.
*/
function renderDailyViewForDay(year, monthIndex, day, partKey){
  const container = document.getElementById('dailyView');
  if(!container) return;
  const dateKey = `${year}-${pad2(monthIndex+1)}-${pad2(day)}`;
  const events = getEventsForDateKey(dateKey);

  // Determine part: if explicit valid partKey given (morning/day/night) use it,
  // otherwise pick the part containing current hour (so no 'auto' behavior needed)
  let part = DAY_PARTS[partKey];
  if(!part){
    const now = new Date();
    // use current hour (local) for selecting the part
    const curHour = (now.getFullYear()===year && now.getMonth()===monthIndex && now.getDate()===day) ? now.getHours() : new Date().getHours();
    partKey = determinePartFromHour(curHour);
    part = DAY_PARTS[partKey];
  }

  // Build hours array interpreted as numbers (use 24..25 for 00:00 next day if needed)
  const hours = [];
  for(let h = part.start; h < part.end; h++){
    hours.push(h);
  }

  // Determine theme color for this date (match calendar cell)
  const dt = new Date(year, monthIndex, day);
  const dow = dt.getDay();
  const theme = themes[monthIndex] || themes[0];
  const labelBg = (dow===0 || dow===6) ? theme.weekend : theme.weekday;

  // render
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'daily-view';
  hours.forEach(h => {
    const row = document.createElement('div');
    row.className = 'hour-row';
    if (isCurrentHourForDate(year, monthIndex, day, h)) row.classList.add('current');

    const label = document.createElement('div');
    label.className = 'hour-label';
    label.textContent = hourToLabel(h);
    // style label background to match calendar day color
    label.style.background = labelBg;
    label.style.borderRadius = '6px';
    label.style.padding = '6px';
    label.style.color = '#000';
    row.appendChild(label);

    const eventsCell = document.createElement('div');
    eventsCell.className = 'hour-events';

    // list events overlapping this hour
    events.forEach(ev=>{
      const start = parseTimeToFloat(ev.time); // e.g., "09:30" -> 9.5
      const end = parseTimeToFloat(ev.endTime) || start;
      if (start == null) return; // skip untimed events in daily view
      let s = start, e = end;
      // treat end <= start as next-day end
      if (e <= s) e = e + 24;

      // hour cell represents [h, h+1)
      if ( (s < h+1) && (e > h) ){
        const evb = document.createElement('div');
        evb.className = 'event-block' + ( (s < h || e > h+1) ? ' continues' : '' );

        // show start–end if end present
        const timeSpan = document.createElement('span'); timeSpan.className='event-time';
        const startLabel = ev.time ? ev.time : '';
        const endLabel = ev.endTime ? ('–' + ev.endTime) : '';
        timeSpan.textContent = startLabel + endLabel;

        evb.appendChild(timeSpan);
        const title = document.createElement('span'); title.textContent = ' ' + (ev.emoji ? ev.emoji + ' ' : '') + (ev.title||'');
        evb.appendChild(title);

        // attach edit on click
        evb.addEventListener('click', ()=> { editEvent(ev.id); });
        eventsCell.appendChild(evb);
      }
    });

    row.appendChild(eventsCell);
    wrapper.appendChild(row);
  });

  container.appendChild(wrapper);

  const info = document.getElementById('dailyViewInfo');
  if(info) info.textContent = `${capitalize(partKey)} view (${hourToLabel(hours[0])} – ${hourToLabel(hours[hours.length-1])})`;
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

/* ---------- Jobs: storage and UI ---------- */

/* render saved jobs list */
function renderJobs(){
  try{
    const list = document.getElementById('jobList');
    if (!list) return;
    list.innerHTML = '';
    const jobs = getJobs();
    jobs.forEach(job=>{
      const li = document.createElement('li');
      li.className = 'job-item';
      li.dataset.jobId = job.id;

      const bullet = document.createElement('span');
      bullet.className = 'job-bullet';
      bullet.textContent = job.emoji || '🧾';

      const content = document.createElement('div');
      content.className = 'job-content';
      const locHtml = job.location ? ` — <a href="${osmSearchUrl(job.location)}" target="_blank">${escapeHTML(job.location)}</a>` : '';
      content.innerHTML = `<b>${escapeHTML(job.name)}</b> <small style="color:#666">(${escapeHTML(job.rate||'')}${job.unit?(' /'+escapeHTML(job.unit)):""})</small>${locHtml}`;

      const controls = document.createElement('span');
      controls.className = 'job-controls';
      const editBtn = document.createElement('button'); editBtn.className='small-btn'; editBtn.textContent='Edit';
      editBtn.addEventListener('click', ()=> editJob(job.id));
      const delBtn = document.createElement('button'); delBtn.className='small-btn'; delBtn.textContent='Delete';
      delBtn.addEventListener('click', ()=> { if(confirm('Delete job?')) deleteJob(job.id); });
      controls.appendChild(editBtn); controls.appendChild(delBtn);

      li.appendChild(bullet);
      li.appendChild(content);
      li.appendChild(controls);
      list.appendChild(li);
    });
  }catch(e){ console.warn('renderJobs failed', e); }
}

/* save job from Add Job form (create or update) */
function saveJobFromUI(){
  try{
    const idField = document.getElementById('jobId');
    const name = (document.getElementById('jobName')||{}).value.trim();
    if (!name){ alert('Enter a job name'); return; }
    const emoji = (document.getElementById('jobEmoji')||{}).value.trim();
    const location = (document.getElementById('jobLocation')||{}).value.trim();
    const rate = (document.getElementById('jobRate')||{}).value.trim();
    const unit = (document.getElementById('jobUnit')||{}).value;

    let jobs = getJobs();
    if (idField && idField.value){
      const id = parseInt(idField.value,10);
      const idx = jobs.findIndex(j=>j.id===id);
      if (idx!==-1){
        jobs[idx] = Object.assign({}, jobs[idx], {name, emoji, location, rate, unit});
      }
    } else {
      const nid = jobs.length ? Math.max(...jobs.map(j=>j.id))+1 : 1;
      jobs.push({ id: nid, name, emoji, location, rate, unit });
    }
    setJobs(jobs);
    renderJobs();
    // clear form
    clearJobForm();
  }catch(e){ console.warn('saveJobFromUI failed', e); alert('Save failed'); }
}

/* populate form for editing */
function editJob(id){
  try{
    const jobs = getJobs();
    const job = jobs.find(j=>j.id===id);
    if (!job) return;
    document.getElementById('jobId').value = job.id;
    document.getElementById('jobName').value = job.name || '';
    document.getElementById('jobEmoji').value = job.emoji || '';
    document.getElementById('jobLocation').value = job.location || '';
    document.getElementById('jobRate').value = job.rate || '';
    document.getElementById('jobUnit').value = job.unit || 'hour';
    // mark inputs as user-editable to avoid being overwritten by profile UI
    const homeInput = document.getElementById('jobLocation'); if (homeInput) homeInput.dataset.userset = '1';
  }catch(e){ console.warn('editJob failed', e); }
}

/* delete job */
function deleteJob(id){
  try{
    let jobs = getJobs();
    jobs = jobs.filter(j=>j.id !== id);
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
  }catch(e){ /* ignore */ }
}

/* wire job UI handlers on DOM ready */
(function wireJobsUI(){
  try{
    document.addEventListener('DOMContentLoaded', function(){
      const saveBtn = document.getElementById('saveJobBtn');
      const clearBtn = document.getElementById('clearJobBtn');
      if (saveBtn) saveBtn.addEventListener('click', function(e){ e.preventDefault(); saveJobFromUI(); });
      if (clearBtn) clearBtn.addEventListener('click', function(e){ e.preventDefault(); if (confirm('Clear job form?')) clearJobForm(); });
      renderJobs();
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
  const events = getEvents();

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
    dayEvents.forEach(ev => indicators.push({kind:'event', emoji: ev.emoji || '📌', title: (ev.time?`[${ev.time}] `:'') + (ev.title||''), id: ev.id}));
    if (h) indicators.push({kind:'holiday', emoji: h.emoji || '🏳️', title: h.name});
    if (dayReminders.length) indicators.push({kind:'reminder', emoji: '🔔', title: `${dayReminders.length} reminder${dayReminders.length>1?'s':''}`});
    if (dayTasks.length) indicators.push({kind:'task', emoji: '✅', title: `${dayTasks.length} task${dayTasks.length>1?'s':''}`});

    const emojiRow = cell.querySelector('.emoji-row');
    const count = Math.max(1, indicators.length);
    const size = Math.max(12, Math.floor(28 / Math.sqrt(count)));
    indicators.forEach(ind=>{
      const sp = document.createElement('span');
      sp.className = 'event-preview ' + (ind.kind || '');
      sp.textContent = ind.emoji || '';
      sp.title = ind.title || '';
      sp.style.fontSize = size + 'px';
      if (ind.kind === 'event' && ind.id) sp.dataset.eventId = ind.id;
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
  const events = getEvents().filter(e=>normalizeDate(e.date)===key);

  const untimed = events.filter(e=>!e.time).slice().sort((a,b)=> (a.title||'').localeCompare(b.title||''));
  const timed = events.filter(e=>e.time).slice().sort((a,b)=>{
    if (a.time === b.time) return (a.title||'').localeCompare(b.title||'');
    return (a.time||'').localeCompare(b.time||'');
  });
  const eventsSorted = untimed.concat(timed);

  const rd = document.getElementById('selectedDateLong');
  if (rd){
    rd.textContent = new Date(selectedYear, selectedMonth, day).toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    rd.style.display = 'block';
  }

  const mmdd = pad2(selectedMonth+1)+'-'+pad2(day);
  const h = getHoliday(mmdd, selectedYear);

  const holidayHTML = h ? `<div class="reminder-bar" style="background:#ffe5e3;border-left:4px solid #c0392b;color:#c0392b"><b>${h.emoji} ${h.name}</b></div>` : '';
  const eventsHTML = eventsSorted.length ? `<div class="reminder-bar" style="background:#eef6ff;border-left:4px solid #4a90e2;color:#234"><b>Events:</b><div class="events-list">${eventsSorted.map(ev=>{
    const timePart = ev.time ? `[${escapeHTML(ev.time)}] ` : '';
    const emojiPart = ev.emoji ? `${ev.emoji} ` : '';
    const locationPart = ev.location ? ` @ <a href="${osmSearchUrl(ev.location)}" target="_blank">${escapeHTML(ev.location)}</a>` : '';
    const bufferPart = (ev.preBuffer||0) || (ev.postBuffer||0) ? ` <small style="color:#555">(${ev.preBuffer||0}m pre / ${ev.postBuffer||0}m post)</small>` : '';
    return `<div class="r-event">${timePart}${emojiPart}<b>${escapeHTML(ev.title)}</b>${locationPart}${bufferPart}<span class="r-actions"><button class="small-btn" onclick="editEvent(${ev.id})">Edit</button><button class="small-btn" onclick="deleteEvent(${ev.id})">Delete</button></span></div>`;
  }).join('')}</div></div>` : '';

  const ribbons = document.getElementById('dayTopBars');
  if (ribbons) ribbons.innerHTML = holidayHTML + eventsHTML;

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
      const current = container.querySelector('.hour-row.current');
      if(current) current.scrollIntoView({ behavior:'smooth', block:'center' });
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

  const evs = getEvents();
  const id = evs.length ? Math.max(...evs.map(e=>e.id))+1 : 1;
  evs.push(Object.assign({
    id,title,date,time,startTime:time,endTime,location,emoji,preBuffer:pre,postBuffer:post
  }, repeatPayload));
  setEvents(evs);
  if (document.getElementById('eventTitle')) document.getElementById('eventTitle').value='';
  if (document.getElementById('eventDate')) document.getElementById('eventDate').value='';
  if (document.getElementById('eventTime')) document.getElementById('eventTime').value='';
  if (document.getElementById('eventEndTime')) document.getElementById('eventEndTime').value='';
  if (document.getElementById('eventLocation')) document.getElementById('eventLocation').value='';
  if (document.getElementById('eventEmoji')) document.getElementById('eventEmoji').value='';
  if (document.getElementById('eventRepeat')) document.getElementById('eventRepeat').value='none';
  if (document.getElementById('eventRepeatUntil')) document.getElementById('eventRepeatUntil').value='';
  if (document.getElementById('eventRepeatInterval')) document.getElementById('eventRepeatInterval').value='1';
  if (document.getElementById('eventRepeatUnit')) document.getElementById('eventRepeatUnit').value='days';
  if (document.getElementById('eventABWeek')) document.getElementById('eventABWeek').value='a';
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
  document.getElementById('editLocation').value = e.location || '';
  document.getElementById('editEmoji').value = e.emoji || '';
  document.getElementById('editPreBuffer').value = parseBufferMinutes(e.preBuffer || 5);
  document.getElementById('editPostBuffer').value = parseBufferMinutes(e.postBuffer || 5);
  document.getElementById('editRepeat').value = e.repeat || 'none';
  document.getElementById('editRepeatUntil').value = e.repeatUntil || '';
  document.getElementById('editRepeatInterval').value = e.repeatInterval || 1;
  document.getElementById('editRepeatUnit').value = e.repeatUnit || 'days';
  document.getElementById('editABWeek').value = e.abWeek || 'a';
  syncRepeatUI('edit');
  showModalFieldsFor('event'); openEditModal('Edit Event');
}

/* modal helpers */
function openEditModal(title){ const m = document.getElementById('editModal'), h = document.getElementById('editModalHeading'); if (h) h.textContent = title; if (m) m.style.display = 'flex'; }
function closeEditModal(){ const m = document.getElementById('editModal'); if (m) m.style.display = 'none'; }
function showModalFieldsFor(kind){
  const loc = document.getElementById('editLocation'), emoji = document.getElementById('editEmoji'), category = document.getElementById('editCategory'), priority = document.getElementById('editPriority');
  if (!loc || !emoji || !category || !priority) return;
  if (kind==='event'){ loc.parentElement.style.display='block'; emoji.parentElement.style.display='block'; category.parentElement.style.display='none'; priority.parentElement.style.display='none'; }
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
      delete evs[idx].repeatInterval;
      delete evs[idx].repeatUnit;
    } else {
      delete evs[idx].repeatInterval;
      delete evs[idx].repeatUnit;
      delete evs[idx].abWeek;
    }
    setEvents(evs); renderEvents(); generateCalendar(); if (selectedDay) showReminders(selectedDay);
    closeEditModal();
    return;
  } else if (kind==='task'){
    const idx = parseInt(document.getElementById('editTaskIndex').value,10);
    const tasks = getTasks(); if (!tasks[idx]) { closeEditModal(); return; }
    tasks[idx].title = text; tasks[idx].date = date; tasks[idx].time = time; tasks[idx].category = document.getElementById('editCategory').value; tasks[idx].priority = document.getElementById('editPriority').value;
    setTasks(tasks); loadTasks();
  } else if (kind==='reminder'){
    const origKey = document.getElementById('editReminderKey').value;
    const ridx = parseInt(document.getElementById('editReminderIndex').value,10);
    const r = getReminders(); const arr = r[origKey] || []; const item = arr[ridx]; if (!item){ closeEditModal(); return; }
    const newDate = date || origKey;
    arr.splice(ridx,1); if (!arr.length) delete r[origKey];
    if (!r[newDate]) r[newDate]=[];
    r[newDate].push({text,time});
    setReminders(r);
    const parts = newDate.split('-');
    if (parts.length===3){ selectedYear = parseInt(parts[0],10); selectedMonth = parseInt(parts[1],10)-1; selectedDay = parseInt(parts[2],10); }
    generateCalendar(); showReminders(selectedDay);
  }
  closeEditModal();
}

/* progress & dashboard */
function updateProgress(tasks){
  const total = tasks.length;
  const done = tasks.filter(t=>t.done).length;
  const percent = total ? Math.round((done/total)*100) : 0;
  const ring = document.getElementById('progressRing');
  if (ring) { ring.style.borderTopColor = percent===100 ? 'limegreen' : '#4a90e2'; ring.title = percent + '% complete'; ring.style.transform = `rotate(${percent*3.6}deg)`; }
}
function updateDashboard(tasks){
  const total = tasks.length;
  const done = tasks.filter(t=>t.done).length;
  const categories = tasks.reduce((acc,t)=>{ acc[t.category]= (acc[t.category]||0)+1; return acc; },{});
  const summary = document.getElementById('summaryStats');
  if (summary) summary.innerHTML = `Total tasks: ${total}<br>Completed: ${done}<br>Work: ${categories.work||0}, Personal: ${categories.personal||0}, Errands: ${categories.errands||0}`;
}
function updateDayProgress(day){
  const ring = document.getElementById('dayProgressRing');
  if (!ring) return;
  if (!day){
    ring.style.borderTopColor = '#ccc';
    ring.title = 'No day selected';
    ring.style.transform = 'rotate(0deg)';
    return;
  }
  const key = `${selectedYear}-${pad2(selectedMonth+1)}-${pad2(day)}`;
  const tasks = getTasks().filter(t => t.date && normalizeDate(t.date) === key );
  const total = tasks.length;
  const done = tasks.filter(t=>t.done).length;
  const percent = total ? Math.round((done/total)*100) : 0;
  ring.style.borderTopColor = percent===100 ? 'limegreen' : '#4a90e2';
  ring.title = percent + '% complete (' + (total) + ' task' + (total!==1 ? 's' : '') + ') on ' + key;
  ring.style.transform = `rotate(${percent * 3.6}deg)`;
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
  view = view || 'calendar';
  document.querySelectorAll('[id^="page-"]').forEach(p=> p.classList.add('hidden'));
  const el = document.getElementById('page-'+view) || document.getElementById('page-calendar');
  if (el) el.classList.remove('hidden');
  document.querySelectorAll('.bottom-ribbon .r-item').forEach(a=>{
    const href = a.getAttribute('href') || '';
    const candidate = (a.dataset && a.dataset.view) ? a.dataset.view : (href.indexOf('#')>-1 ? href.split('#').pop() : '');
    a.classList.toggle('active', candidate === view);
  });
  if (view === 'calendar'){ try{ generateCalendar(); }catch(e){ console.warn(e); } if (selectedDay) try{ showReminders(selectedDay); }catch(e){ console.warn(e); } }
  else if (view === 'events'){ try{ renderEvents(); }catch(e){ console.warn(e); } }
  else if (view === 'tasks'){ try{ loadTasks(); }catch(e){ console.warn(e); } }
  else if (view === 'jobs'){ try{ renderJobs(); }catch(e){ console.warn(e); } }
  else if (view === 'inbox'){ try{ renderInbox(); updateInboxBadge(); }catch(e){ console.warn(e); } }
  if (updateHash){ const newHash = '#'+view; if (location.hash !== newHash) location.hash = newHash; }
}
window.addEventListener('hashchange', ()=> {
  const v = (location.hash && location.hash.length>1) ? location.hash.slice(1) : 'calendar';
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
          showView(targetView || 'calendar');
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
    migrateConsistencyData();
    const now = new Date();
    selectedMonth = now.getMonth();
    selectedYear = now.getFullYear();
    selectedDay = now.getDate();
    attachPageListeners();
    const initial = (location.hash && location.hash.length>1) ? location.hash.slice(1) : 'calendar';
    try { showView(initial, false); } catch(e){ console.warn('showView failed', e); }
    try{ if (document.getElementById('calendar')) generateCalendar(); }catch(e){ console.warn('generateCalendar init failed',e); }
    try{ if (document.getElementById('calendar')) showReminders(selectedDay); }catch(e){ console.warn('showReminders init failed',e); }
    try{ if (document.getElementById('taskList')) loadTasks(); }catch(e){ console.warn('loadTasks failed', e); }
    try{ if (document.getElementById('eventList')) renderEvents(); }catch(e){ console.warn('renderEvents failed', e); }
    try{ if (document.getElementById('jobList')) renderJobs(); }catch(e){ console.warn('renderJobs failed', e); }
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
      userProfile: readUserProfile()
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
    const events = getEvents();
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
      const todayEvents = getEvents().filter(e => normalizeDate(e.date) === todayStr);
      const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate()+7);
      const weekEndStr = weekEnd.toISOString().slice(0,10);
      const weekEvents = getEvents().filter(e => { const d = normalizeDate(e.date); return d >= todayStr && d <= weekEndStr; });
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
  const allEvents = getEvents();
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
  s=s.replace(/[#@](work|personal|home|errands|appointment|job|holiday|event|commitment)\b/gi,(m,c)=>{ category=c.toLowerCase(); return ''; }).trim();

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

  return { title, date:date||'', time, category, kind };
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
      evs.push({ id, title:parsed.title, date:parsed.date||new Date().toISOString().slice(0,10), time:parsed.time, endTime:'', location:'', emoji:'', category:parsed.category||'event', repeat:'none', repeatUntil:'', preBuffer:0, postBuffer:0 });
      setEvents(evs); renderEvents(); generateCalendar(); if(selectedDay) showReminders(selectedDay);
      addedLabel='\uD83D\uDCC5 Event added!';
    } else if(effectiveKind==='reminder'){
      const dateKey=parsed.date||new Date().toISOString().slice(0,10);
      const rems=getReminders();
      if(!rems[dateKey]) rems[dateKey]=[];
      rems[dateKey].push({ text:parsed.title, time:parsed.time||'', notify:'none' });
      setReminders(rems); generateCalendar(); if(selectedDay) showReminders(selectedDay);
      addedLabel='\uD83D\uDD14 Reminder added for '+dateKey+'!';
    } else if(effectiveKind==='task'){
      const tasks=getTasks();
      tasks.push({ title:parsed.title, category:parsed.category||'', done:false, date:parsed.date||'', time:parsed.time||'', priority:'2' });
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

window._focusQuickAdd=function(){ const i=document.getElementById('quickAddInput'); if(i){ showView('calendar'); i.focus(); i.select(); } };

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
  var VIEWS=['events','reminders','calendar','tasks','settings'];
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
  const bar=document.getElementById('syncStatusBar'); if(!bar) return;
  let hideTimer=null;
  function show(msg,autohide){ bar.textContent=msg; bar.style.display='block'; if(hideTimer) clearTimeout(hideTimer); if(autohide) hideTimer=setTimeout(function(){ bar.style.display='none'; },4000); }
  window.addEventListener('pouch-sync:active',function(){ show('\uD83D\uDD04 Syncing\u2026',false); });
  window.addEventListener('pouch-sync:paused',function(){ show('\u2705 Synced',true); });
  window.addEventListener('pouch-sync:import',function(){ show('\u2705 Data imported from cloud',true); });
  window.addEventListener('pouch-sync:error', function(e){ show('\u26A0\uFE0F Sync error: '+(e.detail&&e.detail.message?e.detail.message:'unknown'),true); });
  window.addEventListener('token-sync:started',function(){ show('\uD83D\uDD04 Token sync active',true); });
  window.addEventListener('token-sync:updated',function(){ show('\u2705 Data updated from other device',true); });
  window.addEventListener('token-sync:stopped',function(){ show('Token sync stopped',true); });
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
      const evCount=getEvents().filter(function(e){ return normalizeDate(e.date)===ts; }).length;
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
  updateInboxBadge();
});
