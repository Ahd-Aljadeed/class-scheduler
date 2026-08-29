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

// LOCAL STORAGE KEYS
const STORAGE_KEY_COURSES = "unischedule_courses_v1";
const STORAGE_KEY_SELECTIONS = "unischedule_selections_v1";

class UniScheduleApp {
  constructor() {
    this.courses = this.loadCourses();
    this.selectedSectionsMap = this.loadSelections();
    this.hoveredSection = null;
    this.showWeekends = true; // Default to showing weekends (Sun) as user has Sun classes
    this.sortPreference = 'gaps'; // 'gaps' | 'daysoff' | 'mornings' | 'spread'

    this.initElements();
    this.initEventListeners();

    // Check showWeekends toggle element
    if (this.elToggleWeekends) {
      this.elToggleWeekends.checked = true;
    }

    this.render();
  }

  // LOAD / SAVE PERSISTENCE
  loadCourses() {
    // Return the updated user course data directly
    return JSON.parse(JSON.stringify(INITIAL_COURSES));
  }

  saveCourses() {
    localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(this.courses));
  }

  loadSelections() {
    // Default optimal non-conflicting schedule selection:
    // Compiler Sec 1, Data Mining Sec 1, Image Processing Sec 1, Research Sec 2, IoT Sec 1
    return {
      "course-compiler": "sec-compiler-1",
      "course-dm": "sec-dm-1",
      "course-ipcv": "sec-ipcv-1",
      "course-rm": "sec-rm-2",
      "course-iot": "sec-iot-1"
    };
  }

  saveSelections() {
    localStorage.setItem(STORAGE_KEY_SELECTIONS, JSON.stringify(this.selectedSectionsMap));
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
    this.btnThemeToggle = document.getElementById("btn-theme-toggle");

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
      this.renderTimetable();
    });

    // Theme toggle
    this.btnThemeToggle.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", newTheme);
      document.getElementById("theme-icon-sun").classList.toggle("hidden", newTheme === "light");
      document.getElementById("theme-icon-moon").classList.toggle("hidden", newTheme === "dark");
    });

    // Reset Demo
    this.btnResetDemo.addEventListener("click", () => {
      if (confirm("Reset to default sample university courses?")) {
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
      this.openAutoCombinationsDrawer();
    });

    // Auto-Combinations Drawer
    this.btnAutoCombos.addEventListener("click", () => this.openAutoCombinationsDrawer());
    this.btnCloseDrawer.addEventListener("click", () => this.elDrawerOverlay.classList.add("hidden"));
    this.elDrawerOverlay.addEventListener("click", (e) => {
      if (e.target === this.elDrawerOverlay) this.elDrawerOverlay.classList.add("hidden");
    });

    // Sort Filter Tabs in Drawer
    document.querySelectorAll(".filter-tab").forEach(btn => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".filter-tab").forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        this.sortPreference = e.target.dataset.sort;
        this.renderCombinationsDrawer();
      });
    });

    // Import Modal
    this.btnImportModal.addEventListener("click", () => this.elModalOverlay.classList.remove("hidden"));
    this.btnCloseModal.addEventListener("click", () => this.elModalOverlay.classList.add("hidden"));
    this.elModalOverlay.addEventListener("click", (e) => {
      if (e.target === this.elModalOverlay) this.elModalOverlay.classList.add("hidden");
    });

    // Modal Tabs
    document.querySelectorAll(".modal-tab").forEach(tab => {
      tab.addEventListener("click", (e) => {
        document.querySelectorAll(".modal-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
        e.target.classList.add("active");
        document.getElementById(`tab-${e.target.dataset.tab}`).classList.add("active");
      });
    });

    // Load Sample Text
    this.btnLoadSampleText.addEventListener("click", () => {
      this.elImportTextarea.value = `CS101 Intro to Computer Science\nSec 01 - Dr. Turing - Mon/Wed 09:00-10:30 Tech Bldg 101\nSec 02 - Grace Hopper - Tue/Thu 11:00-12:30 Tech Bldg 102\n\nMATH201 Calculus II\nSec 01: Mon/Wed 11:00-12:30 Math Hall 301\nSec 02: Tue/Thu 09:00-10:30 Math Hall 304`;
    });

    // Parse Import Text
    this.btnParseImport.addEventListener("click", () => {
      const rawText = this.elImportTextarea.value;
      const parsed = parseRawTextToCourses(rawText);
      if (parsed.length === 0) {
        alert("Could not parse valid course details. Please ensure day and time formats (e.g. Mon 09:00-10:30) are included.");
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

    // Manual Course Form Submit
    this.formManualCourse.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = document.getElementById("manual-code").value.trim().toUpperCase();
      const title = document.getElementById("manual-title").value.trim();
      const color = document.getElementById("manual-color").value;
      const secName = document.getElementById("manual-sec-name").value.trim();
      const instructor = document.getElementById("manual-instructor").value.trim() || "Staff";
      const location = document.getElementById("manual-location").value.trim() || "Campus";
      const startTime = document.getElementById("manual-start-time").value;
      const endTime = document.getElementById("manual-end-time").value;

      const checkedDays = Array.from(document.querySelectorAll('input[name="manual-days"]:checked')).map(cb => cb.value);

      if (checkedDays.length === 0) {
        alert("Please select at least 1 day for the class.");
        return;
      }

      const times = checkedDays.map(day => ({ day, startTime, endTime }));

      // Find or create course
      let course = this.courses.find(c => c.code === code);
      if (!course) {
        course = {
          id: `course-${Date.now()}`,
          code,
          title,
          color,
          sections: []
        };
        this.courses.push(course);
      }

      const newSec = {
        id: `sec-${Date.now()}`,
        name: secName,
        instructor,
        location,
        times
      };

      course.sections.push(newSec);
      this.selectedSectionsMap[course.id] = newSec.id;

      this.saveCourses();
      this.saveSelections();
      this.formManualCourse.reset();
      this.elModalOverlay.classList.add("hidden");
      this.render();
    });

    // Export iCal
    this.btnExportICal.addEventListener("click", () => {
      const selectedSecs = this.getSelectedSections();
      if (selectedSecs.length === 0) {
        alert("Please select at least one course section to export.");
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

    filteredCourses.forEach(course => {
      const selectedSecId = this.selectedSectionsMap[course.id];
      if (selectedSecId) selectedCount++;

      const card = document.createElement("div");
      card.className = "course-card";

      card.innerHTML = `
        <div class="course-header">
          <span class="course-badge" style="background-color: ${course.color}">${course.code}</span>
          <span class="course-title" title="${course.title}">${course.title}</span>
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
                <div class="section-location">📍 ${sec.location}</div>
                <div class="section-time-tags">${timeBadges}</div>
                ${hasConflict && !isSelected ? `
                  <div class="conflict-tag">
                    ⚠️ Overlaps ${conflicts[0].conflictingCourseCode} ${conflicts[0].conflictingSecName}
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
      btnDelete.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Remove ${course.code} from planner?`)) {
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
    this.btnThemeToggle = document.getElementById("btn-theme-toggle");

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
              <span>⏳ ${gap.durationHours} hr gap</span>
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
            <div class="event-location">📍 ${slot.location}</div>
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
      this.elStatGapBadge.textContent = "Zero Gaps 🎉";
      this.elStatGapBadge.className = "stat-footer-badge success";
    } else if (metrics.totalGapHours <= 4) {
      this.elStatGapBadge.textContent = "Optimal Gaps 👍";
      this.elStatGapBadge.className = "stat-footer-badge success";
    } else {
      this.elStatGapBadge.textContent = "High Gap Alert ⚠️";
      this.elStatGapBadge.className = "stat-footer-badge warning";
    }

    // Highlights Badges
    this.elBadgesContainer.innerHTML = "";
    metrics.badges.forEach(b => {
      const tag = document.createElement("span");
      tag.className = `badge-tag ${b.type}`;
      tag.textContent = b.text;
      this.elBadgesContainer.appendChild(tag);
    });

    // Daily Breakdown
    this.elDailyBreakdownList.innerHTML = "";
    DAYS.forEach(day => {
      const info = metrics.dailyBreakdown[day];
      const card = document.createElement("div");
      card.className = "day-breakdown-card";

      if (!info.hasClasses) {
        card.innerHTML = `
          <div class="day-breakdown-header">
            <span>${FULL_DAYS[day]}</span>
            <span class="day-free-text">No Classes 🌴</span>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="day-breakdown-header">
            <span>${FULL_DAYS[day]}</span>
            <span class="day-breakdown-time">${info.firstStart} – ${info.lastEnd}</span>
          </div>
          <div class="day-breakdown-metrics">
            <span>Campus: ${info.campusHours}h</span>
            <span>Class: ${info.classHours}h</span>
            <span style="color: ${info.gapHours > 0 ? 'var(--accent-warning)' : 'var(--accent-success)'}">
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
            <span>⏳ ${combo.metrics.totalGapHours}h gap</span>
            <span>🏫 ${combo.metrics.totalCampusHours}h campus</span>
            <span>🏖️ ${combo.metrics.daysOffCount} days off</span>
            <span>${b2bCount === 0 ? '✅' : '⚠️'} ${b2bCount} back-to-back</span>
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
  window.app = new UniScheduleApp();
});
