// The grocery add box matches foods only when it's the same item (round 3, item 1). A longer name
// that contains a known food ("ice cream", "garlic bread") is its own item: its own line, its own
// aisle, and it never touches another line or a pantry answer.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const d = await device({ name: "addmatch" });
const Q = await d.load("quickadd");
const store = await d.load("store");
const house = await d.load("household");
const { addToList } = await d.load("grocery-add");
const { sectionize } = await d.load("grocery");
const WK = "2026-10-05";

// typed → name, amount, aisle, and the key it's matched by (its own name unless it's a known food)
const CASES = [
  ["ice cream", "Ice cream", "", "frozen", "ice cream"],
  ["garlic bread", "Garlic bread", "", "frozen", "garlic bread"],
  ["salt and vinegar chips", "Salt and vinegar chips", "", "snacks", "salt and vinegar chip"],
  ["orange chicken", "Orange chicken", "", "frozen", "orange chicken"],
  ["chicken nuggets", "Chicken nuggets", "", "frozen", "chicken nuggets"],
  ["2% milk", "2% milk", "", "dairy", "milk"],
  ["1 gallon 2% milk", "2% milk", "1 gallon", "dairy", "milk"],
  ["apple juice", "Apple juice", "", "drinks", "apple juice"],
  ["apple sauce", "Apple sauce", "", "canned", "applesauce"],
  ["corn flakes", "Corn flakes", "", "dry", "corn flake"],
  ["banana bread", "Banana bread", "", "bakery", "banana bread"],
  ["potato chips", "Potato chips", "", "snacks", "potato chips"],
  ["string cheese", "String cheese", "", "dairy", "string cheese"],
  ["pepper jack cheese", "Pepper jack cheese", "", "dairy", "pepper jack"],
  ["egg rolls", "Egg rolls", "", "frozen", "egg rolls"],
  ["coconut water", "Coconut water", "", "drinks", "coconut water"],
  ["sparkling water", "Sparkling water", "", "drinks", "seltzer"],
  ["chocolate milk", "Chocolate milk", "", "dairy", "chocolate milk"],
  ["rose water", "Rose water", "", null, "rose water"],
  ["paper towels", "Paper towels", "", null, "paper towel"],
  // good matches keep working
  ["2 lb chicken thighs", "Chicken thighs", "2 lb", "meat", "chicken thighs"],
  ["3 avocados", "Avocados", "3", "produce", "avocado"],
  ["organic whole milk", "Organic whole milk", "", "dairy", "milk"],
  ["large brown eggs", "Large brown eggs", "", "dairy", "eggs"],
  ["heavy cream", "Heavy cream", "", "dairy", "heavy cream"]
];
for (const [typed, name, amount, aisle, key] of CASES) {
  test(`add box: "${typed}"`, () => {
    const p = Q.parseAdd(typed);
    assert.deepEqual([p.name, p.amount, p.aisle, p.key], [name, amount, aisle, key]);
  });
}

function fettuccineWeek() {
  const s = store.get();
  for (const k of Object.keys(s.household || {})) delete s.household[k];
  s.recipes = { f: { id: "f", title: "Fettuccine Alfredo", yield: 4, ingredients: ["1 cup heavy cream", "3 cloves garlic", "1 cup grated parmesan", "1 lb fettuccine", "1 tbsp white vinegar"], steps: [] } };
  s.plan = { [WK]: { meals: [{ id: "1", rid: "f", servings: 4, slots: ["mon-dinner"] }] } };
  s.grocery = {};
  s.pantry = { "white vinegar": true };
  s.history = {};
}
const lines = () => house.items().map(h => h.text);

test("add flow: longer names that contain a planned food are new lines; the planned lines are untouched", () => {
  fettuccineWeek();
  const before = JSON.stringify(sectionize(WK).buy.map(i => [i.key, i.amount, i.checked]));
  for (const t of ["ice cream", "garlic bread", "salt and vinegar chips", "chicken nuggets", "orange chicken"]) {
    assert.equal(addToList(WK, t, "Fred").result, "added", t);
  }
  assert.deepEqual(lines(), ["ice cream", "garlic bread", "salt and vinegar chips", "chicken nuggets", "orange chicken"]);
  assert.equal(JSON.stringify(sectionize(WK).buy.map(i => [i.key, i.amount, i.checked])), before);
  assert.equal(store.get().pantry["white vinegar"], true, "white vinegar stays in the pantry");
  assert.deepEqual(store.groceryState(WK).edits, {});
});

test("add flow: the same item still joins its line (recipe item or one you added)", () => {
  fettuccineWeek();
  assert.equal(addToList(WK, "2 cups heavy cream").result, "recipe");
  assert.match(store.groceryState(WK).edits["heavy cream"].amount, /\+ 2 cups$/);
  addToList(WK, "milk");
  const r = addToList(WK, "1 gallon 2% milk");
  assert.equal(r.result, "merged");
  assert.equal(lines().length, 1);
  // Typing the food you said you have puts it back on the list (that's asking for it).
  assert.equal(addToList(WK, "white vinegar").result, "recipe");
  assert.equal(store.get().pantry["white vinegar"], false);
});

test("add flow: a quick chip saved from older history ('garlic bread' keyed as garlic) still adds", () => {
  fettuccineWeek();
  const h = store.get().history;
  h.garlic = { name: "garlic bread", n: 3, last: 1 };
  const onList = new Set(sectionize(WK).buy.map(i => i.key));
  const chips = Q.frequentItems(h, onList);
  assert.ok(chips.includes("Garlic bread"));
  assert.equal(addToList(WK, "Garlic bread").result, "added");
});

test("recipe lines: a food inside a longer product name doesn't count as that food; fuzzy recipe matches still work", async () => {
  const { parseIngredient } = await d.load("ingredients");
  const food = l => parseIngredient(l).food?.name;
  assert.equal(food("1 loaf garlic bread"), "garlic bread");
  assert.equal(food("1 pint vanilla ice cream"), "ice cream");
  assert.equal(food("1/4 cup salt and vinegar chips, crushed"), "potato chips");
  assert.equal(food("1 cup apple juice"), "apple juice");
  assert.equal(food("1/2 cup coconut water"), "coconut water");
  assert.equal(food("2 lb boneless skinless chicken breasts"), "chicken breast");
  assert.equal(food("1 cup chicken stock or water"), "chicken broth");
  assert.equal(food("4 cloves garlic, minced"), "garlic");
  assert.equal(food("1 large yellow onion, diced"), "onion");
  assert.equal(food("1 cup 2% milk"), "milk");
  assert.equal(parseIngredient("2% milk").qty, null);
});

test("several things added in the same moment (a ?add= link) keep their order", () => {
  fettuccineWeek();
  const ids = ["a", "b", "c", "d", "e", "f"].map(t => house.add(t));
  assert.deepEqual(house.items().map(h => h.text), ["a", "b", "c", "d", "e", "f"]);
  assert.equal(new Set(house.items().map(h => h.at)).size, ids.length);
});
