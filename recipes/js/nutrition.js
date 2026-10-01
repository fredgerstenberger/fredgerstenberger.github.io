// Nutrition: use the site's numbers when published, otherwise estimate from ingredients.
import { parseIngredient, toGrams } from "./ingredients.js";
import { dataVersion } from "./data.js";

const cache = new Map();

export function servingsOf(recipe) {
  return recipe.yield && recipe.yield > 0 ? recipe.yield : 4;
}

export function estimate(recipe) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const rows = [];
  let counted = 0, covered = 0;
  for (const line of recipe.ingredients || []) {
    const ing = parseIngredient(line);
    if (!ing || ing.header) continue;
    if (ing.food && ing.food.kind === "X") continue; // water
    counted++;
    const g = toGrams(ing);
    if (ing.food?.nu && g != null) {
      covered++;
      const k = g / 100;
      const row = { line, food: ing.food.name, grams: g, usda: ing.food.usda?.description || "", mine: !!ing.food.custom && !!ing.food.nu };
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
      rows.push({ line, food: null, grams: null });
    }
  }
  const s = servingsOf(recipe);
  const per = {};
  for (const [k, v] of Object.entries(totals)) per[k] = v / s;
  return { ...per, source: "estimate", coverage: counted ? covered / counted : 0, rows, servings: s, assumedServings: !recipe.yield };
}

export function nutritionFor(recipe) {
  const key = recipe.id + ":" + (recipe.updated || 0) + ":" + dataVersion();
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
