// Grocery list for a week: merged, rounded to packages, with pantry questions. Calm Pixel style:
// tap anywhere on a row to check it; press and hold (or swipe left) for details, edit and remove.
import * as store from "../store.js";
import { esc, uid, addDays, parseWeekKey, weekKey, weekRelation } from "../util.js";
import { shell, render, toast, modal } from "../ui.js";
import { AISLES } from "../fooddb.js";
import { sectionize, listAsText } from "../grocery.js";
import { weekLabel, currentWeek, setWeek } from "./plan.js";
import { money } from "../prices.js";
import { pix } from "../pixicons.js";

const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const HINT_KEY = "rb.groceryHint";

function progressHTML(done, total, left) {
  const bar = total <= 24
    ? `<span class="gbar" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i class="${i < done ? "on" : ""}"></i>`).join("")}</span>`
    : `<span class="gbar solid" aria-hidden="true"><i style="width:${Math.round(done / total * 100)}%"></i></span>`;
  return `<div class="gprog" role="status">${bar}<b>${done} of ${total}</b>${left ? `<span>· ~${left} left</span>` : ""}</div>`;
}

function rowHTML({ id, kind, name, amount, sub, checked }) {
  return `<li class="grow ${checked ? "got" : ""}" data-id="${esc(id)}" data-kind="${kind}">
    <button class="grow-main" aria-pressed="${checked}">
      <span class="gbox">${checked ? pix("check", 16) : ""}</span>
      <span class="gname">${esc(cap1(name))}${sub ? `<small>${esc(sub)}</small>` : ""}</span>
      ${amount ? `<span class="gamt">${esc(amount)}</span>` : ""}
    </button>
    <div class="grow-actions" aria-hidden="true"><button class="more" tabindex="-1">Details</button><button class="rm" tabindex="-1">Remove</button></div>
  </li>`;
}

export function groceryView(key) {
  key = key || currentWeek();
  setWeek(key);
  const meals = store.week(key).meals || [];
  const g = store.groceryState(key);
  const pantry = store.get().pantry;
  const sec = sectionize(key);

  const total = sec.buy.length + sec.extras.length;
  const done = sec.buy.filter(i => i.checked).length + sec.extras.filter(e => e.checked).length;
  const priced = sec.buy.filter(i => i.cost != null);
  const estLeft = priced.filter(i => !i.checked).reduce((t, i) => t + i.cost, 0);

  const itemRow = i => rowHTML({ id: i.key, kind: "item", name: i.name, amount: i.amount, sub: i.note, checked: i.checked });
  const byAisle = AISLES.map(([id, label]) => {
    const items = sec.buy.filter(i => i.aisle === id).sort((a, b) => a.checked - b.checked || a.name.localeCompare(b.name));
    if (!items.length) return "";
    const open = items.filter(i => !i.checked).length;
    return `<div class="chead">${pix(id, 16)} ${label}<span class="n">${open || "✓"}</span></div>
      <div class="card"><ul class="glist">${items.map(itemRow).join("")}</ul></div>`;
  }).join("");
  const extras = sec.extras.length ? `<div class="chead">${pix("home", 16)} Added items<span class="n">${sec.extras.filter(e => !e.checked).length || "✓"}</span></div>
    <div class="card"><ul class="glist">${[...sec.extras].sort((a, b) => a.checked - b.checked).map(e => rowHTML({ id: e.id, kind: "extra", name: e.text, checked: e.checked })).join("")}</ul></div>` : "";

  const prev = weekKey(addDays(parseWeekKey(key), -7)), next = weekKey(addDays(parseWeekKey(key), 7));
  const rel = weekRelation(key);
  let hint = true;
  try { hint = !localStorage.getItem(HINT_KEY); } catch {}

  render(shell({
    title: "Groceries",
    bigTitle: false,
    body: `
      <h1 class="ctitle">Groceries</h1>
      <div class="csub">
        <span class="wknav"><a href="#/grocery/${prev}" aria-label="Previous week">◀</a><span>${weekLabel(key)}${rel ? ` · ${rel}` : ""}</span><a href="#/grocery/${next}" aria-label="Next week">▶</a></span>
      </div>
      ${total ? progressHTML(done, total, priced.length ? money(estLeft) : "") : ""}
      <form id="addForm" class="gadd" role="search">
        <input type="text" id="addIn" placeholder="Add an item — “2 lb chicken thighs”" autocomplete="off" enterkeyhint="done" aria-label="Add an item">
        <button class="plus" type="submit" aria-label="Add">+</button>
      </form>

      ${!meals.length && !sec.extras.length ? `<div class="cempty">${pix("cart", 32)}<b>Nothing to buy yet</b>Plan some meals and the list builds itself, or add items above.<div class="gfoot"><a class="cbtn primary" href="#/plan/${key}">Go to meal plan</a></div></div>` : ""}

      ${sec.ask.length ? `<div class="chead">Do you have these?</div>
      <div class="card gask">
        <p>Your answer is remembered. Change it anytime in Pantry.</p>
        ${sec.ask.map(i => `<div class="askrow">
          <span class="nm">${esc(cap1(i.name))}<small>for ${esc(i.sources.join(", "))}</small></span>
          <button class="cbtn" data-have="${esc(i.key)}">Yes</button><button class="cbtn" data-need="${esc(i.key)}">No</button>
        </div>`).join("")}
      </div>` : ""}

      ${extras}
      ${byAisle}

      ${sec.have.length ? `<details class="ghave"><summary class="chead">${pix("canned", 16)} Already in your pantry<span class="n">${sec.have.length} ▾</span></summary>
        <div class="card"><ul class="glist">${sec.have.map(i => `<li class="grow"><div class="grow-main" style="cursor:default">
          <span class="gname">${esc(cap1(i.name))}</span><button class="chip quiet" data-outof="${esc(i.key)}">Ran out</button></div></li>`).join("")}</ul></div>
      </details>` : ""}

      ${total && hint ? `<p class="ghint" id="ghint">Tap an item to check it off. Press and hold, or swipe left, for details.</p>` : ""}
      ${total ? `<div class="gfoot">
        <button class="cbtn ghost" id="share">Share list</button>
        ${done ? `<button class="cbtn ghost" id="uncheck">Uncheck all</button>` : ""}
        ${Object.keys(g.hidden).length ? `<button class="cbtn ghost" id="unhide">Restore removed (${Object.keys(g.hidden).length})</button>` : ""}
      </div>` : ""}`
  }), { keepScroll: true });

  const root = document.getElementById("app");
  const redraw = () => groceryView(key);
  const findItem = id => sec.buy.find(i => i.key === id);
  const findExtra = id => g.extras.find(x => x.id === id);

  const toggle = (id, kind) => {
    if (kind === "extra") { const e = findExtra(id); if (e) e.checked = !e.checked; }
    else {
      const on = !g.checked[id];
      if (on) g.checked[id] = true; else delete g.checked[id];
      // Bought a pantry item → remember you have it; unchecking means you don't.
      const it = findItem(id);
      if (it && it.kind !== "F") pantry[id] = on;
    }
    try { localStorage.setItem(HINT_KEY, "1"); } catch {}
    store.save();
    redraw();
  };
  const remove = (id, kind) => {
    if (kind === "extra") g.extras = g.extras.filter(x => x.id !== id);
    else g.hidden[id] = true;
    store.save();
    toast(kind === "extra" ? "Removed" : "Removed from this week's list");
    redraw();
  };
  const details = (id, kind) => kind === "extra" ? extraSheet(g, findExtra(id), redraw, remove) : itemSheet(g, findItem(id), redraw, remove);

  root.querySelectorAll(".grow[data-id]").forEach(li => bindRow(li, {
    tap: () => toggle(li.dataset.id, li.dataset.kind),
    more: () => details(li.dataset.id, li.dataset.kind),
    remove: () => remove(li.dataset.id, li.dataset.kind)
  }));
  root.querySelectorAll("[data-have]").forEach(b => b.onclick = () => { pantry[b.dataset.have] = true; store.save(); redraw(); });
  root.querySelectorAll("[data-need]").forEach(b => b.onclick = () => { pantry[b.dataset.need] = false; store.save(); redraw(); });
  root.querySelectorAll("[data-outof]").forEach(b => b.onclick = () => { pantry[b.dataset.outof] = false; store.save(); toast("Added to the list"); redraw(); });
  document.getElementById("addForm").onsubmit = e => {
    e.preventDefault();
    const v = document.getElementById("addIn").value.trim();
    if (!v) return;
    g.extras.push({ id: uid(), text: v, checked: false, at: Date.now() });
    store.save(); redraw();
    document.getElementById("addIn").focus();
  };
  document.getElementById("uncheck")?.addEventListener("click", () => { g.checked = {}; g.extras.forEach(e => e.checked = false); store.save(); redraw(); });
  document.getElementById("unhide")?.addEventListener("click", () => { g.hidden = {}; store.save(); redraw(); });
  document.getElementById("share")?.addEventListener("click", async () => {
    const text = `Groceries · ${weekLabel(key)}\n\n` + listAsText(key, sec);
    try {
      if (navigator.share) await navigator.share({ title: "Grocery list", text });
      else { await navigator.clipboard.writeText(text); toast("List copied"); }
    } catch {}
  });
}

// Row gestures: tap = check; press and hold = details; swipe left = reveal Details / Remove.
const OPEN = -152;
function bindRow(li, { tap, more, remove }) {
  const main = li.querySelector(".grow-main");
  let x0 = 0, y0 = 0, dx = 0, swiping = false, held = false, holdTimer = null, open = false, down = false;
  const setX = (x, animate) => { main.style.transition = animate ? "" : "none"; main.style.transform = x ? `translateX(${x}px)` : ""; };
  const close = () => { open = false; setX(0, true); };
  main.addEventListener("pointerdown", e => {
    if (e.button) return;
    down = true; x0 = e.clientX; y0 = e.clientY; dx = 0; swiping = false; held = false;
    holdTimer = setTimeout(() => { held = true; navigator.vibrate?.(10); more(); }, 480);
  });
  main.addEventListener("pointermove", e => {
    if (!down) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!swiping && Math.abs(my) > 10) { clearTimeout(holdTimer); down = false; return; } // scrolling
    if (!swiping && Math.abs(mx) > 10) { swiping = true; clearTimeout(holdTimer); main.setPointerCapture?.(e.pointerId); }
    if (swiping) { dx = Math.min(0, Math.max(OPEN - 30, (open ? OPEN : 0) + mx)); setX(dx, false); }
  });
  const end = () => {
    clearTimeout(holdTimer);
    if (!down) return;
    down = false;
    if (swiping) { open = dx < OPEN / 2; setX(open ? OPEN : 0, true); }
  };
  main.addEventListener("pointerup", end);
  main.addEventListener("pointercancel", () => { down = false; clearTimeout(holdTimer); if (swiping) close(); });
  main.addEventListener("contextmenu", e => e.preventDefault());
  main.addEventListener("click", e => {
    if (held || swiping) { e.preventDefault(); return; }
    if (open) { close(); return; }
    tap();
  });
  li.querySelector(".more").onclick = () => { close(); more(); };
  li.querySelector(".rm").onclick = () => remove();
  // Keyboard / screen reader: Shift+Enter or the context-menu key opens details.
  main.addEventListener("keydown", e => { if ((e.key === "Enter" && e.shiftKey) || e.key === "ContextMenu") { e.preventDefault(); more(); } });
}

// Details for an item built from your recipes: where it comes from, price, and editing for this week.
function itemSheet(g, it, redraw, remove) {
  if (!it) return;
  const ed = g.edits[it.key];
  const { el, close } = modal(cap1(it.name), `
    <p class="muted" style="margin-top:0">${it.amount ? `<b>${esc(it.amount)}</b> · ` : ""}${it.cost != null ? `~${money(it.cost)} · ` : ""}for ${esc(it.sources.join(", "))}</p>
    <label class="field"><span>Item</span><input type="text" id="eName" value="${esc(it.name)}" autocomplete="off"></label>
    <label class="field"><span>Amount</span><input type="text" id="eAmt" value="${esc(it.amount || "")}" placeholder="e.g. 2 lb, 1 box" autocomplete="off"></label>
    <label class="field"><span>Note<small>Brand, store, size…</small></span><input type="text" id="eNote" value="${esc(it.note || "")}" placeholder="e.g. organic" autocomplete="off"></label>
    <p class="muted" style="font-size:14px;margin:0">Changes apply to this week's list.</p>
    <div class="btnrow">
      <button class="btn primary" id="eSave">Save</button>
      ${ed ? `<button class="btn" id="eReset">Back to automatic</button>` : ""}
      <button class="btn danger" id="eRm">Remove</button>
    </div>`);
  el.querySelector("#eSave").onclick = () => {
    g.edits[it.key] = { name: el.querySelector("#eName").value.trim(), amount: el.querySelector("#eAmt").value.trim(), note: el.querySelector("#eNote").value.trim() };
    store.save(); close(); redraw();
  };
  el.querySelector("#eReset")?.addEventListener("click", () => { delete g.edits[it.key]; store.save(); close(); redraw(); });
  el.querySelector("#eRm").onclick = () => { close(); remove(it.key, "item"); };
}

function extraSheet(g, e, redraw, remove) {
  if (!e) return;
  const { el, close } = modal("Edit item", `
    <label class="field"><span>Item</span><input type="text" id="exText" value="${esc(e.text)}" autocomplete="off"></label>
    <div class="btnrow"><button class="btn primary" id="exSave">Save</button><button class="btn danger" id="exRm">Remove</button></div>`);
  el.querySelector("#exSave").onclick = () => { const v = el.querySelector("#exText").value.trim(); if (v) { e.text = v; store.save(); } close(); redraw(); };
  el.querySelector("#exRm").onclick = () => { close(); remove(e.id, "extra"); };
}
