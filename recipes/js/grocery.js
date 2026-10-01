// Build a merged grocery list from a week's meal plan.
import { parseIngredient, toGrams, UNITS, usMass, usVolume, fmtQty, unitLabel, cleanName } from "./ingredients.js";
import { servingsOf } from "./nutrition.js";
import * as store from "./store.js";
import { FOOD_BY_NAME } from "./fooddb.js";
import { perGram, packagePrice, eachPrice } from "./prices.js";

function singular(w) {
  if (/(ss|us|is)$/.test(w) || w.length <= 3) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(oes|ches|shes|xes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

export function pluralize(word, n) {
  if (n <= 1) return word;
  if (/(s|x|ch|sh)$/.test(word)) return word + "es";
  if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + "ies";
  if (/(tomato|potato)$/.test(word)) return word + "es";
  return word + "s";
}

// "14.5 oz" → grams, "32 fl oz" → ml≈g
function nominalGrams(desc) {
  const m = String(desc || "").match(/([\d.]+)\s*(fl oz|oz|lb|ml|l)\b/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return { "fl oz": 29.57, oz: 28.35, lb: 453.6, ml: 1, l: 1000 }[m[2]] * n;
}

function sizeGrams(size) {
  const u = UNITS[size.unit];
  if (!u || u.dim === "count") return null;
  return size.qty * u.f;
}

function addLine(acc, f, key, title, line, mult) {
  let a = acc.get(key);
  if (!a) {
    a = { key, food: f, name: f ? f.name : key, grams: 0, mass: 0, vol: 0, pkgCount: 0, counts: {}, untracked: false, sources: new Set(), lines: [] };
    acc.set(key, a);
  }
  a.sources.add(title);
  a.lines.push({ line, title, mult });
  return a;
}

export function buildList(weekKey) {
  const wk = store.week(weekKey);
  const acc = new Map();

  for (const meal of wk.meals || []) {
    const r = store.recipe(meal.rid);
    if (!r) continue;
    const mult = (meal.servings || servingsOf(r)) / servingsOf(r);
    for (const line of r.ingredients || []) {
      const ing = parseIngredient(line);
      if (!ing || ing.header) continue;
      let f = ing.food;
      if (f && f.kind === "X") continue;
      // Lemon juice / zest are bought as whole lemons: fold them into the lemon line.
      const whole = f && f.pkg && FOOD_BY_NAME[f.pkg.label];
      if (whole && whole.gEach && ing.qty != null) {
        const g = toGrams(ing, mult);
        if (g != null) {
          const pieces = g / f.pkg.g;
          addLine(acc, whole, whole.name, r.title, line, mult).grams += pieces * whole.gEach;
          continue;
        }
      }
      const key = f ? f.name : singular(cleanName(ing.name) || ing.name.toLowerCase());
      if (!key) continue;
      const a = addLine(acc, f, key, r.title, line, mult);

      if (ing.qty == null) { a.untracked = true; continue; }
      const q = (ing.qtyMax != null ? ing.qtyMax : ing.qty) * mult; // shop for the high end of a range
      const u = ing.unit ? UNITS[ing.unit] : null;

      // Containers ("2 cans", "1 box") count directly toward whole packages.
      if (f && f.pkg && u && u.pkg && ing.unit !== "bunch" && ing.unit !== "head") {
        let ratio = 1;
        if (ing.size) {
          const sg = sizeGrams(ing.size), ng = nominalGrams(f.pkg.desc);
          if (sg && ng) { const r2 = sg / ng; ratio = r2 > 0.8 && r2 < 1.25 ? 1 : r2; }
        }
        a.pkgCount += q * ratio;
        continue;
      }
      if (f) {
        const g = toGrams({ ...ing, qty: q, qtyMax: null }, 1);
        if (g != null) { a.grams += g; continue; }
      }
      if (u && u.dim === "mass") a.mass += q * u.f;
      else if (u && u.dim === "vol") a.vol += q * u.f;
      else {
        const cu = ing.unit || "";
        a.counts[cu] = (a.counts[cu] || 0) + q;
      }
    }
  }

  return [...acc.values()].map(a => { const amount = amountText(a); return { ...a, sources: [...a.sources], amount }; });
}

function ceilTo(n, step) { return Math.ceil(n / step - 1e-6) * step; }

// Builds the shopping amount text and sets a.cost (what you'd pay at the store, whole packages).
function amountText(a) {
  const f = a.food;
  const parts = [];
  const pg = perGram(f);
  a.cost = null;
  if (f && f.pkg && (a.pkgCount || a.grams)) {
    const n = Math.max(1, Math.ceil(a.pkgCount + a.grams / f.pkg.g - 0.05));
    const pp = packagePrice(f);
    if (pp != null) a.cost = n * pp;
    const label = pluralize(f.pkg.label, n);
    parts.push(`${n} ${label}${f.pkg.desc ? ` (${f.pkg.desc})` : ""}`);
  } else if (f && a.grams) {
    if (f.gEach && (f.aisle === "produce" || f.aisle === "bakery" || f.name === "eggs")) {
      const n = Math.max(1, Math.ceil(a.grams / f.gEach - 0.1));
      const ep = eachPrice(f);
      if (ep != null) a.cost = n * ep;
      parts.push(String(n));
    } else if (f.liquid) {
      const v = usVolume(a.grams / (f.gCup ? f.gCup / 236.588 : 1));
      if (pg != null) a.cost = a.grams * pg;
      parts.push(`${fmtQty(ceilTo(v.qty, 0.25))} ${unitLabel(v.unit, v.qty)}`);
    } else {
      const m = usMass(a.grams);
      const q = m.unit === "lb" ? ceilTo(m.qty, 0.25) : Math.ceil(m.qty);
      if (pg != null) a.cost = (m.unit === "lb" ? q * 453.592 : Math.min(q, 16) * 28.3495) * pg;
      parts.push(m.unit === "oz" && q >= 16 ? "1 lb" : `${fmtQty(q)} ${m.unit}`);
    }
  }
  if (a.mass) { const m = usMass(a.mass); parts.push(`${fmtQty(m.unit === "lb" ? ceilTo(m.qty, 0.25) : Math.ceil(m.qty))} ${m.unit}`); }
  if (a.vol) { const v = usVolume(a.vol); parts.push(`${fmtQty(ceilTo(v.qty, 0.25))} ${unitLabel(v.unit, v.qty)}`); }
  for (const [u, n] of Object.entries(a.counts)) {
    const q = Math.ceil(n - 0.05);
    parts.push(u ? `${q} ${unitLabel(u, q)}` : String(q));
  }
  return parts.join(" + ");
}

/**
 * Split built items into UI sections using pantry memory.
 *   ask:  pantry/specialty items we've never asked about
 *   buy:  items to buy (grouped by aisle in the UI)
 *   have: items you have on hand (staples + remembered)
 */
export function sectionize(weekKey) {
  const s = store.get();
  const g = store.groceryState(weekKey);
  const items = buildList(weekKey).filter(i => !g.hidden[i.key]);
  const ask = [], buy = [], have = [];
  for (const it of items) {
    // Your edits for this week (name / amount / note) override the automatic values.
    const ed = g.edits?.[it.key];
    if (ed) {
      if (ed.name) it.name = ed.name;
      if (ed.amount != null) it.amount = ed.amount;
      it.note = ed.note || "";
      it.edited = true;
    }
    const kind = it.food ? it.food.kind : "F";
    const p = s.pantry[it.key];
    it.checked = !!g.checked[it.key];
    it.kind = kind;
    it.aisle = it.food ? it.food.aisle : "other";
    if (it.checked) { buy.push(it); continue; }
    if (p === true) { have.push(it); continue; }
    if (kind === "P" && p === undefined) { ask.push(it); continue; }
    if (kind === "S" && p !== false) { have.push(it); continue; }
    buy.push(it);
  }
  return { ask, buy, have, extras: g.extras };
}

export function listAsText(weekKey, sections) {
  const lines = [];
  for (const it of sections.buy.filter(i => !i.checked)) lines.push(`☐ ${it.name}${it.amount ? " — " + it.amount : ""}${it.note ? ` (${it.note})` : ""}`);
  for (const e of sections.extras.filter(e => !e.checked)) lines.push(`☐ ${e.text}`);
  return lines.join("\n");
}
