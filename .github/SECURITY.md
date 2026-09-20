# Security Policy

## Supported versions

This project is deployed continuously from `main`. Only the currently deployed version is
supported — fixes land on `main` and go live on the next push.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private reporting instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the issue, the steps to reproduce it, and what an attacker could achieve.

You can expect an initial response within about a week.

## Scope

UniSchedule is a static, client-side application. It has no server, no accounts, no network
requests and no third-party data ingestion. All course data lives in the visitor's own browser
`localStorage`.

Most relevant to this project:

- Cross-site scripting through course data (course codes, titles, section names, instructors,
  rooms) reaching the DOM.
- Bypasses of the input validation in `src/utils/validate.js` or the escaping in
  `src/utils/sanitize.js`.
- Input that drives the combination search in `src/utils/scheduler.js` into a hang. This is
  treated as a real issue rather than a nuisance, because course data is persisted — a payload
  that hangs the page would hang it again on every subsequent visit.
- Supply-chain problems in the build or the GitHub Actions workflow.

Generally **out of scope**: anything requiring the victim to paste an attacker's payload into
their own browser console, and missing HTTP response headers — GitHub Pages does not allow
setting them, which is why the Content-Security-Policy is declared in a `<meta>` tag instead.
