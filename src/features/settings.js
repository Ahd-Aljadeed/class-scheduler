/**
 * Term settings used by the calendar export: start date, length in weeks and
 * holiday ranges (exported as skipped occurrences).
 */

import { escapeHtml } from "../utils/sanitize.js";
import { arcadeAudio } from "../utils/arcadeAudio.js";
import { sanitizeTerm, LIMITS } from "../utils/validate.js";
import { nextSunday, formatLocalDate } from "../utils/scheduler.js";

export function initSettings(app) {
  const els = {
    overlay: document.getElementById("settings-modal-overlay"),
    btnOpen: document.getElementById("btn-settings"),
    btnClose: document.getElementById("btn-close-settings-modal"),
    btnCancel: document.getElementById("btn-cancel-settings"),
    form: document.getElementById("settings-form"),
    start: document.getElementById("term-start-date"),
    weeks: document.getElementById("term-weeks"),
    holidays: document.getElementById("holidays-list"),
    btnAddHoliday: document.getElementById("btn-add-holiday")
  };
  if (!els.overlay) return;

  let draft = null;

  const close = () => els.overlay.classList.add("hidden");

  const renderHolidays = () => {
    if (draft.holidays.length === 0) {
      els.holidays.innerHTML = `<p class="muted settings-hint">No holidays yet. Add a range and those weeks are skipped in the export.</p>`;
      return;
    }
    els.holidays.innerHTML = draft.holidays.map((h, idx) => `
      <div class="holiday-row" data-idx="${idx}">
        <input type="date" class="holiday-start" value="${escapeHtml(h.start)}" aria-label="Holiday start">
        <span class="holiday-to">to</span>
        <input type="date" class="holiday-end" value="${escapeHtml(h.end)}" aria-label="Holiday end">
        <input type="text" class="holiday-label" value="${escapeHtml(h.label)}" placeholder="e.g. Midterm break" maxlength="40" aria-label="Holiday label">
        <button type="button" class="btn btn-ghost icon-only btn-xs btn-remove-holiday" title="Remove holiday">&times;</button>
      </div>`).join("");
  };

  els.btnOpen.addEventListener("click", () => {
    arcadeAudio.playClick();
    draft = JSON.parse(JSON.stringify(app.term));
    els.start.value = draft.startDate;
    els.start.placeholder = formatLocalDate(nextSunday(new Date()));
    els.weeks.value = String(draft.weeks);
    renderHolidays();
    els.overlay.classList.remove("hidden");
  });

  els.btnClose.addEventListener("click", () => { arcadeAudio.playClick(); close(); });
  els.btnCancel.addEventListener("click", () => { arcadeAudio.playClick(); close(); });
  els.overlay.addEventListener("click", (e) => { if (e.target === els.overlay) close(); });

  els.btnAddHoliday.addEventListener("click", () => {
    arcadeAudio.playClick();
    if (draft.holidays.length >= LIMITS.MAX_HOLIDAYS) return;
    draft.holidays.push({ start: "", end: "", label: "" });
    renderHolidays();
    const rows = els.holidays.querySelectorAll(".holiday-row");
    const last = rows[rows.length - 1];
    if (last) last.querySelector(".holiday-start").focus();
  });

  els.holidays.addEventListener("input", (e) => {
    const row = e.target.closest(".holiday-row");
    if (!row) return;
    const h = draft.holidays[Number(row.dataset.idx)];
    if (!h) return;
    if (e.target.classList.contains("holiday-start")) {
      h.start = e.target.value;
      if (!h.end || h.end < h.start) {
        h.end = h.start;
        row.querySelector(".holiday-end").value = h.end;
      }
    } else if (e.target.classList.contains("holiday-end")) {
      h.end = e.target.value;
    } else if (e.target.classList.contains("holiday-label")) {
      h.label = e.target.value;
    }
  });

  els.holidays.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-remove-holiday");
    if (!btn) return;
    arcadeAudio.playClick();
    const row = btn.closest(".holiday-row");
    draft.holidays.splice(Number(row.dataset.idx), 1);
    renderHolidays();
  });

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    app.term = sanitizeTerm({
      startDate: els.start.value,
      weeks: Number(els.weeks.value),
      holidays: draft.holidays.filter(h => h.start)
    });
    app.saveTerm();
    arcadeAudio.playSelect();
    close();
  });
}
