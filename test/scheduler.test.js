import test from "node:test";
import assert from "node:assert/strict";

import {
  timeToMinutes,
  minutesToTime,
  format12h,
  doSlotsOverlap,
  doSectionsConflict,
  calculateScheduleMetrics,
  generateAllCombinations,
  generateICS,
  MAX_COMBINATIONS
} from "../src/utils/scheduler.js";

/**
 * Builds a synthetic course list.
 * With `disjoint`, every section of every course occupies its own hour, so
 * nothing conflicts and the valid-combination count is maximal — the worst
 * case for the search.
 */
function makeCourses(numCourses, sectionsEach, { disjoint = true } = {}) {
  return Array.from({ length: numCourses }, (_, c) => ({
    id: `c${c}`,
    code: `CS${100 + c}`,
    title: `Course ${c}`,
    color: "#6366f1",
    sections: Array.from({ length: sectionsEach }, (_, s) => {
      const hour = disjoint ? 8 + ((c * sectionsEach + s) % 12) : 9;
      const hh = String(hour).padStart(2, "0");
      return {
        id: `c${c}s${s}`,
        name: `Sec 0${s + 1}`,
        instructor: "Staff",
        location: "Rm 1",
        times: [{ day: "Mon", startTime: `${hh}:00`, endTime: `${hh}:50` }]
      };
    })
  }));
}

const slot = (day, startTime, endTime) => ({ day, startTime, endTime });

test("time conversion round-trips", () => {
  assert.equal(timeToMinutes("09:30"), 570);
  assert.equal(timeToMinutes("00:00"), 0);
  assert.equal(minutesToTime(570), "09:30");
  assert.equal(minutesToTime(0), "00:00");
  assert.equal(timeToMinutes(""), 0);
});

test("format12h converts to 12-hour clock", () => {
  assert.equal(format12h("00:00"), "12:00 AM");
  assert.equal(format12h("09:05"), "9:05 AM");
  assert.equal(format12h("12:00"), "12:00 PM");
  assert.equal(format12h("13:30"), "1:30 PM");
  assert.equal(format12h("23:59"), "11:59 PM");
});

test("overlap detection treats back-to-back classes as non-conflicting", () => {
  // One ends exactly when the next begins — that is a valid schedule,
  // not a clash.
  assert.equal(doSlotsOverlap(slot("Mon", "09:00", "10:00"), slot("Mon", "10:00", "11:00")), false);
  assert.equal(doSlotsOverlap(slot("Mon", "09:00", "10:00"), slot("Mon", "09:59", "11:00")), true);
  assert.equal(doSlotsOverlap(slot("Mon", "09:00", "10:00"), slot("Tue", "09:00", "10:00")), false);
  // A fully-contained class still conflicts.
  assert.equal(doSlotsOverlap(slot("Mon", "09:00", "12:00"), slot("Mon", "10:00", "11:00")), true);
});

test("sections conflict when any of their slots overlap", () => {
  const a = { id: "a", times: [slot("Mon", "09:00", "10:00"), slot("Wed", "09:00", "10:00")] };
  const b = { id: "b", times: [slot("Tue", "09:00", "10:00"), slot("Wed", "09:30", "10:30")] };
  const c = { id: "c", times: [slot("Fri", "09:00", "10:00")] };

  assert.equal(doSectionsConflict(a, b), true, "clash on Wed");
  assert.equal(doSectionsConflict(a, c), false);
  assert.equal(doSectionsConflict(a, a), false, "a section never conflicts with itself");
  assert.equal(doSectionsConflict(a, null), false);
});

test("metrics separate class time from campus time and gaps", () => {
  const courses = [{
    id: "c0",
    code: "CS101",
    title: "T",
    color: "#6366f1",
    sections: [{
      id: "s0",
      name: "Sec 01",
      instructor: "Staff",
      location: "Rm",
      // 09:00-10:00 and 13:00-14:00 on Monday: 2h of class, 5h on campus,
      // 3h of gap in between.
      times: [slot("Mon", "09:00", "10:00"), slot("Mon", "13:00", "14:00")]
    }]
  }];

  const m = calculateScheduleMetrics([courses[0].sections[0]], courses);

  assert.equal(m.totalClassHours, 2);
  assert.equal(m.totalCampusHours, 5);
  assert.equal(m.totalGapHours, 3);
  assert.equal(m.activeDaysCount, 1);
  assert.equal(m.daysOffCount, 6);

  const mon = m.dailyBreakdown.Mon;
  assert.equal(mon.hasClasses, true);
  assert.equal(mon.firstStart, "09:00");
  assert.equal(mon.lastEnd, "14:00");
  assert.deepEqual(mon.gapIntervals.map(g => [g.start, g.end]), [["10:00", "13:00"]]);
  assert.equal(m.dailyBreakdown.Fri.hasClasses, false);
});

test("metrics handle an empty selection", () => {
  const m = calculateScheduleMetrics([], []);
  assert.equal(m.totalClassHours, 0);
  assert.equal(m.totalGapHours, 0);
  assert.equal(m.activeDaysCount, 0);
  assert.equal(m.daysOffCount, 7);
});

test("combination search finds every schedule when nothing conflicts", () => {
  const combos = generateAllCombinations(makeCourses(3, 3));
  assert.equal(combos.length, 27, "3 courses x 3 sections, all disjoint");
  assert.ok(combos.every(c => c.sections.length === 3), "one section per course");
  assert.ok(combos.every(c => Object.keys(c.selectionMap).length === 3));
  assert.ok(combos.every(c => typeof c.metrics.totalGapHours === "number"));
});

test("combination search returns nothing when every section collides", () => {
  assert.equal(generateAllCombinations(makeCourses(3, 2, { disjoint: false })).length, 0);
});

test("combination search handles trivial inputs", () => {
  assert.equal(generateAllCombinations([]).length, 0);
  assert.equal(generateAllCombinations(makeCourses(1, 4)).length, 4);
  // Courses with no sections are skipped rather than zeroing the product.
  const mixed = makeCourses(2, 2);
  mixed.push({ id: "empty", code: "X", title: "X", color: "#6366f1", sections: [] });
  assert.equal(generateAllCombinations(mixed).length, 4);
});

test("combination search stays bounded on inputs that used to hang it", () => {
  // 10 courses x 4 sections is 1,048,576 raw products. The previous
  // implementation materialised all of them and ran out of memory.
  const started = Date.now();
  const combos = generateAllCombinations(makeCourses(10, 4));
  const elapsed = Date.now() - started;

  assert.ok(combos.length <= MAX_COMBINATIONS, `collected ${combos.length}`);
  assert.ok(elapsed < 2000, `took ${elapsed}ms`);
});

test("ICS export escapes RFC 5545 special characters", () => {
  const courses = [{
    id: "c0",
    code: "CS101",
    title: "T",
    color: "#6366f1",
    sections: [{
      id: "s0",
      name: "Sec 01",
      instructor: "Dr. A",
      location: "Hall 3, Wing B; Floor 2",
      times: [slot("Mon", "09:00", "10:30")]
    }]
  }];

  const ics = generateICS([courses[0].sections[0]], courses);

  assert.ok(ics.startsWith("BEGIN:VCALENDAR"));
  assert.ok(ics.trim().endsWith("END:VCALENDAR"));
  assert.ok(ics.includes("LOCATION:Hall 3\\, Wing B\\; Floor 2"), "comma and semicolon escaped");
  assert.ok(ics.includes("RRULE:FREQ=WEEKLY;BYDAY=MO"));
  assert.ok(ics.includes("\r\n"), "iCalendar requires CRLF line endings");
});
