import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-level tests. These run against the real production build, because
 * the bugs worth catching here (layout overflow, escaping, event wiring) only
 * show up once CSS is applied and the bundle is executing.
 */
export default defineConfig({
  testDir: "./e2e",
  // A failing assertion should mean a real regression, not a slow machine.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Modals slide and fade in. Measuring geometry mid-animation reports a
    // card that is still partly off-screen, which looks exactly like an
    // overflow bug. Asking for reduced motion makes the app's own
    // prefers-reduced-motion rules collapse those animations, so every
    // measurement is taken against the settled layout.
    reducedMotion: "reduce"
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } }
  ],

  // Serves the built site. `npm run build` runs first so the tests always
  // exercise the same output that gets deployed.
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
