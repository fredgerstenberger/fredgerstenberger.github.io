// Ingredient text: "half and half" is a name, and commas inside numbers ("1,000 g", "1,5 kg").
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const d = await device({ name: "parsing3" });
const Q = await d.load("quickadd");
const { parseIngredient } = await d.load("ingredients");

// ---- (2) "half and half" is a name ----
const HALF = [
  // typed, qty, unit, name, food
  ["half and half", null, null, "half and half", "half and half"],
  ["half & half", null, null, "half & half", "half and half"],
  ["half-and-half", null, null, "half-and-half", "half and half"],
  ["1 cup half and half", 1, "cup", "half and half", "half and half"],
  ["2 tbsp half-and-half", 2, "tbsp", "half-and-half", "half and half"],
  ["half a dozen eggs", 6, null, "eggs", "eggs"],
  ["half onion", 0.5, null, "onion", "onion"]
];
for (const [typed, qty, unit, name, food] of HALF) {
  test(`half: "${typed}"`, () => {
    const i = parseIngredient(typed);
    assert.deepEqual([i.qty, i.unit, i.name, i.food?.name], [qty, unit, name, food]);
  });
}
test(`half: the add box keeps "Half and half" as the name, with no amount`, () => {
  const p = Q.parseAdd("half and half");
  assert.deepEqual([p.name, p.amount, p.key], ["Half and half", "", "half and half"]);
});

// ---- (3) Commas in numbers ----
const COMMAS = [
  // typed, qty, unit, name
  ["1,000 g flour", 1000, "g", "flour"],
  ["10,000 mg salt", 10000, "mg", "salt"],
  ["1,234,567 g sugar", 1234567, "g", "sugar"],
  ["1,5 kg potatoes", 1.5, "kg", "potatoes"],
  ["2,25 kg potatoes", 2.25, "kg", "potatoes"],
  ["0,5 l milk", 0.5, "l", "milk"],
  ["1,5-2 kg potatoes", 1.5, "kg", "potatoes"],
  ["chicken, 2 lb", null, null, "chicken"],
  ["2 lb chicken, cut into 1,5 cm pieces", 2, "lb", "chicken"]
];
for (const [typed, qty, unit, name] of COMMAS) {
  test(`commas: "${typed}"`, () => {
    const i = parseIngredient(typed);
    assert.deepEqual([i.qty, i.unit, i.name], [qty, unit, name]);
  });
}
test("commas: a can size with a decimal comma, and the add box", () => {
  const i = parseIngredient("1 (14,5 oz) can diced tomatoes");
  assert.deepEqual([i.qty, i.size?.qty, i.size?.unit, i.unit], [1, 14.5, "oz", "can"]);
  assert.deepEqual([Q.parseAdd("1,000 g flour").amount, Q.parseAdd("1,5 kg potatoes").amount], [Q.parseAdd("1000 g flour").amount, Q.parseAdd("1.5 kg potatoes").amount]);
  assert.equal(parseIngredient("1,5-2 kg potatoes").qtyMax, 2);
});

