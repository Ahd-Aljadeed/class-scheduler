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
            conflictingCourseCode: course.code,
            conflictingSecName: selectedSec.name,
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
 * Calculates gap hours and campus stay metrics for selected sections
 * @param {Array<object>} selectedSections
 * @param {Array<object>} courses
 * @param {Map<string, object>} [courseIndex] - optional prebuilt sectionId -> course map
 */
export function calculateScheduleMetrics(selectedSections, courses, courseIndex) {
  const index = courseIndex || buildCourseIndex(courses);

  // Collect all slots from selected sections with course meta
  const activeSlots = [];

  selectedSections.forEach(sec => {
    const course = index.get(sec.id);
    sec.times.forEach(t => {
      activeSlots.push({
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
        location: sec.location
      });
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

  const earlyClasses = activeSlots.filter(s => s.startMins < 540); // before 9:00 AM
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
    dailyBreakdown,
    activeSlots,
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
 * Generate valid non-conflicting combinations (1 section per course).
 *
 * Implemented as depth-first backtracking that prunes a branch as soon as the
 * section being added conflicts with one already chosen. The previous
 * implementation materialised the entire cartesian product (O(sections^courses)
 * arrays) before filtering, which cost ~1.1s and ~350MB at 8 courses x 4
 * sections and ran out of memory beyond that.
 *
 * @param {Array<object>} courses
 * @param {Map<string, object>} [courseIndex] - optional prebuilt sectionId -> course map
 * @returns {{sections: Array, selectionMap: object, metrics: object}[]}
 */
export function generateAllCombinations(courses, courseIndex) {
  // Only include courses that have at least 1 section
  const validCourses = courses.filter(c => c.sections && c.sections.length > 0);
  if (validCourses.length === 0) return [];

  const index = courseIndex || buildCourseIndex(validCourses);

  // Precompute a conflict matrix between sections of different courses, so the
  // inner test during search is an O(1) set lookup instead of re-parsing time
  // strings for every pair on every branch.
  const conflictsWith = new Map();
  for (let i = 0; i < validCourses.length; i++) {
    for (let j = i + 1; j < validCourses.length; j++) {
      for (const secA of validCourses[i].sections) {
        for (const secB of validCourses[j].sections) {
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

    for (const candidate of validCourses[courseIdx].sections) {
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
 * Generates an .ics calendar content string for downloading
 */
export function generateICS(selectedSections, courses) {
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

  // Assume current semester start date is next Sunday
  const today = new Date();
  const nextSun = new Date(today);
  nextSun.setDate(today.getDate() + ((0 + 7 - today.getDay()) % 7 || 7));

  const dayOffsets = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  const icsIndex = buildCourseIndex(courses);

  selectedSections.forEach(sec => {
    const course = icsIndex.get(sec.id);
    const title = course ? `${course.code} - ${sec.name}` : sec.name;

    sec.times.forEach(t => {
      const offset = dayOffsets[t.day] || 0;
      const classDate = new Date(nextSun);
      classDate.setDate(nextSun.getDate() + offset);

      const [startH, startM] = t.startTime.split(":").map(Number);
      const [endH, endM] = t.endTime.split(":").map(Number);

      const dtStart = new Date(classDate);
      dtStart.setHours(startH, startM, 0);

      const dtEnd = new Date(classDate);
      dtEnd.setHours(endH, endM, 0);

      const formatICSDate = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

      icsLines.push("BEGIN:VEVENT");
      // RFC 5545 treats \ ; , and newlines as structural inside property
      // values; unescaped they corrupt the file (a room named "Hall 3, Wing B"
      // was enough) and could forge extra calendar entries.
      icsLines.push(`SUMMARY:${escapeICS(title)}`);
      icsLines.push(`LOCATION:${escapeICS(sec.location || "Campus")}`);
      icsLines.push(`DESCRIPTION:Instructor: ${escapeICS(sec.instructor || "N/A")}`);
      icsLines.push(`DTSTART:${formatICSDate(dtStart)}`);
      icsLines.push(`DTEND:${formatICSDate(dtEnd)}`);
      icsLines.push(`RRULE:FREQ=WEEKLY;BYDAY=${dayToRule[t.day]};COUNT=15`);
      icsLines.push("END:VEVENT");
    });
  });

  icsLines.push("END:VCALENDAR");
  return icsLines.join("\r\n");
}
