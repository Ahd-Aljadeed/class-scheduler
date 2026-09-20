/**
 * Shared escaping helpers.
 *
 * Course data reaches the DOM through template-literal `innerHTML` in several
 * render paths, and that data originates from user input and from localStorage
 * (which survives reloads). Everything interpolated into markup must go through
 * `escapeHtml`; anything landing in a `style` attribute must go through
 * `safeColor`.
 */

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;"
};

/**
 * Escapes a value for safe interpolation into HTML text or a quoted attribute.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`]/g, (char) => HTML_ENTITIES[char]);
}

/**
 * Validates a CSS color before it is placed in a `style` attribute.
 * Only hex colors are accepted; anything else falls back to the theme default,
 * which prevents arbitrary CSS (and `url(...)`) injection through course data.
 * @param {unknown} value
 * @param {string} [fallback="#6366f1"]
 * @returns {string}
 */
export function safeColor(value, fallback = "#6366f1") {
  return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())
    ? value.trim()
    : fallback;
}

/**
 * Escapes a value for an iCalendar (RFC 5545) property value.
 * Backslashes, semicolons, commas and newlines are structural in .ics files.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeICS(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
