// Grocery features that sync between two phones (items 3, 4, 5 and 7).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

export const WK = "2026-10-05";
export async function phone(w, name, seed = {}, opts = {}) {
  const d = await device({ name, fetch: w.fetchFor(), seed: { "recipebox.v1": { settings: { proxy: w.base }, ...seed } }, ...opts });
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

test("item 5: household items added on both phones are both kept, whatever week is open", async () => {
  const { A, B } = await pair();
  const HA = await A.load("household"), HB = await B.load("household");
  HA.add("Paper towels", "Fred"); A.store.save();
  HB.add("Cat litter", "Emma"); B.store.save();
  await B.sync.syncNow(); await A.sync.syncNow(); await settle(A, B);
  for (const H of [HA, HB]) assert.deepEqual(H.items().map(h => h.text).sort(), ["Cat litter", "Paper towels"]);
});

test("item 5: checking one item while the other phone adds another keeps both; Done shopping clears only bought items", async () => {
  const { A, B } = await pair();
  const HA = await A.load("household"), HB = await B.load("household");
  const id = HA.add("Paper towels", "Fred"); A.store.save(); await settle(A, B);
  HB.setChecked(id, true, "Emma"); B.store.save();
  HA.add("Foil", "Fred"); A.store.save();
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  for (const H of [HA, HB]) {
    assert.equal(H.get(id).checked, true);
    assert.equal(H.get(id).cb, "Emma");
    assert.equal(H.items().length, 2);
  }
  assert.equal(HA.clearChecked().length, 1); A.store.save(); await settle(A, B);
  for (const H of [HA, HB]) assert.deepEqual(H.items().map(h => h.text), ["Foil"]);
});

test("item 5: both phones moving the same old week item to the household list end up with one item", async () => {
  const w = makeWorker();
  const legacy = { grocery: { [WK]: { checked: {}, hidden: {}, edits: {}, extras: [{ id: "x1", text: "Cat litter", checked: false, at: 5 }] } } };
  const A = await phone(w, "A", legacy), B = await phone(w, "B", legacy);
  await A.sync.enable(); await B.sync.enable(A.sync.info().code); await settle(A, B);
  const HA = await A.load("household"), HB = await B.load("household");
  const now = new Date(2026, 9, 6);
  HA.migrateWeekExtras(now); HB.migrateWeekExtras(now);
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  for (const [H, p] of [[HA, A], [HB, B]]) {
    assert.deepEqual(H.items().map(h => h.text), ["Cat litter"], p.name);
    assert.deepEqual(p.store.get().grocery[WK].extras, [], p.name);
  }
});

test("item 6: Done shopping on one phone while the other adds something; Undo brings bought items back on both", async () => {
  const { A, B } = await pair();
  const HA = await A.load("household"), HB = await B.load("household");
  const eggs = HA.add("Eggs", "Fred", "e1", 1), foil = HA.add("Foil", "Fred", "f1", 2); A.store.save(); await settle(A, B);
  HA.setChecked(eggs, true, "Fred"); A.store.save(); await settle(A, B);
  // Fred taps Done shopping just as Emma adds coffee.
  const gone = HA.clearChecked(); A.store.save();
  HB.add("Coffee", "Emma"); B.store.save();
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  for (const H of [HA, HB]) assert.deepEqual(H.items().map(h => h.text), ["Foil", "Coffee"]);
  assert.equal(HA.get(foil).checked, false);
  // Undo: the cleared item comes back, still checked, with the same id.
  HA.restore(gone); A.store.save(); await settle(A, B);
  for (const H of [HA, HB]) {
    assert.deepEqual(H.items().map(h => h.text), ["Eggs", "Foil", "Coffee"]);
    assert.equal(H.get(eggs).checked, true);
  }
});

test("item 7: who checked a recipe item syncs, and the other phone's note says so", async () => {
  const { A, B } = await pair();
  const LB = await B.load("live");
  const gA = A.store.groceryState(WK), gB = B.store.groceryState(WK);
  const before = LB.snapshot(B.store.get(), WK);
  gA.checked.eggs = true; (gA.checkedBy ||= {}).eggs = "Fred"; A.store.save();
  const HB = await B.load("household");
  HB.add("Coffee", "Emma"); gB.checked.milk = true; (gB.checkedBy ||= {}).milk = "Emma"; B.store.save();
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  const g = B.store.groceryState(WK);
  assert.deepEqual(g.checked, { eggs: true, milk: true });
  assert.deepEqual(g.checkedBy, { eggs: "Fred", milk: "Emma" });
  assert.deepEqual(A.store.groceryState(WK).checkedBy, { eggs: "Fred", milk: "Emma" });
  // B's own changes are part of "before" when the view draws them; here only Fred's check is new.
  const mid = LB.snapshot({ ...B.store.get(), grocery: { [WK]: { checked: { milk: true }, checkedBy: { milk: "Emma" } } } }, WK);
  assert.equal(LB.describe(LB.changes(mid, LB.snapshot(B.store.get(), WK))), "Fred checked eggs");
  assert.ok(LB.changes(before, LB.snapshot(B.store.get(), WK)).length >= 2);
});

test("item 7: a phone that doesn't keep 'checked by' (older version) loses only the name, never the check", async () => {
  const { A, B } = await pair();
  const gA = A.store.groceryState(WK);
  gA.checked.eggs = true; gA.checkedBy = { eggs: "Fred" }; A.store.save(); await settle(A, B);
  // Like an older app saving the week: same checks, no checkedBy.
  delete B.store.groceryState(WK).checkedBy; B.store.groceryState(WK).checked.foil = true; B.store.save();
  await B.sync.syncNow(); await A.sync.syncNow(); await settle(A, B);
  for (const p of [A, B]) {
    assert.deepEqual(p.store.groceryState(WK).checked, { eggs: true, foil: true }, p.name);
    assert.equal(p.store.groceryState(WK).checkedBy?.eggs, undefined, p.name);
  }
});

// Two phones on one clock the test moves forward, so "before" and "after" are explicit.
async function pairAt() {
  let t = Date.UTC(2026, 9, 6, 17, 0);
  const now = () => t, w = makeWorker();
  const A = await phone(w, "A", {}, { now }), B = await phone(w, "B", {}, { now });
  await A.sync.enable(); await B.sync.enable(A.sync.info().code); await settle(A, B);
  A.R.setMyName("Fred"); B.R.setMyName("Emma");
  return { A, B, tick: (ms = 1000) => { t += ms; }, HA: await A.load("household"), HB: await B.load("household") };
}

test("round 3: both phones adding the same thing before syncing end up with one line, the same on both", async () => {
  const { A, B, tick, HA, HB } = await pairAt();
  HA.add("milk", "Fred"); A.store.save(); tick();
  HB.add("1 gallon milk", "Emma"); B.store.save(); tick();
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  assert.equal(HA.items().length, 2, "two lines before the list tidies up");
  // Each phone tidies up when it shows the list; both reach the same single line.
  HA.mergeDuplicates(); A.store.save(); tick();
  HB.mergeDuplicates(); B.store.save(); tick();
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  for (const H of [HA, HB]) assert.deepEqual(H.items().map(h => [h.text, h.by, h.checked]), [["1 gallon milk", "Fred", false]]);
  assert.deepEqual(HA.items(), HB.items());
});

test("round 3: one phone tidying duplicates is enough; the other gets the same single line", async () => {
  const { A, B, tick, HA, HB } = await pairAt();
  HA.add("2 lb chicken thighs", "Fred"); A.store.save(); tick();
  HB.add("1 lb chicken thighs", "Emma"); B.store.save(); tick();
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  HB.mergeDuplicates(); B.store.save(); tick();
  await B.sync.syncNow(); await A.sync.syncNow(); await settle(A, B);
  for (const H of [HA, HB]) assert.deepEqual(H.items().map(h => h.text), ["3 lb chicken thighs"]);
});

test("round 3: Done shopping vs an edit made after it: the item comes back unchecked, visible on both", async () => {
  const { A, B, tick, HA, HB } = await pairAt();
  const id = HA.add("eggs", "Fred"); A.store.save(); tick();
  await settle(A, B);
  HA.setChecked(id, true, "Fred"); A.store.save(); tick();
  await settle(A, B);
  HA.clearChecked(); A.store.save(); tick();          // Fred taps Done shopping
  HB.edit(id, "2 dozen eggs"); B.store.save(); tick(); // Emma edits it a moment later, before syncing
  await A.sync.syncNow(); await B.sync.syncNow(); await settle(A, B);
  for (const H of [HA, HB]) assert.deepEqual(H.items().map(h => [h.text, h.checked]), [["2 dozen eggs", false]]);
});

test("round 3: Done shopping vs an edit made before it: the removal wins on both", async () => {
  const { A, B, tick, HA, HB } = await pairAt();
  const id = HA.add("eggs", "Fred"); A.store.save(); tick();
  await settle(A, B);
  HA.setChecked(id, true, "Fred"); A.store.save(); tick();
  await settle(A, B);
  HB.edit(id, "2 dozen eggs"); B.store.save(); tick(); // Emma edits first, offline
  HA.clearChecked(); A.store.save(); tick();          // then Fred taps Done shopping
  await B.sync.syncNow(); await A.sync.syncNow(); await settle(A, B);
  for (const H of [HA, HB]) assert.deepEqual(H.items(), []);
});
