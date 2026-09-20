import confetti from 'canvas-confetti';
import { INITIAL_COURSES, PALETTE_COLORS } from './data/sampleCourses.js';
import {
  DAYS,
  FULL_DAYS,
  MAX_COMBINATIONS,
  timeToMinutes,
  format12h,
  getSectionConflicts,
  calculateScheduleMetrics,
  generateAllCombinations,
  generateICS
} from './utils/scheduler.js';
import { parseRawTextToCourses } from './utils/parser.js';
import { arcadeAudio } from './utils/arcadeAudio.js';
import { showAlert, showConfirm, installGlobalAlertOverrides } from './utils/customModal.js';
import { escapeHtml, safeColor } from './utils/sanitize.js';
import { sanitizeCourses, sanitizeSelections, LIMITS } from './utils/validate.js';

export function getIconSvg(name, size = 14, className = "") {
  const classAttr = className ? ` class="${className}"` : '';
  const sizeAttr = `width="${size}" height="${size}"`;
  const base = `<svg ${sizeAttr}${classAttr} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`;

  switch (name) {
    case 'map-pin':
    case 'pin':
      return `${base}<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
    case 'clock':
      return `${base}<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    case 'calendar-off':
      return `${base}<path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><path d="M14 2v6h6"/><path d="m3 3 18 18"/></svg>`;
    case 'calendar':
      return `${base}<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`;
    case 'sun':
      return `${base}<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
    case 'check-circle':
    case 'check':
      return `${base}<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    case 'alert-triangle':
    case 'alert':
      return `${base}<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    case 'zap':
      return `${base}<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    case 'building':
    case 'campus':
      return `${base}<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    case 'coffee':
      return `${base}<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>`;
    default:
      return `${base}<circle cx="12" cy="12" r="10"/></svg>`;
  }
}


// LOCAL STORAGE KEYS
const STORAGE_KEY_COURSES = "unischedule_courses_v3";
const STORAGE_KEY_SELECTIONS = "unischedule_selections_v3";
const STORAGE_KEY_MODE = "unischedule_mode_v1";
const STORAGE_KEY_THEME = "unischedule_theme_v1";
const STORAGE_KEY_WELCOME_SEEN = "unischedule_welcome_seen_v1";

/** How many combination cards are actually built in the DOM at once. */
const RENDERED_COMBO_LIMIT = 100;
/** Delay before a search keystroke triggers a re-render of the course list. */
const SEARCH_DEBOUNCE_MS = 130;

class UniScheduleApp {
  constructor() {
    this.courses = this.loadCourses();
    this.selectedSectionsMap = this.loadSelections();
    this.hoveredSection = null;

    // Lookup indexes + memoized combination results. Rebuilt only when the
    // course list itself changes, via invalidateCourseIndex().
    this.courseBySectionId = new Map();
    this.sectionById = new Map();
    this.courseById = new Map();
    this._combinationsCache = null;
    this.invalidateCourseIndex();
    this.showWeekends = true; // Default to showing weekends (Sun) as user has Sun classes
    this.sortPreference = 'gaps'; // 'gaps' | 'daysoff' | 'mornings' | 'spread'
    this.currentMode = this.loadMode();
    this.currentTheme = this.loadTheme();
    this.currentMobilePanel = 'schedule'; // 'courses' | 'schedule' | 'analytics'
    this.currentDayFilter = 'ALL'; // 'ALL' | 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'

    this.initElements();
    this.applyMode(this.currentMode);
    this.applyTheme(this.currentTheme);
    this.switchMobilePanel(this.currentMobilePanel);
    this.initEventListeners();

    this.initCustomCourseFormState();
    this.render();

    // Automatically show welcome guide on first visit
    this.checkWelcomeOnFirstVisit();
  }

  // CUSTOM COURSE SECTION BUILDER STATE & RENDER
  initCustomCourseFormState() {
    this.customFormSections = [
      {
        name: "Sec 01",
        instructor: "",
        location: "",
        slots: [
          { day: "Mon", startTime: "09:00", endTime: "10:30" }
        ]
      }
    ];
    this.renderCustomFormSections();
  }

  renderCustomFormSections() {
    const container = document.getElementById("sections-builder-container");
    if (!container) return;
    container.innerHTML = "";

    this.customFormSections.forEach((sec, secIdx) => {
      const card = document.createElement("div");
      card.className = "section-builder-card";

      const canRemoveSec = this.customFormSections.length > 1;

      card.innerHTML = `
        <div class="section-card-header">
          <span class="section-card-number">Section #${secIdx + 1}</span>
          ${canRemoveSec ? `<button type="button" class="btn btn-ghost icon-only btn-sm btn-remove-section" data-sec-idx="${secIdx}" title="Remove Section">&times;</button>` : ''}
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Section Name <span class="required-asterisk">*</span></label>
            <input type="text" class="input-sec-name" data-sec-idx="${secIdx}" value="${escapeHtml(sec.name)}" placeholder="e.g. Sec 01" required />
          </div>
          <div class="form-group">
            <label>Instructor <span class="optional-tag">(optional)</span></label>
            <input type="text" class="input-sec-instructor" data-sec-idx="${secIdx}" value="${escapeHtml(sec.instructor)}" placeholder="e.g. Dr. Turing" />
          </div>
          <div class="form-group full-width">
            <label>Location / Room <span class="optional-tag">(optional)</span></label>
            <input type="text" class="input-sec-location" data-sec-idx="${secIdx}" value="${escapeHtml(sec.location)}" placeholder="e.g. Science Bldg 101" />
          </div>
        </div>

        <div class="schedule-slots-header">
          <label class="slots-label">Class Schedule Days & Times <span class="required-asterisk">*</span></label>
          <button type="button" class="btn btn-xs btn-outline btn-add-time-slot" data-sec-idx="${secIdx}">+ Add Day & Time</button>
        </div>

        <div class="time-slots-container">
          ${sec.slots.map((slot, slotIdx) => `
            <div class="time-slot-row">
              <select class="input-slot-day" data-sec-idx="${secIdx}" data-slot-idx="${slotIdx}" required>
                ${DAYS.map(d => `<option value="${d}" ${slot.day === d ? 'selected' : ''}>${FULL_DAYS[d]}</option>`).join("")}
              </select>
              <div class="time-input-group">
                <span class="time-label">Start:</span>
                <input type="time" class="input-slot-start" data-sec-idx="${secIdx}" data-slot-idx="${slotIdx}" value="${slot.startTime}" required />
              </div>
              <div class="time-input-group">
                <span class="time-label">End:</span>
                <input type="time" class="input-slot-end" data-sec-idx="${secIdx}" data-slot-idx="${slotIdx}" value="${slot.endTime}" required />
              </div>
              ${sec.slots.length > 1 ? `<button type="button" class="btn btn-ghost icon-only btn-xs btn-remove-time-slot" data-sec-idx="${secIdx}" data-slot-idx="${slotIdx}" title="Remove Day">&times;</button>` : ''}
            </div>
          `).join("")}
        </div>
      `;

      // Sync text inputs
      const secNameInp = card.querySelector(".input-sec-name");
      const instInp = card.querySelector(".input-sec-instructor");
      const locInp = card.querySelector(".input-sec-location");

      ['input', 'change'].forEach(evt => {
        if (secNameInp) secNameInp.addEventListener(evt, (e) => { this.customFormSections[secIdx].name = e.target.value; });
        if (instInp) instInp.addEventListener(evt, (e) => { this.customFormSections[secIdx].instructor = e.target.value; });
        if (locInp) locInp.addEventListener(evt, (e) => { this.customFormSections[secIdx].location = e.target.value; });
      });

      // Time slot inputs
      card.querySelectorAll(".input-slot-day").forEach(sel => {
        ['input', 'change'].forEach(evt => {
          sel.addEventListener(evt, (e) => {
            const slotIdx = parseInt(e.target.dataset.slotIdx);
            if (this.customFormSections[secIdx]?.slots[slotIdx]) {
              this.customFormSections[secIdx].slots[slotIdx].day = e.target.value;
            }
          });
        });
      });
      card.querySelectorAll(".input-slot-start").forEach(inp => {
        ['input', 'change'].forEach(evt => {
          inp.addEventListener(evt, (e) => {
            const slotIdx = parseInt(e.target.dataset.slotIdx);
            if (this.customFormSections[secIdx]?.slots[slotIdx]) {
              this.customFormSections[secIdx].slots[slotIdx].startTime = e.target.value;
            }
          });
        });
      });
      card.querySelectorAll(".input-slot-end").forEach(inp => {
        ['input', 'change'].forEach(evt => {
          inp.addEventListener(evt, (e) => {
            const slotIdx = parseInt(e.target.dataset.slotIdx);
            if (this.customFormSections[secIdx]?.slots[slotIdx]) {
              this.customFormSections[secIdx].slots[slotIdx].endTime = e.target.value;
            }
          });
        });
      });

      // Remove section button
      const btnRemoveSec = card.querySelector(".btn-remove-section");
      if (btnRemoveSec) {
        btnRemoveSec.addEventListener("click", () => {
          arcadeAudio.playClick();
          this.customFormSections.splice(secIdx, 1);
          this.renderCustomFormSections();
        });
      }

      // Add time slot button
      const btnAddSlot = card.querySelector(".btn-add-time-slot");
      if (btnAddSlot) {
        btnAddSlot.addEventListener("click", () => {
          arcadeAudio.playClick();
          const dayOptions = ["Wed", "Fri", "Tue", "Thu"];
          const nextDay = dayOptions[this.customFormSections[secIdx].slots.length % dayOptions.length] || "Wed";
          this.customFormSections[secIdx].slots.push({
            day: nextDay,
            startTime: "11:00",
            endTime: "12:30"
          });
          this.renderCustomFormSections();
        });
      }

      // Remove time slot button
      card.querySelectorAll(".btn-remove-time-slot").forEach(btn => {
        btn.addEventListener("click", (e) => {
          arcadeAudio.playClick();
          const slotIdx = parseInt(e.currentTarget.dataset.slotIdx);
          this.customFormSections[secIdx].slots.splice(slotIdx, 1);
          this.renderCustomFormSections();
        });
      });

      container.appendChild(card);
    });
  }

  /**
   * Rebuilds the id -> object lookup tables and drops the memoized combination
   * results. Must be called after any mutation of `this.courses`.
   *
   * These indexes replace repeated `courses.find(c => c.sections.some(...))`
   * scans, which were O(courses x sections) per lookup and ran inside loops.
   */
  invalidateCourseIndex() {
    this.courseBySectionId = new Map();
    this.sectionById = new Map();
    this.courseById = new Map();

    this.courses.forEach((course) => {
      this.courseById.set(course.id, course);
      course.sections.forEach((section) => {
        this.courseBySectionId.set(section.id, course);
        this.sectionById.set(section.id, section);
      });
    });

    this._combinationsCache = null;
  }

  /**
   * Memoized combination search. The valid-combination set depends only on the
   * courses, never on the current selection, so clicking a section must not
   * trigger a recompute.
   */
  getCombinations() {
    if (!this._combinationsCache) {
      this._combinationsCache = generateAllCombinations(this.courses, this.courseBySectionId);
    }
    return this._combinationsCache;
  }

  // LOAD / SAVE PERSISTENCE
  loadMode() {
    return localStorage.getItem(STORAGE_KEY_MODE) || 'arcade';
  }

  applyMode(mode) {
    this.currentMode = mode;
    document.documentElement.setAttribute("data-mode", mode);
    localStorage.setItem(STORAGE_KEY_MODE, mode);

    const elArcadeIcon = document.getElementById("mode-icon-arcade");
    const elRegularIcon = document.getElementById("mode-icon-regular");

    if (elArcadeIcon) elArcadeIcon.classList.toggle("hidden", mode !== "arcade");
    if (elRegularIcon) elRegularIcon.classList.toggle("hidden", mode !== "regular");
  }

  toggleMode() {
    const nextMode = this.currentMode === 'arcade' ? 'regular' : 'arcade';
    this.applyMode(nextMode);
    arcadeAudio.playThemeSwitch();
  }

  loadTheme() {
    return localStorage.getItem(STORAGE_KEY_THEME) || 'dark';
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY_THEME, theme);

    const elSun = document.getElementById("theme-icon-sun");
    const elMoon = document.getElementById("theme-icon-moon");

    if (elSun) elSun.classList.toggle("hidden", theme !== "light");
    if (elMoon) elMoon.classList.toggle("hidden", theme !== "dark");
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
    arcadeAudio.playClick();
  }

  loadCourses() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COURSES);
      if (saved) {
        // Persisted data is untrusted: validate its shape before it can reach
        // the render pipeline or the metrics maths.
        const clean = sanitizeCourses(JSON.parse(saved));
        if (clean.length > 0) return clean;
      }
    } catch (e) {
      console.error("Failed to parse saved courses", e);
    }
    return JSON.parse(JSON.stringify(INITIAL_COURSES));
  }

  saveCourses() {
    // Every course mutation funnels through here, so this is the one place the
    // lookup indexes and the combination cache need refreshing.
    this.invalidateCourseIndex();
    try {
      localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(this.courses));
    } catch (e) {
      console.error("Failed to save courses", e);
    }
  }

  loadSelections() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SELECTIONS);
      if (saved) {
        // Drops any pair that does not resolve to a real course + section.
        return sanitizeSelections(JSON.parse(saved), this.courses);
      }
    } catch (e) {
      console.error("Failed to parse saved selections", e);
    }
    return {};
  }

  saveSelections() {
    try {
      localStorage.setItem(STORAGE_KEY_SELECTIONS, JSON.stringify(this.selectedSectionsMap));
    } catch (e) {
      console.error("Failed to save selections", e);
    }
  }

  initElements() {
    this.elCourseList = document.getElementById("course-section-list");
    this.elSearchInput = document.getElementById("course-search-input");
    this.elSelectedCount = document.getElementById("courses-selected-count");
    this.elTimetableGrid = document.getElementById("timetable-grid");
    this.elToggleWeekends = document.getElementById("toggle-weekends");

    // Conflict Banner
    this.elConflictBanner = document.getElementById("conflict-banner");
    this.elConflictBannerText = document.getElementById("conflict-banner-text");
    this.btnResolveConflict = document.getElementById("btn-resolve-conflict");

    // Analytics
    this.elStatGapHours = document.getElementById("stat-gap-hours");
    this.elStatGapBadge = document.getElementById("stat-gap-badge");
    this.elStatCampusHours = document.getElementById("stat-campus-hours");
    this.elStatClassHours = document.getElementById("stat-class-hours");
    this.elStatDaysOff = document.getElementById("stat-days-off");
    this.elBadgesContainer = document.getElementById("schedule-badges-container");
    this.elDailyBreakdownList = document.getElementById("daily-breakdown-list");

    // Header Actions & Buttons
    this.btnAutoCombos = document.getElementById("btn-auto-combinations");
    this.badgeCombosCount = document.getElementById("valid-combos-count-badge");
    this.btnImportModal = document.getElementById("btn-import-modal");
    this.btnExportICal = document.getElementById("btn-export-ical");
    this.btnResetDemo = document.getElementById("btn-reset-demo");
    this.btnModeToggle = document.getElementById("btn-mode-toggle");
    this.btnThemeToggle = document.getElementById("btn-theme-toggle");
    this.btnSoundToggle = document.getElementById("btn-sound-toggle");
    this.elSoundIcon = document.getElementById("sound-icon");

    if (this.elSoundIcon) {
      this.elSoundIcon.textContent = arcadeAudio.isMuted ? "🔇" : "🔊";
    }

    // Drawers & Modals
    this.elDrawerOverlay = document.getElementById("combinations-drawer-overlay");
    this.btnCloseDrawer = document.getElementById("btn-close-drawer");
    this.elCombinationsList = document.getElementById("combinations-list");
    this.elComboSummaryText = document.getElementById("combo-summary-text");

    this.elModalOverlay = document.getElementById("import-modal-overlay");
    this.btnCloseModal = document.getElementById("btn-close-modal");
    this.elImportTextarea = document.getElementById("import-textarea");
    this.btnLoadSampleText = document.getElementById("btn-load-sample-text");
    this.btnParseImport = document.getElementById("btn-parse-import");
    this.formManualCourse = document.getElementById("manual-course-form");

    // Welcome Modal
    this.elWelcomeOverlay = document.getElementById("welcome-modal-overlay");
    this.btnCloseWelcomeModal = document.getElementById("btn-close-welcome-modal");
    this.btnStartExploring = document.getElementById("btn-start-exploring");
    this.btnWelcomeModal = document.getElementById("btn-welcome-modal");
    this.welcomeSelectArcade = document.getElementById("welcome-select-arcade");
    this.welcomeSelectRegular = document.getElementById("welcome-select-regular");

    // Mobile Layout & Navigation
    this.elMainGrid = document.querySelector(".app-main-grid");
    this.elMobileBottomNav = document.getElementById("mobile-bottom-nav");
    this.elMobileDaySwitcher = document.getElementById("mobile-day-switcher");
    this.elMobileCoursesBadge = document.getElementById("mobile-courses-badge");

    // Event Details Bottom Sheet Modal
    this.elEventDetailsOverlay = document.getElementById("event-details-overlay");
    this.btnCloseEventSheet = document.getElementById("btn-close-event-sheet");
    this.btnSheetDeselect = document.getElementById("btn-sheet-deselect");
    this.sheetCourseCode = document.getElementById("sheet-course-code");
    this.sheetCourseTitle = document.getElementById("sheet-course-title");
    this.sheetSectionName = document.getElementById("sheet-section-name");
    this.sheetInstructor = document.getElementById("sheet-instructor");
    this.sheetLocation = document.getElementById("sheet-location");
    this.sheetTimeSlot = document.getElementById("sheet-time-slot");
    this.sheetGapInfo = document.getElementById("sheet-gap-info");
    this.sheetGapDuration = document.getElementById("sheet-gap-duration");

    this.activeSheetCourseId = null;
    this.activeSheetSectionId = null;
  }

  initEventListeners() {
    // Search Filter — debounced so a fast typist does not rebuild the whole
    // course list on every keystroke.
    if (this.elSearchInput) {
      let searchTimer = null;
      this.elSearchInput.addEventListener("input", () => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => this.renderCourseList(), SEARCH_DEBOUNCE_MS);
      });
    }

    // Combination cards use one delegated listener on the list container
    // instead of one listener per rendered card.
    if (this.elCombinationsList) {
      this.elCombinationsList.addEventListener("click", (e) => {
        const applyBtn = e.target.closest(".btn-apply-combo");
        if (!applyBtn) return;
        const card = applyBtn.closest(".combo-card");
        if (!card) return;

        const combo = this._visibleCombos && this._visibleCombos[Number(card.dataset.comboIdx)];
        if (!combo) return;

        arcadeAudio.playVictory();
        this.selectedSectionsMap = { ...combo.selectionMap };
        this.saveSelections();
        this.render();
        this.renderCombinationsDrawer();
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
      });
    }

    // Mode toggle (Arcade vs Regular)
    if (this.btnModeToggle) {
      this.btnModeToggle.addEventListener("click", () => this.toggleMode());
    }

    // Theme toggle (Dark vs Light)
    if (this.btnThemeToggle) {
      this.btnThemeToggle.addEventListener("click", () => this.toggleTheme());
    }

    // Sound toggle
    if (this.btnSoundToggle) {
      this.btnSoundToggle.addEventListener("click", () => {
        const isMuted = arcadeAudio.toggleMute();
        if (this.elSoundIcon) this.elSoundIcon.textContent = isMuted ? "🔇" : "🔊";
        if (!isMuted) arcadeAudio.playClick();
      });
    }

    // Reset Demo / Clear All
    if (this.btnResetDemo) {
      this.btnResetDemo.addEventListener("click", async () => {
        arcadeAudio.playClick();
        const confirmed = await showConfirm("Clear all courses and start fresh?", "Clear All Courses");
        if (confirmed) {
          this.courses = JSON.parse(JSON.stringify(INITIAL_COURSES));
          this.selectedSectionsMap = {};
          this.courses.forEach(c => {
            if (c.sections[0]) this.selectedSectionsMap[c.id] = c.sections[0].id;
          });
          this.saveCourses();
          this.saveSelections();
          this.render();
        }
      });
    }

    // Resolve Conflict Button
    if (this.btnResolveConflict) {
      this.btnResolveConflict.addEventListener("click", () => {
        arcadeAudio.playAutoFix();
        this.openAutoCombinationsDrawer();
      });
    }

    // Auto-Combinations Drawer
    if (this.btnAutoCombos) {
      this.btnAutoCombos.addEventListener("click", () => {
        arcadeAudio.playAutoFix();
        this.openAutoCombinationsDrawer();
      });
    }
    if (this.btnCloseDrawer) {
      this.btnCloseDrawer.addEventListener("click", () => {
        arcadeAudio.playClick();
        if (this.elDrawerOverlay) this.elDrawerOverlay.classList.add("hidden");
      });
    }
    if (this.elDrawerOverlay) {
      this.elDrawerOverlay.addEventListener("click", (e) => {
        if (e.target === this.elDrawerOverlay) this.elDrawerOverlay.classList.add("hidden");
      });
    }

    // Sort Filter Tabs in Drawer
    document.querySelectorAll(".filter-tab").forEach(btn => {
      btn.addEventListener("click", (e) => {
        arcadeAudio.playClick();
        document.querySelectorAll(".filter-tab").forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        this.sortPreference = e.target.dataset.sort;
        this.renderCombinationsDrawer();
      });
    });

    // Import Modal
    if (this.btnImportModal) {
      this.btnImportModal.addEventListener("click", () => {
        arcadeAudio.playClick();
        if (this.elModalOverlay) this.elModalOverlay.classList.remove("hidden");
      });
    }
    if (this.btnCloseModal) {
      this.btnCloseModal.addEventListener("click", () => {
        arcadeAudio.playClick();
        if (this.elModalOverlay) this.elModalOverlay.classList.add("hidden");
      });
    }
    if (this.elModalOverlay) {
      this.elModalOverlay.addEventListener("click", (e) => {
        if (e.target === this.elModalOverlay) this.elModalOverlay.classList.add("hidden");
      });
    }

    // Modal Tabs
    document.querySelectorAll(".modal-tab").forEach(tab => {
      tab.addEventListener("click", (e) => {
        arcadeAudio.playClick();
        document.querySelectorAll(".modal-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
        e.target.classList.add("active");
        const pane = document.getElementById(`tab-${e.target.dataset.tab}`);
        if (pane) pane.classList.add("active");
      });
    });

    // Load Sample Text
    if (this.btnLoadSampleText) {
      this.btnLoadSampleText.addEventListener("click", () => {
        arcadeAudio.playClick();
        if (this.elImportTextarea) {
          this.elImportTextarea.value = `CS101 Intro to Computer Science\nSec 01 - Dr. Turing - Mon/Wed 09:00-10:30 Tech Bldg 101\nSec 02 - Grace Hopper - Tue/Thu 11:00-12:30 Tech Bldg 102\n\nMATH201 Calculus II\nSec 01: Mon/Wed 11:00-12:30 Math Hall 301\nSec 02: Tue/Thu 09:00-10:30 Math Hall 304`;
        }
      });
    }

    // Parse Import Text
    if (this.btnParseImport) {
      this.btnParseImport.addEventListener("click", async () => {
        const rawText = this.elImportTextarea ? this.elImportTextarea.value : "";
        const parsed = parseRawTextToCourses(rawText);
        if (parsed.length === 0) {
          await showAlert("Could not parse valid course details. Please ensure day and time formats (e.g. Mon 09:00-10:30) are included.", "Import Error");
          return;
        }
        const room = LIMITS.MAX_COURSES - this.courses.length;
        if (room <= 0) {
          await showAlert(`You already have the maximum of ${LIMITS.MAX_COURSES} courses. Remove some before importing more.`, "Course Limit Reached");
          return;
        }

        const accepted = parsed.slice(0, room);
        this.courses = [...this.courses, ...accepted];
        accepted.forEach(c => {
          if (c.sections[0]) this.selectedSectionsMap[c.id] = c.sections[0].id;
        });
        this.saveCourses();
        this.saveSelections();
        if (this.elModalOverlay) this.elModalOverlay.classList.add("hidden");
        this.render();
      });
    }

    // Add Section button in Header
    const btnAddSection = document.getElementById("btn-add-section");
    if (btnAddSection) {
      btnAddSection.addEventListener("click", () => {
        arcadeAudio.playClick();
        const nextNum = this.customFormSections.length + 1;
        this.customFormSections.push({
          name: `Sec 0${nextNum}`,
          instructor: "",
          location: "",
          slots: [
            { day: "Mon", startTime: "09:00", endTime: "10:30" }
          ]
        });
        this.renderCustomFormSections();
      });
    }

    // Manual Course Form Submit
    if (this.formManualCourse) {
      this.formManualCourse.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Sync DOM input values directly into customFormSections before validation & submission
        const sectionCards = document.querySelectorAll("#sections-builder-container .section-builder-card");
        sectionCards.forEach((card, secIdx) => {
          if (!this.customFormSections[secIdx]) return;
          const nameInp = card.querySelector(".input-sec-name");
          const instInp = card.querySelector(".input-sec-instructor");
          const locInp = card.querySelector(".input-sec-location");
          if (nameInp) this.customFormSections[secIdx].name = nameInp.value;
          if (instInp) this.customFormSections[secIdx].instructor = instInp.value;
          if (locInp) this.customFormSections[secIdx].location = locInp.value;

          const slotRows = card.querySelectorAll(".time-slot-row");
          slotRows.forEach((row, slotIdx) => {
            if (!this.customFormSections[secIdx].slots[slotIdx]) return;
            const daySel = row.querySelector(".input-slot-day");
            const startInp = row.querySelector(".input-slot-start");
            const endInp = row.querySelector(".input-slot-end");
            if (daySel) this.customFormSections[secIdx].slots[slotIdx].day = daySel.value;
            if (startInp) this.customFormSections[secIdx].slots[slotIdx].startTime = startInp.value;
            if (endInp) this.customFormSections[secIdx].slots[slotIdx].endTime = endInp.value;
          });
        });

        const titleEl = document.getElementById("manual-title");
        const codeEl = document.getElementById("manual-code");
        const colorEl = document.getElementById("manual-color");

        const title = titleEl ? titleEl.value.trim() : "";
        let code = codeEl ? codeEl.value.trim().toUpperCase() : "";
        const color = colorEl ? colorEl.value || "#6366f1" : "#6366f1";

        if (!title) {
          await showAlert("Please enter a Course Title.", "Missing Title");
          return;
        }

        if (!code) {
          // Auto-generate a short code if optional code was omitted
          const words = title.split(/\s+/).filter(Boolean);
          if (words.length === 1) {
            code = words[0].substring(0, 4).toUpperCase() + " 101";
          } else {
            code = words.map(w => w[0]).join("").toUpperCase() + " 101";
          }
        }

        if (this.customFormSections.length === 0) {
          await showAlert("Please add at least 1 section for the course.", "Missing Section");
          return;
        }

        // Find existing course or create new
        let course = this.courses.find(c => c.code === code || c.title.toLowerCase() === title.toLowerCase());
        if (!course) {
          course = {
            id: `course-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            code,
            title,
            color,
            sections: []
          };
          this.courses.push(course);
        }

        // Validate all sections have required valid schedule times
        for (let idx = 0; idx < this.customFormSections.length; idx++) {
          const sec = this.customFormSections[idx];
          const secName = sec.name.trim() || `Sec 0${idx + 1}`;
          const validTimes = sec.slots.filter(s => s.day && s.startTime && s.endTime);

          if (validTimes.length === 0) {
            await showAlert(`Please specify at least 1 valid class day and time schedule for "${secName}".`, "Missing Schedule");
            return;
          }
        }

        // Process all sections from builder
        this.customFormSections.forEach((sec, idx) => {
          const secName = sec.name.trim() || `Sec 0${idx + 1}`;
          const instructor = sec.instructor.trim() || "Staff";
          const location = sec.location.trim() || "Campus";

          const validTimes = sec.slots.filter(s => s.day && s.startTime && s.endTime).map(s => ({
            day: s.day,
            startTime: s.startTime,
            endTime: s.endTime
          }));

          const newSec = {
            id: `sec-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
            name: secName,
            instructor,
            location,
            times: validTimes
          };

          course.sections.push(newSec);
          if (idx === 0 || !this.selectedSectionsMap[course.id]) {
            this.selectedSectionsMap[course.id] = newSec.id;
          }
        });

        this.saveCourses();
        this.saveSelections();

        // Reset form state & close modal
        this.formManualCourse.reset();
        this.initCustomCourseFormState();
        if (this.elModalOverlay) this.elModalOverlay.classList.add("hidden");
        arcadeAudio.playVictory();
        this.render();
      });
    }

    // Export iCal
    if (this.btnExportICal) {
      this.btnExportICal.addEventListener("click", async () => {
        const selectedSecs = this.getSelectedSections();
        if (selectedSecs.length === 0) {
          await showAlert("Please select at least one course section to export.", "Export iCal");
          return;
        }
        const icsData = generateICS(selectedSecs, this.courses);
        const blob = new Blob([icsData], { type: "text/calendar;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "UniSchedule.ics";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }

    // Welcome Modal Listeners
    if (this.btnWelcomeModal) {
      this.btnWelcomeModal.addEventListener("click", () => {
        arcadeAudio.playClick();
        this.openWelcomeModal();
      });
    }
    if (this.btnCloseWelcomeModal) {
      this.btnCloseWelcomeModal.addEventListener("click", () => {
        arcadeAudio.playClick();
        this.closeWelcomeModal();
      });
    }
    if (this.btnStartExploring) {
      this.btnStartExploring.addEventListener("click", () => {
        arcadeAudio.playClick();
        this.closeWelcomeModal();
      });
    }
    if (this.elWelcomeOverlay) {
      this.elWelcomeOverlay.addEventListener("click", (e) => {
        if (e.target === this.elWelcomeOverlay) this.closeWelcomeModal();
      });
    }
    if (this.welcomeSelectArcade) {
      this.welcomeSelectArcade.addEventListener("click", () => {
        this.applyMode('arcade');
        arcadeAudio.playThemeSwitch();
        this.updateWelcomeVibeCards();
      });
    }
    if (this.welcomeSelectRegular) {
      this.welcomeSelectRegular.addEventListener("click", () => {
        this.applyMode('regular');
        arcadeAudio.playThemeSwitch();
        this.updateWelcomeVibeCards();
      });
    }

    // Mobile Navigation Buttons
    if (this.elMobileBottomNav) {
      this.elMobileBottomNav.querySelectorAll(".mobile-nav-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          arcadeAudio.playClick();
          const targetPanel = e.currentTarget.dataset.panel;
          this.switchMobilePanel(targetPanel);
        });
      });
    }

    // Mobile Day Switcher Tabs
    if (this.elMobileDaySwitcher) {
      this.elMobileDaySwitcher.querySelectorAll(".mobile-day-tab").forEach(btn => {
        btn.addEventListener("click", (e) => {
          arcadeAudio.playClick();
          const selectedDay = e.currentTarget.dataset.day;
          this.setDayFilter(selectedDay);
        });
      });
    }

    // Event Details Bottom Sheet Modal Listeners
    if (this.btnCloseEventSheet) {
      this.btnCloseEventSheet.addEventListener("click", () => {
        arcadeAudio.playClick();
        if (this.elEventDetailsOverlay) this.elEventDetailsOverlay.classList.add("hidden");
      });
    }

    if (this.elEventDetailsOverlay) {
      this.elEventDetailsOverlay.addEventListener("click", (e) => {
        if (e.target === this.elEventDetailsOverlay) {
          this.elEventDetailsOverlay.classList.add("hidden");
        }
      });
    }

    if (this.btnSheetDeselect) {
      this.btnSheetDeselect.addEventListener("click", () => {
        arcadeAudio.playClick();
        if (this.activeSheetCourseId) {
          delete this.selectedSectionsMap[this.activeSheetCourseId];
          this.saveSelections();
          this.render();
        }
        if (this.elEventDetailsOverlay) this.elEventDetailsOverlay.classList.add("hidden");
      });
    }
  }

  // MOBILE PANEL SWITCHER LOGIC
  switchMobilePanel(panelName) {
    this.currentMobilePanel = panelName;
    if (this.elMainGrid) {
      this.elMainGrid.setAttribute("data-active-panel", panelName);
    }
    if (this.elMobileBottomNav) {
      this.elMobileBottomNav.querySelectorAll(".mobile-nav-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.panel === panelName);
      });
    }
  }

  // MOBILE DAY FILTER LOGIC
  setDayFilter(day) {
    this.currentDayFilter = day;
    if (this.elMobileDaySwitcher) {
      this.elMobileDaySwitcher.querySelectorAll(".mobile-day-tab").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.day === day);
      });
    }
    this.renderTimetable();
  }

  // EVENT DETAILS BOTTOM SHEET
  openEventDetailsSheet(slot) {
    // Resolve by id. Matching on course code or section name picked the wrong
    // record whenever two courses shared a section name such as "Sec 01".
    const course = this.courseBySectionId.get(slot.sectionId);
    if (!course) return;
    const section = this.sectionById.get(slot.sectionId);

    this.activeSheetCourseId = course.id;
    this.activeSheetSectionId = section ? section.id : null;

    if (this.sheetCourseCode) this.sheetCourseCode.textContent = course.code || course.title;
    if (this.sheetCourseTitle) this.sheetCourseTitle.textContent = course.title || course.code;
    if (this.sheetSectionName) this.sheetSectionName.textContent = slot.sectionName;
    if (this.sheetInstructor) this.sheetInstructor.textContent = section ? section.instructor : "Staff";
    if (this.sheetLocation) this.sheetLocation.textContent = slot.location;
    if (this.sheetTimeSlot) this.sheetTimeSlot.textContent = `${slot.day} ${slot.startTime} - ${slot.endTime}`;
    if (this.sheetGapInfo) this.sheetGapInfo.classList.add("hidden");

    if (this.elEventDetailsOverlay) {
      this.elEventDetailsOverlay.classList.remove("hidden");
    }
  }

  openWelcomeModal() {
    if (this.elWelcomeOverlay) {
      this.updateWelcomeVibeCards();
      this.elWelcomeOverlay.classList.remove("hidden");
    }
  }

  closeWelcomeModal() {
    if (this.elWelcomeOverlay) {
      this.elWelcomeOverlay.classList.add("hidden");
    }
    localStorage.setItem(STORAGE_KEY_WELCOME_SEEN, "true");
  }

  updateWelcomeVibeCards() {
    if (this.welcomeSelectArcade && this.welcomeSelectRegular) {
      const isArcade = this.currentMode === 'arcade';
      this.welcomeSelectArcade.classList.toggle("active-vibe", isArcade);
      this.welcomeSelectRegular.classList.toggle("active-vibe", !isArcade);
    }
  }

  checkWelcomeOnFirstVisit() {
    const hasSeenWelcome = localStorage.getItem(STORAGE_KEY_WELCOME_SEEN);
    if (!hasSeenWelcome) {
      this.openWelcomeModal();
    }
  }

  // GET ACTIVE SELECTIONS ARRAY
  getSelectedSections() {
    const list = [];
    for (const [courseId, secId] of Object.entries(this.selectedSectionsMap)) {
      if (!secId) continue;
      const sec = this.sectionById.get(secId);
      // Confirm the section still belongs to the course it is mapped under.
      const owner = this.courseBySectionId.get(secId);
      if (sec && owner && owner.id === courseId) list.push(sec);
    }
    return list;
  }

  // MAIN RENDER LOOP
  render() {
    // Compute the metrics once and share them: renderTimetable and
    // renderAnalytics previously each recomputed the same result.
    const selectedSections = this.getSelectedSections();
    const metrics = calculateScheduleMetrics(selectedSections, this.courses, this.courseBySectionId);

    this.renderCourseList();
    this.renderTimetable(metrics);
    this.renderAnalytics(metrics);
    this.updateCombinationsBadge();
  }

  // RENDER LEFT SIDEBAR COURSE LIST
  renderCourseList() {
    const query = this.elSearchInput.value.toLowerCase().trim();
    this.elCourseList.innerHTML = "";

    const filteredCourses = this.courses.filter(c =>
      c.code.toLowerCase().includes(query) || c.title.toLowerCase().includes(query)
    );

    let selectedCount = 0;

    if (filteredCourses.length === 0) {
      if (this.courses.length === 0) {
        this.elCourseList.innerHTML = `
          <div class="empty-course-state">
            <div class="empty-icon">📚</div>
            <p class="empty-title">No Classes Added Yet</p>
            <p class="empty-sub">Add your classes manually or import them from text to build your schedule.</p>
            <button id="btn-empty-add-course" class="btn btn-primary btn-sm">
              + Add Class Manually
            </button>
          </div>
        `;
        const btnEmptyAdd = this.elCourseList.querySelector("#btn-empty-add-course");
        if (btnEmptyAdd) {
          btnEmptyAdd.addEventListener("click", () => {
            arcadeAudio.playClick();
            this.elModalOverlay.classList.remove("hidden");
          });
        }
      } else {
        this.elCourseList.innerHTML = `
          <div class="empty-search-state">
            No courses match "${escapeHtml(query)}"
          </div>
        `;
      }
      this.elSelectedCount.textContent = `0 / ${this.courses.length} Selected`;
      return;
    }

    filteredCourses.forEach(course => {
      const selectedSecId = this.selectedSectionsMap[course.id];
      if (selectedSecId) selectedCount++;

      const card = document.createElement("div");
      card.className = "course-card";

      const displayBadge = course.code ? course.code : (course.title ? course.title.substring(0, 8).toUpperCase() : "COURSE");
      const displayTitle = course.title || course.code || "Course";

      card.innerHTML = `
        <div class="course-header">
          <span class="course-badge" style="background-color: ${safeColor(course.color)}">${escapeHtml(displayBadge)}</span>
          <button class="btn btn-ghost icon-only btn-sm btn-delete-course" data-course-id="${escapeHtml(course.id)}" title="Remove course">&times;</button>
        </div>
        <div class="sections-group">
          ${course.sections.map(sec => {
        const isSelected = selectedSecId === sec.id;
        const conflicts = getSectionConflicts(sec, this.selectedSectionsMap, this.courses);
        const hasConflict = conflicts.length > 0;

        const timeBadges = sec.times.map(t =>
          `<span class="time-tag">${escapeHtml(t.day)} ${escapeHtml(t.startTime)}-${escapeHtml(t.endTime)}</span>`
        ).join("");

        return `
              <div class="section-item ${isSelected ? 'selected' : ''} ${hasConflict && !isSelected ? 'has-conflict' : ''}"
                   data-course-id="${escapeHtml(course.id)}"
                   data-section-id="${escapeHtml(sec.id)}">
                <div class="section-top">
                  <label class="section-radio">
                    <input type="radio" name="radio-${escapeHtml(course.id)}" ${isSelected ? 'checked' : ''}>
                    <span>${escapeHtml(sec.name)}</span>
                  </label>
                  <span class="section-instructor">${escapeHtml(sec.instructor)}</span>
                </div>
                <div class="section-location">${getIconSvg('map-pin', 12)} <span>${escapeHtml(sec.location)}</span></div>
                <div class="section-time-tags">${timeBadges}</div>
                ${hasConflict && !isSelected ? `
                  <div class="conflict-tag">
                    ${getIconSvg('alert-triangle', 12)} <span>Overlaps ${escapeHtml(conflicts[0].conflictingCourseCode)} ${escapeHtml(conflicts[0].conflictingSecName)}</span>
                  </div>
                ` : ''}
              </div>
            `;
      }).join("")}
        </div>
      `;

      // Event Listeners for section selection & preview
      card.querySelectorAll(".section-item").forEach(item => {
        const cId = item.dataset.courseId;
        const sId = item.dataset.sectionId;
        const sectionObj = course.sections.find(s => s.id === sId);

        // Click to select
        item.addEventListener("click", () => {
          arcadeAudio.playSelect();
          if (this.selectedSectionsMap[cId] === sId) {
            delete this.selectedSectionsMap[cId]; // Deselect
          } else {
            this.selectedSectionsMap[cId] = sId; // Select
          }
          this.saveSelections();
          this.render();
        });

        // Hover to preview. The guard matters: without it, moving the mouse
        // across the list rebuilt the entire timetable grid on every enter and
        // every leave, including for sections already selected (which draw no
        // preview at all).
        item.addEventListener("mouseenter", () => {
          if (this.hoveredSection === sectionObj) return;
          this.hoveredSection = sectionObj;
          this.renderTimetable();
        });
        item.addEventListener("mouseleave", () => {
          if (this.hoveredSection === null) return;
          this.hoveredSection = null;
          this.renderTimetable();
        });
      });

      // Delete Course button
      const btnDelete = card.querySelector(".btn-delete-course");
      btnDelete.addEventListener("click", async (e) => {
        e.stopPropagation();
        const confirmed = await showConfirm(`Remove ${course.code} from planner?`, "Remove Course");
        if (confirmed) {
          this.courses = this.courses.filter(c => c.id !== course.id);
          delete this.selectedSectionsMap[course.id];
          this.saveCourses();
          this.saveSelections();
          this.render();
        }
      });

      this.elCourseList.appendChild(card);
    });

    this.elSelectedCount.textContent = `${selectedCount} / ${this.courses.length} Selected`;
    if (this.elMobileCoursesBadge) {
      this.elMobileCoursesBadge.textContent = selectedCount;
      this.elMobileCoursesBadge.classList.toggle("hidden", selectedCount === 0);
    }
  }


  // RENDER VISUAL TIMETABLE MATRIX
  renderTimetable(precomputedMetrics) {
    this.elTimetableGrid = document.getElementById("timetable-grid");
    if (!this.elTimetableGrid) return;

    const daysToDisplay = this.currentDayFilter === 'ALL' ? DAYS : DAYS.filter(d => d === this.currentDayFilter);
    const gridCols = daysToDisplay.length;
    this.elTimetableGrid.style.setProperty("--day-count", gridCols);
    this.elTimetableGrid.innerHTML = "";

    if (this.currentDayFilter !== 'ALL') {
      this.elTimetableGrid.classList.add("single-day-grid");
    } else {
      this.elTimetableGrid.classList.remove("single-day-grid");
    }

    const startHour = 8;
    const endHour = 20; // 13 hours total (08:00 to 20:00)
    const hourHeight = 70; // 1 hour = 70px (matching style.css 70px grid rows)

    // The grid is ~120 elements. Building them off-document and attaching once
    // avoids touching the live tree on every node.
    const gridFragment = document.createDocumentFragment();

    // 1. Row 1: Header Cells
    const cornerCell = document.createElement("div");
    cornerCell.className = "time-header-cell";
    cornerCell.style.gridColumn = "1";
    cornerCell.style.gridRow = "1";
    cornerCell.textContent = "Time";
    gridFragment.appendChild(cornerCell);

    daysToDisplay.forEach((day, dayIdx) => {
      const dayCell = document.createElement("div");
      dayCell.className = "day-header-cell";
      dayCell.style.gridColumn = `${dayIdx + 2}`;
      dayCell.style.gridRow = "1";
      dayCell.innerHTML = `
        <div class="day-name">${FULL_DAYS[day]}</div>
        <div class="day-sub">${day}</div>
      `;
      gridFragment.appendChild(dayCell);
    });

    // 2. Rows 2 to 14: Time Labels & Background Cells
    for (let h = startHour; h <= endHour; h++) {
      const rowIdx = h - startHour + 2; // Row 2 for 8:00 AM, Row 3 for 9:00 AM...

      const timeLabelCell = document.createElement("div");
      timeLabelCell.className = "time-slot-label";
      timeLabelCell.style.gridColumn = "1";
      timeLabelCell.style.gridRow = `${rowIdx}`;
      timeLabelCell.textContent = format12h(`${String(h).padStart(2, '0')}:00`);
      gridFragment.appendChild(timeLabelCell);

      daysToDisplay.forEach((day, dayIdx) => {
        const bgCell = document.createElement("div");
        bgCell.className = "time-slot-cell";
        bgCell.style.gridColumn = `${dayIdx + 2}`;
        bgCell.style.gridRow = `${rowIdx}`;
        bgCell.style.borderBottom = "1px solid var(--border-color)";
        bgCell.style.borderRight = "1px solid var(--border-color)";
        gridFragment.appendChild(bgCell);
      });
    }

    // 3. Day Column Overlays (Positioned Event Cards)
    const selectedSections = this.getSelectedSections();
    const metrics = precomputedMetrics
      || calculateScheduleMetrics(selectedSections, this.courses, this.courseBySectionId);

    // Check conflicts
    const hasConflicts = this.checkGlobalConflicts(selectedSections);
    if (this.elConflictBanner) {
      if (hasConflicts) {
        this.elConflictBanner.classList.remove("hidden");
      } else {
        this.elConflictBanner.classList.add("hidden");
      }
    }

    daysToDisplay.forEach((day, dayIdx) => {
      const colDiv = document.createElement("div");
      colDiv.className = "day-column-overlay";
      colDiv.style.gridColumn = `${dayIdx + 2}`;
      colDiv.style.gridRow = `2 / span ${endHour - startHour + 1}`;
      colDiv.style.position = "relative";
      colDiv.style.height = `${(endHour - startHour + 1) * hourHeight}px`;

      const dayBreakdown = metrics.dailyBreakdown[day];

      // A. Gap Hour Bands
      if (dayBreakdown && dayBreakdown.gapIntervals.length > 0) {
        dayBreakdown.gapIntervals.forEach(gap => {
          const gapStartMins = timeToMinutes(gap.start);
          const gapEndMins = timeToMinutes(gap.end);

          const topPx = ((gapStartMins - (startHour * 60)) / 60) * hourHeight;
          const heightPx = ((gapEndMins - gapStartMins) / 60) * hourHeight;

          const gapBand = document.createElement("div");
          gapBand.className = "gap-band";
          gapBand.style.top = `${topPx}px`;
          gapBand.style.height = `${heightPx}px`;
          gapBand.innerHTML = `
            <div class="gap-band-content">
              <span>${getIconSvg('clock', 12)} ${gap.durationHours} hr gap</span>
            </div>
          `;
          colDiv.appendChild(gapBand);
        });
      }

      // B. Active Course Event Cards
      metrics.activeSlots.filter(s => s.day === day).forEach(slot => {
        const topPx = ((slot.startMins - (startHour * 60)) / 60) * hourHeight;
        const heightPx = ((slot.endMins - slot.startMins) / 60) * hourHeight;

        const isConflicting = metrics.activeSlots.some(other =>
          other !== slot && other.day === slot.day && Math.max(slot.startMins, other.startMins) < Math.min(slot.endMins, other.endMins)
        );

        const card = document.createElement("div");
        card.className = `calendar-event ${isConflicting ? 'conflict-block' : ''}`;
        card.style.top = `${topPx}px`;
        card.style.height = `${heightPx}px`;
        if (!isConflicting) {
          card.style.backgroundColor = slot.courseColor;
        }

        card.innerHTML = `
          <div>
            <div class="event-code">${escapeHtml(slot.courseCode)}</div>
            <div class="event-sec">${escapeHtml(slot.sectionName)}</div>
          </div>
          <div>
            <div class="event-location">${getIconSvg('map-pin', 11)} <span>${escapeHtml(slot.location)}</span></div>
            <div class="event-time">${escapeHtml(slot.startTime)} - ${escapeHtml(slot.endTime)}</div>
          </div>
        `;

        card.addEventListener("click", () => {
          arcadeAudio.playSelect();
          this.openEventDetailsSheet(slot);
        });

        colDiv.appendChild(card);
      });

      // C. Hover Preview Block
      if (this.hoveredSection) {
        this.hoveredSection.times.filter(t => t.day === day).forEach(t => {
          const sMins = timeToMinutes(t.startTime);
          const eMins = timeToMinutes(t.endTime);
          const topPx = ((sMins - (startHour * 60)) / 60) * hourHeight;
          const heightPx = ((eMins - sMins) / 60) * hourHeight;

          const course = this.courseBySectionId.get(this.hoveredSection.id);

          const prevCard = document.createElement("div");
          prevCard.className = "calendar-event preview-block";
          prevCard.style.top = `${topPx}px`;
          prevCard.style.height = `${heightPx}px`;
          prevCard.style.backgroundColor = safeColor(course && course.color);

          prevCard.innerHTML = `
            <div>
              <div class="event-code">${course ? escapeHtml(course.code) : 'Preview'}</div>
              <div class="event-sec">${escapeHtml(this.hoveredSection.name)} (Hover)</div>
            </div>
            <div class="event-time">${escapeHtml(t.startTime)} - ${escapeHtml(t.endTime)}</div>
          `;

          colDiv.appendChild(prevCard);
        });
      }

      gridFragment.appendChild(colDiv);
    });

    this.elTimetableGrid.appendChild(gridFragment);
  }

  // CHECK GLOBAL CONFLICTS
  checkGlobalConflicts(selectedSections) {
    for (let i = 0; i < selectedSections.length; i++) {
      for (let j = i + 1; j < selectedSections.length; j++) {
        const secA = selectedSections[i];
        const secB = selectedSections[j];
        for (const slotA of secA.times) {
          for (const slotB of secB.times) {
            if (slotA.day === slotB.day) {
              const startA = timeToMinutes(slotA.startTime);
              const endA = timeToMinutes(slotA.endTime);
              const startB = timeToMinutes(slotB.startTime);
              const endB = timeToMinutes(slotB.endTime);
              if (Math.max(startA, startB) < Math.min(endA, endB)) {
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  }

  // RENDER RIGHT ANALYTICS PANEL
  renderAnalytics(precomputedMetrics) {
    const metrics = precomputedMetrics
      || calculateScheduleMetrics(this.getSelectedSections(), this.courses, this.courseBySectionId);

    // Stat Values
    this.elStatGapHours.textContent = metrics.totalGapHours.toFixed(1);
    this.elStatCampusHours.textContent = metrics.totalCampusHours.toFixed(1);
    this.elStatClassHours.textContent = metrics.totalClassHours.toFixed(1);
    this.elStatDaysOff.textContent = `${metrics.daysOffCount} Day(s) Off`;

    // Gap Badge
    if (metrics.totalGapHours === 0) {
      this.elStatGapBadge.innerHTML = `${getIconSvg('check-circle', 12)} <span>Zero Gaps</span>`;
      this.elStatGapBadge.className = "stat-footer-badge success";
    } else if (metrics.totalGapHours <= 4) {
      this.elStatGapBadge.innerHTML = `${getIconSvg('check-circle', 12)} <span>Optimal Gaps</span>`;
      this.elStatGapBadge.className = "stat-footer-badge success";
    } else {
      this.elStatGapBadge.innerHTML = `${getIconSvg('alert-triangle', 12)} <span>High Gap Alert</span>`;
      this.elStatGapBadge.className = "stat-footer-badge warning";
    }

    // Highlights Badges
    this.elBadgesContainer.innerHTML = "";
    metrics.badges.forEach(b => {
      const tag = document.createElement("span");
      tag.className = `badge-tag ${b.type}`;
      const iconSvg = b.icon ? getIconSvg(b.icon, 13) : '';
      tag.innerHTML = `${iconSvg}<span>${escapeHtml(b.text)}</span>`;
      this.elBadgesContainer.appendChild(tag);
    });

    // Daily Breakdown
    this.elDailyBreakdownList.innerHTML = "";
    DAYS.forEach(day => {
      const info = metrics.dailyBreakdown[day];
      const card = document.createElement("div");

      if (!info.hasClasses) {
        card.className = "day-breakdown-card day-off";
        card.innerHTML = `
          <div class="day-breakdown-header">
            <span class="day-title">${FULL_DAYS[day]}</span>
            <span class="day-free-status">${getIconSvg('sun', 13)} <span>No Classes</span></span>
          </div>
        `;
      } else {
        card.className = "day-breakdown-card";
        card.innerHTML = `
          <div class="day-breakdown-header">
            <span class="day-title">${FULL_DAYS[day]}</span>
            <span class="day-breakdown-time">${info.firstStart} – ${info.lastEnd}</span>
          </div>
          <div class="day-breakdown-metrics">
            <span>Campus: ${info.campusHours}h</span>
            <span>Class: ${info.classHours}h</span>
            <span class="gap-metric ${info.gapHours > 0 ? 'has-gap' : 'no-gap'}">
              Gap: ${info.gapHours}h
            </span>
          </div>
        `;
      }
      this.elDailyBreakdownList.appendChild(card);
    });
  }

  // UPDATE COMBINATIONS BADGE
  updateCombinationsBadge() {
    // Served from the memoized cache: selecting a section does not change the
    // set of valid combinations, so this is free on the click path.
    const validCombos = this.getCombinations();
    this.badgeCombosCount.textContent =
      validCombos.length >= MAX_COMBINATIONS ? `${MAX_COMBINATIONS}+` : validCombos.length;
  }

  // OPEN & RENDER AUTO-COMBINATIONS DRAWER
  openAutoCombinationsDrawer() {
    this.elDrawerOverlay.classList.remove("hidden");
    this.renderCombinationsDrawer();
  }

  /**
   * Counts pairs of classes on the same day separated by 10 minutes or less.
   * Computed once per combination and cached on the combo object, rather than
   * from inside a sort comparator (which re-ran it O(n log n) times).
   */
  countBackToBack(combo) {
    if (combo._b2bCount !== undefined) return combo._b2bCount;

    let count = 0;
    const slotsByDay = {};
    combo.metrics.activeSlots.forEach(s => {
      if (!slotsByDay[s.day]) slotsByDay[s.day] = [];
      slotsByDay[s.day].push(s);
    });
    Object.values(slotsByDay).forEach(daySlots => {
      daySlots.sort((a, b) => a.startMins - b.startMins);
      for (let i = 1; i < daySlots.length; i++) {
        if (daySlots[i].startMins - daySlots[i - 1].endMins <= 10) count++;
      }
    });

    combo._b2bCount = count;
    return count;
  }

  renderCombinationsDrawer() {
    const allCombos = this.getCombinations();
    const cappedAtLimit = allCombos.length >= MAX_COMBINATIONS;

    this.elComboSummaryText.textContent = cappedAtLimit
      ? `Showing the first ${MAX_COMBINATIONS} valid schedules — narrow your course list for a complete search`
      : `Found ${allCombos.length} valid non-conflicting schedules`;

    // Sort a shallow copy so the memoized cache keeps a stable order.
    const validCombos = allCombos.slice();

    if (this.sortPreference === 'gaps') {
      validCombos.sort((a, b) => a.metrics.totalGapHours - b.metrics.totalGapHours);
    } else if (this.sortPreference === 'daysoff') {
      validCombos.sort((a, b) => b.metrics.daysOffCount - a.metrics.daysOffCount);
    } else if (this.sortPreference === 'mornings') {
      // Decorate once instead of filtering inside every comparison.
      validCombos.forEach(c => {
        if (c._earlyCount === undefined) {
          c._earlyCount = c.metrics.activeSlots.filter(s => s.startMins < 540).length;
        }
      });
      validCombos.sort((a, b) => a._earlyCount - b._earlyCount);
    } else if (this.sortPreference === 'spread') {
      validCombos.forEach(c => this.countBackToBack(c));
      validCombos.sort((a, b) => a._b2bCount - b._b2bCount);
    }

    this.elCombinationsList.innerHTML = "";

    if (validCombos.length === 0) {
      this.elCombinationsList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
          <p>No non-conflicting schedule combinations found.</p>
          <p style="font-size: 0.8rem; margin-top: 8px;">Try removing or editing conflicting course sections.</p>
        </div>
      `;
      return;
    }

    // Only the best N are worth rendering — nobody compares thousands of cards,
    // and building one DOM card each is what actually froze the tab.
    const visibleCombos = validCombos.slice(0, RENDERED_COMBO_LIMIT);
    this._visibleCombos = visibleCombos;

    // Build off-document, then attach in a single append.
    const fragment = document.createDocumentFragment();

    visibleCombos.forEach((combo, idx) => {
      const card = document.createElement("div");
      card.className = "combo-card";
      card.dataset.comboIdx = String(idx);

      const isActive = Object.entries(combo.selectionMap).every(
        ([cId, sId]) => this.selectedSectionsMap[cId] === sId
      );
      if (isActive) card.classList.add("active-combo");

      const b2bCount = this.countBackToBack(combo);

      card.innerHTML = `
        <div class="combo-card-header">
          <span class="combo-rank">Option #${idx + 1} ${isActive ? ' (Current Active)' : ''}</span>
          <div class="combo-metrics">
            <span>${getIconSvg('clock', 13)} ${combo.metrics.totalGapHours}h gap</span>
            <span>${getIconSvg('building', 13)} ${combo.metrics.totalCampusHours}h campus</span>
            <span>${getIconSvg('sun', 13)} ${combo.metrics.daysOffCount} days off</span>
            <span>${b2bCount === 0 ? getIconSvg('check-circle', 13) : getIconSvg('alert-triangle', 13)} ${b2bCount} back-to-back</span>
          </div>
        </div>
        <div class="combo-sections-list">
          ${combo.sections.map(sec => {
        const course = this.courseBySectionId.get(sec.id);
        return `<span class="combo-section-chip" style="background-color: ${safeColor(course && course.color)}">${course ? escapeHtml(course.code) : ''} ${escapeHtml(sec.name)}</span>`;
      }).join("")}
        </div>
        <button class="btn btn-sm ${isActive ? 'btn-outline' : 'btn-primary'} btn-apply-combo" style="margin-top: 6px;">
          ${isActive ? 'Selected' : 'Apply Schedule'}
        </button>
      `;

      fragment.appendChild(card);
    });

    this.elCombinationsList.appendChild(fragment);

    if (validCombos.length > visibleCombos.length) {
      const note = document.createElement("p");
      note.className = "combo-truncation-note";
      note.textContent = `Showing the top ${visibleCombos.length} of ${validCombos.length} schedules for this sort order.`;
      this.elCombinationsList.appendChild(note);
    }
  }
}

// INITIALIZE APP ON DOM LOADED (or immediately if DOM is already parsed)
function initApp() {
  installGlobalAlertOverrides();
  window.app = new UniScheduleApp();
}

if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

