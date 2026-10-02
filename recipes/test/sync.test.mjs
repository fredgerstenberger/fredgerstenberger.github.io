// Two phones syncing through the real Worker code (issues 1 and 2).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

const WK = "2026-09-28";

async function phone(w, name, seed = {}, clock = 0) {
  const d = await device({ name, clock, fetch: w.fetchFor(), seed: { "recipebox.v1": { settings: { proxy: w.base }, ...seed } } });
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
// Sync round-robin until no phone has anything left to send (in the app, a retry follows within 0.5 s).
const settle = async (...ps) => {
  for (let i = 0; i < 10; i++) {
    const queued = ps.some(p => p.sync.info().pending > 0);
    let applied = 0;
    for (const p of ps) applied += (await p.sync.syncNow()).applied;
    // Quiet: nothing was waiting to be sent, nothing changed anywhere, nothing is waiting now.
    if (!queued && !applied && ps.every(p => p.sync.info().pending === 0)) return;
  }
  throw new Error("sync did not settle in 10 rounds");
};

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

// ---- Issue 2: restoring a backup while sync is on ----
const backupOf = (p, at) => JSON.stringify({ app: "recipe-box", exported: new Date(at).toISOString(), ...structuredClone(p.store.get()) });
const recipe = (id, title, updated) => ({ id, title, ingredients: [], steps: [], updated, created: 1 });

test("import (merge) of an older backup never overwrites newer edits, here or on other phones", async () => {
  const w = makeWorker();
  const { A, B } = await pair(w);
  A.store.putRecipe(recipe("r1", "Soup v1")); A.store.get().pantry["miso"] = true; A.store.save();
  await settle(A, B);
  const backup = backupOf(A, Date.now());
  await new Promise(r => setTimeout(r, 5));
  // After the backup: B renames the recipe and marks miso as out.
  const r = B.store.recipe("r1"); r.title = "Soup v2"; B.store.putRecipe(r);
  B.store.get().pantry["miso"] = false; B.store.save();
  await settle(B, A);
  assert.equal(A.store.recipe("r1").title, "Soup v2");
  // A restores the old backup (merge).
  A.store.importJSON(backup, "merge");
  await settle(A, B);
  for (const p of [A, B]) {
    assert.equal(p.store.recipe("r1").title, "Soup v2");
    assert.equal(p.store.get().pantry["miso"], false);
  }
});

test("import (merge) keeps the newer copy of each recipe and adds missing ones", async () => {
  const d = await device({ name: "solo" });
  const store = await d.load("store");
  store.get().recipes.a = recipe("a", "Local newer", 200);
  store.get().recipes.b = recipe("b", "Local older", 100);
  store.save();
  const file = JSON.stringify({ app: "recipe-box", exported: "2026-01-01T00:00:00Z", recipes: { a: recipe("a", "Backup older", 150), b: recipe("b", "Backup newer", 300), c: recipe("c", "Only in backup", 50) }, pantry: { miso: false }, plan: {}, prices: {} });
  store.get().pantry.miso = true;
  store.importJSON(file, "merge");
  const rs = store.get().recipes;
  assert.equal(rs.a.title, "Local newer");
  assert.equal(rs.b.title, "Backup newer");
  assert.equal(rs.c.title, "Only in backup");
  assert.equal(store.get().pantry.miso, true, "pantry answers already on the phone are kept");
});

test("import (replace) with sync on is an explicit choice that wins everywhere", async () => {
  const w = makeWorker();
  const { A, B } = await pair(w);
  A.store.putRecipe(recipe("r1", "Soup v1")); await settle(A, B);
  const backup = backupOf(A, Date.now());
  await new Promise(r => setTimeout(r, 5));
  const r = B.store.recipe("r1"); r.title = "Soup v2"; B.store.putRecipe(r);
  B.store.putRecipe(recipe("r2", "New after backup"));
  await settle(A, B);
  A.store.importJSON(backup, "replace");
  await settle(A, B);
  for (const p of [A, B]) {
    assert.equal(p.store.recipe("r1").title, "Soup v1");
    assert.equal(p.store.recipe("r2"), undefined);
  }
});

test("phones whose clocks disagree by minutes still keep each other's edits", async () => {
  const w = makeWorker();
  const A = await phone(w, "A", {}, 5 * 60000);      // A's clock is 5 minutes fast
  const B = await phone(w, "B", {}, 0);
  await A.sync.enable(); await B.sync.enable(A.sync.info().code); await settle(A, B);
  A.store.putRecipe(recipe("r1", "Soup v1")); check(A, "eggs");
  await settle(A, B);
  // B edits after receiving A's (future-dated) versions.
  const r = B.store.recipe("r1"); r.title = "Soup v2"; B.store.putRecipe(r);
  check(B, "milk");
  await settle(B, A);
  for (const p of [A, B]) {
    assert.equal(p.store.recipe("r1").title, "Soup v2");
    assert.deepEqual(checked(p), ["eggs", "milk"]);
  }
});
