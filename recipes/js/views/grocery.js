// Grocery list for a week: merged, rounded to packages, with pantry questions.
import * as store from "../store.js";
import { esc, uid } from "../util.js";
import { shell, render, toast } from "../ui.js";
import { AISLES } from "../fooddb.js";
import { sectionize, listAsText } from "../grocery.js";
import { weekNav, weekLabel, currentWeek, setWeek } from "./plan.js";

const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);

export function groceryView(key) {
  key = key || currentWeek();
  setWeek(key);
  const meals = store.week(key).meals || [];
  const g = store.groceryState(key);
  const pantry = store.get().pantry;
  const sec = sectionize(key);

  const left = sec.buy.filter(i => !i.checked).length + sec.extras.filter(e => !e.checked).length;
  const total = sec.buy.length + sec.extras.length;

  const byAisle = AISLES.map(([id, label]) => {
    const items = sec.buy.filter(i => i.aisle === id).sort((a, b) => a.checked - b.checked || a.name.localeCompare(b.name));
    return items.length ? `<div class="aisle">${label}</div><ul class="gl">${items.map(itemHTML).join("")}</ul>` : "";
  }).join("");

  const extras = sec.extras.length ? `<div class="aisle">Added by you</div><ul class="gl">${sec.extras.map(e => `
    <li class="${e.checked ? "got" : ""}">
      <label><input type="checkbox" data-extra="${e.id}" ${e.checked ? "checked" : ""}><span><span class="nm">${esc(e.text)}</span></span></label>
      <button class="iconbtn" data-rmextra="${e.id}" aria-label="Remove ${esc(e.text)}">✕</button>
    </li>`).join("")}</ul>` : "";

  render(shell({
    title: "Grocery list",
    body: `
      ${weekNav(key, "#/grocery")}
      ${!meals.length ? `<div class="empty"><span class="px">Nothing planned for this week</span>Plan some meals and the list builds itself.<div class="btnrow" style="justify-content:center"><a class="btn primary" href="#/plan/${key}">Go to meal plan</a></div></div>` : ""}

      ${sec.ask.length ? `<div class="ask">
        <h3>Do you have these?</h3>
        <p>I'll remember your answer for next time. Change it anytime in Pantry.</p>
        ${sec.ask.map(i => `<div class="askrow">
          <span class="nm">${esc(cap1(i.name))}<small>for ${esc(i.sources.join(", "))}</small></span>
          <span class="btns"><button class="btn small" data-have="${esc(i.key)}">Yes</button><button class="btn small" data-need="${esc(i.key)}">No</button></span>
        </div>`).join("")}
      </div>` : ""}

      ${byAisle}
      ${extras}

      <form id="addForm" class="inline" style="margin-top:18px">
        <input type="text" id="addIn" placeholder="Add something else (paper towels…)" autocomplete="off">
        <button class="btn small" type="submit">Add</button>
      </form>

      ${sec.have.length ? `<details class="have" style="margin-top:20px">
        <summary>Already in your pantry (${sec.have.length})</summary>
        <ul class="gl">${sec.have.map(i => `<li>
          <span class="nm">${esc(cap1(i.name))}</span>
          <button class="btn small" data-outof="${esc(i.key)}">Ran out</button>
        </li>`).join("")}</ul>
      </details>` : ""}

      ${total ? `<div class="btnrow">
        <button class="btn" id="share">Share list</button>
        ${sec.buy.some(i => i.checked) || sec.extras.some(e => e.checked) ? `<button class="btn" id="uncheck">Uncheck all</button>` : ""}
        ${Object.keys(g.hidden).length ? `<button class="btn" id="unhide">Restore removed (${Object.keys(g.hidden).length})</button>` : ""}
      </div>` : ""}`,
    status: `<span>${total ? `${left} of ${total} left` : "Empty"}</span><span>${weekLabel(key)}</span>`
  }), { keepScroll: true });

  const root = document.getElementById("app");
  const redraw = () => groceryView(key);

  root.querySelectorAll("[data-item]").forEach(c => c.onchange = () => {
    const k = c.dataset.item;
    if (c.checked) g.checked[k] = true; else delete g.checked[k];
    // Bought a pantry item → remember you have it; unchecking means you don't.
    const it = sec.buy.find(i => i.key === k);
    if (it && it.kind !== "F") pantry[k] = c.checked;
    store.save();
    redraw();
  });
  root.querySelectorAll("[data-hide]").forEach(b => b.onclick = () => { g.hidden[b.dataset.hide] = true; store.save(); toast("Removed from this week's list"); redraw(); });
  root.querySelectorAll("[data-have]").forEach(b => b.onclick = () => { pantry[b.dataset.have] = true; store.save(); redraw(); });
  root.querySelectorAll("[data-need]").forEach(b => b.onclick = () => { pantry[b.dataset.need] = false; store.save(); redraw(); });
  root.querySelectorAll("[data-outof]").forEach(b => b.onclick = () => { pantry[b.dataset.outof] = false; store.save(); toast("Added to the list"); redraw(); });
  root.querySelectorAll("[data-extra]").forEach(c => c.onchange = () => { const e = g.extras.find(x => x.id === c.dataset.extra); e.checked = c.checked; store.save(); redraw(); });
  root.querySelectorAll("[data-rmextra]").forEach(b => b.onclick = () => { g.extras = g.extras.filter(x => x.id !== b.dataset.rmextra); store.save(); redraw(); });
  document.getElementById("addForm").onsubmit = e => {
    e.preventDefault();
    const v = document.getElementById("addIn").value.trim();
    if (!v) return;
    g.extras.push({ id: uid(), text: v, checked: false });
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

function itemHTML(i) {
  return `<li class="${i.checked ? "got" : ""}">
    <label>
      <input type="checkbox" data-item="${esc(i.key)}" ${i.checked ? "checked" : ""}>
      <span>
        <span class="nm">${esc(cap1(i.name))}</span>${i.amount ? ` <span class="am">· ${esc(i.amount)}</span>` : ""}
        <small>${esc(i.sources.join(", "))}</small>
      </span>
    </label>
    <button class="iconbtn" data-hide="${esc(i.key)}" aria-label="Remove ${esc(i.name)} from list">✕</button>
  </li>`;
}
