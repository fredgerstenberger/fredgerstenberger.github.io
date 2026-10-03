// Nutrition Facts labels: read the fields from pasted text (iPhone Live Text), check them, and turn them
// into the app's per-100 g food info. Shared by the app and the Worker (which checks what the vision model
// read the same way). Five nutrients only: calories, protein, carbs, fat, fiber.

// Mixed numbers and fractions first, so "1/2" isn't read as 1.
const NUM = String.raw`(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)`;

function num(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(",", ".");
  let m;
  if ((m = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/))) return +m[1] + +m[2] / +m[3];
  if ((m = t.match(/^(\d+)\s*\/\s*(\d+)$/))) return +m[2] ? +m[1] / +m[2] : null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

/** A label value: "7g" → 7, "<1g" → 0.5, "0g" → 0, "12 mg" → 0.012 (grams). null when not shown. */
function amount(text, label) {
  // The value may be on the next line ("Protein" then "17g"), as Live Text often splits them.
  const re = new RegExp(String.raw`${label}[^\d<\n]{0,24}(?:\n[^\d<\n]{0,8})?(<\s*)?${NUM}\s*(mg|g)?\b`, "i");
  const m = text.match(re);
  if (!m) return null;
  let v = num(m[2]);
  if (v == null) return null;
  if (m[1]) v = Math.min(v, 1) / 2; // "less than 1 g"
  if ((m[3] || "").toLowerCase() === "mg") v /= 1000;
  return Math.round(v * 10) / 10;
}

/**
 * Read a Nutrition Facts label from text. Forgiving: any order, labels split across lines, OCR's "O" for
 * zero, "<1g", "Includes 2g Added Sugars" and % Daily Values are fine.
 * Returns { servingText, grams, ml, household, servings, kcal, protein, carbs, fat, fiber } (null = not shown),
 * plus gramsFrom: "oz" when the label gave only ounces and grams were worked out from them.
 */
export function parseLabelText(input) {
  const text = String(input || "")
    .replace(/ /g, " ")
    .replace(/(\s|^)[oO](\s*m?g\b)/g, "$10$2")       // OCR: "Og" → "0g"
    .replace(/(\d)\s*[oO](\s*m?g\b)/g, "$10$2")       // "1Og" → "10g"
    .replace(/[ \t]+/g, " ");
  const out = { servingText: null, grams: null, ml: null, household: null, servings: null, kcal: null, protein: null, carbs: null, fat: null, fiber: null };

  let m = text.match(new RegExp(String.raw`${NUM}\s*servings?\s*per\s*(?:container|package|pack)`, "i"))
    || text.match(new RegExp(String.raw`servings?\s*per\s*(?:container|package|pack)\s*[:\-]?\s*(?:about|approx\.?|abt\.?)?\s*${NUM}`, "i"));
  if (m) out.servings = num(m[1]);

  m = text.match(/serving\s*size\s*[:\-]?\s*([^\n]+?)(?=\s*(?:\n|amount per|calories|servings? per|$))/i);
  if (m) {
    const s = m[1].trim().replace(/\s+/g, " ").replace(/[.,;]+$/, "");
    out.servingText = s;
    // "56g", "56 g", "56 Gram", "56 grams", "56 gr"
    const g = s.match(/(\d+(?:[.,]\d+)?)\s*(?:g|grams?|gr|gm)\b/i), ml = s.match(/(\d+(?:[.,]\d+)?)\s*m[lL]\b/);
    if (g) out.grams = num(g[1]);
    if (ml) out.ml = num(ml[1]);
    // Only ounces ("2 oz", not "fl oz"): converted, and the confirmation says so (gramsFrom: "oz").
    const oz = !g && !ml && s.match(/(?<!fl\.?\s*)\b(\d+(?:[.,]\d+)?)\s*oz\b/i);
    if (oz) { out.grams = Math.round(num(oz[1]) * 28.3495); out.gramsFrom = "oz"; }
    const house = s.replace(/\([^)]*\)/g, "").replace(/\b\d+(?:[.,]\d+)?\s*(?:g|grams?|gr|gm|ml)\b/gi, "").replace(/[()\/]+$/g, "").trim();
    if (house && /[a-z]/i.test(house)) out.household = house;
  }

  m = text.match(new RegExp(String.raw`calories(?!\s*from)[^\d\n]{0,12}\n?\s*${NUM}`, "i"));
  if (m) out.kcal = num(m[1]);

  out.protein = amount(text, String.raw`protein`);
  out.carbs = amount(text, String.raw`total\s*carb(?:ohydrate)?s?\.?`) ?? amount(text, String.raw`carbohydrates?`);
  out.fat = amount(text, String.raw`total\s*fat`) ?? amount(text, String.raw`(?<!saturated\s|trans\s|sat\.\s)\bfat\b`);
  out.fiber = amount(text, String.raw`(?:dietary\s*)?fib(?:er|re)`);
  return out;
}

/**
 * Do the calories roughly match the macros (4 kcal/g protein and carbs, 9 kcal/g fat)? Fiber and sugar
 * alcohols make real labels run a little low, so the tolerance is generous: 20% or 20 kcal.
 * Returns { expected, ok } (ok is null when there isn't enough to check).
 */
export function checkLabel(f) {
  if (f?.kcal == null || [f.protein, f.carbs, f.fat].every(v => v == null)) return { expected: null, ok: null };
  const expected = Math.round(4 * (f.protein || 0) + 4 * (f.carbs || 0) + 9 * (f.fat || 0));
  return { expected, ok: Math.abs(f.kcal - expected) <= Math.max(20, 0.2 * Math.max(f.kcal, expected)) };
}

/** Clean up fields that came from a model or a form: numbers only, sensible ranges, null when missing. */
export function normalizeLabel(raw) {
  const f = raw || {};
  const n = (v, max) => { const x = typeof v === "number" ? v : num(String(v ?? "").replace(/[^\d.,\/ ]/g, "")); return x == null || isNaN(x) || x < 0 || x > max ? null : Math.round(x * 10) / 10; };
  const t = v => (v == null || v === "" ? null : String(v).trim().slice(0, 80) || null);
  return {
    servingText: t(f.servingText ?? f.serving_size ?? f.servingSize),
    ...(f.gramsFrom === "oz" ? { gramsFrom: "oz" } : {}),
    grams: n(f.grams ?? f.serving_grams ?? f.servingGrams, 5000),
    ml: n(f.ml ?? f.serving_ml ?? f.servingMl, 5000),
    household: t(f.household ?? f.household_measure ?? f.householdMeasure),
    servings: n(f.servings ?? f.servings_per_container ?? f.servingsPerContainer, 1000),
    kcal: n(f.kcal ?? f.calories, 5000),
    protein: n(f.protein, 1000),
    carbs: n(f.carbs ?? f.total_carbs ?? f.carbohydrates, 1000),
    fat: n(f.fat ?? f.total_fat, 1000),
    fiber: n(f.fiber ?? f.dietary_fiber, 1000)
  };
}

const VOL = { cup: 1, cups: 1, c: 1, tbsp: 1 / 16, tablespoon: 1 / 16, tablespoons: 1 / 16, tsp: 1 / 48, teaspoon: 1 / 48, teaspoons: 1 / 48, "fl oz": 1 / 8, floz: 1 / 8 };
const PIECES = /^(slices?|pieces?|pcs?|bars?|cookies?|crackers?|tortillas?|eggs?|links?|patties|patty|wraps?|bagels?|muffins?|buns?|rolls?|cakes?|sticks?|packets?|pouch(?:es)?|cans?|bottles?|containers?|cups? \(container\)|each|ea|nuggets?|chips?|pretzels?|balls?|squares?)$/i;

/** Weights from the household measure: "1/2 cup" → grams per cup; "2 slices" → grams each. */
export function householdWeights(f) {
  const out = {};
  if (!f.grams) return out;
  const h = String(f.household || "").toLowerCase().replace(/^(about|approx\.?|abt\.?|approximately)\s+/, "").trim();
  const m = h.match(new RegExp(String.raw`^${NUM}\s*(.+)$`));
  if (m) {
    const q = num(m[1]), unit = m[2].trim().replace(/\.$/, "");
    if (q > 0 && VOL[unit] != null) out.gCup = f.grams / (q * VOL[unit]);
    else if (q > 0 && PIECES.test(unit)) out.gEach = f.grams / q;
  }
  if (!out.gCup && f.ml) out.gCup = f.grams / (f.ml / 236.588);
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}

/**
 * The app's food info from a label: nutrition per 100 g, weights for cups / pieces when the label says,
 * and where it came from. Returns null if the serving's grams (or ml) aren't known.
 */
export function labelToFood(raw, { how = "photo", at = Date.now() } = {}) {
  const f = normalizeLabel(raw);
  const grams = f.grams || (f.ml ? f.ml : null); // a drink with only ml: about 1 g per ml
  if (!grams || f.kcal == null) return null;
  const per = v => (v == null ? 0 : Math.round(v * 100 / grams * 100) / 100);
  const entry = {
    nu: { kcal: per(f.kcal), protein: per(f.protein), carbs: per(f.carbs), fat: per(f.fat), fiber: per(f.fiber) },
    // nuRef keeps the "Your numbers" form (and older app versions) showing the label's own serving.
    nuRef: { qty: grams, unit: "g", kcal: f.kcal, protein: f.protein || 0, carbs: f.carbs || 0, fat: f.fat || 0 },
    label: { ...f, grams, how, at }
  };
  Object.assign(entry, householdWeights({ ...f, grams }));
  return entry;
}
