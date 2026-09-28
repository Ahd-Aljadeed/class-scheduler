import confetti from 'canvas-confetti';
import { INITIAL_COURSES } from './data/sampleCourses.js';
import {
  DAYS,
  FULL_DAYS,
  MAX_COMBINATIONS,
  DEFAULT_GRID_END_HOUR,
  timeToMinutes,
  format12h,
  getSectionConflicts,
  calculateScheduleMetrics,
  generateAllCombinations,
  generateICS,
  isBusyCourse,
  diffSelections,
  computeHourRange
} from './utils/scheduler.js';
import { parseRawTextToCourses } from './utils/parser.js';
import { arcadeAudio } from './utils/arcadeAudio.js';
import { showAlert, showConfirm, installGlobalAlertOverrides } from './utils/customModal.js';
import { escapeHtml, safeColor } from './utils/sanitize.js';
import {
  sanitizeCourses,
  sanitizeSelections,
  sanitizePeople,
  sanitizePersonExtras,
  sanitizeTerm,
  LIMITS,
  ME_ID,
  DEFAULT_PERSON_COLOR
} from './utils/validate.js';
import {
  evaluateConstraints,
  computeMetricRanges,
  scoreSchedule,
  scoreRank,
  hasHardLimits
} from './utils/prefs.js';
import { computeTogetherness, mergeSharedBreaks } from './utils/together.js';
import { initPeople, renderPeopleBar, renderTogetherCard } from './features/people.js';
import { initPreferencesPanel, renderPreferencesPanel, summarizeHardLimits } from './features/preferences.js';
import { initPlans } from './features/plans.js';
import { initSettings } from './features/settings.js';
import { initHeatmap, renderHeatmapPanel } from './features/heatmap.js';
import { initPoster } from './features/poster.js';
import { initSurprise } from './features/surprise.js';

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
    case 'lock':
      return `${base}<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
    case 'ban':
      return `${base}<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>`;
    case 'users':
      return `${base}<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    case 'swap':
      return `${base}<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>`;
    default:
      return `${base}<circle cx="12" cy="12" r="10"/></svg>`;
  }
}


// LOCAL STORAGE KEYS
// "Me" keeps the original v3 keys so existing users lose nothing; every other
// person gets the same keys suffixed with their id.
const STORAGE_KEY_COURSES = "unischedule_courses_v3";
const STORAGE_KEY_SELECTIONS = "unischedule_selections_v3";
const STORAGE_KEY_MODE = "unischedule_mode_v1";
const STORAGE_KEY_THEME = "unischedule_theme_v1";
const STORAGE_KEY_WELCOME_SEEN = "unischedule_welcome_seen_v1";
const STORAGE_KEY_PEOPLE = "unischedule_people_v1";
const STORAGE_KEY_ACTIVE_PERSON = "unischedule_active_person_v1";
const STORAGE_KEY_PERSON_EXTRAS = "unischedule_person_v1";
const STORAGE_KEY_TERM = "unischedule_term_v1";
const STORAGE_KEY_FRIEND_OVERLAY = "unischedule_friend_overlay_v1";

/** How many combination cards are actually built in the DOM at once. */
const RENDERED_COMBO_LIMIT = 100;
/** Delay before a search keystroke triggers a re-render of the course list. */
const SEARCH_DEBOUNCE_MS = 130;
/** One hour of the timetable grid, in pixels (matches the CSS row height). */
const HOUR_HEIGHT_PX = 70;

function personKey(base, personId) {
  return personId === ME_ID ? base : `${base}:${personId}`;
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error(`Failed to parse ${key}`, e);
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to save ${key}`, e);
  }
}

function readString(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeString(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.error(`Failed to save ${key}`, e);
  }
}

function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    // Nothing to do: the key simply lingers.
  }
}

/**
 * Resolves a selection map to section objects. Busy blocks are always in,
 * whatever the map says: they are commitments, not choices.
 */
function selectedSectionsOf(courses, selections) {
  const list = [];
  courses.forEach(course => {
    const secId = isBusyCourse(course) ? course.sections[0].id : selections[course.id];
    if (!secId) return;
    const section = course.sections.find(s => s.id === secId);
    if (section) list.push(section);
  });
  return list;
}

function hatchStyle(color) {
  const safe = safeColor(color, "#64748b");
  return `border-color: ${safe}; background-image: repeating-linear-gradient(45deg, ${safe} 0 6px, transparent 6px 14px);`;
}

class UniScheduleApp {
  constructor() {
    this.people = sanitizePeople(readJSON(STORAGE_KEY_PEOPLE));
    this.personState = {};
    this.people.forEach(person => {
      this.personState[person.id] = this.loadPersonState(person.id);
    });
    const storedActive = readString(STORAGE_KEY_ACTIVE_PERSON);
    this.activePersonId = this.people.some(p => p.id === storedActive) ? storedActive : ME_ID;
    this.term = sanitizeTerm(readJSON(STORAGE_KEY_TERM));
    this.showFriendOverlay = readString(STORAGE_KEY_FRIEND_OVERLAY) === "1";
    this.hideViolations = true;

    this.hoveredSection = null;
    this.previewSelectionMap = null;
    this.focusedComboIdx = null;
    this._visibleCombos = [];
    this._listedCombos = null;
    this._backupChanges = new Map();
    this._friendDataCache = null;
    this._surpriseTimer = null;

    // Lookup indexes + memoized combination results. Rebuilt only when the
    // course list itself changes, via invalidateCourseIndex().
    this.courseBySectionId = new Map();
    this.sectionById = new Map();
    this.courseById = new Map();
    this._combinationsCache = null;
    this._scoreRanges = null;
    this.bindActivePerson();

    this.showWeekends = true; // Default to showing weekends (Sun) as user has Sun classes
    this.sortPreference = 'gaps'; // 'gaps' | 'daysoff' | 'mornings' | 'spread' | 'score' | 'backup' | 'friends'
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
    this.initBusyFormState();

    initPeople(this);
    initPreferencesPanel(this);
    initPlans(this);
    initSettings(this);
    initHeatmap(this);
    initPoster(this);
    initSurprise(this);

    this.render();

    // Automatically show welcome guide on first visit
    this.checkWelcomeOnFirstVisit();
  }

  get activePerson() {
    return this.people.find(p => p.id === this.activePersonId) || this.people[0];
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

  // BUSY BLOCK BUILDER STATE & RENDER
  initBusyFormState() {
    this.busyFormSlots = [{ day: "Mon", startTime: "14:00", endTime: "16:00" }];
    const label = document.getElementById("busy-label");
    const color = document.getElementById("busy-color");
    if (label) label.value = "";
    if (color) color.value = "#64748b";
    this.renderBusyFormSlots();
  }

  renderBusyFormSlots() {
    const container = document.getElementById("busy-slots-container");
    if (!container) return;

    container.innerHTML = this.busyFormSlots.map((slot, idx) => `
      <div class="time-slot-row" data-slot-idx="${idx}">
        <select class="busy-slot-day" aria-label="Day">
          ${DAYS.map(d => `<option value="${d}" ${slot.day === d ? 'selected' : ''}>${FULL_DAYS[d]}</option>`).join("")}
        </select>
        <div class="time-input-group">
          <span class="time-label">Start:</span>
          <input type="time" class="busy-slot-start" value="${slot.startTime}" required />
        </div>
        <div class="time-input-group">
          <span class="time-label">End:</span>
          <input type="time" class="busy-slot-end" value="${slot.endTime}" required />
        </div>
        ${this.busyFormSlots.length > 1 ? `<button type="button" class="btn btn-ghost icon-only btn-xs btn-remove-busy-slot" title="Remove Day">&times;</button>` : ''}
      </div>
    `).join("");

    container.querySelectorAll(".time-slot-row").forEach(row => {
      const idx = Number(row.dataset.slotIdx);
      const slot = this.busyFormSlots[idx];
      if (!slot) return;
      row.querySelector(".busy-slot-day").addEventListener("change", (e) => { slot.day = e.target.value; });
      row.querySelector(".busy-slot-start").addEventListener("change", (e) => { slot.startTime = e.target.value; });
      row.querySelector(".busy-slot-end").addEventListener("change", (e) => { slot.endTime = e.target.value; });
      const remove = row.querySelector(".btn-remove-busy-slot");
      if (remove) {
        remove.addEventListener("click", () => {
          arcadeAudio.playClick();
          this.busyFormSlots.splice(idx, 1);
          this.renderBusyFormSlots();
        });
      }
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

    this.invalidateCombinations();
  }

  invalidateCombinations() {
    this._combinationsCache = null;
    this._scoreRanges = null;
  }

  /**
   * Memoized combination search. The valid-combination set depends only on the
   * courses and on locks/exclusions, never on the current selection, so
   * clicking a section must not trigger a recompute.
   */
  getCombinations() {
    if (!this._combinationsCache) {
      this._combinationsCache = generateAllCombinations(this.courses, this.courseBySectionId, {
        locked: this.locked,
        excluded: this.excluded
      });
      this._scoreRanges = null;
    }
    return this._combinationsCache;
  }

  /** Per-feature min/max across every valid schedule, for the match score. */
  getScoreRanges() {
    if (!this._scoreRanges) {
      this._scoreRanges = computeMetricRanges(this.getCombinations().map(c => c.metrics));
    }
    return this._scoreRanges;
  }

  getCurrentMetrics() {
    return calculateScheduleMetrics(this.getSelectedSections(), this.courses, this.courseBySectionId);
  }

  /** Match score of the current picks, or null when there is nothing to score. */
  getCurrentScore(metrics) {
    if (this.getCombinations().length === 0) return null;
    const m = metrics || this.getCurrentMetrics();
    if (m.activeSlots.length === 0) return null;
    const score = scoreSchedule(m, this.getScoreRanges(), this.prefs.weights);
    return { score, rank: scoreRank(score) };
  }

  /** The schedules currently listed in the drawer, after limits and sorting. */
  getListedCombos() {
    return this._listedCombos || this.getCombinations();
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

  /**
   * Loads one person's courses, picks and extras. Persisted data is
   * untrusted: everything is validated before it can reach the render
   * pipeline or the metrics maths.
   */
  loadPersonState(personId) {
    let courses = sanitizeCourses(readJSON(personKey(STORAGE_KEY_COURSES, personId)));
    if (courses.length === 0) courses = JSON.parse(JSON.stringify(INITIAL_COURSES));
    // Drops any pair that does not resolve to a real course + section.
    const selections = sanitizeSelections(readJSON(personKey(STORAGE_KEY_SELECTIONS, personId)) || {}, courses);
    const extras = sanitizePersonExtras(readJSON(`${STORAGE_KEY_PERSON_EXTRAS}:${personId}`), courses);
    return { courses, selections, extras };
  }

  /** Points the app's working fields at the active person's data. */
  bindActivePerson() {
    const state = this.personState[this.activePersonId];
    this.courses = state.courses;
    this.selectedSectionsMap = state.selections;
    this.locked = new Set(state.extras.locked);
    this.excluded = new Set(state.extras.excluded);
    this.prefs = state.extras.prefs;
    this.plans = state.extras.plans;
    this.invalidateCourseIndex();
    this.ensureBusySelected();
    this._friendDataCache = null;
  }

  /** Busy blocks are always selected, whatever a loaded map or plan says. */
  ensureBusySelected() {
    this.courses.forEach(course => {
      if (isBusyCourse(course) && course.sections[0]) {
        this.selectedSectionsMap[course.id] = course.sections[0].id;
      }
    });
  }

  saveCourses() {
    // Every course mutation funnels through here, so this is the one place the
    // lookup indexes and the combination cache need refreshing.
    this.invalidateCourseIndex();
    // Locks and exclusions on sections that no longer exist are dropped.
    let extrasChanged = false;
    [this.locked, this.excluded].forEach(set => {
      [...set].forEach(id => {
        if (!this.sectionById.has(id)) { set.delete(id); extrasChanged = true; }
      });
    });
    this.personState[this.activePersonId].courses = this.courses;
    writeJSON(personKey(STORAGE_KEY_COURSES, this.activePersonId), this.courses);
    if (extrasChanged) this.savePersonExtras();
  }

  saveSelections() {
    this.ensureBusySelected();
    this.personState[this.activePersonId].selections = this.selectedSectionsMap;
    writeJSON(personKey(STORAGE_KEY_SELECTIONS, this.activePersonId), this.selectedSectionsMap);
  }

  savePersonExtras() {
    const extras = {
      locked: [...this.locked],
      excluded: [...this.excluded],
      prefs: this.prefs,
      plans: this.plans
    };
    this.personState[this.activePersonId].extras = extras;
    writeJSON(`${STORAGE_KEY_PERSON_EXTRAS}:${this.activePersonId}`, extras);
  }

  savePeople() {
    writeJSON(STORAGE_KEY_PEOPLE, this.people);
  }

  saveTerm() {
    writeJSON(STORAGE_KEY_TERM, this.term);
  }

  // PEOPLE
  switchPerson(personId) {
    if (personId === this.activePersonId || !this.personState[personId]) return;
    this.activePersonId = personId;
    writeString(STORAGE_KEY_ACTIVE_PERSON, personId);
    this.bindActivePerson();
    this.hoveredSection = null;
    this.previewSelectionMap = null;
    this.focusedComboIdx = null;
    this._listedCombos = null;
    if (this.elSearchInput) this.elSearchInput.value = "";
    renderPreferencesPanel(this);
    this.render();
    this.refreshDrawerIfOpen();
  }

  addPerson({ name, color, copyFromId }) {
    if (this.people.length >= LIMITS.MAX_PEOPLE) return;
    const id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const person = {
      id,
      name: String(name || "Friend").trim().slice(0, LIMITS.MAX_NAME_LENGTH) || "Friend",
      color: safeColor(color, DEFAULT_PERSON_COLOR)
    };
    this.people.push(person);

    const source = copyFromId ? this.personState[copyFromId] : null;
    const courses = source ? JSON.parse(JSON.stringify(source.courses)) : [];
    const selections = source ? { ...source.selections } : {};
    this.personState[id] = { courses, selections, extras: sanitizePersonExtras(null, courses) };

    this.savePeople();
    writeJSON(personKey(STORAGE_KEY_COURSES, id), courses);
    writeJSON(personKey(STORAGE_KEY_SELECTIONS, id), selections);
    writeJSON(`${STORAGE_KEY_PERSON_EXTRAS}:${id}`, this.personState[id].extras);

    this.switchPerson(id);
  }

  updatePerson(personId, { name, color }) {
    const person = this.people.find(p => p.id === personId);
    if (!person) return;
    if (name) person.name = String(name).trim().slice(0, LIMITS.MAX_NAME_LENGTH) || person.name;
    if (color) person.color = safeColor(color, person.color);
    this.savePeople();
    this._friendDataCache = null;
    this.render();
    this.refreshDrawerIfOpen();
  }

  deletePerson(personId) {
    if (personId === ME_ID || !this.personState[personId]) return;
    this.people = this.people.filter(p => p.id !== personId);
    delete this.personState[personId];
    removeKey(personKey(STORAGE_KEY_COURSES, personId));
    removeKey(personKey(STORAGE_KEY_SELECTIONS, personId));
    removeKey(`${STORAGE_KEY_PERSON_EXTRAS}:${personId}`);
    this.savePeople();

    if (this.activePersonId === personId) {
      this.activePersonId = ME_ID;
      writeString(STORAGE_KEY_ACTIVE_PERSON, ME_ID);
      this.bindActivePerson();
      renderPreferencesPanel(this);
    }
    this._friendDataCache = null;
    this.render();
    this.refreshDrawerIfOpen();
  }

  setFriendOverlay(on) {
    this.showFriendOverlay = !!on;
    writeString(STORAGE_KEY_FRIEND_OVERLAY, on ? "1" : "0");
    this.renderTimetable();
  }

  /** Every other person's current schedule, with metrics, for overlays. */
  getFriendData() {
    if (!this._friendDataCache) {
      this._friendDataCache = this.people
        .filter(p => p.id !== this.activePersonId)
        .map(person => {
          const state = this.personState[person.id];
          const sections = selectedSectionsOf(state.courses, state.selections);
          return {
            person,
            courses: state.courses,
            sections,
            metrics: calculateScheduleMetrics(sections, state.courses)
          };
        });
    }
    return this._friendDataCache;
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
    this.elScoreCard = document.getElementById("score-card");

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
    this.elPlansBadge = document.getElementById("plans-count-badge");

    if (this.elSoundIcon) {
      this.elSoundIcon.textContent = arcadeAudio.isMuted ? "🔇" : "🔊";
    }

    // Drawers & Modals
    this.elDrawerOverlay = document.getElementById("combinations-drawer-overlay");
    this.btnCloseDrawer = document.getElementById("btn-close-drawer");
    this.elCombinationsList = document.getElementById("combinations-list");
    this.elComboSummaryText = document.getElementById("combo-summary-text");
    this.elComboNotes = document.getElementById("combo-notes");
    this.elSurpriseTicker = document.getElementById("surprise-ticker");

    this.elModalOverlay = document.getElementById("import-modal-overlay");
    this.btnCloseModal = document.getElementById("btn-close-modal");
    this.elImportTextarea = document.getElementById("import-textarea");
    this.btnLoadSampleText = document.getElementById("btn-load-sample-text");
    this.btnParseImport = document.getElementById("btn-parse-import");
    this.formManualCourse = document.getElementById("manual-course-form");
    this.formBusy = document.getElementById("busy-form");

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
    this.activeSheetIsBusy = false;
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
        this.applyCombination(combo);
      });

      // Hovering a card ghosts that whole schedule onto the timetable.
      this.elCombinationsList.addEventListener("mouseover", (e) => {
        if (this._surpriseTimer) return;
        const card = e.target.closest(".combo-card");
        if (!card) return;
        const combo = this._visibleCombos && this._visibleCombos[Number(card.dataset.comboIdx)];
        if (combo) this.setComboPreview(combo.selectionMap);
      });
      this.elCombinationsList.addEventListener("mouseleave", () => {
        if (!this._surpriseTimer) this.setComboPreview(null);
      });
    }

    // Keyboard navigation inside the optimizer: arrows move, Enter applies,
    // Escape closes.
    document.addEventListener("keydown", (e) => {
      if (!this.elDrawerOverlay || this.elDrawerOverlay.classList.contains("hidden")) return;
      if (document.querySelector(".custom-alert-overlay")) return;
      const tag = e.target && e.target.tagName;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.moveComboFocus(e.key === "ArrowDown" ? 1 : -1);
      } else if (e.key === "Enter" && tag !== "BUTTON") {
        if (this.focusedComboIdx === null) return;
        const combo = this._visibleCombos[this.focusedComboIdx];
        if (combo) {
          e.preventDefault();
          this.applyCombination(combo);
        }
      } else if (e.key === "Escape") {
        this.closeDrawer();
      }
    });

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
        const confirmed = await showConfirm(`Clear all of ${this.activePerson.name}'s courses and start fresh?`, "Clear All Courses");
        if (confirmed) {
          this.courses = JSON.parse(JSON.stringify(INITIAL_COURSES));
          this.selectedSectionsMap = {};
          this.courses.forEach(c => {
            if (c.sections[0]) this.selectedSectionsMap[c.id] = c.sections[0].id;
          });
          this.locked = new Set();
          this.excluded = new Set();
          this.plans = [];
          this.saveCourses();
          this.saveSelections();
          this.savePersonExtras();
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
        this.closeDrawer();
      });
    }
    if (this.elDrawerOverlay) {
      this.elDrawerOverlay.addEventListener("click", (e) => {
        if (e.target === this.elDrawerOverlay) this.closeDrawer();
      });
    }

    // Sort Filter Tabs in Drawer
    document.querySelectorAll(".filter-tab").forEach(btn => {
      btn.addEventListener("click", (e) => {
        arcadeAudio.playClick();
        this.sortPreference = e.currentTarget.dataset.sort;
        this.syncSortTabs();
        this.renderCombinationsDrawer();
      });
    });

    // Notes under the drawer summary: "show hidden schedules", "reset locks".
    if (this.elComboNotes) {
      this.elComboNotes.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        arcadeAudio.playClick();
        if (btn.dataset.action === "show-hidden") {
          this.hideViolations = !this.hideViolations;
          renderPreferencesPanel(this);
          this.renderCombinationsDrawer();
        } else if (btn.dataset.action === "reset-locks") {
          this.locked = new Set();
          this.excluded = new Set();
          this.savePersonExtras();
          this.invalidateCombinations();
          this.render();
          this.renderCombinationsDrawer();
        }
      });
    }

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
        let course = this.courses.find(c => !isBusyCourse(c) && (c.code === code || c.title.toLowerCase() === title.toLowerCase()));
        if (!course) {
          if (this.courses.length >= LIMITS.MAX_COURSES) {
            await showAlert(`You already have the maximum of ${LIMITS.MAX_COURSES} courses.`, "Course Limit Reached");
            return;
          }
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

    // Busy block builder
    const btnAddBusySlot = document.getElementById("btn-add-busy-slot");
    if (btnAddBusySlot) {
      btnAddBusySlot.addEventListener("click", () => {
        arcadeAudio.playClick();
        if (this.busyFormSlots.length >= LIMITS.MAX_SLOTS_PER_SECTION) return;
        const last = this.busyFormSlots[this.busyFormSlots.length - 1];
        this.busyFormSlots.push({
          day: last ? last.day : "Mon",
          startTime: last ? last.startTime : "14:00",
          endTime: last ? last.endTime : "16:00"
        });
        this.renderBusyFormSlots();
      });
    }

    if (this.formBusy) {
      this.formBusy.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Sync from the DOM so typed-but-uncommitted values are not lost.
        this.formBusy.querySelectorAll("#busy-slots-container .time-slot-row").forEach((row, idx) => {
          const slot = this.busyFormSlots[idx];
          if (!slot) return;
          slot.day = row.querySelector(".busy-slot-day").value;
          slot.startTime = row.querySelector(".busy-slot-start").value;
          slot.endTime = row.querySelector(".busy-slot-end").value;
        });

        const labelEl = document.getElementById("busy-label");
        const colorEl = document.getElementById("busy-color");
        const label = labelEl ? labelEl.value.trim().slice(0, 40) : "";
        if (!label) {
          await showAlert("Give the busy time a label, like Work or Gym.", "Missing label");
          return;
        }
        const times = this.busyFormSlots
          .filter(s => s.day && s.startTime && s.endTime && s.endTime > s.startTime)
          .map(s => ({ day: s.day, startTime: s.startTime, endTime: s.endTime }));
        if (times.length === 0) {
          await showAlert("Add at least one day and time range that ends after it starts.", "Missing time");
          return;
        }
        if (this.courses.length >= LIMITS.MAX_COURSES) {
          await showAlert(`You already have the maximum of ${LIMITS.MAX_COURSES} courses and busy blocks.`, "Limit Reached");
          return;
        }

        const id = `busy-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const busy = {
          id,
          kind: "busy",
          code: label,
          title: label,
          color: safeColor(colorEl ? colorEl.value : "", "#64748b"),
          sections: [{
            id: `${id}-s`,
            name: "Busy",
            instructor: "",
            location: "",
            times
          }]
        };
        this.courses.push(busy);
        this.selectedSectionsMap[busy.id] = busy.sections[0].id;
        this.saveCourses();
        this.saveSelections();

        this.formBusy.reset();
        this.initBusyFormState();
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
        const icsData = generateICS(selectedSecs, this.courses, this.term);
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
      this.btnSheetDeselect.addEventListener("click", async () => {
        arcadeAudio.playClick();
        if (this.activeSheetIsBusy) {
          const course = this.courseById.get(this.activeSheetCourseId);
          const ok = await showConfirm(`Remove the "${course ? course.code : "busy"}" busy block?`, "Remove Busy Block");
          if (!ok) return;
          this.courses = this.courses.filter(c => c.id !== this.activeSheetCourseId);
          delete this.selectedSectionsMap[this.activeSheetCourseId];
          this.saveCourses();
          this.saveSelections();
          this.render();
        } else if (this.activeSheetCourseId) {
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
    const busy = isBusyCourse(course);

    this.activeSheetCourseId = course.id;
    this.activeSheetSectionId = section ? section.id : null;
    this.activeSheetIsBusy = busy;

    if (this.sheetCourseCode) this.sheetCourseCode.textContent = course.code || course.title;
    if (this.sheetCourseTitle) this.sheetCourseTitle.textContent = busy ? "Busy time (the optimizer plans around it)" : (course.title || course.code);
    if (this.sheetSectionName) this.sheetSectionName.textContent = busy ? "—" : slot.sectionName;
    if (this.sheetInstructor) this.sheetInstructor.textContent = busy ? "—" : (section ? section.instructor : "Staff");
    if (this.sheetLocation) this.sheetLocation.textContent = busy ? (slot.location || "—") : slot.location;
    if (this.sheetTimeSlot) this.sheetTimeSlot.textContent = `${slot.day} ${slot.startTime} - ${slot.endTime}`;
    if (this.sheetGapInfo) this.sheetGapInfo.classList.add("hidden");
    if (this.btnSheetDeselect) this.btnSheetDeselect.textContent = busy ? "Remove Busy Block" : "Deselect / Change Section";

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
    return selectedSectionsOf(this.courses, this.selectedSectionsMap);
  }

  // SELECTION HELPERS
  applySelectionMap(map, { celebrate = true } = {}) {
    this.selectedSectionsMap = sanitizeSelections(map, this.courses);
    this.saveSelections();
    this.previewSelectionMap = null;
    if (this.elDrawerOverlay) this.elDrawerOverlay.classList.remove("previewing");
    this.render();
    this.refreshDrawerIfOpen();
    if (celebrate) {
      arcadeAudio.playVictory();
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
    }
  }

  applyCombination(combo) {
    this.applySelectionMap(combo.selectionMap);
  }

  /** Ghosts a whole candidate schedule onto the timetable, or clears it. */
  setComboPreview(map) {
    const next = map || null;
    if (next === this.previewSelectionMap) return;
    this.previewSelectionMap = next;
    if (this.elDrawerOverlay) this.elDrawerOverlay.classList.toggle("previewing", !!next);
    this.renderTimetable();
  }

  getPreviewSections() {
    const map = this.previewSelectionMap;
    if (!map) return [];
    const out = [];
    this.courses.forEach(course => {
      if (isBusyCourse(course)) return;
      const previewId = map[course.id];
      if (!previewId || previewId === this.selectedSectionsMap[course.id]) return;
      const section = course.sections.find(s => s.id === previewId);
      if (section) out.push({ section, course });
    });
    return out;
  }

  toggleLock(sectionId) {
    const course = this.courseBySectionId.get(sectionId);
    if (!course || isBusyCourse(course)) return;
    if (this.locked.has(sectionId)) {
      this.locked.delete(sectionId);
    } else {
      course.sections.forEach(s => this.locked.delete(s.id));
      this.locked.add(sectionId);
      this.excluded.delete(sectionId);
      this.selectedSectionsMap[course.id] = sectionId;
    }
    this.saveSelections();
    this.savePersonExtras();
    this.invalidateCombinations();
    this.render();
    this.refreshDrawerIfOpen();
  }

  toggleExclude(sectionId) {
    const course = this.courseBySectionId.get(sectionId);
    if (!course || isBusyCourse(course)) return;
    if (this.excluded.has(sectionId)) {
      this.excluded.delete(sectionId);
    } else {
      this.excluded.add(sectionId);
      this.locked.delete(sectionId);
      if (this.selectedSectionsMap[course.id] === sectionId) delete this.selectedSectionsMap[course.id];
    }
    this.saveSelections();
    this.savePersonExtras();
    this.invalidateCombinations();
    this.render();
    this.refreshDrawerIfOpen();
  }

  // MAIN RENDER LOOP
  render() {
    // Compute the metrics once and share them: renderTimetable and
    // renderAnalytics previously each recomputed the same result.
    const selectedSections = this.getSelectedSections();
    const metrics = calculateScheduleMetrics(selectedSections, this.courses, this.courseBySectionId);

    renderPeopleBar(this);
    this.renderCourseList();
    this.renderTimetable(metrics);
    this.renderAnalytics(metrics);
    this.updateCombinationsBadge();
    this.updatePlansBadge();
  }

  updatePlansBadge() {
    if (!this.elPlansBadge) return;
    const count = this.plans ? this.plans.length : 0;
    this.elPlansBadge.textContent = String(count);
    this.elPlansBadge.classList.toggle("hidden", count === 0);
  }

  // RENDER LEFT SIDEBAR COURSE LIST
  renderCourseList() {
    const query = this.elSearchInput.value.toLowerCase().trim();
    this.elCourseList.innerHTML = "";

    const classCourses = this.courses.filter(c => !isBusyCourse(c));
    const busyCourses = this.courses.filter(c => isBusyCourse(c));
    const matches = (c) => c.code.toLowerCase().includes(query) || c.title.toLowerCase().includes(query);
    const filteredCourses = classCourses.filter(matches);
    const filteredBusy = busyCourses.filter(matches);

    let selectedCount = 0;

    if (filteredCourses.length === 0 && filteredBusy.length === 0) {
      if (this.courses.length === 0) {
        this.elCourseList.innerHTML = `
          <div class="empty-course-state">
            <div class="empty-icon">📚</div>
            <p class="empty-title">No Classes Added Yet</p>
            <p class="empty-sub">Add ${escapeHtml(this.activePerson.name)}'s classes manually or import them from text to build a schedule.</p>
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
      this.elSelectedCount.textContent = `0 / ${classCourses.length} Selected`;
      if (this.elMobileCoursesBadge) this.elMobileCoursesBadge.classList.add("hidden");
      return;
    }

    filteredCourses.forEach(course => {
      const selectedSecId = this.selectedSectionsMap[course.id];
      if (selectedSecId) selectedCount++;

      const card = document.createElement("div");
      card.className = "course-card";

      const displayBadge = course.code ? course.code : (course.title ? course.title.substring(0, 8).toUpperCase() : "COURSE");
      const lockedInCourse = course.sections.some(s => this.locked.has(s.id));

      card.innerHTML = `
        <div class="course-header">
          <span class="course-badge" style="background-color: ${safeColor(course.color)}">${escapeHtml(displayBadge)}</span>
          <div class="course-header-tools">
            ${lockedInCourse ? `<span class="course-locked-tag" title="A section of this course is locked">${getIconSvg('lock', 11)}</span>` : ''}
            <button class="btn btn-ghost icon-only btn-sm btn-delete-course" data-course-id="${escapeHtml(course.id)}" title="Remove course">&times;</button>
          </div>
        </div>
        <div class="sections-group">
          ${course.sections.map(sec => {
        const isSelected = selectedSecId === sec.id;
        const isLocked = this.locked.has(sec.id);
        const isExcluded = this.excluded.has(sec.id);
        const conflicts = getSectionConflicts(sec, this.selectedSectionsMap, this.courses);
        const hasConflict = conflicts.length > 0;

        const timeBadges = sec.times.map(t =>
          `<span class="time-tag">${escapeHtml(t.day)} ${escapeHtml(t.startTime)}-${escapeHtml(t.endTime)}</span>`
        ).join("");

        const conflictLabel = hasConflict
          ? (conflicts[0].conflictingIsBusy
            ? `Overlaps busy time: ${escapeHtml(conflicts[0].conflictingCourseCode)}`
            : `Overlaps ${escapeHtml(conflicts[0].conflictingCourseCode)} ${escapeHtml(conflicts[0].conflictingSecName)}`)
          : '';

        return `
              <div class="section-item ${isSelected ? 'selected' : ''} ${hasConflict && !isSelected ? 'has-conflict' : ''} ${isLocked ? 'locked' : ''} ${isExcluded ? 'excluded' : ''}"
                   data-course-id="${escapeHtml(course.id)}"
                   data-section-id="${escapeHtml(sec.id)}">
                <div class="section-top">
                  <label class="section-radio">
                    <input type="radio" name="radio-${escapeHtml(course.id)}" ${isSelected ? 'checked' : ''} ${isExcluded ? 'disabled' : ''}>
                    <span>${escapeHtml(sec.name)}</span>
                  </label>
                  <div class="section-tools">
                    <span class="section-instructor">${escapeHtml(sec.instructor)}</span>
                    <button type="button" class="section-tool btn-lock-section ${isLocked ? 'active' : ''}" data-section-id="${escapeHtml(sec.id)}"
                            title="${isLocked ? 'Unlock this section' : 'Lock: keep this section in every optimizer result'}" aria-pressed="${isLocked}">${getIconSvg('lock', 12)}</button>
                    <button type="button" class="section-tool btn-exclude-section ${isExcluded ? 'active' : ''}" data-section-id="${escapeHtml(sec.id)}"
                            title="${isExcluded ? 'Include this section again' : 'Exclude: skip this section (full, or just not for you)'}" aria-pressed="${isExcluded}">${getIconSvg('ban', 12)}</button>
                  </div>
                </div>
                <div class="section-location">${getIconSvg('map-pin', 12)} <span>${escapeHtml(sec.location)}</span></div>
                <div class="section-time-tags">${timeBadges}</div>
                ${hasConflict && !isSelected ? `
                  <div class="conflict-tag">
                    ${getIconSvg('alert-triangle', 12)} <span>${conflictLabel}</span>
                  </div>
                ` : ''}
                ${isExcluded ? `<div class="excluded-tag">Excluded from the optimizer</div>` : ''}
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
          if (this.excluded.has(sId)) return;
          arcadeAudio.playSelect();
          if (this.selectedSectionsMap[cId] === sId) {
            delete this.selectedSectionsMap[cId]; // Deselect
            if (this.locked.has(sId)) {
              this.locked.delete(sId);
              this.savePersonExtras();
              this.invalidateCombinations();
            }
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

      card.querySelectorAll(".btn-lock-section").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          arcadeAudio.playSelect();
          this.hoveredSection = null;
          this.toggleLock(btn.dataset.sectionId);
        });
      });
      card.querySelectorAll(".btn-exclude-section").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          arcadeAudio.playClick();
          this.hoveredSection = null;
          this.toggleExclude(btn.dataset.sectionId);
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

    if (filteredBusy.length > 0) {
      const group = document.createElement("div");
      group.className = "busy-group";
      group.innerHTML = `
        <div class="busy-group-title">${getIconSvg('ban', 12)} Busy times <span class="busy-group-hint">always kept free of classes</span></div>
        ${filteredBusy.map(course => `
          <div class="busy-card">
            <div class="course-header">
              <span class="course-badge busy-badge" style="${hatchStyle(course.color)}">${escapeHtml(course.code)}</span>
              <button class="btn btn-ghost icon-only btn-sm btn-delete-busy" data-course-id="${escapeHtml(course.id)}" title="Remove busy block">&times;</button>
            </div>
            <div class="section-time-tags">
              ${course.sections[0].times.map(t => `<span class="time-tag">${escapeHtml(t.day)} ${escapeHtml(t.startTime)}-${escapeHtml(t.endTime)}</span>`).join("")}
            </div>
          </div>
        `).join("")}
      `;
      group.querySelectorAll(".btn-delete-busy").forEach(btn => {
        btn.addEventListener("click", async () => {
          const course = this.courseById.get(btn.dataset.courseId);
          const confirmed = await showConfirm(`Remove the "${course ? course.code : "busy"}" busy block?`, "Remove Busy Block");
          if (!confirmed) return;
          this.courses = this.courses.filter(c => c.id !== btn.dataset.courseId);
          delete this.selectedSectionsMap[btn.dataset.courseId];
          this.saveCourses();
          this.saveSelections();
          this.render();
        });
      });
      this.elCourseList.appendChild(group);
    }

    this.elSelectedCount.textContent = `${selectedCount} / ${classCourses.length} Selected`;
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

    const selectedSections = this.getSelectedSections();
    const metrics = precomputedMetrics
      || calculateScheduleMetrics(selectedSections, this.courses, this.courseBySectionId);
    const friends = (this.showFriendOverlay && this.people.length > 1) ? this.getFriendData() : [];
    const previewSections = this.getPreviewSections();
    const dropIds = new Set(previewSections.map(p => this.selectedSectionsMap[p.course.id]).filter(Boolean));

    // The grid grows to fit whatever has to be drawn, but never shrinks below
    // the default 08:00-20:00 window.
    const rangeSlots = [...metrics.activeSlots, ...metrics.busySlots];
    if (this.hoveredSection) rangeSlots.push(...this.hoveredSection.times);
    previewSections.forEach(p => rangeSlots.push(...p.section.times));
    friends.forEach(f => rangeSlots.push(...f.metrics.activeSlots));
    const range = computeHourRange(rangeSlots);
    const startHour = range.startHour;
    const endHour = Math.max(DEFAULT_GRID_END_HOUR, range.endHour - 1);
    const rowCount = endHour - startHour + 1;
    const hourHeight = HOUR_HEIGHT_PX;
    this.elTimetableGrid.style.setProperty("--hour-count", rowCount);
    const yFor = (mins) => ((mins - (startHour * 60)) / 60) * hourHeight;

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

    // 2. Rows 2..N: Time Labels & Background Cells
    for (let h = startHour; h <= endHour; h++) {
      const rowIdx = h - startHour + 2; // Row 2 for the first hour, row 3 for the next...

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

    // Check conflicts
    const hasConflicts = this.checkGlobalConflicts(selectedSections);
    if (this.elConflictBanner) {
      if (hasConflicts) {
        this.elConflictBanner.classList.remove("hidden");
      } else {
        this.elConflictBanner.classList.add("hidden");
      }
    }

    const drawnSlots = [...metrics.activeSlots, ...metrics.busySlots];
    const overlapsAnother = (slot) => drawnSlots.some(other =>
      other !== slot && other.day === slot.day && Math.max(slot.startMins, other.startMins) < Math.min(slot.endMins, other.endMins)
    );

    // Friends in the same section as me: shown as a chip on my block rather
    // than as a second block on top of it.
    const sharedNames = new Map();     // my sectionId -> friend names
    const friendSharedIds = new Map(); // friend id -> Set of their sectionIds shared with me
    if (friends.length > 0) {
      const mine = { courses: this.courses, sections: selectedSections, metrics };
      friends.forEach(friend => {
        const t = computeTogetherness(mine, friend);
        friendSharedIds.set(friend.person.id, new Set(t.sameSections.map(s => s.theirSectionId)));
        t.sameSections.forEach(s => {
          if (!sharedNames.has(s.sectionId)) sharedNames.set(s.sectionId, []);
          sharedNames.get(s.sectionId).push(friend.person.name);
        });
      });
    }

    daysToDisplay.forEach((day, dayIdx) => {
      const colDiv = document.createElement("div");
      colDiv.className = "day-column-overlay";
      colDiv.style.gridColumn = `${dayIdx + 2}`;
      colDiv.style.gridRow = `2 / span ${rowCount}`;
      colDiv.style.position = "relative";
      colDiv.style.height = `${rowCount * hourHeight}px`;

      const dayBreakdown = metrics.dailyBreakdown[day];

      // A. Gap Hour Bands
      if (dayBreakdown && dayBreakdown.gapIntervals.length > 0) {
        dayBreakdown.gapIntervals.forEach(gap => {
          const gapBand = document.createElement("div");
          gapBand.className = "gap-band";
          gapBand.style.top = `${yFor(gap.startMins)}px`;
          gapBand.style.height = `${yFor(gap.endMins) - yFor(gap.startMins)}px`;
          gapBand.innerHTML = `
            <div class="gap-band-content">
              <span>${getIconSvg('clock', 12)} ${gap.durationHours} hr gap</span>
            </div>
          `;
          colDiv.appendChild(gapBand);
        });
      }

      // A2. Breaks shared with friends
      if (friends.length > 0 && dayBreakdown) {
        const segments = mergeSharedBreaks(
          dayBreakdown.gapIntervals,
          friends.map(f => ({ name: f.person.name, gaps: f.metrics.dailyBreakdown[day].gapIntervals }))
        );
        segments.forEach(seg => {
          const band = document.createElement("div");
          band.className = "together-band";
          band.style.top = `${yFor(seg.startMins)}px`;
          band.style.height = `${yFor(seg.endMins) - yFor(seg.startMins)}px`;
          band.innerHTML = `<span class="together-band-label">${getIconSvg('users', 11)} Free with ${escapeHtml(seg.names.join(" & "))}</span>`;
          band.title = `Free together ${Math.round(seg.durationMins)} min`;
          colDiv.appendChild(band);
        });
      }

      // A3. Friends' classes (outlined, behind mine)
      friends.forEach(friend => {
        const shared = friendSharedIds.get(friend.person.id) || new Set();
        friend.metrics.activeSlots
          .filter(s => s.day === day && !shared.has(s.sectionId))
          .forEach(slot => {
            const block = document.createElement("div");
            block.className = "friend-block";
            block.style.top = `${yFor(slot.startMins)}px`;
            block.style.height = `${yFor(slot.endMins) - yFor(slot.startMins)}px`;
            block.style.borderColor = safeColor(friend.person.color);
            block.style.color = safeColor(friend.person.color);
            block.innerHTML = `
              <div class="friend-block-name">${escapeHtml(friend.person.name)}</div>
              <div class="friend-block-code">${escapeHtml(slot.courseCode)}</div>
              <div class="event-time">${escapeHtml(slot.startTime)} - ${escapeHtml(slot.endTime)}</div>
            `;
            colDiv.appendChild(block);
          });
      });

      // B. Busy blocks
      metrics.busySlots.filter(s => s.day === day).forEach(slot => {
        const card = document.createElement("div");
        card.className = `calendar-event busy-block ${overlapsAnother(slot) ? 'busy-conflict' : ''}`;
        card.style.top = `${yFor(slot.startMins)}px`;
        card.style.height = `${yFor(slot.endMins) - yFor(slot.startMins)}px`;
        card.setAttribute("style", `${card.getAttribute("style")}; ${hatchStyle(slot.courseColor)}`);
        card.innerHTML = `
          <div>
            <div class="event-code">${escapeHtml(slot.courseCode)}</div>
            <div class="event-sec">busy</div>
          </div>
          <div class="event-time">${escapeHtml(slot.startTime)} - ${escapeHtml(slot.endTime)}</div>
        `;
        card.addEventListener("click", () => {
          arcadeAudio.playSelect();
          this.openEventDetailsSheet(slot);
        });
        colDiv.appendChild(card);
      });

      // C. Active Course Event Cards
      metrics.activeSlots.filter(s => s.day === day).forEach(slot => {
        const isConflicting = overlapsAnother(slot);
        const friendsHere = sharedNames.get(slot.sectionId);

        const card = document.createElement("div");
        card.className = `calendar-event ${isConflicting ? 'conflict-block' : ''} ${dropIds.has(slot.sectionId) ? 'will-drop' : ''}`;
        card.style.top = `${yFor(slot.startMins)}px`;
        card.style.height = `${yFor(slot.endMins) - yFor(slot.startMins)}px`;
        if (!isConflicting) {
          card.style.backgroundColor = slot.courseColor;
        }

        card.innerHTML = `
          <div>
            <div class="event-code">${escapeHtml(slot.courseCode)}</div>
            <div class="event-sec">${escapeHtml(slot.sectionName)}</div>
            ${friendsHere ? `<div class="event-friends">${getIconSvg('users', 10)} ${escapeHtml(friendsHere.join(", "))}</div>` : ''}
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

      // D. Hover Preview Block
      if (this.hoveredSection) {
        this.hoveredSection.times.filter(t => t.day === day).forEach(t => {
          const sMins = timeToMinutes(t.startTime);
          const eMins = timeToMinutes(t.endTime);

          const course = this.courseBySectionId.get(this.hoveredSection.id);

          const prevCard = document.createElement("div");
          prevCard.className = "calendar-event preview-block";
          prevCard.style.top = `${yFor(sMins)}px`;
          prevCard.style.height = `${yFor(eMins) - yFor(sMins)}px`;
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

      // E. Whole-schedule preview from the optimizer (hovered or focused card)
      previewSections.forEach(({ section, course }) => {
        section.times.filter(t => t.day === day).forEach(t => {
          const sMins = timeToMinutes(t.startTime);
          const eMins = timeToMinutes(t.endTime);
          const ghost = document.createElement("div");
          ghost.className = "calendar-event preview-block combo-preview";
          ghost.style.top = `${yFor(sMins)}px`;
          ghost.style.height = `${yFor(eMins) - yFor(sMins)}px`;
          ghost.style.backgroundColor = safeColor(course.color);
          ghost.innerHTML = `
            <div>
              <div class="event-code">${escapeHtml(course.code)}</div>
              <div class="event-sec">${escapeHtml(section.name)}</div>
            </div>
            <div class="event-time">${escapeHtml(t.startTime)} - ${escapeHtml(t.endTime)}</div>
          `;
          colDiv.appendChild(ghost);
        });
      });

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

    // Preference match score
    this.renderScoreCard(metrics);

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

    renderTogetherCard(this, metrics);
    renderHeatmapPanel(this);
  }

  renderScoreCard(metrics) {
    if (!this.elScoreCard) return;
    const result = this.getCurrentScore(metrics);
    if (!result) {
      this.elScoreCard.classList.add("hidden");
      return;
    }
    this.elScoreCard.classList.remove("hidden");
    const combos = this.getCombinations();
    const fill = this.elScoreCard.querySelector("#score-bar-fill");
    const value = this.elScoreCard.querySelector("#score-value");
    const rank = this.elScoreCard.querySelector("#score-rank");
    const hint = this.elScoreCard.querySelector("#score-hint");
    if (fill) fill.style.width = `${result.score}%`;
    if (value) value.textContent = `${result.score} / 100`;
    if (rank) {
      rank.textContent = result.rank;
      rank.dataset.rank = result.rank;
    }
    if (hint) {
      hint.textContent = `Relative to ${combos.length >= MAX_COMBINATIONS ? `${MAX_COMBINATIONS}+` : combos.length} valid schedule${combos.length === 1 ? "" : "s"} and your weights`;
    }
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
    this.focusedComboIdx = null;
    renderPreferencesPanel(this);
    this.syncSortTabs();
    this.elDrawerOverlay.classList.remove("hidden");
    this.renderCombinationsDrawer();
    this.focusDrawer();
  }

  /**
   * Moves keyboard focus into the drawer. Without this the button that opened
   * it keeps focus, so Enter re-triggers that button instead of applying the
   * focused option.
   */
  focusDrawer() {
    const content = this.elDrawerOverlay && this.elDrawerOverlay.querySelector(".drawer-content");
    if (content && typeof content.focus === "function") content.focus({ preventScroll: true });
  }

  closeDrawer() {
    if (!this.elDrawerOverlay) return;
    this.elDrawerOverlay.classList.add("hidden");
    this.focusedComboIdx = null;
    this.setComboPreview(null);
    if (this.elSurpriseTicker) this.elSurpriseTicker.classList.add("hidden");
  }

  refreshDrawerIfOpen() {
    if (this.elDrawerOverlay && !this.elDrawerOverlay.classList.contains("hidden")) {
      this.renderCombinationsDrawer();
    }
  }

  syncSortTabs() {
    document.querySelectorAll(".filter-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.sort === this.sortPreference);
    });
  }

  moveComboFocus(delta) {
    const count = this._visibleCombos.length;
    if (count === 0) return;
    let idx;
    if (this.focusedComboIdx === null) idx = delta > 0 ? 0 : count - 1;
    else idx = Math.min(count - 1, Math.max(0, this.focusedComboIdx + delta));
    this.setComboFocus(idx);
  }

  setComboFocus(idx) {
    this.focusedComboIdx = idx;
    const cards = this.elCombinationsList.querySelectorAll(".combo-card");
    cards.forEach(card => card.classList.toggle("focused", Number(card.dataset.comboIdx) === idx));
    const card = cards[idx];
    if (card && typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "nearest" });
    const combo = this._visibleCombos[idx];
    if (combo) {
      arcadeAudio.playClick();
      this.setComboPreview(combo.selectionMap);
    }
    this.focusDrawer();
  }

  /**
   * Counts pairs of classes on the same day separated by 10 minutes or less.
   * Kept for callers that pass a combination; the value now comes straight
   * from the metrics.
   */
  countBackToBack(combo) {
    return combo.metrics.backToBackCount;
  }

  renderCombinationsDrawer() {
    const allCombos = this.getCombinations();
    const cappedAtLimit = allCombos.length >= MAX_COMBINATIONS;
    const ranges = this.getScoreRanges();
    const friends = this.getFriendData();
    const limitsOn = hasHardLimits(this.prefs);

    const friendsTab = document.getElementById("filter-tab-friends");
    if (friendsTab) friendsTab.classList.toggle("hidden", friends.length === 0);
    if (this.sortPreference === "friends" && friends.length === 0) {
      this.sortPreference = "gaps";
      this.syncSortTabs();
    }

    // Decorate once per render; these depend on preferences and on friends'
    // current picks, both of which can change between renders.
    allCombos.forEach(combo => {
      combo._score = scoreSchedule(combo.metrics, ranges, this.prefs.weights);
      combo._constraints = limitsOn ? evaluateConstraints(combo.metrics, this.prefs) : { ok: true, violations: [] };
      if (friends.length > 0) {
        const mine = { sections: combo.sections, courses: this.courses, metrics: combo.metrics };
        combo._together = Number(friends.reduce((sum, f) => sum + computeTogetherness(mine, f).togetherHours, 0).toFixed(1));
      } else {
        combo._together = 0;
      }
    });

    let combos = allCombos.slice();
    const hiddenCount = limitsOn && this.hideViolations ? combos.filter(c => !c._constraints.ok).length : 0;
    if (limitsOn && this.hideViolations) combos = combos.filter(c => c._constraints.ok);

    // Sort a shallow copy so the memoized cache keeps a stable order.
    if (this.sortPreference === 'gaps') {
      combos.sort((a, b) => a.metrics.totalGapHours - b.metrics.totalGapHours);
    } else if (this.sortPreference === 'daysoff') {
      combos.sort((a, b) => b.metrics.daysOffCount - a.metrics.daysOffCount);
    } else if (this.sortPreference === 'mornings') {
      combos.sort((a, b) => a.metrics.earlyClassCount - b.metrics.earlyClassCount);
    } else if (this.sortPreference === 'spread') {
      combos.sort((a, b) => a.metrics.backToBackCount - b.metrics.backToBackCount);
    } else if (this.sortPreference === 'score') {
      combos.sort((a, b) => b._score - a._score || a.metrics.totalGapHours - b.metrics.totalGapHours);
    } else if (this.sortPreference === 'friends') {
      combos.sort((a, b) => b._together - a._together || a.metrics.totalGapHours - b.metrics.totalGapHours);
    }

    let backupInfo = null;
    this._backupChanges = new Map();
    if (this.sortPreference === 'backup') {
      const scored = combos
        .map(combo => ({ combo, changes: diffSelections(this.selectedSectionsMap, combo.selectionMap, this.courses) }))
        .filter(x => x.changes.length >= 1 && x.changes.length <= 2)
        .sort((a, b) => a.changes.length - b.changes.length || a.combo.metrics.totalGapHours - b.combo.metrics.totalGapHours);
      backupInfo = { oneSwap: scored.filter(x => x.changes.length === 1).length, total: scored.length };
      scored.forEach(x => this._backupChanges.set(x.combo, x.changes));
      combos = scored.map(x => x.combo);
    }

    this._listedCombos = combos;
    this.focusedComboIdx = null;

    // Summary line
    if (this.sortPreference === 'backup') {
      const classCourses = this.courses.filter(c => !isBusyCourse(c));
      const picked = classCourses.filter(c => this.selectedSectionsMap[c.id]).length;
      this.elComboSummaryText.textContent = backupInfo.oneSwap > 0
        ? `${backupInfo.oneSwap} one-swap backup${backupInfo.oneSwap === 1 ? "" : "s"} for your current picks${backupInfo.total > backupInfo.oneSwap ? `, plus ${backupInfo.total - backupInfo.oneSwap} two-swap` : ""}`
        : (picked < classCourses.length
          ? `Pick a section for every course (${picked}/${classCourses.length} done) to get useful backups`
          : `No close alternatives: every other valid schedule changes 3+ sections`);
    } else {
      const base = cappedAtLimit
        ? `Showing the first ${MAX_COMBINATIONS} valid schedules — narrow your course list for a complete search`
        : `Found ${allCombos.length} valid non-conflicting schedules`;
      this.elComboSummaryText.textContent = hiddenCount > 0 ? `${base} · ${hiddenCount} hidden by your limits` : base;
    }

    // Notes: locks, exclusions, skipped courses, hidden schedules.
    const notes = [];
    const lockedNames = [...this.locked].map(id => {
      const course = this.courseBySectionId.get(id);
      const section = this.sectionById.get(id);
      return course && section ? `${escapeHtml(course.code)} ${escapeHtml(section.name)}` : null;
    }).filter(Boolean);
    if (lockedNames.length > 0 || this.excluded.size > 0) {
      const parts = [];
      if (lockedNames.length > 0) parts.push(`${getIconSvg('lock', 11)} Locked: ${lockedNames.join(", ")}`);
      if (this.excluded.size > 0) parts.push(`${getIconSvg('ban', 11)} ${this.excluded.size} section${this.excluded.size === 1 ? "" : "s"} excluded`);
      notes.push(`<div class="combo-note">${parts.join(" · ")} <button type="button" class="link-button" data-action="reset-locks">Reset</button></div>`);
    }
    const skipped = this.courses.filter(c => !isBusyCourse(c) && c.sections.length > 0 && c.sections.every(s => this.excluded.has(s.id)));
    if (skipped.length > 0) {
      notes.push(`<div class="combo-note warning">${getIconSvg('alert-triangle', 11)} Left out because every section is excluded: ${skipped.map(c => escapeHtml(c.code)).join(", ")}</div>`);
    }
    if (limitsOn) {
      const summary = summarizeHardLimits(this.prefs).join(", ");
      if (hiddenCount > 0) {
        notes.push(`<div class="combo-note">${hiddenCount} schedule${hiddenCount === 1 ? "" : "s"} hidden by your limits (${escapeHtml(summary)}) <button type="button" class="link-button" data-action="show-hidden">Show them</button></div>`);
      } else if (!this.hideViolations) {
        notes.push(`<div class="combo-note">Showing schedules that break your limits (${escapeHtml(summary)}) <button type="button" class="link-button" data-action="show-hidden">Hide them</button></div>`);
      }
    }
    if (this.elComboNotes) {
      this.elComboNotes.innerHTML = notes.join("");
      this.elComboNotes.classList.toggle("hidden", notes.length === 0);
    }

    this.elCombinationsList.innerHTML = "";

    if (combos.length === 0) {
      const reason = allCombos.length === 0
        ? `<p>No non-conflicting schedule combinations found.</p><p style="font-size: 0.8rem; margin-top: 8px;">Try removing or editing conflicting course sections, busy blocks or exclusions.</p>`
        : (this.sortPreference === 'backup'
          ? `<p>No backup schedules within two swaps of your current picks.</p>`
          : `<p>Every valid schedule breaks one of your limits.</p><p style="font-size: 0.8rem; margin-top: 8px;">Loosen a limit in Preferences, or show them anyway.</p>`);
      this.elCombinationsList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-secondary);">${reason}</div>
      `;
      this._visibleCombos = [];
      return;
    }

    // Only the best N are worth rendering — nobody compares thousands of cards,
    // and building one DOM card each is what actually froze the tab.
    const visibleCombos = combos.slice(0, RENDERED_COMBO_LIMIT);
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

      const b2bCount = combo.metrics.backToBackCount;
      const changes = this._backupChanges.get(combo);
      const violations = combo._constraints.violations;

      card.innerHTML = `
        <div class="combo-card-header">
          <span class="combo-rank">Option #${idx + 1} ${isActive ? ' (Current Active)' : ''}</span>
          <span class="score-pill" title="Preference match score, relative to every valid schedule">${combo._score} <small>${scoreRank(combo._score)}</small></span>
        </div>
        <div class="combo-metrics">
          <span>${getIconSvg('clock', 13)} ${combo.metrics.totalGapHours}h gap</span>
          <span>${getIconSvg('building', 13)} ${combo.metrics.totalCampusHours}h campus</span>
          <span>${getIconSvg('sun', 13)} ${combo.metrics.daysOffCount} days off</span>
          <span>${b2bCount === 0 ? getIconSvg('check-circle', 13) : getIconSvg('alert-triangle', 13)} ${b2bCount} back-to-back</span>
          ${friends.length > 0 ? `<span class="together-metric">${getIconSvg('users', 13)} ${combo._together}h with friends</span>` : ''}
        </div>
        ${changes ? `<div class="combo-swap">${getIconSvg('swap', 12)} ${changes.map(c => `<b>${escapeHtml(c.courseCode)}</b> ${c.fromName ? `${escapeHtml(c.fromName)} → ` : ''}${escapeHtml(c.toName)}`).join(" · ")}</div>` : ''}
        ${violations.length > 0 ? `<div class="combo-violation">${getIconSvg('alert-triangle', 12)} Breaks your limits: ${violations.map(v => escapeHtml(v.text)).join("; ")}</div>` : ''}
        <div class="combo-sections-list">
          ${combo.sections.map(sec => {
        const course = this.courseBySectionId.get(sec.id);
        if (!course || isBusyCourse(course)) return '';
        return `<span class="combo-section-chip" style="background-color: ${safeColor(course.color)}">${escapeHtml(course.code)} ${escapeHtml(sec.name)}</span>`;
      }).join("")}
        </div>
        <button class="btn btn-sm ${isActive ? 'btn-outline' : 'btn-primary'} btn-apply-combo" style="margin-top: 6px;">
          ${isActive ? 'Selected' : 'Apply Schedule'}
        </button>
      `;

      fragment.appendChild(card);
    });

    this.elCombinationsList.appendChild(fragment);

    if (combos.length > visibleCombos.length) {
      const note = document.createElement("p");
      note.className = "combo-truncation-note";
      note.textContent = `Showing the top ${visibleCombos.length} of ${combos.length} schedules for this sort order.`;
      this.elCombinationsList.appendChild(note);
    }
  }
}

// Offline support: the service worker caches the app shell so the planner
// keeps working without a connection once it has been opened once.
function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Offline support is a progressive enhancement; the app works without it.
    });
  });
}

// INITIALIZE APP ON DOM LOADED (or immediately if DOM is already parsed)
function initApp() {
  installGlobalAlertOverrides();
  window.app = new UniScheduleApp();
  registerServiceWorker();
}

if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
