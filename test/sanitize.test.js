import test from "node:test";
import assert from "node:assert/strict";

import { escapeHtml, safeColor, escapeICS } from "../src/utils/sanitize.js";
import { sanitizeCourses, sanitizeSelections, LIMITS } from "../src/utils/validate.js";
import { parseRawTextToCourses } from "../src/utils/parser.js";

test("escapeHtml neutralizes markup", () => {
  assert.equal(escapeHtml("<img src=x onerror=alert(1)>"), "&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(escapeHtml("a & b"), "a &amp; b");
});

test("escapeHtml neutralizes attribute breakout", () => {
  // The sink that mattered: value="${sec.name}" in the section builder.
  assert.equal(escapeHtml('" autofocus onfocus="alert(1)'), "&quot; autofocus onfocus=&quot;alert(1)");
  assert.equal(escapeHtml("' onmouseover='x"), "&#39; onmouseover=&#39;x");
  assert.equal(escapeHtml("`"), "&#96;");
});

test("escapeHtml coerces non-strings without throwing", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(42), "42");
});

test("safeColor only admits hex colours", () => {
  assert.equal(safeColor("#ff0000"), "#ff0000");
  assert.equal(safeColor("#FFF"), "#FFF");
  assert.equal(safeColor("  #10b981  "), "#10b981");
  // Anything that could smuggle CSS into a style attribute is replaced.
  assert.equal(safeColor("red; background:url(//evil)"), "#6366f1");
  assert.equal(safeColor("expression(alert(1))"), "#6366f1");
  assert.equal(safeColor(null), "#6366f1");
  assert.equal(safeColor({}), "#6366f1");
});

test("escapeICS escapes structural characters", () => {
  assert.equal(escapeICS("Hall 3, Wing B"), "Hall 3\\, Wing B");
  assert.equal(escapeICS("a;b"), "a\\;b");
  assert.equal(escapeICS("a\\b"), "a\\\\b");
  // A newline would otherwise let a value forge additional calendar lines.
  assert.equal(escapeICS("x\nEND:VEVENT"), "x\\nEND:VEVENT");
});

test("sanitizeCourses rejects malformed shapes", () => {
  assert.equal(sanitizeCourses("not an array").length, 0);
  assert.equal(sanitizeCourses(null).length, 0);
  assert.equal(sanitizeCourses([{ id: "a", sections: [] }]).length, 0, "no sections");
  assert.equal(sanitizeCourses([{ sections: [] }]).length, 0, "no id");
  assert.equal(
    sanitizeCourses([{ id: "a", sections: [{ id: "s", times: "nope" }] }]).length,
    0,
    "times must be an array"
  );
});

test("sanitizeCourses rejects invalid time slots", () => {
  const withSlot = (t) => sanitizeCourses([{ id: "a", sections: [{ id: "s", times: [t] }] }]);

  assert.equal(withSlot({ day: "Mon", startTime: "9am", endTime: "10:00" }).length, 0, "bad format");
  assert.equal(withSlot({ day: "Funday", startTime: "09:00", endTime: "10:00" }).length, 0, "bad day");
  assert.equal(withSlot({ day: "Mon", startTime: "25:00", endTime: "26:00" }).length, 0, "out of range");
  assert.equal(withSlot({ day: "Mon", startTime: "10:00", endTime: "09:00" }).length, 0, "ends before it starts");
  assert.equal(withSlot({ day: "Mon", startTime: "09:00", endTime: "09:00" }).length, 0, "zero length");
  assert.equal(withSlot({ day: "Mon", startTime: "09:00", endTime: "10:30" }).length, 1, "valid slot kept");
});

test("sanitizeCourses fills defaults and neutralizes colour", () => {
  const [course] = sanitizeCourses([{
    id: "a",
    color: "javascript:evil",
    sections: [{ id: "s", times: [{ day: "Mon", startTime: "09:00", endTime: "10:00" }] }]
  }]);

  assert.equal(course.color, "#6366f1");
  assert.equal(course.code, "COURSE");
  assert.equal(course.sections[0].instructor, "Staff");
  assert.equal(course.sections[0].location, "Campus");
});

test("sanitizeCourses drops duplicate ids and enforces the course cap", () => {
  const dupe = {
    id: "same",
    sections: [{ id: "s", times: [{ day: "Mon", startTime: "09:00", endTime: "10:00" }] }]
  };
  assert.equal(sanitizeCourses([dupe, dupe]).length, 1);

  const many = Array.from({ length: LIMITS.MAX_COURSES + 25 }, (_, i) => ({
    id: `c${i}`,
    sections: [{ id: `s${i}`, times: [{ day: "Mon", startTime: "09:00", endTime: "10:00" }] }]
  }));
  assert.equal(sanitizeCourses(many).length, LIMITS.MAX_COURSES);
});

test("sanitizeSelections keeps only pairs that resolve", () => {
  const courses = sanitizeCourses([{
    id: "c0",
    sections: [
      { id: "s0", times: [{ day: "Mon", startTime: "09:00", endTime: "10:00" }] },
      { id: "s1", times: [{ day: "Tue", startTime: "09:00", endTime: "10:00" }] }
    ]
  }]);

  const clean = sanitizeSelections({
    c0: "s1",
    c0_missing: "s0",   // unknown course
    c9: "s0",           // section does not belong to this course
    bad: 42             // not a string
  }, courses);

  assert.deepEqual({ ...clean }, { c0: "s1" });
});

test("sanitizeSelections does not pollute Object.prototype", () => {
  const courses = sanitizeCourses([{
    id: "c0",
    sections: [{ id: "s0", times: [{ day: "Mon", startTime: "09:00", endTime: "10:00" }] }]
  }]);

  sanitizeSelections(JSON.parse('{"__proto__": {"polluted": true}}'), courses);
  sanitizeSelections({ __proto__: "s0" }, courses);

  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

test("parser reads the documented import format", () => {
  const courses = parseRawTextToCourses([
    "CS101 Intro to Computer Science",
    "Sec 01 - Dr. Turing - Mon/Wed 09:00-10:30 Tech Bldg 101",
    "Sec 02 - Tue/Thu 11:00-12:30 Room 102"
  ].join("\n"));

  assert.equal(courses.length, 1);
  assert.equal(courses[0].code, "CS101");
  assert.equal(courses[0].sections.length, 2);

  const [first] = courses[0].sections;
  assert.deepEqual(first.times.map(t => t.day).sort(), ["Mon", "Wed"]);
  assert.equal(first.times[0].startTime, "09:00");
  assert.equal(first.times[0].endTime, "10:30");
  assert.equal(first.instructor, "Dr. Turing");
});

test("parser normalizes 12-hour times", () => {
  const [course] = parseRawTextToCourses("CS101 Test\nSec 01 Mon 1:30 PM - 2:45 PM");
  assert.equal(course.sections[0].times[0].startTime, "13:30");
  assert.equal(course.sections[0].times[0].endTime, "14:45");
});

test("parser caps oversized input", () => {
  // Course data is persisted before the next render, so an unbounded paste
  // would wedge the app on every later visit, not just once.
  const hostile = Array.from(
    { length: 4000 },
    (_, i) => `CS${100 + (i % 900)} Course\nSec 01 Mon 09:00-10:30`
  ).join("\n");

  const parsed = parseRawTextToCourses(hostile);
  assert.ok(parsed.length <= LIMITS.MAX_COURSES, `got ${parsed.length} courses`);
  assert.ok(parsed.every(c => c.sections.length <= LIMITS.MAX_SECTIONS_PER_COURSE));
});

test("parser ignores empty and unparseable input", () => {
  assert.equal(parseRawTextToCourses("").length, 0);
  assert.equal(parseRawTextToCourses("   \n  \n").length, 0);
  // No time range anywhere means no sections, so no courses survive.
  assert.equal(parseRawTextToCourses("CS101 Intro\nsome prose with no times").length, 0);
});
