// Weekly meal plan (Mon–Sun, 3 meals a day). Sunday before the week is shop + prep day.
// A "meal" is one batch of a recipe: cooked once, eaten at one or more slots (leftovers).
// Groceries count each batch once.
import * as store from "../store.js";
import { avgRating } from "../ratings.js";
import { esc, uid, DAYS, MEALS, cap, addDays, parseWeekKey, weekKey, planningWeekKey, fmtDate, startOfDay, weekRelation, prepLabel, isPastDay } from "../util.js";
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
  const home = planningWeekKey(); // this week, or next week from Sunday (shop & prep day) on
  const rel = weekRelation(key);
  const jump = key === home ? "" : `<a href="${base}/${home}">${weekRelation(home) === "Next week" ? "Go to next week" : "Go to this week"}</a>`;
  return `<div class="weeknav">
    <a class="btn small" href="${base}/${weekKey(addDays(parseWeekKey(key), -7))}" aria-label="Previous week">◀</a>
    <div class="wk">${weekLabel(key)}<small>${[rel, jump].filter(Boolean).join(" · ")}</small></div>
    <a class="btn small" href="${base}/${weekKey(addDays(parseWeekKey(key), 7))}" aria-label="Next week">▶</a>
  </div>`;
}

const slotName = s => { const [d, m] = s.split("-"); return `${SHORT[d]} ${m}`; };
const sortSlots = arr => [...new Set(arr)].sort((a, b) => slotIdx(a) - slotIdx(b));

// Move mode: { type: "slot", mealId, slot } moves/swaps one meal; { type: "day", day } swaps whole days.
let moving = null;
window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/plan")) moving = null; });

export function planView(key) {
  key = key || currentWeek();
  setWeek(key);
  if (moving && moving.key !== key) moving = null;
  const wk = store.week(key);
  const meals = (wk.meals || []).filter(m => store.recipe(m.rid));
  const mon = parseWeekKey(key);
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
      const isSource = moving?.type === "slot" && moving.slot === slot;
      const target = moving?.type === "slot" && !isSource;
      const chips = here.map(x => {
        const r = store.recipe(x.rid);
        const first = sortSlots(x.slots)[0] === slot;
        return `<button class="mealchip ${first ? "" : "left"}" data-meal="${x.id}" data-slot="${slot}" ${moving ? 'tabindex="-1"' : ""}>${esc(r.title)}${first ? "" : `<span class="lo">leftovers</span>`}</button>`;
      }).join("");
      return `<div class="slotrow ${isSource ? "source" : ""} ${target ? "target" : ""}" ${target ? `data-target="${slot}" role="button" tabindex="0" aria-label="${here.length ? "Swap with" : "Move to"} ${SHORT[d]} ${m}"` : ""}>
        <div class="slotname">${cap(m)}</div>
        <div class="slotmeals">
          ${chips}
          ${target ? `<span class="droptag">${here.length ? "⇄ Swap" : "↓ Move here"}</span>`
            : !moving && !here.length && !isPastDay(key, di) ? `<button class="addslot" data-add="${slot}" aria-label="Add ${m} on ${d}">+</button>` : ""}
        </div>
      </div>`;
    }).join("");
    const t = est ? "~" : "";
    const daySource = moving?.type === "day" && moving.day === d;
    const dayTarget = moving?.type === "day" && !daySource;
    const hasMeals = meals.some(x => x.slots.some(sl => sl.startsWith(d + "-")));
    return `<section class="day ${date.getTime() === todayStr ? "today-day" : ""} ${daySource ? "source" : ""}">
      <div class="dayhead"><span class="px">${SHORT[d]} ${date.getDate()}</span>
        <span class="dayright">${kcal ? `<small>${t}${Math.round(kcal)} kcal · ${t}${Math.round(protein)} g P</small>` : ""}
        ${dayTarget ? `<button class="btn small primary" data-dayswap="${d}">⇄ Swap with ${SHORT[moving.day]}</button>`
          : !moving && hasMeals ? `<button class="daybtn" data-moveday="${d}" aria-label="Swap ${SHORT[d]} with another day">⇅ Day</button>` : ""}</span>
      </div>
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
      ${moving ? `<div class="movebar win" role="status">
        <span>${moving.type === "slot"
          ? `Moving <b>${esc(store.recipe(meals.find(x => x.id === moving.mealId)?.rid)?.title || "")}</b> from ${slotName(moving.slot)}. Tap an empty slot to move it, or a filled one to swap.`
          : `Swapping <b>${DAY_LONG[moving.day]}</b>. Tap “Swap” on another day.`}</span>
        <button class="btn small" id="cancelMove">Cancel</button>
      </div>` : ""}
      <div class="banner">
        <span class="px">${esc(prepLabel(key))}</span>
        <a class="btn small" href="#/grocery/${key}">Grocery list ▸</a>
        ${weekCost > 0 ? `<span style="flex-basis:100%">Food cost ${money(weekCost)} · ${money(weekCost / servingsTotal)}/serving</span>` : ""}
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
  if (!moving) document.querySelectorAll("[data-meal]").forEach(b => b.onclick = () => {
    const m = meals.find(x => x.id === b.dataset.meal);
    chipActions(key, m, b.dataset.slot);
  });
  document.querySelectorAll("[data-target]").forEach(row => {
    const go = () => moveMealTo(key, row.dataset.target);
    row.onclick = go;
    row.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
  document.querySelectorAll("[data-moveday]").forEach(b => b.onclick = () => { moving = { type: "day", day: b.dataset.moveday, key }; planView(key); });
  document.querySelectorAll("[data-dayswap]").forEach(b => b.onclick = () => swapDays(key, moving.day, b.dataset.dayswap));
  document.getElementById("cancelMove")?.addEventListener("click", () => { moving = null; planView(key); });
  document.getElementById("clearWeek")?.addEventListener("click", () => {
    const { el, close } = modal("Clear week?", `<p style="margin-top:0">Remove all ${meals.length} meals from ${weekLabel(key)}?</p><div class="btnrow"><button class="btn danger" id="yes">Clear week</button><button class="btn" id="no">Cancel</button></div>`);
    el.querySelector("#yes").onclick = () => { wk.meals = []; store.save(); close(); planView(key); };
    el.querySelector("#no").onclick = close;
  });
}

const DAY_LONG = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

// Tap a planned meal: quick actions.
function chipActions(key, meal, slot) {
  const r = store.recipe(meal.rid);
  const wk = store.week(key);
  const sl = sortSlots(meal.slots);
  const many = sl.length > 1;
  const { el, close } = modal(slotName(slot), `
    <p style="margin:0 0 2px;font-weight:700;font-size:18px">${esc(r.title)}</p>
    <p class="muted" style="margin:0 0 14px;font-size:14px">${sl[0] === slot ? "Cooked here" : "Leftovers"}${many ? ` · planned ${sl.length}× (${sl.map(slotName).join(", ")})` : ""} · ${meal.servings} servings</p>
    <div class="actlist">
      <button class="btn primary" id="aMove">⇄ Move or swap</button>
      <a class="btn" href="#/r/${r.id}">Open recipe</a>
      <button class="btn" id="aEdit">Edit days &amp; servings</button>
      <button class="btn danger" id="aRm">${many ? `Remove from ${slotName(slot)}` : "Remove from plan"}</button>
      ${many ? `<button class="btn danger" id="aRmAll">Remove all ${sl.length}</button>` : ""}
    </div>`);
  el.querySelector("#aMove").onclick = () => { moving = { type: "slot", mealId: meal.id, slot, key }; close(); planView(key); };
  el.querySelector("#aEdit").onclick = () => mealOptions(key, meal.rid, meal);
  el.querySelector("#aRm").onclick = () => {
    meal.slots = meal.slots.filter(x => x !== slot);
    if (!meal.slots.length) wk.meals = wk.meals.filter(x => x !== meal);
    store.save(); close(); toast("Removed"); planView(key);
  };
  el.querySelector("#aRmAll")?.addEventListener("click", () => {
    wk.meals = wk.meals.filter(x => x !== meal);
    store.save(); close(); toast("Removed from plan"); planView(key);
  });
}

// Move one planned meal to another slot; if that slot is taken, swap them.
function moveMealTo(key, target) {
  const wk = store.week(key);
  const m1 = wk.meals.find(x => x.id === moving?.mealId);
  const from = moving?.slot;
  moving = null;
  if (!m1 || !from || target === from) return planView(key);
  if (m1.slots.includes(target)) { toast("It's already planned there"); return planView(key); }
  const others = wk.meals.filter(x => x !== m1 && x.slots.includes(target));
  m1.slots = sortSlots(m1.slots.map(x => (x === from ? target : x)));
  for (const m2 of others) m2.slots = sortSlots(m2.slots.map(x => (x === target ? from : x)));
  store.save();
  toast(others.length ? `Swapped ${slotName(from)} ↔ ${slotName(target)}` : `Moved to ${slotName(target)}`);
  planView(key);
}

// Swap every meal between two days (breakfast ↔ breakfast, lunch ↔ lunch, dinner ↔ dinner).
function swapDays(key, a, b) {
  const wk = store.week(key);
  moving = null;
  for (const m of wk.meals) {
    m.slots = sortSlots(m.slots.map(x => {
      const [d, meal] = x.split("-");
      return d === a ? `${b}-${meal}` : d === b ? `${a}-${meal}` : x;
    }));
  }
  store.save();
  toast(`Swapped ${DAY_LONG[a]} ↔ ${DAY_LONG[b]}`);
  planView(key);
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
      .sort((a, b) => avgRating(b) - avgRating(a) || a.title.localeCompare(b.title));
    pl.innerHTML = hits.length ? hits.map(r => `<li><button data-rid="${r.id}"><b>${esc(r.title)}</b><span class="muted">${metaLine(r).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")}</span></button></li>`).join("")
      : `<li class="muted" style="padding:14px 4px">No recipes match${filter ? ` “${filter.replace(":", "")}” — <button class="btn small" id="nof">show all</button>` : "."}</li>`;
    pl.querySelector("#nof")?.addEventListener("click", () => { filter = ""; draw(); });
  }
  el.querySelector("#pq").addEventListener("input", e => { q = e.target.value; draw(); });
  el.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { filter = filter === b.dataset.f ? "" : b.dataset.f; draw(); });
  pl.addEventListener("click", e => { const b = e.target.closest("[data-rid]"); if (b) mealOptions(key, b.dataset.rid, null, slot); });
  draw();
}

function shortTitle(t) {
  const w = t.replace(/^(the|a|an|easy|best|my|one[- ]pot|simple|quick)\s+/i, "").split(/\s+/);
  const s = w.slice(0, 2).join(" ");
  return s.length > 12 ? s.slice(0, 11) + "…" : s;
}

function mealOptions(key, rid, existing, presetSlot) {
  const r = store.recipe(rid);
  if (!r) return;
  const people = store.settings().people || 1;
  const wk = store.week(key);
  // Slots already used by other planned meals, and days that are over, can't be picked.
  const taken = {};
  for (const x of wk.meals || []) {
    if (x === existing) continue;
    const rr = store.recipe(x.rid);
    if (!rr) continue;
    for (const sl of x.slots) taken[sl] = rr.title;
  }
  const chosen = new Set((existing ? existing.slots : presetSlot ? [presetSlot] : []).filter(sl => !taken[sl]));
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
    <p class="muted" style="margin:0 0 10px;font-size:14px">Cook once; extra ticks are leftovers. Groceries count it once. Gray slots already have a meal or are in the past.</p>
    <div class="slotpick">
      <span></span>${MEALS.map(m => `<span class="h">${cap(m)}</span>`).join("")}
      ${DAYS.map(d => `<span class="d">${SHORT[d]} ${addDays(parseWeekKey(key), DAYS.indexOf(d)).getDate()}</span>${MEALS.map(m => {
        const s = `${d}-${m}`;
        if (taken[s]) return `<span class="taken" title="${esc(taken[s])}"><span class="sr">${SHORT[d]} ${m}: taken by </span>${esc(shortTitle(taken[s]))}</span>`;
        if (isPastDay(key, DAYS.indexOf(d)) && !chosen.has(s)) return `<span class="taken past"><span class="sr">${SHORT[d]} ${m}: </span>past</span>`;
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
    else store.editWeek(key).meals.push({ id: uid(), rid, servings, slots });
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
