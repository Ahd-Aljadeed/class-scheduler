/*
  UniSchedule service worker: caches the app shell so the planner keeps
  working offline once it has been opened once.

  - The version below is stamped at build time (vite.config.js), so every
    deploy gets a fresh cache and old ones are deleted on activate.
  - Navigations are network-first (a new deploy shows up immediately) with the
    cached page as the offline fallback.
  - Everything else the app needs (hashed assets, icons, fonts) is
    cache-first: those files never change under the same URL.
  - Analytics and any other third-party request pass straight through.
*/

const VERSION = "__BUILD_ID__";
const CACHE_NAME = `unischedule-${VERSION}`;
const SCOPE_PATH = new URL("./", self.location).pathname;
const PRECACHE = ["./", "./index.html", "./manifest.webmanifest"].map(
  (path) => new URL(path, self.location).href
);
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("unischedule-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_HOSTS.has(url.hostname)) return;
  if (sameOrigin && !url.pathname.startsWith(SCOPE_PATH)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached =
      (await cache.match(request)) ||
      (await cache.match(new URL("./index.html", self.location).href)) ||
      (await cache.match(new URL("./", self.location).href));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    cache.put(request, response.clone());
  }
  return response;
}
