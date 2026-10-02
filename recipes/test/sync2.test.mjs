// Beta 2: meal plans and recipes merge field by field; equal-timestamp ties converge.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

const WK = "2026-10-05";
const pause = ms => new Promise(r => setTimeout(r, ms));

// A shared clock: frozen (every phone saves in the same millisecond) or real.
function clock(frozen) {
  let t = Date.now();
  return frozen ? () => t : () => Date.now();
}

async function phone(w, name, now, seed = {}) {
  const d = await device({ name, now, fetch: w.fetchFor(), seed: { "recipebox.v1": { settings: { proxy: w.base }, ...seed } } });
  return { ...d, store: await d.load("store"), sync: await d.load("sync") };
}

const RECIPE = { id: "r1", title: "Lentil Soup", ingredients: ["1 cup lentils"], steps: ["Simmer."], tags: ["dinner"], rating: 0, notes: "", updated: 1, created: 1 };

async function setup(frozen) {
  const now = clock(frozen);
  const w = makeWorker();
  const A = await phone(w, "A", now, { recipes: { r1: structuredClone(RECIPE), r2: { ...structuredClone(RECIPE), id: "r2", title: "Chili" } } });
  const B = await phone(w, "B", now);
  await A.sync.enable();
  await B.sync.enable(A.sync.info().code);
  await settle(A, B);
  return { w, A, B, now };
}

async function settle(...ps) {
  for (let i = 0; i < 12; i++) {
    const queued = ps.some(p => p.sync.info().pending > 0);
    let applied = 0;
    for (const p of ps) applied += (await p.sync.syncNow()).applied;
    if (!queued && !applied && ps.every(p => p.sync.info().pending === 0)) return;
  }
  throw new Error("sync did not settle");
}

// Run both phones' edits, sync in the given order, settle, then a third phone joins.
async function scenario(frozen, order, editA, editB) {
  const s = await setup(frozen);
  if (!frozen) await pause(5);
  editA(s.A);
  if (!frozen) await pause(15);
  editB(s.B);
  for (const n of order) await s[n].sync.syncNow();
  await settle(s.A, s.B);
  const C = await phone(s.w, "C", s.now);
  await C.sync.enable(s.A.sync.info().code);
  await settle(s.A, s.B, C);
  return { ...s, C };
}

const meals = p => (p.store.get().plan[WK]?.meals || []).map(m => `${m.id}:${m.rid}:${m.servings}:${m.slots.join("+")}`).sort();
const addMeal = (id, rid, slot, servings = 2) => p => { p.store.editWeek(WK).meals.push({ id, rid, servings, slots: [slot] }); p.store.save(); };
const edit = (id, fn) => p => { const r = p.store.recipe(id); fn(r); p.store.putRecipe(r); };

for (const frozen of [false, true]) for (const order of [["A", "B"], ["B", "A"]]) {
  const tag = `${frozen ? "same millisecond" : "15 ms apart"}, ${order.join(" then ")}`;

  test(`plan: different meals added on both phones are both kept (${tag})`, async () => {
    const { A, B, C } = await scenario(frozen, order, addMeal("m1", "r1", "mon-dinner"), addMeal("m2", "r2", "tue-lunch"));
    for (const p of [A, B, C]) assert.deepEqual(meals(p), ["m1:r1:2:mon-dinner", "m2:r2:2:tue-lunch"], p.name);
  });

  test(`plan: one phone changes servings while the other moves the same meal (${tag})`, async () => {
    const s = await scenario(frozen, order, addMeal("m1", "r1", "mon-dinner"), () => {});
    if (!frozen) await pause(5);
    const mA = s.A.store.week(WK).meals[0]; mA.servings = 6; s.A.store.save();
    if (!frozen) await pause(15);
    const mB = s.B.store.week(WK).meals[0]; mB.slots = ["wed-dinner"]; s.B.store.save();
    for (const n of order) await s[n].sync.syncNow();
    await settle(s.A, s.B, s.C);
    for (const p of [s.A, s.B, s.C]) assert.deepEqual(meals(p), ["m1:r1:6:wed-dinner"], p.name);
  });

  test(`plan: removing one meal while the other phone adds another (${tag})`, async () => {
    const s = await scenario(frozen, order, addMeal("m1", "r1", "mon-dinner"), () => {});
    if (!frozen) await pause(5);
    const wA = s.A.store.editWeek(WK); wA.meals = wA.meals.filter(m => m.id !== "m1"); s.A.store.save();
    if (!frozen) await pause(15);
    addMeal("m2", "r2", "thu-dinner")(s.B);
    for (const n of order) await s[n].sync.syncNow();
    await settle(s.A, s.B, s.C);
    for (const p of [s.A, s.B, s.C]) assert.deepEqual(meals(p), ["m2:r2:2:thu-dinner"], p.name);
  });


}



test("plan: 'Clear this week' on one phone keeps a meal the other phone added meanwhile; swap days merges too", async () => {
  const s = await scenario(false, ["A", "B"], addMeal("m1", "r1", "mon-dinner"), addMeal("m2", "r2", "tue-dinner"));
  await pause(5);
  s.A.store.editWeek(WK).meals = []; s.A.store.save();                 // Clear this week (sees m1, m2)
  await pause(15);
  addMeal("m3", "r1", "fri-lunch")(s.B);                                // B adds m3 before seeing the clear
  await s.A.sync.syncNow(); await s.B.sync.syncNow(); await settle(s.A, s.B, s.C);
  for (const p of [s.A, s.B, s.C]) assert.deepEqual(meals(p), ["m3:r1:2:fri-lunch"], p.name);
  // Swap Fri ↔ Sat on A while B changes the meal's servings
  await pause(5);
  s.A.store.week(WK).meals[0].slots = ["sat-lunch"]; s.A.store.save();
  await pause(15);
  s.B.store.week(WK).meals[0].servings = 4; s.B.store.save();
  await s.B.sync.syncNow(); await s.A.sync.syncNow(); await settle(s.A, s.B, s.C);
  for (const p of [s.A, s.B, s.C]) assert.deepEqual(meals(p), ["m3:r1:4:sat-lunch"], p.name);
});
