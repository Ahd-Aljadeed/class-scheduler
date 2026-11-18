import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openApp, course, slot } from "./helpers.js";

// Nothing here conflicts, so every pairing is valid: 2 x 2 = 4 schedules.
const COURSES = [
  course("c1", "CS101", [
    { name: "Sec 01", times: [slot("Mon", "09:00", "10:30")] },
    { name: "Sec 02", times: [slot("Tue", "09:00", "10:30")] }
  ]),
  course("c2", "MA201", [
    { name: "Sec 01", times: [slot("Wed", "11:00", "12:30")] },
    { name: "Sec 02", times: [slot("Thu", "11:00", "12:30")] }
  ])
];

async function openDrawer(page) {
  await page.locator("#btn-auto-combinations").click();
  await expect(page.locator("#combinations-drawer-overlay")).toBeVisible();
}

test.describe("busy blocks", () => {
  test("a busy block is drawn, flags clashes and steers the optimizer", async ({ page }) => {
    await openApp(page, { courses: COURSES, selections: { c1: "c1-s0" } });
    await expect(page.locator("#valid-combos-count-badge")).toHaveText("4");

    await page.locator("#btn-import-modal").click();
    await page.locator('.modal-tab[data-tab="busy-time"]').click();
    await page.locator("#busy-label").fill("Work");
    await page.locator("#busy-slots-container .busy-slot-day").selectOption("Mon");
    await page.locator("#busy-slots-container .busy-slot-start").fill("08:00");
    await page.locator("#busy-slots-container .busy-slot-end").fill("12:00");
    await page.locator('#busy-form button[type="submit"]').click();

    await expect(page.locator(".busy-card")).toHaveCount(1);
    await expect(page.locator(".calendar-event.busy-block")).toHaveCount(1);
    // CS101 Sec 01 (Mon 09:00) now clashes with work.
    await expect(page.locator("#conflict-banner")).toBeVisible();
    // Only CS101 Sec 02 survives: 1 x 2 = 2 schedules.
    await expect(page.locator("#valid-combos-count-badge")).toHaveText("2");
    // Busy blocks are not courses: the count still reads 2 real courses.
    await expect(page.locator("#courses-selected-count")).toHaveText("1 / 2 Selected");

    await page.reload();
    await page.waitForFunction(() => !!(window.app && window.app.courses.length));
    await expect(page.locator(".busy-card")).toHaveCount(1);
  });
});

test.describe("lock and exclude", () => {
  test("locking pins a section and excluding removes it from the search", async ({ page }) => {
    await openApp(page, { courses: COURSES });

    await page.locator('.section-item[data-section-id="c1-s0"] .btn-lock-section').click();
    await expect(page.locator('.section-item[data-section-id="c1-s0"]')).toHaveClass(/locked/);
    await expect(page.locator('.section-item[data-section-id="c1-s0"]')).toHaveClass(/selected/);
    await expect(page.locator("#valid-combos-count-badge")).toHaveText("2");

    await page.locator('.section-item[data-section-id="c2-s1"] .btn-exclude-section').click();
    await expect(page.locator('.section-item[data-section-id="c2-s1"]')).toHaveClass(/excluded/);
    await expect(page.locator("#valid-combos-count-badge")).toHaveText("1");

    await page.reload();
    await page.waitForFunction(() => !!(window.app && window.app.courses.length));
    await expect(page.locator(".section-item.locked")).toHaveCount(1);
    await expect(page.locator(".section-item.excluded")).toHaveCount(1);
  });

  test("the Backups tab lists schedules one swap away from the current picks", async ({ page }) => {
    await openApp(page, { courses: COURSES, selections: { c1: "c1-s0", c2: "c2-s0" } });
    await openDrawer(page);
    await page.locator('.filter-tab[data-sort="backup"]').click();

    // Two one-swap alternatives plus the one two-swap alternative.
    await expect(page.locator(".combo-card")).toHaveCount(3);
    await expect(page.locator(".combo-swap")).toHaveCount(3);
    await expect(page.locator("#combo-summary-text")).toContainText("2 one-swap backups");
  });
});

test.describe("preferences and scoring", () => {
  test("hard limits hide schedules, and every card carries a score", async ({ page }) => {
    await openApp(page, { courses: COURSES });
    await openDrawer(page);
    await expect(page.locator(".score-pill")).toHaveCount(4);

    await page.locator("#btn-toggle-prefs").click();
    // Both CS101 sections start at 09:00, so this rules out everything.
    await page.locator("#pref-earliest").fill("10:00");
    await page.locator("#pref-earliest").dispatchEvent("change");

    await expect(page.locator("#combinations-list")).toContainText("Every valid schedule breaks one of your limits");
    await page.locator('#combo-notes button[data-action="show-hidden"]').click();
    await expect(page.locator(".combo-card")).toHaveCount(4);
    await expect(page.locator(".combo-violation")).toHaveCount(4);

    await page.reload();
    await page.waitForFunction(() => !!(window.app && window.app.courses.length));
    expect(await page.evaluate(() => window.app.prefs.earliestStart)).toBe("10:00");
  });
});

test.describe("optimizer preview, keyboard and surprise", () => {
  test("hovering a card ghosts that schedule; arrows focus and Enter applies", async ({ page }) => {
    await openApp(page, { courses: COURSES, selections: { c1: "c1-s0" } });
    await openDrawer(page);

    // Cards are in search order: (s0,s0), (s0,s1), (s1,s0), (s1,s1).
    await page.locator(".combo-card").nth(2).hover();
    await expect(page.locator(".calendar-event.combo-preview")).toHaveCount(2);
    await expect(page.locator(".calendar-event.will-drop")).toHaveCount(1);

    await page.mouse.move(2, 2);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".combo-card.focused")).toHaveAttribute("data-combo-idx", "0");
    await page.keyboard.press("Enter");
    await expect(page.locator("#courses-selected-count")).toHaveText("2 / 2 Selected");
    await expect(page.locator(".calendar-event.combo-preview")).toHaveCount(0);
  });

  test("Surprise me lands on a complete valid schedule", async ({ page }) => {
    await openApp(page, { courses: COURSES });
    await openDrawer(page);
    await page.locator("#btn-surprise").click();
    await expect(page.locator("#courses-selected-count")).toHaveText("2 / 2 Selected", { timeout: 5000 });
    await expect(page.locator("#conflict-banner")).toBeHidden();
  });
});

test.describe("friends", () => {
  test("a friend gets a tab, a copy of the courses and independent picks", async ({ page }) => {
    await openApp(page, { courses: COURSES, selections: { c1: "c1-s0" } });

    await page.locator("#btn-add-person").click();
    await page.locator("#person-name").fill("Sara");
    await page.locator("#btn-submit-person").click();

    await expect(page.locator(".person-tab.active")).toContainText("Sara");
    await expect(page.locator(".course-card")).toHaveCount(2);
    await expect(page.locator("#courses-selected-count")).toHaveText("1 / 2 Selected");

    // Sara moves to Tuesday; my Monday pick must not change.
    await page.locator('.section-item[data-section-id="c1-s1"]').click();
    await expect(page.locator('.section-item[data-section-id="c1-s1"]')).toHaveClass(/selected/);

    await page.locator('.person-tab:has-text("Me")').click();
    await expect(page.locator('.section-item[data-section-id="c1-s0"]')).toHaveClass(/selected/);

    await page.locator("#toggle-friend-overlay").check();
    await expect(page.locator(".friend-block")).toHaveCount(1);
    await expect(page.locator("#together-section")).toBeVisible();

    await openDrawer(page);
    await expect(page.locator("#filter-tab-friends")).toBeVisible();
    await page.locator("#btn-close-drawer").click();

    await page.reload();
    await page.waitForFunction(() => !!(window.app && window.app.courses.length));
    await expect(page.locator(".person-tab")).toHaveCount(2);
  });

  test("a friend's name is escaped, not executed", async ({ page }) => {
    await openApp(page, { courses: COURSES });
    await page.locator("#btn-add-person").click();
    await page.locator("#person-name").fill('"><img src=x onerror="window.__PWNED__=1">');
    await page.locator("#btn-submit-person").click();

    await expect(page.locator(".person-tab")).toHaveCount(2);
    expect(await page.locator("img").count()).toBe(0);
    expect(await page.evaluate(() => window.__PWNED__)).toBeUndefined();
    await expect(page.locator(".person-tab.active")).toContainText("<img");
  });

  test("corrupt people and extras data does not stop the app booting", async ({ page }) => {
    await openApp(page, { courses: COURSES });
    await page.evaluate(() => {
      localStorage.setItem("unischedule_people_v1", "{not json");
      localStorage.setItem("unischedule_person_v1:me", JSON.stringify({ locked: 42, prefs: "nope", plans: [{ id: 1 }] }));
    });
    await page.reload();
    await page.waitForFunction(() => !!(window.app && window.app.courses.length));
    await expect(page.locator(".person-tab")).toHaveCount(1);
    await expect(page.locator(".course-card")).toHaveCount(2);
  });
});

test.describe("saved plans", () => {
  test("a plan can be saved, compared and loaded back", async ({ page }) => {
    await openApp(page, { courses: COURSES, selections: { c1: "c1-s0", c2: "c2-s0" } });

    await page.locator("#btn-plans").click();
    await page.locator("#plan-name-input").fill("Plan A");
    await page.locator("#btn-save-plan").click();
    await expect(page.locator(".plan-card")).toHaveCount(1);
    await expect(page.locator("#plans-count-badge")).toHaveText("1");
    await page.locator("#btn-close-plans-modal").click();

    await page.locator('.section-item[data-section-id="c1-s1"]').click();
    await expect(page.locator('.section-item[data-section-id="c1-s1"]')).toHaveClass(/selected/);

    await page.locator("#btn-plans").click();
    await expect(page.locator(".compare-table")).toBeVisible();
    await expect(page.locator(".compare-mini .mini-tt-block")).toHaveCount(4);

    await page.locator(".btn-load-plan").click();
    await expect(page.locator('.section-item[data-section-id="c1-s0"]')).toHaveClass(/selected/);
  });
});

test.describe("term settings and grid range", () => {
  test("term settings shape the calendar export", async ({ page }) => {
    await openApp(page, { courses: COURSES, selections: { c1: "c1-s0" } });

    await page.locator("#btn-settings").click();
    await page.locator("#term-start-date").fill("2026-09-06");
    await page.locator("#term-weeks").fill("10");
    await page.locator("#btn-add-holiday").click();
    await page.locator(".holiday-start").fill("2026-09-14"); // a Monday
    await page.locator('#settings-form button[type="submit"]').click();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#btn-export-ical").click()
    ]);
    const ics = readFileSync(await download.path(), "utf8");
    expect(ics).toContain("COUNT=10");
    expect(ics).toContain("EXDATE:");
  });

  test("a late class stretches the grid instead of falling off it", async ({ page }) => {
    await openApp(page, {
      courses: [course("late", "LAB300", [{ times: [slot("Mon", "19:30", "21:30")] }])],
      selections: { late: "late-s0" }
    });
    await expect(page.locator(".calendar-event:not(.preview-block)")).toHaveCount(1);
    await expect(page.locator(".time-slot-label")).toHaveCount(14);
    await expect(page.locator(".time-slot-label").last()).toHaveText("9:00 PM");
  });
});

test.describe("heatmap, poster and installability", () => {
  test("the heatmap draws one cell per half hour and day", async ({ page }) => {
    await openApp(page, { courses: COURSES });
    await page.locator("#btn-toggle-heatmap").click();
    // 08:00-20:00 in half hours = 24 rows x 7 days.
    await expect(page.locator(".heatmap-cell")).toHaveCount(168);
    await expect(page.locator(".heatmap-cell").first()).toHaveAttribute("title", /free in 100% of 4 schedules/);
  });

  test("the poster renders to a canvas", async ({ page }) => {
    await openApp(page, { courses: COURSES, selections: { c1: "c1-s0" } });
    await page.locator("#btn-poster").click();
    const canvas = page.locator("canvas.poster-canvas");
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute("width", "1080");
  });

  test("the manifest and the service worker are served", async ({ page }) => {
    await openApp(page);
    const manifest = await page.request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    expect((await manifest.json()).icons).toHaveLength(3);

    const sw = await page.request.get("/sw.js");
    expect(sw.ok()).toBe(true);
    const body = await sw.text();
    expect(body).toContain("unischedule-");
    expect(body, "the build must stamp a real version").not.toContain("__BUILD_ID__");
  });
});
