# Contributing to UniSchedule

Thanks for your interest. This is a small, dependency-light project and the bar for changes is
mostly "does it keep the app fast, safe and simple".

## Ground rules

`main` is protected. Nobody pushes to it directly, including maintainers. All changes go
through a pull request.

## Getting set up

Requires Node.js 20 or newer.

```bash
git clone https://github.com/Ahd-Aljadeed/class-scheduler.git
cd class-scheduler
npm ci
npm run dev
```

## Making a change

1. **Branch** off `main`:
   ```bash
   git switch -c fix/short-description
   ```
   Prefixes in use: `feat/`, `fix/`, `docs/`, `perf/`, `refactor/`, `hardening/`.

2. **Make the change.** Match the surrounding style — the codebase is plain ES modules with
   no framework, no TypeScript and no build-time magic beyond Vite. Please do not introduce a
   framework or a state library to solve a problem that a function would solve.

3. **Check it passes and still works:**
   ```bash
   npm run test:all     # unit + browser tests
   npm run build
   ```
   First time only, install the browser Playwright needs:
   ```bash
   npx playwright install chromium
   ```

   There are two suites, and CI runs both on every pull request:

   - `npm test` — domain logic on Node's built-in runner: time maths, conflict detection,
     metrics, the combination search, escaping, storage validation, the text parser.
   - `npm run test:e2e` — the real production build in a real browser: core flows,
     persistence, XSS containment, recovery from corrupt stored data, and a responsive
     sweep asserting that every modal fits inside the viewport at eight screen sizes.

   New logic should come with a test. Bug fixes should come with one that fails before the
   fix — if you cannot make it fail first, you have not pinned the bug down.

   **A note on the responsive tests.** Use `expectFitsViewport` from `e2e/helpers.js`
   rather than measuring geometry once. Modals slide and fade in, and a single measurement
   taken on the frame an element becomes visible will catch it mid-animation and report a
   phantom overflow.

4. **Commit** with a clear message explaining *why*, not just what.

5. **Open a pull request** against `main`, describing the change, how you verified it, and any
   trade-off you made.

## Things that will be asked of you in review

These are the project's standing constraints, so it saves a round trip to know them upfront:

- **Escape anything user-supplied that reaches the DOM.** Course data is user input *and* is
  restored from `localStorage`. Anything interpolated into `innerHTML` must go through
  `escapeHtml()` from `src/utils/sanitize.js`; anything reaching a `style` attribute must go
  through `safeColor()`. Prefer `textContent` when you only need text.

- **Validate anything read back from storage.** Add it to `src/utils/validate.js` rather than
  trusting the shape.

- **Keep the hot paths off O(n²).** Use the `courseBySectionId` / `sectionById` Maps instead of
  `courses.find(...)` inside a loop. If you add work to `render()`, remember it runs on every
  click.

- **Do not remove the input caps** in `src/utils/validate.js` without a replacement. They exist
  because course data is persisted: a paste large enough to hang the combination search would
  hang the app on every subsequent load, not just once.

- **Do not commit `dist/` or `node_modules/`.** CI builds from source.

- **Respect `prefers-reduced-motion`** for anything animated, and prefer compositable
  properties (`transform`, `opacity`, `filter`) over ones that force repaints (`box-shadow`).

## Reporting bugs

Open an issue with what you did, what you expected, what happened, and your browser. If it
involves specific course data, the text you pasted into the import box is the most useful thing
you can include.

## Security issues

Please do not open a public issue. Use the repository's **Security** tab → **Report a
vulnerability** so it can be handled privately.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
