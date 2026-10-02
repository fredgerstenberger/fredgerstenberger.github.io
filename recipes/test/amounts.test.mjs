// Buyable amounts on the grocery list (item 8): small amounts of packaged pantry foods become a
// package, or just the name when the food isn't in the table.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const d = await device({ name: "amounts" });
const store = await d.load("store");
const { buildList } = await d.load("grocery");

function list(lines) {
  const st = store.get();
  st.recipes = { a: { id: "a", title: "A", yield: 4, ingredients: lines, steps: [] } };
  st.plan = { "2026-10-05": { meals: [{ id: "1", rid: "a", servings: 4, slots: ["mon-dinner"] }] } };
  return Object.fromEntries(buildList("2026-10-05").map(i => [i.name, i.amount]));
}

test("item 8: a spoonful of a packaged pantry food is one package", () => {
  const l = list(["2 tbsp granola", "1 tbsp miso", "2 tbsp hemp hearts", "1 pinch saffron", "1 tsp cinnamon", "1 tbsp honey"]);
  assert.equal(l.granola, "1 bag (12 oz)");
  assert.equal(l.miso, "1 tub (14 oz)");
  assert.equal(l["hemp hearts"], "1 bag (8 oz)");
  assert.equal(l.saffron, "1 jar (0.5 g)");
  assert.equal(l.cinnamon, "1 jar (2.5 oz)");
  assert.equal(l.honey, "1 bottle (12 oz)");
});

test("item 8: a small amount of something not in the food table shows just the name", () => {
  const l = list(["1 tsp sumac", "2 tbsp za'atar mix", "1 oz bonito flakes"]);
  assert.equal(l.sumac, "");
  assert.equal(l["za'atar mix"], "");
  assert.equal(l["bonito flake"], "");
});

test("item 8: real quantities still show (large amounts, counts, fresh food by weight)", () => {
  const l = list(["3 cups sumac", "2 lb bonito flakes", "4 lotus roots", "1 lb chicken breast", "6 cups flour"]);
  assert.equal(l.sumac, "3 cups");
  assert.equal(l["bonito flake"], "2 lb");
  assert.equal(l["lotus root"], "4");
  assert.equal(l["chicken breast"], "1 lb");
  assert.equal(l.flour, "1 bag (5 lb)");
});
