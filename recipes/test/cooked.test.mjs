// Cooked meals: marked on the planned meal, synced to the other phone, and not asked about again there.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

const WK = "2026-10-05"; // Monday
const NOW = new Date(2026, 9, 7, 19); // Wednesday evening
const seed = { recipes: { r1: { id: "r1", title: "Chili", ingredients: ["1 lb beef"], steps: [], tags: [] } }, plan: { [WK]: { meals: [{ id: "m1", rid: "r1", servings: 4, slots: ["thu-lunch", "wed-dinner"] }] } } };

async function phone(w, name, withPlan) {
  const d = await device({ name, fetch: w.fetchFor(), now: () => NOW.getTime(), seed: { "recipebox.v1": { settings: { proxy: w.base }, ...(withPlan ? structuredClone(seed) : {}) } } });
  return { ...d, store: await d.load("store"), sync: await d.load("sync"), C: await d.load("cooked") };
}

test("cooked: the batch's first slot, synced to the other phone, and not asked about again", async () => {
  const w = makeWorker();
  const A = await phone(w, "cookA", true), B = await phone(w, "cookB", false);
  await A.sync.enable(); await B.sync.enable(A.sync.info().code);
  for (let i = 0; i < 3; i++) { await A.sync.syncNow(); await B.sync.syncNow(); }
  const b = A.C.plannedBatch("r1", NOW);
  assert.equal(b.slot, "wed-dinner", "cooked on its earliest slot, whatever order the slots are stored in");
  assert.equal(A.C.cookSlot(WK, A.store.week(WK).meals[0]), "wed-dinner");
  A.C.setCooked(b.key, b.meal.id, true);
  for (let i = 0; i < 3; i++) { await A.sync.syncNow(); await B.sync.syncNow(); }
  const mB = B.store.week(WK).meals[0];
  assert.ok(B.C.isCooked(mB), "Emma's phone sees it cooked");
  assert.equal(B.C.plannedBatch("r1", NOW), null, "so she isn't asked Done cooking? for it");
  // Unmarking on her phone comes back to his.
  B.C.setCooked(WK, "m1", false);
  for (let i = 0; i < 3; i++) { await B.sync.syncNow(); await A.sync.syncNow(); }
  assert.equal(A.C.isCooked(A.store.week(WK).meals[0]), false);
});
