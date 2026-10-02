// Reading a recipe out of a web page's structured data (schema.org Recipe in JSON-LD), shared by the
// app and the Cloudflare Worker. No browser APIs here, so the Worker can run it too: the Worker reads
// the page and sends back only the recipe, never the page itself.
import { domainOf } from "./util.js";

// ---- Text cleanup ----
const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", deg: "°", frac12: "½", frac14: "¼", frac34: "¾",
  frac13: "⅓", frac23: "⅔", frac18: "⅛", times: "×", eacute: "é", egrave: "è", ntilde: "ñ", uuml: "ü",
  ouml: "ö", auml: "ä", ccedil: "ç", iacute: "í", aacute: "á", oacute: "ó", uacute: "ú", reg: "®", trade: "™", copy: "©"
};
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Plain text from a string that may contain HTML tags and entities.
export function text(html) {
  if (html == null) return "";
  let s = String(html);
  if (/[<&]/.test(s)) {
    s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " ");
    s = decodeEntities(s);
  }
  return s.replace(/\s+/g, " ").trim();
}

export function asArray(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }

function isType(node, type) {
  return asArray(node && node["@type"]).some(t => String(t).toLowerCase() === type.toLowerCase());
}

export function findRecipeNode(data) {
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

export function parseYield(y) {
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
      if (t) out.push(t);
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

// A schema.org Recipe object → the app's recipe fields.
export function recipeFromNode(r) {
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

// The text inside each <script type="application/ld+json"> block, found without a DOM.
export function ldJsonBlocks(html) {
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

// The first Recipe in a list of JSON-LD texts.
export function recipeFromLdTexts(texts) {
  for (const t of texts) {
    let data;
    try { data = JSON.parse(t.trim().replace(/^\s*\/\/.*$/gm, "")); }
    catch {
      try { data = JSON.parse(t.replace(/[\u0000-\u001f]+/g, " ")); } catch { continue; }
    }
    const node = findRecipeNode(data);
    if (node) return recipeFromNode(node);
  }
  return null;
}

// Tidy an extracted recipe and add where it came from.
export function finishRecipe(r, url, pageTitle = "") {
  if (!r.title) r.title = text(pageTitle) || "Untitled recipe";
  r.url = url;
  r.site = domainOf(url);
  if (!r.totalMin && (r.prepMin || r.cookMin)) r.totalMin = r.prepMin + r.cookMin;
  r.ingredients = r.ingredients.map(s => s.replace(/^▢\s*/, "").trim()).filter(Boolean);
  r.steps = r.steps.map(s => s.replace(/^(step\s*)?\d+[.):]\s*/i, "").trim()).filter(Boolean);
  return r;
}

export function htmlTitle(html) {
  const h1 = String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const t = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return text(h1?.[1] || t?.[1] || "");
}

// Rough visible text of a page (for AI reading when there's no recipe data), without a DOM.
export function pageTextLite(html) {
  let s = String(html);
  const main = s.match(/<(article|main)\b[\s\S]*?<\/\1>/i);
  if (main) s = main[0];
  s = s.replace(/<(script|style|noscript|svg|iframe|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(s).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
