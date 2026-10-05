// Store-bought meals: kept as a recipe with a `ready` field, planned like a recipe, bought as whole packages
// in Prepared foods, costed from the package price and counted from the label.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

const WK = "2026-10-05";

test("the record: one package line for older versions, servings as yield, label numbers per serving", async () => {
  const d = await device({ name: "rec" });
  const { readyRecord, isReady } = await d.load("ready");
  const r = readyRecord({ title: " Chicken Tikka Masala ", store: "Trader Joe's", price: "$4.99", servings: "2", meals: ["lunch"], nu: { kcal: "360", protein: 22, carbs: 40, fat: 12, fiber: 3, serving: "1 cup (283g)" } });
  assert.equal(r.title, "Chicken Tikka Masala");
  assert.equal(r.yield, 2);
  assert.deepEqual(r.ready, { store: "Trader Joe's", price: 4.99 });
  assert.deepEqual(r.ingredients, ["1 package Chicken Tikka Masala"]);
  assert.deepEqual(r.steps, []);
  assert.deepEqual(r.tags.sort(), ["lunch", "store-bought"]);
  assert.equal(r.nutrition.kcal, 360);
  assert.equal(r.nutrition.source, "label");
  assert.ok(isReady(r));
  assert.equal(readyRecord({ title: "  " }), null, "a name is required");
  // Editing keeps the id, ratings and notes; dropping the label drops the numbers.
  const e = readyRecord({ title: "Tikka", servings: 1, meals: ["dinner"] }, { ...r, notes: "spicy", ratings: { "n:fred": 5 } });
  assert.equal(e.id, r.id); assert.equal(e.notes, "spicy"); assert.deepEqual(e.ratings, { "n:fred": 5 });
  assert.equal(e.nutrition, undefined);
  assert.deepEqual(e.tags.sort(), ["dinner", "store-bought"]);
});

test("grocery list: whole packages for the servings planned, in Prepared foods, with the store and cost", async () => {
  const d = await device({ name: "groc" });
  const store = await d.load("store");
  const { readyRecord } = await d.load("ready");
  const { sectionize } = await d.load("grocery");
  const r = readyRecord({ title: "Chicken Tikka Masala", store: "Trader Joe's", price: 4.99, servings: 2, meals: ["lunch"] });
  const s = store.get();
  s.recipes = { [r.id]: r };
  s.plan = { [WK]: { meals: [{ id: "m1", rid: r.id, servings: 2, slots: ["mon-lunch"] }, { id: "m2", rid: r.id, servings: 1, slots: ["wed-lunch"] }] } };
  s.grocery = {}; s.pantry = {}; s.household = {};
  const { buy } = sectionize(WK);
  assert.equal(buy.length, 1);
  const it = buy[0];
  assert.equal(it.name, "Chicken Tikka Masala");
  assert.equal(it.aisle, "prepared");
  assert.equal(it.amount, "2 packages (Trader Joe's)"); // 3 servings, 2 per package
  assert.ok(Math.abs(it.cost - 9.98) < 1e-9);
});

test("cost and nutrition come from the package, not from the ingredient line", async () => {
  const d = await device({ name: "cost" });
  const { readyRecord } = await d.load("ready");
  const { recipeCost } = await d.load("prices");
  const { nutritionFor } = await d.load("nutrition");
  const { infoItems } = await d.load("fillin");
  const r = readyRecord({ title: "Mandarin Orange Chicken", price: 5.49, servings: 3, nu: { kcal: 320, protein: 15, carbs: 41, fat: 11 } });
  r.updated = 1;
  const c = recipeCost(r);
  assert.equal(c.total, 5.49); assert.ok(Math.abs(c.perServing - 1.83) < 0.01);
  assert.equal(nutritionFor(r).kcal, 320);
  assert.deepEqual(infoItems(r), [], "never asks to fill in its one line");
});

test("Store-bought chip: ready meals are only in the recipe book when asked for", async () => {
  const d = await device({ name: "book" });
  const { readyRecord } = await d.load("ready");
  const { matches } = await d.load("views/book");
  const r = readyRecord({ title: "Pad Thai", servings: 1 });
  assert.equal(matches(r, ":ready"), true);
  assert.equal(matches({ id: "x", title: "Soup", ingredients: [] }, ":ready"), false);
});

test("a store-bought meal syncs to the other phone like a recipe", async () => {
  const w = makeWorker();
  const mk = async name => { const x = await device({ name, fetch: w.fetchFor(), seed: { "recipebox.v1": { settings: { proxy: w.base } } } }); return { ...x, store: await x.load("store"), sync: await x.load("sync"), ready: await x.load("ready") }; };
  const A = await mk("A"), B = await mk("B");
  await A.sync.enable(); await B.sync.enable(A.sync.info().code);
  const r = A.ready.readyRecord({ title: "Tikka", store: "Trader Joe's", price: 4.99, servings: 2 });
  A.store.putRecipe(r);
  for (let i = 0; i < 4; i++) { await A.sync.syncNow(); await B.sync.syncNow(); }
  const got = B.store.recipe(r.id);
  assert.deepEqual(got?.ready, { store: "Trader Joe's", price: 4.99 });
  assert.equal(got.yield, 2);
});
