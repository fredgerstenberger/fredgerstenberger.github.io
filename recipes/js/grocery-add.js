// Adding something to the grocery list (the add box, quick chips and ?add= links all come here).
// Something already on the list joins its line instead of repeating. That only happens when it is
// the same item, never a longer name that contains it (see parseAdd): adding "salt and vinegar chips"
// leaves white vinegar, your pantry answers and every other line exactly as they were.
import * as store from "./store.js";
import { sectionize } from "./grocery.js";
import { parseAdd, mergeAdd, noteAdded } from "./quickadd.js";
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
  const fromRecipes = [...sec.buy, ...sec.ask, ...sec.have].find(i => i.key === p.key) || (g.hidden[p.key] ? { key: p.key, hiddenOnly: true } : null);
  const lines = [...house.items().map(h => ({ ...h, src: "house" })), ...g.extras.map(e => ({ ...e, src: "extra" }))];
  const line = lines.find(e => parseAdd(e.text)?.key === p.key);
  let result, amount = p.amount;
  if (fromRecipes) {
    delete g.hidden[p.key];
    delete g.checked[p.key];
    if (pantry[p.key] === true || sec.ask.some(i => i.key === p.key)) pantry[p.key] = false; // you need it after all
    if (p.amount && !fromRecipes.hiddenOnly) {
      const cur = (g.edits[p.key]?.amount ?? fromRecipes.amount ?? "").replace(/\s*\([^)]*\)/g, "");
      g.edits[p.key] = { ...(g.edits[p.key] || {}), amount: cur ? `${cur} + ${p.amount}` : p.amount };
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
