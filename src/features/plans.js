/**
 * Named saved plans (Plan A, Plan B...) per person, with a side-by-side
 * comparison of any two of them or of a plan against the current picks.
 */

import { escapeHtml } from "../utils/sanitize.js";
import { arcadeAudio } from "../utils/arcadeAudio.js";
import { showAlert, showConfirm } from "../utils/customModal.js";
import { LIMITS } from "../utils/validate.js";
import { calculateScheduleMetrics, computeHourRange, isBusyCourse } from "../utils/scheduler.js";
import { renderMiniTimetable } from "../utils/miniTimetable.js";
import { scoreSchedule, scoreRank } from "../utils/prefs.js";

const CURRENT = "current";

export function initPlans(app) {
  const els = {
    overlay: document.getElementById("plans-modal-overlay"),
    btnOpen: document.getElementById("btn-plans"),
    btnClose: document.getElementById("btn-close-plans-modal"),
    nameInput: document.getElementById("plan-name-input"),
    btnSave: document.getElementById("btn-save-plan"),
    list: document.getElementById("plans-list"),
    selA: document.getElementById("compare-a"),
    selB: document.getElementById("compare-b"),
    output: document.getElementById("compare-output"),
    badge: document.getElementById("plans-count-badge")
  };
  app.plansEls = els;
  if (!els.overlay) return;

  const close = () => els.overlay.classList.add("hidden");

  els.btnOpen.addEventListener("click", () => {
    arcadeAudio.playClick();
    els.nameInput.value = "";
    renderPlansModal(app);
    els.overlay.classList.remove("hidden");
  });
  els.btnClose.addEventListener("click", () => { arcadeAudio.playClick(); close(); });
  els.overlay.addEventListener("click", (e) => { if (e.target === els.overlay) close(); });

  const savePlan = async () => {
    const classSelections = Object.entries(app.selectedSectionsMap).filter(([courseId]) => {
      const course = app.courseById.get(courseId);
      return course && !isBusyCourse(course);
    });
    if (classSelections.length === 0) {
      await showAlert("Pick at least one section before saving a plan.", "Nothing to save");
      return;
    }
    if (app.plans.length >= LIMITS.MAX_PLANS) {
      await showAlert(`You can keep up to ${LIMITS.MAX_PLANS} plans per person. Delete one to make room.`, "Plan limit reached");
      return;
    }
    const name = els.nameInput.value.trim().slice(0, 40) || `Plan ${app.plans.length + 1}`;
    app.plans.push({
      id: `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      selections: { ...app.selectedSectionsMap },
      savedAt: Date.now()
    });
    app.savePersonExtras();
    app.updatePlansBadge();
    els.nameInput.value = "";
    arcadeAudio.playVictory();
    renderPlansModal(app, { compareWithLatest: true });
  };

  els.btnSave.addEventListener("click", savePlan);
  els.nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); savePlan(); }
  });

  els.list.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-plan-id]");
    if (!btn) return;
    const plan = app.plans.find(p => p.id === btn.dataset.planId);
    if (!plan) return;

    if (btn.classList.contains("btn-load-plan")) {
      arcadeAudio.playAutoFix();
      app.applySelectionMap(plan.selections, { celebrate: false });
      close();
    } else if (btn.classList.contains("btn-compare-plan")) {
      arcadeAudio.playClick();
      els.selA.value = CURRENT;
      els.selB.value = plan.id;
      renderComparison(app);
    } else if (btn.classList.contains("btn-delete-plan")) {
      const ok = await showConfirm(`Delete "${plan.name}"?`, "Delete plan");
      if (!ok) return;
      app.plans = app.plans.filter(p => p.id !== plan.id);
      app.savePersonExtras();
      app.updatePlansBadge();
      renderPlansModal(app);
    }
  });

  els.selA.addEventListener("change", () => renderComparison(app));
  els.selB.addEventListener("change", () => renderComparison(app));
}

function metricsForSelection(app, selections) {
  const sections = [];
  app.courses.forEach(course => {
    const secId = isBusyCourse(course) ? course.sections[0].id : selections[course.id];
    const section = secId ? course.sections.find(s => s.id === secId) : null;
    if (section) sections.push(section);
  });
  return calculateScheduleMetrics(sections, app.courses, app.courseBySectionId);
}

function describeSelections(app, selections) {
  const classCourses = app.courses.filter(c => !isBusyCourse(c));
  const picked = classCourses.filter(c => selections[c.id]).length;
  return `${picked} / ${classCourses.length} courses picked`;
}

export function renderPlansModal(app, options = {}) {
  const els = app.plansEls;
  if (!els || !els.overlay) return;

  if (app.plans.length === 0) {
    els.list.innerHTML = `
      <div class="plans-empty">
        <p>No saved plans yet for ${escapeHtml(app.activePerson.name)}.</p>
        <p class="muted">Save the schedule you have now, keep tweaking, then compare the two.</p>
      </div>`;
  } else {
    els.list.innerHTML = app.plans.map(plan => {
      const m = metricsForSelection(app, plan.selections);
      const isCurrent = app.courses.every(c => isBusyCourse(c) || (app.selectedSectionsMap[c.id] || null) === (plan.selections[c.id] || null));
      return `
        <div class="plan-card ${isCurrent ? "is-current" : ""}">
          <div class="plan-card-main">
            <div class="plan-name">${escapeHtml(plan.name)} ${isCurrent ? '<span class="plan-current-tag">current</span>' : ""}</div>
            <div class="plan-meta">${m.totalGapHours}h gaps · ${m.daysOffCount} days off · ${m.totalCampusHours}h on campus · ${describeSelections(app, plan.selections)}</div>
          </div>
          <div class="plan-actions">
            <button type="button" class="btn btn-xs btn-primary btn-load-plan" data-plan-id="${escapeHtml(plan.id)}">Load</button>
            <button type="button" class="btn btn-xs btn-outline btn-compare-plan" data-plan-id="${escapeHtml(plan.id)}">Compare</button>
            <button type="button" class="btn btn-xs btn-ghost btn-delete-plan" data-plan-id="${escapeHtml(plan.id)}" title="Delete plan">&times;</button>
          </div>
        </div>`;
    }).join("");
  }

  const previousA = els.selA.value;
  const previousB = els.selB.value;
  const optionsHtml = [`<option value="${CURRENT}">Current schedule</option>`]
    .concat(app.plans.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`))
    .join("");
  els.selA.innerHTML = optionsHtml;
  els.selB.innerHTML = optionsHtml;

  const valid = (v) => v === CURRENT || app.plans.some(p => p.id === v);
  els.selA.value = valid(previousA) ? previousA : CURRENT;
  if (options.compareWithLatest && app.plans.length) {
    els.selB.value = app.plans[app.plans.length - 1].id;
  } else {
    els.selB.value = valid(previousB) && previousB !== CURRENT ? previousB : (app.plans[0] ? app.plans[0].id : CURRENT);
  }

  renderComparison(app);
}

function betterSide(a, b, direction) {
  if (direction === "neutral" || a === b) return null;
  if (direction === "lower") return a < b ? "a" : "b";
  return a > b ? "a" : "b";
}

export function renderComparison(app) {
  const els = app.plansEls;
  if (!els || !els.output) return;

  const resolve = (value) => {
    if (value === CURRENT) return { label: "Current schedule", selections: app.selectedSectionsMap };
    const plan = app.plans.find(p => p.id === value);
    return plan ? { label: plan.name, selections: plan.selections } : null;
  };
  const a = resolve(els.selA.value);
  const b = resolve(els.selB.value);

  if (!a || !b) {
    els.output.innerHTML = `<p class="muted compare-hint">Save a plan to compare it with your current schedule.</p>`;
    return;
  }

  const mA = metricsForSelection(app, a.selections);
  const mB = metricsForSelection(app, b.selections);
  const range = computeHourRange([...mA.activeSlots, ...mA.busySlots, ...mB.activeSlots, ...mB.busySlots]);
  const ranges = app.getScoreRanges();
  const scoreA = scoreSchedule(mA, ranges, app.prefs.weights);
  const scoreB = scoreSchedule(mB, ranges, app.prefs.weights);

  const rows = [
    { label: "Gap hours", a: mA.totalGapHours, b: mB.totalGapHours, dir: "lower", unit: "h" },
    { label: "Campus hours", a: mA.totalCampusHours, b: mB.totalCampusHours, dir: "lower", unit: "h" },
    { label: "Class hours", a: mA.totalClassHours, b: mB.totalClassHours, dir: "neutral", unit: "h" },
    { label: "Days off", a: mA.daysOffCount, b: mB.daysOffCount, dir: "higher", unit: "" },
    { label: "Early classes", a: mA.earlyClassCount, b: mB.earlyClassCount, dir: "lower", unit: "" },
    { label: "Back-to-back", a: mA.backToBackCount, b: mB.backToBackCount, dir: "lower", unit: "" },
    { label: "Match score", a: scoreA, b: scoreB, dir: "higher", unit: "", suffix: [scoreRank(scoreA), scoreRank(scoreB)] }
  ];

  els.output.innerHTML = `
    <div class="compare-grid">
      <div class="compare-col">
        <h4 class="compare-title">${escapeHtml(a.label)}</h4>
        <div class="compare-mini" data-side="a"></div>
      </div>
      <div class="compare-col">
        <h4 class="compare-title">${escapeHtml(b.label)}</h4>
        <div class="compare-mini" data-side="b"></div>
      </div>
    </div>
    <table class="compare-table">
      <thead><tr><th></th><th>${escapeHtml(a.label)}</th><th>${escapeHtml(b.label)}</th></tr></thead>
      <tbody>
        ${rows.map(row => {
          const better = betterSide(row.a, row.b, row.dir);
          const cell = (side, value, suffix) => `<td class="${better === side ? "better" : ""}">${value}${row.unit}${suffix ? ` <span class="rank-chip">${suffix}</span>` : ""}</td>`;
          return `<tr><th>${row.label}</th>${cell("a", row.a, row.suffix && row.suffix[0])}${cell("b", row.b, row.suffix && row.suffix[1])}</tr>`;
        }).join("")}
      </tbody>
    </table>`;

  const miniOptions = { startHour: range.startHour, endHour: range.endHour, pxPerHour: 16 };
  renderMiniTimetable(els.output.querySelector('[data-side="a"]'), mA, miniOptions);
  renderMiniTimetable(els.output.querySelector('[data-side="b"]'), mB, miniOptions);
}
