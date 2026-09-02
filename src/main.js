import confetti from 'canvas-confetti';
import { INITIAL_COURSES, PALETTE_COLORS } from './data/sampleCourses.js';
import {
  DAYS,
  FULL_DAYS,
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
const STORAGE_KEY_COURSES = "unischedule_courses_v2";
const STORAGE_KEY_SELECTIONS = "unischedule_selections_v2";
const STORAGE_KEY_MODE = "unischedule_mode_v1";
const STORAGE_KEY_THEME = "unischedule_theme_v1";

class UniScheduleApp {
  constructor() {
    this.courses = this.loadCourses();
    this.selectedSectionsMap = this.loadSelections();
    this.hoveredSection = null;
    this.showWeekends = true; // Default to showing weekends (Sun) as user has Sun classes
    this.sortPreference = 'gaps'; // 'gaps' | 'daysoff' | 'mornings' | 'spread'
    this.currentMode = this.loadMode();
    this.currentTheme = this.loadTheme();

    this.initElements();
    this.applyMode(this.currentMode);
    this.applyTheme(this.currentTheme);
    this.initEventListeners();

    // Check showWeekends toggle element
    if (this.elToggleWeekends) {
      this.elToggleWeekends.checked = true;
    }

    this.initCustomCourseFormState();
    this.render();
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
            <input type="text" class="input-sec-name" data-sec-idx="${secIdx}" value="${sec.name}" placeholder="e.g. Sec 01" required />
          </div>
          <div class="form-group">
            <label>Instructor <span class="optional-tag">(optional)</span></label>
            <input type="text" class="input-sec-instructor" data-sec-idx="${secIdx}" value="${sec.instructor}" placeholder="e.g. Dr. Turing" />
          </div>
          <div class="form-group full-width">
            <label>Location / Room <span class="optional-tag">(optional)</span></label>
            <input type="text" class="input-sec-location" data-sec-idx="${secIdx}" value="${sec.location}" placeholder="e.g. Science Bldg 101" />
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
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error("Failed to parse saved courses", e);
    }
    return JSON.parse(JSON.stringify(INITIAL_COURSES));
  }

  saveCourses() {
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
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
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
  }

  initEventListeners() {
    // Search Filter
    this.elSearchInput.addEventListener("input", () => this.renderCourseList());

    // Show Weekends toggle
    this.elToggleWeekends.addEventListener("change", (e) => {
      this.showWeekends = e.target.checked;
      arcadeAudio.playClick();
      this.renderTimetable();
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

    // Reset Demo
    this.btnResetDemo.addEventListener("click", async () => {
      arcadeAudio.playClick();
      const confirmed = await showConfirm("Reset to default sample university courses?", "Reset Planner");
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

    // Resolve Conflict Button
    this.btnResolveConflict.addEventListener("click", () => {
      arcadeAudio.playAutoFix();
      this.openAutoCombinationsDrawer();
    });

    // Auto-Combinations Drawer
    this.btnAutoCombos.addEventListener("click", () => {
      arcadeAudio.playAutoFix();
      this.openAutoCombinationsDrawer();
    });
    this.btnCloseDrawer.addEventListener("click", () => {
      arcadeAudio.playClick();
      this.elDrawerOverlay.classList.add("hidden");
    });
    this.elDrawerOverlay.addEventListener("click", (e) => {
      if (e.target === this.elDrawerOverlay) this.elDrawerOverlay.classList.add("hidden");
    });

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
    this.btnImportModal.addEventListener("click", () => {
      arcadeAudio.playClick();
      this.elModalOverlay.classList.remove("hidden");
    });
    this.btnCloseModal.addEventListener("click", () => {
      arcadeAudio.playClick();
      this.elModalOverlay.classList.add("hidden");
    });
    this.elModalOverlay.addEventListener("click", (e) => {
      if (e.target === this.elModalOverlay) this.elModalOverlay.classList.add("hidden");
    });

    // Modal Tabs
    document.querySelectorAll(".modal-tab").forEach(tab => {
      tab.addEventListener("click", (e) => {
        arcadeAudio.playClick();
        document.querySelectorAll(".modal-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
        e.target.classList.add("active");
        document.getElementById(`tab-${e.target.dataset.tab}`).classList.add("active");
      });
    });

    // Load Sample Text
    this.btnLoadSampleText.addEventListener("click", () => {
      arcadeAudio.playClick();
      this.elImportTextarea.value = `CS101 Intro to Computer Science\nSec 01 - Dr. Turing - Mon/Wed 09:00-10:30 Tech Bldg 101\nSec 02 - Grace Hopper - Tue/Thu 11:00-12:30 Tech Bldg 102\n\nMATH201 Calculus II\nSec 01: Mon/Wed 11:00-12:30 Math Hall 301\nSec 02: Tue/Thu 09:00-10:30 Math Hall 304`;
    });

    // Parse Import Text
    this.btnParseImport.addEventListener("click", async () => {
      const rawText = this.elImportTextarea.value;
      const parsed = parseRawTextToCourses(rawText);
      if (parsed.length === 0) {
        await showAlert("Could not parse valid course details. Please ensure day and time formats (e.g. Mon 09:00-10:30) are included.", "Import Error");
        return;
      }
      this.courses = [...this.courses, ...parsed];
      parsed.forEach(c => {
        if (c.sections[0]) this.selectedSectionsMap[c.id] = c.sections[0].id;
      });
      this.saveCourses();
      this.saveSelections();
      this.elModalOverlay.classList.add("hidden");
      this.render();
    });

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

      const title = document.getElementById("manual-title").value.trim();
      let code = document.getElementById("manual-code").value.trim().toUpperCase();
      const color = document.getElementById("manual-color").value || "#6366f1";

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
      this.elModalOverlay.classList.add("hidden");
      arcadeAudio.playVictory();
      this.render();
    });

    // Export iCal
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

  // GET ACTIVE SELECTIONS ARRAY
  getSelectedSections() {
    const list = [];
    for (const [courseId, secId] of Object.entries(this.selectedSectionsMap)) {
      if (!secId) continue;
      const course = this.courses.find(c => c.id === courseId);
      if (course) {
        const sec = course.sections.find(s => s.id === secId);
        if (sec) list.push(sec);
      }
    }
    return list;
  }

  // MAIN RENDER LOOP
  render() {
    this.renderCourseList();
    this.renderTimetable();
    this.renderAnalytics();
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
            No courses match "${query}"
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
          <span class="course-badge" style="background-color: ${course.color}">${displayBadge}</span>
          <span class="course-title" title="${displayTitle}">${displayTitle}</span>
          <button class="btn btn-ghost icon-only btn-sm btn-delete-course" data-course-id="${course.id}" title="Remove course">&times;</button>
        </div>
        <div class="sections-group">
          ${course.sections.map(sec => {
        const isSelected = selectedSecId === sec.id;
        const conflicts = getSectionConflicts(sec, this.selectedSectionsMap, this.courses);
        const hasConflict = conflicts.length > 0;

        const timeBadges = sec.times.map(t =>
          `<span class="time-tag">${t.day} ${t.startTime}-${t.endTime}</span>`
        ).join("");

        return `
              <div class="section-item ${isSelected ? 'selected' : ''} ${hasConflict && !isSelected ? 'has-conflict' : ''}" 
                   data-course-id="${course.id}" 
                   data-section-id="${sec.id}">
                <div class="section-top">
                  <label class="section-radio">
                    <input type="radio" name="radio-${course.id}" ${isSelected ? 'checked' : ''}>
                    <span>${sec.name}</span>
                  </label>
                  <span class="section-instructor">${sec.instructor}</span>
                </div>
                <div class="section-location">${getIconSvg('map-pin', 12)} <span>${sec.location}</span></div>
                <div class="section-time-tags">${timeBadges}</div>
                ${hasConflict && !isSelected ? `
                  <div class="conflict-tag">
                    ${getIconSvg('alert-triangle', 12)} <span>Overlaps ${conflicts[0].conflictingCourseCode} ${conflicts[0].conflictingSecName}</span>
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

        // Hover to preview
        item.addEventListener("mouseenter", () => {
          this.hoveredSection = sectionObj;
          this.renderTimetable();
        });
        item.addEventListener("mouseleave", () => {
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
  }


  // RENDER VISUAL TIMETABLE MATRIX
  renderTimetable() {
    this.elTimetableGrid = document.getElementById("timetable-grid");
    if (!this.elTimetableGrid) return;

    const daysToDisplay = this.showWeekends ? DAYS : DAYS.slice(0, 5); // Mon-Fri or Mon-Sun
    const gridCols = daysToDisplay.length;
    this.elTimetableGrid.style.setProperty("--day-count", gridCols);
    this.elTimetableGrid.innerHTML = "";

    const startHour = 8;
    const endHour = 20; // 13 hours total (08:00 to 20:00)
    const hourHeight = 70; // 1 hour = 70px (matching style.css 70px grid rows)

    // 1. Row 1: Header Cells
    const cornerCell = document.createElement("div");
    cornerCell.className = "time-header-cell";
    cornerCell.style.gridColumn = "1";
    cornerCell.style.gridRow = "1";
    cornerCell.textContent = "Time";
    this.elTimetableGrid.appendChild(cornerCell);

    daysToDisplay.forEach((day, dayIdx) => {
      const dayCell = document.createElement("div");
      dayCell.className = "day-header-cell";
      dayCell.style.gridColumn = `${dayIdx + 2}`;
      dayCell.style.gridRow = "1";
      dayCell.innerHTML = `
        <div class="day-name">${FULL_DAYS[day]}</div>
        <div class="day-sub">${day}</div>
      `;
      this.elTimetableGrid.appendChild(dayCell);
    });

    // 2. Rows 2 to 14: Time Labels & Background Cells
    for (let h = startHour; h <= endHour; h++) {
      const rowIdx = h - startHour + 2; // Row 2 for 8:00 AM, Row 3 for 9:00 AM...

      const timeLabelCell = document.createElement("div");
      timeLabelCell.className = "time-slot-label";
      timeLabelCell.style.gridColumn = "1";
      timeLabelCell.style.gridRow = `${rowIdx}`;
      timeLabelCell.textContent = format12h(`${String(h).padStart(2, '0')}:00`);
      this.elTimetableGrid.appendChild(timeLabelCell);

      daysToDisplay.forEach((day, dayIdx) => {
        const bgCell = document.createElement("div");
        bgCell.className = "time-slot-cell";
        bgCell.style.gridColumn = `${dayIdx + 2}`;
        bgCell.style.gridRow = `${rowIdx}`;
        bgCell.style.borderBottom = "1px solid var(--border-color)";
        bgCell.style.borderRight = "1px solid var(--border-color)";
        this.elTimetableGrid.appendChild(bgCell);
      });
    }

    // 3. Day Column Overlays (Positioned Event Cards)
    const selectedSections = this.getSelectedSections();
    const metrics = calculateScheduleMetrics(selectedSections, this.courses);

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
            <div class="event-code">${slot.courseCode}</div>
            <div class="event-sec">${slot.sectionName}</div>
          </div>
          <div>
            <div class="event-location">${getIconSvg('map-pin', 11)} <span>${slot.location}</span></div>
            <div class="event-time">${slot.startTime} - ${slot.endTime}</div>
          </div>
        `;

        colDiv.appendChild(card);
      });

      // C. Hover Preview Block
      if (this.hoveredSection) {
        this.hoveredSection.times.filter(t => t.day === day).forEach(t => {
          const sMins = timeToMinutes(t.startTime);
          const eMins = timeToMinutes(t.endTime);
          const topPx = ((sMins - (startHour * 60)) / 60) * hourHeight;
          const heightPx = ((eMins - sMins) / 60) * hourHeight;

          const course = this.courses.find(c => c.sections.some(s => s.id === this.hoveredSection.id));

          const prevCard = document.createElement("div");
          prevCard.className = "calendar-event preview-block";
          prevCard.style.top = `${topPx}px`;
          prevCard.style.height = `${heightPx}px`;
          prevCard.style.backgroundColor = course ? course.color : "#6366f1";

          prevCard.innerHTML = `
            <div>
              <div class="event-code">${course ? course.code : 'Preview'}</div>
              <div class="event-sec">${this.hoveredSection.name} (Hover)</div>
            </div>
            <div class="event-time">${t.startTime} - ${t.endTime}</div>
          `;

          colDiv.appendChild(prevCard);
        });
      }

      this.elTimetableGrid.appendChild(colDiv);
    });
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
  renderAnalytics() {
    const selectedSecs = this.getSelectedSections();
    const metrics = calculateScheduleMetrics(selectedSecs, this.courses);

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
      tag.innerHTML = `${iconSvg}<span>${b.text}</span>`;
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
    const validCombos = generateAllCombinations(this.courses);
    this.badgeCombosCount.textContent = validCombos.length;
  }

  // OPEN & RENDER AUTO-COMBINATIONS DRAWER
  openAutoCombinationsDrawer() {
    this.elDrawerOverlay.classList.remove("hidden");
    this.renderCombinationsDrawer();
  }

  renderCombinationsDrawer() {
    const validCombos = generateAllCombinations(this.courses);
    this.elComboSummaryText.textContent = `Found ${validCombos.length} valid non-conflicting schedules`;

    // Sort Combinations
    if (this.sortPreference === 'gaps') {
      validCombos.sort((a, b) => a.metrics.totalGapHours - b.metrics.totalGapHours);
    } else if (this.sortPreference === 'daysoff') {
      validCombos.sort((a, b) => b.metrics.daysOffCount - a.metrics.daysOffCount);
    } else if (this.sortPreference === 'mornings') {
      validCombos.sort((a, b) => {
        const earlyA = a.metrics.activeSlots.filter(s => s.startMins < 540).length;
        const earlyB = b.metrics.activeSlots.filter(s => s.startMins < 540).length;
        return earlyA - earlyB;
      });
    } else if (this.sortPreference === 'spread') {
      // Count back-to-back classes: pairs on the same day where the gap is <= 10 min
      const countBackToBack = (combo) => {
        let count = 0;
        const slotsByDay = {};
        combo.metrics.activeSlots.forEach(s => {
          if (!slotsByDay[s.day]) slotsByDay[s.day] = [];
          slotsByDay[s.day].push(s);
        });
        Object.values(slotsByDay).forEach(daySlots => {
          daySlots.sort((a, b) => a.startMins - b.startMins);
          for (let i = 1; i < daySlots.length; i++) {
            const prevEnd = daySlots[i - 1].endMins;
            const currStart = daySlots[i].startMins;
            if (currStart - prevEnd <= 10) count++;
          }
        });
        return count;
      };
      validCombos.sort((a, b) => countBackToBack(a) - countBackToBack(b));
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

    validCombos.forEach((combo, idx) => {
      const card = document.createElement("div");
      card.className = "combo-card";

      // Check if this combo matches current active selection
      const isActive = Object.entries(combo.selectionMap).every(
        ([cId, sId]) => this.selectedSectionsMap[cId] === sId
      );

      if (isActive) card.classList.add("active-combo");

      // Count back-to-back classes for this combo
      let b2bCount = 0;
      const slotsByDay = {};
      combo.metrics.activeSlots.forEach(s => {
        if (!slotsByDay[s.day]) slotsByDay[s.day] = [];
        slotsByDay[s.day].push(s);
      });
      Object.values(slotsByDay).forEach(daySlots => {
        daySlots.sort((a, b) => a.startMins - b.startMins);
        for (let i = 1; i < daySlots.length; i++) {
          if (daySlots[i].startMins - daySlots[i - 1].endMins <= 10) b2bCount++;
        }
      });

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
        const course = this.courses.find(c => c.sections.some(s => s.id === sec.id));
        return `<span class="combo-section-chip" style="background-color: ${course ? course.color : '#6366f1'}">${course ? course.code : ''} ${sec.name}</span>`;
      }).join("")}
        </div>
        <button class="btn btn-sm ${isActive ? 'btn-outline' : 'btn-primary'} btn-apply-combo" style="margin-top: 6px;">
          ${isActive ? 'Selected' : 'Apply Schedule'}
        </button>
      `;

      card.querySelector(".btn-apply-combo").addEventListener("click", () => {
        arcadeAudio.playVictory();
        this.selectedSectionsMap = { ...combo.selectionMap };
        this.saveSelections();
        this.render();
        this.renderCombinationsDrawer();
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
      });

      this.elCombinationsList.appendChild(card);
    });
  }
}

// INITIALIZE APP ON DOM LOADED
document.addEventListener("DOMContentLoaded", () => {
  installGlobalAlertOverrides();
  window.app = new UniScheduleApp();
});
