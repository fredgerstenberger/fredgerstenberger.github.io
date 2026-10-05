// Store-bought meals: the quick form (name, store, servings, price, the label's nutrition) and the meal's page.
import * as store from "../store.js";
import { esc } from "../util.js";
import { shell, render, modal, toast, confirmBox, go } from "../ui.js";
import { readyRecord, readyStores, isReady } from "../ready.js";
import { nutritionFor } from "../nutrition.js";
import { recipeCost, money } from "../prices.js";
import { scanLabel, imageFromClipboard, imageFromPasteEvent } from "../scan.js";
import { normalizeLabel } from "../label.js";
import { photoOf, setPhoto } from "../photos.js";
import { bump } from "../data.js";
import { openAddToPlan } from "./plan.js";
import { icon } from "../sprites.js";

const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"]];
const r0 = n => (n == null || isNaN(n) ? "" : Math.round(n * 10) / 10);

/**
 * Add or edit a store-bought meal. meal: "lunch" etc. to start with that meal ticked (from the meal plan's
 * picker). onSaved(recipe) runs after saving.
 */
export function openReadyForm({ id = null, meal = "", onSaved } = {}) {
  const old = id ? store.recipe(id) : null;
  const nu = old?.nutrition || {};
  const stores = readyStores(store.recipes());
  const meals = new Set(old ? (old.tags || []).filter(t => MEALS.some(([m]) => m === t)) : meal ? [meal] : []);
  const st = store.settings();
  const field = (name, label, val, unit, attrs = "") => `<label class="rdfield"><span>${label}</span><span class="lin"><input type="number" name="${name}" inputmode="decimal" step="any" min="0" value="${val ?? ""}" ${attrs}>${unit ? `<small>${unit}</small>` : ""}</span></label>`;
  const { el, close } = modal(old ? "Edit store-bought meal" : "Store-bought meal", `
    <form id="rdForm" class="rdform">
      <label class="rdwide">Name<input type="text" name="title" required maxlength="120" value="${esc(old?.title || "")}" placeholder="e.g. Chicken Tikka Masala" autocomplete="off"></label>
      <label class="rdwide">Store<input type="text" name="store" list="rdStores" maxlength="40" value="${esc(old?.ready?.store ?? stores[0] ?? "")}" placeholder="e.g. Trader Joe's" autocomplete="off"></label>
      <datalist id="rdStores">${stores.map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      <div class="rdwide"><span class="rdlabel">Meal</span><div class="chips">${MEALS.map(([m, l]) => `<button type="button" class="chip" data-meal="${m}" aria-pressed="${meals.has(m)}">${l}</button>`).join("")}</div></div>
      ${field("servings", "Servings per package", old?.yield ?? 1, "", 'step="1" min="1"')}
      ${field("price", "Price per package", old?.ready?.price ?? "", "$")}
      <div class="rdwide rdnu">
        <span class="rdlabel">Nutrition per serving <small>(optional)</small></span>
        <div class="filllabel">
          <button type="button" class="btn small" id="rdPaste">${icon("clipboard", "ic16")}Paste label image</button>
          <label class="btn small fsfile">${icon("camera", "ic16")}Photo<input type="file" accept="image/*" id="rdPhoto" hidden></label>
          <p class="muted fillmsg" id="rdMsg" aria-live="polite"></p>
        </div>
        <div class="rdgrid">
          ${field("kcal", "Calories", nu.kcal, "kcal")}
          ${field("protein", "Protein", nu.protein, "g")}
          ${field("carbs", "Carbs", nu.carbs, "g")}
          ${field("fat", "Fat", nu.fat, "g")}
        </div>
      </div>
      <div class="btnrow rdwide"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" id="rdCancel">Cancel</button></div>
    </form>`);
  const form = el.querySelector("#rdForm");
  let fiber = nu.fiber ?? null, serving = nu.serving || "";
  el.querySelectorAll("[data-meal]").forEach(b => b.onclick = () => {
    const m = b.dataset.meal;
    meals.has(m) ? meals.delete(m) : meals.add(m);
    b.setAttribute("aria-pressed", meals.has(m));
  });
  const msg = t => { el.querySelector("#rdMsg").textContent = t; };
  // A picture of the label fills in the numbers (per its serving) and, if it says, the servings per package.
  const readLabel = async file => {
    if (!file) return;
    msg("Reading the label… this takes a few seconds.");
    try {
      const { label } = await scanLabel(file, { worker: st.proxy, model: st.scanModel, key: st.scanKey });
      const f = normalizeLabel(label);
      if (f.kcal == null) throw new Error("Couldn't find the calories on that label. Try a closer picture, or type the numbers.");
      for (const k of ["kcal", "protein", "carbs", "fat"]) form.elements[k].value = r0(f[k]);
      if (f.servings && f.servings >= 1) form.elements.servings.value = Math.round(f.servings);
      fiber = f.fiber; serving = f.servingText || "";
      msg(`Read: ${f.servingText ? `per ${f.servingText}, ` : ""}${Math.round(f.kcal)} kcal${f.servings ? `, ${f.servings} servings per package` : ""}. Check the numbers, then Save.`);
    } catch (err) { msg(err.message); }
  };
  el.querySelector("#rdPaste").onclick = async () => { try { await readLabel(await imageFromClipboard()); } catch (err) { msg(err.message); } };
  el.querySelector("#rdPhoto").onchange = e => readLabel(e.target.files?.[0]);
  form.addEventListener("paste", e => { const f = imageFromPasteEvent(e); if (f) { e.preventDefault(); readLabel(f); } });
  el.querySelector("#rdCancel").onclick = close;
  form.onsubmit = e => {
    e.preventDefault();
    const v = n => form.elements[n].value;
    const r = readyRecord({
      title: v("title"), store: v("store"), price: v("price"), servings: v("servings"), meals: [...meals],
      nu: v("kcal") !== "" ? { kcal: v("kcal"), protein: v("protein"), carbs: v("carbs"), fat: v("fat"), fiber, serving } : null
    }, old);
    if (!r) { toast("Give it a name"); return; }
    store.putRecipe(r);
    close(); bump();
    toast(old ? "Saved" : `Added ${r.title}`);
    onSaved?.(r);
  };
}

/** A store-bought meal's page: what it is, its label numbers and cost, and + Meal plan. */
export function readyView(r) {
  const nu = nutritionFor(r), cost = recipeCost(r), photo = photoOf(r.id);
  const n = r.nutrition;
  const row = (label, val) => val == null || val === "" ? "" : `<div><dt>${label}</dt><dd>${val}</dd></div>`;
  render(shell({
    bigTitle: false,
    title: r.title,
    back: "#/book",
    actions: `<button class="tb-btn tb-more" id="moreBtn" aria-label="More actions" aria-haspopup="dialog">${icon("more", "ic20")}</button>`,
    body: `
      ${photo ? `<img class="rphoto" data-photo src="${esc(photo)}" alt="" decoding="sync" referrerpolicy="no-referrer">` : ""}
      <h2 class="rtitle">${esc(r.title)}</h2>
      <p class="rsource"><span class="rdtag">Store-bought</span>${r.ready.store ? ` from ${esc(r.ready.store)}` : ""}</p>
      <dl class="facts">
        ${row("Servings", `${r.yield || 1} per package`)}
        ${cost.total > 0 ? row("Cost", `${money(cost.perServing)}/serving<br><span class="muted" style="font-size:14px">${money(cost.total)} a package</span>`) : ""}
        ${nu.kcal ? row("Per serving", `${Math.round(nu.kcal)} kcal<br><span class="muted" style="font-size:14px">${Math.round(nu.protein || 0)} g protein</span>`) : ""}
      </dl>
      <div class="btnrow rbtns">
        <button class="btn primary" id="planBtn">+ Meal plan</button>
        <button class="btn" id="editBtn">Edit</button>
      </div>
      <h2 class="sect">Nutrition <small>per serving${n?.serving ? ` (${esc(n.serving)})` : ""}</small></h2>
      ${n ? `<div class="card"><dl class="rdnums">
          ${[["Calories", n.kcal, ""], ["Protein", n.protein, " g"], ["Carbs", n.carbs, " g"], ["Fat", n.fat, " g"], ["Fiber", n.fiber, " g"]].filter(x => x[1] != null).map(([l, v, u]) => `<div><dt>${l}</dt><dd>${Math.round(v)}${u}</dd></div>`).join("")}
        </dl></div><p class="muted" style="font-size:14px">From the package label.</p>`
      : `<p class="muted">No label yet, so it isn't counted in the day's calories. <button class="btn small" id="addLabel">Add label</button></p>`}`
  }));
  const edit = () => openReadyForm({ id: r.id, onSaved: () => readyView(store.recipe(r.id)) });
  document.getElementById("planBtn").onclick = () => openAddToPlan(r.id);
  document.getElementById("editBtn").onclick = edit;
  document.getElementById("addLabel")?.addEventListener("click", edit);
  // Arrived from an Edit link (#/edit/…): open the form over the page.
  let want = null;
  try { want = sessionStorage.getItem("rb.editReady"); sessionStorage.removeItem("rb.editReady"); } catch {}
  if (want === r.id) edit();
  document.getElementById("moreBtn").onclick = () => {
    const { el, close } = modal("Store-bought meal", `
      <div class="rmenu">
        <button class="rmitem" id="rmEdit">Edit</button>
        ${photo ? `<button class="rmitem" id="rmNoPhoto">Remove photo</button>` : ""}
        <button class="rmitem danger" id="rmDelete">Delete…</button>
      </div>`);
    el.querySelector("#rmEdit").onclick = () => { close(); edit(); };
    el.querySelector("#rmNoPhoto")?.addEventListener("click", () => { setPhoto(r.id, null); close(); readyView(r); });
    el.querySelector("#rmDelete").onclick = async () => {
      close();
      if (!(await confirmBox(`Delete ${r.title}? It comes off the meal plan too.`))) return;
      store.deleteRecipe(r.id); setPhoto(r.id, null);
      toast("Deleted"); go("#/book");
    };
  };
}

export { isReady };
