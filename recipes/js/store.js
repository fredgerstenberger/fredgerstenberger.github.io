// All data lives in this browser (localStorage). Export/Import in Settings for backups.
import { FOODS } from "./fooddb.js";

const KEY = "recipebox.v1";

export const DEFAULT_SETTINGS = {
  theme: "auto",        // auto | light | dark
  lowCal: 500,          // kcal per serving
  highProtein: 30,      // g protein per serving
  quickMin: 30,         // minutes
  people: 1,            // people eating each planned meal
  units: "original",    // original | us | metric
  proxy: "",            // your Cloudflare Worker URL
  wakeLock: true,
  priceRegion: "us",    // see prices.js REGIONS
  priceCustomPct: 100,  // % of US average when region is "custom"
  budget: 3,            // $ per serving for the Budget filter
  scanModel: "@cf/qwen/qwen3.8-27b", // vision model for photo scans (see scan.js)
  scanKey: ""           // optional APP_KEY secret set on the Worker
};

function freshState() {
  const pantry = {};
  for (const f of FOODS) if (f.kind === "S") pantry[f.name] = true;
  return { version: 1, recipes: {}, plan: {}, grocery: {}, pantry, prices: {}, pricesUpdated: 0, foods: {}, asked: {}, history: {}, settings: { ...DEFAULT_SETTINGS }, lastBackup: 0 };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const base = freshState();
      return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) }, pantry: { ...base.pantry, ...(s.pantry || {}) } };
    }
  } catch (e) {
    console.warn("Could not read saved data", e);
  }
  return freshState();
}

// info (optional) is passed to listeners; sync uses info.times to keep imported records' edit times.
export function save(info) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    alert("Couldn't save — storage may be full or blocked. Export a backup from Settings.");
  }
  listeners.forEach(fn => fn(info));
}

export const get = () => state;
export const onChange = fn => listeners.add(fn);

// ---- Recipes ----
export const recipes = () => Object.values(state.recipes);
export const recipe = id => state.recipes[id];

export function putRecipe(r) {
  r.updated = Date.now();
  if (!r.created) r.created = r.updated;
  state.recipes[r.id] = r;
  save();
}

export function deleteRecipe(id) {
  delete state.recipes[id];
  for (const wk of Object.values(state.plan)) wk.meals = (wk.meals || []).filter(m => m.rid !== id);
  save();
}

// ---- Plan ----
// Reading a week never creates it (an empty week would otherwise be saved and synced just by looking).
const EMPTY_WEEK = Object.freeze({ meals: Object.freeze([]) });
export function week(key) {
  return state.plan[key] || EMPTY_WEEK;
}
export function editWeek(key) {
  if (!state.plan[key]) state.plan[key] = { meals: [] };
  return state.plan[key];
}

export function groceryState(key) {
  if (!state.grocery[key]) state.grocery[key] = { checked: {}, extras: [], hidden: {} };
  const g = state.grocery[key];
  g.hidden ||= {};
  g.edits ||= {};
  return g;
}

// ---- Settings ----
export const settings = () => state.settings;
export function setSetting(k, v) { state.settings[k] = v; save(); }

// ---- Your own prices (override the estimates) ----
export function setPrice(name, price, basis) {
  state.prices ||= {};
  if (price == null) delete state.prices[name];
  else state.prices[name] = { price, basis };
  state.pricesUpdated = Date.now();
  save();
}

// ---- Your own info for ingredients (nutrition and the raw price you typed) ----
// foods[key] = { nu (per 100 g), gCup, gEach, nuRef: {qty, unit, kcal, protein, carbs, fat}, priceRef: {price, qty, unit} }
// asked[key] = time you were first asked about it, so each ingredient is only asked about once.
export function putFood(key, entry) {
  state.foods ||= {};
  if (entry) state.foods[key] = entry; else delete state.foods[key];
  save();
}
export function markAsked(keys) {
  state.asked ||= {};
  for (const k of keys) state.asked[k] ||= Date.now();
  save();
}

// ---- Backup ----
export function exportJSON() {
  state.lastBackup = Date.now();
  save();
  return JSON.stringify({ app: "recipe-box", exported: new Date().toISOString(), ...state }, null, 1);
}

export function readBackup(text) {
  const data = JSON.parse(text);
  if (!data || typeof data.recipes !== "object") throw new Error("That file isn't a Recipe Box backup.");
  return data;
}

/**
 * Restore a backup.
 * merge:   adds what's missing; where a recipe is in both, the newer copy (by its `updated` time) is
 *          kept. Pantry answers, prices and your ingredient info already on this device are kept.
 *          Imported records keep their original edit times, so with sync on they never beat
 *          changes made after the backup, here or on other devices.
 * replace: this device becomes exactly the backup. With sync on, that's sent everywhere as a new
 *          edit (the settings screen warns about this first).
 */
export function importJSON(text, mode = "merge") {
  const data = readBackup(text);
  const exported = Date.parse(data.exported) || 0;
  if (mode === "replace") {
    const base = freshState();
    state = { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) } };
    delete state.app; delete state.exported;
    save();
    return Object.keys(data.recipes).length;
  }
  const times = {};
  let n = 0;
  for (const [id, r] of Object.entries(data.recipes || {})) {
    const mine = state.recipes[id];
    if (!r || (mine && (mine.updated || 0) >= (r.updated || 0))) continue;
    state.recipes[id] = r;
    times["r:" + id] = r.updated || exported;
    n++;
  }
  for (const [k, v] of Object.entries(data.plan || {})) {
    if (!state.plan[k] && v?.meals?.length) { state.plan[k] = v; times["p:" + k] = exported; }
  }
  for (const coll of ["pantry", "prices", "foods", "asked"]) {
    state[coll] ||= {};
    for (const [k, v] of Object.entries(data[coll] || {})) if (!(k in state[coll]) && k !== "_ft") { state[coll][k] = v; times[coll] = exported; }
  }
  if (times.prices) state.pricesUpdated = Date.now();
  save({ times });
  return n;
}

// Ask the browser not to evict our data (helps on iOS when installed to home screen).
export function requestPersistence() {
  try { navigator.storage?.persist?.(); } catch {}
}
