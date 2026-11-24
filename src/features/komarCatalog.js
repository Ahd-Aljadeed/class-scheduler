/**
 * Komar University Course Catalog browser and importer.
 *
 * Allows students to browse all 382 ready-made courses from Komar University
 * of Science and Technology (KUST), search by keyword, filter by component
 * (Theory / Lab / Clinical), preview meeting times and room locations, and
 * import chosen courses with all their sections into the planner in 1 click.
 */

import { KOMAR_COURSES } from '../data/komarCourses.js';
import { PALETTE_COLORS } from '../data/sampleCourses.js';
import { escapeHtml, safeColor } from '../utils/sanitize.js';
import { arcadeAudio } from '../utils/arcadeAudio.js';
import { showAlert } from '../utils/customModal.js';
import { LIMITS } from '../utils/validate.js';
import { isBusyCourse } from '../utils/scheduler.js';

/**
 * Filter Komar courses by search query and type ('ALL', 'T', 'L', 'C').
 * @param {Array<object>} courses
 * @param {string} query
 * @param {string} filterType
 * @returns {Array<object>}
 */
export function filterKomarCourses(courses, query = '', filterType = 'ALL') {
  const q = (query || '').toLowerCase().trim();
  const f = (filterType || 'ALL').toUpperCase();

  return courses.filter((course) => {
    // Check type match
    if (f !== 'ALL') {
      const hasType = course.types.some((t) => t.type === f);
      if (!hasType) return false;
    }

    // Check search query match
    if (!q) return true;

    if (course.title.toLowerCase().includes(q)) return true;
    if (course.id.toLowerCase().includes(q)) return true;

    // Check if any section room or type name matches
    return course.types.some((t) => {
      if (t.typeName.toLowerCase().includes(q)) return true;
      return t.sections.some((sec) =>
        sec.location.toLowerCase().includes(q) ||
        sec.name.toLowerCase().includes(q)
      );
    });
  });
}

/**
 * Builds a UniSchedule-compatible Course object from a Komar course and type entry.
 * @param {object} komarCourse
 * @param {object} typeObj
 * @param {number} colorIdx
 * @returns {object}
 */
export function buildKomarCourseObject(komarCourse, typeObj, colorIdx = 0) {
  const isMultiType = komarCourse.types.length > 1;
  const courseSuffix = isMultiType ? ` (${typeObj.type})` : '';
  const titleSuffix = isMultiType ? ` (${typeObj.typeName})` : '';

  const courseId = `course-komar-${komarCourse.id}-${typeObj.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const color = PALETTE_COLORS[colorIdx % PALETTE_COLORS.length];

  const sections = typeObj.sections.map((sec, secIdx) => {
    const secId = `sec-komar-${komarCourse.id}-${typeObj.type}-${secIdx + 1}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      id: secId,
      name: sec.name,
      instructor: 'Staff',
      location: sec.location || 'Campus',
      times: sec.times.map((t) => ({
        day: t.day,
        startTime: t.startTime,
        endTime: t.endTime,
        location: t.location || sec.location || 'Campus'
      }))
    };
  });

  return {
    id: courseId,
    code: `${komarCourse.title}${courseSuffix}`,
    title: `${komarCourse.title}${titleSuffix}`,
    color: safeColor(color),
    sections
  };
}

/**
 * Initialize the Komar University Catalog feature.
 * @param {object} app - The main App instance
 */
export function initKomarCatalog(app) {
  const overlay = document.getElementById('komar-modal-overlay');
  const btnHeader = document.getElementById('btn-komar-catalog');
  const btnClose = document.getElementById('btn-close-komar-modal');
  const searchInput = document.getElementById('komar-search-input');
  const btnClearSearch = document.getElementById('komar-search-clear');
  const coursesContainer = document.getElementById('komar-courses-list');
  const selectedCountBadge = document.getElementById('komar-selected-count');
  const btnSelectAll = document.getElementById('komar-btn-select-all');
  const btnClearSelection = document.getElementById('komar-btn-clear-selection');
  const replaceExistingCheckbox = document.getElementById('komar-replace-existing');
  const btnApply = document.getElementById('komar-btn-apply');
  const filterPillsContainer = document.getElementById('komar-filter-pills');

  if (!overlay) return;

  // Catalog internal state
  const state = {
    searchQuery: '',
    activeFilter: 'ALL', // 'ALL', 'T', 'L', 'C'
    selectedKeys: new Set(), // Set of "courseId:::type"
    expandedCourses: new Set() // Set of courseId for accordion preview
  };

  /**
   * Helper to generate a unique key for a course type entry.
   */
  const makeKey = (courseId, type) => `${courseId}:::${type}`;

  /**
   * Checks if a course component is already in the app's current schedule.
   */
  const isAlreadyInPlanner = (courseTitle, typeCode, hasMultipleTypes) => {
    if (!app.courses || app.courses.length === 0) return false;
    const targetCode = hasMultipleTypes ? `${courseTitle} (${typeCode})`.toLowerCase() : courseTitle.toLowerCase();
    const targetTitle = courseTitle.toLowerCase();

    return app.courses.some((c) => {
      if (isBusyCourse(c)) return false;
      const cCode = (c.code || '').toLowerCase();
      const cTitle = (c.title || '').toLowerCase();
      return cCode === targetCode || cTitle === targetCode || cTitle.startsWith(targetTitle);
    });
  };

  /**
   * Update selected count badge and Apply button label.
   */
  const updateSelectionSummary = () => {
    const count = state.selectedKeys.size;
    let totalSections = 0;

    KOMAR_COURSES.forEach((course) => {
      course.types.forEach((typeObj) => {
        if (state.selectedKeys.has(makeKey(course.id, typeObj.type))) {
          totalSections += typeObj.sections.length;
        }
      });
    });

    if (selectedCountBadge) {
      selectedCountBadge.textContent = `${count} class${count === 1 ? '' : 'es'} (${totalSections} sections)`;
    }

    if (btnApply) {
      btnApply.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Apply to Scheduler ${count > 0 ? `(${count})` : ''}</span>
      `;
      btnApply.disabled = count === 0;
    }
  };

  /**
   * Render the course cards based on current query and filter.
   */
  const renderCatalogList = () => {
    if (!coursesContainer) return;

    const filtered = filterKomarCourses(KOMAR_COURSES, state.searchQuery, state.activeFilter);

    if (filtered.length === 0) {
      coursesContainer.innerHTML = `
        <div class="komar-empty-state">
          <div class="komar-empty-icon">🔍</div>
          <h4>No Komar classes found</h4>
          <p>Try searching for a different keyword or resetting the category filter.</p>
          <button type="button" class="btn btn-sm btn-outline" id="btn-reset-komar-search">Reset Search</button>
        </div>
      `;
      const btnReset = document.getElementById('btn-reset-komar-search');
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          state.searchQuery = '';
          state.activeFilter = 'ALL';
          if (searchInput) searchInput.value = '';
          updateFilterPills();
          renderCatalogList();
        });
      }
      return;
    }

    coursesContainer.innerHTML = filtered.map((course) => {
      const isMultiType = course.types.length > 1;
      const isExpanded = state.expandedCourses.has(course.id);

      // Check if all types for this course are selected
      const allTypesSelected = course.types.every((t) =>
        state.selectedKeys.has(makeKey(course.id, t.type))
      );
      const someTypesSelected = course.types.some((t) =>
        state.selectedKeys.has(makeKey(course.id, t.type))
      );

      // Check if already in planner
      const alreadyInPlanner = course.types.some((t) =>
        isAlreadyInPlanner(course.title, t.type, isMultiType)
      );

      return `
        <div class="komar-course-card ${someTypesSelected ? 'selected' : ''}" data-course-id="${escapeHtml(course.id)}">
          <div class="komar-card-header">
            <label class="komar-checkbox-label">
              <input type="checkbox"
                     class="komar-course-master-checkbox"
                     data-course-id="${escapeHtml(course.id)}"
                     ${allTypesSelected ? 'checked' : ''} />
              <div class="komar-card-info">
                <div class="komar-card-title-row">
                  <h3 class="komar-card-title">${escapeHtml(course.title)}</h3>
                  ${alreadyInPlanner ? '<span class="komar-pill-tag tag-in-planner">In Scheduler</span>' : ''}
                </div>
                <div class="komar-card-badges">
                  ${course.types.map((t) => {
                    const typeClass = t.type === 'T' ? 'type-theory' : t.type === 'L' ? 'type-lab' : 'type-clinical';
                    return `
                      <span class="komar-type-badge ${typeClass}">
                        ${escapeHtml(t.typeName)}: ${t.sections.length} sec${t.sections.length === 1 ? '' : 's'}
                      </span>
                    `;
                  }).join('')}
                </div>
              </div>
            </label>
            <button type="button"
                    class="btn btn-ghost btn-sm btn-toggle-preview"
                    data-course-id="${escapeHtml(course.id)}"
                    title="Preview sections timetable">
              <span>${isExpanded ? 'Hide' : 'Preview'}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform: ${isExpanded ? 'rotate(180deg)' : 'rotate(0)'}; transition: transform 0.2s;">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>

          ${isMultiType ? `
            <div class="komar-types-selector">
              <span class="komar-types-label">Select components:</span>
              <div class="komar-types-checkboxes">
                ${course.types.map((t) => {
                  const key = makeKey(course.id, t.type);
                  const isChecked = state.selectedKeys.has(key);
                  return `
                    <label class="komar-type-checkbox-label">
                      <input type="checkbox"
                             class="komar-type-checkbox"
                             data-course-id="${escapeHtml(course.id)}"
                             data-type="${escapeHtml(t.type)}"
                             ${isChecked ? 'checked' : ''} />
                      <span>${escapeHtml(t.typeName)} (${t.sections.length} sec)</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          ${isExpanded ? `
            <div class="komar-sections-accordion">
              ${course.types.map((t) => `
                <div class="komar-accordion-type-group">
                  ${isMultiType ? `<h5 class="komar-type-subheading">${escapeHtml(t.typeName)} Sections</h5>` : ''}
                  <div class="komar-sections-grid">
                    ${t.sections.map((sec) => `
                      <div class="komar-section-item">
                        <div class="komar-section-head">
                          <span class="komar-sec-name">${escapeHtml(sec.name)}</span>
                          <span class="komar-sec-loc">${escapeHtml(sec.location)}</span>
                        </div>
                        <div class="komar-sec-times">
                          ${sec.times.map((time) => `
                            <span class="komar-time-chip">
                              <strong>${escapeHtml(time.day)}</strong> ${escapeHtml(time.startTime)} - ${escapeHtml(time.endTime)}
                              ${time.location ? `<span class="room-hint">(${escapeHtml(time.location)})</span>` : ''}
                            </span>
                          `).join('')}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    attachCardEventListeners();
    updateSelectionSummary();
  };

  /**
   * Attach listeners to cards inside the list.
   */
  const attachCardEventListeners = () => {
    if (!coursesContainer) return;

    // Master course checkbox
    coursesContainer.querySelectorAll('.komar-course-master-checkbox').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        arcadeAudio.playClick();
        const courseId = e.target.dataset.courseId;
        const course = KOMAR_COURSES.find((c) => c.id === courseId);
        if (!course) return;

        course.types.forEach((t) => {
          const key = makeKey(courseId, t.type);
          if (e.target.checked) {
            state.selectedKeys.add(key);
          } else {
            state.selectedKeys.delete(key);
          }
        });

        renderCatalogList();
      });
    });

    // Sub-type checkboxes (Theory / Lab individually)
    coursesContainer.querySelectorAll('.komar-type-checkbox').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        arcadeAudio.playClick();
        const courseId = e.target.dataset.courseId;
        const type = e.target.dataset.type;
        const key = makeKey(courseId, type);

        if (e.target.checked) {
          state.selectedKeys.add(key);
        } else {
          state.selectedKeys.delete(key);
        }

        renderCatalogList();
      });
    });

    // Accordion toggle button
    coursesContainer.querySelectorAll('.btn-toggle-preview').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        arcadeAudio.playClick();
        const courseId = btn.dataset.courseId;
        if (state.expandedCourses.has(courseId)) {
          state.expandedCourses.delete(courseId);
        } else {
          state.expandedCourses.add(courseId);
        }
        renderCatalogList();
      });
    });
  };

  /**
   * Update active pill appearance.
   */
  const updateFilterPills = () => {
    if (!filterPillsContainer) return;
    filterPillsContainer.querySelectorAll('.komar-filter-pill').forEach((pill) => {
      const type = pill.dataset.filter;
      pill.classList.toggle('active', type === state.activeFilter);
    });
  };

  /**
   * Open the Komar Catalog modal.
   */
  const openModal = () => {
    arcadeAudio.playClick();
    overlay.classList.remove('hidden');
    if (searchInput) {
      searchInput.value = state.searchQuery;
      setTimeout(() => searchInput.focus(), 80);
    }
    updateFilterPills();
    renderCatalogList();
  };

  /**
   * Close the Komar Catalog modal.
   */
  const closeModal = () => {
    arcadeAudio.playClick();
    overlay.classList.add('hidden');
  };

  // Wire buttons to open modal
  if (btnHeader) {
    btnHeader.addEventListener('click', openModal);
  }

  // Also hook into sidebar or empty state button if available
  const btnSidebar = document.getElementById('btn-browse-komar-sidebar');
  if (btnSidebar) {
    btnSidebar.addEventListener('click', openModal);
  }

  // Close triggers
  if (btnClose) {
    btnClose.addEventListener('click', closeModal);
  }

  const btnCancel = document.getElementById('btn-cancel-komar');
  if (btnCancel) {
    btnCancel.addEventListener('click', closeModal);
  }

  const btnFromImport = document.getElementById('btn-open-komar-from-import');
  if (btnFromImport) {
    btnFromImport.addEventListener('click', () => {
      const importOverlay = document.getElementById('import-modal-overlay');
      if (importOverlay) importOverlay.classList.add('hidden');
      openModal();
    });
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Search input typing
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (btnClearSearch) {
        btnClearSearch.classList.toggle('hidden', !state.searchQuery);
      }
      renderCatalogList();
    });
  }

  // Search clear button
  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      arcadeAudio.playClick();
      state.searchQuery = '';
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      btnClearSearch.classList.add('hidden');
      renderCatalogList();
    });
  }

  // Filter pills
  if (filterPillsContainer) {
    filterPillsContainer.querySelectorAll('.komar-filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        arcadeAudio.playClick();
        state.activeFilter = pill.dataset.filter || 'ALL';
        updateFilterPills();
        renderCatalogList();
      });
    });
  }

  // Select all visible/filtered button
  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      arcadeAudio.playClick();
      const filtered = filterKomarCourses(KOMAR_COURSES, state.searchQuery, state.activeFilter);
      filtered.forEach((course) => {
        course.types.forEach((t) => {
          state.selectedKeys.add(makeKey(course.id, t.type));
        });
      });
      renderCatalogList();
    });
  }

  // Clear selection button
  if (btnClearSelection) {
    btnClearSelection.addEventListener('click', () => {
      arcadeAudio.playClick();
      state.selectedKeys.clear();
      renderCatalogList();
    });
  }

  // Apply to Scheduler button
  if (btnApply) {
    btnApply.addEventListener('click', async () => {
      if (state.selectedKeys.size === 0) {
        await showAlert('Please select at least one course from the catalog to add to your scheduler.', 'No Courses Selected');
        return;
      }

      const replaceExisting = replaceExistingCheckbox ? replaceExistingCheckbox.checked : false;

      // Collect the selected course items
      const itemsToBuild = [];
      KOMAR_COURSES.forEach((course) => {
        course.types.forEach((typeObj) => {
          if (state.selectedKeys.has(makeKey(course.id, typeObj.type))) {
            itemsToBuild.push({ course, typeObj });
          }
        });
      });

      const currentNonBusy = app.courses.filter((c) => !isBusyCourse(c));
      const busyCourses = app.courses.filter((c) => isBusyCourse(c));

      let baseCourses = replaceExisting ? busyCourses : [...app.courses];
      const startColorIdx = baseCourses.length;

      const newCourses = itemsToBuild.map((item, idx) =>
        buildKomarCourseObject(item.course, item.typeObj, startColorIdx + idx)
      );

      // Check total course limit
      const projectedTotal = baseCourses.length + newCourses.length;
      if (projectedTotal > LIMITS.MAX_COURSES) {
        const allowed = LIMITS.MAX_COURSES - baseCourses.length;
        await showAlert(
          `Adding ${newCourses.length} courses would exceed the maximum limit of ${LIMITS.MAX_COURSES} courses in your scheduler. You can add up to ${Math.max(0, allowed)} more courses, or check "Replace existing courses".`,
          'Course Limit Reached'
        );
        return;
      }

      // Filter out existing exact duplicates if appending
      let acceptedCourses = newCourses;
      if (!replaceExisting) {
        acceptedCourses = newCourses.filter((nc) =>
          !baseCourses.some((bc) => bc.code === nc.code)
        );
      }

      if (acceptedCourses.length === 0 && !replaceExisting) {
        await showAlert('All the selected courses are already present in your scheduler!', 'Already Added');
        closeModal();
        return;
      }

      // Commit to app state
      app.courses = [...baseCourses, ...acceptedCourses];

      // Auto-assign first section for newly added courses in selectedSectionsMap
      acceptedCourses.forEach((c) => {
        if (c.sections && c.sections.length > 0) {
          app.selectedSectionsMap[c.id] = c.sections[0].id;
        }
      });

      // Persist and re-render app
      app.saveCourses();
      app.saveSelections();
      app.render();

      arcadeAudio.playSuccess();
      closeModal();

      // Show friendly confirmation toast or modal
      await showAlert(
        `Successfully added ${acceptedCourses.length} Komar course${acceptedCourses.length === 1 ? '' : 's'} with all their sections to your schedule! You can now select your preferred sections or click "Auto" to generate optimal timetables.`,
        'Classes Added!'
      );
    });
  }

  // Provide public API on app
  app.komarCatalog = {
    open: openModal,
    close: closeModal
  };
}
