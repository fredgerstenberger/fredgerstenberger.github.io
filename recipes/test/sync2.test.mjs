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

  test(`recipe: rating on one phone and notes on the other are both kept (${tag})`, async () => {
    const { A, B, C } = await scenario(frozen, order, edit("r1", r => { r.rating = 5; }), edit("r1", r => { r.notes = "less salt"; }));
    for (const p of [A, B, C]) {
      assert.equal(p.store.recipe("r1").rating, 5, p.name);
      assert.equal(p.store.recipe("r1").notes, "less salt", p.name);
    }
  });

  test(`recipe: the same field edited on both phones converges everywhere (${tag})`, async () => {
    const { A, B, C } = await scenario(frozen, order, edit("r1", r => { r.title = "Soup A"; }), edit("r1", r => { r.title = "Soup B"; }));
    const titles = [A, B, C].map(p => p.store.recipe("r1").title);
    assert.equal(new Set(titles).size, 1, titles.join(" / "));
    if (!frozen) assert.equal(titles[0], "Soup B", "later edit wins");
  });
}

test("recipe: deleted on one phone, edited later on the other: the later edit keeps it", async () => {
  const s = await setup(false);
  s.A.store.deleteRecipe("r1");
  await pause(15);
  edit("r1", r => { r.rating = 4; })(s.B);
  await s.A.sync.syncNow(); await s.B.sync.syncNow(); await settle(s.A, s.B);
  for (const p of [s.A, s.B]) assert.equal(p.store.recipe("r1")?.rating, 4, p.name);
});

test("recipe: edited on one phone, deleted later on the other: the delete wins", async () => {
  const s = await setup(false);
  edit("r1", r => { r.rating = 4; })(s.B);
  await pause(15);
  s.A.store.deleteRecipe("r1");
  await s.B.sync.syncNow(); await s.A.sync.syncNow(); await settle(s.A, s.B);
  for (const p of [s.A, s.B]) assert.equal(p.store.recipe("r1"), undefined, p.name);
});

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

// ---- Compatibility with older app versions ----
test("older app versions: whole plan/recipe records in the box still merge with updated phones", async () => {
  const s = await setup(false);
  addMeal("m1", "r1", "mon-dinner")(s.A);
  await settle(s.A, s.B);
  const box = s.A.sync.info().code;
  const post = async changes => (await s.w.call("/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ box, since: 0, changes }) })).json();
  const recs = (await post([])).records;
  const oldPlan = structuredClone(recs.find(r => r.k === "p:" + WK).v);
  const oldRecipe = structuredClone(recs.find(r => r.k === "r:r1").v);
  // The old app (copies _ft along untouched) adds a meal and rates the recipe…
  oldPlan.meals.push({ id: "m9", rid: "r2", servings: 3, slots: ["sun-dinner"] });
  oldRecipe.rating = 5;
  await pause(15);
  // …while an updated phone moves m1 and writes a note.
  s.B.store.week(WK).meals.find(m => m.id === "m1").slots = ["wed-dinner"]; s.B.store.save();
  edit("r1", r => { r.notes = "less salt"; })(s.B);
  await pause(5);
  await post([{ k: "p:" + WK, u: Date.now(), v: oldPlan }, { k: "r:r1", u: Date.now(), v: oldRecipe }]);
  await settle(s.A, s.B);
  for (const p of [s.A, s.B]) {
    assert.deepEqual(meals(p), ["m1:r1:2:wed-dinner", "m9:r2:3:sun-dinner"], p.name);
    assert.equal(p.store.recipe("r1").rating, 5, p.name);
    assert.equal(p.store.recipe("r1").notes, "less salt", p.name);
    assert.equal(p.store.recipe("r1")._ft, undefined, "no stray _ft in the recipe");
  }
  // An old app's delete (whole-record null) still deletes.
  await pause(5);
  await post([{ k: "r:r2", u: Date.now(), v: null }]);
  await settle(s.A, s.B);
  for (const p of [s.A, s.B]) assert.equal(p.store.recipe("r2"), undefined, p.name);
});

test("a phone upgrading from version 15 re-sends nothing and merges plans and recipes from then on", async () => {
  const s = await setup(false);
  addMeal("m1", "r1", "mon-dinner")(s.A);
  await settle(s.A, s.B);
  // B's saved sync state as version 15 left it: no field times for plans/recipes, field-merge version 1.
  const meta = JSON.parse(s.B.env.localStorage.getItem("recipebox.sync"));
  for (const k of Object.keys(meta.ft)) if (k.startsWith("p:") || k.startsWith("r:")) delete meta.ft[k];
  delete meta.fv;
  const B2d = await device({ name: "B2", fetch: s.w.fetchFor(), seed: { "recipebox.v1": s.B.env.localStorage.getItem("recipebox.v1"), "recipebox.sync": meta } });
  const B2 = { ...B2d, store: await B2d.load("store"), sync: await B2d.load("sync") };
  B2.sync.start();
  assert.equal(B2.sync.info().pending, 0, "nothing re-sent after the upgrade");
  await pause(5);
  edit("r1", r => { r.rating = 3; })(s.A);
  await pause(15);
  edit("r1", r => { r.notes = "double it"; })(B2);
  await B2.sync.syncNow(); await s.A.sync.syncNow(); await settle(s.A, B2);
  for (const p of [s.A, B2]) {
    assert.equal(p.store.recipe("r1").rating, 3, p.name);
    assert.equal(p.store.recipe("r1").notes, "double it", p.name);
  }
});
