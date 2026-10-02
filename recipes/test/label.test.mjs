// Nutrition Facts labels: pasted text (iPhone Live Text), checks, and conversion to per-100 g food info.
import test from "node:test";
import assert from "node:assert/strict";
import { parseLabelText, checkLabel, normalizeLabel, labelToFood, householdWeights } from "../js/label.js";

// Realistic Live Text pastes: line breaks where the label has them, % Daily Values, noise.
const LABELS = {
  pasta: `Nutrition Facts
8 servings per container
Serving size 2 oz (56g)
Amount per serving
Calories 190
% Daily Value*
Total Fat 1g 1%
Saturated Fat 0g 0%
Trans Fat 0g
Cholesterol 0mg 0%
Sodium 0mg 0%
Total Carbohydrate 35g 13%
Dietary Fiber 4g 14%
Total Sugars 2g
Includes 0g Added Sugars 0%
Protein 10g 20%`,
  // Values on the line after their names, "Og" for zero, "<1g", "about" servings, household + grams
  yogurt: `Nutrition
Facts
Servings Per Container about 4
Serving Size
3/4 cup (170g)
Calories
100
Total Fat
<1g
Sodium 65mg
Total Carbohydrate
6g
Dietary Fiber
Og
Total Sugars 5g
Includes Og Added Sugars
Protein
17g`,
  // Drink: ml serving, different order, "Total Carb." abbreviation, decimal comma-free
  oatmilk: `Protein 3g
Total Carb. 16g 6%
Calories 120
Serving size 1 cup (240mL)
Total Fat 5g 6%
Fiber 2g
About 7 servings per container`,
  // Canadian bilingual label: "Fat / Lipides", "Carbohydrate / Glucides", "Fibre"
  bar: `Nutrition Facts / Valeur nutritive
Per 1 bar (60 g) / par 1 barre (60 g)
Serving size 1 bar (60g)
Calories 210
Fat / Lipides 7 g
Carbohydrate / Glucides 23 g
Fibre / Fibres 10 g
Sugars / Sucres 1 g
Protein / Protéines 20 g`
};

const EXPECT = {
  pasta: { servings: 8, servingText: "2 oz (56g)", grams: 56, ml: null, household: "2 oz", kcal: 190, protein: 10, carbs: 35, fat: 1, fiber: 4 },
  yogurt: { servings: 4, servingText: "3/4 cup (170g)", grams: 170, ml: null, household: "3/4 cup", kcal: 100, protein: 17, carbs: 6, fat: 0.5, fiber: 0 },
  oatmilk: { servings: 7, servingText: "1 cup (240mL)", grams: null, ml: 240, household: "1 cup", kcal: 120, protein: 3, carbs: 16, fat: 5, fiber: 2 },
  bar: { servings: null, servingText: "1 bar (60g)", grams: 60, ml: null, household: "1 bar", kcal: 210, protein: 20, carbs: 23, fat: 7, fiber: 10 }
};

for (const [name, text] of Object.entries(LABELS)) {
  test(`paste: ${name} label`, () => {
    const got = parseLabelText(text);
    for (const [k, v] of Object.entries(EXPECT[name])) assert.equal(got[k], v, `${name}.${k}`);
  });
}

test("paste: a label with nothing readable gives nulls, not guesses", () => {
  const got = parseLabelText("Ingredients: durum wheat semolina, niacin, iron");
  assert.ok(Object.values(got).every(v => v == null));
});

const CHECKS = [
  // fields, expected kcal from macros, ok?
  [{ kcal: 190, protein: 10, carbs: 35, fat: 1 }, 189, true],
  [{ kcal: 100, protein: 17, carbs: 6, fat: 0.5 }, 97, true],
  [{ kcal: 210, protein: 20, carbs: 23, fat: 7 }, 235, true],    // fiber-heavy bar: within 20%
  [{ kcal: 900, protein: 10, carbs: 35, fat: 1 }, 189, false],   // misread calories
  [{ kcal: 190, protein: 100, carbs: 35, fat: 1 }, 549, false],  // misread protein
  [{ kcal: 5, protein: 0, carbs: 1, fat: 0 }, 4, true],          // tiny values: 20 kcal floor
  [{ kcal: null, protein: 1, carbs: 2, fat: 3 }, null, null],
  [{ kcal: 100, protein: null, carbs: null, fat: null }, null, null]
];
CHECKS.forEach(([f, expected, ok], i) => test(`check #${i + 1}: ${JSON.stringify(f)} → ${ok}`, () => assert.deepEqual(checkLabel(f), { expected, ok })));

test("normalize: model output with strings, units and odd keys", () => {
  assert.deepEqual(normalizeLabel({ serving_size: "2 oz (56g)", serving_grams: "56", household_measure: "about 1/2 cup", servings_per_container: "8", calories: "190", protein: "10g", total_carbs: "35 g", total_fat: 1, fiber: null }),
    { servingText: "2 oz (56g)", grams: 56, ml: null, household: "about 1/2 cup", servings: 8, kcal: 190, protein: 10, carbs: 35, fat: 1, fiber: null });
  assert.equal(normalizeLabel({ calories: -5 }).kcal, null);
  assert.equal(normalizeLabel({ calories: 99999 }).kcal, null);
});

const WEIGHTS = [
  // household, grams, ml, → weights
  ["1/2 cup", 56, null, { gCup: 112 }],
  ["about 3/4 cup", 170, null, { gCup: 226.7 }],
  ["2 tbsp", 32, null, { gCup: 256 }],
  ["1 tsp", 4, null, { gCup: 192 }],
  ["2 slices", 50, null, { gEach: 25 }],
  ["1 bar", 60, null, { gEach: 60 }],
  ["2 oz", 56, null, {}],
  [null, 240, 240, { gCup: 236.6 }]
];
for (const [household, grams, ml, w] of WEIGHTS) test(`weights: ${household ?? `${ml} ml`}`, () => assert.deepEqual(householdWeights({ household, grams, ml }), w));

test("food info: per 100 g, the label's serving kept, where it came from", () => {
  const e = labelToFood(EXPECT.pasta, { how: "text", at: 1790900000000 });
  assert.deepEqual(e.nu, { kcal: 339.29, protein: 17.86, carbs: 62.5, fat: 1.79, fiber: 7.14 });
  assert.deepEqual(e.nuRef, { qty: 56, unit: "g", kcal: 190, protein: 10, carbs: 35, fat: 1 });
  assert.equal(e.label.how, "text");
  assert.equal(e.label.at, 1790900000000);
  assert.equal(e.label.servingText, "2 oz (56g)");
  const milk = labelToFood(EXPECT.oatmilk);
  assert.equal(milk.nu.kcal, 50);          // 120 kcal per 240 ml ≈ 240 g
  assert.equal(milk.gCup, 240);            // "1 cup (240 mL)"
  assert.equal(labelToFood({ kcal: 100 }), null, "no serving size: can't convert");
});
