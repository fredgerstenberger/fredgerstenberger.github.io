// The old address of Recipe Box: send everyone to app.bakfan.com, keeping a link's ?query (shortcuts like ?add=)
// and #fragment. The service worker (sw.js) makes Home Screen copies installed here update to this page too.
// Install the service worker first (on a phone that had the old app, this is what replaces its cached copy).
var NEW_APP = "https://app.bakfan.com/";
if ("serviceWorker" in navigator && location.protocol === "https:") {
  try { navigator.serviceWorker.register("sw.js"); } catch (e) {}
}
location.replace(NEW_APP + location.search + location.hash);
