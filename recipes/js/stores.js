// Stores and their aisle order. The stores sync between your phones (one field per store, so two
// people editing different stores never clash); which store you're shopping at stays on this phone.
import * as store from "./store.js";
import { AISLES } from "./fooddb.js";
import { uid } from "./util.js";

const PICK = "rb.store";
export const ALL_AISLES = [["home", "Added items"], ...AISLES];
// "Any store", and where a new store starts: fresh food first, then the packaged aisles, and frozen
// last so it stays cold. Things you added with no known aisle come first, so they aren't missed.
export const DEFAULT_ORDER = ["home", "produce", "dairy", "meat", "seafood", "bakery", "dry", "canned", "baking", "condiments", "spices", "other", "frozen"];
export const aisleLabel = id => (ALL_AISLES.find(a => a[0] === id) || [id, id])[1];

const all = () => (store.get().stores ||= {});
export const list = () => Object.entries(all()).map(([id, s]) => ({ id, ...s })).sort((a, b) => (a.at || 0) - (b.at || 0));
export const get = id => (all()[id] ? { id, ...all()[id] } : null);

export function add(name) {
  const id = uid();
  all()[id] = { name: String(name).trim().slice(0, 40) || "Store", order: [...DEFAULT_ORDER], at: Date.now() };
  store.save();
  return id;
}
export function rename(id, name) { const s = all()[id]; if (s) { all()[id] = { ...s, name: String(name).trim().slice(0, 40) || s.name }; store.save(); } }
export function setOrder(id, order) { const s = all()[id]; if (s) { all()[id] = { ...s, order: [...order] }; store.save(); } }
export function remove(id) { delete all()[id]; if (current() === id) pick(""); store.save(); }

export function current() {
  let id = "";
  try { id = localStorage.getItem(PICK) || ""; } catch {}
  return all()[id] ? id : "";
}
export function pick(id) { try { id ? localStorage.setItem(PICK, id) : localStorage.removeItem(PICK); } catch {} }

/** Aisle ids in the order to shop them: the store's order, with any aisle it doesn't mention at the end. */
export function orderFor(id = current()) {
  const s = id && all()[id];
  const order = (s?.order || DEFAULT_ORDER).filter(a => DEFAULT_ORDER.includes(a));
  return [...new Set([...order, ...DEFAULT_ORDER])];
}
