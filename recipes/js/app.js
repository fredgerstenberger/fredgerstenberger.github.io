// Recipe Box — entry point: theme, routing, home screen.
import * as store from "./store.js";
import { setPrepDay } from "./util.js";
import { alignWeeks } from "./weeks.js";
import { sprite } from "./sprites.js";
import { initModal, closeModal, applyTheme } from "./ui.js";
import { watchForUpdates } from "./updates.js";
import { initTimers } from "./timers.js";
import { bookView } from "./views/book.js";
import { recipeView, leaveRecipe } from "./views/recipe.js";
import { addView, editView } from "./views/editor.js";
import { planView } from "./views/plan.js";
import { groceryView, ADD_KEY } from "./views/grocery.js";
import { pantryView } from "./views/pantry.js";
import { convertView } from "./views/convert.js";
import { settingsView } from "./views/settings.js";
import { pricesView } from "./views/prices.js";
import { todayView } from "./views/today.js";
import { moreView } from "./views/more.js";
import * as sync from "./sync.js";
import { refreshPrices } from "./data.js";
import { refreshRecipe } from "./views/recipe.js";

// ---- The week's meal plan (the first screen) ----
function homeView() { planView(undefined, { nag: backupNag(store.get()) }); }

function backupNag(s) {
  if (sync.enabled()) return "";
  const n = Object.keys(s.recipes).length;
  const days = (Date.now() - (s.lastBackup || 0)) / 86400000;
  if (n < 5 || days < 30) return "";
  return `<p class="note">You have ${n} recipes and ${s.lastBackup ? "haven't backed up in a month" : "no backup yet"}. <a href="#/settings">Export a backup</a> in Settings.</p>`;
}

// ---- Router ----
const ROUTES = [
  [/^#?\/?$/, () => homeView()],
  [/^#\/book$/, () => bookView()],
  [/^#\/r\/([\w-]+)$/, m => recipeView(m[1])],
  [/^#\/add(?:\?(.*))?$/, m => addView(new URLSearchParams(m[1] || ""))],
  [/^#\/edit\/([\w-]+)$/, m => editView(m[1])],
  [/^#\/plan(?:\/([\d-]+))?$/, m => planView(m[1])],
  [/^#\/grocery(?:\/([\d-]+))?$/, m => groceryView(m[1])],
  [/^#\/pantry$/, () => pantryView()],
  [/^#\/convert$/, () => convertView()],
  [/^#\/settings$/, () => settingsView()],
  [/^#\/prices$/, () => pricesView()],
  [/^#\/more$/, () => moreView()],
  [/^#\/today$/, () => todayView()]
];

// The tab bar: on the main screens, with the current one marked. Not on a recipe, the editor or Add recipe
// (they have their own way back), and it steps aside in shopping mode (body.shopping-mode).
const TABS = [["plan", "Plan", "#/", "plan"], ["book", "Recipes", "#/book", "book"], ["list", "List", "#/grocery", "list"], ["more", "More", "#/more", null]];
function tabFor(h) {
  if (/^#?\/?$|^#\/(plan|today)/.test(h)) return "plan";
  if (/^#\/book/.test(h)) return "book";
  if (/^#\/grocery/.test(h)) return "list";
  if (/^#\/(more|pantry|prices|convert|settings)/.test(h)) return "more";
  return null;
}
const DOTS = `<svg class="sprite" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="7" width="3" height="3" fill="currentColor"/><rect x="6.5" y="7" width="3" height="3" fill="currentColor"/><rect x="12" y="7" width="3" height="3" fill="currentColor"/></svg>`;
function updateTabs() {
  const bar = document.getElementById("tabbar"), on = tabFor(location.hash || "#/");
  if (!bar) return;
  if (!bar.children.length) bar.innerHTML = TABS.map(([id, label, href, icon]) => `<a href="${href}" data-tab="${id}">${icon ? sprite(icon) : DOTS}<span>${label}</span></a>`).join("");
  bar.hidden = !on;
  document.body.classList.toggle("has-tabs", !!on);
  if (!on) document.body.classList.remove("shopping-mode");
  bar.querySelectorAll("[data-tab]").forEach(t => t.dataset.tab === on ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current"));
}

function route() {
  closeModal();
  leaveRecipe();
  updateTabs();
  const h = location.hash || "#/";
  for (const [re, fn] of ROUTES) {
    const m = h.match(re);
    if (m) return fn(m);
  }
  homeView();
}

// Support share links like /recipes/?url=https://… (from an iOS Shortcut or bookmarklet).
function handleIncomingUrl() {
  const p = new URLSearchParams(location.search);
  // Invite link from another device: ?join=<code>&w=<worker address>
  if (p.get("invite")) {
    try { sessionStorage.setItem("rb.join", JSON.stringify({ invite: p.get("invite"), worker: p.get("w") || "" })); } catch {}
    history.replaceState(null, "", location.pathname + "#/settings");
    return;
  }
  // Quick add: /recipes/?add=milk, eggs (from a link or an iOS Shortcut) adds to the grocery list.
  if (p.get("add")) {
    try { sessionStorage.setItem(ADD_KEY, p.get("add").slice(0, 2000)); } catch {}
    history.replaceState(null, "", location.pathname + "#/grocery");
    return;
  }
  const u = p.get("url") || p.get("text");
  if (u) {
    const found = (u.match(/https?:\/\/\S+/) || [])[0];
    // A link → import it. Shared recipe text (no link, several lines) → the text importer.
    const hash = found && u.trim().length < found.length + 40 ? `#/add?url=${encodeURIComponent(found)}`
      : u.includes("\n") ? `#/add?text=${encodeURIComponent(u)}`
      : found ? `#/add?url=${encodeURIComponent(found)}` : "#/add";
    history.replaceState(null, "", location.pathname + hash);
  }
}

// Weeks start the day after the household's shopping & prep day (a synced setting). If it changed, on
// this phone or the other, what's stored under the old weeks moves to the new ones.
function applyWeekSetting() {
  setPrepDay(store.settings().prepDay ?? 0);
  if (alignWeeks()) store.save();
}

function init() {
  applyWeekSetting();
  applyTheme();
  initModal();
  initTimers(document.getElementById("timers"));
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (store.settings().theme === "auto" && (location.hash || "#/") === "#/") homeView(); });
  handleIncomingUrl();
  window.addEventListener("hashchange", route);
  route();
  // Changes arrived from another device: refresh the screen unless you're in the middle of typing or a dialog.
  const refresh = () => {
    const a = document.activeElement;
    const typing = a && (a.matches("input, textarea, select") || a.isContentEditable);
    if (typing || document.getElementById("modal").open) return;
    const h = location.hash || "#/";
    if (h.startsWith("#/r/")) return refreshRecipe();
    const safe = /^#\/?$|^#\/(plan|grocery|pantry|prices|book)/.test(h) && !(h === "#/book" && window.scrollY > 80);
    if (safe) route();
  };
  window.addEventListener("rb:synced", applyWeekSetting);
  window.addEventListener("rb:synced", refresh);
  window.addEventListener("rb:data", refresh); // new official prices / USDA nutrition arrived
  refreshPrices();
  sync.start();
  store.requestPersistence();
  // Offline and instant launch (see sw.js). On localhost only when asked (localStorage rb.sw = 1), so
  // editing the app locally isn't served from a cache.
  let sw = false;
  try { sw = location.protocol === "https:" || !!localStorage.getItem("rb.sw"); } catch {}
  if ("serviceWorker" in navigator && sw) watchForUpdates();
}

init();
