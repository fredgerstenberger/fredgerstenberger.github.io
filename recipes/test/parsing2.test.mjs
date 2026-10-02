// Beta 2: minor parsing and display fixes (issue 4).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const d = await device({ name: "parse2" });
const { parseIngredient, toGrams, displayAmount } = await d.load("ingredients");
const store = await d.load("store");
const { buildList } = await d.load("grocery");

const CASES = [
  // input, qty, unit, name
  ["half a dozen eggs", 6, null, "eggs"],
  ["half dozen eggs", 6, null, "eggs"],
  ["2 + 1/2 cups flour", 2.5, "cup", "flour"],
  ["1 and 1/2 cups milk", 1.5, "cup", "milk"],
  ["1/0 cup flour", null, null, "flour"],
  ["0/0 tsp salt", null, null, "salt"]
];
for (const [line, qty, unit, name] of CASES) {
  test(`parse: ${line}`, () => {
    const i = parseIngredient(line);
    assert.equal(i.qty, qty);
    if (qty != null) assert.equal(i.unit, unit);
    assert.equal(i.name, name);
    if (qty == null) { assert.equal(toGrams(i), null); assert.equal(displayAmount(i), ""); }
  });
}

test("display: '1 cup + 2 tbsp + 1 tsp milk' keeps the teaspoon", () => {
  assert.equal(displayAmount(parseIngredient("1 cup + 2 tbsp + 1 tsp milk")), "1 cup + 2 tbsp + 1 tsp");
  assert.equal(displayAmount(parseIngredient("1 cup + 2 tbsp milk")), "1 cup + 2 tbsp");
});

test("grocery: two '1 dozen eggs' lines read '2 dozen (24 eggs)'; size descriptions don't scale", () => {
  const st = store.get();
  st.recipes = {
    a: { id: "a", title: "A", yield: 4, ingredients: ["1 dozen eggs", "2 (14.5 oz) cans diced tomatoes"], steps: [] },
    b: { id: "b", title: "B", yield: 4, ingredients: ["1 dozen eggs", "1 (14.5 oz) can diced tomatoes"], steps: [] }
  };
  st.plan = { "2026-10-05": { meals: [{ id: "1", rid: "a", servings: 4, slots: ["mon-dinner"] }, { id: "2", rid: "b", servings: 4, slots: ["tue-dinner"] }] } };
  const list = buildList("2026-10-05");
  assert.equal(list.find(x => x.name === "eggs").amount, "2 dozen (24 eggs)");
  assert.equal(list.find(x => x.name === "diced tomatoes").amount, "3 cans (14.5 oz)");
});
