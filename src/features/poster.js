/**
 * Poster export: renders the current timetable to a PNG for sharing.
 */

import { drawPoster } from "../utils/poster.js";
import { arcadeAudio } from "../utils/arcadeAudio.js";
import { showAlert } from "../utils/customModal.js";

function canShareFiles() {
  try {
    if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
    const probe = new File([new Uint8Array([0])], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (e) {
    return false;
  }
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
    } catch (e) {
      reject(e);
    }
  });
}

export function initPoster(app) {
  const els = {
    overlay: document.getElementById("poster-modal-overlay"),
    btnOpen: document.getElementById("btn-poster"),
    btnClose: document.getElementById("btn-close-poster-modal"),
    wrapper: document.getElementById("poster-canvas-wrapper"),
    btnDownload: document.getElementById("btn-download-poster"),
    btnShare: document.getElementById("btn-share-poster")
  };
  if (!els.overlay || !els.btnOpen) return;

  let canvas = null;
  const close = () => els.overlay.classList.add("hidden");

  const fileName = () => {
    const name = app.activePerson.name.replace(/[^\w-]+/g, "_").slice(0, 24) || "schedule";
    return `UniSchedule-${name}.png`;
  };

  els.btnOpen.addEventListener("click", async () => {
    arcadeAudio.playClick();
    const metrics = app.getCurrentMetrics();
    if (metrics.activeSlots.length === 0) {
      await showAlert("Pick at least one section first, then share the result.", "Nothing to share yet");
      return;
    }
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (e) { /* fonts are optional */ }

    const score = app.getCurrentScore();
    const person = app.activePerson;
    canvas = drawPoster({
      title: "UniSchedule",
      subtitle: person.id === "me" ? "My timetable" : `${person.name}'s timetable`,
      metrics,
      score: score ? score.score : null,
      rank: score ? score.rank : null,
      mode: app.currentMode,
      theme: app.currentTheme
    });
    canvas.className = "poster-canvas";
    els.wrapper.replaceChildren(canvas);
    els.btnShare.classList.toggle("hidden", !canShareFiles());
    els.overlay.classList.remove("hidden");
  });

  els.btnClose.addEventListener("click", () => { arcadeAudio.playClick(); close(); });
  els.overlay.addEventListener("click", (e) => { if (e.target === els.overlay) close(); });

  els.btnDownload.addEventListener("click", async () => {
    if (!canvas) return;
    arcadeAudio.playSelect();
    try {
      const blob = await toBlob(canvas);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (e) {
      await showAlert("Your browser could not produce the image.", "Download failed");
    }
  });

  els.btnShare.addEventListener("click", async () => {
    if (!canvas) return;
    arcadeAudio.playSelect();
    try {
      const blob = await toBlob(canvas);
      const file = new File([blob], fileName(), { type: "image/png" });
      await navigator.share({ files: [file], title: "My timetable", text: "Made with UniSchedule" });
    } catch (e) {
      // The share sheet was dismissed, or sharing is not available after all.
    }
  });
}
