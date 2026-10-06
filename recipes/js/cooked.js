// Cooked meals: a planned meal (one batch of a recipe) is marked made when you say so: "Done cooking? Yes"
// after cook mode, or Mark as cooked on the meal in the week's plan. It's kept on the meal (meal.made, when),
// so it syncs like the rest of the plan and shows on both phones: a small check on Today and in the week.
import * as store from "./store.js";
import { weekKey, planningWeekKey, dayDate, startOfDay, MEALS } from "./util.js";

export const isCooked = m => !!m?.made;
const planned = key => (store.week(key).meals || []).filter(m => store.recipe(m.rid));
const slotTime = (key, slot) => { const [d, m] = slot.split("-"); return dayDate(key, d).getTime() + MEALS.indexOf(m); };
/** The slot a batch is cooked in: its first (later ones are leftovers). */
export const cookSlot = (key, m) => [...(m.slots || [])].sort((a, b) => slotTime(key, a) - slotTime(key, b))[0];

/** Mark a planned meal cooked (or not). Returns the meal, or null if it's no longer planned. */
export function setCooked(key, mealId, on = true) {
  const m = (store.week(key).meals || []).find(x => x.id === mealId);
  if (!m) return null;
  if (on) m.made = Date.now(); else delete m.made;
  store.save();
  return m;
}

/**
 * The planned batch that cooking this recipe now most likely is: this week's or the week being planned, not
 * already marked, cooked within 2 days of today, nearest first. null if none (then there's nothing to ask).
 */
export function plannedBatch(rid, now = new Date()) {
  const today = startOfDay(now).getTime();
  let best = null;
  for (const key of new Set([weekKey(now), planningWeekKey(now)])) {
    for (const m of planned(key)) {
      if (m.rid !== rid || !m.slots?.length || isCooked(m)) continue;
      const slot = cookSlot(key, m);
      const dist = Math.abs(dayDate(key, slot.split("-")[0]).getTime() - today) / 86400000;
      if (dist <= 2 && (!best || dist < best.dist)) best = { key, meal: m, slot, dist };
    }
  }
  return best;
}
