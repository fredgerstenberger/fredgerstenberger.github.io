// Honest estimates: the note shows once per device and can be reopened; stand-ins are counted separately.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

test("the estimates note is shown once per device, then only on request", async () => {
  const d = await device({ name: "est" });
  const T = await d.load("tips");
  const first = T.estimatesNoticeHTML();
  assert.match(first, /estimates based on typical ingredients/);
  assert.equal(T.seen("estimates"), true);
  // Same visit (a redraw): still shown until dismissed or you leave the screen.
  assert.notEqual(T.estimatesNoticeHTML(), "");
  // Another visit (a new phone session keeps localStorage): never again.
  const d2 = await device({ name: "est2", seed: { "rb.seen": d.env.localStorage.getItem("rb.seen") } });
  const T2 = await d2.load("tips");
  assert.equal(T2.estimatesNoticeHTML(), "");
  // Reopenable: the info button is always there, labeled.
  assert.match(T2.estimatesButton(), /data-estimates/);
  assert.match(T2.estimatesButton(), /aria-label="About estimates"/);
  assert.match(T2.ESTIMATES_TEXT, /Add a product's label or your store's prices/);
});

test("one-time tips show once per device", async () => {
  const d = await device({ name: "tips" });
  const T = await d.load("tips");
  assert.match(T.tipHTML("rate", "Tap a star to rate it."), /Tap a star/);
  const d2 = await device({ name: "tips2", seed: { "rb.seen": d.env.localStorage.getItem("rb.seen") } });
  assert.equal((await d2.load("tips")).tipHTML("rate", "Tap a star to rate it."), "");
});

test("stand-ins and unknowns are counted apart from matched ingredients", async () => {
  const d = await device({ name: "counts" });
  const { nutritionFor, ingredientCounts, countsText } = await d.load("nutrition");
  const r = { id: "c1", title: "Pasta", yield: 4, updated: 1, ingredients: ["12 oz protein pasta", "1 lb chicken breast", "2 tbsp olive oil", "1 cup zorbleberries"], steps: [] };
  const c = ingredientCounts(nutritionFor(r));
  assert.deepEqual(c, { total: 4, matched: 2, estimated: 1, missing: 1 });
  assert.equal(countsText(c), "2 of 4 ingredients matched, 1 estimated, 1 not counted");
  assert.doesNotMatch(countsText(c), /100%/);
  assert.equal(countsText(ingredientCounts({ rows: [{ line: "a", source: "table" }] })), "1 of 1 ingredient matched");
});
