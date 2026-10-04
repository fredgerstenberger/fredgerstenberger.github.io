// Fast adding to the grocery list: "2 lb chicken thighs" → amount "2 lb", item "chicken thighs",
// aisle Meat. Suggestions come from your own past items (most often added first) and the built-in
// food table. Added items are stored as the text you typed and read again here when shown, so older
// app versions (which only know the text) keep working.
import { parseIngredient, cleanName, displayAmount, fmtQty, unitLabel, UNITS } from "./ingredients.js";
import { FOODS, FOOD_BY_NAME, matchFoodDetail } from "./fooddb.js";
import { singular } from "./grocery.js";

const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);

/** { name, amount, key, aisle, qty, unit } for something typed into the add box. */
/**
 * { name, amount, key, aisle, qty, unit, size, known, food, variety } for something typed into the add box.
 * An item is only treated as a food from the table ("known", keyed by that food) when its name is that
 * food give or take describing words: "2 lb chicken thighs", "3 avocados", "organic 2% milk". A longer
 * name that merely contains a food is its own item ("ice cream", "garlic bread", "salt and vinegar
 * chips"), keyed by its own name, so it never merges into or changes another line; a food at the end
 * of its name still suggests the aisle ("string cheese" → Dairy).
 */
// Which words make a different product (oat vs almond milk, 2% vs skim, a brand) lives in variants.js,
// shared with nutrition.
export { varietyOf } from "./variants.js";
import { varietyOf, onlyVarietyWords } from "./variants.js";

export function parseAdd(text) {
  const raw = String(text || "").trim().replace(/\s+/g, " ");
  if (!raw) return null;
  // "2% milk", "1% milk": the percentage is part of the name, not an amount.
  const ing = /^\d+(\.\d+)?\s*%/.test(raw) ? { name: raw, display: raw, qty: null } : parseIngredient(raw);
  if (!ing || ing.header) return { name: cap1(raw), amount: "", key: raw.toLowerCase(), aisle: null, qty: null, unit: null, known: false };
  const nameText = (ing.display || ing.name || raw).replace(/^[\s,.-]+|[\s,.-]+$/g, "") || raw;
  const own = singular(cleanName(ing.name) || nameText.toLowerCase());
  const m = matchFoodDetail(ing.name || raw);
  // Your own food info or a USDA match (not in the table) is keyed by the cleaned name already.
  const extra = ing.food && !FOOD_BY_NAME[ing.food.name] ? ing.food : null;
  // A specific product of a food ("protein pasta", "Barilla penne") is that food too, with its variety words.
  const known = (m?.fit === "exact" || (m?.fit === "head" && onlyVarietyWords(ing.name || raw, m.food, m.alias))) && m.food.kind !== "X" && !m.food.variants.has(m.alias);
  const variety = known ? varietyOf(ing.name || raw, m.food) : [];
  const key = known ? (variety.length ? `${m.food.name} (${variety.join(" ")})` : m.food.name) : own;
  const aisle = m && m.fit !== "loose" && m.food.kind !== "X" ? m.food.aisle : extra?.aisle || null;
  const qty = ing.qty;
  const amount = qty != null ? displayAmount(ing) : "";
  return { name: cap1(nameText), amount, key, aisle, qty, unit: ing.unit, size: ing.size || null, known, food: known ? m.food.name : null, variety };
}

/** Text for an amount plus a name, as it would be typed ("4 eggs", "2 lb chicken thighs"). */
export function addText(qty, unit, name) {
  if (qty == null) return name;
  return `${fmtQty(qty)}${unit ? " " + unitLabel(unit, qty) : ""} ${name}`;
}

/**
 * Combine an item already on the list with one being added (same item).
 * Same unit (or both plain counts): amounts add up. Otherwise the amounts are joined ("1 bag + 2 lb").
 * Returns the new text for the list line.
 */
export function mergeAdd(existingText, added) {
  const a = parseAdd(existingText);
  if (!a || added.qty == null) return existingText;
  if (a.qty == null) return addText(added.qty, added.unit, a.name.toLowerCase());
  const sameDim = a.unit === added.unit || (a.unit && added.unit && UNITS[a.unit]?.dim === UNITS[added.unit]?.dim && UNITS[a.unit].dim !== "count");
  if (sameDim && !a.size && !added.size) {
    const q = a.unit === added.unit ? a.qty + added.qty : a.qty + added.qty * UNITS[added.unit].f / UNITS[a.unit].f;
    return addText(q, a.unit, a.name.toLowerCase());
  }
  return `${existingText} + ${added.amount}`;
}

/** Remember that something was added (history is a synced map: key → { name, n, last, aisle }). */
export function noteAdded(history, p, now = Date.now()) {
  const h = history[p.key] || { name: p.name, n: 0 };
  history[p.key] = { name: h.name || p.name, n: (h.n || 0) + 1, last: now, ...(p.aisle ? { aisle: p.aisle } : {}) };
}

/**
 * Remember that something was bought (Done shopping): b = times bought, bought = when. History is a
 * hint, so if two phones update the same item at the same moment and one count is lost, that's fine.
 */
export function noteBought(history, { key, name, aisle }, now = Date.now()) {
  if (!key) return;
  const h = history[key] || { name, n: 0 };
  history[key] = { ...h, name: h.name || name, b: (h.b || 0) + 1, bought: now, ...(aisle && !h.aisle ? { aisle } : {}) };
}

const STARTERS = ["Milk", "Eggs", "Bread", "Bananas", "Coffee", "Butter"];

/** Quick-add chips: your most frequent items that aren't on the list yet. */
export function frequentItems(history, onList = new Set(), limit = 6) {
  const mine = Object.entries(history || {})
    // An item resolves the way it would be added now (older history could key "garlic bread" as garlic).
    .filter(([k, h]) => h?.n > 0 && !onList.has(parseAdd(h.name)?.key ?? k))
    .sort((a, b) => b[1].n - a[1].n || (b[1].last || 0) - (a[1].last || 0))
    .map(([, h]) => cap1(h.name));
  for (const s of STARTERS) if (mine.length < limit && !mine.includes(s) && !onList.has(parseAdd(s).key)) mine.push(s);
  return mine.slice(0, limit);
}

/** Autocomplete for what's typed so far: your items first (most frequent), then the food table. */
export function suggest(text, history, onList = new Set(), limit = 5) {
  const p = parseAdd(text);
  const q = (p ? p.name : String(text || "")).toLowerCase().trim();
  if (q.length < 2) return [];
  const prefix = p && p.amount ? text.slice(0, text.toLowerCase().lastIndexOf(q.split(" ")[0])).trim() : "";
  const starts = s => s.startsWith(q) || s.split(/\s+/).some(w => w.startsWith(q));
  const seen = new Set(), out = [];
  const push = (key, name, n) => { if (seen.has(key) || onList.has(key)) return; seen.add(key); out.push({ key, name: cap1(name), n, text: (prefix ? prefix + " " : "") + name }); };
  Object.entries(history || {}).filter(([, h]) => h?.name && starts(h.name.toLowerCase()))
    .sort((a, b) => b[1].n - a[1].n).forEach(([k, h]) => push(k, h.name.toLowerCase(), h.n));
  for (const f of FOODS) {
    if (out.length >= limit * 3) break;
    const hit = f.aliases.find(a => starts(a.toLowerCase()));
    if (hit) push(f.name, f.name.toLowerCase().startsWith(q) || !starts(f.name) ? f.name : hit, 0);
  }
  return out.sort((a, b) => b.n - a.n || (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1) || a.name.length - b.name.length).slice(0, limit);
}
