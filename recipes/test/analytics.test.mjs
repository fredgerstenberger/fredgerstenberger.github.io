// Usage stats: only the listed events, only counts, true/false and fixed words; once-only events fire once;
// the weekly loop (planned, list, cooked, week over, next week) counts at the right moments.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { clean, scrubCapture, EVENTS } from "../js/analytics.js";

test("only listed events, and only their listed properties", () => {
  assert.equal(clean("button_clicked", {}), null);
  assert.deepEqual(clean("recipe_imported", { import_method: "link", read_by_ai: true, title: "Korean Beef Bowl", url: "https://x" }), { import_method: "link", read_by_ai: true });
  assert.deepEqual(clean("recipe_imported", { import_method: "https://site.com/beef" }), {}, "not one of the fixed words");
  assert.deepEqual(clean("grocery_list_generated", { number_of_unique_items: "milk", number_of_recipes_contributing: 3.4, pantry_items_skipped: -1 }), { number_of_recipes_contributing: 3 });
  assert.deepEqual(clean("meal_completed", { meal_type: "dinner", is_batch: "yes" }), { meal_type: "dinner" });
  assert.deepEqual(clean("household_created", { code: "SECRET" }), {});
});

test("no event can carry free text", () => {
  for (const [ev, spec] of Object.entries(EVENTS)) {
    for (const [k, rule] of Object.entries(spec)) {
      assert.ok(rule === "count" || rule === "bool" || (Array.isArray(rule) && rule.every(w => /^[a-z_]+$/.test(w))), `${ev}.${k}`);
    }
  }
});

test("PostHog's own extras: no referrer, no query, unknown events dropped", () => {
  assert.equal(scrubCapture({ event: "$pageview", properties: {} }), null);
  assert.equal(scrubCapture({ event: "$autocapture", properties: {} }), null);
  const e = scrubCapture({ event: "app_opened", properties: { $current_url: "https://fredgerstenberger.github.io/recipes/#/add?url=https://site.com/beef", $pathname: "/recipes/", $referrer: "https://google.com/?q=me", $referring_domain: "google.com", $initial_person_info: { r: "x", u: "y" }, resumed: false }, $set_once: { $initial_current_url: "https://fredgerstenberger.github.io/recipes/?add=eggs" } });
  assert.equal(e.properties.$current_url, "https://fredgerstenberger.github.io/recipes/#/add");
  assert.equal(e.properties.$referrer, undefined);
  assert.equal(e.properties.$referring_domain, undefined);
  assert.equal(e.properties.$initial_person_info, undefined);
  assert.equal(e.$set_once.$initial_current_url, "https://fredgerstenberger.github.io/recipes/");
  assert.equal(e.properties.resumed, false);
});

// A phone with usage stats on (test keys; PostHog itself never loads in tests, so events stay queued).
const MON = "2026-10-05"; // a Monday (weeks run Mon–Sun by default)
async function phone(now = new Date(2026, 9, 7, 18)) {
  const d = await device({ name: "stats", now: () => now.getTime(), seed: { "rb.obs": { key: "phc_test" }, "recipebox.v1": { recipes: {
    r1: { id: "r1", title: "Korean Beef Bowl", ingredients: ["1 lb ground beef", "2 green onions"], steps: ["Cook"], tags: [] },
    r2: { id: "r2", title: "Tikka Masala", ready: { store: "Trader Joe's", price: 4 }, yield: 1, ingredients: ["1 package Tikka Masala"], steps: [], tags: [] }
  } } } });
  Object.assign(d.env.location, { hostname: "localhost", protocol: "http:" });
  const store = await d.load("store"), a = await d.load("analytics"), util = await d.load("util");
  return { ...d, store, a, util, events: () => a.queued().map(([e]) => e), props: name => a.queued().filter(([e]) => e === name).map(([, p]) => own(p)) };
}
// An event's own properties, without the context every event carries.
const CONTEXT = ["app_version", "dev_mode", "platform", "standalone", "sync_enabled"];
const own = p => Object.fromEntries(Object.entries(p).filter(([k]) => !CONTEXT.includes(k)));
const plan = (p, key, rid, slots) => {
  const wasEmpty = p.a.weekIsEmpty(key);
  p.store.editWeek(key).meals.push({ id: `${rid}-${key}`, rid, servings: 2, slots });
  p.store.save();
  p.a.mealPlanned(key, rid, wasEmpty);
};

test("off without keys: nothing queued, nothing remembered", async () => {
  const d = await device({ name: "nokeys" });
  const a = await d.load("analytics");
  a.startAnalytics();
  assert.equal(a.track("app_opened", { resumed: false }), false);
  assert.deepEqual(a.queued(), []);
});

test("app_opened, with the shared context and nothing else", async () => {
  const p = await phone();
  p.a.startAnalytics();
  const [ev, props] = p.a.queued()[0];
  assert.equal(ev, "app_opened");
  assert.deepEqual(Object.keys(props).sort(), ["app_version", "dev_mode", "platform", "resumed", "standalone", "sync_enabled"]);
  p.a.startAnalytics(); // a second start doesn't count again
  assert.equal(p.events().filter(e => e === "app_opened").length, 1);
});

test("meal_plan_created once per week; next_week_planned when the week before was planned too", async () => {
  const p = await phone();
  p.a.startAnalytics();
  plan(p, MON, "r1", ["mon-dinner", "tue-lunch"]);
  plan(p, MON, "r2", ["wed-lunch"]); // second meal: no new event
  assert.deepEqual(p.props("meal_plan_created"), [{ week: "this", kind: "recipe" }]);
  assert.deepEqual(p.props("next_week_planned"), []);
  plan(p, "2026-10-12", "r2", ["mon-lunch"]);
  assert.deepEqual(p.props("meal_plan_created")[1], { week: "next", kind: "store_bought" });
  assert.deepEqual(p.props("next_week_planned"), [{ week: "next" }]);
  // Emptied and planned again: still once.
  p.store.editWeek(MON).meals = []; p.store.save();
  plan(p, MON, "r1", ["thu-dinner"]);
  assert.equal(p.props("meal_plan_created").length, 2);
});

test("grocery_list_generated: once per week, counts only", async () => {
  const p = await phone();
  p.a.startAnalytics();
  plan(p, MON, "r1", ["mon-dinner"]);
  const { sectionize } = await p.load("grocery");
  p.a.listShown(MON, sectionize(MON));
  p.a.listShown(MON, sectionize(MON));
  const ev = p.props("grocery_list_generated");
  assert.equal(ev.length, 1);
  assert.equal(ev[0].number_of_recipes_contributing, 1);
  assert.ok(ev[0].number_of_unique_items >= 1);
  assert.equal(typeof ev[0].pantry_items_skipped, "number");
  // An empty week's list doesn't count.
  p.a.listShown("2026-10-19", sectionize("2026-10-19"));
  assert.equal(p.props("grocery_list_generated").length, 1);
});

test("meal_completed: the planned batch nearest today, once", async () => {
  const p = await phone(); // Wednesday evening
  p.a.startAnalytics();
  plan(p, MON, "r1", ["wed-dinner", "thu-lunch"]);
  const b = p.a.plannedBatch("r1");
  assert.equal(b.slot, "wed-dinner");
  p.a.mealMade(b);
  assert.deepEqual(p.props("meal_completed"), [{ meal_type: "dinner", is_batch: true }]);
  assert.equal(p.a.plannedBatch("r1"), null, "already made: no second question");
  assert.equal(p.a.plannedBatch("r2"), null, "not planned: nothing to ask");
});

test("meal_completed: a meal planned a week away isn't the one being cooked", async () => {
  const p = await phone();
  p.a.startAnalytics();
  plan(p, MON, "r1", ["sun-dinner"]); // 4 days away
  assert.equal(p.a.plannedBatch("r1"), null);
});

test("week_completed: once, the first time the app opens after the week", async () => {
  const p = await phone();
  p.a.startAnalytics();
  plan(p, MON, "r1", ["mon-dinner"]);
  plan(p, MON, "r2", ["tue-lunch"]);
  p.a.mealMade(p.a.plannedBatch("r1") || { meal: p.store.week(MON).meals[0], slot: "mon-dinner" });
  p.store.groceryState(MON).checked["ground beef"] = true; p.store.save();
  p.a.checkWeekEnded(new Date(2026, 9, 13)); // the next Tuesday
  p.a.checkWeekEnded(new Date(2026, 9, 14));
  assert.deepEqual(p.props("week_completed"), [{ meals_planned: 2, meals_completed: 1, shopped: true }]);
  p.a.checkWeekEnded(new Date(2026, 9, 8)); // mid-week: the week before had nothing
  assert.equal(p.props("week_completed").length, 1);
});

test("sharing off: nothing sent, and the anonymous ID is forgotten", async () => {
  const p = await phone();
  const t = await p.load("telemetry");
  const id = t.anonId();
  t.setSharing(false);
  assert.equal(t.config(), null);
  p.a.startAnalytics();
  assert.equal(p.a.track("app_opened", { resumed: false }), false);
  t.setSharing(true);
  assert.notEqual(t.anonId(), id);
});
