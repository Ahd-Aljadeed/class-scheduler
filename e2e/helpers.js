/**
 * Shared helpers for the browser tests.
 */

/**
 * Loads the app with a known clean state and waits for it to boot.
 * The welcome modal is marked as already seen so it does not sit on top of
 * whatever the test is trying to interact with.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{courses?: unknown, selections?: unknown, soundMuted?: string}} [seed]
 */
export async function openApp(page, seed = {}) {
  // addInitScript runs before any page script, so the app reads this state on
  // its very first load rather than after an extra reload.
  //
  // It also runs again on every subsequent navigation, including page.reload().
  // The sentinel keeps it from wiping storage a second time, which would make
  // any test that reloads to check persistence silently meaningless.
  await page.addInitScript((s) => {
    try {
      if (localStorage.getItem("__e2e_seeded") === "1") return;
      localStorage.clear();
      localStorage.setItem("__e2e_seeded", "1");
      localStorage.setItem("unischedule_welcome_seen_v1", "true");
      if (s.courses !== undefined) {
        localStorage.setItem("unischedule_courses_v3", JSON.stringify(s.courses));
      }
      if (s.selections !== undefined) {
        localStorage.setItem("unischedule_selections_v3", JSON.stringify(s.selections));
      }
      if (s.soundMuted !== undefined) {
        localStorage.setItem("unischedule_sound_muted", s.soundMuted);
      }
    } catch (e) {
      // Storage unavailable: the app must still work, which is itself the test.
    }
  }, seed);

  await page.goto("/");
  await page.waitForFunction(() => !!(window.app && Array.isArray(window.app.courses)));
}

/** A minimal, valid course fixture. */
export function course(id, code, sections) {
  return {
    id,
    code,
    title: `${code} Title`,
    color: "#6366f1",
    sections: sections.map((s, i) => ({
      id: `${id}-s${i}`,
      name: s.name || `Sec 0${i + 1}`,
      instructor: s.instructor || "Staff",
      location: s.location || "Rm 1",
      times: s.times
    }))
  };
}

export const slot = (day, startTime, endTime) => ({ day, startTime, endTime });

/**
 * Measures how far an element escapes the viewport on each side, and whether
 * the page itself has been forced to scroll horizontally.
 *
 * @param {import('@playwright/test').Locator} locator
 */
export async function overflowOf(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      top: Math.round(Math.max(0, -r.top)),
      bottom: Math.round(Math.max(0, r.bottom - vh)),
      left: Math.round(Math.max(0, -r.left)),
      right: Math.round(Math.max(0, r.right - vw)),
      width: Math.round(r.width),
      height: Math.round(r.height),
      pageHorizontal: Math.max(0, document.documentElement.scrollWidth - vw)
    };
  });
}

/**
 * Asserts that an element is fully inside the viewport and has not forced the
 * page to scroll sideways.
 *
 * Polls rather than measuring once: a modal is reported "visible" on the frame
 * its class changes, while a slide-in transform may not have been applied yet,
 * so a single measurement can catch the card still parked off-screen. Polling
 * waits for the settled layout but still fails if the element genuinely never
 * fits.
 *
 * @param {import('@playwright/test').Expect} expect
 * @param {import('@playwright/test').Locator} locator
 * @param {string} label
 */
export async function expectFitsViewport(expect, locator, label) {
  await expect
    .poll(async () => await overflowOf(locator), {
      message: `${label} should sit entirely within the viewport`,
      timeout: 5000
    })
    .toMatchObject({ top: 0, bottom: 0, left: 0, right: 0, pageHorizontal: 0 });
}

/** Viewports the layout must survive, including deliberately short ones. */
export const VIEWPORTS = [
  { name: "desktop 1920x1080", width: 1920, height: 1080 },
  { name: "laptop 1366x768", width: 1366, height: 768 },
  { name: "short laptop 1280x600", width: 1280, height: 600 },
  { name: "tablet landscape 1024x600", width: 1024, height: 600 },
  { name: "tablet portrait 768x1024", width: 768, height: 1024 },
  { name: "phone 390x844", width: 390, height: 844 },
  { name: "phone landscape 844x390", width: 844, height: 390 },
  { name: "small phone 320x568", width: 320, height: 568 }
];
