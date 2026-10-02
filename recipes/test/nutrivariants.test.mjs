// Specific products keep their own nutrition (round 6, item 1): "protein pasta" is pasta for the aisle
// and price, but its nutrition comes from its own info, using pasta's numbers as a stand-in until then.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

async function phone(w, name) {
  const d = await device({ name, fetch: w.fetchFor(), seed: { "recipebox.v1": { settings: { proxy: w.base } } } });
  return { ...d, store: await d.load("store"), sync: await d.load("sync") };
}
async function settle(...ps) {
  for (let i = 0; i < 12; i++) {
    let applied = 0;
    for (const p of ps) applied += (await p.sync.syncNow()).applied;
    if (!applied && ps.every(p => p.sync.info().pending === 0)) return;
  }
  throw new Error("sync did not settle");
}

const d = await device({ name: "nutrivariants" });
const { parseIngredient } = await d.load("ingredients");
const { nutritionVariant } = await d.load("variants");
const { FOOD_BY_NAME } = await d.load("fooddb");
const { estimate } = await d.load("nutrition");
const { infoItems } = await d.load("fillin");
const { labelToFood } = await d.load("label");
const store = await d.load("store");

const KEYS = [
  // line, table food, own info key (null = just the table food)
  ["8 oz protein pasta", "pasta", "protein pasta"],
  ["8 oz chickpea pasta", "pasta", "chickpea pasta"],
  ["12 oz Barilla Protein+ penne", "pasta", "barilla protein pasta"],
  ["1 lb whole wheat spaghetti", "pasta", "whole wheat pasta"],
  ["1 cup red lentil pasta", "pasta", "lentil pasta"],
  ["2 cups skim milk", "milk", "skim milk"],
  ["1 cup 2% milk", "milk", "2% milk"],
  ["1 cup unsweetened almond milk", "plant milk", "unsweetened almond plant milk"],
  ["1 cup oat milk", "plant milk", "oat plant milk"],
  ["2 low-carb tortillas", "tortillas", "low-carb tortillas"],
  ["1 cup Fage nonfat greek yogurt", "greek yogurt", "fage nonfat greek yogurt"],
  // good matches stay plain
  ["2 lb boneless skinless chicken breasts", "chicken breast", null],
  ["1/4 cup fresh basil", "basil", null],
  ["1 red bell pepper, diced", "bell pepper", null],
  ["2 cups low-sodium chicken broth", "chicken broth", null],
  ["1 large yellow onion", "onion", null],
  ["1 cup whole milk", "milk", "whole milk"]
];
for (const [line, food, key] of KEYS) {
  test(`variant: "${line}" → ${key ?? food}`, () => {
    const i = parseIngredient(line);
    assert.equal(i.food?.name, food, "aisle, price and grocery follow the table food");
    assert.equal(i.food.infoKey ?? null, key);
    assert.equal(!!i.food.standIn, key != null, "a specific product uses the table food's numbers as a stand-in");
    if (key) assert.deepEqual(i.food.nu, FOOD_BY_NAME[food].nu, "stand-in = the table food's numbers");
  });
}

const RECIPE = { id: "r", title: "Protein pasta bake", yield: 4, ingredients: ["12 oz protein pasta", "1 lb ground turkey", "2 cups marinara sauce", "1 tsp salt", "1 tbsp olive oil"], steps: [] };

test("a label for the product replaces the stand-in, in every recipe that uses it", () => {
  const s = store.get(); s.foods = {};
  const before = estimate(RECIPE);
  const pastaRow = before.rows.find(r => r.key === "protein pasta");
  assert.equal(pastaRow.source, "standin");
  // Barilla Protein+: 56 g serving, 190 kcal, 10 g protein, 38 g carbs, 1 g fat, 5 g fiber
  store.putFood("protein pasta", labelToFood({ servingText: "2 oz (56g)", grams: 56, household: "2 oz", kcal: 190, protein: 10, carbs: 38, fat: 1, fiber: 5 }, { how: "photo", at: 1 }));
  const after = estimate(RECIPE);
  const row = after.rows.find(r => r.key === "protein pasta");
  assert.equal(row.source, "label");
  assert.ok(after.protein > before.protein + 3, `protein per serving ${before.protein.toFixed(1)} → ${after.protein.toFixed(1)}`);
  // Plain "pasta" elsewhere is unaffected.
  assert.equal(parseIngredient("1 lb pasta").food.standIn, undefined);
  assert.equal(parseIngredient("1 lb pasta").food.nu.kcal, 371);
});

test("a label for a plain table food is used for it too (your info wins)", () => {
  const s = store.get(); s.foods = {};
  store.putFood("pasta", labelToFood({ grams: 56, kcal: 200, protein: 7, carbs: 42, fat: 1, fiber: 2 }));
  const f = parseIngredient("1 lb pasta").food;
  assert.equal(f.label?.grams, 56);
  assert.equal(Math.round(f.nu.kcal), 357);
  s.foods = {};
});

test("Ingredient info lists the biggest contributors first; small ones only when you ask for all", () => {
  const s = store.get(); s.foods = {};
  const items = infoItems(RECIPE);
  assert.equal(items[0].key, "protein pasta", "the stand-in that matters most comes first");
  assert.ok(items[0].share > 0.2);
  assert.ok(items.every(it => it.key !== "salt"), "salt has nutrition and a price: nothing to ask");
  const variant = items.find(it => it.key === "protein pasta");
  assert.equal(variant.variant, true);
  assert.equal(variant.needPrice, false, "the price stays with pasta");
});

test("two phones: a label added on one improves the recipe on the other after syncing", async () => {
  const w = makeWorker();
  const A = await phone(w, "A"), B = await phone(w, "B");
  await A.sync.enable(); await B.sync.enable(A.sync.info().code); await settle(A, B);
  for (const p of [A, B]) { p.store.get().recipes = { r: { ...RECIPE, created: 1, updated: 1 } }; p.store.save(); }
  await settle(A, B);
  const LA = await A.load("label"), NB = await B.load("nutrition");
  const before = NB.nutritionFor(B.store.recipe("r")).protein;
  A.store.putFood("protein pasta", LA.labelToFood({ grams: 56, kcal: 190, protein: 10, carbs: 38, fat: 1, fiber: 5 }, { at: 2 }));
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  const after = NB.nutritionFor(B.store.recipe("r")).protein;
  assert.ok(after > before + 3, `${before.toFixed(1)} → ${after.toFixed(1)} g protein on the other phone`);
  assert.equal(B.store.get().foods["protein pasta"].label.grams, 56);
});

test("nutritionVariant directly: brands and percentages", () => {
  const food = { name: "milk" };
  assert.deepEqual(nutritionVariant("Fairlife 2% milk", food), { words: ["fairlife", "2%"], key: "fairlife 2% milk" });
  assert.equal(nutritionVariant("cold milk", food), null);
});
