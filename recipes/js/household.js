// The household list: things you add yourself (paper towels, cat litter, "2 lb chicken thighs"). It's
// one ongoing list, shown with whichever week's recipe groceries you're looking at, so it never
// disappears when the week changes. Bought items leave it when you tap Done shopping.
// Syncs as a field-merged record, one field per item: { text, checked, at, by, cb (checked by) }.
import * as store from "./store.js";
import { uid, weekKey } from "./util.js";

const all = () => (store.get().household ||= {});
export const items = () => Object.entries(all()).map(([id, h]) => ({ id, ...h })).sort((a, b) => (a.at || 0) - (b.at || 0) || (a.id < b.id ? -1 : 1));
export const get = id => (all()[id] ? { id, ...all()[id] } : null);

export function add(text, by = "", id = uid(), at = Date.now()) {
  all()[id] = { text: String(text).trim(), checked: false, at, ...(by ? { by } : {}) };
  return id;
}
export function update(id, fields) { const h = all()[id]; if (h) all()[id] = { ...h, ...fields }; }
export function setChecked(id, on, by = "") {
  const h = all()[id];
  if (!h) return;
  const next = { ...h, checked: on };
  if (on && by) next.cb = by; else delete next.cb;
  all()[id] = next;
}
export function remove(id) { delete all()[id]; }
// Bought items leave the list. Returns what was removed, so it can be put back (Undo).
export function clearChecked() {
  const gone = items().filter(h => h.checked);
  for (const h of gone) delete all()[h.id];
  return gone;
}
export function restore(list) { for (const { id, ...h } of list) all()[id] = h; }

// Items added to a week's list before the household list existed: unchecked ones from this week on
// move here (keeping their id, so two phones migrating at once end up with the same single item).
export function migrateWeekExtras(now = new Date()) {
  const s = store.get(), thisWeek = weekKey(now);
  let moved = 0;
  for (const [wk, g] of Object.entries(s.grocery || {})) {
    if (wk < thisWeek || !g.extras?.length) continue;
    const keep = [];
    for (const e of g.extras) {
      if (e.checked) { keep.push(e); continue; }
      if (!all()[e.id]) all()[e.id] = { text: e.text, checked: false, at: e.at ?? Date.now(), ...(e.by ? { by: e.by } : {}) };
      moved++;
    }
    if (keep.length !== g.extras.length) g.extras = keep;
  }
  if (moved) store.save();
  return moved;
}
