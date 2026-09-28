/**
 * The preferences panel inside the optimizer drawer: hard limits that filter
 * the schedule list, and weights that produce the "Best match" score.
 */

import { DAYS } from "../utils/scheduler.js";
import { WEIGHT_KEYS, WEIGHT_LABELS, MAX_WEIGHT, sanitizePrefs, hasHardLimits } from "../utils/prefs.js";
import { arcadeAudio } from "../utils/arcadeAudio.js";

export function initPreferencesPanel(app) {
  const panel = document.getElementById("prefs-panel");
  const btnToggle = document.getElementById("btn-toggle-prefs");
  if (!panel || !btnToggle) return;

  const dayChips = document.getElementById("pref-days");
  dayChips.innerHTML = DAYS.map(d =>
    `<label class="day-chip"><input type="checkbox" class="pref-day" value="${d}"> ${d}</label>`
  ).join("");

  const weightsBox = document.getElementById("pref-weights");
  weightsBox.innerHTML = WEIGHT_KEYS.map(key => `
    <label class="pref-weight-row">
      <span class="pref-weight-label">${WEIGHT_LABELS[key]}</span>
      <input type="range" class="pref-weight" data-weight="${key}" min="0" max="${MAX_WEIGHT}" step="0.5">
      <output data-weight-out="${key}"></output>
    </label>`).join("");

  const readForm = () => ({
    earliestStart: panel.querySelector("#pref-earliest").value,
    latestEnd: panel.querySelector("#pref-latest").value,
    daysOff: [...panel.querySelectorAll(".pref-day:checked")].map(i => i.value),
    lunchMinutes: Number(panel.querySelector("#pref-lunch-minutes").value),
    lunchStart: panel.querySelector("#pref-lunch-start").value,
    lunchEnd: panel.querySelector("#pref-lunch-end").value,
    maxCampusHoursPerDay: Number(panel.querySelector("#pref-max-campus").value) || 0,
    weights: Object.fromEntries(
      [...panel.querySelectorAll(".pref-weight")].map(i => [i.dataset.weight, Number(i.value)])
    )
  });

  const commit = () => {
    app.prefs = sanitizePrefs(readForm());
    app.savePersonExtras();
    renderPreferencesPanel(app);
    app.renderCombinationsDrawer();
    app.renderAnalytics();
  };

  let sliderTimer = null;
  panel.addEventListener("input", (e) => {
    if (!e.target.classList.contains("pref-weight")) return;
    const out = panel.querySelector(`[data-weight-out="${e.target.dataset.weight}"]`);
    if (out) out.textContent = e.target.value;
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(commit, 150);
  });

  panel.addEventListener("change", (e) => {
    if (e.target.classList.contains("pref-weight")) return; // handled on input
    if (e.target.id === "pref-hide-violations") {
      app.hideViolations = e.target.checked;
      app.renderCombinationsDrawer();
      return;
    }
    commit();
  });

  btnToggle.addEventListener("click", () => {
    arcadeAudio.playClick();
    const open = panel.classList.toggle("hidden") === false;
    btnToggle.classList.toggle("active", open);
    btnToggle.setAttribute("aria-expanded", String(open));
  });

  document.getElementById("btn-reset-prefs").addEventListener("click", () => {
    arcadeAudio.playClick();
    app.prefs = sanitizePrefs(null);
    app.savePersonExtras();
    renderPreferencesPanel(app);
    app.renderCombinationsDrawer();
    app.renderAnalytics();
  });

  renderPreferencesPanel(app);
}

export function renderPreferencesPanel(app) {
  const panel = document.getElementById("prefs-panel");
  const btnToggle = document.getElementById("btn-toggle-prefs");
  if (!panel || !btnToggle) return;
  const prefs = app.prefs;

  panel.querySelector("#pref-earliest").value = prefs.earliestStart;
  panel.querySelector("#pref-latest").value = prefs.latestEnd;
  panel.querySelectorAll(".pref-day").forEach(input => {
    input.checked = prefs.daysOff.includes(input.value);
  });
  panel.querySelector("#pref-lunch-minutes").value = String(prefs.lunchMinutes);
  panel.querySelector("#pref-lunch-start").value = prefs.lunchStart;
  panel.querySelector("#pref-lunch-end").value = prefs.lunchEnd;
  panel.querySelector("#pref-max-campus").value = prefs.maxCampusHoursPerDay || "";
  panel.querySelectorAll(".pref-weight").forEach(input => {
    input.value = String(prefs.weights[input.dataset.weight]);
    const out = panel.querySelector(`[data-weight-out="${input.dataset.weight}"]`);
    if (out) out.textContent = String(prefs.weights[input.dataset.weight]);
  });
  panel.querySelector("#pref-hide-violations").checked = app.hideViolations !== false;

  btnToggle.classList.toggle("has-limits", hasHardLimits(prefs));
}

/** Short phrases describing the active hard limits, for the drawer summary. */
export function summarizeHardLimits(prefs) {
  const parts = [];
  if (prefs.earliestStart) parts.push(`nothing before ${prefs.earliestStart}`);
  if (prefs.latestEnd) parts.push(`nothing after ${prefs.latestEnd}`);
  if (prefs.daysOff.length) parts.push(`${prefs.daysOff.join("/")} off`);
  if (prefs.lunchMinutes > 0) parts.push(`${prefs.lunchMinutes} min lunch`);
  if (prefs.maxCampusHoursPerDay > 0) parts.push(`max ${prefs.maxCampusHoursPerDay}h on campus per day`);
  return parts;
}
