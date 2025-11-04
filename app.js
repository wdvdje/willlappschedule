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

/* ---------- DAILY VIEW: hourly rendering and part selection ---------- */
const DAY_PARTS = {
  morning: { start: 1, end: 9 },  // 01:00 - 09:00 (end exclusive)
  day:     { start: 9, end: 17 }, // 09:00 - 17:00
  night:   { start: 17, end: 25 } // 17:00 - 01:00 -> represent 01:00 as 25 to make span easy
};

function hourToLabel(h){
  const hh = h % 24;
  const ampm = hh < 12 ? 'AM' : 'PM';
  const display = (hh % 12) === 0 ? 12 : hh % 12;
  return `${String(display).padStart(2,'0')}:00 ${ampm}`;
}

function getEventsForDateKey(dateKey){
  // returns events (with normalized times) for the given YYYY-MM-DD
  return getEvents().filter(ev => normalizeDate(ev.date) === dateKey && (ev.time || ev.endTime));
}

function renderDailyViewForDay(year, monthIndex, day, partKey){
  const container = document.getElementById('dailyView');
  if(!container) return;
  const dateKey = `${year}-${pad2(monthIndex+1)}-${pad2(day)}`;
  const events = getEventsForDateKey(dateKey);

  // Determine part
  let part = DAY_PARTS[partKey];
  if(!part){
    // if auto, pick part containing current hour
    const now = new Date();
    const curHour = (now.getFullYear()===year && now.getMonth()===monthIndex && now.getDate()===day) ? now.getHours() : new Date().getHours();
    partKey = determinePartFromHour(curHour);
    part = DAY_PARTS[partKey];
  }

  // Build hours array interpreted as numbers (use 24..25 for 00:00 next day if needed)
  const hours = [];
  for(let h = part.start; h < part.end; h++){
    hours.push(h);
  }

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
    row.appendChild(label);

    const eventsCell = document.createElement('div');
    eventsCell.className = 'hour-events';

    // list events overlapping this hour
    events.forEach(ev=>{
      const start = parseTimeToFloat(ev.time); // e.g., "09:30" -> 9.5
      const end = parseTimeToFloat(ev.endTime) || start;
      // map to numeric comparable range; treat end < start as next-day if needed
      let s = start, e = end;
      if (e && e <= s) e = e + 24;
      const hNumeric = (h >= 24) ? h - 24 + 24 : h; // keep 24..25 mapping
      // include if event overlaps [h, h+1)
      if ( (s < h+1) && (e > h) ){
        const evb = document.createElement('div');
        evb.className = 'event-block' + ( (s < h || e > h+1) ? ' continues' : '' );
        const timeSpan = document.createElement('span'); timeSpan.className='event-time';
        timeSpan.textContent = (ev.time ? ev.time : '') + (ev.endTime ? `–${ev.endTime}` : '');
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

/* generate calendar
   NOTE: fetch DOM elements at runtime so the calendar renders even if the script executed
   before the DOM on some pages. */
function generateCalendar(){
  const calendarEl = document.getElementById('calendar');
  const monthLabelEl = document.getElementById('monthLabel') || { textContent: '' };
  if (!calendarEl) { /* graceful no-op if calendar not present on page */ return; }

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

/* show reminders + events for a selected day
   also query calendar at runtime */
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
    const locationPart = ev.location ? ` @ <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}" target="_blank">${escapeHTML(ev.location)}</a>` : '';
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

  // render daily view for selected day; choose part auto
  if (selectedYear != null && selectedMonth != null && day){
    const sel = document.getElementById('dayPartSelect');
    const part = (sel && sel.value && sel.value !== 'auto') ? sel.value : 'auto';
    renderDailyViewForDay(selectedYear, selectedMonth, day, part);
    // scroll to current hour row
    const container = document.getElementById('dailyView');
    if(container){
      const current = container.querySelector('.hour-row.current');
      if(current) current.scrollIntoView({ behavior:'smooth', block:'center' });
    }
  }
}

/* Add reminder: if calendar selection missing, read reminderDate input */
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
  // If the added date is in current calendar view, update UI
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

/* Render events: include endTime in display */
function renderEvents(){
  const evs = getEvents();
  const list = document.getElementById('eventList');
  if (!list) return;
  list.innerHTML = '';
  evs.forEach(e=>{
    const li = document.createElement('li');
    const locHtml = e.location ? ` @ <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}" target="_blank">${escapeHTML(e.location)}</a>` : '';
    // show time range if endTime present
    const timeHtml = e.time ? (e.endTime ? `[${escapeHTML(e.time)}–${escapeHTML(e.endTime)}]` : `[${escapeHTML(e.time)}]`) : '';
    const bufferHtml = ((e.preBuffer||0) || (e.postBuffer||0)) ? ` <small style="color:#555">(${e.preBuffer||0}m pre / ${e.postBuffer||0}m post)</small>` : '';
    li.innerHTML = `${e.emoji?e.emoji+' ':''}<b>${escapeHTML(e.title)}</b> — ${e.date} ${timeHtml}${locHtml}${bufferHtml} <span class="item-controls"><button class="small-btn" onclick="editEvent(${e.id})">Edit</button><button class="small-btn" onclick="deleteEvent(${e.id})">Delete</button></span>`;
    list.appendChild(li);
  });
}

/* Add event: capture end time */
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
document.addEventListener('click', function(){}, true); // ensure page has loaded a minimal listener
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
  }

  else if (kind==='task'){
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

/* Places autocomplete init (keeps original approach) */
function initPlaces(){
  if (!window.google || !google.maps || !google.maps.places){
    console.warn('Google Maps Places library not available.');
    return;
  }
  try{
    const acService = new google.maps.places.AutocompleteService();
    const placesSvc = new google.maps.places.PlacesService(document.createElement('div'));

    function attachAutocompleteUI(input, listEl){
      let currentRequestId = 0;
      input.dataset.place = '';
      function hideList(){ listEl.style.display = 'none'; listEl.innerHTML = ''; }
      input.addEventListener('input', function(){
        const q = input.value.trim();
        if (!q){ hideList(); return; }
        const reqId = ++currentRequestId;
        acService.getPlacePredictions({ input: q, types: ['geocode'] }, (preds, status)=>{
          if (reqId !== currentRequestId) return;
          if (!preds || !preds.length){ hideList(); return; }
          listEl.innerHTML = '';
          preds.forEach(p=>{
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = p.description;
            btn.addEventListener('click', ()=>{
              input.value = p.description;
              hideList();
              input.dataset.place = JSON.stringify({description: p.description, placeId: p.place_id});
              placesSvc.getDetails({ placeId: p.place_id, fields: ['formatted_address','geometry','place_id'] }, (detail, st)=>{
                if (st === google.maps.places.PlacesServiceStatus.OK && detail){
                  input.value = detail.formatted_address || input.value;
                  input.dataset.place = JSON.stringify({
                    address: detail.formatted_address || p.description,
                    lat: detail.geometry && detail.geometry.location ? detail.geometry.location.lat() : null,
                    lng: detail.geometry && detail.geometry.location ? detail.geometry.location.lng() : null,
                    placeId: detail.place_id || p.place_id
                  });
                }
              });
              input.dispatchEvent(new Event('change'));
            });
            listEl.appendChild(btn);
          });
          listEl.style.display = 'block';
        });
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
  }catch(err){ console.warn('initPlaces error', err); }
}

/* UI: overlay inputs - toggle has-value class on input events (call on DOMContentLoaded) */
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
    // initial state
    toggle();
  });
}

/* SPA view switching (new) */
function showView(view, updateHash = true){
  view = view || 'calendar';
  // hide all pages
  document.querySelectorAll('[id^="page-"]').forEach(p=> p.classList.add('hidden'));
  // show selected page
  const el = document.getElementById('page-'+view);
  if (el) el.classList.remove('hidden');

  // update ribbon active state
  document.querySelectorAll('.bottom-ribbon .r-item').forEach(a=>{
    const v = a.dataset.view || (a.getAttribute('href')||'').replace('#','');
    a.classList.toggle('active', v === view);
  });

  // refresh page-specific UI
  if (view === 'calendar'){
    try{ generateCalendar(); }catch(e){ console.warn('generateCalendar failed', e); }
    if (selectedDay) try{ showReminders(selectedDay); }catch(e){ console.warn('showReminders failed', e); }
  } else if (view === 'events'){
    try{ renderEvents(); }catch(e){ console.warn('renderEvents failed', e); }
  } else if (view === 'tasks'){
    try{ loadTasks(); }catch(e){ console.warn('loadTasks failed', e); }
  } else if (view === 'reminders'){
    // optionally populate reminders view if needed
  }

  if (updateHash){
    const newHash = '#'+view;
    if (location.hash !== newHash) location.hash = newHash;
  }
}

// react to back/forward
window.addEventListener('hashchange', ()=> {
  const v = (location.hash && location.hash.length>1) ? location.hash.slice(1) : 'calendar';
  showView(v, false);
});

/* event wiring and initialization */
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

    // ribbon clicks: if already on SPA (index) do client navigation; otherwise links point to index.html#view
    document.querySelectorAll('.bottom-ribbon .r-item').forEach(a=>{
      a.addEventListener('click', function(ev){
        // if currently on index (SPA) intercept and do client-side view switch
        const onIndex = location.pathname.endsWith('index.html') || location.pathname.endsWith('/') || location.pathname.endsWith('/index.html');
        const targetView = a.dataset.view || (a.getAttribute('href')||'#calendar').replace('#','');
        if (onIndex){
          ev.preventDefault();
          showView(targetView);
        }
        // else let the anchor navigate to index.html#view (links on other pages should use index.html#...)
      });
    });

    // existing day-part select listener (kept)
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

/* expose functions used by inline handlers (Edit/Delete buttons) */
window.editEvent = editEvent;
window.deleteEvent = deleteEvent;
window.editReminder = editReminder;
window.deleteReminder = deleteReminder;
window.showView = showView; // expose for debugging / direct calls

/* dynamic maps loader */
const MAPS_API_KEY = (window.MAPS_API_KEY || localStorage.getItem('MAPS_API_KEY') || 'YOUR_API_KEY').trim();
function loadMapsScript(key){
  return new Promise((resolve, reject)=>{
    if (!key || key === 'YOUR_API_KEY') {
      console.warn('Google Maps API key not configured — skipping Maps load.');
      return resolve(null);
    }
    const s = document.createElement('script');
    s.async = true; s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    s.onload = ()=> { try{ if (typeof initPlaces === 'function') initPlaces(); }catch(err){ console.warn('initPlaces failed after maps load', err); } resolve(s); };
    s.onerror = ()=> reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(s);
  });
}

/* initial startup */
document.addEventListener('DOMContentLoaded', function(){
  try{
    migrateNormalizeTasks();
    const now = new Date();
    selectedMonth = now.getMonth();
    selectedYear = now.getFullYear();
    selectedDay = now.getDate();

    // Wire up page listeners now that DOM is ready
    attachPageListeners();

    // Show initial SPA view (from hash or default)
    const initial = (location.hash && location.hash.length>1) ? location.hash.slice(1) : 'calendar';
    try { showView(initial, false); } catch(e){ console.warn('showView failed', e); }

    // Ensure calendar & day rendering are attempted (guarded)
    try{ if (document.getElementById('calendar')) generateCalendar(); }catch(e){ console.warn('generateCalendar init failed',e); }
    try{ if (document.getElementById('calendar')) showReminders(selectedDay); }catch(e){ console.warn('showReminders init failed',e); }

    // Render lists if present
    try{ if (document.getElementById('taskList')) loadTasks(); }catch(e){ console.warn('loadTasks failed', e); }
    try{ if (document.getElementById('eventList')) renderEvents(); }catch(e){ console.warn('renderEvents failed', e); }

    // Initialize Places/maps (loads script dynamically if API key present)
    if (window.google && google.maps && google.maps.places){
      try{ initPlaces(); }catch(e){ console.warn('initPlaces failed', e); }
    } else {
      loadMapsScript(MAPS_API_KEY).then((el)=>{ if (el) console.info('Google Maps script loaded.'); }).catch(err=>{ console.warn('Maps script load failed:', err); });
    }

    // Overlay input behavior
    try{ initOverlayInputs(); }catch(e){ console.warn('initOverlayInputs failed', e); }
  }catch(err){
    console.error('Init error',err);
    showAppError('Initialization error: ' + (err && err.message || err));
  }
});
