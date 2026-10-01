// Two phones syncing through the real Worker code (issues 1 and 2).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

const WK = "2026-09-28";

async function phone(w, name, seed = {}) {
  const d = await device({ name, fetch: w.fetchFor(), seed: { "recipebox.v1": { settings: { proxy: w.base }, ...seed } } });
  const store = await d.load("store");
  const sync = await d.load("sync");
  return { ...d, store, sync };
}

// A turns on sync, B joins the same box.
async function pair(w) {
  const A = await phone(w, "A"), B = await phone(w, "B");
  await A.sync.enable();
  await B.sync.enable(A.sync.info().code);
  await A.sync.syncNow();
  return { A, B };
}

const check = (p, item, on = true) => {
  const g = p.store.groceryState(WK);
  if (on) g.checked[item] = true; else delete g.checked[item];
  p.store.save();
};
const checked = p => Object.keys(p.store.get().grocery[WK]?.checked || {}).sort();
const settle = async (...ps) => { for (let i = 0; i < 3; i++) for (const p of ps) await p.sync.syncNow(); };

for (const order of [["A", "B"], ["B", "A"]]) {
  test(`grocery: concurrent checks of different items both survive (sync order ${order.join(" then ")})`, async () => {
    const w = makeWorker();
    const ps = await pair(w);
    check(ps.A, "eggs");
    check(ps.B, "milk");
    for (const n of order) await ps[n].sync.syncNow();
    await settle(ps[order[0]], ps[order[1]]);
    assert.deepEqual(checked(ps.A), ["eggs", "milk"]);
    assert.deepEqual(checked(ps.B), ["eggs", "milk"]);
  });
}

test("grocery: an uncheck on one phone and a check on the other both apply", async () => {
  const w = makeWorker();
  const { A, B } = await pair(w);
  check(A, "eggs"); await settle(A, B);
  assert.deepEqual(checked(B), ["eggs"]);
  check(A, "eggs", false);
  check(B, "milk");
  await B.sync.syncNow(); await A.sync.syncNow();
  await settle(A, B);
  assert.deepEqual(checked(A), ["milk"]);
  assert.deepEqual(checked(B), ["milk"]);
});

test("grocery: items added on both phones at once are all kept, in a stable order", async () => {
  const w = makeWorker();
  const { A, B } = await pair(w);
  A.store.groceryState(WK).extras.push({ id: "a1", text: "paper towels", checked: false, at: 1000 }); A.store.save();
  B.store.groceryState(WK).extras.push({ id: "b1", text: "dish soap", checked: false, at: 2000 }); B.store.save();
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  const texts = p => p.store.get().grocery[WK].extras.map(e => e.text);
  assert.deepEqual(texts(A), ["paper towels", "dish soap"]);
  assert.deepEqual(texts(B), ["paper towels", "dish soap"]);
  // Checking one extra while the other phone removes another
  A.store.groceryState(WK).extras[0].checked = true; A.store.save();
  const g = B.store.groceryState(WK); g.extras = g.extras.filter(e => e.id !== "b1"); B.store.save();
  await B.sync.syncNow(); await A.sync.syncNow(); await settle(A, B);
  for (const p of [A, B]) assert.deepEqual(p.store.get().grocery[WK].extras.map(e => [e.text, e.checked]), [["paper towels", true]]);
});

test("pantry and settings: different fields edited at once both survive", async () => {
  const w = makeWorker();
  const { A, B } = await pair(w);
  A.store.get().pantry["fish sauce"] = true; A.store.save();
  B.store.get().pantry["tahini"] = false; B.store.save();
  A.store.setSetting("people", 3);
  B.store.setSetting("budget", 5);
  await B.sync.syncNow(); await A.sync.syncNow(); await settle(A, B);
  for (const p of [A, B]) {
    assert.equal(p.store.get().pantry["fish sauce"], true);
    assert.equal(p.store.get().pantry["tahini"], false);
    assert.equal(p.store.settings().people, 3);
    assert.equal(p.store.settings().budget, 5);
  }
});

test("the same field edited on both phones: the later edit wins everywhere", async () => {
  const w = makeWorker();
  const { A, B } = await pair(w);
  A.store.setSetting("people", 2);
  await new Promise(r => setTimeout(r, 5));
  B.store.setSetting("people", 4);
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  assert.equal(A.store.settings().people, 4);
  assert.equal(B.store.settings().people, 4);
});

test("an older app version on the same box still syncs grocery checks with an updated phone", async () => {
  const w = makeWorker();
  const { A, B } = await pair(w);
  check(A, "eggs"); check(A, "milk"); await settle(A, B);
  // The old version (simulated) reads the box like today's app did: whole records, newest wins.
  const box = A.sync.info().code;
  const post = async changes => (await w.call("/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ box, since: 0, changes }) })).json();
  const rec = (await post([])).records.find(r => r.k === "g:" + WK);
  assert.ok(rec.v._ft, "updated phones store field times in the record");
  // Old phone unchecks milk and checks bread, copying _ft along untouched (it doesn't know about it).
  const old = structuredClone(rec.v);
  delete old.checked.milk; old.checked.bread = true;
  await new Promise(r => setTimeout(r, 5));
  // Meanwhile the updated phone checks butter.
  check(B, "butter");
  await post([{ k: "g:" + WK, u: Date.now(), v: old }]);
  await settle(A, B);
  assert.deepEqual(checked(A), ["bread", "butter", "eggs"]);
  assert.deepEqual(checked(B), ["bread", "butter", "eggs"]);
  // And the old phone, reading the box, sees butter too (whole record, as before).
  const after = (await post([])).records.find(r => r.k === "g:" + WK);
  assert.deepEqual(Object.keys(after.v.checked).sort(), ["bread", "butter", "eggs"]);
});

test("a phone that synced before this update keeps working (no field times yet)", async () => {
  const w = makeWorker();
  const { A, B } = await pair(w);
  check(A, "eggs"); await settle(A, B);
  // Simulate B's saved sync state from the previous version: no per-field times.
  const meta = JSON.parse(B.env.localStorage.getItem("recipebox.sync"));
  delete meta.ft;
  const B2dev = await device({ name: "B2", fetch: w.fetchFor(), seed: { "recipebox.v1": B.env.localStorage.getItem("recipebox.v1"), "recipebox.sync": meta } });
  const B2 = { ...B2dev, store: await B2dev.load("store"), sync: await B2dev.load("sync") };
  B2.sync.start();
  check(B2, "milk");
  check(A, "bread");
  await B2.sync.syncNow(); await A.sync.syncNow(); await settle(A, B2);
  assert.deepEqual(checked(A), ["bread", "eggs", "milk"]);
  assert.deepEqual(checked(B2), ["bread", "eggs", "milk"]);
});

test("joining: the box's settings win, the new phone's own recipes are added", async () => {
  const w = makeWorker();
  const A = await phone(w, "A", { recipes: { a: { id: "a", title: "A soup", ingredients: [], steps: [], updated: 5 } } });
  A.store.setSetting("people", 2);
  await A.sync.enable();
  const B = await phone(w, "B", { recipes: { b: { id: "b", title: "B salad", ingredients: [], steps: [], updated: 9 } } });
  B.store.setSetting("people", 5);
  await B.sync.enable(A.sync.info().code);
  await settle(A, B);
  for (const p of [A, B]) {
    assert.deepEqual(Object.keys(p.store.get().recipes).sort(), ["a", "b"]);
    assert.equal(p.store.settings().people, 2);
  }
});
