// Recipe Box — entry point: theme, routing, home screen.
import * as store from "./store.js";
import { esc, planningWeekKey, weekKey, DAYS, MEALS, cap, plural } from "./util.js";
import { sprite } from "./sprites.js";
import { render, initModal, closeModal, applyTheme } from "./ui.js";
import { initTimers } from "./timers.js";
import { bookView } from "./views/book.js";
import { recipeView, leaveRecipe } from "./views/recipe.js";
import { addView, editView } from "./views/editor.js";
import { planView } from "./views/plan.js";
import { groceryView } from "./views/grocery.js";
import { pantryView } from "./views/pantry.js";
import { convertView } from "./views/convert.js";
import { settingsView } from "./views/settings.js";
import { pricesView } from "./views/prices.js";
import { sectionize } from "./grocery.js";

// ---- Home ----
function homeView() {
  const s = store.get();
  const n = Object.keys(s.recipes).length;
  const wk = planningWeekKey();
  const meals = store.week(wk).meals || [];
  let toBuy = 0;
  try { const sec = sectionize(wk); toBuy = sec.buy.filter(i => !i.checked).length + sec.extras.filter(e => !e.checked).length; } catch {}

  // Today's plan
  const now = new Date();
  const todayKey = DAYS[(now.getDay() + 6) % 7];
  const thisWeek = store.week(weekKey(now)).meals || [];
  const today = MEALS.map(m => {
    const hit = thisWeek.filter(x => x.slots.includes(`${todayKey}-${m}`)).map(x => store.recipe(x.rid)).filter(Boolean);
    return { m, hit };
  }).filter(x => x.hit.length);

  const tiles = [
    ["book", "Recipe book", "#/book", plural(n, "recipe")],
    ["add", "Add recipe", "#/add", ""],
    ["plan", "Meal plan", "#/plan", meals.length ? plural(meals.length, "meal") : ""],
    ["list", "Grocery list", "#/grocery", toBuy ? `${toBuy} to buy` : ""],
    ["pantry", "Pantry", "#/pantry", ""],
    ["price", "Prices", "#/prices", ""],
    ["convert", "Converter", "#/convert", ""],
    ["settings", "Settings", "#/settings", ""]
  ];

  render(`<main class="page">
    <header class="hero">
      <div>
        <h1><span>Recipe</span><span>Box</span></h1>
      </div>
      <button class="btn small" id="themeBtn" aria-label="Toggle light or dark mode">${themeLabel()}</button>
    </header>
    <section class="win" aria-labelledby="k-title">
      <div class="titlebar"><h2 class="wintitle" id="k-title">Kitchen</h2></div>
      <nav class="icons">
        ${tiles.map(([icon, label, href, badge]) => `
          <a class="icon" href="${href}">
            ${sprite(icon)}
            <span class="label">${esc(label)}</span>
            ${badge ? `<span class="badge">${esc(badge)}</span>` : ""}
          </a>`).join("")}
      </nav>
      <div class="statusbar">
        <span>${plural(n, "recipe")}</span>
        <span>Saved on this device</span>
      </div>
    </section>
    ${today.length ? `
    <section class="win today">
      <div class="titlebar"><h2 class="wintitle">Today</h2></div>
      <div class="wbody"><ul>
        ${today.map(t => `<li><span class="slot">${cap(t.m)}</span><span>${t.hit.map(r => `<a href="#/r/${r.id}">${esc(r.title)}</a>`).join(", ")}</span></li>`).join("")}
      </ul></div>
    </section>` : ""}
    ${backupNag(s)}
  </main>`);

  document.getElementById("themeBtn").onclick = () => {
    const cur = store.settings().theme;
    const dark = cur === "dark" || (cur === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    store.setSetting("theme", dark ? "light" : "dark");
    applyTheme();
    homeView();
  };
}

function themeLabel() {
  const cur = store.settings().theme;
  const dark = cur === "dark" || (cur === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  return dark ? "☀ Light" : "☾ Dark";
}

function backupNag(s) {
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
  [/^#\/prices$/, () => pricesView()]
];

function route() {
  closeModal();
  leaveRecipe();
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

function init() {
  applyTheme();
  initModal();
  initTimers(document.getElementById("timers"));
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (store.settings().theme === "auto" && (location.hash || "#/") === "#/") homeView(); });
  handleIncomingUrl();
  window.addEventListener("hashchange", route);
  route();
  store.requestPersistence();
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
