// Grocery list for a week: merged, rounded to packages, with pantry questions. Calm Pixel style:
// tap anywhere on a row to check it; press and hold (or swipe left) for details, edit and remove.
import * as store from "../store.js";
import { esc, uid, addDays, parseWeekKey, weekKey, weekRelation } from "../util.js";
import { shell, render, toast, modal } from "../ui.js";
import { AISLES, FOOD_BY_NAME } from "../fooddb.js";
import { sectionize, listAsText } from "../grocery.js";
import { weekLabel, currentWeek, setWeek } from "./plan.js";
import { money } from "../prices.js";
import { pix } from "../pixicons.js";
import { parseAdd, noteBought, suggest, frequentItems } from "../quickadd.js";
import { me } from "../ratings.js";
import * as stores from "../stores.js";
import * as house from "../household.js";
import { openStorePicker } from "./stores.js";
import * as live from "../live.js";
import * as sync from "../sync.js";
import { addToList } from "../grocery-add.js";

const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const HINT_KEY = "rb.groceryHint";
export const ADD_KEY = "rb.add";
const CART_KEY = "rb.cartOpen";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Shopping mode (this phone only): bigger rows, just what's left by aisle, and the screen kept awake.
// The Screen Wake Lock API works in Safari 16.4+ and in home-screen apps from iOS 18.4; where it
// isn't available the screen just sleeps as usual.
const SHOP_KEY = "rb.shopping";
const shopping = () => { try { return sessionStorage.getItem(SHOP_KEY) === "1"; } catch { return false; } };
const setShopping = on => { try { on ? sessionStorage.setItem(SHOP_KEY, "1") : sessionStorage.removeItem(SHOP_KEY); } catch {} };
const onGrocery = () => (location.hash || "").startsWith("#/grocery");
let wake = null;
async function keepAwake(on) {
  if (!on) { const w = wake; wake = null; try { await w?.release(); } catch {} showWake(); return; }
  if (wake || !navigator.wakeLock || document.visibilityState !== "visible") return showWake();
  try {
    wake = await navigator.wakeLock.request("screen");
    wake.addEventListener("release", () => { wake = null; showWake(); });
  } catch { wake = null; }
  showWake();
}
const showWake = () => { const el = document.getElementById("gwake"); if (el) el.hidden = !(wake && shopping()); };
// A partner's changes: the list as last drawn is compared with what a sync brought in, and a short
// note says what changed ("Emma checked eggs"). Registered before the app's own refresh on sync.
let seen = null, livePaint = null;
if (typeof document !== "undefined") {
  addEventListener("rb:synced", () => {
    if (!seen || !onGrocery() || !document.getElementById("gbody")) return;
    if (house.mergeDuplicates()) store.save(); // the same thing added on both phones at once
    const chs = live.changes(seen.snap, live.snapshot(store.get(), seen.week));
    livePaint?.(); // also while typing in the add box, when the app holds off redrawing the screen
    const msg = live.describe(chs);
    const t = document.getElementById("toast");
    if (!msg || (!t.hidden && t.classList.contains("act"))) return; // never cover an Undo
    const who = new Set(chs.map(c => c.who));
    toast(msg, null, who.size === 1 ? live.initial(chs[0].who) : "");
  });
  // iOS drops the wake lock whenever the app goes to the background; take it again on return.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && shopping() && onGrocery()) keepAwake(true); });
  addEventListener("hashchange", () => { if (!onGrocery()) keepAwake(false); });
}

function progressHTML(done, total, left) {
  const bar = total <= 24
    ? `<span class="gbar" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i class="${i < done ? "on" : ""}"></i>`).join("")}</span>`
    : `<span class="gbar solid" aria-hidden="true"><i style="width:${Math.round(done / total * 100)}%"></i></span>`;
  return `<div class="gprog" role="status">${bar}<b>${done} of ${total}</b>${left ? `<span>· ~${left} left</span>` : ""}</div>`;
}

function rowHTML({ id, kind, name, amount, sub, checked, who }) {
  return `<li class="grow ${checked ? "got" : ""}" data-id="${esc(id)}" data-kind="${kind}">
    <button class="grow-main" aria-pressed="${checked}">
      <span class="gbox">${checked ? pix("check", 16) : ""}</span>
      <span class="gname">${esc(cap1(name))}${who ? `<span class="gby" title="${esc(who)}">${esc(live.initial(who))}</span>` : ""}${sub ? `<small>${esc(sub)}</small>` : ""}</span>
      ${amount ? `<span class="gamt">${esc(amount)}</span>` : ""}
    </button>
    <div class="grow-actions" aria-hidden="true"><button class="more" tabindex="-1">Details</button><button class="rm" tabindex="-1">Remove</button></div>
  </li>`;
}

export function groceryView(key) {
  key = key || currentWeek();
  setWeek(key);
  house.migrateWeekExtras();
  if (house.mergeDuplicates()) store.save();
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
      <p class="gwake" id="gwake" hidden>${pix("check", 14)} Screen stays on while you shop</p>
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
    if (!document.getElementById("gbody")) return; // left the list before a delayed check finished
    sec = sectionize(key);
    const meals = store.week(key).meals || [];
    const extras = manual().map(e => ({ e, p: parseAdd(e.text) }));
    const total = sec.buy.length + extras.length;
    const done = sec.buy.filter(i => i.checked).length + extras.filter(x => x.e.checked).length;
    const priced = sec.buy.filter(i => i.cost != null);
    const estLeft = priced.filter(i => !i.checked).reduce((t, i) => t + i.cost, 0);
    const st = stores.get(stores.current());
    const shop = shopping();
    document.getElementById("storeBtn").innerHTML = `${pix("cart", 14)} ${esc(st ? st.name : "Any store")} ▾`;
    document.getElementById("gprog").innerHTML = total ? progressHTML(done, total, priced.length ? money(estLeft) : "") : "";
    document.getElementById("gchips").innerHTML = frequentItems(history(), onList()).map(n => `<button class="chip quiet" type="button" data-quick="${esc(n)}">+ ${esc(n)}</button>`).join("");

    // A partner's initial: on things they added, and in the cart on things they checked.
    const mine = me().name;
    const other = n => (n && n !== mine ? n : "");
    const itemRow = i => rowHTML({ id: i.key, kind: "item", name: i.name, amount: i.amount, sub: i.note, checked: i.checked, who: i.checked ? other(g.checkedBy?.[i.key]) : "" });
    const extraRow = ({ e, p }) => rowHTML({ id: e.id, kind: e.src, name: p.name, amount: p.amount, checked: e.checked, who: other(e.checked ? e.cb : e.by) });
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
      ${sec.ask.length ? `<div class="gaskwrap"><div class="chead">Do you have these?</div>
      <div class="card gask">
        <p>Your answer is remembered. Change it anytime in Pantry.</p>
        ${sec.ask.map(i => `<div class="askrow">
          <span class="nm">${esc(cap1(i.name))}<small>for ${esc(i.sources.join(", "))}</small></span>
          <button class="cbtn" data-have="${esc(i.key)}">Yes</button><button class="cbtn" data-need="${esc(i.key)}">No</button>
        </div>`).join("")}
      </div></div>` : ""}
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
      </div>` : ""}
      ${shop ? `<div class="gshopbar"><button class="cbtn" id="shopExit">Exit</button><button class="cbtn primary" id="shopDone">${pix("check", 18)} Done shopping</button></div>`
        : total > done ? `<div class="gshopbar"><button class="cbtn primary" id="shopStart">${pix("cart", 18)} Start shopping</button></div>` : ""}`;
    document.querySelector(".page")?.classList.toggle("shopping", shop);
    document.querySelector(".page")?.classList.toggle("hasbar", shop || total > done);
    bindBody();
    seen = { week: key, snap: live.snapshot(store.get(), key) };
  }
  livePaint = paint;

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
    const was = !!g.checked[id], pWas = pantry[id], byWas = g.checkedBy?.[id];
    if (on) g.checked[id] = true; else delete g.checked[id];
    const by = me().name;
    if (on && by) (g.checkedBy ||= {})[id] = by; else if (g.checkedBy) delete g.checkedBy[id];
    // Bought a pantry item → remember you have it; unchecking means you don't.
    const it = findItem(id);
    if (it && it.kind !== "F") pantry[id] = on;
    return () => {
      if (was) g.checked[id] = true; else delete g.checked[id];
      if (byWas) (g.checkedBy ||= {})[id] = byWas; else if (g.checkedBy) delete g.checkedBy[id];
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
    extraSheet(e, text => { if (kind === "house") house.edit(id, text); else Object.assign(findExtra(id), { text, checked: false }); store.save(); paint(); }, () => remove(id, kind));
  };

  // Add what was typed. Something already on the list merges into its line instead of repeating.
  function addManual(text, quiet = false) {
    const r = addToList(key, text, me().name);
    if (!r) return null;
    const { p, result, amount } = r;
    const aisle = AISLES.find(a => a[0] === p.aisle);
    if (!quiet) toast(result === "added" ? `Added ${p.name}${aisle ? ` · ${aisle[1]}` : ""}`
      : `${p.name} is already on the list${amount ? (result === "recipe" ? ` · added ${amount}` : ` · now ${amount}`) : ""}`);
    store.save();
    paint();
    return p;
  }

  // Items from a link or an iOS Shortcut (/recipes/?add=milk, eggs; see app.js and the README).
  function addFromLink(textList) {
    const added = String(textList).split(/[,;\n]+/).map(t => t.trim().slice(0, 80)).filter(Boolean).slice(0, 30)
      .map(t => addManual(t, true)).filter(Boolean);
    if (!added.length) return;
    const names = added.map(p => p.name.toLowerCase());
    const what = names.length <= 3 ? names.join(", ").replace(/, ([^,]*)$/, " and $1") : `${names.length} items`;
    if (sync.enabled()) { sync.syncNow().catch(() => {}); toast(`Added ${what}`); }
    // Opened in a browser that isn't connected to your household's sync (from a Shortcut that's
    // Safari, whose storage is separate from the home-screen app).
    else toast(`Added ${what} · this browser isn't synced`, { label: "Set up", run: () => { location.hash = "#/settings"; } });
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

  // Done shopping: things you added and checked leave the list (recipe items stay checked for the
  // week), purchases are noted in history, and pantry foods can be marked as stocked.
  function doneShopping() {
    const got = manual().filter(e => e.checked).map(e => ({ e, p: parseAdd(e.text) }));
    const gotItems = sec.buy.filter(i => i.checked);
    const stock = got.filter(({ p }) => p && "PS".includes(FOOD_BY_NAME[p.key]?.kind || "F") && pantry[p.key] !== true);
    const finish = markStocked => {
      const now = Date.now();
      for (const i of gotItems) noteBought(history(), { key: i.key, name: i.name, aisle: i.aisle }, now);
      for (const { p } of got) if (p) noteBought(history(), p, now);
      const pWas = {};
      if (markStocked) for (const { p } of stock) { pWas[p.key] = pantry[p.key]; pantry[p.key] = true; }
      const goneHouse = house.clearChecked();
      const goneExtras = g.extras.filter(e => e.checked);
      g.extras = g.extras.filter(e => !e.checked);
      setShopping(false); keepAwake(false);
      store.save(); paint();
      const n = goneHouse.length + goneExtras.length;
      toast(n ? `Done shopping · cleared ${n} item${n > 1 ? "s" : ""}` : "Done shopping", n || markStocked && stock.length ? { label: "Undo", run: () => {
        house.restore(goneHouse);
        g.extras = [...g.extras, ...goneExtras].sort((a, b) => (a.at || 0) - (b.at || 0));
        for (const [k, v] of Object.entries(pWas)) { if (v === undefined) delete pantry[k]; else pantry[k] = v; }
        store.save(); paint();
      } } : null);
    };
    if (!got.length && !stock.length) return finish(false);
    const names = list => list.map(({ p }) => p.name.toLowerCase()).join(", ");
    const { el, close } = modal("Done shopping?", `
      <p style="margin-top:0">${got.length} thing${got.length > 1 ? "s" : ""} you added ${got.length > 1 ? "leave" : "leaves"} the list: ${esc(names(got))}.${gotItems.length ? " Items from your recipes stay checked for this week." : ""}</p>
      ${stock.length ? `<label class="gopt"><input type="checkbox" id="dsStock" checked><span>Mark as in your pantry<small>${esc(names(stock))}</small></span></label>` : ""}
      <div class="btnrow"><button class="btn primary" id="dsOk">Done shopping</button><button class="btn" id="dsNo">Keep shopping</button></div>`);
    el.querySelector("#dsOk").onclick = () => { const m = !!el.querySelector("#dsStock")?.checked; close(); finish(m); };
    el.querySelector("#dsNo").onclick = () => close();
  }

  function bindBody() {
    const root = document.getElementById("gbody");
    document.getElementById("shopStart")?.addEventListener("click", () => { setShopping(true); keepAwake(true); paint(); window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }); });
    document.getElementById("shopExit")?.addEventListener("click", () => { setShopping(false); keepAwake(false); paint(); });
    document.getElementById("shopDone")?.addEventListener("click", doneShopping);
    root.querySelectorAll(".grow[data-id]").forEach(li => bindRow(li, {
      tap: () => toggle(li.dataset.id, li.dataset.kind, li),
      more: () => details(li.dataset.id, li.dataset.kind),
      remove: () => remove(li.dataset.id, li.dataset.kind)
    }));
    document.getElementById("gcart")?.addEventListener("toggle", e => { try { sessionStorage.setItem(CART_KEY, e.target.open ? "1" : "0"); } catch {} });
    root.querySelectorAll("[data-have]").forEach(b => b.onclick = () => { pantry[b.dataset.have] = true; store.save(); paint(); });
    root.querySelectorAll("[data-need]").forEach(b => b.onclick = () => { pantry[b.dataset.need] = false; store.save(); paint(); });
    root.querySelectorAll("[data-outof]").forEach(b => b.onclick = () => { pantry[b.dataset.outof] = false; store.save(); toast("Added to the list"); paint(); });
    document.getElementById("uncheck")?.addEventListener("click", () => { g.checked = {}; delete g.checkedBy; g.extras.forEach(e => e.checked = false); house.items().forEach(h => h.checked && house.setChecked(h.id, false)); store.save(); paint(); });
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
  if (shopping()) keepAwake(true);
  let fromLink = null;
  try { fromLink = sessionStorage.getItem(ADD_KEY); sessionStorage.removeItem(ADD_KEY); } catch {}
  if (fromLink) addFromLink(fromLink);
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
