// "Fill in ingredient info": after you save a recipe, ask once about ingredients the app has no
// nutrition or price for. Everything is optional, and you can come back to it from the recipe page.
import * as store from "./store.js";
import { esc } from "./util.js";
import { modal, toast } from "./ui.js";
import { parseIngredient, cleanName, toGrams, UNITS } from "./ingredients.js";
import { perGram } from "./prices.js";
import { bump, waitForLookups } from "./data.js";
import { estimate } from "./nutrition.js";

const UNIT_CHOICES = [["g", "g"], ["oz", "oz"], ["lb", "lb"], ["cup", "cup"], ["tbsp", "tbsp"], ["tsp", "tsp"], ["ml", "ml"], ["each", "each"]];
const ML_PER_CUP = 236.588;

// Ingredients in a recipe the app can't fully count.
// all = true also lists ones you've already filled in, so you can change them.
export function infoItems(recipe, all = false) {
  const items = new Map();
  for (const line of recipe.ingredients || []) {
    const ing = parseIngredient(line);
    if (!ing || ing.header || ing.qty == null) continue;
    const food = ing.food;
    if (food?.kind === "X") continue; // water
    // A specific product ("protein pasta") has its own info key; its price stays with the table food.
    const key = food?.infoKey || food?.name || cleanName(ing.name);
    if (!key || key.length < 2 || items.has(key)) continue;
    const variant = !!food?.infoKey && food.infoKey !== food.name && !food.custom;
    const builtIn = food && !food.custom && !food.usda && !variant && !food.yours;
    const needNu = !food?.nu || !!food?.standIn;
    const needPrice = !variant && perGram(food) == null;
    const mine = store.get().foods?.[key];
    if (needNu || needPrice || (all && (mine || (!builtIn && food)))) {
      items.set(key, { key, line, unit: ing.unit, food, builtIn, variant, needNu, needPrice, mine, share: 0 });
    }
  }
  // Biggest contributors to the recipe's calories or protein first.
  const shares = new Map();
  for (const row of estimate(recipe).rows) if (row.key) shares.set(row.key, Math.max(shares.get(row.key) || 0, row.share || 0));
  for (const it of items.values()) it.share = shares.get(it.key) || (it.food?.nu ? 0 : 1); // unknown: can't tell, so up top
  return [...items.values()].sort((a, b) => b.share - a.share);
}

function defaultUnit(unit) {
  if (!unit) return "each";
  const u = UNITS[unit];
  if (u?.dim === "count") return "each";
  return UNIT_CHOICES.some(([v]) => v === unit) ? unit : u?.dim === "mass" ? "g" : "cup";
}

const unitSelect = (name, val) => `<select name="${name}">${UNIT_CHOICES.map(([v, l]) => `<option value="${v}"${v === val ? " selected" : ""}>${l}</option>`).join("")}</select>`;
const num = (name, val, ph, step = "any") => `<input type="number" name="${name}" inputmode="decimal" step="${step}" min="0" placeholder="${ph}" value="${val ?? ""}">`;

function itemHTML(it, i) {
  const m = it.mine || {};
  const nr = m.nuRef || {}, pr = m.priceRef || {};
  const u = defaultUnit(it.unit);
  const showNu = !it.builtIn && (it.needNu || m.nuRef || it.food);
  const showPrice = !it.variant && (it.needPrice || m.priceRef || !it.builtIn);
  const note = it.food?.usda && !m.nuRef ? `<small class="muted">Nutrition from USDA: ${esc(it.food.usda.description)}. Fill in to replace it.</small>` : "";
  return `<fieldset class="fillitem" data-i="${i}">
    <legend>${esc(it.key)}</legend>
    <small class="muted">${esc(it.line)}</small>
    ${showNu ? `<div class="fillrow"><span>Nutrition for</span>${num("nqty", nr.qty ?? 1, "1")}${unitSelect("nunit", nr.unit || u)}</div>
      <div class="fillgrid">
        <label>Calories${num("kcal", nr.kcal, "kcal")}</label>
        <label>Protein g${num("protein", nr.protein, "g")}</label>
        <label>Carbs g${num("carbs", nr.carbs, "g")}</label>
        <label>Fat g${num("fat", nr.fat, "g")}</label>
      </div>${note}` : ""}
    ${showPrice ? `<div class="fillrow"><span>Price $</span>${num("price", pr.price, "0.00", "0.01")}<span>for</span>${num("pqty", pr.qty ?? 1, "1")}${unitSelect("punit", pr.unit || u)}</div>` : ""}
  </fieldset>`;
}

// Grams for qty × unit of this ingredient. Volume and "each" use the food's own weights when known,
// otherwise a stand-in (1 cup ≈ 240 g, each ≈ 100 g) that's stored with it, so later math matches.
function gramsFor(entry, food, qty, unit) {
  if (unit === "each") {
    const ge = entry.gEach || food?.gEach || 100;
    if (!food?.gEach) entry.gEach = ge;
    return qty * ge;
  }
  const u = UNITS[unit];
  if (u.dim === "mass") return qty * u.f;
  const gc = entry.gCup || food?.gCup || ML_PER_CUP;
  if (!food?.gCup) entry.gCup = gc;
  return qty * u.f * gc / ML_PER_CUP;
}

function saveItem(it, fs) {
  const v = n => { const x = parseFloat(fs.querySelector(`[name=${n}]`)?.value); return isNaN(x) ? null : x; };
  const s = n => fs.querySelector(`[name=${n}]`)?.value;
  const entry = { ...(it.mine || {}) };
  const food = it.food && !it.food.custom ? it.food : null; // weights from the built-in table or USDA
  let changed = false;

  const kcal = v("kcal"), nqty = v("nqty") || 1;
  if (fs.querySelector("[name=kcal]")) {
    if (kcal != null) {
      const ref = { qty: nqty, unit: s("nunit"), kcal, protein: v("protein") || 0, carbs: v("carbs") || 0, fat: v("fat") || 0 };
      const g = gramsFor(entry, food, ref.qty, ref.unit);
      if (g > 0) {
        const per = x => x * 100 / g;
        entry.nu = { kcal: per(ref.kcal), protein: per(ref.protein), carbs: per(ref.carbs), fat: per(ref.fat), fiber: 0 };
        entry.nuRef = ref;
        changed = true;
      }
    } else if (entry.nuRef) { delete entry.nu; delete entry.nuRef; changed = true; }
  }

  const price = v("price"), pqty = v("pqty") || 1;
  if (fs.querySelector("[name=price]")) {
    if (price != null) {
      const ref = { price, qty: pqty, unit: s("punit") };
      // For a built-in food, convert with its real weights (no stand-ins).
      const g = it.builtIn ? toGrams({ qty: ref.qty, unit: ref.unit === "each" ? null : ref.unit, food: it.food }) : gramsFor(entry, food, ref.qty, ref.unit);
      if (g > 0) {
        store.setPrice(it.key, price / g * 453.592, "l");
        entry.priceRef = ref;
        changed = true;
      } else toast(`Couldn't use a price per ${ref.unit} for ${it.key}; try a weight`);
    } else if (entry.priceRef) { store.setPrice(it.key, null); delete entry.priceRef; changed = true; }
  }

  if (!changed) return false;
  const empty = !entry.nu && !entry.priceRef;
  store.putFood(it.key, empty ? null : entry);
  return true;
}

export function openInfo(recipe, items, { first = false, onDone } = {}) {
  if (!items.length) { toast("Every ingredient already has nutrition and a price"); return; }
  const { el, close } = modal(first ? "Fill in missing info?" : "Ingredient info", `
    <p style="margin-top:0">${first
      ? "These ingredients have no nutrition or price yet. Add what you know from the package or receipt; leave the rest blank."
      : "Your numbers for these ingredients. They're used in every recipe that has them."}</p>
    <form id="fillForm">${items.map(itemHTML).join("")}
      <div class="btnrow"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" id="fillSkip">${first ? "Skip" : "Cancel"}</button></div>
      ${first ? `<p class="muted" style="font-size:14px">You won't be asked about these again. Change them anytime with <b>Ingredient info</b> on the recipe.</p>` : ""}
    </form>`, { onClose: () => onDone?.() });
  el.querySelector("#fillSkip").onclick = close;
  el.querySelector("#fillForm").onsubmit = e => {
    e.preventDefault();
    let n = 0;
    el.querySelectorAll(".fillitem").forEach(fs => { if (saveItem(items[+fs.dataset.i], fs)) n++; });
    close(); // close first: screens don't redraw while a dialog is open
    if (n) { bump(); toast(`Saved info for ${n} ingredient${n === 1 ? "" : "s"}`); }
  };
}

// After a recipe is saved: wait for USDA lookups, then ask once about anything still missing.
export async function askAfterSave(id) {
  const first = store.recipe(id);
  if (!first) return;
  infoItems(first); // starts USDA lookups for unknown ingredients
  await waitForLookups();
  const r = store.recipe(id);
  if (!r || location.hash !== `#/r/${id}` || document.getElementById("modal").open) return;
  const asked = store.get().asked || {};
  const items = infoItems(r).filter(it => !asked[it.key]);
  if (!items.length) return;
  store.markAsked(items.map(it => it.key));
  openInfo(r, items, { first: true });
}
