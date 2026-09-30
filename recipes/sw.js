// Offline support: app files are cached so recipes open in the kitchen with no signal.
// Bump VERSION whenever app files change so phones pick up the update.
const VERSION = "rb-v1";
const FILES = [
  "./", "index.html", "app.css", "manifest.webmanifest", "icons/icon.svg", "icons/icon-180.png",
  "js/app.js", "js/ui.js", "js/util.js", "js/store.js", "js/fooddb.js", "js/ingredients.js",
  "js/nutrition.js", "js/parse.js", "js/tags.js", "js/grocery.js", "js/sprites.js", "js/timers.js",
  "js/views/book.js", "js/views/recipe.js", "js/views/editor.js", "js/views/plan.js",
  "js/views/grocery.js", "js/views/pantry.js", "js/views/convert.js", "js/views/settings.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
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
  // Our own files: network first (fresh when online), cache when offline.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
    );
    return;
  }
  // Google Fonts: cache after first use.
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res;
    })));
  }
  // Everything else (recipe proxies) goes straight to the network.
});
