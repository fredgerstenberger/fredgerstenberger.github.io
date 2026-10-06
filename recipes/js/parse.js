// Fetch a recipe page (through a CORS proxy) and pull the recipe out of it.
import { domainOf } from "./util.js";
import { recipeFromLdTexts, parseYield, isoMinutes, finishRecipe, imageOf, ldJsonBlocks } from "./recipe-data.js";
import { devText } from "./dev.js";
import { reportWorker } from "./monitor.js";
export { isoMinutes };

// Public proxies, tried in order after your own Cloudflare Worker (if set in Settings).
const PUBLIC_PROXIES = [
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`
];

async function fetchWithTimeout(url, ms, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "text/html,*/*", ...headers } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// key: your Worker's APP_KEY (sent only to your Worker, never to the public proxies).
export async function fetchPage(url, workerUrl, onStatus = () => {}, key = "") {
  const attempts = [];
  if (workerUrl) { // only older Workers still have this page proxy
    const base = workerUrl.replace(/\/+$/, "");
    attempts.push({ name: "your proxy", make: u => `${base}/?url=${encodeURIComponent(u)}`, headers: key ? { "X-App-Key": key } : {} });
  }
  PUBLIC_PROXIES.forEach((make, i) => attempts.push({ name: `public proxy ${i + 1}`, make }));

  const errors = [];
  for (const a of attempts) {
    onStatus(devText(`Fetching via ${a.name}…`, "Getting the recipe…"));
    try {
      const html = await fetchWithTimeout(a.make(url), 15000, a.headers);
      if (html && html.length > 500 && /<html|<script|<body/i.test(html)) return html;
      errors.push(`${a.name}: empty response`);
    } catch (e) {
      errors.push(`${a.name}: ${e.name === "AbortError" ? "timed out" : e.message}`);
    }
  }
  const err = new Error("Couldn't download that page.");
  err.details = devText(errors, ["The site may be down or blocking downloads. Try again later, or paste the recipe's text."]);
  throw err;
}

// ---- Extraction ----
// Structured-data reading lives in recipe-data.js (shared with the Worker). Here: the browser-only
// fallbacks that need a real HTML parser (microdata and list heuristics).

function text(html) {
  if (html == null) return "";
  const s = String(html);
  if (!/[<&]/.test(s)) return s.replace(/\s+/g, " ").trim();
  const doc = new DOMParser().parseFromString(`<body>${s}</body>`, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function fromJsonLd(doc) {
  return recipeFromLdTexts([...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent));
}

function fromMicrodata(doc) {
  const root = doc.querySelector('[itemtype*="schema.org/Recipe" i]');
  if (!root) return null;
  const prop = p => [...root.querySelectorAll(`[itemprop="${p}"]`)];
  const val = el => el.getAttribute("content") || el.getAttribute("datetime") || el.textContent;
  const ings = [...prop("recipeIngredient"), ...prop("ingredients")].map(e => text(val(e))).filter(Boolean);
  if (!ings.length) return null;
  const steps = prop("recipeInstructions").flatMap(e => {
    const lis = e.querySelectorAll("li");
    return lis.length ? [...lis].map(li => text(li.textContent)) : [text(val(e))];
  }).filter(Boolean);
  const y = parseYield(prop("recipeYield").map(val));
  return {
    title: text(prop("name")[0] ? val(prop("name")[0]) : doc.title),
    description: "",
    author: "",
    yield: y.n, yieldText: y.text,
    prepMin: isoMinutes(prop("prepTime")[0] && val(prop("prepTime")[0])),
    cookMin: isoMinutes(prop("cookTime")[0] && val(prop("cookTime")[0])),
    totalMin: isoMinutes(prop("totalTime")[0] && val(prop("totalTime")[0])),
    ingredients: ings, steps, nutrition: null, siteKeywords: [],
    image: imageOf(prop("image").map(e => e.getAttribute("src") || e.getAttribute("content") || e.getAttribute("href")))
  };
}

function fromHeuristics(doc) {
  // Last resort: look for lists inside elements whose class/id mentions ingredients / instructions.
  const pick = word => {
    const els = [...doc.querySelectorAll(`[class*="${word}" i], [id*="${word}" i]`)];
    for (const el of els) {
      const items = [...el.querySelectorAll("li")].map(li => text(li.textContent)).filter(t => t && t.length < 400);
      if (items.length >= 2) return items;
    }
    return [];
  };
  const ingredients = pick("ingredient");
  if (ingredients.length < 2) return null;
  const steps = pick("instruction").length ? pick("instruction") : pick("direction").length ? pick("direction") : pick("method");
  const h1 = doc.querySelector("h1");
  return {
    title: text(h1 ? h1.textContent : doc.title),
    description: "", author: "",
    yield: null, yieldText: "",
    prepMin: 0, cookMin: 0, totalMin: 0,
    ingredients, steps, nutrition: null, siteKeywords: []
  };
}

export function extractRecipe(html, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const r = fromJsonLd(doc) || fromMicrodata(doc) || fromHeuristics(doc);
  return r ? finishRecipe(r, url, doc.title) : null;
}

// Visible text of a page, minus scripts, menus and footers (for AI reading).
function pageText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript, svg, iframe, nav, header, footer, aside, form, [aria-hidden=true]").forEach(n => n.remove());
  const main = doc.querySelector("article, main, [class*=recipe i]") || doc.body;
  return (main?.innerText || main?.textContent || "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

async function readWithAI(html, url, ai, onStatus) {
  onStatus && onStatus("This page has no recipe data, so it's being read for you. This can take up to a minute.");
  const res = await fetch(`${ai.worker.replace(/\/+$/, "")}/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(ai.key ? { "X-App-Key": ai.key } : {}) },
    body: JSON.stringify({ text: pageText(html), model: ai.model })
  });
  const data = await res.json().catch(() => ({}));
  if (res.status >= 500) reportWorker("import", "/read", res.status);
  if (!res.ok) throw new Error(data.error || `AI reading failed (HTTP ${res.status}).`);
  const { normalizeScan } = await import("./scan.js");
  const r = normalizeScan(data);
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!r.title || r.title === "Untitled recipe") r.title = text(doc.querySelector("h1")?.textContent || doc.title) || "Untitled recipe";
  return { ...r, author: "", nutrition: null, siteKeywords: r.siteKeywords || [], url, site: domainOf(url), viaAI: true };
}

// Ask your Worker to read the recipe (GET /recipe). It returns only the recipe, never the page.
// Returns the recipe, or { fallback, aiTried } when the app should try reading the page itself
// (no Worker answer, an older Worker without /recipe, or a site that blocks the Worker).
async function recipeFromWorker(url, workerUrl, ai, onStatus) {
  const base = workerUrl.replace(/\/+$/, "");
  const q = new URLSearchParams({ url });
  if (ai?.worker) { q.set("ai", "1"); if (ai.model) q.set("model", ai.model); }
  onStatus && onStatus("Reading the recipe…");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90000); // AI reading can take up to a minute
  let res, data;
  try {
    res = await fetch(`${base}/recipe?${q}`, { signal: ctrl.signal, headers: ai?.key ? { "X-App-Key": ai.key } : {} });
    data = await res.json().catch(() => null);
  } catch { return { fallback: true }; }
  finally { clearTimeout(t); }
  if (res.status >= 500) reportWorker("import", "/recipe", res.status);
  if (!data) return { fallback: true, oldWorker: true };                         // not JSON: an older Worker
  if (res.ok && data.recipe) {
    if (data.via !== "ai") return data.recipe;
    const { normalizeScan } = await import("./scan.js");
    const r = normalizeScan({ recipe: data.recipe });
    return { ...r, author: "", nutrition: null, siteKeywords: [], url, site: domainOf(url), viaAI: true };
  }
  if (res.status === 401 || res.status === 429) throw new Error(data.error || `HTTP ${res.status}`);
  if (res.status === 404 && !data.code) return { fallback: true, oldWorker: true };
  return { fallback: true, aiTried: data.code === "no_recipe" && !!ai?.worker && data.ai };
}

export async function importFromUrl(url, workerUrl, onStatus, ai = null) {
  let aiTried = false, newWorker = false;
  if (workerUrl) {
    const got = await recipeFromWorker(url, workerUrl, ai, onStatus);
    if (!got.fallback) return got;
    aiTried = got.aiTried;
    newWorker = !got.oldWorker;
  }
  // Read the page here instead (older Worker, no Worker, or the site blocked the Worker).
  const html = await fetchPage(url, newWorker ? "" : workerUrl, onStatus, ai?.key || "");
  onStatus && onStatus("Reading recipe…");
  let r = extractRecipe(html, url);
  if ((!r || !r.ingredients.length) && ai?.worker && !aiTried) {
    try { r = await readWithAI(html, url, ai, onStatus); } catch (e) { console.warn(e); }
  }
  if (!r || !r.ingredients.length) {
    const e = new Error("Downloaded the page but couldn't find a recipe on it.");
    e.details = [devText("The site may not publish structured recipe data, or it showed a bot check to the proxy.", "The site may not publish its recipe in a form we can read. Try typing it in or pasting its text.")];
    throw e;
  }
  return r;
}

/** Just a recipe page's photo (for recipes saved before photos). Asks the Worker first; a Worker from before
 * photos sends the recipe without one, so the page is then read here through the public proxies. Never uses AI. */
export async function photoFromPage(url, workerUrl = "", key = "") {
  if (workerUrl) {
    let got = null;
    try { got = await recipeFromWorker(url, workerUrl, key ? { key } : null, () => {}); } catch {}
    if (got?.image) return got.image;
  }
  try { return imageFromHtml(await fetchPage(url, "", () => {})) || null; } catch { return null; }
}

/** A page's photo: the recipe data's image, else its share image (og:image / twitter:image). */
export function imageFromHtml(html) {
  try { const r = recipeFromLdTexts(ldJsonBlocks(html)); if (r?.image) return r.image; } catch {}
  const meta = html.match(/<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/i)?.[0] || "";
  return imageOf((meta.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1] || "").replace(/&amp;/g, "&"));
}

// ---- Plain text (pasted, or copied from a photo with iPhone Live Text) ----

const ING_HDR = /^(ingredients?|you(?:'|’)ll need|what you need|for the [a-z ]+:?)\s*:?\s*$/i;
const STEP_HDR = /^(directions?|instructions?|method|preparation|steps|how to make( it)?|to make)\s*:?\s*$/i;
const NOTE_HDR = /^(notes?|tips?|nutrition( facts)?|storage)\s*:?\s*$/i;
const META = /\b(serves|servings?|yield|makes|prep(?:aration)? time|cook(?:ing)? time|total time|active time)\b|\b(prep(?:aration)?|cook(?:ing)?|total|active|bake|baking)\s*:?\s*\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)\b/i;

function looksLikeIngredient(line) {
  if (line.length > 90) return false;
  const s = line.replace(/^[-•*▢□☐·]\s*/, "");
  if (/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(\.\d+)?|[½⅓⅔¼¾⅛])(\s|-|[a-z])/i.test(s) && !/^\d+[.)]\s+[A-Z]/.test(s)) return true;
  if (/^(a|an|one|two|three|pinch|dash|handful)\s/i.test(s) && s.split(" ").length <= 8) return true;
  if (/\b(to taste|for serving|for garnish|optional)\b/i.test(s) && s.length < 60) return true;
  return false;
}

function minutesFrom(text, re) {
  const m = text.match(re);
  if (!m) return 0;
  const h = m[0].match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  const mi = m[0].match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
  return Math.round((h ? parseFloat(h[1]) * 60 : 0) + (mi ? parseInt(mi[1], 10) : 0));
}

export function parseRecipeText(text) {
  const raw = String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map(l => l.replace(/\s+/g, " ").trim());

  let title = "", yieldN = null, yieldText = "";
  const meta = raw.join("\n");
  const y = meta.match(/\b(?:serves|servings?|yield|makes)\s*:?\s*(\d+(?:\s*(?:-|to)\s*\d+)?)/i);
  if (y) { yieldText = y[0]; yieldN = parseInt(y[1], 10); }
  const prepMin = minutesFrom(meta, /prep(?:aration)?\s*(?:time)?\s*:?\s*(\d+(?:\.\d+)?\s*(?:h\w*|m\w*)\s*)+/i);
  const cookMin = minutesFrom(meta, /cook(?:ing)?\s*(?:time)?\s*:?\s*(\d+(?:\.\d+)?\s*(?:h\w*|m\w*)\s*)+/i);
  const totalMin = minutesFrom(meta, /total\s*(?:time)?\s*:?\s*(\d+(?:\.\d+)?\s*(?:h\w*|m\w*)\s*)+/i) || (prepMin + cookMin);

  let mode = "start";
  const ingredients = [], steps = [], intro = [];
  const hasHeaders = raw.some(l => ING_HDR.test(l)) && raw.some(l => STEP_HDR.test(l));

  for (const line of raw) {
    if (!line) { if (mode === "steps" && steps.length) steps.push(""); continue; }
    if (ING_HDR.test(line)) { mode = "ings"; continue; }
    if (STEP_HDR.test(line)) { mode = "steps"; continue; }
    if (NOTE_HDR.test(line)) { mode = "notes"; continue; }
    if (mode === "notes") continue;
    if (META.test(line) && line.length < 80 && !looksLikeIngredient(line)) continue;

    if (!hasHeaders) {
      // No headings: guess line by line. Ingredients come first, then steps.
      if (looksLikeIngredient(line) && mode !== "steps") mode = "ings";
      else if (mode === "ings" && (line.length > 60 || /^\d+[.)]\s/.test(line) || /^step\s*\d/i.test(line))) mode = "steps";
    }

    if (mode === "start") {
      if (!title && line.length <= 80) title = line.replace(/[.:]$/, "");
      else intro.push(line);
      continue;
    }
    if (mode === "ings") {
      // A sub-heading like "For the sauce:" inside the ingredient list
      if (/:$/.test(line) && !looksLikeIngredient(line) && line.length < 40) { ingredients.push("# " + line.replace(/:$/, "")); continue; }
      const prev = ingredients[ingredients.length - 1];
      // Live Text often wraps long ingredient lines: join lowercase continuations.
      if (prev && !prev.startsWith("#") && /^[a-z(]/.test(line) && !looksLikeIngredient(line)) ingredients[ingredients.length - 1] = prev + " " + line;
      else ingredients.push(line.replace(/^[-•*▢□☐·]\s*/, ""));
      continue;
    }
    if (mode === "steps") {
      const isNew = /^(\d+[.)]|step\s*\d+[:.]?|[-•*])\s*/i.test(line);
      const clean = line.replace(/^(\d+[.)]|step\s*\d+[:.]?|[-•*])\s*/i, "");
      const last = steps.length ? steps[steps.length - 1] : null;
      if (!isNew && last && !/[.!?)]$/.test(last)) steps[steps.length - 1] = `${last} ${clean}`;
      else if (clean) steps.push(clean);
    }
  }
  return {
    title: title || "Untitled recipe",
    description: intro.join(" "),
    author: "",
    yield: yieldN, yieldText,
    prepMin, cookMin, totalMin,
    ingredients: ingredients.filter(Boolean),
    steps: steps.filter(Boolean),
    nutrition: null,
    siteKeywords: [],
    url: "", site: ""
  };
}
