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
