// Field-by-field merging for records two people edit at the same time: recipes, each week's meal plan
// and grocery list, the pantry, your prices, your ingredient info and settings.
//
// Such a record's synced value carries `_ft`: { field: [time, fingerprint] }, saying when each field
// last changed and what it changed to (a removed field keeps a "tombstone" entry). Two copies merge
// one field at a time and the newer edit of each field wins, so checking "eggs" on one phone never
// undoes "milk" checked on another.
//
// Older app versions don't know about `_ft`; they copy it along unchanged and edit the fields around
// it. A field whose value no longer matches its fingerprint was edited by such an app, so it counts
// as edited at the time of that whole record (how everything synced before).

export const FT = "_ft";
const MAPS = ["pantry", "prices", "settings", "foods", "asked", "history", "stores", "household"];

export const isFieldRecord = k => k.startsWith("r:") || k.startsWith("g:") || k.startsWith("p:") || MAPS.includes(k);

// Recipes merge per top-level field (title, rating, notes, tags, ingredients, steps, …; lists like
// ingredients count as one field, so the last edit of the list wins). Deleting a recipe is still a
// whole-record delete, which older app versions understand: whichever is later wins, the delete or
// an edit on another phone; on an exact tie the delete wins (see sync.js mergeIn).
export const isDeletable = k => k.startsWith("r:");
// Each person's rating is its own field ("ratings|n:emma"), so two people rating at once both count.

// Meal plans: each meal's properties are separate fields ("m|<meal id>|servings"), so one person
// changing servings and the other moving the meal both stick. A meal is only kept while it has
// both a recipe and at least one slot; removing a meal clears those, so a removal wins over a
// concurrent edit of the same meal's servings.
function planFields(v, out) {
  for (const m of v.meals || []) {
    if (!m || !m.id) continue;
    for (const [p, x] of Object.entries(m)) if (p !== "id" && x != null) out[`m|${m.id}|${p}`] = x;
  }
  for (const [p, x] of Object.entries(v)) if (p !== "meals" && p !== FT && x != null) out["w|" + p] = x;
  return out;
}
function planFromFields(fields) {
  const week = {}, meals = {};
  for (const [f, x] of Object.entries(fields)) {
    const [kind, id, prop] = f.split("|");
    if (kind === "w") week[id] = x;
    else if (kind === "m" && prop) (meals[id] ||= { id })[prop] = x;
  }
  week.meals = Object.values(meals)
    .filter(m => m.rid && Array.isArray(m.slots) && m.slots.length)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return week;
}

// JSON with sorted keys, so the same data always fingerprints the same on every device.
export function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}

// Short, fast fingerprint (to notice edits without storing copies).
export function fp(v) { return hash(stable(v)); }
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const GONE = fp(null);

// A grocery week { checked, checkedBy, hidden, edits, extras[] } as flat fields: "c|eggs", "b|eggs", "x|<extra id>", …
// Other records are already flat maps (pantry item → yes/no, setting → value).
export function toFields(k, v) {
  const out = {};
  if (!v || typeof v !== "object") return out;
  if (k.startsWith("p:")) return planFields(v, out);
  if (k.startsWith("r:")) {
    for (const [f, x] of Object.entries(v)) {
      if (f === FT || x == null) continue;
      if (f === "ratings" && typeof x === "object") { for (const [who, n] of Object.entries(x)) if (n) out["ratings|" + who] = n; }
      else out[f] = x;
    }
    return out;
  }
  if (k.startsWith("g:")) {
    for (const [i, on] of Object.entries(v.checked || {})) if (on) out["c|" + i] = true;
    // Who checked an item (v18+). Older versions drop these fields; the check itself is kept.
    for (const [i, who] of Object.entries(v.checkedBy || {})) if (who && v.checked?.[i]) out["b|" + i] = who;
    for (const [i, on] of Object.entries(v.hidden || {})) if (on) out["h|" + i] = true;
    for (const [i, e] of Object.entries(v.edits || {})) if (e) out["e|" + i] = e;
    (v.extras || []).forEach((e, n) => { if (e?.id) out["x|" + e.id] = { text: e.text, checked: !!e.checked, at: e.at ?? n, ...(e.by ? { by: e.by } : {}) }; });
    return out;
  }
  for (const [f, x] of Object.entries(v)) if (f !== FT && x != null) out[f] = x;
  return out;
}

export function fromFields(k, fields) {
  if (k.startsWith("p:")) return planFromFields(fields);
  if (k.startsWith("r:")) {
    const r = {};
    for (const [f, x] of Object.entries(fields)) {
      if (f.startsWith("ratings|")) (r.ratings ||= {})[f.slice(8)] = x;
      else r[f] = x;
    }
    return r;
  }
  if (!k.startsWith("g:")) return { ...fields };
  const g = { checked: {}, extras: [], hidden: {}, edits: {} };
  for (const [f, x] of Object.entries(fields)) {
    const i = f.indexOf("|"), kind = f.slice(0, i), id = f.slice(i + 1);
    if (kind === "c") g.checked[id] = true;
    else if (kind === "h") g.hidden[id] = true;
    else if (kind === "e") g.edits[id] = x;
    else if (kind === "x") g.extras.push({ id, ...x });
    else if (kind === "b") (g.checkedBy ||= {})[id] = x;
  }
  g.extras.sort((a, b) => (a.at - b.at) || (a.id < b.id ? -1 : 1));
  return g;
}

// Note edits: give every field whose value differs from its fingerprint the time `now`, and always
// later than that field's previous edit (so an edit beats the value it replaced even within the same
// millisecond, or when this phone's clock is behind). Returns true if anything changed.
export function stampFields(times, fields, now) {
  let changed = false;
  const at = f => (times[f] && times[f][0] >= now ? times[f][0] + 1 : now);
  for (const [f, x] of Object.entries(fields)) {
    const h = fp(x);
    if (!times[f] || times[f][1] !== h) { times[f] = [at(f), h]; changed = true; }
  }
  for (const f of Object.keys(times)) {
    if (!(f in fields) && times[f][1] !== GONE) { times[f] = [at(f), GONE]; changed = true; }
  }
  return changed;
}

// When a field was last edited, judging by its value and fingerprint (see the note at the top).
function fieldTime(fields, times, f, recordTime) {
  const v = f in fields ? fields[f] : undefined;
  const h = fp(v ?? null);
  const t = times[f];
  if (t && t[1] === h) return { v, h, t: t[0] };
  if (v !== undefined || t) return { v, h, t: recordTime };
  return { v, h, t: -Infinity };
}

// The most recent edit time of any field in a copy of a record (-Infinity if it has none).
export function latestEdit(fields, times, recordTime) {
  let t = -Infinity;
  for (const f of new Set([...Object.keys(fields), ...Object.keys(times)])) t = Math.max(t, fieldTime(fields, times, f, recordTime).t);
  return t;
}

/**
 * Merge two copies of a record field by field.
 * local: { fields, times, u }   incoming: { fields, times, u }
 * Returns { fields, times, sameAsIncoming }.
 */
export function mergeFields(local, incoming) {
  const fields = {}, times = {};
  const keys = new Set([...Object.keys(local.fields), ...Object.keys(local.times), ...Object.keys(incoming.fields), ...Object.keys(incoming.times)]);
  for (const f of keys) {
    const a = fieldTime(local.fields, local.times, f, local.u);
    const b = fieldTime(incoming.fields, incoming.times, f, incoming.u);
    // Newer edit wins; on an exact tie pick by fingerprint so every device picks the same one.
    const w = b.t > a.t || (b.t === a.t && b.h > a.h) ? b : a;
    if (w.v !== undefined) fields[f] = w.v;
    if (w.t !== -Infinity) times[f] = [w.t, w.h];
  }
  const sameAsIncoming = stable(fields) === stable(incoming.fields) && stable(times) === stable(incoming.times);
  return { fields, times, sameAsIncoming };
}
