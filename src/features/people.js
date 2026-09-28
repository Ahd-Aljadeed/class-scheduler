/**
 * People tabs: "Me" plus any friends, each with their own courses, picks,
 * locks, preferences and plans. Everything lives in this browser; adding a
 * friend simply clones the active person's course list so the two schedules
 * can be compared without any server.
 */

import { escapeHtml, safeColor } from "../utils/sanitize.js";
import { arcadeAudio } from "../utils/arcadeAudio.js";
import { showAlert, showConfirm } from "../utils/customModal.js";
import { LIMITS, ME_ID } from "../utils/validate.js";
import { PALETTE_COLORS } from "../data/sampleCourses.js";
import { computeTogetherness } from "../utils/together.js";

export function initPeople(app) {
  const els = {
    tabs: document.getElementById("people-tabs"),
    btnAdd: document.getElementById("btn-add-person"),
    overlayWrapper: document.getElementById("friend-overlay-wrapper"),
    overlayToggle: document.getElementById("toggle-friend-overlay"),
    modal: document.getElementById("person-modal-overlay"),
    title: document.getElementById("person-modal-title"),
    form: document.getElementById("person-form"),
    name: document.getElementById("person-name"),
    color: document.getElementById("person-color"),
    copyWrapper: document.getElementById("person-copy-wrapper"),
    copy: document.getElementById("person-copy-courses"),
    copyLabel: document.getElementById("person-copy-label"),
    submit: document.getElementById("btn-submit-person"),
    btnDelete: document.getElementById("btn-delete-person"),
    btnCancel: document.getElementById("btn-cancel-person"),
    btnClose: document.getElementById("btn-close-person-modal")
  };
  app.peopleEls = els;
  if (!els.tabs || !els.modal) return;

  let editingId = null;

  const closeModal = () => els.modal.classList.add("hidden");

  const openModal = (personId) => {
    editingId = personId || null;
    const person = editingId ? app.people.find(p => p.id === editingId) : null;

    els.title.textContent = person ? `Edit ${person.name}` : "Add a friend";
    els.name.value = person ? person.name : "";
    els.color.value = person
      ? safeColor(person.color)
      : PALETTE_COLORS[app.people.length % PALETTE_COLORS.length];
    els.copyWrapper.classList.toggle("hidden", !!person);
    if (!person) {
      els.copy.checked = true;
      els.copyLabel.textContent = `Start with a copy of ${app.activePerson.name}'s courses and picks`;
    }
    els.btnDelete.classList.toggle("hidden", !person || person.id === ME_ID);
    els.submit.textContent = person ? "Save" : "Add friend";
    els.modal.classList.remove("hidden");
    els.name.focus();
  };

  els.tabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".person-tab");
    if (!tab) return;
    arcadeAudio.playClick();
    const id = tab.dataset.personId;
    if (id === app.activePersonId) openModal(id);
    else app.switchPerson(id);
  });

  els.btnAdd.addEventListener("click", async () => {
    arcadeAudio.playClick();
    if (app.people.length >= LIMITS.MAX_PEOPLE) {
      await showAlert(`You can plan for up to ${LIMITS.MAX_PEOPLE} people at once.`, "Friend limit reached");
      return;
    }
    openModal(null);
  });

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = els.name.value.trim();
    if (!name) {
      await showAlert("Give your friend a name so their tab has a label.", "Missing name");
      return;
    }
    const color = safeColor(els.color.value, PALETTE_COLORS[1]);
    if (editingId) {
      app.updatePerson(editingId, { name, color });
    } else {
      app.addPerson({ name, color, copyFromId: els.copy.checked ? app.activePersonId : null });
    }
    closeModal();
    arcadeAudio.playVictory();
  });

  els.btnDelete.addEventListener("click", async () => {
    if (!editingId || editingId === ME_ID) return;
    const person = app.people.find(p => p.id === editingId);
    const ok = await showConfirm(
      `Remove ${person ? person.name : "this friend"} and their whole schedule?`,
      "Remove friend"
    );
    if (!ok) return;
    app.deletePerson(editingId);
    closeModal();
  });

  els.btnCancel.addEventListener("click", () => { arcadeAudio.playClick(); closeModal(); });
  els.btnClose.addEventListener("click", () => { arcadeAudio.playClick(); closeModal(); });
  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeModal();
  });

  els.overlayToggle.addEventListener("change", () => {
    arcadeAudio.playClick();
    app.setFriendOverlay(els.overlayToggle.checked);
  });
}

export function renderPeopleBar(app) {
  const els = app.peopleEls;
  if (!els || !els.tabs) return;

  els.tabs.innerHTML = app.people.map(person => {
    const active = person.id === app.activePersonId;
    return `
      <button type="button" class="person-tab ${active ? "active" : ""}"
              data-person-id="${escapeHtml(person.id)}"
              title="${active ? "Edit" : "Switch to"} ${escapeHtml(person.name)}">
        <span class="person-dot" style="background-color: ${safeColor(person.color)}"></span>
        <span class="person-name">${escapeHtml(person.name)}</span>
        ${active ? '<span class="person-edit" aria-hidden="true">✎</span>' : ""}
      </button>`;
  }).join("");

  const hasFriends = app.people.length > 1;
  els.overlayWrapper.classList.toggle("hidden", !hasFriends);
  els.overlayToggle.checked = !!app.showFriendOverlay;
  els.btnAdd.classList.toggle("hidden", app.people.length >= LIMITS.MAX_PEOPLE);
}

/**
 * The "Together with friends" card in the analytics panel.
 */
export function renderTogetherCard(app, myMetrics) {
  const section = document.getElementById("together-section");
  const list = document.getElementById("together-list");
  if (!section || !list) return;

  const friends = app.getFriendData();
  if (friends.length === 0) {
    section.classList.add("hidden");
    list.innerHTML = "";
    return;
  }
  section.classList.remove("hidden");

  const mine = { courses: app.courses, sections: app.getSelectedSections(), metrics: myMetrics };

  list.innerHTML = friends.map(friend => {
    const t = computeTogetherness(mine, friend);
    const breaks = Object.entries(t.sharedBreaks)
      .flatMap(([day, arr]) => arr.map(b => ({ day, ...b })))
      .sort((a, b) => b.durationMins - a.durationMins)
      .slice(0, 3);

    return `
      <div class="together-card">
        <div class="together-header">
          <span class="person-dot" style="background-color: ${safeColor(friend.person.color)}"></span>
          <span class="together-name">${escapeHtml(friend.person.name)}</span>
          <span class="together-total">${t.togetherHours}h together / week</span>
        </div>
        <div class="together-metrics">
          <span>${t.sameClassHours}h same classes</span>
          <span>${t.sharedBreakHours}h shared breaks</span>
          <span>${t.sharedDaysOff} shared days off</span>
        </div>
        ${t.sameSections.length
          ? `<div class="together-row">In class together: ${t.sameSections.map(s => escapeHtml(s.courseCode)).join(", ")}</div>`
          : `<div class="together-row muted">No classes in the same section yet</div>`}
        ${breaks.length
          ? `<div class="together-row">Free together: ${breaks.map(b => `${escapeHtml(b.day)} ${b.start}–${b.end}`).join(" · ")}</div>`
          : `<div class="together-row muted">No overlapping breaks yet</div>`}
      </div>`;
  }).join("");
}
