// New releases (see sw.js): offer "Recipe Box updated · Reload", and switch every open tab without losing
// anything typed. The tab where you tap Reload asks first if it has unsaved text; other tabs reload only
// when they have none, otherwise they wait until you leave that page (or switch away from the app).

import { report } from "./monitor.js";

const TEXT_TYPES = new Set(["", "text", "url", "number", "email", "tel"]);

/** True when any text field holds something typed and not saved (its value differs from what the page drew). */
export function hasUnsaved(fields) {
  for (const f of fields) {
    const tag = (f.tagName || "").toLowerCase(), type = (f.type || "").toLowerCase();
    if (tag === "textarea" || (tag === "input" && TEXT_TYPES.has(type))) {
      if (f.disabled || f.readOnly) continue;
      if ((f.value || "") !== (f.defaultValue || "")) return true;
    }
  }
  return false;
}

/** What a tab does when a new release takes over: "reload", "confirm" (ask first) or "defer". */
export function updateAction({ askedHere, unsaved }) {
  if (!unsaved) return "reload";
  return askedHere ? "confirm" : "defer";
}

const unsavedHere = () => hasUnsaved(document.querySelectorAll("input, textarea"));

export async function watchForUpdates() {
  const { toast, confirmBox } = await import("./ui.js"); // already loaded by the app; kept out of the pure rules above
  const hadController = !!navigator.serviceWorker.controller;
  let askedHere = false, pending = false, reloading = false, lastCheck = Date.now();
  const reload = () => { if (!reloading) { reloading = true; location.reload(); } };
  // Waiting tabs switch when you leave the page you're on, or the app goes to the background.
  const whenFree = () => { if (pending && !unsavedHere()) reload(); };
  addEventListener("hashchange", whenFree);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") whenFree(); });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // A new release took over (from this tab or another): every module must come from it, so reload,
    // unless there's unsaved text here, in which case wait (this tab keeps running its own release's code).
    if (!hadController) return;
    if (updateAction({ askedHere, unsaved: unsavedHere() }) === "defer") {
      pending = true;
      toast("Recipe Box updated. It reloads when you're done here.", { label: "Reload now", ms: 8000, run: reload });
    } else reload();
  });
  const offer = w => toast("Recipe Box updated", { label: "Reload", ms: 12000, run: async () => {
    if (updateAction({ askedHere: true, unsaved: unsavedHere() }) === "confirm" &&
      !(await confirmBox("Reload now? What you've typed on this page and not saved will be lost.", "Reload", false))) return;
    askedHere = true;
    w.postMessage("skip-waiting");
  } });
  navigator.serviceWorker.register("sw.js").then(reg => {
    if (reg.waiting && hadController) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
    });
    // Home-screen apps rarely reload, so coming back to the app checks for a release (at most every 30 min).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck > 30 * 60 * 1000) { lastCheck = Date.now(); reg.update().catch(() => {}); }
    });
  }).catch(e => report(e, { area: "update", level: "warning" }));
}
