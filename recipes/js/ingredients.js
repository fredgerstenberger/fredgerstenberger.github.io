// Ingredient line parsing, unit conversion and friendly formatting.
import { matchFood } from "./fooddb.js";
import { usdaFood, noteUnknown, customFood, dataVersion } from "./data.js";
import { foodsVersion } from "./store.js";
import { nutritionVariant } from "./variants.js";

// ---- Units ----
// dim: "mass" (base g), "vol" (base ml), "count"
export const UNITS = {
  g:      { dim: "mass", f: 1,        names: ["g", "gram", "grams", "gr", "grs"] },
  kg:     { dim: "mass", f: 1000,     names: ["kg", "kgs", "kilogram", "kilograms"] },
  mg:     { dim: "mass", f: 0.001,    names: ["mg", "milligram", "milligrams"] },
  oz:     { dim: "mass", f: 28.3495,  names: ["oz", "ounce", "ounces", "onz"] },
  lb:     { dim: "mass", f: 453.592,  names: ["lb", "lbs", "pound", "pounds"] },
  ml:     { dim: "vol",  f: 1,        names: ["ml", "mls", "milliliter", "milliliters", "millilitre", "millilitres", "cc"] },
  l:      { dim: "vol",  f: 1000,     names: ["l", "liter", "liters", "litre", "litres"] },
  tsp:    { dim: "vol",  f: 4.92892,  names: ["tsp", "tsps", "teaspoon", "teaspoons", "t"] },
  tbsp:   { dim: "vol",  f: 14.7868,  names: ["tbsp", "tbsps", "tbs", "tbl", "tablespoon", "tablespoons", "T", "tbsp."] },
  cup:    { dim: "vol",  f: 236.588,  names: ["cup", "cups", "c"] },
  floz:   { dim: "vol",  f: 29.5735,  names: ["fl oz", "fl. oz", "fluid ounce", "fluid ounces", "fl oz."] },
  pint:   { dim: "vol",  f: 473.176,  names: ["pint", "pints", "pt"] },
  quart:  { dim: "vol",  f: 946.353,  names: ["quart", "quarts", "qt", "qts"] },
  gallon: { dim: "vol",  f: 3785.41,  names: ["gallon", "gallons", "gal"] },
  pinch:  { dim: "vol",  f: 0.31,     names: ["pinch", "pinches"] },
  dash:   { dim: "vol",  f: 0.62,     names: ["dash", "dashes"] },
  // Count-like units. Containers carry a package meaning for grocery rounding.
  clove:  { dim: "count", names: ["clove", "cloves"] },
  can:    { dim: "count", pkg: true, names: ["can", "cans", "tin", "tins"] },
  jar:    { dim: "count", pkg: true, names: ["jar", "jars"] },
  box:    { dim: "count", pkg: true, names: ["box", "boxes"] },
  bag:    { dim: "count", pkg: true, names: ["bag", "bags"] },
  package:{ dim: "count", pkg: true, names: ["package", "packages", "pkg", "pkgs", "packet", "packets", "pack", "packs", "envelope"] },
  bottle: { dim: "count", pkg: true, names: ["bottle", "bottles"] },
  carton: { dim: "count", pkg: true, names: ["carton", "cartons"] },
  block:  { dim: "count", pkg: true, names: ["block", "blocks"] },
  container: { dim: "count", pkg: true, names: ["container", "containers", "tub", "tubs"] },
  bunch:  { dim: "count", pkg: true, names: ["bunch", "bunches"] },
  head:   { dim: "count", pkg: true, names: ["head", "heads"] },
  loaf:   { dim: "count", pkg: true, names: ["loaf", "loaves"] },
  stick:  { dim: "count", names: ["stick", "sticks"] },
  slice:  { dim: "count", names: ["slice", "slices"] },
  piece:  { dim: "count", names: ["piece", "pieces", "pc", "pcs"] },
  stalk:  { dim: "count", names: ["stalk", "stalks", "rib", "ribs"] },
  sprig:  { dim: "count", names: ["sprig", "sprigs"] },
  leaf:   { dim: "count", names: ["leaf", "leaves"] },
  fillet: { dim: "count", names: ["fillet", "fillets", "filet", "filets"] },
  breast: { dim: "count", names: ["breast", "breasts"] },
  thigh:  { dim: "count", names: ["thigh", "thighs"] },
  ear:    { dim: "count", names: ["ear", "ears"] },
  scoop:  { dim: "count", names: ["scoop", "scoops"] },
  handful:{ dim: "count", names: ["handful", "handfuls"] },
  inch:   { dim: "count", names: ["inch", "inches", "in", "\""] }
};

const UNIT_LOOKUP = {};
for (const [key, u] of Object.entries(UNITS)) {
  for (const n of u.names) {
    // "T" = tbsp, "t" = tsp; everything else case-insensitive.
    if (n === "T" || n === "t") UNIT_LOOKUP[n] = key;
    else UNIT_LOOKUP[n.toLowerCase()] = key;
  }
}
const MULTIWORD_UNITS = Object.keys(UNIT_LOOKUP).filter(k => k.includes(" ")).sort((a, b) => b.length - a.length);

const SIZE_WORDS = /^(small|medium|large|extra[- ]large|x-large|xl|jumbo|big|heaping|heaped|level|scant|generous|rounded)\b\s*/i;
const FOOD_SIZE = /^(small|medium|large|extra[- ]large|x-large|xl|jumbo|big)$/i; // describe the food, not the spoonful

const UNICODE_FRAC = { "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };

function normalizeText(s) {
  return String(s)
    // Commas inside numbers: "1,000 g" is a thousands separator (exactly three digits after each comma),
    // "1,5 kg" is a decimal comma (one or two digits). "chicken, 2 lb" (a space after the comma) is untouched.
    .replace(/\d{1,3}(?:,\d{3})+(?![\d,])/g, m => m.replace(/,/g, ""))
    .replace(/(\d),(\d{1,2})(?![\d,])/g, "$1.$2")
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, m => " " + UNICODE_FRAC[m])
    .replace(/(\d)\s*⁄\s*(\d)/g, "$1/$2")
    .replace(/ /g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\.\d+)`;
const QTY_RE = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|to|or)\s*(${NUM}))?\s*`, "i");
const WORD_NUMS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, half: 0.5 };

export function parseNum(s) {
  s = s.trim();
  let m;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + (+m[2] / +m[3]);
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return +m[1] / +m[2];
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
// parseNum, but only real amounts: "1/0" or "0/0" is treated as no amount.
const amount = s => { const n = parseNum(s); return n != null && isFinite(n) ? n : null; };

function readUnit(rest) {
  const lower = rest.toLowerCase();
  for (const mw of MULTIWORD_UNITS) {
    if (lower.startsWith(mw) && !/[a-z]/.test(lower[mw.length] || "")) {
      return { unit: UNIT_LOOKUP[mw], rest: rest.slice(mw.length).replace(/^\.?\s*/, "") };
    }
  }
  const m = rest.match(/^([a-zA-Z"]+)\.?(?=\s|,|$|\()/);
  if (m) {
    const tok = m[1];
    const key = UNIT_LOOKUP[tok] || (tok.length > 1 || tok === "c" || tok === "l" || tok === "g" ? UNIT_LOOKUP[tok.toLowerCase()] : null);
    if (key) return { unit: key, rest: rest.slice(m[0].length).trim() };
  }
  return { unit: null, rest };
}

// Words that describe prep, not the ingredient; stripped for matching & grocery naming.
const PREP_WORDS = /\b(freshly|fresh|finely|roughly|coarsely|thinly|thickly|chopped|diced|minced|sliced|grated|shredded|crumbled|cubed|halved|quartered|peeled|seeded|deseeded|trimmed|rinsed|drained|packed|softened|melted|cooled|beaten|lightly|divided|optional|about|approximately|plus more|more for serving|for serving|for garnish|to taste|or to taste|at room temperature|room temperature|cold|warm|hot(?!\s+(?:dogs?|sauce|peppers?|chil(?:e|i|ies|es)|chocolate|cocoa|italian|sausages?|links?|wings?|honey))|toasted|juiced|zested|julienned|smashed|crushed|torn|cut into[^,]*|into [^,]*pieces|bite[- ]sized|boneless|skinless|organic|large|medium|small|extra[- ]large|jumbo|heaping|scant|good quality|high quality|store[- ]bought|homemade|uncooked|dry|dried)\b/gi;

export function cleanName(name) {
  let n = name.toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(of|the)\b/g, " ");
  n = n.split(/,| - | – /)[0];
  // Keep "dried"/"dry" when they identify the ingredient (dried oregano) — food matching uses the raw text anyway.
  n = n.replace(PREP_WORDS, " ").replace(/\b(and|or)\s*$/, "").replace(/[^a-z0-9%&'\- ]/g, " ").replace(/\s+/g, " ").trim();
  return n;
}

/**
 * Parse one ingredient line.
 * Returns { raw, qty, qtyMax, unit, size: {qty, unit}|null, name, note, food, header }
 */
// One parse of a recipe's lines, shared by nutrition, cost, the book's filters and tags, and the grocery list.
// Kept per recipe until it's edited (a new ingredients list or `updated`) or ingredient data changes (your
// labels and numbers, USDA lookups: dataVersion). One entry per recipe, so it never grows past the book.
const parsed = new Map();
export function parseRecipe(recipe) {
  const list = recipe.ingredients || [], key = `${recipe.updated || 0}:${dataVersion()}:${foodsVersion()}`;
  const hit = parsed.get(recipe.id);
  if (hit && hit.list === list && hit.key === key) return hit.lines;
  const lines = list.map(line => ({ line, ing: parseIngredient(line) }));
  if (recipe.id) parsed.set(recipe.id, { list, key, lines });
  return lines;
}

export function parseIngredient(line) {
  const raw = String(line).trim();
  if (!raw) return null;
  if (raw.startsWith("#")) return { raw, header: raw.replace(/^#+\s*/, "") };

  let s = normalizeText(raw).replace(/^[-•*▢□☐]\s*/, "");
  // Size words ("large onion") are dropped for matching and grocery names but kept for display.
  const sizeWords = [];
  const stripSize = str => {
    const sm = str.match(SIZE_WORDS);
    if (!sm) return str;
    if (FOOD_SIZE.test(sm[1])) sizeWords.push(sm[1].toLowerCase());
    return str.slice(sm[0].length);
  };
  // "Juice of 1 lemon" → "1 lemon, juiced" (buy whole lemons)
  s = s.replace(/^(juice|zest|juice and zest|zest and juice) of (\S+) (lemons?|limes?|oranges?)\b,?\s*/i, (_, what, n, fruit) => `${n} ${fruit}, ${what.toLowerCase().replace("juice", "juiced").replace("zest", "zested")} `);
  let qty = null, qtyMax = null, unit = null, size = null, compound = false;

  // "2% milk": a percentage is part of the name, not an amount.
  let m = /^\d+(\.\d+)?\s*%/.test(s) ? null : s.match(QTY_RE);
  if (m) {
    qty = amount(m[1]);
    qtyMax = m[2] ? amount(m[2]) : null;
    s = s.slice(m[0].length);
    if (qty === null) { qtyMax = null; s = readUnit(s).rest; } // "1/0 cup flour": no amount, but drop the unit word
    // "2 + 1/2 cups", "1 and 1/2 cups": a whole number plus a fraction
    const pm = qty !== null && qtyMax === null && s.match(/^(?:\+|and)\s*(\d+\s*\/\s*\d+)\s*/i);
    if (pm && amount(pm[1].replace(/\s+/g, "")) != null) { qty += amount(pm[1].replace(/\s+/g, "")); s = s.slice(pm[0].length); }
  } else {
    // "half and half" (the cream) is a name, not half of something.
    const w = /^half\s*(?:and|&|-and-|-n-|n)\s*-?\s*half\b/i.test(s) ? null
      : s.match(/^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|a dozen|dozen)\s+/i);
    if (w) {
      const word = w[1].toLowerCase().replace("a dozen", "dozen");
      qty = WORD_NUMS[word];
      s = s.slice(w[0].length);
    }
  }

  if (qty !== null) {
    // "1 dozen eggs", "2 dozen", "1/2 dozen"
    m = s.match(/^(?:an?\s+)?dozens?\b\s*/i); // "half a dozen eggs" too
    if (m) { qty *= 12; if (qtyMax != null) qtyMax *= 12; s = s.slice(m[0].length); }
    // UK/AU style "2 x 400g tins tomatoes" (count × container size) or "2 x 200g chicken breasts" (count × amount).
    m = s.match(/^[x×]\s*(?=[\d.])/i);
    if (m) {
      s = s.slice(m[0].length);
      const nm = s.match(new RegExp(String.raw`^(${NUM})\s*-?\s*`));
      const su = nm ? readUnit(s.slice(nm[0].length)) : {};
      if (su.unit && UNITS[su.unit].dim !== "count") {
        const cont = readUnit(su.rest.replace(SIZE_WORDS, ""));
        if (!(cont.unit && UNITS[cont.unit].pkg)) { qty *= parseNum(nm[1]); qtyMax = null; s = s.slice(nm[0].length); }
      }
    }
  }

  // "(14.5 oz)" / "(14.5-ounce)" can size.
  const sizeRe = new RegExp(String.raw`^\(\s*(${NUM})\s*-?\s*([a-zA-Z. ]+?)\s*\)\s*`);
  m = s.match(sizeRe);
  if (m) {
    const u = readUnit(m[2]);
    if (u.unit) size = { qty: parseNum(m[1]), unit: u.unit };
    s = s.slice(m[0].length);
  }

  // "1 14.5-ounce can" → count 1, size 14.5 oz
  if (qty !== null && !size) {
    m = s.match(new RegExp(String.raw`^(${NUM})\s*-?\s*([a-zA-Z.]+)\s+`));
    if (m) {
      const su = readUnit(m[2]);
      const after = readUnit(s.slice(m[0].length).replace(SIZE_WORDS, ""));
      if (su.unit && after.unit && UNITS[after.unit].pkg) {
        size = { qty: parseNum(m[1]), unit: su.unit };
        s = s.slice(m[0].length);
      }
    }
  }
  s = stripSize(s.replace(/^-\s*/, ""));
  if (qty !== null || size) {
    const u = readUnit(s);
    unit = u.unit; s = u.rest;
    // "14.5 oz can tomatoes" → size, container unit
    if (unit && UNITS[unit].dim !== "count") {
      const u2 = readUnit(s.replace(SIZE_WORDS, ""));
      if (u2.unit && UNITS[u2.unit].pkg) {
        size = { qty, unit }; qty = 1; qtyMax = null; unit = u2.unit; s = u2.rest;
      }
    }
    // "2 (14.5 oz) cans" where size came after the count
    if (!size) {
      m = s.match(sizeRe);
      if (m) {
        const su = readUnit(m[2]);
        if (su.unit) size = { qty: parseNum(m[1]), unit: su.unit };
        s = s.slice(m[0].length);
        if (!unit) { const u3 = readUnit(s); unit = u3.unit; s = u3.rest; }
      }
    }
    // Compound amounts: "1 tbsp + 1 tsp", "1/3 cup plus 2 tbsp", "1 pound 2 ounces" → one amount in the first unit.
    while (qty !== null && qtyMax === null && unit && UNITS[unit].dim !== "count") {
      const cm = s.match(new RegExp(String.raw`^(?:\+|plus\b|and\b)?\s*(${NUM})\s*`, "i"));
      const u2 = cm ? readUnit(s.slice(cm[0].length)) : {};
      if (!u2.unit || UNITS[u2.unit].dim !== UNITS[unit].dim) break;
      qty += parseNum(cm[1]) * UNITS[u2.unit].f / UNITS[unit].f;
      s = u2.rest;
      compound = true;
    }
  }
  s = stripSize(s.replace(/^of\s+/i, ""));

  let name = s, note = "";
  const ci = s.indexOf(",");
  if (ci > 0) { name = s.slice(0, ci).trim(); note = s.slice(ci + 1).trim(); }

  let food = matchFood(name) || matchFood(s);
  // "2 cans tomatoes" means canned tomatoes, not fresh.
  if (unit === "can" && food?.aisle !== "canned") food = matchFood("canned " + name) || food;
  if (food && food.kind !== "X") food = withYourInfo(food, name);
  if (!food) {
    // Not in the built-in table: use a USDA lookup if we have one, otherwise ask for it in the background.
    // Your own info wins; it fills in on top of the USDA match when there is one.
    const key = cleanName(name);
    const mine = customFood(key), usda = usdaFood(key);
    food = mine && usda ? { ...usda, ...mine, nu: mine.nu || usda.nu, usda: mine.nu ? null : usda.usda } : mine || usda;
    if (food) food = { ...food, infoKey: key };
    if (!usda) noteUnknown(key);
  }
  name = name.trim();
  const display = sizeWords.length ? `${sizeWords.join(" ")} ${name}` : name;
  return { raw, qty, qtyMax, unit, size, name, display, note, food, compound };
}

// A table food, with your info for it when you've added some (a label, or your own numbers).
// A specific product ("protein pasta", "Barilla penne", "skim milk") gets its own info key; until you add
// its info it uses the table food's numbers as a stand-in. Aisle, price and the grocery list always follow
// the table food (name stays the same).
function withYourInfo(food, name) {
  const v = nutritionVariant(name, food);
  const infoKey = v ? v.key : food.name;
  const mine = customFood(infoKey);
  if (!v && !mine?.nu) return food;
  // A label that says how many servings are in the package sets the package's weight ("2 loaves" = 2 × 20
  // slices of 40 g), for nutrition and for a price per package alike.
  const lab = mine?.label, pkgG = lab?.servings > 0 && lab?.grams > 0 ? Math.round(lab.servings * lab.grams) : null;
  return {
    ...food, infoKey, base: food.name,
    nu: mine?.nu || food.nu,
    gCup: mine?.gCup ?? food.gCup, gEach: mine?.gEach ?? food.gEach,
    pkg: pkgG ? { ...(food.pkg || { label: "package" }), g: pkgG, desc: "" } : food.pkg,
    standIn: !mine?.nu, yours: !!mine?.nu, label: mine?.label || null
  };
}

// ---- Conversions ----

// Convert a parsed ingredient amount (qty × unit) to grams, if we can.
export function toGrams(ing, mult = 1) {
  if (!ing || ing.qty == null) return null;
  const q = (ing.qtyMax != null ? (ing.qty + ing.qtyMax) / 2 : ing.qty) * mult;
  const f = ing.food;
  const u = ing.unit ? UNITS[ing.unit] : null;
  if (u && u.dim === "mass") return q * u.f;
  if (u && u.dim === "vol") {
    const gPerMl = f && f.gCup ? f.gCup / 236.588 : 1;
    return q * u.f * gPerMl;
  }
  // count / container
  if (ing.size) {
    const su = UNITS[ing.size.unit];
    const inner = { ...ing, qty: ing.size.qty, qtyMax: null, unit: ing.size.unit, size: null };
    if (su) return toGrams(inner, q);
  }
  if (!f) return null;
  if (ing.unit === "stick" && f.name === "butter") return q * 113;
  if (u && u.pkg && f.pkg) return q * f.pkg.g;
  if (ing.unit === "clove" && f.name === "garlic") return q * 5;
  if (f.gEach) return q * f.gEach;
  if (f.pkg && (ing.unit === "bunch" || ing.unit === "head")) return q * f.pkg.g;
  return null;
}

// Base value in its dimension: grams (mass), ml (vol), or raw count.
export function toBase(qty, unit) {
  const u = UNITS[unit];
  if (!u || u.dim === "count") return { dim: "count", v: qty };
  return { dim: u.dim, v: qty * u.f };
}

// ---- Formatting ----
const FRACS = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""]];

export function fmtQty(n) {
  if (n == null || isNaN(n)) return "";
  if (n > 0 && n < 1 / 16) return "<⅛"; // never show a real amount as 0
  if (n >= 20) return String(Math.round(n));
  if (n >= 10) return String(Math.round(n * 2) / 2).replace(".5", "½");
  const whole = Math.floor(n);
  const frac = n - whole;
  let best = FRACS[0], bestErr = 1;
  for (const f of FRACS) {
    const e = Math.abs(frac - f[0]);
    if (e < bestErr) { best = f; bestErr = e; }
  }
  if (bestErr > 0.04 && n < 1) return n < 1 / 8 ? "<⅛" : String(Math.round(n * 100) / 100);
  const w = best[0] === 1 ? whole + 1 : whole;
  const glyph = best[0] === 1 ? "" : best[1];
  if (!w && glyph) return glyph;
  return `${w || (glyph ? "" : 0)}${glyph}`;
}

function roundSmart(n) {
  if (n >= 100) return Math.round(n / 5) * 5;
  if (n >= 10) return Math.round(n);
  return Math.round(n * 10) / 10;
}

const UNIT_LABEL = { tsp: "tsp", tbsp: "tbsp", cup: "cup", floz: "fl oz", pint: "pint", quart: "quart", gallon: "gallon", ml: "ml", l: "L", g: "g", kg: "kg", oz: "oz", lb: "lb", mg: "mg", pinch: "pinch", dash: "dash" };

export function unitLabel(unit, n) {
  if (!unit) return "";
  if (UNIT_LABEL[unit]) {
    if ((unit === "cup" || unit === "pint" || unit === "quart" || unit === "gallon" || unit === "pinch" || unit === "dash") && n > 1) {
      return unit === "pinch" ? "pinches" : unit === "dash" ? "dashes" : unit + "s";
    }
    return UNIT_LABEL[unit];
  }
  const names = UNITS[unit]?.names || [unit];
  return n > 1 ? (names[1] || names[0]) : names[0];
}

// Friendly US volume: tsp → tbsp → cup.
export function usVolume(ml) {
  const tsp = ml / UNITS.tsp.f;
  if (tsp < 0.1) return { qty: tsp, unit: "tsp" };
  if (tsp < 3 - 0.01) return { qty: tsp, unit: "tsp" };
  const tbsp = ml / UNITS.tbsp.f;
  if (tbsp < 4 - 0.01) {
    // 1½ tbsp is friendlier than 4½ tsp
    return { qty: tbsp, unit: "tbsp" };
  }
  const cup = ml / UNITS.cup.f;
  if (cup >= 16) return { qty: ml / UNITS.gallon.f, unit: "gallon" };
  if (cup >= 8) return { qty: ml / UNITS.quart.f, unit: "quart" }; // 4½ cups reads better than 1⅛ quarts
  return { qty: cup, unit: "cup" };
}

// How a cook would measure a volume with US spoons and cups:
// "pinch", "¾ tsp", "1 tbsp + 1 tsp", "1½ tbsp", "½ cup + 1 tbsp", "⅓ cup + 2 tbsp", "4½ cups".
const CUP_FRACS = [[0, ""], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"]];
function spoons(tsp) {
  if (tsp < 0.09) return "pinch";
  if (tsp < 2.9) return `${fmtQty(Math.round(tsp * 8) / 8)} tsp`;
  tsp = Math.round(tsp * 2) / 2;
  const tb = Math.floor((tsp + 0.01) / 3), rem = tsp - tb * 3;
  if (Math.abs(rem - 1.5) < 0.01) return `${tb}½ tbsp`;
  if (rem < 0.01) return `${tb} tbsp`;
  return `${tb} tbsp + ${fmtQty(rem)} tsp`;
}
// exact: keep every teaspoon (for amounts written that way, like "1 cup + 2 tbsp + 1 tsp").
export function friendlyVolume(ml, exact = false) {
  if (!(ml > 0)) return "0 tsp";
  const tsp = ml / UNITS.tsp.f, cup = ml / UNITS.cup.f;
  if (cup < 0.24) return spoons(tsp);
  if (cup >= 16) { const gal = Math.round(ml / UNITS.gallon.f * 4) / 4; return `${fmtQty(gal)} ${gal > 1 ? "gallons" : "gallon"}`; }
  const whole = Math.floor(cup + 0.02), frac = Math.max(0, cup - whole);
  // The cup fraction that leaves a remainder of whole tablespoons (fewest leftovers; bigger fraction on a tie).
  let best = null;
  for (const f of CUP_FRACS) {
    if (f[0] > frac + 0.02) continue;
    const rem = Math.max(0, (frac - f[0]) * 48);
    const err = Math.abs(rem - Math.round(rem / 3) * 3);
    if (!best || err < best.err - 0.05 || (Math.abs(err - best.err) <= 0.05 && f[0] > best.f[0])) best = { f, rem, err };
  }
  let rem = whole >= 1 && !exact ? Math.round(best.rem / 3) * 3 : Math.round(best.rem * 2) / 2; // past a cup, under a tbsp is noise
  const amount = whole + best.f[0];
  const cups = `${whole || ""}${best.f[1]} ${amount > 1 ? "cups" : "cup"}`;
  if (!whole && !best.f[0]) return spoons(tsp);
  return rem >= 0.5 ? `${cups} + ${spoons(rem)}` : cups;
}
// "9 oz", "1½ lb", "1 lb 2 oz"
export function friendlyMass(g) {
  const oz = g / UNITS.oz.f;
  if (oz < 16) return `${fmtQty(oz < 1 ? oz : Math.round(oz * 4) / 4)} oz`;
  const lb = oz / 16, q = Math.round(lb * 4) / 4;
  if (Math.abs(lb - q) < 0.03) return `${fmtQty(q)} lb`;
  const whole = Math.floor(lb), rest = Math.round((lb - whole) * 16);
  return rest >= 16 ? `${whole + 1} lb` : `${whole} lb ${rest} oz`;
}

export function usMass(g) {
  const oz = g / UNITS.oz.f;
  if (oz >= 16) return { qty: g / UNITS.lb.f, unit: "lb" };
  return { qty: oz, unit: "oz" };
}

export function metricMass(g) {
  if (g >= 1000) return { qty: g / 1000, unit: "kg", dec: true };
  return { qty: g, unit: "g", dec: true };
}

export function metricVol(ml) {
  if (ml >= 1000) return { qty: ml / 1000, unit: "l", dec: true };
  return { qty: ml, unit: "ml", dec: true };
}

function fmtAmount(a) {
  if (!a) return "";
  const q = a.dec ? (a.unit === "kg" || a.unit === "l" ? Math.round(a.qty * 100) / 100 : roundSmart(a.qty)) : fmtQty(a.qty);
  const label = unitLabel(a.unit, a.qty);
  return `${q}${label ? " " + label : ""}`;
}

/**
 * Display amount for an ingredient at a servings multiplier, in a unit system.
 * mode: "original" | "us" | "metric"
 */
export function displayAmount(ing, mult = 1, mode = "original") {
  if (!ing || ing.qty == null) return "";
  const q = ing.qty * mult;
  const qMax = ing.qtyMax != null ? ing.qtyMax * mult : null;
  const u = ing.unit ? UNITS[ing.unit] : null;
  const sizeTxt = ing.size ? ` (${fmtQty(ing.size.qty)} ${unitLabel(ing.size.unit, ing.size.qty)})` : "";

  // Compound amounts ("1 tbsp + 1 tsp") read best re-expressed the same way, in US units.
  const usUnits = ["tsp", "tbsp", "cup", "floz", "oz", "lb"];
  if (mode === "original" && ing.compound && qMax == null && usUnits.includes(ing.unit)) {
    return u.dim === "mass" ? friendlyMass(q * u.f) : friendlyVolume(q * u.f, mult === 1);
  }
  if (mode === "us" && u && u.dim !== "count" && qMax == null) {
    return u.dim === "mass" ? friendlyMass(q * u.f) : friendlyVolume(q * u.f);
  }

  if (!u || u.dim === "count" || mode === "original") {
    const qtyTxt = qMax != null ? `${fmtQty(q)}–${fmtQty(qMax)}` : fmtQty(q);
    const label = ing.unit ? unitLabel(ing.unit, qMax ?? q) : "";
    return `${qtyTxt}${sizeTxt}${label ? " " + label : ""}`;
  }

  const conv = v => {
    if (u.dim === "mass") return mode === "metric" ? metricMass(v * u.f) : usMass(v * u.f);
    const ml = v * u.f;
    if (mode === "metric") {
      const f = ing.food;
      if (f && f.gCup && !f.liquid) return metricMass(ml * f.gCup / 236.588);
      return metricVol(ml);
    }
    return usVolume(ml);
  };
  const a = conv(q);
  if (qMax != null) {
    const b = conv(qMax);
    if (a.unit === b.unit) {
      const f = x => a.dec ? roundSmart(x) : fmtQty(x);
      return `${f(a.qty)}–${f(b.qty)} ${unitLabel(a.unit, b.qty)}`;
    }
  }
  return fmtAmount(a);
}

// Every useful equivalent for a quantity (used by tap-to-convert and the converter tool).
export function equivalents(qty, unit, food) {
  const u = UNITS[unit];
  if (!u || u.dim === "count" || !qty) return [];
  const out = [];
  let ml = null, g = null;
  if (u.dim === "vol") {
    ml = qty * u.f;
    if (food?.gCup) g = ml * food.gCup / 236.588;
  } else {
    g = qty * u.f;
    if (food?.gCup) ml = g / (food.gCup / 236.588);
  }
  if (ml != null) {
    const tsp = ml / UNITS.tsp.f, tbsp = ml / UNITS.tbsp.f, cup = ml / UNITS.cup.f;
    if (tsp <= 48) out.push(`${fmtQty(tsp)} tsp`);
    if (tbsp >= 0.5 && tbsp <= 64) out.push(`${fmtQty(tbsp)} tbsp`);
    if (cup >= 0.24) out.push(friendlyVolume(ml));
    else if (cup >= 0.125) out.push(`${fmtQty(cup)} cup`);
    if (ml >= 20) out.push(`${fmtQty(ml / UNITS.floz.f)} fl oz`);
    out.push(fmtAmount(metricVol(ml)));
  }
  if (g != null) {
    out.push(fmtAmount(metricMass(g)));
    out.push(fmtAmount(usMass(g)));
  }
  return [...new Set(out)];
}
