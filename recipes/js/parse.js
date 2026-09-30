// Fetch a recipe page (through a CORS proxy) and pull the recipe out of it.
import { domainOf } from "./util.js";

// Public proxies, tried in order after your own Cloudflare Worker (if set in Settings).
const PUBLIC_PROXIES = [
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.cors.lol/?url=${encodeURIComponent(u)}`
];

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "text/html,*/*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchPage(url, workerUrl, onStatus = () => {}) {
  const attempts = [];
  if (workerUrl) {
    const base = workerUrl.replace(/\/+$/, "");
    attempts.push({ name: "your proxy", make: u => `${base}/?url=${encodeURIComponent(u)}` });
  }
  PUBLIC_PROXIES.forEach((make, i) => attempts.push({ name: `public proxy ${i + 1}`, make }));

  const errors = [];
  for (const a of attempts) {
    onStatus(`Fetching via ${a.name}…`);
    try {
      const html = await fetchWithTimeout(a.make(url), 15000);
      if (html && html.length > 500 && /<html|<script|<body/i.test(html)) return html;
      errors.push(`${a.name}: empty response`);
    } catch (e) {
      errors.push(`${a.name}: ${e.name === "AbortError" ? "timed out" : e.message}`);
    }
  }
  const err = new Error("Couldn't download that page.");
  err.details = errors;
  throw err;
}

// ---- Extraction ----

function text(html) {
  if (html == null) return "";
  const s = String(html);
  if (!/[<&]/.test(s)) return s.replace(/\s+/g, " ").trim();
  const doc = new DOMParser().parseFromString(`<body>${s}</body>`, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function asArray(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }

function isType(node, type) {
  return asArray(node && node["@type"]).some(t => String(t).toLowerCase() === type.toLowerCase());
}

function findRecipeNode(data) {
  const stack = asArray(data);
  const seen = new Set();
  while (stack.length) {
    const n = stack.shift();
    if (!n || typeof n !== "object" || seen.has(n)) continue;
    seen.add(n);
    if (isType(n, "Recipe")) return n;
    if (n["@graph"]) stack.push(...asArray(n["@graph"]));
    if (n.mainEntity) stack.push(...asArray(n.mainEntity));
    if (Array.isArray(n)) stack.push(...n);
    else for (const v of Object.values(n)) if (v && typeof v === "object") stack.push(v);
  }
  return null;
}

export function isoMinutes(iso) {
  if (!iso) return 0;
  const m = String(iso).match(/P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?/i);
  if (!m) {
    const n = parseInt(iso, 10);
    return isNaN(n) ? 0 : n;
  }
  return Math.round((+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) + (+(m[4] || 0)) / 60);
}

function parseYield(y) {
  for (const v of asArray(y)) {
    const m = String(v).match(/\d+(?:\.\d+)?/);
    if (m) return { n: parseFloat(m[0]), text: String(v) };
  }
  return { n: null, text: "" };
}

function flattenSteps(ins, out = []) {
  for (const item of asArray(ins)) {
    if (item == null) continue;
    if (typeof item === "string") {
      const t = text(item);
      // Some sites put all steps in one string separated by newlines or numbers.
      const parts = t.includes("\n") ? t.split(/\n+/) : [t];
      parts.map(p => p.trim()).filter(Boolean).forEach(p => out.push(p));
    } else if (isType(item, "HowToSection")) {
      if (item.name) out.push("# " + text(item.name));
      flattenSteps(item.itemListElement, out);
    } else if (item.itemListElement) {
      flattenSteps(item.itemListElement, out);
    } else if (item.text || item.name) {
      const t = text(item.text || item.name);
      if (t) out.push(t);
    }
  }
  return out;
}

function splitSentencesIfGiant(steps) {
  // A single enormous step usually means the site crammed everything together.
  if (steps.length === 1 && steps[0].length > 400) {
    return steps[0].split(/(?<=\.)\s+(?=[A-Z])/).reduce((acc, s) => {
      if (acc.length && acc[acc.length - 1].length < 120) acc[acc.length - 1] += " " + s;
      else acc.push(s);
      return acc;
    }, []);
  }
  return steps;
}

function num(v) {
  if (v == null) return null;
  const m = String(v).replace(",", "").match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function parseNutrition(n) {
  if (!n || typeof n !== "object") return null;
  const out = {
    kcal: num(n.calories),
    protein: num(n.proteinContent),
    carbs: num(n.carbohydrateContent),
    fat: num(n.fatContent),
    fiber: num(n.fiberContent),
    sugar: num(n.sugarContent),
    sodium: num(n.sodiumContent),
    serving: n.servingSize ? text(n.servingSize) : ""
  };
  if (out.sodium != null && /\bg\b/i.test(String(n.sodiumContent)) && !/mg/i.test(String(n.sodiumContent))) out.sodium *= 1000;
  return out.kcal != null || out.protein != null ? out : null;
}

function keywordsOf(r) {
  const k = [];
  for (const v of asArray(r.keywords)) k.push(...String(v).split(","));
  for (const v of asArray(r.recipeCategory)) k.push(...String(v).split(","));
  for (const v of asArray(r.recipeCuisine)) k.push(...String(v).split(","));
  return k.map(s => text(s).toLowerCase()).filter(s => s && s.length < 30);
}

function fromJsonLd(doc) {
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try { data = JSON.parse(s.textContent.trim().replace(/^\s*\/\/.*$/gm, "")); }
    catch {
      try { data = JSON.parse(s.textContent.replace(/[\u0000-\u001f]+/g, " ")); } catch { continue; }
    }
    const r = findRecipeNode(data);
    if (!r) continue;
    const y = parseYield(r.recipeYield);
    return {
      title: text(r.name),
      description: text(r.description),
      author: text(asArray(r.author).map(a => (typeof a === "string" ? a : a?.name)).filter(Boolean).join(", ")),
      yield: y.n, yieldText: y.text,
      prepMin: isoMinutes(r.prepTime),
      cookMin: isoMinutes(r.cookTime),
      totalMin: isoMinutes(r.totalTime),
      ingredients: asArray(r.recipeIngredient || r.ingredients).map(text).filter(Boolean),
      steps: splitSentencesIfGiant(flattenSteps(r.recipeInstructions)),
      nutrition: parseNutrition(r.nutrition),
      siteKeywords: keywordsOf(r)
    };
  }
  return null;
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
    ingredients: ings, steps, nutrition: null, siteKeywords: []
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
  if (!r) return null;
  if (!r.title) r.title = text(doc.title) || "Untitled recipe";
  r.url = url;
  r.site = domainOf(url);
  if (!r.totalMin && (r.prepMin || r.cookMin)) r.totalMin = r.prepMin + r.cookMin;
  // Drop duplicate headings/blank lines, keep order.
  r.ingredients = r.ingredients.map(s => s.replace(/^▢\s*/, "").trim()).filter(Boolean);
  r.steps = r.steps.map(s => s.replace(/^(step\s*)?\d+[.):]\s*/i, "").trim()).filter(Boolean);
  return r;
}

export async function importFromUrl(url, workerUrl, onStatus) {
  const html = await fetchPage(url, workerUrl, onStatus);
  onStatus && onStatus("Reading recipe…");
  const r = extractRecipe(html, url);
  if (!r || !r.ingredients.length) {
    const e = new Error("Downloaded the page but couldn't find a recipe on it.");
    e.details = ["The site may not publish structured recipe data, or it showed a bot check to the proxy."];
    throw e;
  }
  return r;
}
