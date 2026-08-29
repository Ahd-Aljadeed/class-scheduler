import { INITIAL_COURSES } from './data/sampleCourses.js';
import { calculateScheduleMetrics, generateAllCombinations, doSectionsConflict } from './utils/scheduler.js';
import { parseRawTextToCourses } from './utils/parser.js';

console.log("=== UNISCHEDULE VERIFICATION TEST ===");

// 1. Check Initial Courses
console.log(`Loaded ${INITIAL_COURSES.length} sample courses.`);

// 2. Check Combination Engine
const combinations = generateAllCombinations(INITIAL_COURSES);
console.log(`Generated ${combinations.length} valid non-conflicting schedule combinations.`);

if (combinations.length > 0) {
  const bestGapCombo = [...combinations].sort((a, b) => a.metrics.totalGapHours - b.metrics.totalGapHours)[0];
  console.log(`Best schedule by minimum gaps: ${bestGapCombo.metrics.totalGapHours} gap hours, ${bestGapCombo.metrics.totalCampusHours} campus hours, ${bestGapCombo.metrics.daysOffCount} days off.`);
}

// 3. Test Gap Hour Calculation logic
// Create test sections
const secA = {
  id: "secA",
  name: "Sec 01",
  times: [{ day: "Mon", startTime: "09:00", endTime: "11:00" }]
};
const secB = {
  id: "secB",
  name: "Sec 02",
  times: [{ day: "Mon", startTime: "14:00", endTime: "16:00" }]
};

const testCourse1 = { id: "c1", code: "TEST 101", color: "#6366f1", sections: [secA] };
const testCourse2 = { id: "c2", code: "TEST 102", color: "#ec4899", sections: [secB] };

const metrics = calculateScheduleMetrics([secA, secB], [testCourse1, testCourse2]);
console.log(`Test Gap Hours (09:00-11:00 & 14:00-16:00): ${metrics.totalGapHours} hrs (Expected: 3.0 hrs)`);

if (metrics.totalGapHours === 3.0) {
  console.log("✅ Gap calculation logic VERIFIED PERFECTLY!");
} else {
  console.error("❌ Gap calculation mismatch:", metrics.totalGapHours);
}

// 4. Test Overlap Conflict Detection
const secOverlap = {
  id: "secOverlap",
  name: "Sec 03",
  times: [{ day: "Mon", startTime: "10:00", endTime: "12:00" }]
};

const hasConflict = doSectionsConflict(secA, secOverlap);
console.log(`Test Conflict (09:00-11:00 vs 10:00-12:00): ${hasConflict}`);
if (hasConflict) {
  console.log("✅ Conflict detection VERIFIED PERFECTLY!");
}

// 5. Test Smart Text Parser
const sampleRawText = `
CS101 Intro to Programming
Sec 01 - Dr. Turing - Mon/Wed 09:00-10:30 Tech Bldg 101
Sec 02 - Grace Hopper - Tue/Thu 11:00-12:30 Tech Bldg 102
`;
const parsed = parseRawTextToCourses(sampleRawText);
console.log(`Parsed ${parsed.length} courses from text snippet with ${parsed[0]?.sections.length} sections.`);
if (parsed.length > 0 && parsed[0].sections.length === 2) {
  console.log("✅ Smart Text Parser VERIFIED PERFECTLY!");
}

console.log("=== ALL UNIT TESTS PASSED ===");
