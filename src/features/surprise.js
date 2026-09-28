/**
 * "Surprise me": a slot-machine spin through the valid schedules that lands on
 * a random one and applies it.
 */

import { arcadeAudio } from "../utils/arcadeAudio.js";
import { showAlert } from "../utils/customModal.js";

const SPIN_MS = 1500;

export function initSurprise(app) {
  const btn = document.getElementById("btn-surprise");
  if (!btn) return;
  btn.addEventListener("click", () => runSurprise(app));
}

export function runSurprise(app) {
  if (app._surpriseTimer) return;

  const combos = app.getListedCombos();
  if (!combos || combos.length === 0) {
    showAlert("Add a few courses first, then let fate pick a schedule.", "Nothing to spin");
    return;
  }

  const ticker = document.getElementById("surprise-ticker");
  const pick = () => combos[Math.floor(Math.random() * combos.length)];
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const finish = (combo) => {
    app._surpriseTimer = null;
    app.setComboPreview(null);
    app.applyCombination(combo);
    if (ticker) {
      ticker.textContent = "🎉 The wheel has spoken. Schedule applied!";
      ticker.classList.remove("hidden");
      setTimeout(() => ticker.classList.add("hidden"), 2500);
    }
  };

  if (reducedMotion || combos.length === 1) {
    finish(pick());
    return;
  }

  const started = performance.now();
  const step = () => {
    const elapsed = performance.now() - started;
    if (elapsed >= SPIN_MS) {
      finish(pick());
      return;
    }
    const combo = pick();
    app.setComboPreview(combo.selectionMap);
    if (ticker) {
      ticker.textContent = `🎰 Rolling… ${combo.metrics.totalGapHours}h gaps · ${combo.metrics.daysOffCount} days off · ${combo.metrics.totalCampusHours}h on campus`;
      ticker.classList.remove("hidden");
    }
    arcadeAudio.playTick();
    // Ease out: ticks start fast and slow down as the reel settles.
    const delay = 60 + (elapsed / SPIN_MS) * 240;
    app._surpriseTimer = setTimeout(step, delay);
  };
  step();
}
