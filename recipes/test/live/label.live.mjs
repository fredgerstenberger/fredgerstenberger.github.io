// Live test of your deployed Worker's POST /label with real vision models (uses a little of your free
// Workers AI allowance). Skipped unless WORKER_URL is set:
//   WORKER_URL=https://recipe-proxy.<you>.workers.dev APP_KEY=… npm run test:live
// The sample labels are rendered images (test/fixtures/labels/*.png) of real-looking Nutrition Facts panels.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const URL_ = (process.env.WORKER_URL || "").replace(/\/+$/, "");
const KEY = process.env.APP_KEY || "";
const ORIGIN = "https://fredgerstenberger.github.io"; // the Worker only answers the app's origin
const skip = URL_ ? false : "set WORKER_URL (and APP_KEY if your Worker requires one) to run";

const SAMPLES = [
  // image, expected per serving (the models must read these exactly, give or take rounding)
  ["pasta.png", { grams: 56, kcal: 190, protein: 10, carbs: 38, fat: 1, fiber: 5, servings: 8 }],
  ["yogurt.png", { grams: 170, kcal: 100, protein: 17, carbs: 6, fat: 0, fiber: 0, servings: 4 }]
];
const image = f => "data:image/png;base64," + fs.readFileSync(new URL(`../fixtures/labels/${f}`, import.meta.url)).toString("base64");

async function label(file, model) {
  const res = await fetch(`${URL_}/label`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...(KEY ? { "X-App-Key": KEY } : {}) },
    body: JSON.stringify({ images: [image(file)], ...(model ? { model } : {}) })
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

test("live: the Worker is up and reports label support", { skip }, async () => {
  const res = await fetch(`${URL_}/status`);
  assert.equal(res.status, 200);
  const s = await res.json();
  assert.ok(s.ai, "Workers AI binding missing");
  assert.ok(s.version >= "2026-10-07", `Worker version ${s.version} predates /label; deploy the latest worker.js`);
});

for (const [file, want] of SAMPLES) {
  test(`live: ${file} is read correctly (default model)`, { skip, timeout: 120000 }, async () => {
    const { status, body } = await label(file);
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body.label, body.error);
    for (const [k, v] of Object.entries(want)) assert.ok(Math.abs((body.label[k] ?? -99) - v) <= (k === "kcal" ? 5 : 1), `${k}: got ${body.label[k]}, want ${v}`);
    assert.equal(body.check.ok, true, "the calorie check should pass for a correctly read label");
  });
}

test("live: a picture with no label says so", { skip, timeout: 120000 }, async () => {
  const icon = "data:image/png;base64," + fs.readFileSync(new URL("../../icons/icon-180.png", import.meta.url)).toString("base64");
  const res = await fetch(`${URL_}/label`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, ...(KEY ? { "X-App-Key": KEY } : {}) }, body: JSON.stringify({ images: [icon] }) });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(!body.label || [body.label.kcal, body.label.protein].every(v => v == null), "shouldn't invent numbers");
});
