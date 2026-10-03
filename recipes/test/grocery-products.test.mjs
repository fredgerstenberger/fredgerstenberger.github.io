// The grocery list built from recipes: a specific product (protein pasta, skim milk, a brand) gets its own
// line and name, keyed the way the add box keys it; generic lines merge as before, and a generic line joins
// the food's one specific line when that differs only in what-to-buy words (unsalted, a color).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const d = await device({ name: "products" });
const store = await d.load("store");
const { buildList, sectionize } = await d.load("grocery");
const Q = await d.load("quickadd");
const { addToList } = await d.load("grocery-add");
const WK = "2026-10-05";

// Each recipe gets one line, so "sources" shows which recipes a line came from.
function week(lines) {
  const s = store.get();
  s.recipes = Object.fromEntries(lines.map((l, i) => [`r${i}`, { id: `r${i}`, title: `R${i}`, yield: 4, ingredients: [l], steps: [] }]));
  s.plan = { [WK]: { meals: lines.map((_, i) => ({ id: `m${i}`, rid: `r${i}`, servings: 4, slots: ["mon-dinner"] })) } };
  s.grocery = {}; s.pantry = {}; s.household = {};
  return buildList(WK).map(i => [i.key, i.name]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

const CASES = [
  // recipe lines → [key, name] of each grocery line
  [["8 oz protein pasta", "8 oz pasta"], [["pasta", "pasta"], ["pasta (protein)", "protein pasta"]]],
  [["2 cups whole milk", "1 cup skim milk"], [["milk", "milk"], ["milk (skim)", "skim milk"]]],      // whole milk is the table's milk
  [["2 cups whole milk", "1 cup milk"], [["milk", "milk"]]],
  [["2 cups milk", "1 cup milk"], [["milk", "milk"]]],
  [["1 cup white sugar", "1 cup sugar"], [["sugar", "sugar"]]],
  [["2 tbsp butter", "1 tbsp unsalted butter"], [["butter (unsalted)", "unsalted butter"]]],             // generic joins it
  [["1 red bell pepper", "1 green bell pepper", "1 bell pepper"], [["bell pepper", "bell pepper"], ["bell pepper (green)", "green bell pepper"], ["bell pepper (red)", "red bell pepper"]]],
  [["2 cups milk", "1 cup 2% milk"], [["milk", "milk"], ["milk (2%)", "2% milk"]]],                         // 2% is its own product
  [["8 oz Barilla Protein+ penne", "8 oz protein pasta"], [["pasta (barilla protein)", "barilla protein pasta"], ["pasta (protein)", "protein pasta"]]],
  [["1 cup oat milk", "1 cup almond milk"], [["plant milk (almond)", "almond plant milk"], ["plant milk (oat)", "oat plant milk"]]]
];
for (const [lines, want] of CASES) {
  test(`grocery lines: ${lines.join(" + ")}`, () => {
    const got = week(lines);
    // Oat / almond milk: whatever the table calls the food, they must be two lines with their own words.
    if (lines[0].includes("oat milk")) { assert.equal(got.length, 2); assert.ok(got.every(([k]) => /\((oat|almond)\)$/.test(k)), JSON.stringify(got)); return; }
    assert.deepEqual(got, want);
  });
}

test("a specific product keeps its food's aisle, package and price", () => {
  week(["8 oz protein pasta", "8 oz pasta"]);
  const [plain, protein] = ["pasta", "pasta (protein)"].map(k => buildList(WK).find(i => i.key === k));
  assert.equal(protein.food.aisle, plain.food.aisle);
  assert.equal(protein.amount, plain.amount);
  assert.ok(protein.cost != null && protein.cost === plain.cost);
});

test("the joined generic line counts both amounts and both recipes", () => {
  week(["2 tbsp butter", "1 tbsp unsalted butter"]);
  const [line] = buildList(WK);
  assert.deepEqual(line.sources.sort(), ["R0", "R1"]);
  assert.equal(line.lines.length, 2);
});

test("the add box and the recipe lines agree: typing a recipe's product joins its line", () => {
  week(["8 oz protein pasta", "2 cups skim milk"]);
  for (const t of ["protein pasta", "1 box protein pasta", "skim milk"]) assert.equal(addToList(WK, t).result, "recipe", t);
  assert.equal(Q.parseAdd("protein pasta").key, "pasta (protein)");
});

test("pantry answers stay per food: having soy sauce covers a low-sodium soy sauce line", () => {
  week(["1 tbsp low-sodium soy sauce"]);
  store.get().pantry["soy sauce"] = true;
  const sec = sectionize(WK);
  assert.ok(sec.have.some(i => i.key.startsWith("soy sauce")), JSON.stringify(sec.have.map(i => i.key)));
});
