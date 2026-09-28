/**
 * "Together" maths for friends' schedules: which classes two people share and
 * when their on-campus breaks line up.
 */

import { DAYS, minutesToTime, timeToMinutes, isBusyCourse, buildCourseIndex } from "./scheduler.js";

/**
 * Overlaps between two interval lists ({startMins, endMins}), in any order.
 * @returns {Array<{startMins:number,endMins:number,durationMins:number}>}
 */
export function intersectIntervals(a, b) {
  const as = [...(a || [])].sort((x, y) => x.startMins - y.startMins);
  const bs = [...(b || [])].sort((x, y) => x.startMins - y.startMins);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < as.length && j < bs.length) {
    const start = Math.max(as[i].startMins, bs[j].startMins);
    const end = Math.min(as[i].endMins, bs[j].endMins);
    if (start < end) out.push({ startMins: start, endMins: end, durationMins: end - start });
    if (as[i].endMins < bs[j].endMins) i++;
    else j++;
  }
  return out;
}

export function normalizeCourseCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Identifies "the same section" across two people's course lists even when
 * the ids differ (a friend who typed the course in separately): same course
 * code and the exact same meeting times.
 */
export function sectionSignature(course, section) {
  const times = (section.times || [])
    .map(t => `${t.day}${t.startTime}-${t.endTime}`)
    .sort()
    .join("|");
  return `${normalizeCourseCode(course.code)}#${times}`;
}

export function sectionMinutes(section) {
  return (section.times || []).reduce(
    (sum, t) => sum + (timeToMinutes(t.endTime) - timeToMinutes(t.startTime)),
    0
  );
}

const round1 = (mins) => Number((mins / 60).toFixed(1));

/**
 * Compares two people's current schedules.
 *
 * @param {{sections: Array, courses: Array, metrics: object}} mine
 * @param {{sections: Array, courses: Array, metrics: object}} theirs
 */
export function computeTogetherness(mine, theirs) {
  const myIndex = buildCourseIndex(mine.courses);
  const theirIndex = buildCourseIndex(theirs.courses);

  const theirById = new Map();
  const theirBySignature = new Map();
  theirs.sections.forEach(sec => {
    const course = theirIndex.get(sec.id);
    if (!course || isBusyCourse(course)) return;
    theirById.set(sec.id, sec);
    theirBySignature.set(sectionSignature(course, sec), sec);
  });

  let sameClassMinutes = 0;
  const sameSections = [];
  mine.sections.forEach(sec => {
    const course = myIndex.get(sec.id);
    if (!course || isBusyCourse(course)) return;
    const match = theirById.get(sec.id) || theirBySignature.get(sectionSignature(course, sec));
    if (match) {
      sameSections.push({
        sectionId: sec.id,
        theirSectionId: match.id,
        courseCode: course.code,
        sectionName: sec.name
      });
      sameClassMinutes += sectionMinutes(sec);
    }
  });

  const sharedBreaks = {};
  let sharedBreakMinutes = 0;
  let sharedDaysOff = 0;

  DAYS.forEach(day => {
    const a = mine.metrics.dailyBreakdown[day];
    const b = theirs.metrics.dailyBreakdown[day];
    if (!a || !b) return;
    if (!a.hasClasses && !b.hasClasses) sharedDaysOff++;

    const overlaps = intersectIntervals(a.gapIntervals, b.gapIntervals);
    if (overlaps.length > 0) {
      sharedBreaks[day] = overlaps.map(o => ({
        ...o,
        start: minutesToTime(o.startMins),
        end: minutesToTime(o.endMins)
      }));
      sharedBreakMinutes += overlaps.reduce((sum, o) => sum + o.durationMins, 0);
    }
  });

  return {
    sameClassHours: round1(sameClassMinutes),
    sharedBreakHours: round1(sharedBreakMinutes),
    sharedDaysOff,
    sameSections,
    sharedBreaks,
    // One number for sorting: an hour in the same room and an hour of shared
    // break both count as an hour together.
    togetherHours: round1(sameClassMinutes + sharedBreakMinutes)
  };
}

/**
 * Merges several friends' shared-break lists for one day into labelled
 * segments: each segment says exactly who is free with you during it, so two
 * friends with overlapping breaks produce "Sara & Ali" rather than two bands
 * drawn on top of each other.
 *
 * @param {Array<{startMins:number,endMins:number}>} myGaps
 * @param {Array<{name:string, gaps:Array<{startMins:number,endMins:number}>}>} friends
 * @returns {Array<{startMins:number,endMins:number,durationMins:number,names:string[]}>}
 */
export function mergeSharedBreaks(myGaps, friends) {
  const events = [];
  (friends || []).forEach(friend => {
    intersectIntervals(myGaps, friend.gaps).forEach(o => {
      events.push({ startMins: o.startMins, endMins: o.endMins, name: friend.name });
    });
  });
  if (events.length === 0) return [];

  const points = [...new Set(events.flatMap(e => [e.startMins, e.endMins]))].sort((a, b) => a - b);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const names = [];
    events.forEach(e => {
      if (e.startMins <= start && e.endMins >= end && !names.includes(e.name)) names.push(e.name);
    });
    if (names.length === 0) continue;
    const key = names.join("\u0000");
    const last = segments[segments.length - 1];
    if (last && last.endMins === start && last.key === key) {
      last.endMins = end;
      last.durationMins = last.endMins - last.startMins;
    } else {
      segments.push({ startMins: start, endMins: end, durationMins: end - start, names, key });
    }
  }
  return segments.map(({ key, ...rest }) => rest);
}
