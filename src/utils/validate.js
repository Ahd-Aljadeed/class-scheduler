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

const DAY_NAMES = new Set(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Upper bounds that keep a hostile or accidental paste from wedging the app. */
export const LIMITS = {
  MAX_COURSES: 60,
  MAX_SECTIONS_PER_COURSE: 25,
  MAX_SLOTS_PER_SECTION: 14
};

function isPlainString(value) {
  return typeof value === "string";
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

  return {
    id: course.id,
    code: isPlainString(course.code) ? course.code : "COURSE",
    title: isPlainString(course.title) ? course.title : (course.code || "Course"),
    color: safeColor(course.color),
    sections
  };
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
