// Adding something to the grocery list (the add box, quick chips and ?add= links all come here).
// Something already on the list joins its line instead of repeating. That only happens when it is
// the same item, never a longer name that contains it (see parseAdd): adding "salt and vinegar chips"
// leaves white vinegar, your pantry answers and every other line exactly as they were.
import * as store from "./store.js";
import { sectionize } from "./grocery.js";
import { parseAdd, mergeAdd, noteAdded, varietyOf } from "./quickadd.js";
import { parseIngredient } from "./ingredients.js";

const sameWords = (a, b) => a.length === b.length && a.every((w, i) => w === b[i]);
import * as house from "./household.js";

/**
 * Add `text` to the list shown for `week`. Returns { p, result, amount } where result is:
 *   "recipe": it's already on the list from your recipes (brought back if removed or checked)
 *   "merged": it's already a line you added (amounts combined, unchecked)
 *   "added":  a new line on that week's list
 * The caller saves and redraws.
 */
export function addToList(week, text, by = "") {
  const p = parseAdd(text);
  if (!p) return null;
  const s = store.get(), g = store.groceryState(week), pantry = s.pantry, sec = sectionize(week);
  const history = (s.history ||= {});
  // A recipe line is the same item when it's the same food with the same variety words in every recipe
  // line behind it ("2% milk" joins a "2 cups 2% milk" line, not a plain "milk" or "skim milk" one).
  // A line you renamed ("2% milk" after Use for recipe) is judged by its new name.
  const names = i => g.edits[i.key]?.name ? [g.edits[i.key].name] : i.lines.map(l => parseIngredient(l.line)?.name);
  const same = i => i.key === p.key || (p.known && i.food?.name === p.food && names(i).every(n => sameWords(varietyOf(n, i.food), p.variety)));
  const fromRecipes = [...sec.buy, ...sec.ask, ...sec.have].find(same) || (g.hidden[p.key] ? { key: p.key, hiddenOnly: true } : null);
  const lines = [...house.inWeek(week).map(h => ({ ...h, src: "house" })), ...g.extras.map(e => ({ ...e, src: "extra" }))];
  const line = lines.find(e => parseAdd(e.text)?.key === p.key);
  let result, amount = p.amount;
  if (fromRecipes) {
    const rk = fromRecipes.key;
    delete g.hidden[rk];
    delete g.checked[rk];
    const pk = fromRecipes.pantryKey ?? rk;
    if (pantry[pk] === true || sec.ask.some(i => i.key === rk)) pantry[pk] = false; // you need it after all
    if (p.amount && !fromRecipes.hiddenOnly) {
      const cur = (g.edits[rk]?.amount ?? fromRecipes.amount ?? "").replace(/\s*\([^)]*\)/g, "");
      g.edits[rk] = { ...(g.edits[rk] || {}), amount: cur ? `${cur} + ${p.amount}` : p.amount };
    }
    result = "recipe";
  } else if (line) {
    const merged = mergeAdd(line.text, p);
    if (line.src === "house") { house.update(line.id, { text: merged }); house.setChecked(line.id, false); }
    else { const x = g.extras.find(e => e.id === line.id); x.text = merged; x.checked = false; }
    result = "merged"; amount = parseAdd(merged).amount;
  } else {
    const id = house.add(text, by, undefined, undefined, week);
    result = "added";
    // Same food as a recipe line still to buy (or to ask about), but a different variety: "2% milk" while
    // a recipe needs "milk". They stay two lines; the caller can offer to use this one for the recipe.
    const related = p.known && [...sec.buy, ...sec.ask].find(i => i.food?.name === p.food && i.key !== p.key && !i.checked);
    noteAdded(history, p);
    return { p, result, amount, id, related: related ? { key: related.key, name: related.name } : null };
  }
  noteAdded(history, p);
  return { p, result, amount };
}

/**
 * "Use for recipe": fold the line just added (household id) into the recipe line `recipeKey`. The recipe
 * line takes the name you typed ("2% milk") and any amount you typed is added to it; your line goes.
 * Returns a function that puts everything back (Undo), or null if either line is gone.
 */
export function useForRecipe(week, id, recipeKey) {
  const h = house.get(id);
  const g = store.groceryState(week), pantry = store.get().pantry;
  const item = sectionize(week);
  const it = [...item.buy, ...item.ask].find(i => i.key === recipeKey);
  if (!h || !it) return null;
  const p = parseAdd(h.text), pk = it.pantryKey ?? recipeKey; // pantry answers are per food
  const before = { edit: g.edits[recipeKey], checked: g.checked[recipeKey], pantry: pantry[pk] };
  const cur = (g.edits[recipeKey]?.amount ?? it.amount ?? "").replace(/\s*\([^)]*\)/g, "");
  g.edits[recipeKey] = { ...(g.edits[recipeKey] || {}), name: p.name.toLowerCase(), ...(p.amount ? { amount: cur ? `${cur} + ${p.amount}` : p.amount } : {}) };
  delete g.checked[recipeKey];
  if (pantry[pk] === true || item.ask.some(i => i.key === recipeKey)) pantry[pk] = false; // you need it
  house.remove(id);
  return () => {
    house.restore([h]);
    if (before.edit) g.edits[recipeKey] = before.edit; else delete g.edits[recipeKey];
    if (before.checked) g.checked[recipeKey] = true;
    if (before.pantry === undefined) delete pantry[pk]; else pantry[pk] = before.pantry;
  };
}
