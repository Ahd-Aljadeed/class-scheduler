import { test, expect } from "@playwright/test";
import { openApp, overflowOf, expectFitsViewport, VIEWPORTS, course, slot } from "./helpers.js";

/**
 * Regression tests for modal overflow.
 *
 * The Add Class modal had no height cap above the 900px breakpoint, and
 * `overflow: hidden` on the card then clipped whatever did not fit. Adding
 * sections grew it past the viewport: at 1280x600 the card was 769px tall,
 * overflowing by 170px, and the Save button could not be reached at all.
 */

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("Add Class modal stays inside the viewport when sections are added", async ({ page }) => {
      await openApp(page);

      await page.locator("#btn-import-modal").click();
      const card = page.locator("#import-modal-overlay .modal-card");
      await expect(card).toBeVisible();

      // Grow the form the way a real user would: several sections, each with
      // an extra day/time row.
      for (let i = 0; i < 3; i++) {
        await page.locator("#btn-add-section").click();
      }
      for (const btn of await page.locator(".btn-add-time-slot").all()) {
        await btn.click();
      }

      await expectFitsViewport(expect, card, `Add Class modal at ${vp.name}`);
    });

    test("the Save button is reachable once the form is tall", async ({ page }) => {
      await openApp(page);
      await page.locator("#btn-import-modal").click();

      for (let i = 0; i < 3; i++) {
        await page.locator("#btn-add-section").click();
      }

      const submit = page.locator("#manual-course-form button[type='submit']");
      // scrollIntoViewIfNeeded throws if the element cannot be revealed, and
      // click() would fail on an element outside the viewport.
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();
    });

    test("the modal body scrolls rather than clipping its content", async ({ page }) => {
      await openApp(page);
      await page.locator("#btn-import-modal").click();
      for (let i = 0; i < 3; i++) {
        await page.locator("#btn-add-section").click();
      }

      const body = page.locator("#import-modal-overlay .modal-body");
      const state = await body.evaluate((el) => ({
        overflowY: getComputedStyle(el).overflowY,
        clipped: el.scrollHeight - el.clientHeight
      }));

      expect(state.overflowY, "body must be scrollable").toBe("auto");

      if (state.clipped > 1) {
        // If content is taller than the body, scrolling must actually move.
        const moved = await body.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
          return el.scrollTop;
        });
        expect(moved, "body should scroll when its content overflows").toBeGreaterThan(0);
      }
    });

    test("a long alert message stays on screen with its OK button", async ({ page }) => {
      await openApp(page);
      await page.evaluate(() => {
        const longWord = "Averylongunbrokenstringwithnospaces".repeat(12);
        window.alert(`${longWord} ${"normal words here ".repeat(60)}`);
      });

      const card = page.locator(".custom-alert-card");
      await expect(card).toBeVisible();

      await expectFitsViewport(expect, card, `alert dialog at ${vp.name}`);
      await expect(page.locator(".btn-custom-modal-ok")).toBeInViewport();
    });

    test("the welcome modal fits", async ({ page }) => {
      await openApp(page);
      await page.locator("#btn-welcome-modal").click();

      const card = page.locator("#welcome-modal-overlay .modal-card");
      await expect(card).toBeVisible();

      await expectFitsViewport(expect, card, `welcome modal at ${vp.name}`);
    });

    test("the optimizer drawer fits and its list scrolls", async ({ page }) => {
      await openApp(page, {
        courses: [
          course("c1", "CS101", [
            { times: [slot("Mon", "09:00", "10:00")] },
            { times: [slot("Tue", "09:00", "10:00")] }
          ]),
          course("c2", "MA201", [
            { times: [slot("Wed", "11:00", "12:00")] },
            { times: [slot("Thu", "11:00", "12:00")] }
          ])
        ]
      });

      await page.locator("#btn-auto-combinations").click();
      const drawer = page.locator("#combinations-drawer-overlay .drawer-content");
      await expect(drawer).toBeVisible();

      await expectFitsViewport(expect, drawer, `optimizer drawer at ${vp.name}`);
    });

    test("the main page never scrolls sideways", async ({ page }) => {
      await openApp(page, {
        courses: [
          course("c1", "VERYLONGCOURSECODE999", [
            { instructor: "Professor Bartholomew Fitzgerald-Montgomery",
              location: "Engineering and Applied Sciences Building, Room 4021",
              times: [slot("Mon", "09:00", "10:30")] }
          ])
        ],
        selections: { c1: "c1-s0" }
      });

      const pageOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(pageOverflow, "long course text must not widen the page").toBeLessThanOrEqual(0);
    });
  });
}
