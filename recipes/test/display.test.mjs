// How amounts read on the recipe page, and timers in steps (issue 5).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const d = await device({ name: "display" });
const { parseIngredient, displayAmount, fmtQty } = await d.load("ingredients");
const { findTimes } = await d.load("timers");
const show = (line, mode = "original", mult = 1) => displayAmount(parseIngredient(line), mult, mode);

test("size words stay in the displayed name, but not in matching", () => {
  const onion = parseIngredient("1 large onion, diced");
  assert.equal(onion.display, "large onion");
  assert.equal(onion.name, "onion");
  assert.equal(onion.food?.name, "onion");
  assert.equal(parseIngredient("2 large eggs").display, "large eggs");
  assert.equal(parseIngredient("1 cup flour").display, "flour");
});

test("US units read the way a cook measures", () => {
  assert.equal(show("9 tbsp sugar", "us"), "½ cup + 1 tbsp");
  assert.equal(show("4 1/2 cups flour", "us"), "4½ cups");
  assert.equal(show("6 tbsp butter", "us"), "¼ cup + 2 tbsp");
  assert.equal(show("2 tbsp olive oil", "us"), "2 tbsp");
  assert.equal(show("1 1/2 tbsp honey", "us"), "1½ tbsp");
  assert.equal(show("3 tsp cumin", "us"), "1 tbsp");
  assert.equal(show("4 tsp cumin", "us"), "1 tbsp + 1 tsp");
  assert.equal(show("2/3 cup milk", "us"), "⅔ cup");
  assert.equal(show("1/4 cup milk", "us"), "¼ cup");
  assert.equal(show("2 cups rice", "us"), "2 cups");
  assert.equal(show("250 ml milk", "us"), "1 cup + 1 tbsp");
  assert.equal(show("1 cup sugar", "us", 0.5), "½ cup");
  assert.equal(show("1 tbsp sugar", "us", 3), "3 tbsp");
});

test("tiny amounts never show as 0", () => {
  assert.notEqual(fmtQty(0.01), "0");
  assert.equal(show("1/8 tsp salt", "us", 0.25), "pinch");
  assert.equal(show("1/8 tsp cayenne", "us"), "⅛ tsp");
  assert.notEqual(show("1/8 tsp salt", "original", 0.25), "0 tsp");
});

test("compound amounts read naturally in the recipe's own units", () => {
  assert.equal(show("1 tbsp + 1 tsp oil"), "1 tbsp + 1 tsp");
  assert.equal(show("1/3 cup + 2 tbsp sugar"), "⅓ cup + 2 tbsp");
  assert.equal(show("1 pound 2 ounces flour"), "1 lb 2 oz");
  assert.equal(show("1 tbsp + 1 tsp oil", "original", 3), "¼ cup");
});

test("ordinary amounts in original units are unchanged", () => {
  assert.equal(show("2 tbsp olive oil"), "2 tbsp");
  assert.equal(show("1 1/2 cups milk"), "1½ cups");
  assert.equal(show("2-3 tbsp lemon juice"), "2–3 tbsp");
  assert.equal(show("2 (14.5 oz) cans diced tomatoes"), "2 (14½ oz) cans");
  assert.equal(show("500g pasta", "metric"), "500 g");
});

test("timer ranges offer both ends", () => {
  const { timers } = findTimes("Simmer for 20 to 25 minutes, then rest 5 minutes.");
  assert.deepEqual(timers.map(t => t.min), [20, 25, 5]);
  assert.deepEqual(findTimes("Bake 1-2 hours").timers.map(t => t.text), ["1 hr", "2 hr"]);
  assert.deepEqual(findTimes("Cook 10 minutes").timers.map(t => t.min), [10]);
});

test("tap-to-convert lists measurable amounts", async () => {
  const { equivalents } = await d.load("ingredients");
  const eq = equivalents(9, "tbsp", null);
  assert.ok(eq.includes("½ cup + 1 tbsp"), eq.join(" | "));
  assert.ok(!eq.some(x => /0\.\d+ cup/.test(x)), eq.join(" | "));
});
