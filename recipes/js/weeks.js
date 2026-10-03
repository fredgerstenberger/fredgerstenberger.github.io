// Changing the shopping & prep day changes which 7 days make a week, and so every week's key (the date of
// its first day). This moves what's stored under keys that no longer start a week: each meal goes to the
// week of its days (a meal whose leftovers now fall in two weeks becomes two meals), and a week's grocery
// list and the things added to it go to the week holding most of its days.
// It looks only at the data (a key is out of place when it isn't on the week's first weekday), so it's
// safe to run on both phones, any number of times: what one phone moves, the other finds already moved.
import * as store from "./store.js";
import { weekKey, parseWeekKey, addDays, dayDate } from "./util.js";
import * as house from "./household.js";

const misplaced = k => weekKey(parseWeekKey(k)) !== k;
// The new week holding most of an old week's days (its 4th day is always in it).
const majority = k => weekKey(addDays(parseWeekKey(k), 3));
const emptyGrocery = () => ({ checked: {}, extras: [], hidden: {} });
const hasGrocery = g => g && (["checked", "hidden", "edits", "checkedBy"].some(f => Object.keys(g[f] || {}).length) || g.extras?.length || g.carry);

/** Move everything out of keys that don't start a week. Returns how many things moved (0: nothing to do). */
export function alignWeeks() {
  const s = store.get();
  let n = 0;
  for (const [k, wk] of Object.entries(s.plan || {})) {
    if (!misplaced(k) || !wk.meals?.length) continue;
    for (const m of wk.meals) {
      const byWeek = new Map();
      for (const sl of m.slots || []) {
        const nk = weekKey(dayDate(k, sl.split("-")[0]));
        if (!byWeek.has(nk)) byWeek.set(nk, []);
        byWeek.get(nk).push(sl);
      }
      [...byWeek].sort(([a], [b]) => (a < b ? -1 : 1)).forEach(([nk, slots], i) => {
        const id = i ? `${m.id}-${nk}` : m.id; // the same id on every phone
        const dest = store.editWeek(nk);
        if (!dest.meals.some(x => x.id === id)) dest.meals.push({ ...m, id, slots });
      });
      n++;
    }
    s.plan[k] = { ...wk, meals: [] };
  }
  for (const [k, g] of Object.entries(s.grocery || {})) {
    if (!misplaced(k) || !hasGrocery(g)) continue;
    const nk = majority(k), dest = store.groceryState(nk);
    for (const f of ["checked", "hidden", "edits", "checkedBy"]) dest[f] = { ...(g[f] || {}), ...(dest[f] || {}) };
    const ids = new Set((dest.extras || []).map(e => e.id));
    dest.extras = [...(dest.extras || []), ...(g.extras || []).filter(e => !ids.has(e.id))];
    if (g.carry && !dest.carry) dest.carry = g.carry;
    s.grocery[k] = emptyGrocery();
    n++;
  }
  for (const h of house.items()) {
    if (h.wk && misplaced(h.wk)) { house.moveTo([h.id], majority(h.wk)); n++; }
  }
  return n;
}
