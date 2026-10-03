// Offline support and instant launch: the app's files come from this release's cache, so the app opens
// at once even with a weak signal (or none). A new release arrives in the background: the browser checks
// this file for changes, a new VERSION downloads all of its files into its own cache, and the app offers
// "Updated · Reload" (or switches on the next launch). A page only ever loads files from one release's
// cache, so old and new modules can never mix.
// Bump VERSION whenever app files change so phones pick up the update.
const VERSION = "rb-v24"; // keep in step with APP_VERSION in js/version.js
const FILES = [
  "./", "index.html", "app.css", "manifest.webmanifest", "icons/icon.svg", "icons/icon-180.png",
  "js/app.js", "js/ui.js", "js/util.js", "js/store.js", "js/fooddb.js", "js/ingredients.js",
  "js/nutrition.js", "js/prices.js", "js/parse.js", "js/recipe-data.js", "js/scan.js", "js/sync.js", "js/fields.js", "js/pixicons.js", "js/quickadd.js", "js/stores.js", "js/household.js", "js/live.js", "js/grocery-add.js", "js/updates.js", "js/label.js", "js/labelsheet.js", "js/variants.js", "js/views/stores.js", "js/ratings.js", "js/data.js", "js/version.js", "js/fillin.js", "js/tags.js", "js/grocery.js", "js/sprites.js", "js/timers.js",
  "js/views/book.js", "js/views/recipe.js", "js/views/editor.js", "js/views/plan.js",
  "js/views/grocery.js", "js/views/pantry.js", "js/views/convert.js", "js/views/settings.js", "js/views/prices.js"
];

self.addEventListener("install", e => {
  // Fetch every file fresh (not from the browser's HTTP cache), all or nothing: a half-downloaded release
  // never becomes the one that's served.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))));
  // The first install takes over right away (nothing to mix with). An update waits for the page to say
  // so (see "skip-waiting" below) or for the next launch.
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener("message", e => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k.startsWith("rb-")).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin === location.origin) {
    // Opening the app (any address under it, like ?add=… or ?invite=…) gets the cached page.
    const req = e.request.mode === "navigate" ? "index.html" : e.request;
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      // Not part of the release (shouldn't happen for app files): the network, then keep a copy.
      try {
        const res = await fetch(e.request);
        if (res.ok && e.request.mode !== "navigate") c.put(e.request, res.clone());
        return res;
      } catch (err) {
        return (await c.match("index.html")) || Response.error();
      }
    }));
    return;
  }
  // Google Fonts: cache after first use.
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res;
    })));
  }
  // Everything else (your Worker: sync, imports, prices) goes straight to the network, never cached.
});
