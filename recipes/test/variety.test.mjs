// Grocery add box: variety words (oat/almond/soy, whole/2%/skim, salted/unsalted, …) keep products apart
// even when they share a food entry's nutrition and price.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const d = await device({ name: "variety" });
const Q = await d.load("quickadd");
const store = await d.load("store");
const house = await d.load("household");
const { addToList } = await d.load("grocery-add");
const WK = "2026-10-05";

// ---- (1) Variety words: different products that share a food entry stay separate ----
const DIFFERENT = [
  ["oat milk", "almond milk"], ["oat milk", "soy milk"], ["almond milk", "soy milk"],
  ["whole milk", "2% milk"], ["2% milk", "1% milk"], ["2% milk", "skim milk"], ["skim milk", "whole milk"], ["milk", "2% milk"],
  ["salted butter", "unsalted butter"], ["red bell pepper", "green bell pepper"], ["chicken broth", "low-sodium chicken broth"],
  ["light brown sugar", "dark brown sugar"], ["vanilla ice cream", "chocolate ice cream"], ["black olives", "green olives"]
];
for (const [a, b] of DIFFERENT) test(`variety: "${a}" and "${b}" are different items`, () => assert.notEqual(Q.parseAdd(a).key, Q.parseAdd(b).key));

const SAME = [
  ["peas", "green peas"], ["sugar", "white sugar"], ["onion", "yellow onion"], ["strawberries", "strawberry"], ["egg whites", "egg white"],
  ["seltzer", "sparkling water"], ["heavy cream", "heavy whipping cream"], ["2% milk", "1 gallon 2% milk"], ["organic 2% milk", "2% milk"],
  ["skim milk", "Skim Milk"], ["large eggs", "eggs"], ["rice", "white rice"]
];
for (const [a, b] of SAME) test(`variety: "${a}" and "${b}" are the same item`, () => assert.equal(Q.parseAdd(a).key, Q.parseAdd(b).key));

function freshWeek(ingredients = []) {
  const s = store.get();
  for (const k of Object.keys(s.household || {})) delete s.household[k];
  s.recipes = { r: { id: "r", title: "R", yield: 4, ingredients, steps: [] } };
  s.plan = ingredients.length ? { [WK]: { meals: [{ id: "1", rid: "r", servings: 4, slots: ["mon-dinner"] }] } } : {};
  s.grocery = {}; s.pantry = {}; s.history = {};
}
const lines = () => house.items().map(h => h.text);

// typed in order → results, and the lines you added afterwards
const FLOWS = [
  [[], ["oat milk", "almond milk", "soy milk"], ["added", "added", "added"], ["oat milk", "almond milk", "soy milk"]],
  [[], ["2% milk", "1 gallon skim milk"], ["added", "added"], ["2% milk", "1 gallon skim milk"]],
  [[], ["2% milk", "1 gallon 2% milk"], ["added", "merged"], ["1 gallon 2% milk"]],
  [[], ["almond milk", "unsweetened almond milk"], ["added", "added"], ["almond milk", "unsweetened almond milk"]],
  [["2 cups skim milk"], ["skim milk", "whole milk"], ["recipe", "added"], ["whole milk"]],
  [["2 cups milk"], ["2% milk", "milk"], ["added", "recipe"], ["2% milk"]],
  [["1 cup half and half"], ["half and half"], ["recipe"], []]
];
for (const [recipe, typed, results, after] of FLOWS) {
  test(`add flow: ${recipe.length ? `[recipe: ${recipe}] ` : ""}${typed.join(" → ")}`, () => {
    freshWeek(recipe);
    assert.deepEqual(typed.map(t => addToList(WK, t).result), results);
    assert.deepEqual(lines(), after);
  });
}


// ---- "Use for recipe": a different variety of a recipe's food can be folded into the recipe line ----
const { useForRecipe } = await d.load("grocery-add");
const { sectionize } = await d.load("grocery");
const recipeLine = k => sectionize(WK).buy.find(i => i.key === k);

const OFFERS = [
  // recipe lines, typed, offered for (recipe line key) or null
  [["2 cups milk"], "2% milk", "milk"],
  [["2 cups milk"], "1 gallon oat milk", null],          // different food (plant milk)
  [["2 cups skim milk"], "skim milk", null],             // same item: joins the line, nothing to offer
  [["2 cups milk"], "paper towels", null],
  [["1 cup heavy cream"], "ice cream", null],
  [["2 tbsp unsalted butter"], "salted butter", "butter"]
];
for (const [recipe, typed, offered] of OFFERS) {
  test(`use for recipe: [${recipe}] + "${typed}" → ${offered ? `offer for ${offered}` : "no offer"}`, () => {
    freshWeek(recipe);
    assert.equal(addToList(WK, typed).related?.key ?? null, offered);
  });
}

test("use for recipe: the recipe line takes the name and the amount; Undo puts both back", () => {
  freshWeek(["2 cups milk"]);
  const before = recipeLine("milk").amount;
  const r = addToList(WK, "1 gallon 2% milk");
  const undo = useForRecipe(WK, r.id, r.related.key);
  assert.deepEqual(lines(), []);
  assert.equal(recipeLine("milk").name, "2% milk");
  assert.equal(recipeLine("milk").amount, `${before.replace(/\s*\([^)]*\)/g, "")} + 1 gallon`);
  // Now it is 2% milk: adding it again joins the line instead of offering again.
  assert.equal(addToList(WK, "2% milk").result, "recipe");
  undo();
  assert.deepEqual(lines(), ["1 gallon 2% milk"]);
  assert.equal(recipeLine("milk").name, "milk");
});

test("use for recipe: a pantry question line is put on the list", () => {
  freshWeek(["1 tbsp honey"]);
  assert.ok(sectionize(WK).ask.some(i => i.key === "honey"));
  const r = addToList(WK, "raw honey");
  assert.equal(r.result, "recipe", "raw honey is the same item as honey: it simply joins");
  assert.equal(r.related ?? null, null);
  freshWeek(["2 tbsp unsalted butter"]);
  store.get().pantry.butter = undefined;
  const r2 = addToList(WK, "salted butter");
  assert.ok(useForRecipe(WK, r2.id, r2.related.key));
  assert.equal(store.get().pantry.butter, false);
  assert.equal(recipeLine("butter").name, "salted butter");
});
