/* Core helpers and storage */
const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const weekdayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function pad2(n){ return n<10 ? '0'+n : ''+n; }
function safeParseStorage(key, fallback){
  try{ const raw = localStorage.getItem(key); if (!raw) return fallback; return JSON.parse(raw); }
  catch(e){ console.warn('LocalStorage parse failed for', key, e); try{ localStorage.removeItem(key); }catch(_){} return fallback; }
}
function getReminders(){ return safeParseStorage('reminders', {}); }
function setReminders(v){ localStorage.setItem('reminders', JSON.stringify(v)); }
function getTasks(){ return safeParseStorage('tasks', []); }
function setTasks(v){ localStorage.setItem('tasks', JSON.stringify(v)); }
function getEvents(){ return safeParseStorage('events', []); }
function setEvents(v){ localStorage.setItem('events', JSON.stringify(v)); }
function getJobs(){ return safeParseStorage('jobs', []); }
function setJobs(v){ localStorage.setItem('jobs', JSON.stringify(v)); }

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
      const nd = normalizeDate(tasks[i].date);
      if (tasks[i].date !== nd){
        tasks[i].date = nd;
        changed = true;
      }
    }
    if (changed) setTasks(tasks);
  }catch(e){ console.warn('Task migration failed', e); }
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
    const span = document.createElement('span'); span.innerHTML = ` ${escapeHTML(t.text)} ${t.date?`[${t.date}]`:''} ${t.time?`[${t.time}]`:''} Priority:${pmap[t.priority]||t.priority}`; span.className = `category-${t.category||''}`;
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
  const tasks = getTasks(); tasks.push({text,category,done:false,date,time,priority}); setTasks(tasks);
  if (textEl) textEl.value=''; if (document.getElementById('taskDate')) document.getElementById('taskDate').value=''; if (document.getElementById('taskTime')) document.getElementById('taskTime').value='';
  loadTasks();
}

/* task edit/delete */
function deleteTask(i){ if(!confirm('Delete this task?')) return; const tasks=getTasks(); tasks.splice(i,1); setTasks(tasks); loadTasks(); }
function editTask(i){
  const tasks=getTasks(); const t=tasks[i]; if(!t) return;
  document.getElementById('editKind').value='task';
  document.getElementById('editTaskIndex').value = i;
  document.getElementById('editText').value = t.text||'';
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
  const pre = parseInt(document.getElementById('eventPreBuffer') ? document.getElementById('eventPreBuffer').value : 0,10) || 0;
  const post = parseInt(document.getElementById('eventPostBuffer') ? document.getElementById('eventPostBuffer').value : 0,10) || 0;
  const evs = getEvents();
  const id = evs.length ? Math.max(...evs.map(e=>e.id))+1 : 1;
  evs.push({id,title,date,time,endTime,location,emoji,preBuffer:pre,postBuffer:post});
  setEvents(evs);
  if (document.getElementById('eventTitle')) document.getElementById('eventTitle').value='';
  if (document.getElementById('eventDate')) document.getElementById('eventDate').value='';
  if (document.getElementById('eventTime')) document.getElementById('eventTime').value='';
  if (document.getElementById('eventEndTime')) document.getElementById('eventEndTime').value='';
  if (document.getElementById('eventLocation')) document.getElementById('eventLocation').value='';
  if (document.getElementById('eventEmoji')) document.getElementById('eventEmoji').value='';
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
  document.getElementById('editPreBuffer').value = (e.preBuffer || 5);
  document.getElementById('editPostBuffer').value = (e.postBuffer || 5);
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
    evs[idx].title = text; evs[idx].date = date; evs[idx].time = time; evs[idx].endTime = endTime; evs[idx].location = document.getElementById('editLocation').value.trim(); evs[idx].emoji = document.getElementById('editEmoji').value.trim();
    evs[idx].preBuffer = parseInt(document.getElementById('editPreBuffer').value,10) || 0;
    evs[idx].postBuffer = parseInt(document.getElementById('editPostBuffer').value,10) || 0;
    setEvents(evs); renderEvents(); generateCalendar(); if (selectedDay) showReminders(selectedDay);
    closeEditModal();
    return;
  } else if (kind==='task'){
    const idx = parseInt(document.getElementById('editTaskIndex').value,10);
    const tasks = getTasks(); if (!tasks[idx]) { closeEditModal(); return; }
    tasks[idx].text = text; tasks[idx].date = date; tasks[idx].time = time; tasks[idx].category = document.getElementById('editCategory').value; tasks[idx].priority = document.getElementById('editPriority').value;
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
    migrateNormalizeTasks();
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
