// Weekly grocery lists: things you add belong to a week's list, every week starts fresh, and what
// wasn't checked off can be brought over ("Still need these?", answered once for both phones).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

const LAST = "2026-09-28", THIS = "2026-10-05", NEXT = "2026-10-12";

// Two synced phones (local copies: importing another test file would run its tests again).
async function phone(w, name) {
  const d = await device({ name, fetch: w.fetchFor(), seed: { "recipebox.v1": { settings: { proxy: w.base } } } });
  return { ...d, store: await d.load("store"), sync: await d.load("sync") };
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
async function pair() {
  const w = makeWorker();
  const A = await phone(w, "A"), B = await phone(w, "B");
  await A.sync.enable(); await B.sync.enable(A.sync.info().code); await settle(A, B);
  return { A, B };
}

async function one(seed = {}) {
  const d = await device({ name: "solo", seed: { "recipebox.v1": seed } });
  return { ...d, store: await d.load("store"), H: await d.load("household"), add: await d.load("grocery-add"), fields: await d.load("fields") };
}

test("each week's list shows only its own items; the same thing on two weeks stays two lines", async () => {
  const p = await one();
  p.add.addToList(LAST, "coffee"); p.add.addToList(LAST, "foil");
  p.add.addToList(THIS, "coffee");
  assert.deepEqual(p.H.inWeek(LAST).map(h => h.text), ["coffee", "foil"]);
  assert.deepEqual(p.H.inWeek(THIS).map(h => h.text), ["coffee"]);
  assert.deepEqual(p.H.inWeek(NEXT), []);
  assert.equal(p.H.mergeDuplicates(), 0);
  // Adding it again to the same week joins its line.
  assert.equal(p.add.addToList(THIS, "2 coffee").result, "merged");
  assert.equal(p.H.inWeek(THIS).length, 1);
});

test("leftovers are what wasn't checked off; moveTo brings them to another week", async () => {
  const p = await one();
  const a = p.H.add("coffee", "", "a", 1, LAST), b = p.H.add("foil", "", "b", 2, LAST);
  p.H.setChecked(a, true);
  assert.deepEqual(p.H.leftovers(LAST).map(h => h.id), [b]);
  p.H.moveTo([b], THIS);
  assert.deepEqual(p.H.inWeek(THIS).map(h => h.text), ["foil"]);
  assert.deepEqual(p.H.leftovers(LAST), []);
});

test("items from before weekly lists get a week once: unchecked ones this week, checked ones the week they were added", async () => {
  const at = new Date(2026, 8, 30).getTime(); // a Wednesday in LAST's week
  const p = await one({ household: { u: { text: "foil", checked: false, at }, c: { text: "milk", checked: true, at } } });
  const n = p.H.assignWeeks(new Date(2026, 9, 7)); // Wednesday of THIS week
  const table = [["u", THIS], ["c", LAST]];
  assert.equal(n, 2);
  for (const [id, wk] of table) assert.equal(p.H.get(id).wk, wk, id);
  assert.equal(p.H.assignWeeks(new Date(2026, 9, 7)), 0, "only once");
  // On a Sunday the list you're planning is next week's.
  const q = await one({ household: { u: { text: "foil", checked: false, at } } });
  q.H.assignWeeks(new Date(2026, 9, 11));
  assert.equal(q.H.get("u").wk, NEXT);
});

test("lists more than 8 weeks old are deleted", async () => {
  const p = await one();
  const table = [["old", "2026-08-03", false], ["edge", "2026-08-10", true], ["recent", LAST, true]];
  for (const [id, wk] of table) p.H.add(id, "", id, 1, wk);
  assert.equal(p.H.prune(new Date(2026, 9, 7)), 1);
  assert.deepEqual(p.H.items().map(h => h.id).sort(), ["edge", "recent"]);
});

test("the carry-over answer is part of the week's grocery record (and older records without it read fine)", async () => {
  const p = await one();
  const f = p.fields.toFields("g:" + LAST, { checked: { eggs: true }, carry: 123 });
  assert.equal(f["o|carry"], 123);
  assert.equal(p.fields.fromFields("g:" + LAST, f).carry, 123);
  assert.equal(p.fields.fromFields("g:" + LAST, { "c|eggs": true }).carry, undefined);
});

test("two phones: the week, moving leftovers and the carry-over answer all sync", async () => {
  const { A, B } = await pair();
  const HA = await A.load("household"), HB = await B.load("household");
  const id = HA.add("foil", "Fred", undefined, undefined, LAST); A.store.save(); await settle(A, B);
  assert.equal(HB.get(id).wk, LAST);
  // Emma answers "Add to this week" while Fred adds something to this week's list.
  HB.moveTo([id], THIS); B.store.groceryState(LAST).carry = 5; B.store.save();
  HA.add("coffee", "Fred", undefined, undefined, THIS); A.store.save();
  await B.sync.syncNow(); await A.sync.syncNow(); await settle(A, B);
  for (const [P, H] of [[A, HA], [B, HB]]) {
    assert.deepEqual(H.inWeek(THIS).map(h => h.text).sort(), ["coffee", "foil"], P.name);
    assert.deepEqual(H.inWeek(LAST), [], P.name);
    assert.equal(P.store.get().grocery[LAST].carry, 5, P.name);
  }
});

test("an item checked by an older app version keeps its week", async () => {
  const { A, B } = await pair();
  const HA = await A.load("household"), HB = await B.load("household");
  const id = HA.add("foil", "Fred", undefined, undefined, THIS); A.store.save(); await settle(A, B);
  // v24 and earlier edit items with { ...item, checked } (see household.setChecked), keeping fields they don't know.
  const h = B.store.get().household[id];
  B.store.get().household[id] = { ...h, checked: true };
  B.store.save(); await settle(A, B);
  assert.equal(HA.get(id).wk, THIS);
  assert.equal(HA.get(id).checked, true);
});
