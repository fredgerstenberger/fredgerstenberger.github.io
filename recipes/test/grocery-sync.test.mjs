// Grocery features that sync between two phones (items 3, 4, 5 and 7).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

export const WK = "2026-10-05";
export async function phone(w, name, seed = {}) {
  const d = await device({ name, fetch: w.fetchFor(), seed: { "recipebox.v1": { settings: { proxy: w.base }, ...seed } } });
  return { ...d, store: await d.load("store"), sync: await d.load("sync"), Q: await d.load("quickadd"), R: await d.load("ratings") };
}
export async function settle(...ps) {
  for (let i = 0; i < 12; i++) {
    const queued = ps.some(p => p.sync.info().pending > 0);
    let applied = 0;
    for (const p of ps) applied += (await p.sync.syncNow()).applied;
    if (!queued && !applied && ps.every(p => p.sync.info().pending === 0)) return;
  }
  throw new Error("sync did not settle");
}
export async function pair() {
  const w = makeWorker();
  const A = await phone(w, "A"), B = await phone(w, "B");
  await A.sync.enable(); await B.sync.enable(A.sync.info().code); await settle(A, B);
  A.R.setMyName("Fred"); B.R.setMyName("Emma");
  return { w, A, B };
}

test("item 3: item history from both phones merges (autocomplete and chips)", async () => {
  const { A, B } = await pair();
  const add = (p, text) => { p.Q.noteAdded(p.store.get().history ||= {}, p.Q.parseAdd(text)); p.store.save(); };
  add(A, "oat milk"); add(A, "cat litter");
  add(B, "cat litter"); add(B, "coffee");
  await B.sync.syncNow(); await A.sync.syncNow(); await settle(A, B);
  for (const p of [A, B]) {
    const h = p.store.get().history;
    assert.deepEqual(Object.keys(h).sort(), ["oat milk", "cat litter", "coffee"].map(t => p.Q.parseAdd(t).key).sort(), p.name);
    assert.equal(h["cat litter"].n >= 1, true);
  }
});

test("item 3: an added item keeps who added it", async () => {
  const { A, B } = await pair();
  const g = B.store.groceryState(WK);
  g.extras.push({ id: "e1", text: "Paper towels", checked: false, at: 1, by: "Emma" }); B.store.save();
  await settle(A, B);
  assert.equal(A.store.get().grocery[WK].extras[0].by, "Emma");
});

async function withStores() {
  const s = await pair();
  s.SA = await s.A.load("stores"); s.SB = await s.B.load("stores");
  return s;
}

test("item 4: stores added on both phones at once are both kept", async () => {
  const { A, B, SA, SB } = await withStores();
  SA.add("Trader Joe's"); SB.add("Ralphs");
  await B.sync.syncNow(); await A.sync.syncNow(); await settle(A, B);
  for (const S of [SA, SB]) assert.deepEqual(S.list().map(s => s.name).sort(), ["Ralphs", "Trader Joe's"]);
});

test("item 4: reordering one store while the other phone edits another keeps both; the store you pick stays per phone", async () => {
  const { A, B, SA, SB } = await withStores();
  const tj = SA.add("Trader Joe's"), ra = SA.add("Ralphs");
  await settle(A, B);
  SA.setOrder(tj, ["dairy", "produce", "meat"]);
  SB.rename(ra, "Ralphs (Irvine)");
  SB.pick(ra);
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  for (const S of [SA, SB]) {
    assert.deepEqual(S.orderFor(tj).slice(0, 3), ["dairy", "produce", "meat"]);
    assert.equal(S.get(ra).name, "Ralphs (Irvine)");
    assert.ok(S.orderFor(tj).includes("frozen"), "aisles the order doesn't mention come at the end");
  }
  assert.equal(SB.current(), ra);
  assert.equal(SA.current(), "", "picking a store on one phone doesn't change the other");
});

test("item 4: the same store reordered on both phones ends up the same everywhere", async () => {
  const { A, B, SA, SB } = await withStores();
  const tj = SA.add("Trader Joe's");
  await settle(A, B);
  SA.setOrder(tj, ["meat", "produce"]);
  await new Promise(r => setTimeout(r, 5));
  SB.setOrder(tj, ["frozen", "dairy"]);
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  assert.deepEqual(SA.orderFor(tj), SB.orderFor(tj));
  assert.deepEqual(SA.orderFor(tj).slice(0, 2), ["frozen", "dairy"], "the later reorder wins");
});
