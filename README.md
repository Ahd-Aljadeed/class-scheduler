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
  - [Busy time](#busy-time)
  - [Reading the timetable](#reading-the-timetable)
  - [Locking and excluding sections](#locking-and-excluding-sections)
  - [The optimizer](#the-optimizer)
  - [Planning with friends](#planning-with-friends)
  - [Saved plans](#saved-plans)
  - [Exporting to a calendar](#exporting-to-a-calendar)
  - [Sharing a poster](#sharing-a-poster)
  - [Installing it as an app](#installing-it-as-an-app)
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
- **Busy time**: work shifts, gym, prayer times, commute. Busy blocks are drawn on the
  timetable, flag clashes, and the optimizer plans around them.
- **Lock** the section you already got into so the optimizer keeps it; **exclude** sections
  that are full or that you simply do not want.

**The optimizer**

- Enumerates valid, conflict-free timetables (one section per course) and ranks them by
  what you care about: fewest gap hours, most days off, fewest early mornings, fewest
  back-to-back classes, the best match for your weighted preferences, or the most time with
  your friends.
- **Preferences**: hard limits (no classes before or after a time, days you want off, a
  minimum lunch break, a cap on campus hours per day) and weights that roll every metric into
  one 0–100 match score with an arcade rank from S to D.
- **Backups**: the schedules one swap away from your current picks, for when a section fills
  up on registration day.
- Hover any option to ghost it onto the timetable; use ↑ ↓ and Enter to browse and apply from
  the keyboard.
- **Surprise me** spins a slot machine through the valid schedules and applies one.
- Apply any option in a single click.

**Friends**

- Add friends from the people bar. Each person gets their own tab with their own courses,
  picks, locks, preferences and plans, all stored in the same browser, no account needed.
- A new friend starts with a copy of the active person's courses and picks, so the two
  schedules can be compared right away.
- Turn on the friends overlay to see their classes outlined on your timetable, the sections
  you share, and green bands for the breaks you have together. The analytics panel adds a
  "Together with friends" card and the optimizer gets a "With friends" sort.

**Saved plans**

- Keep several named candidate schedules per person and compare any two side by side, with
  compact timetables and a metrics table that highlights the better value in each row.

**Analytics**

- Total gap hours, campus hours, class hours and days off for the current selection.
- A per-day breakdown showing first class, last class, and where the gaps fall.
- Gap bands drawn directly on the timetable, so a three-hour hole is something you see
  rather than something you compute.
- Automatic highlight badges — "No Friday Classes", "3-Day Weekend", "Zero Gap Hours",
  "No Early Mornings", and warnings when gaps get excessive.
- A preference match score for the current picks, relative to every valid schedule.
- A **free-time heatmap**: across all valid schedules, how often each half hour of the week is
  free. Handy for picking a club or a shift before committing to a timetable.

**Interface**

- Two visual modes: **Arcade** (retro, CRT scanlines, chiptune sound effects synthesized in
  the browser with the Web Audio API — no audio files) and **Regular** (plain and quiet).
- Dark and light themes.
- Responsive down to phone width, with a bottom navigation bar and a single-day timetable view.
- Respects `prefers-reduced-motion`.
- The grid shows 08:00–20:00 by default and grows automatically when a class falls outside it.

**Import / export**

- Export the finished timetable as an `.ics` file for Google Calendar, Apple Calendar or
  Outlook, as weekly recurring events. Term start, length and holidays are configurable.
- Export a poster-sized PNG of the timetable to share on stories or in a group chat.

**Installable**

- A web app manifest and a service worker make it installable on phones and desktops, and it
  keeps working offline once it has been opened once.

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

### Busy time

The third tab of the **+ Class** modal adds a busy block: a label (Work, Gym, Prayer), a colour
and one or more day/time ranges. Busy blocks are always "selected": they appear hatched on the
timetable, any section that overlaps one is flagged in the sidebar, and the optimizer never
produces a schedule that touches them. They are kept out of the gap, campus and class-hour
numbers, since a shift is not a gap. Remove one from the sidebar's *Busy times* group or from
its detail sheet.

### Reading the timetable

The grid runs Sunday to Saturday, 08:00 to 20:00, at one hour per row.

- **Solid coloured blocks** are your selected sections, coloured per course.
- **Hatched / red blocks** are conflicts — two selected sections occupying the same time.
- **Shaded bands** between classes are gap hours, labelled with their duration.
- **Translucent blocks** are the hover preview of a section you have not selected.

Click any block for a detail sheet with the instructor, room and exact times, plus a button
to drop that section.

On a phone the grid shows one day at a time; use the day tabs above it.

Hatched grey blocks are busy time. With the friends overlay on, dashed outlined blocks are a
friend's classes, a small chip on one of your blocks names the friends sitting in the same
section, and green bands mark the breaks you share.

### Locking and excluding sections

Each section in the sidebar has two small buttons:

- **Lock** (padlock): the optimizer only ever picks this section for its course. Locking also
  selects it. Use it for the section you already secured.
- **Exclude** (no-entry sign): the section is skipped by the optimizer and cannot be selected
  until you include it again. Use it for full sections or instructors you want to avoid.

A course whose every section is excluded is left out of the search, and the optimizer says so.
Locks and exclusions are saved per person; the drawer shows them with a one-click **Reset**.

### The optimizer

The **Auto** button opens the optimizer drawer. The number on the button is how many valid
conflict-free timetables exist for your current course list.

Sort orders:

| Sort | Optimises for |
|---|---|
| **Fewest gaps** | Least total dead time between classes |
| **Most days off** | Most completely free days |
| **No early mornings** | Fewest classes starting before 09:00 |
| **No back-to-back** | Fewest back-to-back classes (pairs 10 minutes or less apart) |
| **Best match** | Highest weighted preference score |
| **Backups** | Schedules one or two swaps away from your current picks, closest first |
| **With friends** | Most hours in the same sections or on shared breaks (shown once you add a friend) |

Each card shows that option's gap hours, campus hours, days off, back-to-back count and match
score, and the exact sections it uses. **Apply Schedule** switches your whole selection to it.
Hovering a card ghosts it onto the timetable behind the drawer, dimming the blocks it would
replace; ↑ ↓ move a focus ring through the list, Enter applies, Escape closes.

**Preferences** (the ⚙ button) opens two groups of controls:

- *Hard limits* filter the list: no classes before or after a time, days you want off, a
  minimum lunch break inside a window, and a cap on campus hours per day. Schedules that break
  a limit are hidden with a count and a **Show them** link; shown, each carries a red note
  saying which limit it breaks.
- *Weights* (0 to 3) for gap hours, days off, early mornings, back-to-back classes and campus
  time feed the match score. Every metric is min-max normalised against the full set of valid
  schedules, so the best schedule for your weights scores near 100 and the worst near 0. The
  score is only comparable within one course list. Ranks: S ≥ 95, A ≥ 85, B ≥ 70, C ≥ 50,
  otherwise D.

**Surprise me** spins through the listed schedules for a second and a half, ticking as it
goes, then applies one at random. With reduced motion enabled it applies one immediately.

### Planning with friends

The people bar under the header holds a tab per person, starting with **Me**. **+ Add friend**
asks for a name and a colour and, by default, starts the friend with a copy of the active
person's courses and picks. Each tab is a completely separate planner: courses, selections,
locks, exclusions, preferences and saved plans all belong to the person whose tab is active.
Click the active tab to rename, recolour or remove a person.

With at least one friend, a **Show friends on my timetable** toggle appears. It overlays the
other people's classes as dashed blocks in their colour, marks the sections you share with a
chip on your own block, and draws green *Free with …* bands where your on-campus breaks
overlap theirs. The analytics panel gains a *Together with friends* card (hours in the same
sections, hours of shared breaks, shared days off, and the biggest shared breaks), and the
optimizer gains a **With friends** sort that ranks your options by time together, using each
friend's current picks. Switching tabs and re-running the optimizer for each person converges
quickly on a good group plan.

Sections are matched by id when a friend's courses were copied from yours, and otherwise by
course code plus identical meeting times, so a friend who typed the same course in separately
still counts.

### Saved plans

**Plans** in the header saves the current selection under a name (up to 12 per person),
loads a plan back, or deletes it. The compare section picks any two of the current schedule
and the saved plans and shows them side by side: two compact timetables and a table of gap
hours, campus hours, class hours, days off, early classes, back-to-back count and match
score, with the better value in each row highlighted.

### Exporting to a calendar

**Export** downloads `UniSchedule.ics` containing one weekly recurring event per class slot
(busy blocks included, labelled as such). Import it into any calendar app.

The gear button in the header opens **Term & export settings**: the term start date (default:
the coming Sunday), the length in weeks (default 15), and holiday ranges. Each class's first
occurrence is the first matching weekday on or after the start date, and holiday dates that
fall on a class day become `EXDATE`s, so the calendar app skips them.

### Sharing a poster

**Poster** renders the current timetable to a 1080×1350 PNG in the current theme: the week
grid with gap bands, the headline metrics, the match score and rank, and the badges. Download
it, or on phones and other browsers that support sharing files, send it straight to a chat
app or a story.

### Installing it as an app

The site ships a web app manifest and a service worker. In Chrome, Edge or Safari use the
browser's *Install* / *Add to Home Screen* action. After the first visit the app shell and
its assets are cached, so it opens and works with no connection; page loads still go to the
network first, so a new deploy shows up as soon as you are online.

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
| `npm test` | Unit tests for the domain logic (Node's built-in runner) |
| `npm run test:e2e` | Browser tests: behaviour and responsive layout (Playwright) |
| `npm run test:all` | Both suites |
| `npm run build` | Production build into `dist/` |

The first `npm run test:e2e` needs a browser: `npx playwright install chromium`.
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
│   │                           owns all state, wires the core listeners, and holds
│   │                           the main render functions (course list, timetable,
│   │                           analytics, optimizer drawer).
│   ├── style.css               All styling: theme tokens, layout, arcade/regular
│   │                           modes, dark/light themes, responsive breakpoints.
│   ├── data/
│   │   └── sampleCourses.js    Starting course list (empty) and the colour palette
│   │                           assigned to imported courses.
│   ├── features/               One module per self-contained feature. Each exports
│   │   │                       an init(app) that wires its DOM and, where needed,
│   │   │                       a render(app) the main loop calls.
│   │   ├── people.js           People bar, add/edit/remove friend modal, the
│   │   │                       "Together with friends" card.
│   │   ├── preferences.js      The preferences panel in the optimizer drawer.
│   │   ├── plans.js            Saved plans modal and side-by-side comparison.
│   │   ├── settings.js         Term & export settings modal.
│   │   ├── heatmap.js          Free-time heatmap in the analytics panel.
│   │   ├── poster.js           Poster preview modal, download and Web Share.
│   │   └── surprise.js         The "Surprise me" slot machine.
│   └── utils/
│       ├── scheduler.js        Domain logic: time maths, conflict detection,
│       │                       combination search (with locks and exclusions),
│       │                       metrics, selection diffs, grid range, .ics generation.
│       ├── prefs.js            Preference defaults, hard-limit checks and the
│       │                       weighted match score.
│       ├── together.js         Shared sections, overlapping breaks and merged
│       │                       "free with…" segments between two people.
│       ├── heatmap.js          Free-time frequencies across all valid schedules.
│       ├── miniTimetable.js    Compact read-only week grid used by the comparison.
│       ├── poster.js           Canvas rendering of the shareable poster.
│       ├── parser.js           Free-text → course objects.
│       ├── validate.js         Schema validation for data restored from
│       │                       localStorage (courses, selections, people, per-person
│       │                       extras, term settings), plus the size limits.
│       ├── sanitize.js         HTML / CSS-colour / iCalendar escaping helpers.
│       ├── customModal.js      Promise-based alert and confirm dialogs replacing
│       │                       the native blocking ones.
│       └── arcadeAudio.js      8-bit sound effects synthesized with the Web Audio
│                               API. No audio assets.
├── public/
│   ├── manifest.webmanifest    Web app manifest (name, icons, standalone display).
│   ├── sw.js                   Service worker: app-shell caching for offline use.
│   │                           Its cache version is stamped at build time.
│   └── icons/                  PNG icons generated by scripts/make-icons.mjs.
├── scripts/
│   └── make-icons.mjs          Renders the app icon to PNG with Playwright's Chromium.
├── test/                       Unit tests (Node's runner, no browser).
│   ├── scheduler.test.js       Time maths, conflict detection, metrics, the
│   │                           combination search and .ics generation.
│   ├── sanitize.test.js        Escaping, storage validation, and the text parser.
│   └── features.test.js        Busy blocks, locks and exclusions, preferences and
│                               scoring, togetherness, the heatmap, people and term
│                               validation, term-aware .ics export.
├── e2e/                        Browser tests (Playwright, real build).
│   ├── app.spec.js             Core flows, persistence, XSS containment,
│   │                           recovery from corrupt stored data.
│   ├── features.spec.js        Busy blocks, locks, backups, preferences, previews
│   │                           and keyboard, friends, plans, settings, heatmap,
│   │                           poster, manifest and service worker.
│   ├── responsive.spec.js      Every modal must fit inside the viewport at
│   │                           eight screen sizes, including short ones.
│   └── helpers.js              Shared fixtures and overflow measurement.
└── .github/workflows/
    ├── ci.yml                  Tests, build and audit on every pull request.
    └── deploy.yml              Publishes to GitHub Pages on push to main.
```

`dist/` and `node_modules/` are build/install output and are deliberately not committed —
CI builds the site from source on every push.

---

## How it works

### Data model

Three nested plain objects. No classes, no framework:

```js
Course  { id, code, title, color, sections: [Section], kind?: "busy" }
Section { id, name, instructor, location, times: [TimeSlot] }
TimeSlot{ day: "Mon", startTime: "09:00", endTime: "10:30" }   // 24-hour, zero-padded
```

The current selection is a flat map, `{ [courseId]: sectionId }` — at most one section per
course, which is the rule the whole app is built around.

A busy block is a course with `kind: "busy"` and exactly one section. It is always treated
as selected, takes part in conflict detection and the search like any other course, and is
kept out of the class, campus and gap numbers.

People are `{ id, name, color }`; `me` always exists and comes first. Each person owns a
course list, a selection map and an *extras* record:

```js
Extras { locked: [sectionId], excluded: [sectionId], prefs: Prefs, plans: [Plan] }
Plan   { id, name, selections: { [courseId]: sectionId }, savedAt }
Term   { startDate: "YYYY-MM-DD" | "", weeks, holidays: [{ start, end, label }] }
```

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

Locks and exclusions narrow each course's candidate list before the search starts: a locked
section is the only candidate for its course, and excluded sections are dropped. A course
with nothing left to pick is skipped like a course with no sections.

Results are memoized on the app instance. The valid-combination set depends only on the course
list and on locks and exclusions, never on what is currently selected, so selecting a section
costs no search work at all — the cache is invalidated only when courses change or a lock or
exclusion is toggled.

Everything layered on top of the search reads from that cached list: the match score
normalises each metric against the min and max across all valid schedules, the backups tab
diffs each schedule against the current selection, the "With friends" sort scores each
schedule against the friends' current picks, and the heatmap counts, per half hour, how many
schedules leave it free.

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

Everything lives in `localStorage`, saved on every change and restored on load:

| Key | Holds |
|---|---|
| `unischedule_courses_v3`, `unischedule_selections_v3` | "Me"'s courses and picks (the original keys, so nothing is migrated) |
| `unischedule_courses_v3:<id>`, `unischedule_selections_v3:<id>` | The same for each friend |
| `unischedule_person_v1:<id>` | A person's locks, exclusions, preferences and saved plans |
| `unischedule_people_v1`, `unischedule_active_person_v1` | The people list and whose tab is open |
| `unischedule_term_v1` | Term & export settings |
| `unischedule_mode_v1`, `unischedule_theme_v1`, `unischedule_friend_overlay_v1`, `unischedule_heatmap_open_v1` | UI state |

Restored data is **validated, not trusted**. `sanitizeCourses()`, `sanitizeSelections()`,
`sanitizePeople()`, `sanitizePersonExtras()` and `sanitizeTerm()` check every field — ids are
strings, days are real day names, times match `HH:MM`, a slot cannot end before it starts,
colours must be hex, a lock must point at a real section and never at an excluded one, dates
must exist — and drop anything malformed rather than letting it reach the render pipeline.
Selections that no longer resolve to a real section are discarded.

To wipe a person's courses, use the trash icon in the header; to remove a friend entirely,
click their tab and choose **Remove**; or clear site data in your browser.

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
| People (you plus friends) | 6 |
| Saved plans per person | 12 |
| Holiday ranges | 20 |

Other boundaries: the timetable shows **08:00–20:00** by default and stretches to fit any
class outside that window. The `.ics` export assumes a 15-week term starting the coming Sunday
unless the term settings say otherwise.

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
- **Service worker.** Only same-origin requests under the app's own path and the Google Fonts
  hosts are ever cached; everything else, analytics included, passes straight through. The
  cache name carries a build id, so a deploy replaces the previous cache rather than mixing
  with it.

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
