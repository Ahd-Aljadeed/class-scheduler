# UniSchedule — University Class & Gap Hours Planner

A browser-based timetable planner for university registration. You enter every section your
university offers for the courses you want, and UniSchedule works out which combinations
actually fit together — then shows you what each one costs you in gap hours, campus time and
days off.

**Live app:** https://ahd-aljadeed.github.io/class-scheduler/

Everything runs in your browser. There is no backend, no account, and no network request:
your course data is stored in your own browser's `localStorage` and never leaves your device.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Features](#features)
- [How to use it](#how-to-use-it)
  - [Adding courses](#adding-courses)
  - [Text import format](#text-import-format)
  - [Reading the timetable](#reading-the-timetable)
  - [The optimizer](#the-optimizer)
  - [Exporting to a calendar](#exporting-to-a-calendar)
- [Running it locally](#running-it-locally)
- [Project structure](#project-structure)
- [How it works](#how-it-works)
  - [Data model](#data-model)
  - [Conflict detection](#conflict-detection)
  - [The combination search](#the-combination-search)
  - [Schedule metrics](#schedule-metrics)
  - [Rendering](#rendering)
  - [Persistence](#persistence)
- [Limits](#limits)
- [Security notes](#security-notes)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Why this exists

Course registration usually means juggling a printed section list and a blank timetable grid,
trying combinations by hand until one fits. The hard part is not spotting a direct clash —
it is noticing that the only combination without a clash leaves you with a four-hour hole on
Tuesday and kills your Friday.

UniSchedule does the combinatorial part for you and makes the trade-offs visible, so you pick
a timetable on purpose rather than by exhaustion.

---

## Features

**Planning**

- Add courses manually, or paste a block of text from your registration portal and let the
  parser pull out sections, days, times, rooms and instructors.
- Pick one section per course. Sections that would clash with your current picks are flagged
  in the sidebar before you click them, with the specific course they overlap.
- Hover a section to see a ghost preview of it on the timetable without committing.
- A banner appears the moment your selection contains a genuine conflict, with a one-click
  jump to the optimizer.

**The optimizer**

- Enumerates valid, conflict-free timetables (one section per course) and ranks them by
  what you care about: fewest gap hours, most days off, fewest early mornings, or fewest
  back-to-back classes.
- Apply any option in a single click.

**Analytics**

- Total gap hours, campus hours, class hours and days off for the current selection.
- A per-day breakdown showing first class, last class, and where the gaps fall.
- Gap bands drawn directly on the timetable, so a three-hour hole is something you see
  rather than something you compute.
- Automatic highlight badges — "No Friday Classes", "3-Day Weekend", "Zero Gap Hours",
  "No Early Mornings", and warnings when gaps get excessive.

**Interface**

- Two visual modes: **Arcade** (retro, CRT scanlines, chiptune sound effects synthesized in
  the browser with the Web Audio API — no audio files) and **Regular** (plain and quiet).
- Dark and light themes.
- Responsive down to phone width, with a bottom navigation bar and a single-day timetable view.
- Respects `prefers-reduced-motion`.

**Import / export**

- Export the finished timetable as an `.ics` file for Google Calendar, Apple Calendar or
  Outlook, as a weekly recurring event for 15 weeks.

---

## How to use it

### Adding courses

Two routes, both behind the **+ Class** button:

1. **Manual entry** — enter a course title (required), an optional course code and colour,
   then build one or more sections. Each section takes a name, an optional instructor and
   room, and one or more day/time slots. A course that meets Monday and Wednesday at the same
   time is *one* section with *two* slots, not two sections.

2. **Text import** — paste a block of text and let the parser do the work.

### Text import format

The parser looks for course-code headers and section lines. A course header is a line like
`CS101` or `MATH 201 - Calculus II`, with no time on it. Any following line that contains a
time range is treated as a section of that course.

```
CS101 Intro to Computer Science
Sec 01 - Dr. Turing - Mon/Wed 09:00-10:30 Tech Bldg 101
Sec 02 - Grace Hopper - Tue/Thu 11:00-12:30 Tech Bldg 102

MATH201 Calculus II
Sec 01: Mon/Wed 11:00-12:30 Math Hall 301
Sec 02: Tue/Thu 09:00-10:30 Math Hall 304
```

What it recognises:

| Field | Recognised as | Falls back to |
|---|---|---|
| Course code | `CS101`, `MATH 201`, `PHYS301A` at the start of a line | a generic "COURSE 101" |
| Days | `Mon`, `Tue`, `M`, `TTh`, `MW`, `MWF`, full names | `Mon` |
| Times | `09:00-10:30`, `9:00 AM - 10:30 AM`, `9:00 to 10:30` | (a line with no time is not a section) |
| Room | after `Rm`, `Room`, `Hall`, `Bldg`, `Lab` | `TBD` |
| Instructor | after `Dr.` or `Prof.` | `Staff` |

Times are normalised to 24-hour internally. Anything the parser cannot read is simply skipped,
so check the sidebar after importing and fix anything it missed by hand.

The **Load Sample** button fills the box with a working example.

### Reading the timetable

The grid runs Sunday to Saturday, 08:00 to 20:00, at one hour per row.

- **Solid coloured blocks** are your selected sections, coloured per course.
- **Hatched / red blocks** are conflicts — two selected sections occupying the same time.
- **Shaded bands** between classes are gap hours, labelled with their duration.
- **Translucent blocks** are the hover preview of a section you have not selected.

Click any block for a detail sheet with the instructor, room and exact times, plus a button
to drop that section.

On a phone the grid shows one day at a time; use the day tabs above it.

### The optimizer

The **Auto** button opens the optimizer drawer. The number on the button is how many valid
conflict-free timetables exist for your current course list.

Four sort orders:

| Sort | Optimises for |
|---|---|
| **Gaps** | Least total dead time between classes |
| **Days off** | Most completely free days |
| **Mornings** | Fewest classes starting before 09:00 |
| **Spread** | Fewest back-to-back classes (pairs 10 minutes or less apart) |

Each card shows that option's gap hours, campus hours, days off and back-to-back count, and
the exact sections it uses. **Apply Schedule** switches your whole selection to it.

### Exporting to a calendar

**Export** downloads `UniSchedule.ics` containing one weekly recurring event per class slot,
repeating for 15 weeks starting the coming Sunday. Import it into any calendar app.

> The 15-week run and the start date are fixed. If your term differs, adjust the events after
> importing, or edit `generateICS` in `src/utils/scheduler.js`.

---

## Running it locally

Requires **Node.js 20 or newer**.

```bash
git clone https://github.com/Ahd-Aljadeed/class-scheduler.git
cd class-scheduler
npm ci
npm run dev
```

Vite serves the app at `http://localhost:5173` with hot reloading.

| Script | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built `dist/` locally to check it before deploying |
| `npm run deploy` | Manually publish `dist/` to the `gh-pages` branch (not normally needed — see [Deployment](#deployment)) |

---

## Project structure

```
class-scheduler/
├── index.html                  Full page markup: header, sidebar, grid, analytics
│                               panel, and every modal. All DOM is defined here
│                               and populated by JS — there is no templating layer.
├── vite.config.js              Vite config. `base: './'` keeps asset paths relative
│                               so the build works from a project subpath on Pages.
├── src/
│   ├── main.js                 The application. A single UniScheduleApp class that
│   │                           owns all state, wires every listener, and holds the
│   │                           render functions.
│   ├── style.css               All styling: theme tokens, layout, arcade/regular
│   │                           modes, dark/light themes, responsive breakpoints.
│   ├── data/
│   │   └── sampleCourses.js    Starting course list (empty) and the colour palette
│   │                           assigned to imported courses.
│   └── utils/
│       ├── scheduler.js        Domain logic: time maths, conflict detection,
│       │                       combination search, metrics, .ics generation.
│       ├── parser.js           Free-text → course objects.
│       ├── validate.js         Schema validation for data restored from
│       │                       localStorage, plus the size limits.
│       ├── sanitize.js         HTML / CSS-colour / iCalendar escaping helpers.
│       ├── customModal.js      Promise-based alert and confirm dialogs replacing
│       │                       the native blocking ones.
│       └── arcadeAudio.js      8-bit sound effects synthesized with the Web Audio
│                               API. No audio assets.
└── .github/workflows/deploy.yml   Builds and publishes to GitHub Pages on push to main.
```

`dist/` and `node_modules/` are build/install output and are deliberately not committed —
CI builds the site from source on every push.

---

## How it works

### Data model

Three nested plain objects. No classes, no framework:

```js
Course  { id, code, title, color, sections: [Section] }
Section { id, name, instructor, location, times: [TimeSlot] }
TimeSlot{ day: "Mon", startTime: "09:00", endTime: "10:30" }   // 24-hour, zero-padded
```

The current selection is a flat map, `{ [courseId]: sectionId }` — at most one section per
course, which is the rule the whole app is built around.

### Conflict detection

Times are converted to minutes-from-midnight and compared as intervals. Two slots overlap when

```
max(startA, startB) < min(endA, endB)
```

Back-to-back classes (one ending exactly when the next begins) are deliberately *not* a
conflict. Two sections conflict if any of their slots overlap; a selection is in conflict if
any pair of its sections conflicts.

### The combination search

`generateAllCombinations()` finds every way of picking one section per course such that
nothing clashes.

It runs as depth-first backtracking with pruning. A conflict matrix between sections of
different courses is built once up front, so the test at each step is a set lookup rather
than re-parsing time strings. A branch is abandoned the moment a candidate section clashes
with something already chosen, instead of building the full combination and discarding it.

This matters because the search space is multiplicative: 8 courses with 4 sections each is
65,536 raw combinations, and 10 courses is over a million. An earlier version built that
entire product in memory before filtering, which froze the tab for over a second at 8 courses
and ran out of memory beyond 10. Pruning plus a hard cap of 2,000 collected results keeps it
in the tens of milliseconds.

Results are memoized on the app instance. The valid-combination set depends only on the course
list, never on what is currently selected, so selecting a section costs no search work at all —
the cache is invalidated only when courses are added, removed or imported.

### Schedule metrics

`calculateScheduleMetrics()` takes the selected sections and returns, per day and in total:

- **Class hours** — time actually spent in class.
- **Campus hours** — first class start to last class end. What the day really costs you.
- **Gap hours** — campus hours minus class hours, computed by walking each day's slots in
  order and measuring the holes. Overlapping classes are merged so a conflict is not
  miscounted as a gap.
- **Days off** — days with no classes at all.

It also derives the highlight badges and the gap intervals the timetable draws as bands.

### Rendering

Plain imperative DOM: no virtual DOM, no reactivity. `render()` computes the metrics once and
passes them to the three panel renderers, each of which clears its container and rebuilds it.

Deliberate choices worth knowing before you change anything here:

- Everything interpolated into `innerHTML` goes through `escapeHtml()`, and anything reaching
  a `style` attribute goes through `safeColor()`. Course data is user-supplied and persisted,
  so it is treated as untrusted on the way out.
- `sectionId → course` and `sectionId → section` lookup Maps are rebuilt whenever courses
  change, replacing repeated linear scans that used to run inside render loops.
- The timetable builds its ~120 elements into a `DocumentFragment` and attaches once.
- Combination cards use one delegated listener on the list container, and only the top 100 are
  built — a full list could be thousands of cards.
- Search input is debounced; hover re-renders are skipped when the hovered section is unchanged.

### Persistence

Four `localStorage` keys: courses, selections, UI mode, theme (plus a first-visit flag and the
sound mute state). Saved on every change, restored on load.

Restored data is **validated, not trusted**. `sanitizeCourses()` and `sanitizeSelections()`
check every field — ids are strings, days are real day names, times match `HH:MM`, a slot
cannot end before it starts, colours must be hex — and drop anything malformed rather than
letting it reach the render pipeline. Selections that no longer resolve to a real section are
discarded.

To wipe everything, use the trash icon in the header, or clear site data in your browser.

---

## Limits

Caps exist to keep the app responsive and to stop a bad paste from wedging it permanently
(course data is persisted, so a hang on render would recur on every subsequent visit):

| Limit | Value |
|---|---|
| Courses | 60 |
| Sections per course | 25 |
| Time slots per section | 14 |
| Lines read per text import | 500 |
| Combinations collected | 2,000 |
| Combination cards rendered | 100 |

Other boundaries: the timetable displays **08:00–20:00** only, so a class outside that window
will not appear on the grid (it still counts in the analytics). The `.ics` export assumes a
15-week term starting the coming Sunday.

---

## Security notes

The app is static and client-side, which removes most of the usual attack surface — there is
no server, no authentication, no network request, and no third-party data ingestion. What
remains, and how it is handled:

- **Output escaping.** Course fields are rendered through template-literal `innerHTML`.
  Every interpolation is escaped (`src/utils/sanitize.js`); colours are validated as hex
  before touching a `style` attribute.
- **A Content-Security-Policy** is declared via `<meta>` in `index.html`, since GitHub Pages
  cannot set response headers. It blocks inline and third-party script, forbids framing, and
  disallows outbound connections. It is defence in depth behind the escaping, not a substitute.
- **Untrusted storage.** Everything read back from `localStorage` is schema-validated. On
  GitHub Pages all of an account's projects share one origin, so storage is not assumed to be
  written only by this app.
- **Input caps** bound the combination search so it cannot be driven into a hang.
- **Supply chain.** One runtime dependency (`canvas-confetti`). CI runs `npm ci` with no
  fallback, so a lockfile mismatch fails the build rather than silently resolving new versions,
  and every GitHub Action is pinned to a full commit SHA.

Found something? Please open a private security advisory via the repository's **Security** tab
rather than a public issue.

---

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site and publishes
it to GitHub Pages. The workflow needs **Settings → Pages → Source** set to **GitHub Actions**
(not "Deploy from a branch").

`vite.config.js` sets `base: './'` so assets resolve correctly from the
`/class-scheduler/` subpath, and `.nojekyll` stops GitHub from running Jekyll over the output.

The `npm run deploy` script (`gh-pages -d dist`) is an escape hatch for publishing by hand; the
Actions workflow is the normal path.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: `main` is protected, so work on a branch and
open a pull request. Run `npm run build` before pushing.

---

## License

[MIT](LICENSE) © Ahd Aljadeed
