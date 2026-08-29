export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const FULL_DAYS = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday"
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
 * Calculates gap hours and campus stay metrics for selected sections
 */
export function calculateScheduleMetrics(selectedSections, courses) {
  // Collect all slots from selected sections with course meta
  const activeSlots = [];
  
  selectedSections.forEach(sec => {
    const course = courses.find(c => c.sections.some(s => s.id === sec.id));
    sec.times.forEach(t => {
      activeSlots.push({
        ...t,
        startMins: timeToMinutes(t.startTime),
        endMins: timeToMinutes(t.endTime),
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

  DAYS.forEach(day => {
    const daySlots = activeSlots
      .filter(s => s.day === day)
      .sort((a, b) => a.startMins - b.startMins);

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
    const lastEndMins = Math.max(...daySlots.map(s => s.endMins));

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
    badges.push({ text: "No Friday Classes 🎉", type: "success" });
  }
  if (daysOffCount >= 3) {
    badges.push({ text: `${daysOffCount}-Day Weekend 🏖️`, type: "success" });
  }
  if (totalGapHours === 0 && activeDaysCount > 0) {
    badges.push({ text: "Zero Gap Hours! ⚡", type: "primary" });
  } else if (totalGapHours > 8) {
    badges.push({ text: "High Gap Hours ⚠️", type: "warning" });
  }

  const earlyClasses = activeSlots.filter(s => s.startMins < 540); // before 9:00 AM
  if (earlyClasses.length === 0 && activeDaysCount > 0) {
    badges.push({ text: "No Early Mornings ☕", type: "info" });
  } else if (earlyClasses.length > 0) {
    badges.push({ text: `${earlyClasses.length} Early Class(es) ⏰`, type: "default" });
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
 * Generate all valid non-conflicting combinations (1 section per course)
 */
export function generateAllCombinations(courses) {
  // Only include courses that have at least 1 section
  const validCourses = courses.filter(c => c.sections && c.sections.length > 0);
  if (validCourses.length === 0) return [];

  const cartesian = (args) => {
    const r = [];
    const max = args.length - 1;
    function helper(arr, i) {
      for (let j = 0, l = args[i].length; j < l; j++) {
        const a = arr.slice(0); // clone arr
        a.push(args[i][j]);
        if (i === max) r.push(a);
        else helper(a, i + 1);
      }
    }
    helper([], 0);
    return r;
  };

  const sectionSets = validCourses.map(c => c.sections);
  const rawCombinations = cartesian(sectionSets);

  const validSchedules = [];

  rawCombinations.forEach(combo => {
    // Check for internal conflicts
    let hasConflict = false;
    for (let i = 0; i < combo.length; i++) {
      for (let j = i + 1; j < combo.length; j++) {
        if (doSectionsConflict(combo[i], combo[j])) {
          hasConflict = true;
          break;
        }
      }
      if (hasConflict) break;
    }

    if (!hasConflict) {
      const metrics = calculateScheduleMetrics(combo, validCourses);
      
      // Build selectedSectionsMap for easy application
      const selectionMap = {};
      combo.forEach((sec) => {
        const parentCourse = validCourses.find(c => c.sections.some(s => s.id === sec.id));
        if (parentCourse) {
          selectionMap[parentCourse.id] = sec.id;
        }
      });

      validSchedules.push({
        sections: combo,
        selectionMap,
        metrics
      });
    }
  });

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

  // Assume current semester start date is next Monday
  const today = new Date();
  const nextMon = new Date(today);
  nextMon.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));

  const dayOffsets = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

  selectedSections.forEach(sec => {
    const course = courses.find(c => c.sections.some(s => s.id === sec.id));
    const title = course ? `${course.code} - ${sec.name}` : sec.name;

    sec.times.forEach(t => {
      const offset = dayOffsets[t.day] || 0;
      const classDate = new Date(nextMon);
      classDate.setDate(nextMon.getDate() + offset);

      const [startH, startM] = t.startTime.split(":").map(Number);
      const [endH, endM] = t.endTime.split(":").map(Number);

      const dtStart = new Date(classDate);
      dtStart.setHours(startH, startM, 0);

      const dtEnd = new Date(classDate);
      dtEnd.setHours(endH, endM, 0);

      const formatICSDate = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

      icsLines.push("BEGIN:VEVENT");
      icsLines.push(`SUMMARY:${title}`);
      icsLines.push(`LOCATION:${sec.location || "Campus"}`);
      icsLines.push(`DESCRIPTION:Instructor: ${sec.instructor || "N/A"}`);
      icsLines.push(`DTSTART:${formatICSDate(dtStart)}`);
      icsLines.push(`DTEND:${formatICSDate(dtEnd)}`);
      icsLines.push(`RRULE:FREQ=WEEKLY;BYDAY=${dayToRule[t.day]};COUNT=15`);
      icsLines.push("END:VEVENT");
    });
  });

  icsLines.push("END:VCALENDAR");
  return icsLines.join("\r\n");
}
