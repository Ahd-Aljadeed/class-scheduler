import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DAY_MAP = {
  SUN: 'Sun',
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat'
};

export const TYPE_NAMES = {
  T: 'Theory',
  L: 'Lab',
  C: 'Clinical'
};

/**
 * Parses raw Komar University classes text (tab-separated format) into structured courses.
 * @param {string} rawText
 * @returns {Array<object>}
 */
export function parseKomarClasses(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  const lines = rawText.split(/\r?\n/);
  const coursesMap = new Map();

  for (const line of lines) {
    const parts = line.trim().split('\t');
    if (parts.length !== 7) continue;

    const [titleRaw, typeRaw, secNumRaw, roomRaw, dayRaw, startRaw, endRaw] = parts;
    const title = titleRaw.trim();
    const type = typeRaw.trim().toUpperCase();
    const secNum = secNumRaw.trim();
    const room = roomRaw.trim() || 'Campus';
    const day = DAY_MAP[dayRaw.trim().toUpperCase()] || dayRaw.trim();
    const startTime = startRaw.trim().slice(0, 5);
    const endTime = endRaw.trim().slice(0, 5);

    // Filter out table headers or non-class entries
    if (!title || title.toLowerCase() === 'search' || title.toLowerCase() === 'action') continue;
    if (!startTime.match(/^\d{2}:\d{2}$/) || !endTime.match(/^\d{2}:\d{2}$/)) continue;

    if (!coursesMap.has(title)) {
      coursesMap.set(title, new Map());
    }
    const typeMap = coursesMap.get(title);
    if (!typeMap.has(type)) {
      typeMap.set(type, new Map());
    }
    const secMap = typeMap.get(type);
    if (!secMap.has(secNum)) {
      secMap.set(secNum, {
        name: `Sec ${secNum}`,
        rooms: [],
        times: []
      });
    }
    const secObj = secMap.get(secNum);
    if (!secObj.rooms.includes(room)) {
      secObj.rooms.push(room);
    }
    secObj.times.push({
      day,
      startTime,
      endTime,
      location: room
    });
  }

  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  const result = [];
  const sortedTitles = Array.from(coursesMap.keys()).sort((a, b) => a.localeCompare(b));

  for (const title of sortedTitles) {
    const typeMap = coursesMap.get(title);
    const types = [];

    // Sort types: T first, then L, then C
    const typeOrder = { T: 1, L: 2, C: 3 };
    const sortedTypes = Array.from(typeMap.keys()).sort((a, b) => (typeOrder[a] || 9) - (typeOrder[b] || 9));

    for (const type of sortedTypes) {
      const secMap = typeMap.get(type);
      const sections = [];

      // Sort sections numerically where possible
      const sortedSecNums = Array.from(secMap.keys()).sort((a, b) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });

      for (const secNum of sortedSecNums) {
        const secData = secMap.get(secNum);
        sections.push({
          name: secData.name,
          location: secData.rooms.join(' / ') || 'Campus',
          times: secData.times
        });
      }

      types.push({
        type,
        typeName: TYPE_NAMES[type] || type,
        sections
      });
    }

    result.push({
      id: slugify(title),
      title,
      types
    });
  }

  return result;
}

// CLI execution
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const rootDir = path.resolve(path.dirname(__filename), '..');
  const inputPath = path.join(rootDir, 'allClasses.txt');
  const outputPath = path.join(rootDir, 'src', 'data', 'komarCourses.js');

  if (fs.existsSync(inputPath)) {
    const raw = fs.readFileSync(inputPath, 'utf8');
    const parsed = parseKomarClasses(raw);
    const fileContent = `// Generated from allClasses.txt - Komar University Course Catalog\n` +
      `export const KOMAR_COURSES = ${JSON.stringify(parsed, null, 2)};\n`;
    fs.writeFileSync(outputPath, fileContent, 'utf8');
    console.log(`Parsed ${parsed.length} Komar courses and saved to ${outputPath}`);
  } else {
    console.error(`Input file not found at ${inputPath}`);
    process.exit(1);
  }
}
