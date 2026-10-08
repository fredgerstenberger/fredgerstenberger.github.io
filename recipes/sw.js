// The old address's service worker. This release replaces whatever was cached here with the redirect to
// app.bakfan.com (index.html + redirect.js). There's no app here any more, so it takes over at once.
const VERSION = "rb-v43-redirect";
const FILES = ["./", "index.html", "redirect.js", "js/version.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))));
  self.skipWaiting();
});

// An older page here may still ask the new worker to take over: it already does.
self.addEventListener("message", e => { if (e.data === "skip-waiting") self.skipWaiting(); });

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && (k.startsWith("rb-") || k === "photos")).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      // Open windows of the old app reload into the redirect.
      .then(() => self.clients.matchAll({ type: "window" }))
      .then(ws => Promise.all(ws.map(w => w.navigate?.(w.url).catch(() => {}))))
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  const req = e.request.mode === "navigate" ? "index.html" : e.request;
  e.respondWith(caches.open(VERSION).then(async c => (await c.match(req, { ignoreSearch: true })) || fetch(e.request).catch(async () => (await c.match("index.html")) || Response.error())));
});
