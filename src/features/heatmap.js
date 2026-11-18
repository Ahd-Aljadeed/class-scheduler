/**
 * Free-time heatmap in the analytics panel: for every half hour of the week,
 * the share of valid schedules that leave it free. One hue, light to dark;
 * darker means "free more often".
 */

import { computeFreeTimeHeatmap } from "../utils/heatmap.js";
import { computeHourRange, isBusyCourse, MAX_COMBINATIONS, minutesToTime } from "../utils/scheduler.js";
import { arcadeAudio } from "../utils/arcadeAudio.js";

const STORAGE_KEY_OPEN = "unischedule_heatmap_open_v1";

export function initHeatmap(app) {
  const btn = document.getElementById("btn-toggle-heatmap");
  if (!btn) return;
  try {
    app.heatmapOpen = localStorage.getItem(STORAGE_KEY_OPEN) === "1";
  } catch (e) {
    app.heatmapOpen = false;
  }
  btn.addEventListener("click", () => {
    arcadeAudio.playClick();
    app.heatmapOpen = !app.heatmapOpen;
    try { localStorage.setItem(STORAGE_KEY_OPEN, app.heatmapOpen ? "1" : "0"); } catch (e) { /* optional */ }
    renderHeatmapPanel(app);
  });
}

export function renderHeatmapPanel(app) {
  const section = document.getElementById("heatmap-section");
  const body = document.getElementById("heatmap-body");
  const btn = document.getElementById("btn-toggle-heatmap");
  if (!section || !body || !btn) return;

  const classCourses = app.courses.filter(c => !isBusyCourse(c));
  if (classCourses.length === 0) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");
  btn.setAttribute("aria-expanded", String(!!app.heatmapOpen));
  btn.classList.toggle("open", !!app.heatmapOpen);
  body.classList.toggle("hidden", !app.heatmapOpen);
  if (!app.heatmapOpen) return;

  const combos = app.getCombinations();
  if (combos.length === 0) {
    body.innerHTML = `<p class="heatmap-empty muted">No valid schedules to analyse yet.</p>`;
    return;
  }

  const allSlots = [];
  app.courses.forEach(c => c.sections.forEach(s => allSlots.push(...s.times)));
  const range = computeHourRange(allSlots);
  const heat = computeFreeTimeHeatmap(combos, { startHour: range.startHour, endHour: range.endHour, stepMinutes: 30 });

  const cellsHtml = [];
  for (let r = 0; r < heat.rows; r++) {
    if (r % 2 === 0) {
      cellsHtml.push(`<div class="heatmap-label" style="grid-row: span 2">${heat.labels[r]}</div>`);
    }
    heat.days.forEach(day => {
      const free = heat.cells[day][r];
      const pct = Math.round(free * 100);
      const end = minutesToTime(heat.startHour * 60 + (r + 1) * heat.stepMinutes);
      cellsHtml.push(
        `<div class="heatmap-cell" style="--free: ${free.toFixed(3)}" role="img" tabindex="0"
              title="${day} ${heat.labels[r]}–${end}: free in ${pct}% of ${heat.total} schedules"
              aria-label="${day} ${heat.labels[r]} to ${end}, free in ${pct} percent of schedules"></div>`
      );
    });
  }

  const capped = combos.length >= MAX_COMBINATIONS;
  body.innerHTML = `
    <div class="heatmap-grid" style="--heat-rows: ${heat.rows}">
      <div class="heatmap-corner"></div>
      ${heat.days.map(d => `<div class="heatmap-day">${d}</div>`).join("")}
      ${cellsHtml.join("")}
    </div>
    <div class="heatmap-legend">
      <span>Rarely free</span>
      <span class="heatmap-ramp" aria-hidden="true"></span>
      <span>Always free</span>
    </div>
    <p class="heatmap-note muted">Across ${heat.total} valid schedule${heat.total === 1 ? "" : "s"}${capped ? " (the first 2,000)" : ""}. Hover a cell for the exact share.</p>`;
}
