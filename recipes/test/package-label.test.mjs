// "2 loaves bread" with the bread's label pasted (per slice, 20 slices a loaf): nutrition and cost count whole
// loaves, from the label's own package size (serving size × servings per package).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const SANDWICH = { id: "s1", title: "Sandwiches", yield: 10, ingredients: ["2 loaves sandwich bread", "1 lb sliced turkey"], steps: [], tags: [] };
async function phone() {
  const d = await device({ name: "loaf", seed: { "recipebox.v1": { recipes: { s1: structuredClone(SANDWICH) } } } });
  return { ...d, store: await d.load("store"), L: await d.load("label"), N: await d.load("nutrition"), P: await d.load("prices"), I: await d.load("ingredients") };
}
const breadRow = (p, r) => p.N.nutritionFor(r).rows.find(x => /bread/.test(x.line));

test("a loaf is a package: without a label, the table's loaf weight", async () => {
  const p = await phone();
  const ing = p.I.parseIngredient("2 loaves sandwich bread");
  assert.equal(ing.unit, "loaf");
  assert.equal(ing.food.name, "bread");
  assert.equal(p.I.toGrams(ing), 2 * 567);
  assert.equal(p.I.parseIngredient("4 slices sandwich bread").unit, "slice", "slices still count as slices");
});

test("with the label pasted: 2 loaves = 2 × 20 servings of the label", async () => {
  const p = await phone();
  const label = { servingText: "1 slice (40g)", grams: 40, household: "1 slice", servings: 20, kcal: 110, protein: 5, carbs: 20, fat: 1.5, fiber: 3 };
  p.store.putFood("bread", p.L.labelToFood(label, { how: "photo", at: 1 }));
  const r = p.store.recipe("s1");
  const row = breadRow(p, r);
  assert.equal(Math.round(row.grams), 1600, "2 loaves × 20 slices × 40 g");
  assert.equal(Math.round(row.kcal), 4400, "2 × 20 × 110 kcal");
  assert.equal(Math.round(p.N.nutritionFor(r).kcal), Math.round((4400 + p.N.nutritionFor(r).rows.find(x => /turkey/.test(x.line)).kcal) / 10), "per serving: the recipe over its 10 servings");
  assert.equal(Math.round(p.I.toGrams(p.I.parseIngredient("4 slices sandwich bread"))), 160, "slices use the label's slice");
  // Priced per loaf: $4 a loaf → $8 for the recipe's two.
  p.store.setPrice("bread", 4, "p");
  const c = p.P.recipeCost(p.store.recipe("s1"));
  assert.equal(Math.round(c.rows.find(x => /bread/.test(x.line)).cost * 100) / 100, 8);
});

test("the grocery list says loaves; a price per each says what an each is", async () => {
  const p = await phone();
  const G = await p.load("grocery");
  assert.equal(G.pluralize("loaf", 3), "loaves");
  assert.equal(G.singular("loaves"), "loaf");
  assert.equal(p.P.basisLabel(p.I.parseIngredient("1 slice sandwich bread").food, "e"), "each (about 30 g)");
});

test("a label read interrupted by switching apps is sent again when you're back", async () => {
  const { resendIfInterrupted } = await import("../js/scan.js");
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  let calls = 0;
  const send = async () => {
    calls++;
    if (calls === 1) {
      doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange")); // you switch away…
      setTimeout(() => { doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange")); }, 10); // …and come back
      throw new TypeError("Load failed");
    }
    return "ok";
  };
  assert.equal(await resendIfInterrupted(send, doc), "ok");
  assert.equal(calls, 2);
  // A failure with the app open isn't retried.
  const doc2 = Object.assign(new EventTarget(), { visibilityState: "visible" });
  await assert.rejects(resendIfInterrupted(async () => { throw new TypeError("Load failed"); }, doc2), /Load failed/);
});
