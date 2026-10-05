// Pantry: what you keep on hand. Drives the "Do you have these?" questions on the grocery list.
import * as store from "../store.js";
import { esc } from "../util.js";
import { shell, render, toast } from "../ui.js";
import { FOODS, FOOD_BY_NAME, AISLES, matchFood } from "../fooddb.js";
import { icon } from "../sprites.js";

export function pantryView() {
  const pantry = store.get().pantry;
  const have = Object.keys(pantry).filter(k => pantry[k] === true);
  const need = Object.keys(pantry).filter(k => pantry[k] === false);
  const aisleOf = k => FOOD_BY_NAME[k]?.aisle || "other";

  const group = (keys, btn) => AISLES.map(([id, label]) => {
    const ks = keys.filter(k => aisleOf(k) === id).sort();
    // Grouped like the grocery list's aisles: a heading with the count, then a card of rows.
    return ks.length ? `<div class="chead">${label}<span class="n">${ks.length}</span></div><div class="card"><ul class="glist prows">${ks.map(k => `<li class="prow"><span>${esc(k)}</span>${btn(k)}</li>`).join("")}</ul></div>` : "";
  }).join("");

  render(shell({
    title: "Pantry",
    back: "#/more",
    body: `
      <p style="margin-top:0">Things you keep stocked. They skip the grocery list; spices, sauces and other pantry items you haven't answered yet get asked about once.</p>
      <form id="addForm">
        <label class="field"><span>I have…</span>
          <div class="inline">
            <input type="text" id="addIn" list="foods" placeholder="e.g. soy sauce" autocomplete="off" autocapitalize="none">
            <button class="btn small" type="submit">Add</button>
          </div>
        </label>
        <datalist id="foods">${FOODS.filter(f => f.kind !== "X").map(f => `<option value="${esc(f.name)}">`).join("")}</datalist>
      </form>
      <h2 class="sect">On hand <small>${have.length}</small></h2>
      ${have.length ? group(have, k => `<button class="btn small" data-out="${esc(k)}">Ran out</button>`) : `<p class="muted">Nothing yet.</p>`}
      ${need.length ? `<h2 class="sect">Don't have <small>${need.length}</small></h2>
        <p class="muted" style="margin-top:0;font-size:14px">These go on the list whenever a recipe needs them.</p>
        ${group(need, k => `<span style="display:flex;gap:8px"><button class="btn small" data-have="${esc(k)}">Have it</button><button class="iconbtn" data-forget="${esc(k)}" aria-label="Forget ${esc(k)}">${icon("close", "ic16")}</button></span>`)}` : ""}`,
    status: `<span>${have.length} on hand</span><span>Saved on this device</span>`
  }), { keepScroll: true });

  const root = document.getElementById("app");
  root.querySelectorAll("[data-out]").forEach(b => b.onclick = () => { pantry[b.dataset.out] = false; store.save(); pantryView(); });
  root.querySelectorAll("[data-have]").forEach(b => b.onclick = () => { pantry[b.dataset.have] = true; store.save(); pantryView(); });
  root.querySelectorAll("[data-forget]").forEach(b => b.onclick = () => { delete pantry[b.dataset.forget]; store.save(); pantryView(); });
  document.getElementById("addForm").onsubmit = e => {
    e.preventDefault();
    const v = document.getElementById("addIn").value.trim().toLowerCase();
    if (!v) return;
    const f = matchFood(v);
    const key = f ? f.name : v;
    pantry[key] = true;
    store.save();
    toast(f && f.name !== v ? `Added as “${f.name}”` : "Added");
    pantryView();
  };
}
