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

