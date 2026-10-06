// Paprika library import: the file Paprika exports (Paprika, then Export, All recipes, Paprika Recipe Format)
// becomes ordinary Recipe Box recipes. Everything happens on this phone: the file is read in place, nothing is
// sent anywhere, and recipe contents are never logged or counted.
//
// A .paprikarecipes file is a ZIP archive with one entry per recipe ("<name>.paprikarecipe"). Each entry is
// gzip-compressed JSON:
//   { uid, name, ingredients, directions, servings, prep_time, cook_time, total_time, source, source_url,
//     description, notes, nutritional_info, rating, categories, on_favorites, created, image_url,
//     photo_data, photos, difficulty, hash, ... }
// ingredients and directions are text with one item per line; the times and servings are free text.
// (test/helpers/paprika.mjs builds files in this format for the tests.)
//
// Steps: analyzeFile() reads and maps every recipe and sorts it against your recipe book (nothing is saved);
// saveRecipes() adds the ones you import, a batch at a time. Mapping only builds the normal recipe record:
// ingredient lines are kept exactly as written, and the app reads them the same way as any other recipe's.
import * as store from "./store.js";
import { uid as newId, domainOf } from "./util.js";
import { parseYield, isoMinutes } from "./recipe-data.js";
import { okImage, setPhoto } from "./photos.js";

/** A problem with the whole file, with a message to show. code: "not_zip" | "empty" | "unreadable". */
export class ImportError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---- Reading the file ----

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const bytesOf = async (blob, start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer());
const NOT_ZIP = "That isn't a Paprika export. In Paprika, choose Export, then All Recipes, and pick the .paprikarecipes file it makes.";

/** The entries of a ZIP archive (read from its directory at the end, so a big file isn't loaded at once). */
export async function zipEntries(blob) {
  const tailStart = Math.max(0, blob.size - 65557);
  const tail = await bytesOf(blob, tailStart, blob.size);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new ImportError("not_zip", NOT_ZIP);
  const count = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOff = u32(tail, e + 16);
  if (cdOff + cdSize > blob.size) throw new ImportError("not_zip", NOT_ZIP);
  const cd = await bytesOf(blob, cdOff, cdOff + cdSize);
  const out = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.length; n++) {
    if (u32(cd, p) !== 0x02014b50) break;
    const nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commentLen = u16(cd, p + 32);
    out.push({
      name: new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nameLen)),
      method: u16(cd, p + 10), size: u32(cd, p + 20), local: u32(cd, p + 42)
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflate(data, format) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One entry's bytes, uncompressed. */
async function readEntry(blob, en) {
  const head = await bytesOf(blob, en.local, en.local + 30);
  if (u32(head, 0) !== 0x04034b50) throw new Error("bad entry");
  const start = en.local + 30 + u16(head, 26) + u16(head, 28);
  const data = await bytesOf(blob, start, start + en.size);
  if (en.method === 0) return data;
  if (en.method === 8) return inflate(data, "deflate-raw");
  throw new Error("unsupported compression");
}

/** A recipe entry's JSON (gzip-compressed in Paprika's files; plain JSON is accepted too). */
async function recipeJSON(bytes) {
  const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? await inflate(bytes, "gzip") : bytes;
  const o = JSON.parse(new TextDecoder().decode(raw));
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("not a recipe");
  return o;
}

// ---- Mapping one Paprika recipe to a Recipe Box recipe ----

const str = v => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").replace(/\r\n?/g, "\n");
const clean = v => str(v).replace(/\s+/g, " ").trim();
const lines = v => str(v).split("\n").map(l => l.trim()).filter(Boolean);
// A short line ending in a colon ("For the sauce:", "Curry:") is a section heading; an amount at the start or a
// sentence before the colon means it isn't.
const heading = l => (/:$/.test(l) && l.length < 40 && !/^[\d\u00bc-\u00be\u2150-\u215e]/.test(l) && !/[.!?]./.test(l) ? "# " + l.replace(/:$/, "").trim() : l);

/** Minutes from Paprika's free-text times ("15 mins", "1 hr 30 min", "PT45M", "20"). ok: false when unreadable. */
export function textMinutes(v) {
  const t = clean(v);
  if (!t) return { min: 0, ok: true };
  if (/^\d+(\.\d+)?$/.test(t)) return { min: Math.round(parseFloat(t)), ok: true };
  if (/^P(T|\d)/i.test(t)) { const n = isoMinutes(t); return { min: n, ok: n > 0 }; }
  const d = t.match(/(\d+(?:\.\d+)?)\s*(?:d|days?)\b/i);
  const h = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\b/i);
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:m|mins?|minutes?)\b/i);
  if (!d && !h && !m) return { min: 0, ok: false };
  return { min: Math.round((d ? +d[1] * 1440 : 0) + (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0)), ok: true };
}

// Labelled lines of Paprika's nutrition text ("Calories: 320", "Total Fat 12 g"). Saturated and trans fat, sugar
// alcohols and "calories from fat" aren't the totals, so they don't count as them.
const NU = [
  ["kcal", /^(calories|energy|kcal)\b(?!\s*from)/i],
  ["protein", /^protein\b/i],
  ["carbs", /^(total\s+)?carb(ohydrate)?s?\b/i],
  ["fat", /^(total\s+)?fat\b/i],
  ["fiber", /^(dietary\s+)?fib(er|re)\b/i],
  ["sugar", /^(total\s+)?sugars?\b/i],
  ["sodium", /^sodium\b/i]
];
/** { nutrition (per serving, when calories are given), complete (every line was read) } from Paprika's nutrition text. */
export function parseNutrition(v) {
  const out = {};
  let complete = true;
  for (const l of lines(v)) {
    const row = NU.find(([, re]) => re.test(l));
    const n = l.match(/(\d+(?:\.\d+)?)/);
    if (row && n && out[row[0]] == null) out[row[0]] = parseFloat(n[1]);
    else complete = false;
  }
  return { nutrition: out.kcal != null ? out : null, complete: complete && out.kcal != null };
}

const truthy = v => v === true || v === 1 || v === "1" || v === "true" || v === "yes";
// Paprika's dates look like "2021-03-14 18:22:31".
function dateMs(v) {
  const t = Date.parse(clean(v).replace(" ", "T"));
  return Number.isFinite(t) && t > 0 && t <= Date.now() ? t : 0;
}

/**
 * A Paprika recipe as a Recipe Box recipe. me: your rater key (for your rating and favorite).
 * Returns { recipe, photo, problems } or null when there's nothing to import (no title, ingredients or steps).
 */
export function toRecipe(p, me) {
  const title = clean(p.name);
  const ingredients = lines(p.ingredients).map(heading);
  const steps = lines(p.directions).map(l => l.replace(/^(step\s*)?\d+\s*[.)]\s+/i, "")).map(heading);
  if (!title && !ingredients.length && !steps.length) return null;
  const problems = [];
  if (!title) problems.push("no title");
  if (!ingredients.some(l => !l.startsWith("#"))) problems.push("no ingredients");

  const extra = []; // what has no field of its own, kept in the notes rather than dropped
  const times = {};
  for (const [k, label, f] of [["prep_time", "Prep time", "prepMin"], ["cook_time", "Cook time", "cookMin"], ["total_time", "Total time", "totalMin"]]) {
    const t = textMinutes(p[k]);
    times[f] = t.min;
    if (!t.ok) extra.push(`${label}: ${clean(p[k])}`);
  }
  const y = parseYield(clean(p.servings));
  const nuText = str(p.nutritional_info).trim();
  const nu = parseNutrition(nuText);
  if (nuText && !nu.complete) extra.push(`Nutrition (from Paprika):\n${nuText}`);
  const url = /^https?:\/\/\S+$/i.test(clean(p.source_url)) ? clean(p.source_url) : "";
  const rating = Math.round(Number(p.rating));
  const tags = [...new Set((Array.isArray(p.categories) ? p.categories : []).map(c => clean(c).toLowerCase()).filter(Boolean))];

  const r = {
    id: newId(),
    title: title || "Untitled recipe",
    url,
    site: url ? domainOf(url) : clean(p.source),
    author: "",
    yield: y.n,
    yieldText: y.n != null && clean(p.servings) !== String(y.n) ? clean(p.servings) : "",
    prepMin: times.prepMin, cookMin: times.cookMin, totalMin: times.totalMin || (times.prepMin + times.cookMin),
    ingredients, steps,
    nutrition: nu.nutrition,
    tags,
    rating: rating >= 1 && rating <= 5 ? rating : 0,
    notes: [str(p.description).trim(), str(p.notes).trim(), ...extra].filter(Boolean).join("\n\n"),
    origin: "paprika"
  };
  if (r.rating) r.ratings = { [me]: r.rating };
  if (truthy(p.on_favorites)) r.favorites = { [me]: true };
  if (clean(p.uid)) r.importId = "paprika:" + clean(p.uid);
  const created = dateMs(p.created);
  if (created) r.created = created;
  // Photos work like every Recipe Box photo: the picture's web address, kept on this phone. Pictures stored
  // inside the export (photo_data) have no address, so they're left out; the recipe imports either way.
  return { recipe: r, photo: okImage(p.image_url) ? p.image_url.trim() : null, problems };
}

// ---- Sorting against your recipe book ----

export const normTitle = t => clean(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export const normUrl = u => clean(u).toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[#].*$/, "").replace(/\/+$/, "");
const ingKey = r => (r.ingredients || []).map(l => l.toLowerCase().replace(/\s+/g, " ").trim()).join("\n");

/**
 * Each item's status: "already" (imported from Paprika before: same Paprika ID), "duplicate" (same source link, or
 * same name and the same ingredients as a recipe you have: left out unless you ask), "sameName" (shares a name
 * with one you have but differs: imported as a new recipe, marked) or "ready". Changes the items; returns them.
 */
export function classify(items, existing) {
  const imported = new Map(), byUrl = new Map(), byTitle = new Map();
  for (const r of existing) {
    if (r.importId) imported.set(r.importId, r);
    if (r.url) byUrl.set(normUrl(r.url), r);
    const t = normTitle(r.title);
    if (t) (byTitle.get(t) || byTitle.set(t, []).get(t)).push(r);
  }
  for (const it of items) {
    const r = it.recipe, named = byTitle.get(normTitle(r.title)) || [];
    const prev = r.importId && imported.get(r.importId);
    const twin = (r.url && byUrl.get(normUrl(r.url))) || named.find(x => ingKey(x) === ingKey(r) && ingKey(r));
    if (prev) Object.assign(it, { status: "already", match: prev.id });
    else if (twin) Object.assign(it, { status: "duplicate", match: twin.id });
    else if (named.length && r.title !== "Untitled recipe") Object.assign(it, { status: "sameName", match: named[0].id });
    else it.status = "ready";
  }
  return items;
}

// ---- The two steps ----

// Let the screen draw between batches (a message round trip: a real break in the browser, and independent of timers).
const pause = () => new Promise(res => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); res(); }; c.port2.postMessage(0); });

/**
 * Read a .paprikarecipes file and sort its recipes against your recipe book. Saves nothing.
 * Returns { items: [{ recipe, photo, problems, status, match, file }], unreadable: [entry names], total }.
 * Throws ImportError when the file isn't a Paprika export or has no recipes. onProgress(done, total).
 */
export async function analyzeFile(file, { existing = store.recipes(), me = "", onProgress } = {}) {
  let entries;
  const head = await bytesOf(file, 0, 4);
  if (head[0] === 0x1f && head[1] === 0x8b) entries = [{ name: file.name || "recipe.paprikarecipe", single: true }]; // one exported recipe
  else entries = (await zipEntries(file)).filter(e => /\.paprikarecipe$/i.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name));
  if (!entries.length) throw new ImportError("empty", "That export has no recipes in it.");
  const items = [], unreadable = [];
  for (let i = 0; i < entries.length; i++) {
    const en = entries[i];
    try {
      const p = await recipeJSON(en.single ? new Uint8Array(await file.arrayBuffer()) : await readEntry(file, en));
      const it = toRecipe(p, me);
      if (it) items.push({ ...it, file: en.name }); else unreadable.push(en.name);
    } catch { unreadable.push(en.name); } // one bad recipe never stops the rest
    if (i % 20 === 19) { onProgress?.(i + 1, entries.length); await pause(); }
  }
  onProgress?.(entries.length, entries.length);
  if (!items.length) throw new ImportError("unreadable", "None of the recipes in that file could be read. Try exporting from Paprika again.");
  return { items: classify(items, existing), unreadable, total: entries.length };
}

/**
 * Add these items' recipes to the recipe book, a batch at a time (one save each), with their photos.
 * Returns { saved: [recipe ids], left: how many didn't fit (storage full; those already saved stay) }.
 */
export async function saveRecipes(items, { batch = 50, onProgress } = {}) {
  const saved = [];
  for (let i = 0; i < items.length; i += batch) {
    const part = items.slice(i, i + batch);
    if (!store.putRecipes(part.map(it => it.recipe))) return { saved, left: items.length - i };
    for (const it of part) { saved.push(it.recipe.id); if (it.photo) setPhoto(it.recipe.id, it.photo); }
    onProgress?.(Math.min(i + batch, items.length), items.length);
    await pause();
  }
  return { saved, left: 0 };
}
