import test from "node:test";
import assert from "node:assert/strict";

import { parseKomarClasses } from "../scripts/parseKomarClasses.mjs";
import { KOMAR_COURSES } from "../src/data/komarCourses.js";
import { filterKomarCourses, buildKomarCourseObject } from "../src/features/komarCatalog.js";
import { sanitizeCourses } from "../src/utils/validate.js";
import { generateAllCombinations } from "../src/utils/scheduler.js";

test("parseKomarClasses correctly parses raw tab-separated class text", () => {
  const sample = `
Search
Search
Academic Debate\tT\t1\tE-G10\tWED\t08:00:00\t09:30:00
Academic Debate\tT\t1\tM-G05\tTHU\t09:30:00\t11:00:00
Academic Debate\tT\t2\tM-G02\tWED\t09:30:00\t11:00:00
Adult Nursing I\tL\t1\tY-000\tTHU\t08:00:00\t10:30:00
Adult Nursing I\tT\t1\tM-111\tSUN\t12:00:00\t14:00:00
Total classes: 5
Action
  `.trim();

  const courses = parseKomarClasses(sample);
  assert.equal(courses.length, 2);

  const debate = courses.find(c => c.title === "Academic Debate");
  assert.ok(debate);
  assert.equal(debate.types.length, 1);
  assert.equal(debate.types[0].type, "T");
  assert.equal(debate.types[0].sections.length, 2);

  // Section 1 has 2 weekly meeting slots
  const sec1 = debate.types[0].sections[0];
  assert.equal(sec1.name, "Sec 1");
  assert.equal(sec1.times.length, 2);
  assert.equal(sec1.times[0].day, "Wed");
  assert.equal(sec1.times[0].startTime, "08:00");
  assert.equal(sec1.times[0].endTime, "09:30");
  assert.equal(sec1.times[1].day, "Thu");
  assert.equal(sec1.times[1].startTime, "09:30");
  assert.equal(sec1.times[1].endTime, "11:00");
  assert.ok(sec1.location.includes("E-G10"));
  assert.ok(sec1.location.includes("M-G05"));

  const nursing = courses.find(c => c.title === "Adult Nursing I");
  assert.ok(nursing);
  assert.equal(nursing.types.length, 2); // T and L
  const nursingT = nursing.types.find(t => t.type === "T");
  const nursingL = nursing.types.find(t => t.type === "L");
  assert.ok(nursingT);
  assert.ok(nursingL);
  assert.equal(nursingT.sections.length, 1);
  assert.equal(nursingL.sections.length, 1);
});

test("filterKomarCourses filters by keyword and component type", () => {
  const all = filterKomarCourses(KOMAR_COURSES, "", "ALL");
  assert.equal(all.length, 382);

  // Search by query
  const dbCourses = filterKomarCourses(KOMAR_COURSES, "database", "ALL");
  assert.ok(dbCourses.length >= 1);
  assert.ok(dbCourses.some(c => c.title.toLowerCase().includes("database")));

  // Search by partial match (case-insensitive)
  const calc = filterKomarCourses(KOMAR_COURSES, "calc", "ALL");
  assert.ok(calc.length >= 1);
  assert.ok(calc.some(c => c.title.toLowerCase().includes("calculus")));

  // Filter by component type
  const labs = filterKomarCourses(KOMAR_COURSES, "", "L");
  assert.ok(labs.length > 0);
  assert.ok(labs.every(c => c.types.some(t => t.type === "L")));

  const clinical = filterKomarCourses(KOMAR_COURSES, "", "C");
  assert.ok(clinical.length > 0);
  assert.ok(clinical.every(c => c.types.some(t => t.type === "C")));

  // Combined search + filter
  const chemLabs = filterKomarCourses(KOMAR_COURSES, "chemistry", "L");
  assert.ok(chemLabs.length > 0);
  assert.ok(chemLabs.every(c => c.title.toLowerCase().includes("chemistry") && c.types.some(t => t.type === "L")));
});

test("buildKomarCourseObject produces valid UniSchedule Course objects that pass sanitizeCourses", () => {
  const sampleCourse = KOMAR_COURSES.find(c => c.title === "Analytical Chemistry & Lab");
  assert.ok(sampleCourse);
  assert.ok(sampleCourse.types.length > 1);

  const theoryType = sampleCourse.types.find(t => t.type === "T");
  const labType = sampleCourse.types.find(t => t.type === "L");

  const theoryCourse = buildKomarCourseObject(sampleCourse, theoryType, 0);
  const labCourse = buildKomarCourseObject(sampleCourse, labType, 1);

  assert.equal(theoryCourse.code, "Analytical Chemistry & Lab (T)");
  assert.equal(theoryCourse.title, "Analytical Chemistry & Lab (Theory)");
  assert.ok(theoryCourse.sections.length > 0);

  assert.equal(labCourse.code, "Analytical Chemistry & Lab (L)");
  assert.equal(labCourse.title, "Analytical Chemistry & Lab (Lab)");
  assert.ok(labCourse.sections.length > 0);

  const sanitized = sanitizeCourses([theoryCourse, labCourse]);
  assert.equal(sanitized.length, 2);
  assert.equal(sanitized[0].sections.length, theoryCourse.sections.length);
  assert.equal(sanitized[1].sections.length, labCourse.sections.length);
});

test("single-type Komar courses have clean un-suffixed codes", () => {
  const debate = KOMAR_COURSES.find(c => c.title === "Academic Debate");
  assert.ok(debate);
  assert.equal(debate.types.length, 1);

  const courseObj = buildKomarCourseObject(debate, debate.types[0], 2);
  assert.equal(courseObj.code, "Academic Debate");
  assert.equal(courseObj.title, "Academic Debate");

  const sanitized = sanitizeCourses([courseObj]);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].code, "Academic Debate");
});

test("generateAllCombinations resolves conflict-free schedules with imported Komar courses", () => {
  const c1Data = KOMAR_COURSES.find(c => c.title === "Academic Debate");
  const c2Data = KOMAR_COURSES.find(c => c.title === "Artificial Intelligence");

  assert.ok(c1Data);
  assert.ok(c2Data);

  const c1 = buildKomarCourseObject(c1Data, c1Data.types[0], 0);
  const c2 = buildKomarCourseObject(c2Data, c2Data.types[0], 1);

  const combos = generateAllCombinations([c1, c2]);
  assert.ok(combos.length > 0);

  // Verify metric calculation on combo
  const first = combos[0];
  assert.equal(first.sections.length, 2);
  assert.ok(first.metrics.totalClassHours > 0);
  assert.ok(first.metrics.activeSlots.length >= 3);
});
