// Weekly meal plan (Mon–Sun, 3 meals a day). Sunday before the week is shop + prep day.
// A "meal" is one batch of a recipe: cooked once, eaten at one or more slots (leftovers).
// Groceries count each batch once.
import * as store from "../store.js";
import { esc, uid, DAYS, MEALS, cap, addDays, parseWeekKey, weekKey, planningWeekKey, fmtDate, startOfDay } from "../util.js";
import { shell, render, modal, closeModal, toast, go, metaLine } from "../ui.js";
import { nutritionFor, servingsOf } from "../nutrition.js";
import { matches, searchText } from "./book.js";
import { recipeCost, money } from "../prices.js";

const SLOT_ORDER = DAYS.flatMap(d => MEALS.map(m => `${d}-${m}`));
const slotIdx = s => SLOT_ORDER.indexOf(s);
const SHORT = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export function currentWeek() {
  return sessionStorage.getItem("rb.week") || planningWeekKey();
}
export function setWeek(k) { sessionStorage.setItem("rb.week", k); }

export function weekLabel(key) {
  const mon = parseWeekKey(key);
  const sun = addDays(mon, 6);
  return `${fmtDate(mon)} – ${fmtDate(sun)}`;
}

export function weekNav(key, base) {
  const isPlanning = key === planningWeekKey();
  return `<div class="weeknav">
    <a class="btn small" href="${base}/${weekKey(addDays(parseWeekKey(key), -7))}" aria-label="Previous week">◀</a>
    <div class="wk">${weekLabel(key)}<small>${isPlanning ? "Upcoming week" : `<a href="${base}/${planningWeekKey()}">Jump to upcoming week</a>`}</small></div>
    <a class="btn small" href="${base}/${weekKey(addDays(parseWeekKey(key), 7))}" aria-label="Next week">▶</a>
  </div>`;
}

const slotName = s => { const [d, m] = s.split("-"); return `${SHORT[d]} ${m}`; };

export function planView(key) {
  key = key || currentWeek();
  setWeek(key);
  const wk = store.week(key);
  const meals = (wk.meals || []).filter(m => store.recipe(m.rid));
  const mon = parseWeekKey(key);
  const prepDay = addDays(mon, -1);
  const todayStr = startOfDay(new Date()).getTime();
  const people = store.settings().people || 1;

  const days = DAYS.map((d, di) => {
    const date = addDays(mon, di);
    let kcal = 0, protein = 0, est = false;
    const rows = MEALS.map(m => {
      const slot = `${d}-${m}`;
      const here = meals.filter(x => x.slots.includes(slot));
      for (const x of here) {
        const n = nutritionFor(store.recipe(x.rid));
        kcal += n.kcal || 0; protein += n.protein || 0; if (n.source === "estimate") est = true;
      }
      return `<div class="slotrow">
        <div class="slotname">${cap(m)}</div>
        <div class="slotmeals">
          ${here.map(x => {
            const r = store.recipe(x.rid);
            const first = [...x.slots].sort((a, b) => slotIdx(a) - slotIdx(b))[0] === slot;
            return `<button class="mealchip ${first ? "" : "left"}" data-meal="${x.id}">${esc(r.title)}${first ? "" : `<span class="lo">leftovers</span>`}</button>`;
          }).join("")}
          <button class="addslot" data-add="${slot}" aria-label="Add ${m} on ${d}">+</button>
        </div>
      </div>`;
    }).join("");
    const t = est ? "~" : "";
    return `<section class="day ${date.getTime() === todayStr ? "today-day" : ""}">
      <div class="dayhead"><span class="px">${SHORT[d]} ${date.getDate()}</span>${kcal ? `<small>${t}${Math.round(kcal)} kcal · ${t}${Math.round(protein)} g protein</small>` : ""}</div>
      ${rows}
    </section>`;
  }).join("");

  // Food cost for the week: what the planned amounts use (not whole packages).
  let weekCost = 0, servingsTotal = 0;
  for (const x of meals) {
    const r = store.recipe(x.rid), c = recipeCost(r);
    weekCost += c.total * (x.servings / servingsOf(r));
    servingsTotal += x.servings;
  }
  const prep = [...meals].sort((a, b) => Math.min(...a.slots.map(slotIdx)) - Math.min(...b.slots.map(slotIdx)));

  render(shell({
    title: "Meal plan",
    body: `
      ${weekNav(key, "#/plan")}
      <div class="banner">
        <span><span class="px">Shop &amp; prep:</span> ${fmtDate(prepDay, { weekday: "short", month: "short", day: "numeric" })}</span>
        <a class="btn small" href="#/grocery/${key}">Grocery list ▸</a>
        ${weekCost > 0 ? `<span style="flex-basis:100%">Food cost ~${money(weekCost)} · ~${money(weekCost / servingsTotal)}/serving</span>` : ""}
      </div>
      ${days}
      <h2 class="sect">Sunday prep list <small>${prep.length ? `${prep.length} to cook` : ""}</small></h2>
      ${prep.length ? `<ul class="preplist">${prep.map(x => {
        const r = store.recipe(x.rid);
        const sl = [...x.slots].sort((a, b) => slotIdx(a) - slotIdx(b));
        return `<li><a href="#/r/${r.id}"><b>${esc(r.title)}</b></a><br>
          <span class="muted" style="font-size:15px">${x.servings} servings · eaten ${sl.length}× (${sl.map(slotName).join(", ")})</span></li>`;
      }).join("")}</ul>` : `<p class="muted">Tap + on any meal to add a recipe. Cook once and tick extra slots for leftovers; groceries only count it once.</p>`}
      ${meals.length ? `<div class="btnrow"><button class="btn small danger" id="clearWeek">Clear this week</button></div>` : ""}`,
    status: `<span>${meals.length} meals planned</span><span>${people} ${people === 1 ? "person" : "people"} · <a href="#/settings">change</a></span>`
  }), { keepScroll: true });

  document.querySelectorAll("[data-add]").forEach(b => b.onclick = () => pickRecipe(key, b.dataset.add));
  document.querySelectorAll("[data-meal]").forEach(b => b.onclick = () => {
    const m = meals.find(x => x.id === b.dataset.meal);
    mealOptions(key, m.rid, m);
  });
  document.getElementById("clearWeek")?.addEventListener("click", () => {
    const { el, close } = modal("Clear week?", `<p style="margin-top:0">Remove all ${meals.length} meals from ${weekLabel(key)}?</p><div class="btnrow"><button class="btn danger" id="yes">Clear week</button><button class="btn" id="no">Cancel</button></div>`);
    el.querySelector("#yes").onclick = () => { wk.meals = []; store.save(); close(); planView(key); };
    el.querySelector("#no").onclick = close;
  });
}

// From the recipe page: choose slots in the current planning week.
export function openAddToPlan(rid) {
  mealOptions(currentWeek(), rid, null, null);
}

function pickRecipe(key, slot) {
  const meal = slot.split("-")[1];
  const all = store.recipes();
  let filter = all.some(r => (r.tags || []).includes(meal)) ? meal : "";
  let q = "";
  const { el } = modal(`${cap(meal)} · ${slotName(slot).split(" ")[0]}`, `
    ${all.length ? `
    <input type="search" id="pq" placeholder="Search your recipes…" autocomplete="off">
    <div class="chipscroll" style="margin-top:10px">
      ${["breakfast", "lunch", "dinner", ":lowcal", ":protein", ":quick", ":budget"].map(c => `<button class="chip" data-f="${c}">${{ ":lowcal": "Low cal", ":protein": "High protein", ":quick": "Quick", ":budget": "Budget" }[c] || cap(c)}</button>`).join("")}
    </div>
    <ul class="picklist" id="pl"></ul>` : `<p>Your recipe book is empty.</p><a class="btn primary" href="#/add">+ Add a recipe</a>`}`);
  if (!all.length) return;
  const pl = el.querySelector("#pl");
  function draw() {
    el.querySelectorAll("[data-f]").forEach(b => b.setAttribute("aria-pressed", b.dataset.f === filter));
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = all.filter(r => (!filter || matches(r, filter)) && words.every(w => searchText(r).includes(w)))
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title));
    pl.innerHTML = hits.length ? hits.map(r => `<li><button data-rid="${r.id}"><b>${esc(r.title)}</b><span class="muted">${metaLine(r).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")}</span></button></li>`).join("")
      : `<li class="muted" style="padding:14px 4px">No recipes match${filter ? ` “${filter.replace(":", "")}” — <button class="btn small" id="nof">show all</button>` : "."}</li>`;
    pl.querySelector("#nof")?.addEventListener("click", () => { filter = ""; draw(); });
  }
  el.querySelector("#pq").addEventListener("input", e => { q = e.target.value; draw(); });
  el.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { filter = filter === b.dataset.f ? "" : b.dataset.f; draw(); });
  pl.addEventListener("click", e => { const b = e.target.closest("[data-rid]"); if (b) mealOptions(key, b.dataset.rid, null, slot); });
  draw();
}

function mealOptions(key, rid, existing, presetSlot) {
  const r = store.recipe(rid);
  if (!r) return;
  const people = store.settings().people || 1;
  const wk = store.week(key);
  const chosen = new Set(existing ? existing.slots : presetSlot ? [presetSlot] : []);
  const base = servingsOf(r);
  const suggest = () => Math.max(base, chosen.size * people);
  let servings = existing ? existing.servings : suggest();
  let touched = !!existing;

  const { el, close } = modal(existing ? "Planned meal" : "Add to plan", `
    <p style="margin:0 0 4px;font-weight:700;font-size:18px">${esc(r.title)}</p>
    <p class="muted" style="margin:0 0 14px;font-size:14px">${weekLabel(key)} · recipe makes ${base}${r.yield ? "" : " (assumed)"}</p>
    <div class="setrow" style="border-top:1px solid var(--sunk)">
      <span>Servings to cook<small id="hint"></small></span>
      <span class="stepper"><button id="m" aria-label="Fewer">−</button><output id="sv">${servings}</output><button id="p" aria-label="More">+</button></span>
    </div>
    <p style="margin:14px 0 6px;font-family:var(--pixel)">When will you eat it?</p>
    <p class="muted" style="margin:0 0 10px;font-size:14px">Cook once; extra ticks are leftovers. Groceries count it once.</p>
    <div class="slotpick">
      <span></span>${MEALS.map(m => `<span class="h">${cap(m)}</span>`).join("")}
      ${DAYS.map(d => `<span class="d">${SHORT[d]} ${addDays(parseWeekKey(key), DAYS.indexOf(d)).getDate()}</span>${MEALS.map(m => {
        const s = `${d}-${m}`;
        return `<label><input type="checkbox" data-slot="${s}" ${chosen.has(s) ? "checked" : ""} aria-label="${SHORT[d]} ${m}"></label>`;
      }).join("")}`).join("")}
    </div>
    <div class="btnrow">
      <button class="btn primary" id="save">${existing ? "Save" : "Add to plan"}</button>
      ${existing ? `<a class="btn" href="#/r/${r.id}">Open recipe</a><button class="btn danger" id="rm">Remove</button>` : `<button class="btn" id="cancel">Cancel</button>`}
    </div>`);

  const sv = el.querySelector("#sv"), hint = el.querySelector("#hint");
  function upd() {
    sv.textContent = servings;
    const need = chosen.size * people;
    hint.textContent = chosen.size ? `${chosen.size} meal${chosen.size > 1 ? "s" : ""} × ${people} = ${need} needed${servings < need ? " — not enough!" : ""}` : "Pick at least one meal";
  }
  el.querySelector("#m").onclick = () => { servings = Math.max(1, servings - 1); touched = true; upd(); };
  el.querySelector("#p").onclick = () => { servings = Math.min(99, servings + 1); touched = true; upd(); };
  el.querySelectorAll("[data-slot]").forEach(c => c.onchange = () => {
    c.checked ? chosen.add(c.dataset.slot) : chosen.delete(c.dataset.slot);
    if (!touched) servings = suggest();
    upd();
  });
  el.querySelector("#save").onclick = () => {
    if (!chosen.size) { toast("Pick at least one meal"); return; }
    const slots = [...chosen].sort((a, b) => slotIdx(a) - slotIdx(b));
    if (existing) Object.assign(existing, { servings, slots });
    else wk.meals.push({ id: uid(), rid, servings, slots });
    store.save();
    close();
    toast(existing ? "Plan updated" : `Added to ${weekLabel(key)}`);
    if (location.hash.startsWith("#/plan")) planView(key);
  };
  el.querySelector("#rm")?.addEventListener("click", () => {
    wk.meals = wk.meals.filter(x => x !== existing);
    store.save(); close(); planView(key);
  });
  el.querySelector("#cancel")?.addEventListener("click", close);
  upd();
}
