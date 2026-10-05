// Recipe book: search, quick filters, tag filters, sort.
import * as store from "../store.js";
import { avgRating } from "../ratings.js";
import { esc } from "../util.js";
import { shell, render, metaLine, modal, closeModal, go } from "../ui.js";
import { nutritionFor } from "../nutrition.js";
import { MEAL_TAGS } from "../tags.js";
import { recipeCost } from "../prices.js";
import { allPhotos, okImage, fillPhotos, adoptPhotos } from "../photos.js";
import { sprite, icon } from "../sprites.js";
import { isReady } from "../ready.js";
import { estimatesNoticeHTML, bindEstimatesNotice } from "../tips.js";
import { openReadyForm } from "./ready.js";

// Filter state survives navigating into a recipe and back. on: chips (quick filters, meals, keywords);
// lim: the Filters sheet's limits (kcal, protein, time, cost per serving, rating), each a number or absent.
const F = loadF();
function loadF() {
  try { const s = JSON.parse(sessionStorage.getItem("rb.filters")); if (s) return { q: s.q || "", on: new Set(s.on || []), sort: s.sort || "recent", lim: s.lim || {} }; } catch {}
  return { q: "", on: new Set(), sort: "recent", lim: {} };
}
function saveF() {
  try { sessionStorage.setItem("rb.filters", JSON.stringify({ q: F.q, on: [...F.on], sort: F.sort, lim: F.lim })); } catch {}
}

/** The Filters sheet's limits. A recipe with no number for a limit (no calories known, no time) doesn't pass it. */
export const LIMITS = [
  ["kcal", "Calories per serving", "at most", "kcal"],
  ["protein", "Protein per serving", "at least", "g"],
  ["time", "Total time", "at most", "min"],
  ["cost", "Cost per serving", "at most", "$"]
];
export function withinLimits(r, lim = {}) {
  const has = k => lim[k] != null && lim[k] !== "" && Number.isFinite(Number(lim[k]));
  if (has("kcal") || has("protein")) {
    const n = nutritionFor(r);
    if (has("kcal") && !(n.kcal > 0 && n.kcal <= Number(lim.kcal))) return false;
    if (has("protein") && !(n.protein >= Number(lim.protein))) return false;
  }
  if (has("time") && !(r.totalMin > 0 && r.totalMin <= Number(lim.time))) return false;
  if (has("cost")) { const c = recipeCost(r); if (!(c.total > 0 && c.perServing <= Number(lim.cost))) return false; }
  if (has("rating") && !(avgRating(r) >= Number(lim.rating))) return false;
  return true;
}
const limitCount = () => Object.values(F.lim).filter(v => v != null && v !== "").length;

export const QUICK = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["dinner", "Dinner"],
  [":lowcal", "Lighter"],
  [":protein", "High protein"],
  [":quick", "Quick"],
  [":budget", "Budget"],
  [":fav", "4+"],
  [":ready", "Store-bought"]
];

export function matches(r, chip, s = store.settings()) {
  switch (chip) {
    case ":lowcal": { const n = nutritionFor(r); return n.kcal > 0 && n.kcal <= s.lowCal; }
    case ":protein": { const n = nutritionFor(r); return n.protein >= s.highProtein; }
    case ":quick": return r.totalMin > 0 && r.totalMin <= s.quickMin;
    case ":budget": { const c = recipeCost(r); return c.total > 0 && c.perServing <= s.budget; }
    case ":fav": return avgRating(r) >= 4;
    case ":ready": return isReady(r);
    default: return (r.tags || []).includes(chip);
  }
}

export function searchText(r) {
  return `${r.title} ${(r.tags || []).join(" ")} ${(r.ingredients || []).join(" ")} ${r.notes || ""} ${r.site || ""}`.toLowerCase();
}

function sorted(list) {
  const by = {
    recent: (a, b) => (b.created || 0) - (a.created || 0),
    rating: (a, b) => avgRating(b) - avgRating(a) || a.title.localeCompare(b.title),
    az: (a, b) => a.title.localeCompare(b.title),
    kcal: (a, b) => (nutritionFor(a).kcal || 1e9) - (nutritionFor(b).kcal || 1e9),
    protein: (a, b) => (nutritionFor(b).protein || 0) - (nutritionFor(a).protein || 0),
    time: (a, b) => (a.totalMin || 1e9) - (b.totalMin || 1e9),
    cost: (a, b) => (recipeCost(a).perServing || 1e9) - (recipeCost(b).perServing || 1e9)
  }[F.sort] || (() => 0);
  return list.sort(by);
}

export function bookView() {
  const all = store.recipes();
  const s = store.settings();

  // Tags by frequency (meal tags are already quick chips).
  const freq = {};
  for (const r of all) for (const t of r.tags || []) if (!MEAL_TAGS.slice(0, 3).includes(t)) freq[t] = (freq[t] || 0) + 1;
  const tags = Object.entries(freq).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);

  render(shell({
    title: "Recipes",
    back: null,
    actions: `<a class="tb-btn" href="#/add">+ Add</a>`,
    body: `
      <div class="searchrow">
        <div class="search">
          <label class="sr" for="q">Search recipes</label>
          <input type="search" id="q" placeholder="Search recipes…" value="${esc(F.q)}" autocomplete="off">
        </div>
        <button class="fbtn" id="filtersBtn" aria-haspopup="dialog"></button>
      </div>
      <div class="chipscroll filters" role="group" aria-label="Quick filters">
        ${QUICK.map(([k, l]) => `<button class="chip" data-chip="${k}" aria-pressed="${F.on.has(k)}"${k === ":fav" ? ' aria-label="4 stars and up"' : ""}>${k === ":fav" ? icon("star", "ic16") : ""}${esc(l)}</button>`).join("")}
      </div>
      <div class="sortrow">
        <span id="count"></span>
        <label>Sort
          <select id="sort">
            ${[["recent", "Newest"], ["rating", "Top rated"], ["az", "A to Z"], ["kcal", "Fewest calories"], ["protein", "Most protein"], ["time", "Quickest"], ["cost", "Lowest cost"]].map(([v, l]) => `<option value="${v}" ${F.sort === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </label>
      </div>
      ${all.length ? estimatesNoticeHTML() : ""}
      <div id="readyAdd"></div>
      <ul class="cards" id="list"></ul>`,
    status: `<span>Lighter: up to ${s.lowCal} kcal. High protein: ${s.highProtein} g or more. Budget: up to $${s.budget}</span><a href="#/settings">Change</a>`
  }), { keepScroll: !!sessionStorage.getItem("rb.bookScroll") });

  bindEstimatesNotice(document.getElementById("app"));
  const listEl = document.getElementById("list");
  const countEl = document.getElementById("count");

  const filtersBtn = document.getElementById("filtersBtn");
  const hitsFor = () => {
    const words = F.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    // Store-bought meals stay out of the recipe book unless you ask for them (the Store-bought chip).
    const ready = F.on.has(":ready");
    return all.filter(r => {
      if (!ready && isReady(r)) return false;
      for (const c of F.on) if (!matches(r, c, s)) return false;
      if (!withinLimits(r, F.lim)) return false;
      if (words.length) { const t = searchText(r); return words.every(w => t.includes(w)); }
      return true;
    });
  };

  function update() {
    // Filters button: how many filters are on that the chips above don't show.
    const hidden = [...F.on].filter(k => !QUICK.some(([q]) => q === k)).length + limitCount();
    filtersBtn.innerHTML = `${sprite("filter")}<span>Filters</span>${hidden ? `<span class="fcount">${hidden}</span>` : ""}`;
    filtersBtn.classList.toggle("on", hidden > 0);
    document.querySelectorAll(".filters [data-chip]").forEach(b => b.setAttribute("aria-pressed", F.on.has(b.dataset.chip)));
    const hits = sorted(hitsFor());
    const ready = F.on.has(":ready");
    countEl.textContent = `${hits.length} of ${all.filter(r => isReady(r) === ready).length}`;
    // Showing store-bought meals: a way to add one.
    const addEl = document.getElementById("readyAdd");
    addEl.innerHTML = ready ? `<button class="btn rdadd" id="addReady">+ Store-bought meal</button>` : "";
    const wireAdd = () => document.getElementById("addReady")?.addEventListener("click", () => openReadyForm({ onSaved: r => go(`#/r/${r.id}`) }));
    if (ready && !hits.length) {
      listEl.innerHTML = `<li class="empty"><span class="px">No store-bought meals yet</span>Add the ready-made lunches and dinners you buy, like a Trader Joe's meal, to plan them with your recipes.</li>`;
      wireAdd();
      return;
    }
    if (!all.length) {
      listEl.innerHTML = `<li class="empty"><span class="px">Your recipe book is empty</span>Paste a link from any recipe site to get started.<div class="btnrow" style="justify-content:center"><a class="btn primary" href="#/add">+ Add a recipe</a></div></li>`;
      return;
    }
    if (!hits.length) {
      listEl.innerHTML = `<li class="empty"><span class="px">No matches</span>Try removing a filter.<div class="btnrow" style="justify-content:center"><button class="btn small" id="clear">Clear filters</button></div></li>`;
      document.getElementById("clear").onclick = () => { F.on.clear(); F.lim = {}; F.q = ""; saveF(); bookView(); };
      return;
    }
    const photos = allPhotos();
    listEl.innerHTML = hits.map(r => {
      const ph = okImage(photos[r.id]) ? photos[r.id] : "";
      return `
      <li class="card"><a href="#/r/${r.id}" class="${ph ? "hasphoto" : ""}">
        ${ph ? `<img class="cthumb" data-photo src="${esc(ph)}" alt="" decoding="sync" referrerpolicy="no-referrer">` : ""}
        <span class="cbody"><span class="ctitle">${esc(r.title)}</span>
        <div class="cmeta">${metaLine(r)}</div></span>
      </a></li>`;
    }).join("");
    adoptPhotos(listEl);
    wireAdd();
  }

  document.getElementById("q").addEventListener("input", e => { F.q = e.target.value; saveF(); update(); });
  document.getElementById("sort").addEventListener("change", e => { F.sort = e.target.value; saveF(); update(); });
  document.querySelectorAll(".filters [data-chip]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.chip;
    if (F.on.has(k)) F.on.delete(k); else F.on.add(k);
    saveF(); update();
  }));
  filtersBtn.onclick = () => openFilters(tags, hitsFor, update);
  listEl.addEventListener("click", e => { if (e.target.closest("a")) sessionStorage.setItem("rb.bookScroll", "1"); });
  update();
  // Photos for recipes saved before there were photos: the list redraws as each one arrives.
  setTimeout(() => fillPhotos(all, s, () => { if (location.hash === "#/book" && listEl.isConnected) update(); }), 1200);
  if (sessionStorage.getItem("rb.bookScroll")) {
    sessionStorage.removeItem("rb.bookScroll");
    const y = Number(sessionStorage.getItem("rb.bookY") || 0);
    requestAnimationFrame(() => window.scrollTo(0, y));
  }
  window.onscroll = () => { if (location.hash === "#/book") sessionStorage.setItem("rb.bookY", String(window.scrollY)); };
}

// The Filters sheet: everything you can filter by. Changes apply as you go; the button shows how many match.
function openFilters(tags, hitsFor, update) {
  const chip = ([k, l]) => `<button type="button" class="chip" data-fchip="${esc(k)}" aria-pressed="${F.on.has(k)}">${esc(l)}</button>`;
  const ratings = [["", "Any"], ["3", "3+"], ["4", "4+"], ["5", "5"]];
  const { el } = modal("Filters", `
    <div class="fsheet">
      <h3>Meal</h3>
      <div class="chips">${QUICK.slice(0, 3).map(chip).join("")}</div>
      <h3>Per serving and time</h3>
      <div class="flims">${LIMITS.map(([k, label, how, unit]) => `
        <label class="flim"><span>${label}<small>${how}</small></span>
          <span class="flimin">${unit === "$" ? `<i>$</i>` : ""}<input type="number" inputmode="decimal" min="0" step="any" data-lim="${k}" value="${esc(F.lim[k] ?? "")}" placeholder="Any" aria-label="${label}, ${how}${unit === "$" ? " (dollars)" : ` (${unit})`}">${unit !== "$" ? `<i>${unit}</i>` : ""}</span>
        </label>`).join("")}
      </div>
      <h3>Rating</h3>
      <div class="seg frate" role="group" aria-label="Rating">${ratings.map(([v, l]) => `<button type="button" data-rate="${v}" aria-pressed="${String(F.lim.rating ?? "") === v}"${v ? ` aria-label="${l} stars"` : ""}>${v ? icon("star", "ic16") : ""}${l}</button>`).join("")}</div>
      ${tags.length ? `<h3>Keywords</h3><div class="chips">${tags.map(t => chip([t, t])).join("")}</div>` : ""}
      <div class="fbtns"><button type="button" class="btn" id="fClear">Clear all</button><button type="button" class="btn primary" id="fShow"></button></div>
    </div>`, { onClose: update });
  const show = el.querySelector("#fShow");
  const refresh = () => { const n = hitsFor().length; show.textContent = `Show ${n} recipe${n === 1 ? "" : "s"}`; saveF(); };
  el.querySelectorAll("[data-fchip]").forEach(b => b.onclick = () => {
    const k = b.dataset.fchip;
    if (F.on.has(k)) F.on.delete(k); else F.on.add(k);
    b.setAttribute("aria-pressed", F.on.has(k)); refresh();
  });
  el.querySelectorAll("[data-lim]").forEach(i => i.oninput = () => {
    const v = i.value.trim();
    if (v === "" || !(Number(v) >= 0)) delete F.lim[i.dataset.lim]; else F.lim[i.dataset.lim] = Number(v);
    refresh();
  });
  el.querySelectorAll("[data-rate]").forEach(b => b.onclick = () => {
    if (b.dataset.rate) F.lim.rating = Number(b.dataset.rate); else delete F.lim.rating;
    el.querySelectorAll("[data-rate]").forEach(x => x.setAttribute("aria-pressed", x === b)); refresh();
  });
  el.querySelector("#fClear").onclick = () => {
    F.on.clear(); F.lim = {};
    el.querySelectorAll("[data-fchip]").forEach(b => b.setAttribute("aria-pressed", "false"));
    el.querySelectorAll("[data-lim]").forEach(i => { i.value = ""; });
    el.querySelectorAll("[data-rate]").forEach(x => x.setAttribute("aria-pressed", x.dataset.rate === ""));
    refresh();
  };
  show.onclick = () => closeModal();
  refresh();
}
