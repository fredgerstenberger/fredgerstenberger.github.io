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
import { parseAdd, mergeAdd, noteAdded, suggest, frequentItems } from "../quickadd.js";
import { me } from "../ratings.js";
import * as stores from "../stores.js";
import * as house from "../household.js";
import { openStorePicker } from "./stores.js";

const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const HINT_KEY = "rb.groceryHint";
const CART_KEY = "rb.cartOpen";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  house.migrateWeekExtras();
  const g = store.groceryState(key);
  const prev = weekKey(addDays(parseWeekKey(key), -7)), next = weekKey(addDays(parseWeekKey(key), 7));
  const rel = weekRelation(key);

  // The header and add box are drawn once (so the keyboard stays up while adding); the list below
  // them is repainted after every change.
  render(shell({
    title: "Groceries",
    bigTitle: false,
    body: `
      <h1 class="ctitle">Groceries</h1>
      <div class="csub">
        <span class="wknav"><a href="#/grocery/${prev}" aria-label="Previous week">◀</a><span>${weekLabel(key)}${rel ? ` · ${rel}` : ""}</span><a href="#/grocery/${next}" aria-label="Next week">▶</a></span>
        <button class="chip" id="storeBtn" type="button" style="margin-left:auto"></button>
      </div>
      <div id="gprog"></div>
      <form id="addForm" class="gadd" role="search" autocomplete="off">
        <input type="text" id="addIn" placeholder="Add an item — “2 lb chicken thighs”" autocomplete="off" autocapitalize="sentences" enterkeyhint="go" aria-label="Add an item" aria-controls="gsug">
        <button class="plus" type="submit" aria-label="Add">+</button>
      </form>
      <ul class="gsug" id="gsug" role="listbox" hidden></ul>
      <div class="gchips" id="gchips"></div>
      <div id="gbody"></div>`
  }), { keepScroll: true });

  const input = document.getElementById("addIn");
  const sugEl = document.getElementById("gsug");
  let sec = null;
  const pantry = store.get().pantry;
  const history = () => (store.get().history ||= {});
  const findItem = id => sec.buy.find(i => i.key === id);
  const findExtra = id => g.extras.find(x => x.id === id);
  // Things you added: the ongoing household list, plus any still sitting on this week's list from
  // before the household list existed (or added by an older app version).
  const manual = () => [...house.items().map(h => ({ ...h, src: "house" })), ...g.extras.map(e => ({ ...e, src: "extra" }))];
  const onList = () => new Set([...sec.buy.filter(i => !i.checked).map(i => i.key), ...manual().filter(e => !e.checked).map(e => parseAdd(e.text).key)]);

  function paint() {
    sec = sectionize(key);
    const meals = store.week(key).meals || [];
    const extras = manual().map(e => ({ e, p: parseAdd(e.text) }));
    const total = sec.buy.length + extras.length;
    const done = sec.buy.filter(i => i.checked).length + extras.filter(x => x.e.checked).length;
    const priced = sec.buy.filter(i => i.cost != null);
    const estLeft = priced.filter(i => !i.checked).reduce((t, i) => t + i.cost, 0);
    const st = stores.get(stores.current());
    document.getElementById("storeBtn").innerHTML = `${pix("cart", 14)} ${esc(st ? st.name : "Any store")} ▾`;
    document.getElementById("gprog").innerHTML = total ? progressHTML(done, total, priced.length ? money(estLeft) : "") : "";
    document.getElementById("gchips").innerHTML = frequentItems(history(), onList()).map(n => `<button class="chip quiet" type="button" data-quick="${esc(n)}">+ ${esc(n)}</button>`).join("");

    const itemRow = i => rowHTML({ id: i.key, kind: "item", name: i.name, amount: i.amount, sub: i.note, checked: i.checked });
    const extraRow = ({ e, p }) => rowHTML({ id: e.id, kind: e.src, name: p.name, amount: p.amount, checked: e.checked });
    // Aisles list only what's left to get; checked items move to "In cart" at the bottom. Things you
    // added go in their aisle when it's known ("milk" → Dairy), otherwise under Added items.
    const loose = extras.filter(x => !x.p.aisle && !x.e.checked);
    const added = loose.length ? `<div class="chead">${pix("home", 16)} Added items<span class="n">${loose.length}</span></div>
      <div class="card"><ul class="glist">${loose.map(extraRow).join("")}</ul></div>` : "";
    // Aisles in the order of the store you're shopping at.
    const byAisle = stores.orderFor().map(id => {
      if (id === "home") return added;
      const label = stores.aisleLabel(id);
      const rows = [
        ...sec.buy.filter(i => i.aisle === id && !i.checked).map(i => ({ n: i.name, html: itemRow(i) })),
        ...extras.filter(x => x.p.aisle === id && !x.e.checked).map(x => ({ n: x.p.name, html: extraRow(x) }))
      ].sort((a, b) => a.n.localeCompare(b.n));
      if (!rows.length) return "";
      return `<div class="chead">${pix(id, 16)} ${label}<span class="n">${rows.length}</span></div>
        <div class="card"><ul class="glist">${rows.map(r => r.html).join("")}</ul></div>`;
    }).join("");
    const inCart = [...sec.buy.filter(i => i.checked).map(itemRow), ...extras.filter(x => x.e.checked).map(extraRow)];
    let cartOpen = false;
    try { cartOpen = sessionStorage.getItem(CART_KEY) === "1"; } catch {}
    const cart = inCart.length ? `<details class="gcart" id="gcart" ${cartOpen ? "open" : ""}>
        <summary><div class="chead">${pix("cart", 16)} In cart (${inCart.length})<span class="n"><span class="tw">▾</span></span></div></summary>
        <div class="card"><ul class="glist">${inCart.join("")}</ul></div>
      </details>` : "";
    let hint = true;
    try { hint = !localStorage.getItem(HINT_KEY); } catch {}

    document.getElementById("gbody").innerHTML = `
      ${!meals.length && !extras.length ? `<div class="cempty">${pix("cart", 32)}<b>Nothing to buy yet</b>Plan some meals and the list builds itself, or add items above.<div class="gfoot"><a class="cbtn primary" href="#/plan/${key}">Go to meal plan</a></div></div>` : ""}
      ${sec.ask.length ? `<div class="chead">Do you have these?</div>
      <div class="card gask">
        <p>Your answer is remembered. Change it anytime in Pantry.</p>
        ${sec.ask.map(i => `<div class="askrow">
          <span class="nm">${esc(cap1(i.name))}<small>for ${esc(i.sources.join(", "))}</small></span>
          <button class="cbtn" data-have="${esc(i.key)}">Yes</button><button class="cbtn" data-need="${esc(i.key)}">No</button>
        </div>`).join("")}
      </div>` : ""}
      ${total > 0 && done === total ? `<div class="gdone">${pix("cart", 32)}<b>Everything's in the cart</b>Nice shopping.</div>` : ""}
      ${byAisle}
      ${cart}
      ${sec.have.length ? `<details class="ghave"><summary class="chead">${pix("canned", 16)} Already in your pantry<span class="n">${sec.have.length} ▾</span></summary>
        <div class="card"><ul class="glist">${sec.have.map(i => `<li class="grow"><div class="grow-main" style="cursor:default">
          <span class="gname">${esc(cap1(i.name))}</span><button class="chip quiet" data-outof="${esc(i.key)}">Ran out</button></div></li>`).join("")}</ul></div>
      </details>` : ""}
      ${total && hint ? `<p class="ghint" id="ghint">Tap an item to check it off. Press and hold, or swipe left, for details.</p>` : ""}
      ${total ? `<div class="gfoot">
        <button class="cbtn ghost" id="share">Share list</button>
        ${done ? `<button class="cbtn ghost" id="uncheck">Uncheck all</button>` : ""}
        ${Object.keys(g.hidden).length ? `<button class="cbtn ghost" id="unhide">Restore removed (${Object.keys(g.hidden).length})</button>` : ""}
      </div>` : ""}`;
    bindBody();
  }

  // Set an item's checked state. Returns a function that puts everything back (for Undo).
  const setChecked = (id, kind, on) => {
    if (kind === "house") {
      const was = house.get(id); if (!was) return () => {};
      house.setChecked(id, on, me().name);
      return () => { if (house.get(id)) house.update(id, { checked: was.checked, cb: was.cb }); };
    }
    if (kind === "extra") {
      const e = findExtra(id); if (!e) return () => {};
      const was = e.checked; e.checked = on;
      return () => { const x = findExtra(id); if (x) x.checked = was; };
    }
    const was = !!g.checked[id], pWas = pantry[id];
    if (on) g.checked[id] = true; else delete g.checked[id];
    // Bought a pantry item → remember you have it; unchecking means you don't.
    const it = findItem(id);
    if (it && it.kind !== "F") pantry[id] = on;
    return () => {
      if (was) g.checked[id] = true; else delete g.checked[id];
      if (pWas === undefined) delete pantry[id]; else pantry[id] = pWas;
    };
  };
  const toggle = (id, kind, li) => {
    const on = !li.classList.contains("got");
    const name = li.querySelector(".gname").firstChild.textContent;
    try { localStorage.setItem(HINT_KEY, "1"); } catch {}
    const commit = () => {
      const undo = setChecked(id, kind, on);
      store.save();
      paint();
      if (on) toast(`${name} is in the cart`, { label: "Undo", run: () => { undo(); store.save(); paint(); } });
    };
    if (reducedMotion()) return commit();
    // The box fills, then the row folds away (about 300 ms in all).
    li.classList.toggle("got", on);
    li.querySelector(".gbox").innerHTML = on ? pix("check", 16) : "";
    setTimeout(() => { li.classList.add("leaving"); setTimeout(commit, 180); }, 120);
  };
  const remove = (id, kind) => {
    if (kind === "house") house.remove(id);
    else if (kind === "extra") g.extras = g.extras.filter(x => x.id !== id);
    else g.hidden[id] = true;
    store.save();
    toast(kind === "item" ? "Removed from this week's list" : "Removed");
    paint();
  };
  const details = (id, kind) => {
    if (kind === "item") return itemSheet(g, findItem(id), paint, remove);
    const e = kind === "house" ? house.get(id) : findExtra(id);
    if (!e) return;
    extraSheet(e, text => { if (kind === "house") house.update(id, { text }); else findExtra(id).text = text; store.save(); paint(); }, () => remove(id, kind));
  };

  // Add what was typed. Something already on the list merges into its line instead of repeating.
  function addManual(text) {
    const p = parseAdd(text);
    if (!p) return;
    const fromRecipes = [...sec.buy, ...sec.ask, ...sec.have].find(i => i.key === p.key) || (g.hidden[p.key] ? { key: p.key, hiddenOnly: true } : null);
    const extra = manual().find(e => parseAdd(e.text).key === p.key);
    if (fromRecipes) {
      delete g.hidden[p.key];
      delete g.checked[p.key];
      if (pantry[p.key] === true || sec.ask.some(i => i.key === p.key)) pantry[p.key] = false; // you need it after all
      if (p.amount && !fromRecipes.hiddenOnly) {
        const cur = (g.edits[p.key]?.amount ?? fromRecipes.amount ?? "").replace(/\s*\([^)]*\)/g, "");
        g.edits[p.key] = { ...(g.edits[p.key] || {}), amount: cur ? `${cur} + ${p.amount}` : p.amount };
      }
      toast(`${p.name} is already on the list${p.amount ? ` · added ${p.amount}` : ""}`);
    } else if (extra) {
      const merged = mergeAdd(extra.text, p);
      if (extra.src === "house") { house.update(extra.id, { text: merged }); house.setChecked(extra.id, false); }
      else { const x = findExtra(extra.id); x.text = merged; x.checked = false; }
      toast(`${p.name} is already on the list${p.amount ? ` · now ${parseAdd(merged).amount}` : ""}`);
    } else {
      house.add(text, me().name);
      const aisle = AISLES.find(a => a[0] === p.aisle);
      toast(`Added ${p.name}${aisle ? ` · ${aisle[1]}` : ""}`);
    }
    noteAdded(history(), p);
    store.save();
    paint();
  }

  function showSuggestions() {
    const list = suggest(input.value, history(), onList());
    sugEl.hidden = !list.length;
    sugEl.innerHTML = list.map(s => `<li><button type="button" role="option" data-sug="${esc(s.text)}">${esc(s.name)}${s.n ? `<small>added ${s.n}×</small>` : ""}</button></li>`).join("");
  }
  input.addEventListener("input", showSuggestions);
  input.addEventListener("blur", () => setTimeout(() => { sugEl.hidden = true; }, 150));
  input.addEventListener("focus", showSuggestions);
  sugEl.addEventListener("pointerdown", e => e.preventDefault()); // keep the keyboard up
  sugEl.addEventListener("click", e => {
    const b = e.target.closest("[data-sug]");
    if (!b) return;
    addManual(b.dataset.sug);
    input.value = ""; sugEl.hidden = true; input.focus();
  });
  document.getElementById("gchips").addEventListener("pointerdown", e => { if (document.activeElement === input) e.preventDefault(); });
  document.getElementById("gchips").addEventListener("click", e => {
    const b = e.target.closest("[data-quick]");
    if (b) addManual(b.dataset.quick);
  });
  document.getElementById("storeBtn").onclick = () => openStorePicker(paint);
  document.getElementById("addForm").onsubmit = e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    addManual(v);
    input.value = ""; sugEl.hidden = true;
    input.focus();
  };

  function bindBody() {
    const root = document.getElementById("gbody");
    root.querySelectorAll(".grow[data-id]").forEach(li => bindRow(li, {
      tap: () => toggle(li.dataset.id, li.dataset.kind, li),
      more: () => details(li.dataset.id, li.dataset.kind),
      remove: () => remove(li.dataset.id, li.dataset.kind)
    }));
    document.getElementById("gcart")?.addEventListener("toggle", e => { try { sessionStorage.setItem(CART_KEY, e.target.open ? "1" : "0"); } catch {} });
    root.querySelectorAll("[data-have]").forEach(b => b.onclick = () => { pantry[b.dataset.have] = true; store.save(); paint(); });
    root.querySelectorAll("[data-need]").forEach(b => b.onclick = () => { pantry[b.dataset.need] = false; store.save(); paint(); });
    root.querySelectorAll("[data-outof]").forEach(b => b.onclick = () => { pantry[b.dataset.outof] = false; store.save(); toast("Added to the list"); paint(); });
    document.getElementById("uncheck")?.addEventListener("click", () => { g.checked = {}; g.extras.forEach(e => e.checked = false); house.items().forEach(h => h.checked && house.setChecked(h.id, false)); store.save(); paint(); });
    document.getElementById("unhide")?.addEventListener("click", () => { g.hidden = {}; store.save(); paint(); });
    document.getElementById("share")?.addEventListener("click", async () => {
      const text = `Groceries · ${weekLabel(key)}\n\n` + listAsText(key, { ...sec, extras: manual() });
      try {
        if (navigator.share) await navigator.share({ title: "Grocery list", text });
        else { await navigator.clipboard.writeText(text); toast("List copied"); }
      } catch {}
    });
  }

  paint();
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

function extraSheet(e, save, remove) {
  const { el, close } = modal("Edit item", `
    <label class="field"><span>Item<small>Include an amount if you like: “2 lb chicken thighs”</small></span><input type="text" id="exText" value="${esc(e.text)}" autocomplete="off"></label>
    ${e.by ? `<p class="muted" style="font-size:14px;margin:0">Added by ${esc(e.by)}</p>` : ""}
    <div class="btnrow"><button class="btn primary" id="exSave">Save</button><button class="btn danger" id="exRm">Remove</button></div>`);
  el.querySelector("#exSave").onclick = () => { const v = el.querySelector("#exText").value.trim(); close(); if (v) save(v); };
  el.querySelector("#exRm").onclick = () => { close(); remove(); };
}
