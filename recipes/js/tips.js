// Things the app says once: a small tip the first time a screen is used, and the note that nutrition and costs
// are estimates. Remembered per device; the estimates note can be reopened from its info buttons and Settings.
import { modal } from "./ui.js";
import { icon } from "./sprites.js";

const KEY = "rb.seen";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };

export const seen = id => !!read()[id];
export function markSeen(id) {
  const s = read();
  if (s[id]) return;
  s[id] = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}
/** True the first time it's asked for this id on this device, then never again. */
export function once(id) {
  if (seen(id)) return false;
  markSeen(id);
  return true;
}

// Shown on this visit to a screen: a tip or note stays through redraws until you leave or dismiss it.
const visit = new Set();
if (typeof addEventListener === "function") addEventListener("hashchange", () => visit.clear());
const firstTime = id => visit.has(id) || (once(id) && (visit.add(id), true));

/** A one-time tip line for a screen, or "" once it has been shown. */
export const tipHTML = (id, text) => firstTime(`tip:${id}`) ? `<p class="tip" role="note">${icon("info", "ic16")}<span>${text}</span></p>` : "";

export const ESTIMATES_TITLE = "About estimates";
export const ESTIMATES_TEXT = "Nutrition and costs are estimates based on typical ingredients and US average prices. Add a product's label or your store's prices to make them exact.";

/** The estimates note the first time nutrition or cost shows on this device, with a way to dismiss it. */
export function estimatesNoticeHTML() {
  if (!firstTime("estimates")) return "";
  return `<div class="estnote" id="estNote" role="note">${icon("info", "ic20")}<p>${ESTIMATES_TEXT}</p>
    <button class="iconbtn" id="estOk" aria-label="Dismiss">${icon("close", "ic16")}</button></div>`;
}
export function bindEstimatesNotice(root = document) {
  root.querySelector("#estOk")?.addEventListener("click", () => { visit.delete("estimates"); root.querySelector("#estNote")?.remove(); });
  root.querySelectorAll("[data-estimates]").forEach(b => b.addEventListener("click", showEstimates));
}

/** The small info button next to the Nutrition and Cost headings. */
export const estimatesButton = () => `<button class="estbtn" data-estimates aria-label="${ESTIMATES_TITLE}">${icon("info", "ic16")}<span>Estimates</span></button>`;

export function showEstimates() {
  modal(ESTIMATES_TITLE, `<p style="margin-top:0">${ESTIMATES_TEXT}</p>
    <p class="muted" style="margin-bottom:0">Nutrition comes from a built-in food table and USDA data. Prices come from US government averages for your region.</p>`);
}
