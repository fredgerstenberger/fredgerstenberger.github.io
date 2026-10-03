// The things you add yourself (paper towels, cat litter, "2 lb chicken thighs"). Each belongs to a week's
// list (`wk`), so every week starts fresh; what wasn't checked off can be brought over to the next week
// (see leftovers / moveTo, and the question on the grocery list).
// Syncs as a field-merged record, one field per item: { text, checked, at, by, cb (checked by), wk }.
// Older app versions (v24 and earlier) ignore `wk` and keep it when they edit an item.
import * as store from "./store.js";
import { uid, weekKey, planningWeekKey, addDays, parseWeekKey } from "./util.js";
import { parseAdd, mergeAdd } from "./quickadd.js";

const all = () => (store.get().household ||= {});
export const items = () => Object.entries(all()).map(([id, h]) => ({ id, ...h })).sort((a, b) => (a.at || 0) - (b.at || 0) || (a.id < b.id ? -1 : 1));
export const get = id => (all()[id] ? { id, ...all()[id] } : null);

// Each new item is later than the newest one, so several added at once (a ?add= link) keep their order.
const nextAt = () => Math.max(Date.now(), ...Object.values(all()).map(h => (h.at || 0) + 1));
export function add(text, by = "", id = uid(), at = nextAt(), wk = null) {
  all()[id] = { text: String(text).trim(), checked: false, at, ...(by ? { by } : {}), ...(wk ? { wk } : {}) };
  return id;
}
/** The items on one week's list. */
export const inWeek = week => items().filter(h => h.wk === week);
/** What wasn't checked off on a week's list. */
export const leftovers = week => inWeek(week).filter(h => !h.checked);
/** Bring items over to another week's list. */
export function moveTo(ids, week) { for (const id of ids) if (all()[id]) all()[id] = { ...all()[id], wk: week }; }

// Items from before lists were weekly (no `wk`): what's still unchecked goes on this week's list, what was
// checked stays with the week it was added in. Returns how many changed.
export function assignWeeks(now = new Date()) {
  let n = 0;
  for (const [id, h] of Object.entries(all())) {
    if (h.wk) continue;
    all()[id] = { ...h, wk: h.checked ? weekKey(new Date(h.at || now)) : planningWeekKey(now) };
    n++;
  }
  return n;
}
// Lists more than 8 weeks old are deleted, so the household record stays small.
export function prune(now = new Date(), weeks = 8) {
  const oldest = weekKey(addDays(parseWeekKey(weekKey(now)), -7 * weeks));
  let n = 0;
  for (const [id, h] of Object.entries(all())) if (h.wk && h.wk < oldest) { delete all()[id]; n++; }
  return n;
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
// phone cleared checked items meanwhile, the later of the two wins: an earlier edit is cleared with the
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
    const g = `${h.wk || ""}|${k}`; // the same thing on two different weeks' lists stays two lines
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(h);
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
// Remove the checked items. Returns what was removed, so it can be put back (Undo).
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
      if (!all()[e.id]) all()[e.id] = { text: e.text, checked: false, at: e.at ?? Date.now(), ...(e.by ? { by: e.by } : {}), wk };
      moved++;
    }
    if (keep.length !== g.extras.length) g.extras = keep;
  }
  if (moved) store.save();
  return moved;
}
