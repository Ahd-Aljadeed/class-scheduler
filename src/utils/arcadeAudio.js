// Arcade Sound Synthesizer using Web Audio API
// No external asset loading required - 100% self-contained 8-bit sound engine!

class ArcadeAudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.loadState();
  }

  loadState() {
    // This runs at module-evaluation time, so an exception here stops the whole
    // app from booting. A non-JSON value in that key (hand-edited, or left by
    // another page on the same origin) used to be enough to do exactly that.
    try {
      if (typeof localStorage === "undefined") return;
      const saved = localStorage.getItem("unischedule_sound_muted");
      this.isMuted = saved ? JSON.parse(saved) === true : false;
    } catch (e) {
      this.isMuted = false;
    }
  }

  saveState() {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem("unischedule_sound_muted", JSON.stringify(this.isMuted));
    } catch (e) {
      // Storage can be unavailable (private mode, blocked cookies) — muting
      // simply does not persist, which must not break playback.
    }
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.saveState();
    return this.isMuted;
  }

  isSoundEnabled() {
    if (this.isMuted) return false;
    if (typeof document !== "undefined" && document.documentElement) {
      const mode = document.documentElement.getAttribute("data-mode") || "arcade";
      if (mode !== "arcade") return false;
    }
    return true;
  }

  // 1. Short retro click / blip sound
  playClick() {
    if (!this.isSoundEnabled()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.04);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {
      // Audio context policy fallback
    }
  }

  // 2. Section select / toggle retro chime
  playSelect() {
    if (!this.isSoundEnabled()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25]; // C5 -> E5

      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + i * 0.05;

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.07, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.06);
      });
    } catch (e) {}
  }

  // 3. Power-up / Auto-Fix / Schedule optimizer sound
  playAutoFix() {
    if (!this.isSoundEnabled()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C4, E4, G4, C5, E5, G5

      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + i * 0.04;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.12, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.08);
      });
    } catch (e) {}
  }

  // 4. Retro Warning / Conflict buzz sound
  playConflict() {
    if (!this.isSoundEnabled()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.18);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch (e) {}
  }

  // 5. Classic Arcade "Insert Coin / Game Start" theme switch sound
  playThemeSwitch() {
    if (!this.isSoundEnabled()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [440.00, 554.37, 659.25, 880.00]; // A4, C#5, E5, A5

      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + i * 0.06;

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.08, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.09);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.09);
      });
    } catch (e) {}
  }

  // 6. Level Up / Victory fanfare
  playVictory() {
    if (!this.isSoundEnabled()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const sequence = [
        { freq: 523.25, duration: 0.08, delay: 0 },    // C5
        { freq: 659.25, duration: 0.08, delay: 0.08 }, // E5
        { freq: 783.99, duration: 0.08, delay: 0.16 }, // G5
        { freq: 1046.50, duration: 0.25, delay: 0.24 } // C6
      ];

      sequence.forEach((note) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + note.delay;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, startTime);

        gain.gain.setValueAtTime(0.12, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + note.duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + note.duration);
      });
    } catch (e) {}
  }
}

export const arcadeAudio = new ArcadeAudioEngine();
