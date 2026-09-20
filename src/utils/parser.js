import { PALETTE_COLORS } from '../data/sampleCourses.js';
import { LIMITS } from './validate.js';

/** Ceiling on lines read from a single paste. */
const MAX_IMPORT_LINES = 500;

/**
 * Parses raw user-entered text into Course & Section objects.
 *
 * Input is capped: an oversized paste would otherwise produce a course list
 * whose combination search cannot complete, and because the list is persisted
 * before the next render, the app would then fail to load on every visit.
 *
 * @param {string} rawText
 * @returns {Array<object>}
 */
export function parseRawTextToCourses(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText
    .split("\n")
    .slice(0, MAX_IMPORT_LINES)
    .map(l => l.trim())
    .filter(Boolean);
  const courses = [];
  let currentCourse = null;
  let colorIdx = 0;

  /**
   * Day tokens mapped to the days they denote.
   *
   * Order matters: the regex is built from these keys longest-first, so "TTh"
   * is matched before "T" and "Th" before "T". Every token is matched with
   * word boundaries — without them the single-letter forms matched inside
   * ordinary words, so "Dr. Turing" added a Tuesday class and "Room 102"
   * added a Monday one.
   */
  const DAY_TOKENS = {
    SUNDAY: ["Sun"], MONDAY: ["Mon"], TUESDAY: ["Tue"], WEDNESDAY: ["Wed"],
    THURSDAY: ["Thu"], FRIDAY: ["Fri"], SATURDAY: ["Sat"],

    MWF: ["Mon", "Wed", "Fri"],
    TTH: ["Tue", "Thu"],
    MW: ["Mon", "Wed"],

    SUN: ["Sun"], MON: ["Mon"], TUE: ["Tue"], TUES: ["Tue"], WED: ["Wed"],
    THU: ["Thu"], THUR: ["Thu"], THURS: ["Thu"], FRI: ["Fri"], SAT: ["Sat"],

    SU: ["Sun"], TH: ["Thu"], SA: ["Sat"],
    M: ["Mon"], T: ["Tue"], W: ["Wed"], R: ["Thu"], F: ["Fri"], U: ["Sun"]
  };

  const dayPattern = Object.keys(DAY_TOKENS)
    .sort((a, b) => b.length - a.length)
    .join("|");
  const dayRegex = new RegExp(`\\b(${dayPattern})\\b`, "gi");

  const timeRangeRegex = /(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*(?:-|–|—|to)+\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i;

  const normalizeDays = (dayStr) => DAY_TOKENS[dayStr.toUpperCase()] || [];

  const convert24h = (timeStr) => {
    let [h, m] = timeStr.replace(/(AM|PM)/i, '').trim().split(':').map(Number);
    const isPM = /PM/i.test(timeStr);
    const isAM = /AM/i.test(timeStr);

    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  lines.forEach((line) => {
    // Check if line starts a new Course Header (e.g. "CS101 - Intro to Computer Science" or "MATH 201")
    const courseCodeMatch = line.match(/^([A-Z]{2,5}\s*\d{3}[A-Z]?)(?:\s*[:-]?\s*(.*))?$/i);
    const isSectionLine = /Sec|Section|\d{1,2}:\d{2}/i.test(line);

    if (courseCodeMatch && !isSectionLine) {
      const code = courseCodeMatch[1].toUpperCase();
      const title = courseCodeMatch[2] ? courseCodeMatch[2].trim() : code;

      currentCourse = {
        id: `course-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        code,
        title,
        color: PALETTE_COLORS[colorIdx % PALETTE_COLORS.length],
        sections: []
      };
      colorIdx++;
      courses.push(currentCourse);
      return;
    }

    // If no course header has been created yet, create a fallback generic course
    if (!currentCourse) {
      currentCourse = {
        id: `course-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        code: "COURSE 101",
        title: "Imported Class",
        color: PALETTE_COLORS[colorIdx % PALETTE_COLORS.length],
        sections: []
      };
      colorIdx++;
      courses.push(currentCourse);
    }

    // Parse section line
    const secNameMatch = line.match(/(Sec(?:tion)?\s*\w+|\bS\d+\b|\b\d{1,2}\b)/i);
    const secName = secNameMatch ? secNameMatch[1] : `Sec 0${currentCourse.sections.length + 1}`;

    const timeMatch = line.match(timeRangeRegex);
    if (timeMatch) {
      const startTime = convert24h(timeMatch[1]);
      const endTime = convert24h(timeMatch[2]);

      // Extract days
      const daysFound = [];
      let match;
      const regexCopy = new RegExp(dayRegex);
      while ((match = regexCopy.exec(line)) !== null) {
        const parsedDays = normalizeDays(match[0]);
        parsedDays.forEach(d => {
          if (!daysFound.includes(d)) daysFound.push(d);
        });
      }

      const finalDays = daysFound.length > 0 ? daysFound : ["Mon"];

      const times = finalDays.map(day => ({
        day,
        startTime,
        endTime
      }));

      // Extract room / instructor if available
      let room = "TBD";
      const roomMatch = line.match(/(?:Rm|Room|Hall|Bldg|Lab)\s*[\w\d]+/i);
      if (roomMatch) room = roomMatch[0];

      let instructor = "Staff";
      const instMatch = line.match(/(?:Dr\.|Prof\.)\s*[A-Z][a-z]+/i);
      if (instMatch) instructor = instMatch[0];

      if (currentCourse.sections.length < LIMITS.MAX_SECTIONS_PER_COURSE) {
        currentCourse.sections.push({
          id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: secName,
          instructor,
          location: room,
          times
        });
      }
    }
  });

  // Remove empty courses, and cap the total course count.
  return courses.filter(c => c.sections.length > 0).slice(0, LIMITS.MAX_COURSES);
}
