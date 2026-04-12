// Minimal shared helpers used by other view scripts
(function () {
  function loadEvents(storageKey = 'events') {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]') || [];
    } catch (e) {
      return [];
    }
  }

  // --- Edit modal helpers/wiring ---
  function hideEditModal() {
    const m = document.getElementById('editModal');
    if (!m) return;
    m.classList.add('hidden');
  }
  function showEditModal() {
    const m = document.getElementById('editModal');
    if (!m) return;
    if (!m.classList.contains('hidden')) return; // already visible
    m.classList.remove('hidden');
    // focus first input
    setTimeout(() => {
      const el = document.getElementById('editText');
      if (el && el.focus) try { el.focus(); } catch(_) {}
    }, 0);
  }
  function wireEditModalOnce() {
    const m = document.getElementById('editModal');
    if (!m || m.dataset.wired === '1') return;
    m.dataset.wired = '1';
    const cancel = document.getElementById('cancelEdit');
    if (cancel) cancel.addEventListener('click', (e) => { e.preventDefault(); hideEditModal(); });
    // click outside panel closes
    m.addEventListener('click', (e) => {
      if (e.target === m) hideEditModal();
    });
    // escape closes
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !m.classList.contains('hidden')) hideEditModal();
    });
  }
  document.addEventListener('DOMContentLoaded', wireEditModalOnce);

  function openEditModalFill(ev) {
    // populate existing edit modal if present; otherwise log
    const editModal = document.getElementById('editModal');
    if (!editModal) {
      console.log('openEditModalFill:', ev);
      return;
    }
    const setIf = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || '';
    };
    setIf('editKind', 'event');
    setIf('editEventId', ev.id || '');
    setIf('editText', ev.title || '');
    setIf('editDate', ev.date || '');
    setIf('editTime', ev.startTime || ev.time || '');
    setIf('editEndTime', ev.endTime || '');
    setIf('editEmoji', ev.emoji || '');
    setIf('editRepeat', ev.repeat || 'none');
    setIf('editRepeatUntil', ev.repeatUntil || '');
    setIf('editRepeatInterval', ev.repeatInterval || 1);
    setIf('editRepeatUnit', ev.repeatUnit || 'days');
    setIf('editABWeek', ev.abWeek || 'a');
    try {
      const rep = document.getElementById('editRepeat');
      if (rep) rep.dispatchEvent(new Event('change'));
    } catch (_) {}
    // --- populate advanced item specifications if available ---
    try {
      if (typeof populateAdvancedSpecs === 'function') {
        populateAdvancedSpecs('editAdvSpecList', ev.advancedSpecs || []);
      } else if (window.populateAdvancedSpecs) {
        window.populateAdvancedSpecs('editAdvSpecList', ev.advancedSpecs || []);
      }
    } catch (_) {}
    // --- copy job/category info (if present) into the main event form so it is visible/editable ---
    try {
      const mainCat = document.getElementById('eventCategory');
      const mainJobId = document.getElementById('eventJobId');
      const mainJobName = document.getElementById('eventJobName');
      const mainJobRate = document.getElementById('eventJobRate');
      const mainJobUnit = document.getElementById('eventJobUnit');
      const mainJobEmoji = document.getElementById('eventJobEmoji');
      const mainJobLocation = document.getElementById('eventJobLocation');
      if (mainCat) {
        const catVal = ev.eventCategory || ev.category || '';
        if (catVal) mainCat.value = catVal;
      }
      if (mainJobId) {
        const jid = ev.eventJobId || ev.jobId || ev.job || '';
        if (jid) mainJobId.value = jid;
      }
      // snapshot fields copied if present on the event object
      if (mainJobName && (ev.eventJobName || ev.jobName || ev.job_name)) mainJobName.value = ev.eventJobName || ev.jobName || ev.job_name || '';
      if (mainJobRate && (ev.eventJobRate || ev.jobRate || ev.job_rate)) mainJobRate.value = ev.eventJobRate || ev.jobRate || ev.job_rate || '';
      if (mainJobUnit && (ev.eventJobUnit || ev.jobUnit || ev.job_unit)) mainJobUnit.value = ev.eventJobUnit || ev.jobUnit || ev.job_unit || '';
      if (mainJobEmoji && (ev.eventJobEmoji || ev.jobEmoji || ev.job_emoji)) mainJobEmoji.value = ev.eventJobEmoji || ev.jobEmoji || ev.job_emoji || '';
      if (mainJobLocation && (ev.eventJobLocation || ev.jobLocation || ev.job_location)) mainJobLocation.value = ev.eventJobLocation || ev.jobLocation || ev.job_location || '';
      // ensure events-view job selector updates UI (if its script is loaded)
      if (window && window.dispatchEvent) window.dispatchEvent(new CustomEvent('app:data:updated'));
    } catch (e) { /* ignore */ }
    showEditModal();
  }

  // date helpers
  function parseISO(d) { return d ? new Date(d + 'T00:00:00') : null; }
  function toISODate(dt) { return dt.toISOString().slice(0,10); }
  function addDaysISO(dateISO, days) {
    const dt = parseISO(dateISO);
    dt.setDate(dt.getDate() + days);
    return toISODate(dt);
  }

  function startOfWeekMonday(dateISO) {
    const dt = parseISO(dateISO);
    const dow = dt.getDay();
    const mondayOffset = dow === 0 ? -6 : (1 - dow);
    dt.setDate(dt.getDate() + mondayOffset);
    return toISODate(dt);
  }

  function addMonthsISO(dateISO, count) {
    const dt = parseISO(dateISO);
    const day = dt.getDate();
    dt.setMonth(dt.getMonth() + count);
    if (dt.getDate() < day) dt.setDate(0);
    return toISODate(dt);
  }

  function addYearsISO(dateISO, count) {
    const dt = parseISO(dateISO);
    const day = dt.getDate();
    dt.setFullYear(dt.getFullYear() + count);
    if (dt.getDate() < day) dt.setDate(0);
    return toISODate(dt);
  }

  function minDateISO(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a <= b ? a : b;
  }

  // expandEvents(startISO, endISO): returns occurrences (including non-repeating) whose date falls within [startISO,endISO]
  // Each occurrence is a shallow clone of the base event with .occurrenceDate and ._baseId set to original id.
  function expandEvents(startISO, endISO, storageKey = 'events') {
    const start = parseISO(startISO);
    const end = parseISO(endISO);
    if (!start || !end) return [];
    const events = loadEvents(storageKey);
    const out = [];
    events.forEach(ev => {
      if (!ev || !ev.date) return;
      const baseDate = ev.date;
      const repeat = (ev.repeat || 'none'); // expected value strings from UI
      const until = ev.repeatUntil || null; // optional YYYY-MM-DD
      const capUntil = addYearsISO(baseDate, 2);
      const effectiveEnd = minDateISO(endISO, minDateISO(until, capUntil));

      // helper to push occurrence if in range
      const pushIfInRange = (dISO) => {
        const dt = parseISO(dISO);
        if (dt >= start && dt <= end) {
          const occ = Object.assign({}, ev);
          occ.occurrenceDate = dISO;
          occ.date = dISO; // make date property be the occurrence date for downstream code
          occ._baseId = ev.id || ev._id || null;
          out.push(occ);
        }
      };

      // non repeating -> push if in range
      if (!repeat || repeat === 'none') {
        pushIfInRange(baseDate);
        return;
      }

      if (repeat === 'weekday_ab') {
        const startDow = parseISO(baseDate).getDay();
        if (startDow === 0 || startDow === 6) return;
        const firstPattern = (String(ev.abWeek || 'a').toLowerCase() === 'b') ? 'b' : 'a';
        const mondays = startOfWeekMonday(baseDate);
        const aDays = [1,3,5];
        const bDays = [2,4];

        // Build set of dates to skip when abSkipHolidays is enabled
        var skipDates = null;
        if (ev.abSkipHolidays) {
          skipDates = {};
          // helper: pad to 2 digits
          function _p2(n) { return n < 10 ? '0' + n : '' + n; }
          // helper: compute nth weekday of a month (1-indexed n)
          function _nthWd(yr, mi, wd, n) {
            var f = new Date(yr, mi, 1).getDay();
            return 1 + ((7 + wd - f) % 7) + (n - 1) * 7;
          }
          // helper: compute last weekday of a month
          function _lastWd(yr, mi, wd) {
            var last = new Date(yr, mi + 1, 0);
            return last.getDate() - ((7 + last.getDay() - wd) % 7);
          }
          // Gather years spanned by the range
          var startYr = parseISO(baseDate).getFullYear();
          var endYr = parseISO(effectiveEnd).getFullYear();
          for (var yr = startYr; yr <= endYr; yr++) {
            // Fixed federal holidays
            var fixedDates = [
              yr + '-01-01',  // New Year's Day
              yr + '-06-19',  // Juneteenth
              yr + '-07-04',  // Independence Day
              yr + '-11-11',  // Veterans Day
              yr + '-12-25'   // Christmas Day
            ];
            fixedDates.forEach(function(d) { skipDates[d] = true; });
            // Computed federal holidays
            skipDates[yr + '-01-' + _p2(_nthWd(yr, 0, 1, 3))] = true;  // MLK Day
            skipDates[yr + '-02-' + _p2(_nthWd(yr, 1, 1, 3))] = true;  // Presidents' Day
            skipDates[yr + '-05-' + _p2(_lastWd(yr, 4, 1))] = true;    // Memorial Day
            skipDates[yr + '-09-' + _p2(_nthWd(yr, 8, 1, 1))] = true;  // Labor Day
            skipDates[yr + '-10-' + _p2(_nthWd(yr, 9, 1, 2))] = true;  // Columbus Day
            skipDates[yr + '-11-' + _p2(_nthWd(yr, 10, 4, 4))] = true; // Thanksgiving
          }
          // User-defined off-days from localStorage
          try {
            var userOffDays = JSON.parse(localStorage.getItem('userOffDays') || '[]');
            if (Array.isArray(userOffDays)) {
              userOffDays.forEach(function(d) {
                var dateStr = typeof d === 'string' ? d : (d && d.date ? d.date : '');
                if (dateStr) skipDates[dateStr] = true;
              });
            }
          } catch(_) {}
        }

        // Per-job/bucket off-days: if event is linked to a job (work domain), add job-specific off-days
        var bucketOrJobId = (ev.bucketId !== undefined && ev.bucketId !== null) ? ev.bucketId : (ev.jobId ? ev.jobId : null);
        if (bucketOrJobId !== null) {
          try {
            var jobs = JSON.parse(localStorage.getItem('jobs') || '[]');
            var normalizedId = (typeof bucketOrJobId === 'string') ? parseInt(bucketOrJobId, 10) : bucketOrJobId;
            var linkedJob = jobs.find(function(j) { return j.id === normalizedId; });
            if (linkedJob && Array.isArray(linkedJob.offDays) && linkedJob.offDays.length) {
              if (!skipDates) skipDates = {};
              linkedJob.offDays.forEach(function(d) {
                var dateStr = typeof d === 'string' ? d : (d && d.date ? d.date : '');
                if (dateStr) skipDates[dateStr] = true;
              });
            }
          } catch(_) {}
        }

        // Build the full list of canonical A/B slot dates (ignoring off-days).
        const canonicalSlots = [];
        let weekIndex = 0;
        while (weekIndex < 200) {
          const weekStart = addDaysISO(mondays, weekIndex * 7);
          if (weekStart > effectiveEnd) break;
          const useA = (firstPattern === 'a') ? (weekIndex % 2 === 0) : (weekIndex % 2 !== 0);
          const dayList = useA ? aDays : bDays;
          dayList.forEach(function(weekdayNum) {
            canonicalSlots.push(addDaysISO(weekStart, weekdayNum - 1));
          });
          weekIndex += 1;
        }

        // Walk canonical slots tracking how many school days have been lost
        // to off-days. For each canonical slot, advance that many school days
        // forward (skipping weekends and off-days) to find the actual date.
        //
        // School A/B days form a continuous sequence of school days. A holiday
        // on ANY weekday — even one that was not itself a canonical event slot —
        // removes one day from the sequence and therefore shifts every subsequent
        // occurrence forward by one school day.
        //
        // Unlike a simple calendar-day shift, advancing by school days correctly
        // handles weekend crossings: a 1-school-day shift from Friday lands on
        // Monday (not Saturday), without permanently inflating the shift for
        // subsequent slots.
        let schoolDaysLost = 0;
        // scanFrom tracks where the inter-slot scan should begin (inclusive).
        // It starts at baseDate so that weekday holidays between baseDate and
        // the first canonical slot are counted, but days before baseDate are not.
        let scanFrom = baseDate;
        canonicalSlots.forEach(function(canonical) {
          if (canonical < baseDate) return;
          // Count off-days on weekdays in [scanFrom, canonical).
          // Each such off-day removes one school day from the sequence.
          if (skipDates) {
            let scanDate = scanFrom;
            while (scanDate < canonical) {
              const sdow = parseISO(scanDate).getDay();
              if (sdow !== 0 && sdow !== 6 && skipDates[scanDate]) {
                schoolDaysLost++;
              }
              scanDate = addDaysISO(scanDate, 1);
            }
          }
          // Next scan starts after this canonical slot so it is not re-scanned.
          scanFrom = addDaysISO(canonical, 1);
          // Check if the canonical date itself is an off-day (the inter-slot
          // scan excludes the canonical date, so we check it separately).
          if (skipDates && skipDates[canonical]) {
            schoolDaysLost++;
          }
          // Advance schoolDaysLost school days from the canonical date.
          // Each step skips weekends and off-days without permanently
          // inflating the shift count.
          let candidate = canonical;
          let remaining = schoolDaysLost;
          let safety = 0;
          while (remaining > 0 && safety++ < 200) {
            candidate = addDaysISO(candidate, 1);
            const dow = parseISO(candidate).getDay();
            if (dow === 0 || dow === 6) continue;
            if (skipDates && skipDates[candidate]) continue;
            remaining--;
          }
          if (candidate > effectiveEnd) return;
          pushIfInRange(candidate);
        });
        return;
      }

      // repeating: iterate from baseDate to end, advancing according to rule, stop at repeatUntil if present
      let d = baseDate;
      const maxLoop = 2000; // safety cap
      let loops = 0;
      while (true) {
        if (loops++ > maxLoop) break;
        // stop if beyond end or beyond repeatUntil
        if (d > effectiveEnd) break;
        // push occurrence if >= start and <= end
        pushIfInRange(d);
        // advance
        if (repeat === 'daily') d = addDaysISO(d, 1);
        else if (repeat === '2day') d = addDaysISO(d, 2);
        else if (repeat === 'weekday') {
          d = addDaysISO(d, 1);
          const wd = parseISO(d).getDay();
          if (wd === 6) d = addDaysISO(d, 2);
          else if (wd === 0) d = addDaysISO(d, 1);
        }
        else if (repeat === 'weekly') d = addDaysISO(d, 7);
        else if (repeat === 'monthly') {
          d = addMonthsISO(d, 1);
        } else if (repeat === 'custom') {
          const n = Math.max(1, Math.min(30, parseInt(ev.repeatInterval, 10) || 1));
          const unit = ['days','weeks','months','years'].includes(ev.repeatUnit) ? ev.repeatUnit : 'days';
          if (unit === 'days') d = addDaysISO(d, n);
          else if (unit === 'weeks') d = addDaysISO(d, n * 7);
          else if (unit === 'months') d = addMonthsISO(d, n);
          else d = addYearsISO(d, n);
        } else {
          // unknown rule: break
          break;
        }
        // stop when d built beyond reasonable date
        if (parseISO(d) > parseISO('2100-01-01')) break;
      }

      // ── Advanced Item Specifications: expand additional time/repeat schedules ──
      if (Array.isArray(ev.advancedSpecs) && ev.advancedSpecs.length) {
        ev.advancedSpecs.forEach(function(spec) {
          var specRepeat = spec.repeat || 'none';
          var specUntil = spec.repeatUntil || null;
          var specCapUntil = addYearsISO(baseDate, 2);
          var specEffEnd = minDateISO(endISO, minDateISO(specUntil, specCapUntil));

          var pushSpecIfInRange = function(dISO) {
            var dt = parseISO(dISO);
            if (dt >= start && dt <= end) {
              var occ = Object.assign({}, ev);
              occ.occurrenceDate = dISO;
              occ.date = dISO;
              occ._baseId = ev.id || ev._id || null;
              // Override time fields from the spec
              occ.time = spec.time || '';
              occ.startTime = spec.time || '';
              occ.endTime = spec.endTime || '';
              occ._advancedSpec = true;
              out.push(occ);
            }
          };

          if (!specRepeat || specRepeat === 'none') {
            pushSpecIfInRange(baseDate);
            return;
          }

          if (specRepeat === 'weekday_ab') {
            var specStartDow = parseISO(baseDate).getDay();
            if (specStartDow === 0 || specStartDow === 6) return;
            var specFirstPattern = (String(spec.abWeek || 'a').toLowerCase() === 'b') ? 'b' : 'a';
            var specMondays = startOfWeekMonday(baseDate);
            var specADays = [1,3,5];
            var specBDays = [2,4];

            var specSkipDates = null;
            if (spec.abSkipHolidays) {
              specSkipDates = {};
              function _sp2(n) { return n < 10 ? '0' + n : '' + n; }
              function _snthWd(yr, mi, wd, n) {
                var f = new Date(yr, mi, 1).getDay();
                return 1 + ((7 + wd - f) % 7) + (n - 1) * 7;
              }
              function _slastWd(yr, mi, wd) {
                var last = new Date(yr, mi + 1, 0);
                return last.getDate() - ((7 + last.getDay() - wd) % 7);
              }
              var specStartYr = parseISO(baseDate).getFullYear();
              var specEndYr = parseISO(specEffEnd).getFullYear();
              for (var syr = specStartYr; syr <= specEndYr; syr++) {
                [syr + '-01-01', syr + '-06-19', syr + '-07-04', syr + '-11-11', syr + '-12-25'].forEach(function(d) { specSkipDates[d] = true; });
                specSkipDates[syr + '-01-' + _sp2(_snthWd(syr, 0, 1, 3))] = true;
                specSkipDates[syr + '-02-' + _sp2(_snthWd(syr, 1, 1, 3))] = true;
                specSkipDates[syr + '-05-' + _sp2(_slastWd(syr, 4, 1))] = true;
                specSkipDates[syr + '-09-' + _sp2(_snthWd(syr, 8, 1, 1))] = true;
                specSkipDates[syr + '-10-' + _sp2(_snthWd(syr, 9, 1, 2))] = true;
                specSkipDates[syr + '-11-' + _sp2(_snthWd(syr, 10, 4, 4))] = true;
              }
              try {
                var specUserOffDays = JSON.parse(localStorage.getItem('userOffDays') || '[]');
                if (Array.isArray(specUserOffDays)) {
                  specUserOffDays.forEach(function(d) {
                    var ds = typeof d === 'string' ? d : (d && d.date ? d.date : '');
                    if (ds) specSkipDates[ds] = true;
                  });
                }
              } catch(_) {}
            }

            var specBucketOrJobId = (ev.bucketId !== undefined && ev.bucketId !== null) ? ev.bucketId : (ev.jobId ? ev.jobId : null);
            if (specBucketOrJobId !== null) {
              try {
                var specJobs = JSON.parse(localStorage.getItem('jobs') || '[]');
                var specNormId = (typeof specBucketOrJobId === 'string') ? parseInt(specBucketOrJobId, 10) : specBucketOrJobId;
                var specLinkedJob = specJobs.find(function(j) { return j.id === specNormId; });
                if (specLinkedJob && Array.isArray(specLinkedJob.offDays) && specLinkedJob.offDays.length) {
                  if (!specSkipDates) specSkipDates = {};
                  specLinkedJob.offDays.forEach(function(d) {
                    var ds = typeof d === 'string' ? d : (d && d.date ? d.date : '');
                    if (ds) specSkipDates[ds] = true;
                  });
                }
              } catch(_) {}
            }

            var specCanonicalSlots = [];
            var specWeekIndex = 0;
            while (specWeekIndex < 200) {
              var specWeekStart = addDaysISO(specMondays, specWeekIndex * 7);
              if (specWeekStart > specEffEnd) break;
              var specUseA = (specFirstPattern === 'a') ? (specWeekIndex % 2 === 0) : (specWeekIndex % 2 !== 0);
              var specDayList = specUseA ? specADays : specBDays;
              specDayList.forEach(function(weekdayNum) {
                specCanonicalSlots.push(addDaysISO(specWeekStart, weekdayNum - 1));
              });
              specWeekIndex += 1;
            }

            var specSchoolDaysLost = 0;
            var specScanFrom = baseDate;
            specCanonicalSlots.forEach(function(canonical) {
              if (canonical < baseDate) return;
              if (specSkipDates) {
                var scanDate = specScanFrom;
                while (scanDate < canonical) {
                  var sdow = parseISO(scanDate).getDay();
                  if (sdow !== 0 && sdow !== 6 && specSkipDates[scanDate]) specSchoolDaysLost++;
                  scanDate = addDaysISO(scanDate, 1);
                }
              }
              specScanFrom = addDaysISO(canonical, 1);
              if (specSkipDates && specSkipDates[canonical]) specSchoolDaysLost++;
              var candidate = canonical;
              var remaining = specSchoolDaysLost;
              var safety = 0;
              while (remaining > 0 && safety++ < 200) {
                candidate = addDaysISO(candidate, 1);
                var dow = parseISO(candidate).getDay();
                if (dow === 0 || dow === 6) continue;
                if (specSkipDates && specSkipDates[candidate]) continue;
                remaining--;
              }
              if (candidate > specEffEnd) return;
              pushSpecIfInRange(candidate);
            });
            return;
          }

          var sd = baseDate;
          var specMaxLoop = 2000;
          var specLoops = 0;
          while (true) {
            if (specLoops++ > specMaxLoop) break;
            if (sd > specEffEnd) break;
            pushSpecIfInRange(sd);
            if (specRepeat === 'daily') sd = addDaysISO(sd, 1);
            else if (specRepeat === '2day') sd = addDaysISO(sd, 2);
            else if (specRepeat === 'weekday') {
              sd = addDaysISO(sd, 1);
              var swd = parseISO(sd).getDay();
              if (swd === 6) sd = addDaysISO(sd, 2);
              else if (swd === 0) sd = addDaysISO(sd, 1);
            }
            else if (specRepeat === 'weekly') sd = addDaysISO(sd, 7);
            else if (specRepeat === 'monthly') sd = addMonthsISO(sd, 1);
            else if (specRepeat === 'custom') {
              var sn = Math.max(1, Math.min(30, parseInt(spec.repeatInterval, 10) || 1));
              var sunit = ['days','weeks','months','years'].includes(spec.repeatUnit) ? spec.repeatUnit : 'days';
              if (sunit === 'days') sd = addDaysISO(sd, sn);
              else if (sunit === 'weeks') sd = addDaysISO(sd, sn * 7);
              else if (sunit === 'months') sd = addMonthsISO(sd, sn);
              else sd = addYearsISO(sd, sn);
            } else {
              break;
            }
            if (parseISO(sd) > parseISO('2100-01-01')) break;
          }
        });
      }
    });
    // sort by date asc
    out.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    return out;
  }

  // expose
  window.appUtils = window.appUtils || {};
  window.appUtils.loadEvents = loadEvents;
  window.appUtils.openEditModalFill = openEditModalFill;
  window.appUtils.expandEvents = expandEvents;
  window.appUtils.hideEditModal = hideEditModal;
  window.appUtils.showEditModal = showEditModal;
})();
