import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateScheduleMetrics,
  generateAllCombinations,
  getCandidateSections,
  diffSelections,
  computeHourRange,
  countBackToBack,
  parseLocalDate,
  expandHolidayDates,
  generateICS,
  isBusyCourse
} from "../src/utils/scheduler.js";
import {
  DEFAULT_PREFS,
  sanitizePrefs,
  evaluateConstraints,
  longestFreeWindow,
  computeMetricRanges,
  scoreSchedule,
  scoreRank,
  hasHardLimits
} from "../src/utils/prefs.js";
import { intersectIntervals, computeTogetherness, sectionSignature } from "../src/utils/together.js";
import { computeFreeTimeHeatmap } from "../src/utils/heatmap.js";
import {
  sanitizeCourses,
  sanitizePeople,
  sanitizePersonExtras,
  sanitizeTerm,
  LIMITS,
  ME_ID
} from "../src/utils/validate.js";

const slot = (day, startTime, endTime) => ({ day, startTime, endTime });

function course(id, code, sections, extra = {}) {
  return {
    id,
    code,
    title: `${code} Title`,
    color: "#6366f1",
    sections: sections.map((s, i) => ({
      id: `${id}-s${i}`,
      name: s.name || `Sec 0${i + 1}`,
      instructor: s.instructor || "Staff",
      location: s.location || "Rm 1",
      times: s.times
    })),
    ...extra
  };
}

const busy = (id, code, times) =>
  course(id, code, [{ name: "Busy", times }], { kind: "busy" });

// ---------------------------------------------------------------------------
// Busy blocks
// ---------------------------------------------------------------------------

test("busy blocks are kept out of class, campus and gap hours but still returned", () => {
  const courses = [
    course("c1", "CS101", [{ times: [slot("Mon", "09:00", "10:00"), slot("Mon", "13:00", "14:00")] }]),
    busy("b1", "Work", [slot("Mon", "10:30", "12:00"), slot("Tue", "14:00", "18:00")])
  ];
  const selected = [courses[0].sections[0], courses[1].sections[0]];
  const m = calculateScheduleMetrics(selected, courses);

  assert.equal(m.totalClassHours, 2);
  assert.equal(m.totalCampusHours, 5);
  assert.equal(m.totalGapHours, 3, "the work shift inside the gap does not shrink it");
  assert.equal(m.activeDaysCount, 1, "a busy-only day is not a class day");
  assert.equal(m.busySlots.length, 2);
  assert.ok(m.busySlots.every(s => s.isBusy && s.courseCode === "Work"));
  assert.ok(m.activeSlots.every(s => !s.isBusy));
  assert.equal(isBusyCourse(courses[1]), true);
  assert.equal(isBusyCourse(courses[0]), false);
});

test("the optimizer keeps classes away from busy blocks", () => {
  const courses = [
    course("c1", "CS101", [
      { times: [slot("Mon", "09:00", "10:00")] },
      { times: [slot("Tue", "09:00", "10:00")] }
    ]),
    busy("b1", "Gym", [slot("Mon", "09:30", "10:30")])
  ];
  const combos = generateAllCombinations(courses);
  assert.equal(combos.length, 1);
  assert.equal(combos[0].selectionMap.c1, "c1-s1");
  assert.equal(combos[0].selectionMap.b1, "b1-s0", "the busy block is part of every schedule");
});

test("sanitizeCourses keeps the busy kind and trims it to one section", () => {
  const [clean] = sanitizeCourses([{
    id: "b",
    kind: "busy",
    code: "Work",
    sections: [
      { id: "s0", times: [slot("Mon", "09:00", "10:00")] },
      { id: "s1", times: [slot("Tue", "09:00", "10:00")] }
    ]
  }]);
  assert.equal(clean.kind, "busy");
  assert.equal(clean.sections.length, 1);

  const [plain] = sanitizeCourses([{
    id: "c",
    kind: "something-else",
    sections: [{ id: "s0", times: [slot("Mon", "09:00", "10:00")] }]
  }]);
  assert.equal("kind" in plain, false, "unknown kinds are dropped");
});

// ---------------------------------------------------------------------------
// Lock / exclude
// ---------------------------------------------------------------------------

test("locked and excluded sections narrow the candidate list", () => {
  const c = course("c1", "CS101", [
    { times: [slot("Mon", "09:00", "10:00")] },
    { times: [slot("Tue", "09:00", "10:00")] },
    { times: [slot("Wed", "09:00", "10:00")] }
  ]);

  assert.deepEqual(getCandidateSections(c).map(s => s.id), ["c1-s0", "c1-s1", "c1-s2"]);
  assert.deepEqual(getCandidateSections(c, { excluded: new Set(["c1-s1"]) }).map(s => s.id), ["c1-s0", "c1-s2"]);
  assert.deepEqual(getCandidateSections(c, { locked: ["c1-s2"], excluded: ["c1-s2"] }).map(s => s.id), ["c1-s2"],
    "a lock wins over everything");
  assert.deepEqual(getCandidateSections(c, { excluded: ["c1-s0", "c1-s1", "c1-s2"] }), []);
});

test("the search respects locks and skips fully excluded courses", () => {
  const courses = [
    course("c1", "CS101", [
      { times: [slot("Mon", "09:00", "10:00")] },
      { times: [slot("Tue", "09:00", "10:00")] }
    ]),
    course("c2", "MA201", [
      { times: [slot("Wed", "09:00", "10:00")] },
      { times: [slot("Thu", "09:00", "10:00")] }
    ])
  ];

  assert.equal(generateAllCombinations(courses).length, 4);

  const locked = generateAllCombinations(courses, undefined, { locked: ["c1-s1"] });
  assert.equal(locked.length, 2);
  assert.ok(locked.every(c => c.selectionMap.c1 === "c1-s1"));

  const excluded = generateAllCombinations(courses, undefined, { excluded: ["c2-s0"] });
  assert.equal(excluded.length, 2);
  assert.ok(excluded.every(c => c.selectionMap.c2 === "c2-s1"));

  const allGone = generateAllCombinations(courses, undefined, { excluded: ["c2-s0", "c2-s1"] });
  assert.equal(allGone.length, 2, "a course with nothing left to pick is skipped, not fatal");
  assert.ok(allGone.every(c => !("c2" in c.selectionMap)));
});

test("sanitizePersonExtras keeps one lock per course and never an excluded lock", () => {
  const courses = sanitizeCourses([
    course("c1", "CS101", [
      { times: [slot("Mon", "09:00", "10:00")] },
      { times: [slot("Tue", "09:00", "10:00")] }
    ])
  ]);
  const extras = sanitizePersonExtras({
    locked: ["c1-s0", "c1-s1", "ghost", 42],
    excluded: ["c1-s0", "c1-s0", "nope"],
    prefs: { earliestStart: "10:00", weights: { gaps: 99 } },
    plans: [
      { id: "p1", name: "  Plan A ", selections: { c1: "c1-s1", zz: "c1-s0" }, savedAt: 5 },
      { id: "p1", name: "dupe" },
      { name: "no id" }
    ]
  }, courses);

  assert.deepEqual(extras.excluded, ["c1-s0"]);
  assert.deepEqual(extras.locked, ["c1-s1"], "s0 is excluded so it cannot be the lock; s1 wins");
  assert.equal(extras.prefs.earliestStart, "10:00");
  assert.equal(extras.prefs.weights.gaps, 3, "weights are clamped");
  assert.equal(extras.plans.length, 1);
  assert.equal(extras.plans[0].name, "Plan A");
  assert.deepEqual({ ...extras.plans[0].selections }, { c1: "c1-s1" });
});

// ---------------------------------------------------------------------------
// Diff / backups
// ---------------------------------------------------------------------------

test("diffSelections lists only the courses whose section changes", () => {
  const courses = [
    course("c1", "CS101", [{ times: [slot("Mon", "09:00", "10:00")] }, { times: [slot("Tue", "09:00", "10:00")] }]),
    course("c2", "MA201", [{ times: [slot("Wed", "09:00", "10:00")] }]),
    busy("b1", "Work", [slot("Fri", "09:00", "10:00")])
  ];
  const changes = diffSelections(
    { c1: "c1-s0", b1: "b1-s0" },
    { c1: "c1-s1", c2: "c2-s0", b1: "b1-s0" },
    courses
  );
  assert.deepEqual(changes.map(c => [c.courseCode, c.fromName, c.toName]), [
    ["CS101", "Sec 01", "Sec 02"],
    ["MA201", null, "Sec 01"]
  ]);
  assert.equal(diffSelections({ c1: "c1-s0" }, { c1: "c1-s0" }, courses).length, 0);
});

// ---------------------------------------------------------------------------
// Grid range
// ---------------------------------------------------------------------------

test("computeHourRange never shrinks the default window and grows to fit", () => {
  assert.deepEqual(computeHourRange([]), { startHour: 8, endHour: 20 });
  assert.deepEqual(computeHourRange([slot("Mon", "10:00", "11:00")]), { startHour: 8, endHour: 20 });
  assert.deepEqual(computeHourRange([slot("Mon", "07:30", "08:30"), { startMins: 20 * 60 + 15, endMins: 21 * 60 + 45 }]),
    { startHour: 7, endHour: 22 });
});

test("countBackToBack counts tight transitions per day", () => {
  const slots = [
    { day: "Mon", startMins: 540, endMins: 600 },
    { day: "Mon", startMins: 605, endMins: 660 },   // 5 min later: back-to-back
    { day: "Mon", startMins: 720, endMins: 780 },   // an hour later: not
    { day: "Tue", startMins: 540, endMins: 600 },
    { day: "Tue", startMins: 600, endMins: 660 }    // 0 min later: back-to-back
  ];
  assert.equal(countBackToBack(slots), 2);
});

// ---------------------------------------------------------------------------
// Preferences & scoring
// ---------------------------------------------------------------------------

test("sanitizePrefs repairs anything odd", () => {
  const p = sanitizePrefs({
    earliestStart: "9am",
    latestEnd: "16:00",
    daysOff: ["Fri", "Funday", "Fri"],
    lunchMinutes: "45",
    lunchStart: "14:00",
    lunchEnd: "12:00",
    maxCampusHoursPerDay: -3,
    weights: { gaps: "2", daysOff: 7, mornings: null }
  });
  assert.equal(p.earliestStart, "");
  assert.equal(p.latestEnd, "16:00");
  assert.deepEqual(p.daysOff, ["Fri"]);
  assert.equal(p.lunchMinutes, 45);
  assert.equal(p.lunchStart, DEFAULT_PREFS.lunchStart, "an inverted lunch window resets");
  assert.equal(p.maxCampusHoursPerDay, 0);
  assert.equal(p.weights.gaps, 2);
  assert.equal(p.weights.daysOff, 3);
  assert.equal(p.weights.mornings, DEFAULT_PREFS.weights.mornings);
  assert.deepEqual(sanitizePrefs(null).weights, { ...DEFAULT_PREFS.weights });
  assert.equal(hasHardLimits(sanitizePrefs(null)), false);
  assert.equal(hasHardLimits(p), true);
});

test("hard limits flag the right violations", () => {
  const courses = [
    course("c1", "CS101", [{ times: [slot("Mon", "08:00", "09:00"), slot("Mon", "12:00", "13:30"), slot("Fri", "16:00", "18:00")] }]),
    busy("b1", "Prayer", [slot("Mon", "13:30", "14:00")])
  ];
  const m = calculateScheduleMetrics([courses[0].sections[0], courses[1].sections[0]], courses);

  assert.equal(evaluateConstraints(m, sanitizePrefs(null)).ok, true);

  const res = evaluateConstraints(m, sanitizePrefs({
    earliestStart: "09:00",
    latestEnd: "17:00",
    daysOff: ["Fri"],
    lunchMinutes: 60,
    lunchStart: "11:30",
    lunchEnd: "14:00",
    maxCampusHoursPerDay: 4
  }));
  assert.equal(res.ok, false);
  assert.deepEqual(res.violations.map(v => v.code).sort(), ["campus", "daysOff", "earliest", "latest", "lunch"]);

  // Mon 11:30-14:00: class 12:00-13:30 then prayer 13:30-14:00 => longest
  // free stretch is 11:30-12:00 = 30 min. Busy blocks count as occupied.
  assert.equal(longestFreeWindow(m, "Mon", "11:30", "14:00"), 30);
  // A day whose classes end before the window is entirely free.
  assert.equal(longestFreeWindow(m, "Fri", "11:30", "14:00"), 150);
});

test("scores are relative to the best and worst valid schedule", () => {
  const courses = [
    course("c1", "CS101", [
      { times: [slot("Mon", "09:00", "10:00")] },
      { times: [slot("Mon", "14:00", "15:00")] }
    ]),
    course("c2", "MA201", [
      // 15 minutes after CS101 Sec 01 ends: a short gap, not back-to-back.
      { times: [slot("Mon", "10:15", "11:15")] }
    ])
  ];
  const combos = generateAllCombinations(courses);
  assert.equal(combos.length, 2);
  const ranges = computeMetricRanges(combos.map(c => c.metrics));
  assert.deepEqual(ranges.gaps, { min: 0.3, max: 2.8 });

  const scores = combos.map(c => scoreSchedule(c.metrics, ranges, DEFAULT_PREFS.weights));
  const tight = combos.findIndex(c => c.metrics.totalGapHours === 0.3);
  assert.equal(scores[tight], 100, "fewest gaps, same days, no early class, nothing back-to-back => best on every axis");
  assert.equal(scores[1 - tight] < 100, true);

  assert.equal(scoreSchedule(combos[0].metrics, ranges, { gaps: 0, daysOff: 0, mornings: 0, backToBack: 0, campus: 0 }), 100,
    "no weights means nothing to penalise");
  assert.equal(scoreRank(97), "S");
  assert.equal(scoreRank(72), "B");
  assert.equal(scoreRank(10), "D");
  assert.deepEqual(computeMetricRanges([]).gaps, { min: 0, max: 0 });
});

// ---------------------------------------------------------------------------
// Togetherness
// ---------------------------------------------------------------------------

test("intersectIntervals finds the overlaps of two lists", () => {
  const a = [{ startMins: 600, endMins: 720 }, { startMins: 800, endMins: 900 }];
  const b = [{ startMins: 660, endMins: 830 }];
  assert.deepEqual(intersectIntervals(a, b), [
    { startMins: 660, endMins: 720, durationMins: 60 },
    { startMins: 800, endMins: 830, durationMins: 30 }
  ]);
  assert.deepEqual(intersectIntervals([], b), []);
  assert.deepEqual(intersectIntervals([{ startMins: 0, endMins: 10 }], [{ startMins: 10, endMins: 20 }]), []);
});

test("togetherness counts shared sections and overlapping breaks", () => {
  const cs = course("c1", "CS101", [{ times: [slot("Mon", "09:00", "10:30")] }]);
  const ma = course("c2", "MA201", [{ times: [slot("Mon", "13:00", "14:00")] }]);
  const ph = course("c3", "PH101", [{ times: [slot("Mon", "12:30", "13:30")] }]);

  const me = { courses: [cs, ma], sections: [cs.sections[0], ma.sections[0]] };
  me.metrics = calculateScheduleMetrics(me.sections, me.courses);

  // The friend typed CS101 in separately: different ids, same code and times.
  const friendCs = course("x1", "CS 101", [{ times: [slot("Mon", "09:00", "10:30")] }]);
  const friend = { courses: [friendCs, ph], sections: [friendCs.sections[0], ph.sections[0]] };
  friend.metrics = calculateScheduleMetrics(friend.sections, friend.courses);

  assert.equal(sectionSignature(cs, cs.sections[0]), sectionSignature(friendCs, friendCs.sections[0]));

  const t = computeTogetherness(me, friend);
  assert.equal(t.sameClassHours, 1.5);
  assert.deepEqual(t.sameSections.map(s => s.courseCode), ["CS101"]);
  // My gap 10:30-13:00, theirs 10:30-12:30 => 2h together.
  assert.equal(t.sharedBreakHours, 2);
  assert.deepEqual(t.sharedBreaks.Mon.map(b => [b.start, b.end]), [["10:30", "12:30"]]);
  assert.equal(t.sharedDaysOff, 6);
  assert.equal(t.togetherHours, 3.5);
});

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

test("free-time heatmap reports how often each slot is free", () => {
  const courses = [
    course("c1", "CS101", [
      { times: [slot("Mon", "09:00", "10:00")] },
      { times: [slot("Mon", "10:00", "11:00")] }
    ])
  ];
  const combos = generateAllCombinations(courses);
  const h = computeFreeTimeHeatmap(combos, { startHour: 8, endHour: 12, stepMinutes: 30 });

  assert.equal(h.total, 2);
  assert.equal(h.rows, 8);
  assert.equal(h.labels[0], "08:00");
  // 09:00-10:00 is taken in one of two schedules, so free half the time.
  assert.equal(h.cells.Mon[2], 0.5);
  assert.equal(h.cells.Mon[3], 0.5);
  assert.equal(h.cells.Mon[4], 0.5);
  assert.equal(h.cells.Mon[0], 1, "08:00 is always free");
  assert.equal(h.cells.Tue[2], 1);
  assert.equal(computeFreeTimeHeatmap([]).total, 0);
});

// ---------------------------------------------------------------------------
// People & term validation
// ---------------------------------------------------------------------------

test("sanitizePeople always puts a valid 'me' first", () => {
  assert.deepEqual(sanitizePeople(null), [{ id: ME_ID, name: "Me", color: "#6366f1" }]);

  const people = sanitizePeople([
    { id: "p-1", name: "  Sara  ", color: "red;url()" },
    { id: "me", name: "", color: "#ec4899" },
    { id: "p-1", name: "dupe" },
    { id: "bad id!", name: "x" },
    { id: "p-2", name: "A".repeat(80) }
  ]);
  assert.equal(people[0].id, ME_ID);
  assert.equal(people[0].name, "Me");
  assert.equal(people[0].color, "#ec4899");
  assert.deepEqual(people.map(p => p.id), ["me", "p-1", "p-2"]);
  assert.equal(people[1].name, "Sara");
  assert.equal(people[1].color, "#6366f1");
  assert.equal(people[2].name.length, LIMITS.MAX_NAME_LENGTH);

  const many = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  assert.equal(sanitizePeople(many).length, LIMITS.MAX_PEOPLE);
});

test("sanitizeTerm validates dates, weeks and holiday ranges", () => {
  assert.deepEqual(sanitizeTerm(undefined), { startDate: "", weeks: 15, holidays: [] });
  const t = sanitizeTerm({
    startDate: "2026-02-31",
    weeks: 99,
    holidays: [
      { start: "2026-03-10", end: "2026-03-08", label: "Backwards" },
      { start: "2026-04-01", end: "2026-04-03" },
      { start: "nope" }
    ]
  });
  assert.equal(t.startDate, "", "an impossible date is rejected");
  assert.equal(t.weeks, 15);
  assert.deepEqual(t.holidays, [
    { start: "2026-03-10", end: "2026-03-10", label: "Backwards" },
    { start: "2026-04-01", end: "2026-04-03", label: "Holiday" }
  ]);
  assert.equal(sanitizeTerm({ startDate: "2026-09-06", weeks: 12 }).weeks, 12);
});

test("parseLocalDate and expandHolidayDates work in local time", () => {
  const d = parseLocalDate("2026-03-15");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 2);
  assert.equal(d.getDate(), 15);
  assert.equal(parseLocalDate("2026-13-01"), null);
  assert.equal(parseLocalDate("garbage"), null);

  const dates = expandHolidayDates([{ start: "2026-03-30", end: "2026-04-02" }]);
  assert.deepEqual([...dates], ["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02"]);
});

test("ICS export honours the term start, length and holidays", () => {
  const courses = [
    course("c1", "CS101", [{ times: [slot("Wed", "09:00", "10:00")] }])
  ];
  // 2026-09-06 is a Sunday; the first Wednesday on or after it is 2026-09-09.
  const ics = generateICS([courses[0].sections[0]], courses, {
    startDate: "2026-09-06",
    weeks: 12,
    holidays: [
      { start: "2026-09-23", end: "2026-09-23" },   // a Wednesday: skipped
      { start: "2026-09-24", end: "2026-09-24" },   // a Thursday: irrelevant
      { start: "2027-01-06", end: "2027-01-06" }    // a Wednesday after the term: ignored
    ]
  });

  assert.ok(ics.includes("RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=12"));
  const dtstart = ics.match(/DTSTART:(\d{8})T/)[1];
  assert.equal(dtstart, new Date(2026, 8, 9, 9, 0).toISOString().slice(0, 10).replace(/-/g, ""));
  const exdates = ics.match(/EXDATE:[^\r\n]+/g) || [];
  assert.equal(exdates.length, 1);
  assert.ok(exdates[0].includes(new Date(2026, 8, 23, 9, 0).toISOString().slice(0, 10).replace(/-/g, "")));
});

test("ICS export without term settings still defaults to 15 weeks", () => {
  const courses = [course("c1", "CS101", [{ times: [slot("Mon", "09:00", "10:00")] }])];
  const ics = generateICS([courses[0].sections[0]], courses);
  assert.ok(ics.includes("COUNT=15"));
  assert.ok(!ics.includes("EXDATE"));
});
