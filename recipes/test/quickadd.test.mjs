// Fast adding to the grocery list (item 3): parsing, merging, suggestions.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const d = await device({ name: "qa" });
const Q = await d.load("quickadd");

const CASES = [
  // typed, name, amount, key, aisle
  ["2 lb chicken thighs", "Chicken thighs", "2 lb", "chicken thighs", "meat"],
  ["milk", "Milk", "", "milk", "dairy"],
  ["3 bananas", "Bananas", "3", "banana", "produce"],
  ["a dozen eggs", "Eggs", "12", "eggs", "dairy"],
  ["paper towels", "Paper towels", "", "paper towel", null],
  ["  Cat litter  ", "Cat litter", "", "cat litter", null],
  ["2 cans black beans", "Black beans", "2 cans", "black beans", "canned"]
];
for (const [typed, name, amount, key, aisle] of CASES) {
  test(`parse: "${typed}"`, () => {
    const p = Q.parseAdd(typed);
    assert.deepEqual([p.name, p.amount, p.key, p.aisle], [name, amount, key, aisle]);
  });
}

test("adding something already on the list merges into its line", () => {
  assert.equal(Q.mergeAdd("2 eggs", Q.parseAdd("6 eggs")), "8 eggs");
  assert.equal(Q.mergeAdd("1 lb ground beef", Q.parseAdd("8 oz ground beef")), "1½ lb ground beef");
  assert.equal(Q.mergeAdd("paper towels", Q.parseAdd("2 paper towels")), "2 paper towels");
  assert.equal(Q.mergeAdd("milk", Q.parseAdd("milk")), "milk");
  assert.equal(Q.mergeAdd("1 bag spinach", Q.parseAdd("5 oz spinach")), "1 bag spinach + 5 oz");
});

test("suggestions: your frequent items first, then the food table; amounts you typed are kept", () => {
  const history = { "chicken thighs": { name: "chicken thighs", n: 5, last: 2 }, "chickpeas": { name: "chickpeas", n: 1, last: 1 } };
  const s = Q.suggest("chi", history);
  assert.equal(s[0].name, "Chicken thighs");
  assert.equal(s[1].name, "Chickpeas");
  assert.ok(s.length > 2, "food table fills in more: " + s.map(x => x.name).join(", "));
  assert.equal(Q.suggest("2 lb chi", history)[0].text, "2 lb chicken thighs");
  assert.ok(!Q.suggest("chi", history, new Set(["chicken thighs"])).some(x => x.key === "chicken thighs"), "items already on the list are left out");
  assert.deepEqual(Q.suggest("c", history), [], "needs two letters");
});

test("quick-add chips: most frequent first, starters fill in, nothing already on the list", () => {
  const history = {};
  Q.noteAdded(history, Q.parseAdd("oat milk"), 1);
  Q.noteAdded(history, Q.parseAdd("cat litter"), 2);
  Q.noteAdded(history, Q.parseAdd("cat litter"), 3);
  const chips = Q.frequentItems(history, new Set(["eggs"]));
  assert.equal(chips[0], "Cat litter");
  assert.equal(chips[1], "Oat milk");
  assert.ok(!chips.includes("Eggs"));
  assert.equal(chips.length, 6);
});
