// The household list: things you add yourself (paper towels, cat litter, "2 lb chicken thighs"). It's
// one ongoing list, shown with whichever week's recipe groceries you're looking at, so it never
// disappears when the week changes. Bought items leave it when you tap Done shopping.
// Syncs as a field-merged record, one field per item: { text, checked, at, by, cb (checked by) }.
import * as store from "./store.js";
import { uid, weekKey } from "./util.js";
import { parseAdd, mergeAdd } from "./quickadd.js";

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
// Changing what an item says puts it back on the list: an edit means you still want it. (So if the other
// phone tapped Done shopping meanwhile, the later of the two wins: an earlier edit is cleared with the
// bought items, a later one brings the item back where you can see it, never hidden in the cart.)
export function edit(id, text) {
  const h = all()[id];
  if (!h) return;
  const { cb, ...rest } = h;
  all()[id] = { ...rest, text: String(text).trim(), checked: false };
}

/**
 * Two phones adding the same thing before they sync ("milk" and "1 gallon milk") leave two lines.
 * Merge lines that are the same item into the earliest one (by time added, then id), combining amounts
 * in that order; it stays checked only if every copy was. Every phone computes the same result, so
 * their changes agree. Returns how many lines were merged away.
 */
export function mergeDuplicates() {
  const groups = new Map();
  for (const h of items()) {
    const k = parseAdd(h.text)?.key;
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(h);
  }
  let merged = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const [keep, ...rest] = list; // items() is sorted by time added, then id
    const text = rest.reduce((t, h) => mergeAdd(t, parseAdd(h.text)), keep.text);
    const checked = list.every(h => h.checked);
    const { id, cb, ...base } = keep;
    all()[id] = { ...base, text, checked, ...(checked && cb ? { cb } : {}) };
    for (const h of rest) { delete all()[h.id]; merged++; }
  }
  return merged;
}
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
