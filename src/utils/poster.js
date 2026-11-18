/**
 * Draws a shareable poster of a timetable onto a canvas: the week grid, the
 * headline metrics and the preference score, styled after the current theme.
 * Pure Canvas 2D, no dependencies, so it works offline like everything else.
 */

import { DAYS, FULL_DAYS, computeHourRange, DEFAULT_GRID_END_HOUR } from "./scheduler.js";
import { safeColor } from "./sanitize.js";

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;

function cssVar(name, fallback) {
  if (typeof getComputedStyle !== "function" || !document.documentElement) return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function drawHatch(ctx, x, y, w, h, color) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 8);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  for (let d = -h; d < w + h; d += 12) {
    ctx.beginPath();
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d + h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * @param {{
 *   title?: string, subtitle?: string, metrics: object,
 *   score?: number|null, rank?: string|null, mode?: string, theme?: string
 * }} options
 * @returns {HTMLCanvasElement}
 */
export function drawPoster(options) {
  const { metrics } = options;
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext("2d");

  const arcade = options.mode === "arcade";
  const colors = {
    bg: cssVar("--bg-main", "#0b0f19"),
    panel: cssVar("--bg-panel", "#111827"),
    text: cssVar("--text-primary", "#f3f4f6"),
    muted: cssVar("--text-secondary", "#9ca3af"),
    faint: cssVar("--text-muted", "#6b7280"),
    accent: cssVar("--accent-primary", "#6366f1"),
    border: cssVar("--border-color-strong", "rgba(255,255,255,0.16)"),
    warning: cssVar("--accent-warning", "#f59e0b"),
    success: cssVar("--accent-success", "#10b981")
  };
  const sans = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
  const mono = "'JetBrains Mono', monospace";
  const display = arcade ? "'Press Start 2P', monospace" : sans;

  // Background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  // Header
  const margin = 56;
  ctx.fillStyle = colors.text;
  ctx.textBaseline = "top";
  ctx.font = `${arcade ? "700 34px" : "800 52px"} ${display}`;
  ctx.fillText(fitText(ctx, options.title || "UniSchedule", 700), margin, 52);
  ctx.font = `600 26px ${sans}`;
  ctx.fillStyle = colors.muted;
  ctx.fillText(fitText(ctx, options.subtitle || "", 700), margin, arcade ? 104 : 118);

  // Score badge
  if (typeof options.score === "number") {
    const bw = 200;
    const bh = 104;
    const bx = POSTER_WIDTH - margin - bw;
    const by = 52;
    roundRect(ctx, bx, by, bw, bh, arcade ? 6 : 18);
    ctx.fillStyle = colors.panel;
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = colors.accent;
    ctx.font = `${arcade ? "700 40px" : "800 48px"} ${display}`;
    ctx.textAlign = "left";
    ctx.fillText(options.rank || "", bx + 22, by + 26);
    ctx.fillStyle = colors.text;
    ctx.font = `800 36px ${sans}`;
    ctx.fillText(String(options.score), bx + 92, by + 18);
    ctx.fillStyle = colors.faint;
    ctx.font = `600 18px ${sans}`;
    ctx.fillText("/ 100 match", bx + 92, by + 62);
  }

  // Grid area
  const slots = [...metrics.activeSlots, ...(metrics.busySlots || [])];
  let days = DAYS.filter(d => slots.some(s => s.day === d));
  if (days.length === 0) days = ["Sun", "Mon", "Tue", "Wed", "Thu"];
  const range = computeHourRange(slots);
  const startHour = range.startHour;
  const endHour = Math.max(DEFAULT_GRID_END_HOUR, range.endHour);
  const hours = endHour - startHour;

  const gridTop = 190;
  const gridBottom = 1060;
  const labelWidth = 74;
  const gridLeft = margin + labelWidth;
  const gridWidth = POSTER_WIDTH - margin - gridLeft;
  const headerHeight = 54;
  const plotTop = gridTop + headerHeight;
  const plotHeight = gridBottom - plotTop;
  const pxPerHour = plotHeight / hours;
  const colWidth = gridWidth / days.length;

  roundRect(ctx, margin, gridTop, POSTER_WIDTH - margin * 2, gridBottom - gridTop, arcade ? 6 : 20);
  ctx.fillStyle = colors.panel;
  ctx.fill();
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Day headers
  ctx.textAlign = "center";
  days.forEach((day, i) => {
    const cx = gridLeft + colWidth * i + colWidth / 2;
    ctx.fillStyle = colors.text;
    ctx.font = `800 22px ${sans}`;
    ctx.fillText(FULL_DAYS[day].slice(0, 3).toUpperCase(), cx, gridTop + 16);
    ctx.fillStyle = colors.faint;
    ctx.font = `600 14px ${sans}`;
    ctx.fillText(FULL_DAYS[day], cx, gridTop + 42);
  });

  // Hour lines and labels
  ctx.textAlign = "right";
  for (let h = 0; h <= hours; h++) {
    const y = plotTop + h * pxPerHour;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gridLeft, y);
    ctx.lineTo(gridLeft + gridWidth, y);
    ctx.stroke();
    if (h < hours) {
      ctx.fillStyle = colors.faint;
      ctx.font = `600 15px ${mono}`;
      ctx.fillText(`${String(startHour + h).padStart(2, "0")}:00`, gridLeft - 10, y + 4);
    }
  }
  // Column separators
  for (let i = 1; i < days.length; i++) {
    const x = gridLeft + colWidth * i;
    ctx.beginPath();
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, gridBottom);
    ctx.stroke();
  }

  const yFor = (mins) => plotTop + ((mins - startHour * 60) / 60) * pxPerHour;

  // Gap bands
  days.forEach((day, i) => {
    const info = metrics.dailyBreakdown[day];
    if (!info || !info.gapIntervals) return;
    info.gapIntervals.forEach(gap => {
      const x = gridLeft + colWidth * i + 6;
      const y = yFor(gap.startMins);
      const h = yFor(gap.endMins) - y;
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = colors.warning;
      ctx.lineWidth = 2;
      roundRect(ctx, x, y + 3, colWidth - 12, Math.max(0, h - 6), 8);
      ctx.stroke();
      ctx.restore();
      if (h > 34) {
        ctx.fillStyle = colors.warning;
        ctx.font = `700 14px ${mono}`;
        ctx.textAlign = "center";
        ctx.fillText(`${gap.durationHours}h gap`, x + (colWidth - 12) / 2, y + h / 2 - 8);
      }
    });
  });

  // Class and busy blocks
  ctx.textAlign = "left";
  slots.forEach(slot => {
    const i = days.indexOf(slot.day);
    if (i === -1) return;
    const x = gridLeft + colWidth * i + 6;
    const y = yFor(slot.startMins) + 2;
    const w = colWidth - 12;
    const h = Math.max(6, yFor(slot.endMins) - yFor(slot.startMins) - 4);
    const color = safeColor(slot.courseColor);

    if (slot.isBusy) {
      roundRect(ctx, x, y, w, h, 8);
      ctx.fillStyle = "rgba(120,120,140,0.25)";
      ctx.fill();
      drawHatch(ctx, x, y, w, h, color);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, w, h, 8);
      ctx.stroke();
    } else {
      roundRect(ctx, x, y, w, h, 8);
      ctx.fillStyle = color;
      ctx.fill();
    }

    ctx.fillStyle = slot.isBusy ? colors.text : "#ffffff";
    ctx.font = `800 17px ${sans}`;
    ctx.fillText(fitText(ctx, slot.courseCode, w - 16), x + 8, y + 8);
    if (h > 44) {
      ctx.font = `600 14px ${sans}`;
      ctx.fillText(fitText(ctx, slot.isBusy ? "busy" : slot.sectionName, w - 16), x + 8, y + 30);
    }
    if (h > 66) {
      ctx.font = `500 13px ${mono}`;
      ctx.fillText(`${slot.startTime}-${slot.endTime}`, x + 8, y + h - 20);
    }
  });

  // Footer: metric chips
  const chips = [
    { label: "Gap hours", value: `${metrics.totalGapHours}h` },
    { label: "Campus time", value: `${metrics.totalCampusHours}h` },
    { label: "Class time", value: `${metrics.totalClassHours}h` },
    { label: "Days off", value: String(metrics.daysOffCount) }
  ];
  const chipTop = 1100;
  const chipGap = 18;
  const chipWidth = (POSTER_WIDTH - margin * 2 - chipGap * (chips.length - 1)) / chips.length;
  chips.forEach((chip, i) => {
    const x = margin + i * (chipWidth + chipGap);
    roundRect(ctx, x, chipTop, chipWidth, 96, arcade ? 6 : 16);
    ctx.fillStyle = colors.panel;
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = colors.faint;
    ctx.font = `600 16px ${sans}`;
    ctx.fillText(chip.label, x + 18, chipTop + 16);
    ctx.fillStyle = colors.text;
    ctx.font = `800 34px ${sans}`;
    ctx.fillText(chip.value, x + 18, chipTop + 42);
  });

  // Badges line
  const badgeText = (metrics.badges || []).map(b => b.text).join("   •   ");
  ctx.fillStyle = colors.success;
  ctx.font = `700 18px ${sans}`;
  ctx.fillText(fitText(ctx, badgeText, POSTER_WIDTH - margin * 2), margin, 1226);

  // Footer note
  ctx.fillStyle = colors.faint;
  ctx.font = `600 16px ${sans}`;
  ctx.fillText("Made with UniSchedule · ahd-aljadeed.github.io/class-scheduler", margin, 1290);

  return canvas;
}
