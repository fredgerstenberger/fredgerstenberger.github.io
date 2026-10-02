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
 *   "added":  a new line on the household list
 * The caller saves and redraws.
 */
export function addToList(week, text, by = "") {
  const p = parseAdd(text);
  if (!p) return null;
  const s = store.get(), g = store.groceryState(week), pantry = s.pantry, sec = sectionize(week);
  const history = (s.history ||= {});
  // A recipe line is the same item when it's the same food with the same variety words in every recipe
  // line behind it ("2% milk" joins a "2 cups 2% milk" line, not a plain "milk" or "skim milk" one).
  const same = i => p.known ? i.key === p.food && i.lines.every(l => sameWords(varietyOf(parseIngredient(l.line)?.name, i.food), p.variety)) : i.key === p.key;
  const fromRecipes = [...sec.buy, ...sec.ask, ...sec.have].find(same) || (g.hidden[p.key] ? { key: p.key, hiddenOnly: true } : null);
  const lines = [...house.items().map(h => ({ ...h, src: "house" })), ...g.extras.map(e => ({ ...e, src: "extra" }))];
  const line = lines.find(e => parseAdd(e.text)?.key === p.key);
  let result, amount = p.amount;
  if (fromRecipes) {
    const rk = fromRecipes.key;
    delete g.hidden[rk];
    delete g.checked[rk];
    if (pantry[rk] === true || sec.ask.some(i => i.key === rk)) pantry[rk] = false; // you need it after all
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
    house.add(text, by);
    result = "added";
  }
  noteAdded(history, p);
  return { p, result, amount };
}
