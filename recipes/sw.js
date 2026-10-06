// The old address's service worker. This release replaces the app here with the "Recipe Box has moved" page
// (index.html + moved.js), and arrives on installed phones through the app's usual "Recipe Box updated · Reload"
// prompt: it waits until the page says "skip-waiting", like every earlier release.
const VERSION = "rb-v42-moved";
const FILES = ["./", "index.html", "moved.js", "move-crypto.js", "js/version.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))));
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener("message", e => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && (k.startsWith("rb-") || k === "photos")).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  const req = e.request.mode === "navigate" ? "index.html" : e.request;
  e.respondWith(caches.open(VERSION).then(async c => (await c.match(req, { ignoreSearch: true })) || fetch(e.request).catch(async () => (await c.match("index.html")) || Response.error())));
});
