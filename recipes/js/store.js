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
  budget: 3             // $ per serving for the Budget filter
};

function freshState() {
  const pantry = {};
  for (const f of FOODS) if (f.kind === "S") pantry[f.name] = true;
  return { version: 1, recipes: {}, plan: {}, grocery: {}, pantry, prices: {}, pricesUpdated: 0, settings: { ...DEFAULT_SETTINGS }, lastBackup: 0 };
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

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    alert("Couldn't save — storage may be full or blocked. Export a backup from Settings.");
  }
  listeners.forEach(fn => fn());
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
export function week(key) {
  if (!state.plan[key]) state.plan[key] = { meals: [] };
  return state.plan[key];
}

export function groceryState(key) {
  if (!state.grocery[key]) state.grocery[key] = { checked: {}, extras: [], hidden: {} };
  const g = state.grocery[key];
  g.hidden ||= {};
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

// ---- Backup ----
export function exportJSON() {
  state.lastBackup = Date.now();
  save();
  return JSON.stringify({ app: "recipe-box", exported: new Date().toISOString(), ...state }, null, 1);
}

export function importJSON(text, mode = "merge") {
  const data = JSON.parse(text);
  if (!data || typeof data.recipes !== "object") throw new Error("That file isn't a Recipe Box backup.");
  if (mode === "replace") {
    const base = freshState();
    state = { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) } };
    delete state.app; delete state.exported;
  } else {
    Object.assign(state.recipes, data.recipes);
    for (const [k, v] of Object.entries(data.plan || {})) if (!state.plan[k]) state.plan[k] = v;
    Object.assign(state.pantry, data.pantry || {});
    state.prices = { ...(data.prices || {}), ...(state.prices || {}) };
  }
  save();
  return Object.keys(data.recipes).length;
}

export function resetAll() {
  state = freshState();
  save();
}

// Ask the browser not to evict our data (helps on iOS when installed to home screen).
export function requestPersistence() {
  try { navigator.storage?.persist?.(); } catch {}
}
