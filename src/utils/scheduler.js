import { escapeICS } from "./sanitize.js";

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const FULL_DAYS = {
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday"
};

/** Default visible window of the timetable grid, in whole hours. */
export const DEFAULT_GRID_START_HOUR = 8;
export const DEFAULT_GRID_END_HOUR = 20;

/** Two classes this close together (in minutes) count as back-to-back. */
export const BACK_TO_BACK_MINUTES = 10;

/** Classes starting before this many minutes from midnight count as early. */
export const EARLY_CLASS_MINUTES = 9 * 60;

/**
 * Converts "HH:MM" string to minutes from midnight
 */
export function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Converts minutes from midnight to "HH:MM" 24h format
 */
export function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Formats 24h "HH:MM" string to 12h "9:30 AM" format
 */
export function format12h(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * True for a "busy block": a personal commitment (work shift, gym, prayer,
 * commute) stored as a course with a single, always-selected section so the
 * conflict machinery and the optimizer keep classes out of its way.
 */
export function isBusyCourse(course) {
  return !!course && course.kind === "busy";
}

/**
 * Check if two time slots overlap
 */
export function doSlotsOverlap(slotA, slotB) {
  if (slotA.day !== slotB.day) return false;
  const startA = timeToMinutes(slotA.startTime);
  const endA = timeToMinutes(slotA.endTime);
  const startB = timeToMinutes(slotB.startTime);
  const endB = timeToMinutes(slotB.endTime);

  // Overlap occurs if one starts before the other ends
  return Math.max(startA, startB) < Math.min(endA, endB);
}

/**
 * Check if two sections conflict
 */
export function doSectionsConflict(secA, secB) {
  if (!secA || !secB || secA.id === secB.id) return false;
  for (const slotA of secA.times) {
    for (const slotB of secB.times) {
      if (doSlotsOverlap(slotA, slotB)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Finds conflict reasons for a candidate section against selected sections
 */
export function getSectionConflicts(candidateSection, selectedSectionsMap, courses) {
  const conflicts = [];
  
  for (const [courseId, selectedSecId] of Object.entries(selectedSectionsMap)) {
    if (!selectedSecId) continue;
    
    const course = courses.find(c => c.id === courseId);
    if (!course) continue;
    
    // Skip if comparing section against its own course
    const selectedSec = course.sections.find(s => s.id === selectedSecId);
    if (!selectedSec || selectedSec.id === candidateSection.id) continue;

    for (const slotA of candidateSection.times) {
      for (const slotB of selectedSec.times) {
        if (doSlotsOverlap(slotA, slotB)) {
          conflicts.push({
            conflictingCourseId: course.id,
            conflictingCourseCode: course.code,
            conflictingSecName: selectedSec.name,
            conflictingIsBusy: isBusyCourse(course),
            day: slotA.day,
            timeA: `${slotA.startTime}-${slotA.endTime}`,
            timeB: `${slotB.startTime}-${slotB.endTime}`
          });
        }
      }
    }
  }
  
  return conflicts;
}

/**
 * Builds a sectionId -> course lookup table.
 * Callers that run metrics in a loop should build this once and pass it in,
 * instead of paying an O(courses x sections) scan per section.
 * @param {Array<object>} courses
 * @returns {Map<string, object>}
 */
export function buildCourseIndex(courses) {
  const index = new Map();
  courses.forEach(course => {
    course.sections.forEach(section => index.set(section.id, course));
  });
  return index;
}

/**
 * Counts pairs of classes on the same day separated by BACK_TO_BACK_MINUTES
 * or less. Expects slots that carry startMins/endMins.
 * @param {Array<object>} activeSlots
 * @returns {number}
 */
export function countBackToBack(activeSlots) {
  let count = 0;
  const slotsByDay = {};
  activeSlots.forEach(s => {
    if (!slotsByDay[s.day]) slotsByDay[s.day] = [];
    slotsByDay[s.day].push(s);
  });
  Object.values(slotsByDay).forEach(daySlots => {
    daySlots.sort((a, b) => a.startMins - b.startMins);
    for (let i = 1; i < daySlots.length; i++) {
      if (daySlots[i].startMins - daySlots[i - 1].endMins <= BACK_TO_BACK_MINUTES) count++;
    }
  });
  return count;
}

/**
 * Calculates gap hours and campus stay metrics for selected sections.
 *
 * Busy blocks are kept out of every number here: a work shift is neither
 * class time nor a campus gap. They are returned separately as `busySlots`
 * so the timetable can still draw them.
 *
 * @param {Array<object>} selectedSections
 * @param {Array<object>} courses
 * @param {Map<string, object>} [courseIndex] - optional prebuilt sectionId -> course map
 */
export function calculateScheduleMetrics(selectedSections, courses, courseIndex) {
  const index = courseIndex || buildCourseIndex(courses);

  // Collect all slots from selected sections with course meta
  const activeSlots = [];
  const busySlots = [];

  selectedSections.forEach(sec => {
    const course = index.get(sec.id);
    const busy = isBusyCourse(course);
    sec.times.forEach(t => {
      const slot = {
        ...t,
        startMins: timeToMinutes(t.startTime),
        endMins: timeToMinutes(t.endTime),
        // Carry the ids so consumers can resolve back to the real objects
        // instead of matching on display names, which are not unique.
        sectionId: sec.id,
        courseId: course ? course.id : null,
        courseCode: course ? course.code : "Course",
        courseColor: course ? course.color : "#6366f1",
        sectionName: sec.name,
        location: sec.location,
        isBusy: busy
      };
      if (busy) busySlots.push(slot);
      else activeSlots.push(slot);
    });
  });

  const dailyBreakdown = {};
  let totalGapMinutes = 0;
  let totalClassMinutes = 0;
  let totalCampusMinutes = 0;
  let activeDaysCount = 0;

  // Bucket slots by day in a single pass rather than re-scanning activeSlots
  // once per day.
  const slotsByDay = {};
  DAYS.forEach(day => { slotsByDay[day] = []; });
  activeSlots.forEach(slot => {
    if (slotsByDay[slot.day]) slotsByDay[slot.day].push(slot);
  });

  DAYS.forEach(day => {
    const daySlots = slotsByDay[day].sort((a, b) => a.startMins - b.startMins);

    if (daySlots.length === 0) {
      dailyBreakdown[day] = {
        day,
        hasClasses: false,
        firstStartMins: null,
        lastEndMins: null,
        firstStart: null,
        lastEnd: null,
        classHours: 0,
        campusHours: 0,
        gapHours: 0,
        gapIntervals: [],
        slots: []
      };
      return;
    }

    activeDaysCount++;
    let dayClassMins = 0;
    let dayGapMins = 0;
    const gapIntervals = [];

    const firstStartMins = daySlots[0].startMins;
    // reduce() rather than Math.max(...spread): no intermediate array, and no
    // argument-count limit on large inputs.
    const lastEndMins = daySlots.reduce((max, s) => (s.endMins > max ? s.endMins : max), daySlots[0].endMins);

    // Calculate class minutes & gaps between non-overlapping class periods
    let currentEnd = daySlots[0].endMins;
    dayClassMins += (daySlots[0].endMins - daySlots[0].startMins);

    for (let i = 1; i < daySlots.length; i++) {
      const slot = daySlots[i];
      dayClassMins += (slot.endMins - slot.startMins);

      if (slot.startMins > currentEnd) {
        const gapDuration = slot.startMins - currentEnd;
        dayGapMins += gapDuration;
        gapIntervals.push({
          start: minutesToTime(currentEnd),
          end: minutesToTime(slot.startMins),
          startMins: currentEnd,
          endMins: slot.startMins,
          durationMins: gapDuration,
          durationHours: Number((gapDuration / 60).toFixed(1))
        });
      }
      
      if (slot.endMins > currentEnd) {
        currentEnd = slot.endMins;
      }
    }

    const dayCampusMins = lastEndMins - firstStartMins;
    totalClassMinutes += dayClassMins;
    totalGapMinutes += dayGapMins;
    totalCampusMinutes += dayCampusMins;

    dailyBreakdown[day] = {
      day,
      hasClasses: true,
      firstStartMins,
      lastEndMins,
      firstStart: minutesToTime(firstStartMins),
      lastEnd: minutesToTime(lastEndMins),
      classHours: Number((dayClassMins / 60).toFixed(1)),
      campusHours: Number((dayCampusMins / 60).toFixed(1)),
      gapHours: Number((dayGapMins / 60).toFixed(1)),
      gapIntervals,
      slots: daySlots
    };
  });

  const totalGapHours = Number((totalGapMinutes / 60).toFixed(1));
  const totalClassHours = Number((totalClassMinutes / 60).toFixed(1));
  const totalCampusHours = Number((totalCampusMinutes / 60).toFixed(1));
  const daysOffCount = 7 - activeDaysCount;

  // Badges & Insights
  const badges = [];
  if (dailyBreakdown["Fri"].hasClasses === false) {
    badges.push({ text: "No Friday Classes", icon: "calendar-off", type: "success" });
  }
  if (daysOffCount >= 3) {
    badges.push({ text: `${daysOffCount}-Day Weekend`, icon: "sun", type: "success" });
  }
  if (totalGapHours === 0 && activeDaysCount > 0) {
    badges.push({ text: "Zero Gap Hours", icon: "zap", type: "primary" });
  } else if (totalGapHours > 8) {
    badges.push({ text: "High Gap Hours", icon: "alert-triangle", type: "warning" });
  }

  const earlyClasses = activeSlots.filter(s => s.startMins < EARLY_CLASS_MINUTES);
  if (earlyClasses.length === 0 && activeDaysCount > 0) {
    badges.push({ text: "No Early Mornings", icon: "coffee", type: "info" });
  } else if (earlyClasses.length > 0) {
    badges.push({ text: `${earlyClasses.length} Early Class(es)`, icon: "clock", type: "default" });
  }

  return {
    totalGapHours,
    totalClassHours,
    totalCampusHours,
    activeDaysCount,
    daysOffCount,
    earlyClassCount: earlyClasses.length,
    backToBackCount: countBackToBack(activeSlots),
    dailyBreakdown,
    activeSlots,
    busySlots,
    badges
  };
}

/**
 * Hard ceiling on how many valid schedules are collected. A student cannot
 * meaningfully compare more than this, and without a cap a large course list
 * produces a combinatorial explosion that freezes the tab (and, because the
 * course list is persisted, freezes it again on every subsequent load).
 */
export const MAX_COMBINATIONS = 2000;

/**
 * Returns the sections of a course the optimizer may still choose from once
 * locks and exclusions are applied: a locked section is the only candidate;
 * otherwise every section that is not excluded.
 *
 * @param {object} course
 * @param {{locked?: Set<string>|string[], excluded?: Set<string>|string[]}} [options]
 * @returns {Array<object>}
 */
export function getCandidateSections(course, options = {}) {
  const locked = toSet(options.locked);
  const excluded = toSet(options.excluded);
  const sections = course.sections || [];

  const lockedSection = sections.find(s => locked.has(s.id));
  if (lockedSection) return [lockedSection];
  return sections.filter(s => !excluded.has(s.id));
}

function toSet(value) {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value);
  return new Set();
}

/**
 * Generate valid non-conflicting combinations (1 section per course).
 *
 * Implemented as depth-first backtracking that prunes a branch as soon as the
 * section being added conflicts with one already chosen. The previous
 * implementation materialised the entire cartesian product (O(sections^courses)
 * arrays) before filtering, which cost ~1.1s and ~350MB at 8 courses x 4
 * sections and ran out of memory beyond that.
 *
 * Locked and excluded sections narrow each course's candidate list before the
 * search starts; a course whose every section is excluded is left out of the
 * search entirely (like a course with no sections), so the caller can warn.
 *
 * @param {Array<object>} courses
 * @param {Map<string, object>} [courseIndex] - optional prebuilt sectionId -> course map
 * @param {{locked?: Set<string>|string[], excluded?: Set<string>|string[]}} [options]
 * @returns {{sections: Array, selectionMap: object, metrics: object}[]}
 */
export function generateAllCombinations(courses, courseIndex, options = {}) {
  // Only include courses that have at least 1 usable section
  const validCourses = [];
  const candidatesByCourse = [];
  courses.forEach(course => {
    if (!course.sections || course.sections.length === 0) return;
    const candidates = getCandidateSections(course, options);
    if (candidates.length === 0) return;
    validCourses.push(course);
    candidatesByCourse.push(candidates);
  });
  if (validCourses.length === 0) return [];

  const index = courseIndex || buildCourseIndex(validCourses);

  // Precompute a conflict matrix between sections of different courses, so the
  // inner test during search is an O(1) set lookup instead of re-parsing time
  // strings for every pair on every branch.
  const conflictsWith = new Map();
  for (let i = 0; i < validCourses.length; i++) {
    for (let j = i + 1; j < validCourses.length; j++) {
      for (const secA of candidatesByCourse[i]) {
        for (const secB of candidatesByCourse[j]) {
          if (doSectionsConflict(secA, secB)) {
            if (!conflictsWith.has(secA.id)) conflictsWith.set(secA.id, new Set());
            if (!conflictsWith.has(secB.id)) conflictsWith.set(secB.id, new Set());
            conflictsWith.get(secA.id).add(secB.id);
            conflictsWith.get(secB.id).add(secA.id);
          }
        }
      }
    }
  }

  const validSchedules = [];
  const chosen = []; // working stack, pushed/popped rather than cloned per level

  const search = (courseIdx) => {
    if (validSchedules.length >= MAX_COMBINATIONS) return;

    if (courseIdx === validCourses.length) {
      const combo = chosen.slice();
      const selectionMap = {};
      combo.forEach((sec) => {
        const parentCourse = index.get(sec.id);
        if (parentCourse) selectionMap[parentCourse.id] = sec.id;
      });

      validSchedules.push({
        sections: combo,
        selectionMap,
        metrics: calculateScheduleMetrics(combo, validCourses, index)
      });
      return;
    }

    for (const candidate of candidatesByCourse[courseIdx]) {
      const candidateConflicts = conflictsWith.get(candidate.id);

      // Prune: reject immediately if this section clashes with anything already
      // chosen, instead of building the full combo and discarding it later.
      let blocked = false;
      if (candidateConflicts) {
        for (const picked of chosen) {
          if (candidateConflicts.has(picked.id)) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) continue;

      chosen.push(candidate);
      search(courseIdx + 1);
      chosen.pop();

      if (validSchedules.length >= MAX_COMBINATIONS) return;
    }
  };

  search(0);
  return validSchedules;
}

/**
 * Lists the courses whose section changes between two selection maps.
 * Busy blocks are ignored: they are never a choice. A course that is not
 * selected in `currentMap` but is in `targetMap` counts as a change too, so
 * the result doubles as "what would applying this schedule alter".
 *
 * @param {Record<string,string>} currentMap
 * @param {Record<string,string>} targetMap
 * @param {Array<object>} courses
 * @returns {Array<{courseId:string, courseCode:string, fromSectionId:string|null, fromName:string|null, toSectionId:string, toName:string}>}
 */
export function diffSelections(currentMap, targetMap, courses) {
  const changes = [];
  courses.forEach(course => {
    if (isBusyCourse(course)) return;
    const toId = targetMap[course.id];
    if (!toId) return;
    const fromId = currentMap[course.id] || null;
    if (fromId === toId) return;
    const toSec = course.sections.find(s => s.id === toId);
    const fromSec = fromId ? course.sections.find(s => s.id === fromId) : null;
    if (!toSec) return;
    changes.push({
      courseId: course.id,
      courseCode: course.code,
      fromSectionId: fromSec ? fromSec.id : null,
      fromName: fromSec ? fromSec.name : null,
      toSectionId: toSec.id,
      toName: toSec.name
    });
  });
  return changes;
}

/**
 * Works out the hour window the timetable has to draw so that every slot in
 * `slots` is visible. Never narrower than the default 08:00-20:00 window; a
 * class outside it stretches the grid rather than falling off it.
 *
 * @param {Array<{startTime?:string,endTime?:string,startMins?:number,endMins?:number}>} slots
 * @returns {{startHour:number, endHour:number}}
 */
export function computeHourRange(slots) {
  let startHour = DEFAULT_GRID_START_HOUR;
  let endHour = DEFAULT_GRID_END_HOUR;
  (slots || []).forEach(slot => {
    if (!slot) return;
    const startMins = typeof slot.startMins === "number" ? slot.startMins : timeToMinutes(slot.startTime);
    const endMins = typeof slot.endMins === "number" ? slot.endMins : timeToMinutes(slot.endTime);
    if (!Number.isFinite(startMins) || !Number.isFinite(endMins)) return;
    startHour = Math.min(startHour, Math.floor(startMins / 60));
    endHour = Math.max(endHour, Math.ceil(endMins / 60));
  });
  return {
    startHour: Math.max(0, startHour),
    endHour: Math.min(24, endHour)
  };
}

/** Parses "YYYY-MM-DD" as a local calendar date, or null. */
export function parseLocalDate(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return null;
  // Reject overflowed dates such as 2026-02-31.
  if (date.getMonth() !== Number(m[2]) - 1 || date.getDate() !== Number(m[3])) return null;
  return date;
}

/** Formats a Date as local "YYYY-MM-DD". */
export function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The next Sunday strictly after `from` (local time). */
export function nextSunday(from) {
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  next.setDate(next.getDate() + ((0 + 7 - next.getDay()) % 7 || 7));
  return next;
}

/**
 * Expands holiday ranges into the set of local "YYYY-MM-DD" dates they cover.
 * @param {Array<{start:string,end:string}>} holidays
 * @returns {Set<string>}
 */
export function expandHolidayDates(holidays) {
  const dates = new Set();
  (holidays || []).forEach(h => {
    const start = parseLocalDate(h && h.start);
    const end = parseLocalDate(h && h.end) || start;
    if (!start || !end) return;
    const cursor = new Date(start);
    // Bound the walk so a hostile range cannot loop for years.
    let guard = 0;
    while (cursor <= end && guard < 400) {
      dates.add(formatLocalDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
  });
  return dates;
}

/**
 * Generates an .ics calendar content string for downloading.
 *
 * @param {Array<object>} selectedSections
 * @param {Array<object>} courses
 * @param {{startDate?:string, weeks?:number, holidays?:Array<{start:string,end:string}>}} [term]
 *   Term settings. Without a start date the term begins on the coming Sunday;
 *   without a week count it runs 15 weeks. Holiday dates become EXDATEs.
 */
export function generateICS(selectedSections, courses, term = {}) {
  let icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UniSchedule Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];

  const dayToRule = {
    Mon: "MO",
    Tue: "TU",
    Wed: "WE",
    Thu: "TH",
    Fri: "FR",
    Sat: "SA",
    Sun: "SU"
  };

  const weeks = Number.isInteger(term.weeks) && term.weeks > 0 ? term.weeks : 15;
  const termStart = parseLocalDate(term.startDate) || nextSunday(new Date());
  const holidayDates = expandHolidayDates(term.holidays);
  const termEnd = new Date(termStart);
  termEnd.setDate(termEnd.getDate() + weeks * 7);

  const dayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  const icsIndex = buildCourseIndex(courses);
  const formatICSDate = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  selectedSections.forEach(sec => {
    const course = icsIndex.get(sec.id);
    const busy = isBusyCourse(course);
    const title = course ? (busy ? course.code : `${course.code} - ${sec.name}`) : sec.name;

    sec.times.forEach(t => {
      const targetDay = dayIndex[t.day] || 0;
      // First occurrence: the first date on or after the term start that
      // falls on this weekday.
      const classDate = new Date(termStart);
      classDate.setDate(termStart.getDate() + ((targetDay - termStart.getDay() + 7) % 7));

      const [startH, startM] = t.startTime.split(":").map(Number);
      const [endH, endM] = t.endTime.split(":").map(Number);

      const dtStart = new Date(classDate);
      dtStart.setHours(startH, startM, 0, 0);

      const dtEnd = new Date(classDate);
      dtEnd.setHours(endH, endM, 0, 0);

      icsLines.push("BEGIN:VEVENT");
      // RFC 5545 treats \ ; , and newlines as structural inside property
      // values; unescaped they corrupt the file (a room named "Hall 3, Wing B"
      // was enough) and could forge extra calendar entries.
      icsLines.push(`SUMMARY:${escapeICS(title)}`);
      icsLines.push(`LOCATION:${escapeICS(sec.location || "Campus")}`);
      icsLines.push(`DESCRIPTION:${busy ? "Busy block" : `Instructor: ${escapeICS(sec.instructor || "N/A")}`}`);
      icsLines.push(`DTSTART:${formatICSDate(dtStart)}`);
      icsLines.push(`DTEND:${formatICSDate(dtEnd)}`);
      icsLines.push(`RRULE:FREQ=WEEKLY;BYDAY=${dayToRule[t.day]};COUNT=${weeks}`);

      // Holidays on this weekday inside the term are skipped occurrences.
      holidayDates.forEach(dateStr => {
        const holiday = parseLocalDate(dateStr);
        if (!holiday || holiday.getDay() !== targetDay) return;
        if (holiday < classDate || holiday >= termEnd) return;
        const skipped = new Date(holiday);
        skipped.setHours(startH, startM, 0, 0);
        icsLines.push(`EXDATE:${formatICSDate(skipped)}`);
      });

      icsLines.push("END:VEVENT");
    });
  });

  icsLines.push("END:VCALENDAR");
  return icsLines.join("\r\n");
}
