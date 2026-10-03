// The shopping & prep day: weeks run from the day after it, and changing it moves meals, grocery lists
// and added items to the new weeks (on both phones, safely more than once).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

const D = (m, d) => new Date(2026, m - 1, d, 12);
const DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

async function one(seed = {}) {
  const d = await device({ name: "solo", seed: { "recipebox.v1": seed } });
  return { ...d, store: await d.load("store"), U: await d.load("util"), W: await d.load("weeks"), H: await d.load("household") };
}

test("by default weeks run Monday–Sunday and Sunday looks at the coming week", async () => {
  const { U } = await one();
  assert.equal(U.weekKey(D(10, 7)), "2026-10-05");
  assert.equal(U.weekKey(D(10, 11)), "2026-10-05");
  assert.equal(U.planningWeekKey(D(10, 10)), "2026-10-05"); // Saturday
  assert.equal(U.planningWeekKey(D(10, 11)), "2026-10-12"); // Sunday: shop & prep for next week
  assert.deepEqual(U.weekDays(), ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
});

test("every shopping day: the week starts the next day, and on the shopping day the list is next week's", async () => {
  const { U } = await one();
  for (let prep = 0; prep < 7; prep++) {
    U.setPrepDay(prep);
    const start = (prep + 1) % 7;
    assert.equal(U.prepDay(), prep);
    assert.equal(U.weekDays()[0], DAY[start], `prep ${prep}`);
    assert.equal(U.weekDays()[6], DAY[prep], `prep ${prep}`);
    for (let d = 1; d <= 14; d++) {
      const date = D(10, d), key = U.weekKey(date);
      assert.equal(U.parseWeekKey(key).getDay(), start, `prep ${prep}, Oct ${d}`);
      const diff = (date - U.parseWeekKey(key)) / 864e5;
      assert.ok(diff >= 0 && diff < 7, `prep ${prep}, Oct ${d}: in its week`);
      const plan = U.planningWeekKey(date);
      assert.equal(plan, date.getDay() === prep ? U.weekKey(U.addDays(date, 1)) : key, `prep ${prep}, Oct ${d}`);
    }
  }
});

test("dayDate finds a day in a week whatever weekday its key is on", async () => {
  const { U } = await one();
  const table = [["2026-10-05", "mon", 5], ["2026-10-05", "sun", 11], ["2026-10-03", "sat", 3], ["2026-10-03", "fri", 9], ["2026-10-03", "mon", 5]];
  for (const [key, day, date] of table) assert.equal(U.dayDate(key, day).getDate(), date, `${key} ${day}`);
});

test("changing to Friday shopping (Sat–Fri weeks) moves meals, grocery lists and added items", async () => {
  const p = await one({
    plan: { "2026-10-05": { meals: [
      { id: "m1", rid: "r", servings: 4, slots: ["mon-dinner", "tue-lunch"] },
      { id: "m2", rid: "r", servings: 2, slots: ["fri-dinner", "sat-lunch"] }
    ] } },
    grocery: { "2026-10-05": { checked: { eggs: true }, extras: [], hidden: {}, carry: 7 } },
    household: { h: { text: "foil", checked: false, at: 1, wk: "2026-10-05" } }
  });
  p.U.setPrepDay(5);
  assert.ok(p.W.alignWeeks() > 0);
  const s = p.store.get();
  assert.deepEqual(s.plan["2026-10-05"].meals, []);
  const a = s.plan["2026-10-03"].meals, b = s.plan["2026-10-10"].meals;
  assert.deepEqual(a.map(m => [m.id, m.slots]), [["m1", ["mon-dinner", "tue-lunch"]], ["m2", ["fri-dinner"]]]);
  assert.deepEqual(b.map(m => [m.id, m.slots, m.servings]), [["m2-2026-10-10", ["sat-lunch"], 2]]); // its leftovers, now next week
  assert.equal(s.grocery["2026-10-03"].checked.eggs, true);
  assert.equal(s.grocery["2026-10-03"].carry, 7);
  assert.deepEqual(s.grocery["2026-10-05"].checked, {});
  assert.equal(p.H.get("h").wk, "2026-10-03");
  assert.equal(p.W.alignWeeks(), 0, "nothing left to move");
});

test("changing back keeps every meal on the same days", async () => {
  const p = await one({ plan: { "2026-10-05": { meals: [{ id: "m2", rid: "r", servings: 2, slots: ["fri-dinner", "sat-lunch"] }] } } });
  p.U.setPrepDay(5); p.W.alignWeeks();
  p.U.setPrepDay(0); p.W.alignWeeks();
  const s = p.store.get(), U = p.U;
  const days = Object.entries(s.plan).flatMap(([k, w]) => (w.meals || []).flatMap(m => m.slots.map(sl => U.dayDate(k, sl.split("-")[0]).getDate() + sl.slice(3))));
  assert.deepEqual(days.sort(), ["10-lunch", "9-dinner"]);
  assert.ok((s.plan["2026-10-05"].meals || []).length > 0);
});

// Two synced phones.
async function phone(w, name) {
  const d = await device({ name, fetch: w.fetchFor(), seed: { "recipebox.v1": { settings: { proxy: w.base } } } });
  return { ...d, store: await d.load("store"), sync: await d.load("sync"), U: await d.load("util"), W: await d.load("weeks") };
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
const apply = p => { p.U.setPrepDay(p.store.settings().prepDay ?? 0); if (p.W.alignWeeks()) p.store.save(); }; // as app.js does after a sync

test("two phones: one changes the shopping day while the other plans a meal in the old week; both end up the same", async () => {
  const w = makeWorker();
  const A = await phone(w, "A"), B = await phone(w, "B");
  await A.sync.enable(); await B.sync.enable(A.sync.info().code); await settle(A, B);
  A.store.editWeek("2026-10-05").meals.push({ id: "a1", rid: "r", servings: 2, slots: ["mon-dinner"] }); A.store.save(); await settle(A, B);
  // Fred switches to Friday shopping; meanwhile Emma (still on Monday weeks) adds Saturday lunch.
  A.store.setSetting("prepDay", 5); apply(A);
  B.store.editWeek("2026-10-05").meals.push({ id: "b1", rid: "r", servings: 2, slots: ["sat-lunch"] }); B.store.save();
  await A.sync.syncNow(); await B.sync.syncNow(); apply(B); apply(A); await settle(A, B); apply(A); apply(B); await settle(A, B);
  for (const p of [A, B]) {
    const plan = p.store.get().plan;
    assert.equal(p.U.weekDays()[0], "sat", p.name);
    assert.deepEqual((plan["2026-10-05"]?.meals || []), [], p.name);
    assert.deepEqual(plan["2026-10-03"].meals.map(m => m.id), ["a1"], p.name);
    assert.deepEqual(plan["2026-10-10"].meals.map(m => m.id), ["b1"], p.name);
  }
});
