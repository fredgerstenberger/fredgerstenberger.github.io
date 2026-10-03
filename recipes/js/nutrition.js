// Nutrition: use the site's numbers when published, otherwise estimate from ingredients.
import { parseIngredient, toGrams, cleanName, parseRecipe } from "./ingredients.js";
import { dataVersion } from "./data.js";
import { foodsVersion } from "./store.js";

const cache = new Map();

export function servingsOf(recipe) {
  return recipe.yield && recipe.yield > 0 ? recipe.yield : 4;
}

// Where an ingredient's numbers come from: a label you added, your own numbers, USDA, the built-in table,
// or the table's numbers standing in for a specific product ("protein pasta" using pasta).
export function sourceOf(f) {
  if (!f || !f.nu) return "none";
  if (f.label) return "label";
  if (f.yours || f.custom) return "yours";
  if (f.usda) return "usda";
  if (f.standIn) return "standin";
  return "table";
}

export function estimate(recipe) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const rows = [];
  let counted = 0, covered = 0;
  for (const { line, ing } of parseRecipe(recipe)) {
    if (!ing || ing.header) continue;
    if (ing.food && ing.food.kind === "X") continue; // water
    counted++;
    const g = toGrams(ing);
    if (ing.food?.nu && g != null) {
      if (!ing.food.standIn) covered++; // a stand-in (protein pasta on pasta's numbers) isn't really known
      const k = g / 100;
      const f = ing.food;
      const row = { line, food: f.name, key: f.infoKey || f.name, grams: g, usda: f.usda?.description || "", mine: (!!f.custom && !!f.nu) || !!f.yours,
        standIn: !!f.standIn, label: f.label || null, source: sourceOf(f) };
      for (const key of Object.keys(totals)) {
        const v = ing.food.nu[key] * k;
        totals[key] += v;
        row[key] = v;
      }
      rows.push(row);
    } else if (ing.food && ing.qty == null) {
      covered++; // "salt to taste" – negligible, still understood
      rows.push({ line, food: ing.food.name, grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
    } else {
      // Not counted. Its weight, when the amount says it, shows how much of the recipe it is.
      rows.push({ line, food: null, grams: g ?? null, key: ing.food?.infoKey || cleanName(ing.name), source: "none" });
    }
  }
  // Each ingredient's share of the recipe's calories or protein (whichever is bigger), for ranking.
  for (const row of rows) row.share = Math.max(totals.kcal ? (row.kcal || 0) / totals.kcal : 0, totals.protein ? (row.protein || 0) / totals.protein : 0);
  const s = servingsOf(recipe);
  const per = {};
  for (const [k, v] of Object.entries(totals)) per[k] = v / s;
  return { ...per, source: "estimate", coverage: counted ? covered / counted : 0, rows, servings: s, assumedServings: !recipe.yield };
}

export function nutritionFor(recipe) {
  const key = recipe.id + ":" + (recipe.updated || 0) + ":" + dataVersion() + ":" + foodsVersion();
  if (cache.has(key)) return cache.get(key);
  let out;
  const site = recipe.nutrition;
  if (site && site.kcal != null) {
    const est = estimate(recipe);
    out = {
      kcal: site.kcal,
      protein: site.protein ?? est.protein,
      carbs: site.carbs ?? est.carbs,
      fat: site.fat ?? est.fat,
      fiber: site.fiber ?? est.fiber,
      sugar: site.sugar, sodium: site.sodium,
      serving: site.serving,
      source: "site", rows: est.rows, coverage: 1, servings: servingsOf(recipe)
    };
  } else {
    out = estimate(recipe);
  }
  cache.set(key, out);
  return out;
}
