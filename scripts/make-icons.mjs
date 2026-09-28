/**
 * Renders the app icon to PNG at the sizes the web manifest needs.
 *
 * The generated files are committed, so this only has to run again when the
 * icon design changes:
 *
 *   node scripts/make-icons.mjs
 *
 * Uses the Chromium that Playwright already installs for the browser tests.
 * Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to point at a specific binary.
 */

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const outDir = fileURLToPath(new URL("../public/icons/", import.meta.url));
mkdirSync(outDir, { recursive: true });

// `pad` is the safe-zone padding as a fraction of the canvas: maskable icons
// may be cropped to a circle, so their artwork sits well inside the edges.
function iconSvg(size, { pad = 0, radius = 0.22 } = {}) {
  const inner = size * (1 - pad * 2);
  const offset = size * pad;
  const r = inner * radius;
  const u = inner / 24; // scale for the 24-unit glyph
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  ${pad > 0 ? `<rect width="${size}" height="${size}" fill="#0b0f19"/>` : ""}
  <rect x="${offset}" y="${offset}" width="${inner}" height="${inner}" rx="${r}" fill="url(#bg)"/>
  <g transform="translate(${offset + u * 4}, ${offset + u * 4}) scale(${u * 16 / 24})"
     fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="20" height="18" rx="3"/>
    <line x1="2" y1="9" x2="22" y2="9"/>
    <line x1="8" y1="3" x2="8" y2="21"/>
    <line x1="15" y1="3" x2="15" y2="21"/>
    <rect x="9.5" y="11" width="4" height="4" rx="1" fill="#ffffff" stroke="none"/>
    <rect x="16.5" y="15" width="4" height="4" rx="1" fill="#ffffff" stroke="none"/>
  </g>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, options: {} },
  { file: "icon-512.png", size: 512, options: {} },
  { file: "icon-maskable-512.png", size: 512, options: { pad: 0.1, radius: 0 } }
];

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const browser = await chromium.launch({ executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  for (const target of targets) {
    await page.setViewportSize({ width: target.size, height: target.size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${iconSvg(target.size, target.options)}</body></html>`
    );
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: target.size, height: target.size } });
    writeFileSync(`${outDir}${target.file}`, png);
    console.log(`wrote public/icons/${target.file}`);
  }
} finally {
  await browser.close();
}
