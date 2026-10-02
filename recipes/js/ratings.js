// Ratings in a shared recipe box: everyone rates a recipe themselves (recipe.ratings = { rater: stars })
// and what's shown is the average. Who you are is this device's identity: the name you enter in
// Settings (so your phone and iPad count as one person), or until then a random id for this device.
//
// recipe.rating is kept as the rounded average for older app versions and for anything that hasn't
// been updated; recipes rated before this existed count their old rating as one vote until the first
// person rates them again (that person takes the old rating over).
import * as store from "./store.js";

const KEY = "recipebox.me"; // stays on this device (not synced)

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
export function me() {
  let m = load();
  if (!m?.id) {
    m = { id: [...crypto.getRandomValues(new Uint8Array(6))].map(b => b.toString(36).padStart(2, "0")).join(""), name: "" };
    try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {}
  }
  return m;
}

const keyFor = m => (m.name ? "n:" + m.name.trim().toLowerCase().replace(/\s+/g, " ") : "d:" + m.id);
export const myKey = () => keyFor(me());

// A rater key as a name to show ("n:emma" → "Emma"); device ids have no name.
export function raterName(key) {
  if (!key.startsWith("n:")) return "";
  return key.slice(2).replace(/\b\p{L}/gu, c => c.toUpperCase());
}

/** { avg, count, mine, others: [{ name, stars }] } for a recipe. */
export function ratingOf(r) {
  const all = Object.entries(r?.ratings || {}).filter(([, n]) => n > 0);
  if (!all.length) {
    const old = r?.rating || 0;
    return { avg: old, count: old ? 1 : 0, mine: 0, legacy: !!old, others: [] };
  }
  const k = myKey();
  const avg = all.reduce((t, [, n]) => t + n, 0) / all.length;
  return {
    avg, count: all.length,
    mine: r.ratings[k] || 0,
    others: all.filter(([key]) => key !== k).map(([key, n]) => ({ name: raterName(key), stars: n }))
  };
}

// Average for sorting and filters (0 when unrated).
export const avgRating = r => ratingOf(r).avg;

// Set (or with 0, clear) your rating.
export function rate(r, stars) {
  r.ratings ||= {};
  r.ratings[myKey()] = stars;
  if (!stars) delete r.ratings[myKey()];
  const left = Object.values(r.ratings).filter(n => n > 0);
  r.rating = left.length ? Math.round(left.reduce((t, n) => t + n, 0) / left.length) : 0;
  store.putRecipe(r);
}

// Change your name: your ratings move from your old identity to the new one, on every recipe.
export function setMyName(name) {
  const before = me();
  const after = { ...before, name: String(name || "").trim().slice(0, 40) };
  const from = keyFor(before), to = keyFor(after);
  try { localStorage.setItem(KEY, JSON.stringify(after)); } catch {}
  if (from === to) return;
  let moved = 0;
  for (const r of store.recipes()) {
    if (!r.ratings || !(from in r.ratings)) continue;
    if (!(to in r.ratings)) r.ratings[to] = r.ratings[from];
    delete r.ratings[from];
    r.updated = Date.now();
    moved++;
  }
  if (moved) store.save();
}
