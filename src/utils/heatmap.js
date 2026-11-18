/**
 * Free-time heatmap: across every valid schedule, how often is each slot of
 * the week free? Useful for picking a club or a shift before committing to a
 * timetable.
 */

import { DAYS, minutesToTime, timeToMinutes } from "./scheduler.js";

/**
 * @param {Array<{sections: Array}>} combos - valid schedules from generateAllCombinations
 * @param {{startHour?: number, endHour?: number, stepMinutes?: number}} [options]
 * @returns {{
 *   total: number, startHour: number, endHour: number, stepMinutes: number,
 *   rows: number, days: string[], labels: string[],
 *   cells: Record<string, number[]>   // fraction of schedules in which the slot is free, 0..1
 * }}
 */
export function computeFreeTimeHeatmap(combos, options = {}) {
  const startHour = Number.isFinite(options.startHour) ? options.startHour : 8;
  const endHour = Number.isFinite(options.endHour) ? options.endHour : 20;
  const step = Number.isFinite(options.stepMinutes) && options.stepMinutes > 0 ? options.stepMinutes : 30;

  const rows = Math.max(0, Math.ceil(((endHour - startHour) * 60) / step));
  const total = Array.isArray(combos) ? combos.length : 0;
  const origin = startHour * 60;

  const occupied = {};
  const stamp = {};
  DAYS.forEach(day => {
    occupied[day] = new Array(rows).fill(0);
    stamp[day] = new Array(rows).fill(-1);
  });

  (combos || []).forEach((combo, comboIdx) => {
    (combo.sections || []).forEach(section => {
      (section.times || []).forEach(t => {
        if (!occupied[t.day]) return;
        const s = timeToMinutes(t.startTime) - origin;
        const e = timeToMinutes(t.endTime) - origin;
        const first = Math.max(0, Math.floor(s / step));
        const last = Math.min(rows - 1, Math.ceil(e / step) - 1);
        for (let r = first; r <= last; r++) {
          // A schedule counts once per slot even if two of its sections touch
          // the same bucket.
          if (stamp[t.day][r] !== comboIdx) {
            stamp[t.day][r] = comboIdx;
            occupied[t.day][r]++;
          }
        }
      });
    });
  });

  const cells = {};
  DAYS.forEach(day => {
    cells[day] = occupied[day].map(n => (total > 0 ? 1 - n / total : 1));
  });

  const labels = Array.from({ length: rows }, (_, r) => minutesToTime(origin + r * step));

  return { total, startHour, endHour, stepMinutes: step, rows, days: DAYS.slice(), labels, cells };
}
