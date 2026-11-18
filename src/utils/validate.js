/**
 * Schema validation for data restored from localStorage.
 *
 * Persisted course data is fully attacker-shaped from the app's point of view:
 * it can be edited by hand, or written by any other page on the same origin
 * (on GitHub Pages every project of an account shares `<user>.github.io`).
 * Rendering it unvalidated lets a malformed object throw deep inside the render
 * pipeline and leave the UI half-drawn. These helpers drop anything that does
 * not match the expected shape rather than trusting it.
 */

import { safeColor } from "./sanitize.js";
import { sanitizePrefs } from "./prefs.js";
import { parseLocalDate } from "./scheduler.js";

const DAY_NAMES = new Set(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
// Person ids end up inside localStorage key names, so keep them to a safe
// alphabet.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,48}$/;

/** Upper bounds that keep a hostile or accidental paste from wedging the app. */
export const LIMITS = {
  MAX_COURSES: 60,
  MAX_SECTIONS_PER_COURSE: 25,
  MAX_SLOTS_PER_SECTION: 14,
  MAX_PEOPLE: 6,
  MAX_PLANS: 12,
  MAX_HOLIDAYS: 20,
  MAX_NAME_LENGTH: 24
};

export const ME_ID = "me";
export const DEFAULT_PERSON_COLOR = "#6366f1";
export const DEFAULT_TERM = Object.freeze({ startDate: "", weeks: 15, holidays: [] });

function isPlainString(value) {
  return typeof value === "string";
}

/** Trims, strips control characters and caps a display name. */
function cleanName(value, fallback, maxLength = LIMITS.MAX_NAME_LENGTH) {
  if (!isPlainString(value)) return fallback;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
  return cleaned || fallback;
}

function sanitizeSlot(slot) {
  if (!slot || typeof slot !== "object") return null;
  if (!DAY_NAMES.has(slot.day)) return null;
  if (!isPlainString(slot.startTime) || !TIME_PATTERN.test(slot.startTime)) return null;
  if (!isPlainString(slot.endTime) || !TIME_PATTERN.test(slot.endTime)) return null;
  // A slot that ends before it starts breaks every downstream metric.
  if (slot.endTime <= slot.startTime) return null;

  return { day: slot.day, startTime: slot.startTime, endTime: slot.endTime };
}

function sanitizeSection(section) {
  if (!section || typeof section !== "object") return null;
  if (!isPlainString(section.id) || !section.id) return null;
  if (!Array.isArray(section.times)) return null;

  const times = section.times
    .slice(0, LIMITS.MAX_SLOTS_PER_SECTION)
    .map(sanitizeSlot)
    .filter(Boolean);

  if (times.length === 0) return null;

  return {
    id: section.id,
    name: isPlainString(section.name) ? section.name : "Section",
    instructor: isPlainString(section.instructor) ? section.instructor : "Staff",
    location: isPlainString(section.location) ? section.location : "Campus",
    times
  };
}

function sanitizeCourse(course) {
  if (!course || typeof course !== "object") return null;
  if (!isPlainString(course.id) || !course.id) return null;
  if (!Array.isArray(course.sections)) return null;

  const sections = course.sections
    .slice(0, LIMITS.MAX_SECTIONS_PER_COURSE)
    .map(sanitizeSection)
    .filter(Boolean);

  if (sections.length === 0) return null;

  const clean = {
    id: course.id,
    code: isPlainString(course.code) ? course.code : "COURSE",
    title: isPlainString(course.title) ? course.title : (course.code || "Course"),
    color: safeColor(course.color),
    sections
  };

  // A busy block is a single always-selected pseudo-course. Any other value
  // of `kind` is dropped so the field cannot smuggle in unknown modes.
  if (course.kind === "busy") {
    clean.kind = "busy";
    clean.sections = clean.sections.slice(0, 1);
  }

  return clean;
}

/**
 * Filters an arbitrary parsed value down to a well-formed course array.
 * @param {unknown} value
 * @returns {Array<object>}
 */
export function sanitizeCourses(value) {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set();

  return value
    .slice(0, LIMITS.MAX_COURSES)
    .map(sanitizeCourse)
    .filter((course) => {
      if (!course || seenIds.has(course.id)) return false;
      seenIds.add(course.id);
      return true;
    });
}

/**
 * Filters a parsed selection map down to string course-id -> section-id pairs
 * that actually resolve against the supplied courses.
 * @param {unknown} value
 * @param {Array<object>} courses
 * @returns {Record<string, string>}
 */
export function sanitizeSelections(value, courses) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const validSectionIds = new Map();
  courses.forEach((course) => {
    validSectionIds.set(course.id, new Set(course.sections.map((s) => s.id)));
  });

  const clean = Object.create(null);
  for (const [courseId, sectionId] of Object.entries(value)) {
    if (!isPlainString(sectionId)) continue;
    const sectionsForCourse = validSectionIds.get(courseId);
    if (sectionsForCourse && sectionsForCourse.has(sectionId)) {
      clean[courseId] = sectionId;
    }
  }
  return clean;
}

/**
 * Filters the stored people list. The result always starts with "me", never
 * repeats an id, and never exceeds the people cap.
 * @param {unknown} value
 * @returns {Array<{id: string, name: string, color: string}>}
 */
export function sanitizePeople(value) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const people = [];

  list.forEach((person) => {
    if (!person || typeof person !== "object") return;
    if (!isPlainString(person.id) || !ID_PATTERN.test(person.id) || seen.has(person.id)) return;
    seen.add(person.id);
    people.push({
      id: person.id,
      name: cleanName(person.name, person.id === ME_ID ? "Me" : "Friend"),
      color: safeColor(person.color, DEFAULT_PERSON_COLOR)
    });
  });

  const meIdx = people.findIndex((p) => p.id === ME_ID);
  if (meIdx === -1) {
    people.unshift({ id: ME_ID, name: "Me", color: DEFAULT_PERSON_COLOR });
  } else if (meIdx !== 0) {
    const [me] = people.splice(meIdx, 1);
    people.unshift(me);
  }

  return people.slice(0, LIMITS.MAX_PEOPLE);
}

function sanitizePlan(plan, courses) {
  if (!plan || typeof plan !== "object") return null;
  if (!isPlainString(plan.id) || !plan.id) return null;
  return {
    id: plan.id,
    name: cleanName(plan.name, "Plan", 40),
    selections: sanitizeSelections(plan.selections, courses),
    savedAt: Number.isFinite(plan.savedAt) ? plan.savedAt : 0
  };
}

/**
 * Filters a person's extra state: locked and excluded sections, preferences
 * and saved plans. Every section id must resolve against `courses`, a course
 * can carry at most one lock, and a section cannot be both locked and
 * excluded.
 * @param {unknown} value
 * @param {Array<object>} courses
 */
export function sanitizePersonExtras(value, courses) {
  const src = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  const sectionOwner = new Map();
  courses.forEach((course) => {
    course.sections.forEach((section) => sectionOwner.set(section.id, course.id));
  });

  const excluded = [];
  const excludedSet = new Set();
  (Array.isArray(src.excluded) ? src.excluded : []).forEach((id) => {
    if (!isPlainString(id) || !sectionOwner.has(id) || excludedSet.has(id)) return;
    excludedSet.add(id);
    excluded.push(id);
  });

  const locked = [];
  const lockedCourses = new Set();
  (Array.isArray(src.locked) ? src.locked : []).forEach((id) => {
    if (!isPlainString(id) || !sectionOwner.has(id) || excludedSet.has(id)) return;
    const courseId = sectionOwner.get(id);
    if (lockedCourses.has(courseId)) return;
    lockedCourses.add(courseId);
    locked.push(id);
  });

  const seenPlanIds = new Set();
  const plans = (Array.isArray(src.plans) ? src.plans : [])
    .slice(0, LIMITS.MAX_PLANS)
    .map((plan) => sanitizePlan(plan, courses))
    .filter((plan) => {
      if (!plan || seenPlanIds.has(plan.id)) return false;
      seenPlanIds.add(plan.id);
      return true;
    });

  return { locked, excluded, prefs: sanitizePrefs(src.prefs), plans };
}

/**
 * Filters stored term settings (used by the calendar export).
 * @param {unknown} value
 * @returns {{startDate: string, weeks: number, holidays: Array<{start: string, end: string, label: string}>}}
 */
export function sanitizeTerm(value) {
  const src = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  const startDate = parseLocalDate(src.startDate) ? src.startDate : "";
  const weeks = Number.isInteger(src.weeks) && src.weeks >= 1 && src.weeks <= 30 ? src.weeks : DEFAULT_TERM.weeks;

  const holidays = (Array.isArray(src.holidays) ? src.holidays : [])
    .slice(0, LIMITS.MAX_HOLIDAYS)
    .map((holiday) => {
      if (!holiday || typeof holiday !== "object") return null;
      if (!parseLocalDate(holiday.start)) return null;
      const end = parseLocalDate(holiday.end) && holiday.end >= holiday.start ? holiday.end : holiday.start;
      return { start: holiday.start, end, label: cleanName(holiday.label, "Holiday", 40) };
    })
    .filter(Boolean);

  return { startDate, weeks, holidays };
}
