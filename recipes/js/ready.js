// Store-bought meals (a Trader Joe's lunch, a frozen pizza): planned like recipes, but bought ready to eat.
// One is kept as a recipe with a `ready` field ({ store, price per package }), servings per package as its yield
// and per-serving nutrition from the package label, so it plans, syncs and backs up like any recipe. Its one
// ingredient line ("1 package Chicken Tikka Masala") keeps older app versions showing something sensible.
import { uid } from "./util.js";

export const READY_AISLE = "prepared";
export const isReady = r => !!(r && r.ready && typeof r.ready === "object");

const num = v => { const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(x) && x >= 0 ? x : null; };
const text = (v, max = 80) => String(v ?? "").trim().slice(0, max);

/**
 * The recipe record for a store-bought meal, from the form's values. `existing` keeps its id, created time,
 * ratings, notes and anything else it had. meals: tags like "lunch". nu: per serving { kcal, protein, carbs,
 * fat, fiber, serving } from the label, or null.
 */
export function readyRecord({ title, store = "", price = null, servings = 1, meals = [], nu = null }, existing = null) {
  const name = text(title, 120);
  if (!name) return null;
  const per = Math.max(1, Math.round(num(servings) || 1));
  const r = { ...(existing || {}) };
  r.id = existing?.id || uid();
  r.title = name;
  r.yield = per;
  r.ready = { store: text(store, 40), price: num(price) };
  r.ingredients = [`1 package ${name}`];
  r.steps = [];
  r.tags = [...new Set([...(existing?.tags || []).filter(t => !["breakfast", "lunch", "dinner", "store-bought"].includes(t)), ...meals, "store-bought"])];
  const n = nu && num(nu.kcal) != null ? {
    kcal: num(nu.kcal), protein: num(nu.protein), carbs: num(nu.carbs), fat: num(nu.fat), fiber: num(nu.fiber),
    ...(nu.serving ? { serving: text(nu.serving, 60) } : {}), source: "label"
  } : null;
  if (n) r.nutrition = n; else delete r.nutrition;
  delete r.totalMin; delete r.url; delete r.site;
  return r;
}

/** Packages to buy for this many servings. */
export const readyPackages = (servings, perPkg) => Math.max(1, Math.ceil((num(servings) || 0) / Math.max(1, num(perPkg) || 1) - 0.01));

/** Cost of a store-bought meal: the package price over its servings. */
export function readyCost(r) {
  const price = num(r?.ready?.price), per = Math.max(1, num(r?.yield) || 1);
  if (price == null) return { total: 0, perServing: 0, coverage: 0, rows: [], servings: per };
  return { total: price, perServing: price / per, coverage: 1, rows: [{ line: r.ingredients?.[0] || r.title, food: null, cost: price }], servings: per };
}

/** Stores you've bought ready meals from, most used first (for the form's suggestions). */
export function readyStores(recipes) {
  const n = new Map();
  for (const r of recipes) if (isReady(r) && r.ready.store) n.set(r.ready.store, (n.get(r.ready.store) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}
