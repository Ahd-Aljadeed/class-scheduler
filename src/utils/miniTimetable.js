/**
 * A compact, read-only week grid used wherever two schedules sit side by side
 * (the plan comparison). Plain DOM, same positioning maths as the main grid.
 */

import { DAYS, computeHourRange } from "./scheduler.js";
import { escapeHtml, safeColor } from "./sanitize.js";

/**
 * @param {HTMLElement} container
 * @param {object} metrics - result of calculateScheduleMetrics
 * @param {{startHour?: number, endHour?: number, pxPerHour?: number, days?: string[]}} [options]
 */
export function renderMiniTimetable(container, metrics, options = {}) {
  const slots = [...metrics.activeSlots, ...(metrics.busySlots || [])];
  const range = Number.isFinite(options.startHour) && Number.isFinite(options.endHour)
    ? { startHour: options.startHour, endHour: options.endHour }
    : computeHourRange(slots);
  const pxPerHour = options.pxPerHour || 18;
  const days = options.days || DAYS;
  const hours = Math.max(1, range.endHour - range.startHour);

  container.innerHTML = "";
  container.classList.add("mini-timetable");
  container.style.setProperty("--mini-day-count", String(days.length));

  const header = document.createElement("div");
  header.className = "mini-tt-header";
  header.innerHTML = `<div class="mini-tt-corner"></div>${days.map(d => `<div class="mini-tt-day">${d}</div>`).join("")}`;
  container.appendChild(header);

  const body = document.createElement("div");
  body.className = "mini-tt-body";
  body.style.height = `${hours * pxPerHour}px`;

  const labels = document.createElement("div");
  labels.className = "mini-tt-labels";
  for (let h = range.startHour; h < range.endHour; h++) {
    const label = document.createElement("div");
    label.className = "mini-tt-label";
    label.style.height = `${pxPerHour}px`;
    label.textContent = (h - range.startHour) % 2 === 0 ? String(h).padStart(2, "0") : "";
    labels.appendChild(label);
  }
  body.appendChild(labels);

  days.forEach(day => {
    const col = document.createElement("div");
    col.className = "mini-tt-col";
    for (let h = 0; h < hours; h++) {
      const line = document.createElement("div");
      line.className = "mini-tt-line";
      line.style.top = `${h * pxPerHour}px`;
      col.appendChild(line);
    }
    slots.filter(s => s.day === day).forEach(slot => {
      const top = ((slot.startMins - range.startHour * 60) / 60) * pxPerHour;
      const height = ((slot.endMins - slot.startMins) / 60) * pxPerHour;
      const block = document.createElement("div");
      block.className = `mini-tt-block${slot.isBusy ? " busy" : ""}`;
      block.style.top = `${top}px`;
      block.style.height = `${Math.max(3, height)}px`;
      block.style.backgroundColor = safeColor(slot.courseColor);
      block.title = `${slot.courseCode} ${slot.sectionName} · ${slot.day} ${slot.startTime}-${slot.endTime}`;
      if (height >= 14) block.innerHTML = `<span>${escapeHtml(slot.courseCode)}</span>`;
      col.appendChild(block);
    });
    body.appendChild(col);
  });

  container.appendChild(body);
}
