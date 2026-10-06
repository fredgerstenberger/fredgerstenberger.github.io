// Everyone in a shared box rates a recipe; the average is what's shown.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

const RECIPE = { id: "r1", title: "Lentil Soup", ingredients: ["1 cup lentils"], steps: ["Simmer."], updated: 1, created: 1 };

async function phone(w, name, seed = {}) {
  const d = await device({ name, fetch: w.fetchFor(), seed: { "recipebox.v1": { settings: { proxy: w.base }, ...seed } } });
  return { ...d, store: await d.load("store"), sync: await d.load("sync"), R: await d.load("ratings") };
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
async function pair(recipe = RECIPE) {
  const w = makeWorker();
  const A = await phone(w, "A", { recipes: { r1: structuredClone(recipe) } }), B = await phone(w, "B");
  await A.sync.enable(); await B.sync.enable(A.sync.info().code); await settle(A, B);
  return { w, A, B };
}

for (const order of [["A", "B"], ["B", "A"]]) {
  test(`two people rating at the same time both count; the average shows (${order.join(" then ")})`, async () => {
    const s = await pair();
    s.A.R.setMyName("Fred"); s.B.R.setMyName("Emma");
    s.A.R.rate(s.A.store.recipe("r1"), 5);
    s.B.R.rate(s.B.store.recipe("r1"), 3);
    for (const n of order) await s[n].sync.syncNow();
    await settle(s.A, s.B);
    for (const p of [s.A, s.B]) {
      const r = p.R.ratingOf(p.store.recipe("r1"));
      assert.equal(r.avg, 4, p.name);
      assert.equal(r.count, 2, p.name);
    }
    assert.equal(s.A.R.ratingOf(s.A.store.recipe("r1")).mine, 5);
    assert.equal(s.B.R.ratingOf(s.B.store.recipe("r1")).mine, 3);
    assert.deepEqual(s.A.R.ratingOf(s.A.store.recipe("r1")).others, [{ name: "Emma", stars: 3 }]);
  });
}

test("changing or clearing your own rating doesn't touch anyone else's", async () => {
  const s = await pair();
  s.A.R.rate(s.A.store.recipe("r1"), 5); s.B.R.rate(s.B.store.recipe("r1"), 3); await settle(s.A, s.B);
  s.B.R.rate(s.B.store.recipe("r1"), 4); await settle(s.A, s.B);
  assert.equal(s.A.R.ratingOf(s.A.store.recipe("r1")).avg, 4.5);
  s.A.R.rate(s.A.store.recipe("r1"), 0); await settle(s.A, s.B);
  const r = s.B.R.ratingOf(s.B.store.recipe("r1"));
  assert.deepEqual([r.avg, r.count, r.mine], [4, 1, 4]);
  s.B.R.rate(s.B.store.recipe("r1"), 0); await settle(s.A, s.B);
  assert.deepEqual([s.A.R.ratingOf(s.A.store.recipe("r1")).avg, s.A.R.ratingOf(s.A.store.recipe("r1")).count], [0, 0]);
});

test("the same name on two devices counts as one person; setting a name keeps your ratings", async () => {
  const s = await pair();
  s.A.R.rate(s.A.store.recipe("r1"), 2);              // before choosing a name
  s.A.R.setMyName("Fred");
  assert.equal(s.A.R.ratingOf(s.A.store.recipe("r1")).mine, 2, "rating moved to the name");
  await settle(s.A, s.B);
  s.B.R.setMyName("fred ");                            // Fred's iPad
  s.B.R.rate(s.B.store.recipe("r1"), 4);
  await settle(s.A, s.B);
  const r = s.A.R.ratingOf(s.A.store.recipe("r1"));
  assert.deepEqual([r.avg, r.count, r.mine], [4, 1, 4]);
});

test("a recipe rated before shared ratings keeps its old rating until someone rates it", async () => {
  const s = await pair({ ...RECIPE, rating: 4 });
  assert.deepEqual([s.B.R.ratingOf(s.B.store.recipe("r1")).avg, s.B.R.ratingOf(s.B.store.recipe("r1")).count], [4, 1]);
  s.B.R.rate(s.B.store.recipe("r1"), 2);               // first new rating takes the old one over
  await settle(s.A, s.B);
  const r = s.A.R.ratingOf(s.A.store.recipe("r1"));
  assert.deepEqual([r.avg, r.count], [2, 1]);
  assert.equal(s.A.store.recipe("r1").rating, 2, "rating kept as the rounded average for older app versions");
});

test("favorites are per person and both survive marking at the same time", async () => {
  const s = await pair();
  s.A.R.setMyName("Fred"); s.B.R.setMyName("Emma");
  s.A.R.setFavorite(s.A.store.recipe("r1"), true);
  s.B.R.setFavorite(s.B.store.recipe("r1"), true);
  await s.A.sync.syncNow(); await s.B.sync.syncNow();
  await settle(s.A, s.B);
  for (const p of [s.A, s.B]) {
    assert.equal(p.R.isFavorite(p.store.recipe("r1")), true, p.name);
    assert.equal(p.R.favoriteCount(p.store.recipe("r1")), 2, p.name);
  }
  // Fred unmarks: Emma's stays.
  s.A.R.setFavorite(s.A.store.recipe("r1"), false);
  await settle(s.A, s.B);
  assert.equal(s.B.R.isFavorite(s.B.store.recipe("r1")), true);
  assert.equal(s.A.R.isFavorite(s.A.store.recipe("r1")), false);
  assert.deepEqual(Object.keys(s.B.store.recipe("r1").favorites), ["n:emma"]);
});
