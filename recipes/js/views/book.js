// Recipe book: search, quick filters, tag filters, sort.
import * as store from "../store.js";
import { esc } from "../util.js";
import { shell, render, metaLine } from "../ui.js";
import { nutritionFor } from "../nutrition.js";
import { MEAL_TAGS } from "../tags.js";

// Filter state survives navigating into a recipe and back.
const F = loadF();
function loadF() {
  try { const s = JSON.parse(sessionStorage.getItem("rb.filters")); if (s) return { q: s.q || "", on: new Set(s.on || []), sort: s.sort || "recent" }; } catch {}
  return { q: "", on: new Set(), sort: "recent" };
}
function saveF() {
  try { sessionStorage.setItem("rb.filters", JSON.stringify({ q: F.q, on: [...F.on], sort: F.sort })); } catch {}
}

export const QUICK = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["dinner", "Dinner"],
  [":lowcal", "Low cal"],
  [":protein", "High protein"],
  [":quick", "Quick"],
  [":fav", "★ 4+"]
];

export function matches(r, chip, s = store.settings()) {
  switch (chip) {
    case ":lowcal": { const n = nutritionFor(r); return n.kcal > 0 && n.kcal <= s.lowCal; }
    case ":protein": { const n = nutritionFor(r); return n.protein >= s.highProtein; }
    case ":quick": return r.totalMin > 0 && r.totalMin <= s.quickMin;
    case ":fav": return (r.rating || 0) >= 4;
    default: return (r.tags || []).includes(chip);
  }
}

export function searchText(r) {
  return `${r.title} ${(r.tags || []).join(" ")} ${(r.ingredients || []).join(" ")} ${r.notes || ""} ${r.site || ""}`.toLowerCase();
}

function sorted(list) {
  const by = {
    recent: (a, b) => (b.created || 0) - (a.created || 0),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title),
    az: (a, b) => a.title.localeCompare(b.title),
    kcal: (a, b) => (nutritionFor(a).kcal || 1e9) - (nutritionFor(b).kcal || 1e9),
    protein: (a, b) => (nutritionFor(b).protein || 0) - (nutritionFor(a).protein || 0),
    time: (a, b) => (a.totalMin || 1e9) - (b.totalMin || 1e9)
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
    title: "Recipe book",
    actions: `<a class="tb-btn" href="#/add">+ Add</a>`,
    body: `
      <div class="search">
        <label class="sr" for="q">Search recipes</label>
        <input type="search" id="q" placeholder="Search recipes, ingredients, notes…" value="${esc(F.q)}" autocomplete="off">
      </div>
      <div class="chipscroll filters" role="group" aria-label="Quick filters">
        ${QUICK.map(([k, l]) => `<button class="chip" data-chip="${k}" aria-pressed="${F.on.has(k)}">${esc(l)}</button>`).join("")}
      </div>
      ${tags.length ? `<details class="more-tags" ${[...F.on].some(t => tags.includes(t)) ? "open" : ""}>
        <summary>Keywords (${tags.length})</summary>
        <div class="chips">${tags.map(t => `<button class="chip" data-chip="${esc(t)}" aria-pressed="${F.on.has(t)}">${esc(t)}</button>`).join("")}</div>
      </details>` : ""}
      <div class="sortrow">
        <span id="count"></span>
        <label>Sort
          <select id="sort">
            ${[["recent", "Newest"], ["rating", "Rating"], ["az", "A–Z"], ["kcal", "Calories ↑"], ["protein", "Protein ↓"], ["time", "Time ↑"]].map(([v, l]) => `<option value="${v}" ${F.sort === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </label>
      </div>
      <ul class="cards" id="list"></ul>`,
    status: `<span>Low cal ≤ ${s.lowCal} kcal · High protein ≥ ${s.highProtein} g</span><a href="#/settings">Change</a>`
  }), { keepScroll: !!sessionStorage.getItem("rb.bookScroll") });

  const listEl = document.getElementById("list");
  const countEl = document.getElementById("count");

  function update() {
    const q = F.q.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const hits = sorted(all.filter(r => {
      for (const c of F.on) if (!matches(r, c, s)) return false;
      if (words.length) { const t = searchText(r); return words.every(w => t.includes(w)); }
      return true;
    }));
    countEl.textContent = `${hits.length} of ${all.length}`;
    if (!all.length) {
      listEl.innerHTML = `<li class="empty"><span class="px">Your recipe book is empty</span>Paste a link from any recipe site to get started.<div class="btnrow" style="justify-content:center"><a class="btn primary" href="#/add">+ Add a recipe</a></div></li>`;
      return;
    }
    if (!hits.length) {
      listEl.innerHTML = `<li class="empty"><span class="px">No matches</span>Try removing a filter.<div class="btnrow" style="justify-content:center"><button class="btn small" id="clear">Clear filters</button></div></li>`;
      document.getElementById("clear").onclick = () => { F.on.clear(); F.q = ""; saveF(); bookView(); };
      return;
    }
    listEl.innerHTML = hits.map(r => `
      <li class="card"><a href="#/r/${r.id}">
        <span class="ctitle">${esc(r.title)}</span>
        <div class="cmeta">${metaLine(r)}</div>
        ${(r.tags || []).length ? `<div class="ctags">${r.tags.slice(0, 6).map(t => `<span class="tag">${esc(t)}</span>`).join(" ")}</div>` : ""}
      </a></li>`).join("");
  }

  document.getElementById("q").addEventListener("input", e => { F.q = e.target.value; saveF(); update(); });
  document.getElementById("sort").addEventListener("change", e => { F.sort = e.target.value; saveF(); update(); });
  document.querySelectorAll("[data-chip]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.chip;
    if (F.on.has(k)) F.on.delete(k); else F.on.add(k);
    b.setAttribute("aria-pressed", F.on.has(k));
    saveF(); update();
  }));
  listEl.addEventListener("click", e => { if (e.target.closest("a")) sessionStorage.setItem("rb.bookScroll", "1"); });
  update();
  if (sessionStorage.getItem("rb.bookScroll")) {
    sessionStorage.removeItem("rb.bookScroll");
    const y = Number(sessionStorage.getItem("rb.bookY") || 0);
    requestAnimationFrame(() => window.scrollTo(0, y));
  }
  window.onscroll = () => { if (location.hash === "#/book") sessionStorage.setItem("rb.bookY", String(window.scrollY)); };
}
