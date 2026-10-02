// Week labels, read-only weeks, and text import (issue 6).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

const d = await device({ name: "plan" });
const util = await d.load("util");
const store = await d.load("store");
const { parseRecipeText } = await d.load("parse");

const THU = new Date(2026, 9, 1, 15, 0);   // Thursday, Oct 1 2026
const SUN = new Date(2026, 9, 4, 10, 0);   // Sunday, Oct 4 2026 (shop & prep day)

test("on a Thursday the current week is 'This week' and its shop day is in the past", () => {
  const key = util.planningWeekKey(THU);
  assert.equal(key, "2026-09-28");
  assert.equal(util.weekRelation(key, THU), "This week");
  assert.match(util.prepLabel(key, THU), /^Shop & prep was Sun, Sep 27$/);
  assert.equal(util.weekRelation("2026-10-05", THU), "Next week");
  assert.equal(util.prepLabel("2026-10-05", THU), "Shop & prep: Sun, Oct 4");
  assert.equal(util.isPastDay(key, 2, THU), true);   // Wednesday
  assert.equal(util.isPastDay(key, 3, THU), false);  // today
});

test("on Sunday the plan opens next week, and shopping is today", () => {
  const key = util.planningWeekKey(SUN);
  assert.equal(key, "2026-10-05");
  assert.equal(util.weekRelation(key, SUN), "Next week");
  assert.equal(util.prepLabel(key, SUN), "Shop & prep: today");
});

test("looking at a week doesn't create a plan record", () => {
  const before = Object.keys(store.get().plan).length;
  const wk = store.week("2030-01-07");
  assert.deepEqual(wk.meals, []);
  assert.equal(Object.keys(store.get().plan).length, before);
  store.editWeek("2030-01-07").meals.push({ id: "m", rid: "r", servings: 2, slots: ["mon-dinner"] });
  assert.equal(store.week("2030-01-07").meals.length, 1);
});

test("sync never sends empty weeks the box has never had", async () => {
  const w = makeWorker();
  const p = await device({ name: "empty", fetch: w.fetchFor(), seed: { "recipebox.v1": { settings: { proxy: w.base } } } });
  const st = await p.load("store"), sync = await p.load("sync");
  st.groceryState("2026-09-28"); st.save();       // opened a grocery list, checked nothing
  st.week("2026-09-28");
  await sync.enable();
  const box = sync.info().code;
  const recs = (await (await w.call("/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ box, since: 0, changes: [] }) })).json()).records;
  assert.ok(!recs.some(r => r.k.startsWith("g:") || r.k.startsWith("p:")), recs.map(r => r.k).join(", "));
});

test("text import: a times line fills the time fields and isn't copied into notes", () => {
  const r = parseRecipeText("Lemon Pasta\nPrep 15 minutes, cook 30 minutes\nServes 4\n\nIngredients\n1 lb pasta\n2 lemons\n\nInstructions\nBoil the pasta.\nAdd lemon.");
  assert.equal(r.title, "Lemon Pasta");
  assert.equal(r.prepMin, 15);
  assert.equal(r.cookMin, 30);
  assert.equal(r.description, "");
  assert.deepEqual(r.ingredients, ["1 lb pasta", "2 lemons"]);
});
