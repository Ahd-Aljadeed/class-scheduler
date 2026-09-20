import { test, expect } from "@playwright/test";
import { openApp, course, slot } from "./helpers.js";

const TWO_COURSES = [
  course("c1", "CS101", [
    { name: "Sec 01", times: [slot("Mon", "09:00", "10:30")] },
    { name: "Sec 02", times: [slot("Tue", "09:00", "10:30")] }
  ]),
  course("c2", "MA201", [
    { name: "Sec 01", times: [slot("Mon", "09:00", "10:30")] }, // clashes with CS101 Sec 01
    { name: "Sec 02", times: [slot("Wed", "11:00", "12:30")] }
  ])
];

test.describe("core flows", () => {
  test("boots to an empty state with no courses", async ({ page }) => {
    await openApp(page);
    await expect(page.locator(".empty-course-state")).toBeVisible();
    await expect(page.locator("#courses-selected-count")).toHaveText("0 / 0 Selected");
  });

  test("a course added through the form appears and persists across reload", async ({ page }) => {
    await openApp(page);

    await page.locator("#btn-import-modal").click();
    await page.locator("#manual-title").fill("Intro to Testing");
    await page.locator("#manual-code").fill("QA 101");
    await page.locator(".input-sec-name").first().fill("Sec A");
    await page.locator("#manual-course-form button[type='submit']").click();

    await expect(page.locator(".course-card")).toHaveCount(1);
    await expect(page.locator(".course-badge")).toHaveText("QA 101");

    await page.reload();
    await page.waitForFunction(() => !!(window.app && window.app.courses.length));
    await expect(page.locator(".course-badge")).toHaveText("QA 101");
  });

  test("selecting and deselecting a section updates the timetable", async ({ page }) => {
    await openApp(page, { courses: TWO_COURSES });

    // Hovering a section draws a translucent preview that also carries the
    // .calendar-event class, and clicking necessarily moves the mouse over the
    // item — so count only the committed blocks.
    const events = page.locator(".calendar-event:not(.preview-block)");

    await expect(events).toHaveCount(0);

    await page.locator(".section-item").first().click();
    await expect(events).toHaveCount(1);
    await expect(page.locator("#courses-selected-count")).toHaveText("1 / 2 Selected");

    await page.locator(".section-item").first().click();
    await expect(events).toHaveCount(0);
  });

  test("hovering a section previews it without selecting it", async ({ page }) => {
    await openApp(page, { courses: TWO_COURSES });

    await page.locator('.section-item[data-section-id="c1-s1"]').hover();
    await expect(page.locator(".calendar-event.preview-block")).toHaveCount(1);
    // Still nothing committed.
    await expect(page.locator(".calendar-event:not(.preview-block)")).toHaveCount(0);
    await expect(page.locator("#courses-selected-count")).toHaveText("0 / 2 Selected");
  });

  test("a genuine clash raises the conflict banner", async ({ page }) => {
    // CS101 Sec 01 and MA201 Sec 01 are both Mon 09:00-10:30.
    await openApp(page, {
      courses: TWO_COURSES,
      selections: { c1: "c1-s0", c2: "c2-s0" }
    });

    await expect(page.locator("#conflict-banner")).toBeVisible();

    // Switching to the non-clashing section clears it.
    await page.locator('.section-item[data-section-id="c2-s1"]').click();
    await expect(page.locator("#conflict-banner")).toBeHidden();
  });

  test("sections that would clash are flagged before they are picked", async ({ page }) => {
    await openApp(page, { courses: TWO_COURSES, selections: { c1: "c1-s0" } });

    const clashing = page.locator('.section-item[data-section-id="c2-s0"]');
    await expect(clashing).toHaveClass(/has-conflict/);
    await expect(clashing.locator(".conflict-tag")).toContainText("CS101");
  });

  test("the optimizer lists schedules and applying one resolves the clash", async ({ page }) => {
    await openApp(page, {
      courses: TWO_COURSES,
      selections: { c1: "c1-s0", c2: "c2-s0" }
    });

    await expect(page.locator("#conflict-banner")).toBeVisible();
    await page.locator("#btn-resolve-conflict").click();

    const cards = page.locator(".combo-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);

    await cards.first().locator(".btn-apply-combo").click();
    await expect(page.locator("#conflict-banner")).toBeHidden();
  });

  test("the combination count reflects the course list", async ({ page }) => {
    await openApp(page, { courses: TWO_COURSES });
    // 2x2 products, minus the one pairing that clashes = 3.
    await expect(page.locator("#valid-combos-count-badge")).toHaveText("3");
  });

  test("deleting a course removes it", async ({ page }) => {
    await openApp(page, { courses: TWO_COURSES });
    await expect(page.locator(".course-card")).toHaveCount(2);

    await page.locator(".btn-delete-course").first().click();
    await page.locator(".btn-custom-modal-confirm").click();

    await expect(page.locator(".course-card")).toHaveCount(1);
  });

  test("search filters the course list", async ({ page }) => {
    await openApp(page, { courses: TWO_COURSES });

    await page.locator("#course-search-input").fill("MA201");
    await expect(page.locator(".course-card")).toHaveCount(1);

    await page.locator("#course-search-input").fill("nothing matches this");
    await expect(page.locator(".empty-search-state")).toBeVisible();
  });

  test("text import parses a pasted block", async ({ page }) => {
    await openApp(page);

    await page.locator("#btn-import-modal").click();
    await page.locator('.modal-tab[data-tab="text-import"]').click();
    await page.locator("#btn-load-sample-text").click();
    await page.locator("#btn-parse-import").click();

    await expect(page.locator(".course-card")).toHaveCount(2);
  });

  test("the sample import does not invent a Tuesday from the instructor's name", async ({ page }) => {
    // Regression: "Dr. Turing" used to match the single-letter "T" day token,
    // so "Mon/Wed" parsed as Mon, Tue, Wed.
    await openApp(page);

    await page.locator("#btn-import-modal").click();
    await page.locator('.modal-tab[data-tab="text-import"]').click();
    await page.locator("#import-textarea").fill(
      "CS101 Intro\nSec 01 - Dr. Turing - Mon/Wed 09:00-10:30 Tech Bldg 101"
    );
    await page.locator("#btn-parse-import").click();

    const days = await page.evaluate(() => window.app.courses[0].sections[0].times.map((t) => t.day));
    expect(days.sort()).toEqual(["Mon", "Wed"]);
  });

  test("exporting produces a calendar file", async ({ page }) => {
    await openApp(page, { courses: TWO_COURSES, selections: { c1: "c1-s0" } });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#btn-export-ical").click()
    ]);

    expect(download.suggestedFilename()).toBe("UniSchedule.ics");
  });

  test("theme and mode toggles persist", async ({ page }) => {
    await openApp(page);

    await page.locator("#btn-theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.locator("#btn-mode-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "regular");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("html")).toHaveAttribute("data-mode", "regular");
  });
});

test.describe("resilience against hostile or broken stored data", () => {
  const XSS = '"><img src=x onerror="window.__PWNED__=1">';

  test("course data is escaped, not executed", async ({ page }) => {
    await openApp(page, {
      courses: [{
        id: "evil",
        code: XSS,
        title: XSS,
        color: "red;background:url(//evil)",
        sections: [{
          id: "evil-s",
          name: XSS,
          instructor: XSS,
          location: XSS,
          times: [slot("Mon", "09:00", "10:30")]
        }]
      }],
      selections: { evil: "evil-s" }
    });

    await expect(page.locator(".course-card")).toHaveCount(1);
    expect(await page.evaluate(() => window.__PWNED__)).toBeUndefined();
    expect(await page.locator("img").count(), "payload must not become an element").toBe(0);

    // The text is still shown to the user, just inert.
    await expect(page.locator(".section-instructor")).toContainText("<img");
  });

  test("an injected CSS colour is replaced with the theme default", async ({ page }) => {
    await openApp(page, {
      courses: [{
        id: "c",
        code: "CS1",
        title: "T",
        color: "red;background:url(//evil)",
        sections: [{ id: "s", name: "S", instructor: "I", location: "L", times: [slot("Mon", "09:00", "10:00")] }]
      }]
    });

    const style = await page.locator(".course-badge").getAttribute("style");
    expect(style).toContain("#6366f1");
    expect(style).not.toContain("evil");
  });

  test("a corrupt sound-mute value does not stop the app booting", async ({ page }) => {
    await openApp(page, { soundMuted: "this-is-not-json{{{" });
    expect(await page.evaluate(() => Array.isArray(window.app.courses))).toBe(true);
  });

  test("malformed stored courses are dropped rather than breaking the render", async ({ page }) => {
    await openApp(page, {
      courses: [
        { id: "bad-1", sections: "not-an-array" },
        { id: "bad-2", sections: [{ id: "s", times: [{ day: "Notaday", startTime: "9", endTime: "x" }] }] },
        course("good", "OK101", [{ times: [slot("Mon", "09:00", "10:00")] }])
      ]
    });

    await expect(page.locator(".course-card")).toHaveCount(1);
    await expect(page.locator(".course-badge")).toHaveText("OK101");
  });

  test("no uncaught console errors during a normal session", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      // The app logs handled storage problems deliberately; only fail on
      // genuine uncaught errors.
      if (m.type() === "error" && !m.text().includes("Failed to")) errors.push(m.text());
    });

    await openApp(page, { courses: TWO_COURSES });
    await page.locator(".section-item").first().click();
    await page.locator("#btn-auto-combinations").click();
    await page.locator(".combo-card").first().locator(".btn-apply-combo").click();
    await page.locator("#btn-close-drawer").click();
    await page.locator("#btn-theme-toggle").click();

    expect(errors).toEqual([]);
  });
});
