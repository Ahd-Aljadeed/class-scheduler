/**
 * Scheduling preferences: hard limits a schedule must respect, and weights
 * that roll every metric into one 0-100 score.
 *
 * Scores are relative, not absolute. Each metric is min-max normalised
 * against the full set of valid schedules for the current course list, so
 * the best schedule for your weights lands near 100 and the worst near 0.
 * A score is therefore only comparable within one course list.
 */

import { DAYS, timeToMinutes } from "./scheduler.js";

export const WEIGHT_KEYS = ["gaps", "daysOff", "mornings", "backToBack", "campus"];
export const MAX_WEIGHT = 3;

export const WEIGHT_LABELS = {
  gaps: "Fewer gap hours",
  daysOff: "More days off",
  mornings: "No early mornings",
  backToBack: "No back-to-back",
  campus: "Less time on campus"
};

export const DEFAULT_PREFS = Object.freeze({
  earliestStart: "",          // "" = no limit, else "HH:MM"
  latestEnd: "",              // "" = no limit, else "HH:MM"
  daysOff: [],                // day codes that must stay free
  lunchMinutes: 0,            // 0 = off; minimum free window inside the lunch range
  lunchStart: "11:30",
  lunchEnd: "14:00",
  maxCampusHoursPerDay: 0,    // 0 = off
  weights: Object.freeze({ gaps: 2, daysOff: 2, mornings: 1, backToBack: 1, campus: 1 })
});

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_SET = new Set(DAYS);

function clampNumber(value, min, max, fallback) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanTime(value) {
  return typeof value === "string" && TIME_PATTERN.test(value) ? value : "";
}

/**
 * Filters an arbitrary stored value down to a well-formed preferences object.
 * @param {unknown} value
 */
export function sanitizePrefs(value) {
  const src = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  const prefs = {
    earliestStart: cleanTime(src.earliestStart),
    latestEnd: cleanTime(src.latestEnd),
    daysOff: Array.isArray(src.daysOff)
      ? [...new Set(src.daysOff.filter(d => DAY_SET.has(d)))]
      : [],
    lunchMinutes: Math.round(clampNumber(src.lunchMinutes, 0, 180, 0)),
    lunchStart: cleanTime(src.lunchStart) || DEFAULT_PREFS.lunchStart,
    lunchEnd: cleanTime(src.lunchEnd) || DEFAULT_PREFS.lunchEnd,
    maxCampusHoursPerDay: clampNumber(src.maxCampusHoursPerDay, 0, 16, 0),
    weights: {}
  };

  if (timeToMinutes(prefs.lunchEnd) <= timeToMinutes(prefs.lunchStart)) {
    prefs.lunchStart = DEFAULT_PREFS.lunchStart;
    prefs.lunchEnd = DEFAULT_PREFS.lunchEnd;
  }

  const weights = src.weights && typeof src.weights === "object" ? src.weights : {};
  WEIGHT_KEYS.forEach(key => {
    prefs.weights[key] = clampNumber(weights[key], 0, MAX_WEIGHT, DEFAULT_PREFS.weights[key]);
  });

  return prefs;
}

/** True when every hard limit is off. */
export function hasHardLimits(prefs) {
  return !!(prefs.earliestStart || prefs.latestEnd || prefs.daysOff.length
    || prefs.lunchMinutes > 0 || prefs.maxCampusHoursPerDay > 0);
}

/**
 * Longest free stretch (in minutes) inside a window on one day, treating
 * classes and busy blocks alike as occupied.
 */
export function longestFreeWindow(metrics, day, windowStart, windowEnd) {
  const ws = timeToMinutes(windowStart);
  const we = timeToMinutes(windowEnd);
  if (we <= ws) return 0;

  const occupied = [...metrics.activeSlots, ...(metrics.busySlots || [])]
    .filter(s => s.day === day && s.endMins > ws && s.startMins < we)
    .sort((a, b) => a.startMins - b.startMins);

  let cursor = ws;
  let longest = 0;
  occupied.forEach(slot => {
    if (slot.startMins > cursor) longest = Math.max(longest, slot.startMins - cursor);
    cursor = Math.max(cursor, slot.endMins);
  });
  longest = Math.max(longest, we - cursor);
  return longest;
}

/**
 * Checks a schedule's metrics against the hard limits.
 * @returns {{ok: boolean, violations: Array<{code: string, text: string}>}}
 */
export function evaluateConstraints(metrics, prefs) {
  const violations = [];

  if (prefs.earliestStart) {
    const limit = timeToMinutes(prefs.earliestStart);
    const early = metrics.activeSlots.filter(s => s.startMins < limit).length;
    if (early > 0) {
      violations.push({ code: "earliest", text: `${early} class${early === 1 ? "" : "es"} before ${prefs.earliestStart}` });
    }
  }

  if (prefs.latestEnd) {
    const limit = timeToMinutes(prefs.latestEnd);
    const late = metrics.activeSlots.filter(s => s.endMins > limit).length;
    if (late > 0) {
      violations.push({ code: "latest", text: `${late} class${late === 1 ? "" : "es"} after ${prefs.latestEnd}` });
    }
  }

  const busyDaysOff = (prefs.daysOff || []).filter(day => {
    const info = metrics.dailyBreakdown[day];
    return info && info.hasClasses;
  });
  if (busyDaysOff.length > 0) {
    violations.push({ code: "daysOff", text: `Classes on ${busyDaysOff.join(", ")}` });
  }

  if (prefs.lunchMinutes > 0) {
    const missing = DAYS.filter(day => {
      const info = metrics.dailyBreakdown[day];
      if (!info || !info.hasClasses) return false;
      return longestFreeWindow(metrics, day, prefs.lunchStart, prefs.lunchEnd) < prefs.lunchMinutes;
    });
    if (missing.length > 0) {
      violations.push({
        code: "lunch",
        text: `No ${prefs.lunchMinutes} min break between ${prefs.lunchStart} and ${prefs.lunchEnd} on ${missing.join(", ")}`
      });
    }
  }

  if (prefs.maxCampusHoursPerDay > 0) {
    const over = DAYS.filter(day => {
      const info = metrics.dailyBreakdown[day];
      return info && info.campusHours > prefs.maxCampusHoursPerDay;
    });
    if (over.length > 0) {
      violations.push({ code: "campus", text: `Over ${prefs.maxCampusHoursPerDay}h on campus on ${over.join(", ")}` });
    }
  }

  return { ok: violations.length === 0, violations };
}

/** The metric each weight applies to. Lower is better for every feature. */
const FEATURE_TO_WEIGHT = {
  gaps: "gaps",
  campus: "campus",
  activeDays: "daysOff",
  early: "mornings",
  backToBack: "backToBack"
};

export function extractFeatures(metrics) {
  return {
    gaps: metrics.totalGapHours,
    campus: metrics.totalCampusHours,
    activeDays: metrics.activeDaysCount,
    early: metrics.earlyClassCount,
    backToBack: metrics.backToBackCount
  };
}

/**
 * Min and max of every feature across a list of metrics objects, used to
 * normalise scores.
 */
export function computeMetricRanges(metricsList) {
  const ranges = {};
  Object.keys(FEATURE_TO_WEIGHT).forEach(key => { ranges[key] = { min: 0, max: 0 }; });
  if (!metricsList || metricsList.length === 0) return ranges;

  let first = true;
  metricsList.forEach(metrics => {
    const f = extractFeatures(metrics);
    Object.keys(FEATURE_TO_WEIGHT).forEach(key => {
      if (first) {
        ranges[key] = { min: f[key], max: f[key] };
      } else {
        if (f[key] < ranges[key].min) ranges[key].min = f[key];
        if (f[key] > ranges[key].max) ranges[key].max = f[key];
      }
    });
    first = false;
  });
  return ranges;
}

/**
 * Weighted 0-100 score for a schedule, relative to `ranges`.
 * A weight of zero drops that metric; all weights zero scores 100.
 */
export function scoreSchedule(metrics, ranges, weights) {
  const f = extractFeatures(metrics);
  let weighted = 0;
  let weightSum = 0;

  Object.entries(FEATURE_TO_WEIGHT).forEach(([feature, weightKey]) => {
    const w = weights && typeof weights[weightKey] === "number" ? weights[weightKey] : 0;
    if (w <= 0) return;
    const range = ranges[feature] || { min: 0, max: 0 };
    const span = range.max - range.min;
    const norm = span > 0 ? Math.min(1, Math.max(0, (f[feature] - range.min) / span)) : 0;
    weighted += w * norm;
    weightSum += w;
  });

  if (weightSum === 0) return 100;
  return Math.round(100 * (1 - weighted / weightSum));
}

/** Arcade-style rank letter for a score. */
export function scoreRank(score) {
  if (score >= 95) return "S";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}
