// Ingredient parsing and the grocery list (issue 4).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const d = await device({ name: "parse" });
const { parseIngredient, toGrams } = await d.load("ingredients");
const store = await d.load("store");
const { buildList } = await d.load("grocery");

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} ≈ ${b}`);

test("'1 dozen eggs' is 12 eggs", () => {
  const i = parseIngredient("1 dozen eggs");
  assert.equal(i.qty, 12);
  assert.equal(i.name, "eggs");
  assert.equal(i.food?.name, "eggs");
  assert.equal(parseIngredient("2 dozen eggs").qty, 24);
  assert.equal(parseIngredient("1/2 dozen eggs").qty, 6);
  assert.equal(parseIngredient("a dozen eggs").qty, 12);
});

test("'2 x 14oz cans tomatoes' is 2 cans (14 oz) of canned tomatoes", () => {
  const i = parseIngredient("2 x 14oz cans tomatoes");
  assert.equal(i.qty, 2);
  assert.equal(i.unit, "can");
  assert.deepEqual(i.size, { qty: 14, unit: "oz" });
  assert.equal(i.food?.aisle, "canned");
  near(toGrams(i), 2 * 14 * 28.3495, "grams");
});

test("'1 x 400g tin coconut milk' is 1 tin (400 g)", () => {
  const i = parseIngredient("1 x 400g tin coconut milk");
  assert.equal(i.qty, 1);
  assert.equal(i.unit, "can");
  assert.deepEqual(i.size, { qty: 400, unit: "g" });
  assert.equal(i.food?.name, "coconut milk");
  near(toGrams(i), 400, "grams");
});

test("'2 x 200g chicken breasts' is 400 g of chicken", () => {
  const i = parseIngredient("2 x 200g chicken breasts");
  assert.equal(i.food?.name, "chicken breast");
  near(toGrams(i), 400, "grams");
});

test("compound amounts are added up", () => {
  let i = parseIngredient("1 tbsp + 1 tsp oil");
  assert.equal(i.name, "oil");
  assert.equal(i.unit, "tbsp");
  near(i.qty, 1 + 1 / 3, "tbsp");
  i = parseIngredient("1/3 cup + 2 tbsp sugar");
  assert.equal(i.name, "sugar");
  assert.equal(i.unit, "cup");
  near(i.qty, 1 / 3 + 2 / 16, "cups");
  i = parseIngredient("1 pound 2 ounces flour");
  assert.equal(i.name, "flour");
  assert.equal(i.unit, "lb");
  near(i.qty, 1.125, "lb");
  i = parseIngredient("1 cup plus 2 tablespoons milk");
  assert.equal(i.name, "milk");
  near(i.qty, 1.125, "cups");
});

test("things that look compound but aren't stay as they were", () => {
  assert.equal(parseIngredient("1 cup 2% milk").name, "2% milk");
  const r = parseIngredient("2-3 tbsp olive oil");
  assert.equal(r.qty, 2); assert.equal(r.qtyMax, 3); assert.equal(r.unit, "tbsp");
  assert.equal(parseIngredient("1 (14.5 oz) can diced tomatoes").size.qty, 14.5);
  assert.equal(parseIngredient("2 large eggs").qty, 2);
});

test("grocery list: '1 dozen eggs' + '2 eggs' is 14 eggs; x-format cans are canned goods", () => {
  const st = store.get();
  st.recipes = {
    a: { id: "a", title: "Frittata", yield: 4, ingredients: ["1 dozen eggs", "2 x 14oz cans tomatoes", "1 x 400g tin coconut milk"], steps: [] },
    b: { id: "b", title: "Toast", yield: 4, ingredients: ["2 eggs"], steps: [] }
  };
  st.plan = { "2026-09-28": { meals: [{ rid: "a", day: 0, slot: "dinner", servings: 4 }, { rid: "b", day: 1, slot: "breakfast", servings: 4 }] } };
  const list = buildList("2026-09-28");
  const by = n => list.find(x => x.name === n);
  const eggs = by("eggs");
  assert.ok(eggs, "eggs on the list");
  near(eggs.grams / eggs.food.gEach, 14, "eggs");
  const tom = list.find(x => x.food?.aisle === "canned" && /tomato/.test(x.name));
  assert.ok(tom, "canned tomatoes on the list: " + list.map(x => x.name).join(", "));
  assert.match(tom.amount, /^2 cans/);
  assert.ok(!list.some(x => x.food?.aisle === "produce" && /tomato/.test(x.name)), "no fresh tomatoes");
  assert.match(by("coconut milk").amount, /^1 can/);
});
