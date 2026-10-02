// POST /label on the Worker (round 6, item 3), with saved model responses (test/fixtures/labels).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeWorker, ORIGIN } from "./helpers/worker.mjs";

const FIX = JSON.parse(fs.readFileSync(new URL("./fixtures/labels/responses.json", import.meta.url), "utf8"));
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDA==";
let ip = 0;
function worker(fixture, extra = {}) {
  const seen = [];
  const AI = { run: async (model, input) => { seen.push({ model, input }); if (fixture instanceof Error) throw fixture; return FIX[fixture]; } };
  return { w: makeWorker({ AI, ...extra }), seen };
}
const post = (w, body, headers = {}) => w.W.default.fetch(new Request(w.base + "/label", {
  method: "POST", body: JSON.stringify(body),
  headers: { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": `203.0.113.${++ip % 250}`, ...headers }
}), w.env);

const CASES = [
  // fixture, expected fields (subset), check ok
  ["pasta-clean", { servingText: "2 oz (56g)", grams: 56, household: "2 oz", servings: 8, kcal: 190, protein: 10, carbs: 35, fat: 1, fiber: 4 }, true],
  ["yogurt-chatty", { servingText: "3/4 cup (170g)", grams: 170, servings: 4, kcal: 100, protein: 17, carbs: 6, fat: 0.5, fiber: 0 }, true],
  ["oatmilk-ml-only", { grams: null, ml: 240, household: "1 cup", kcal: 120, protein: 3, carbs: 16, fat: 5, fiber: 2 }, true],
  ["misread-calories", { grams: 60, kcal: 910, protein: 20 }, false]
];
for (const [fixture, fields, ok] of CASES) {
  test(`/label: ${fixture} → fields${ok ? "" : ", flagged"}`, async () => {
    const { w, seen } = worker(fixture);
    const res = await post(w, { images: [PHOTO] });
    assert.equal(res.status, 200);
    const out = await res.json();
    for (const [k, v] of Object.entries(fields)) assert.equal(out.label[k], v, k);
    assert.equal(out.check.ok, ok);
    // The prompt asks for label fields only, per serving, null when not shown; the photo goes to the model.
    const parts = seen[0].input.messages[0].content;
    assert.match(parts[0].text, /Nutrition Facts label/);
    assert.match(parts[0].text, /Use null for anything that isn't shown/);
    assert.equal(parts[1].image_url.url, PHOTO);
  });
}

test("/label: no label in the picture, or nothing readable → a clear message, no fields", async () => {
  for (const f of ["no-label", "all-null"]) {
    const out = await (await post(worker(f).w, { images: [PHOTO] })).json();
    assert.equal(out.label, null, f);
    assert.match(out.error, /label|numbers/i, f);
  }
});

test("/label: same access checks as /scan, plus the rate limit", async () => {
  const { w } = worker("pasta-clean");
  assert.equal((await post(w, { images: [PHOTO] }, { Origin: "https://evil.test" })).status, 403);
  assert.equal((await w.W.default.fetch(new Request(w.base + "/label", { headers: { Origin: ORIGIN } }), w.env)).status, 405);
  assert.equal((await post(w, { images: [] })).status, 400);
  assert.equal((await post(w, { images: ["https://example.com/x.jpg"] })).status, 400);
  assert.equal((await post(w, { images: [PHOTO] }, { "Content-Length": "9000000" })).status, 413);
  const keyed = worker("pasta-clean", { APP_KEY: "s3cret" }).w;
  assert.equal((await post(keyed, { images: [PHOTO] })).status, 401);
  assert.equal((await post(keyed, { images: [PHOTO] }, { "X-App-Key": "s3cret" })).status, 200);
  const noAI = makeWorker();
  assert.equal((await post(noAI, { images: [PHOTO] })).status, 500);
  // Rate limit: one address, many requests in a minute.
  const burst = worker("pasta-clean").w;
  let last;
  for (let i = 0; i < 32; i++) last = await burst.W.default.fetch(new Request(burst.base + "/label", { method: "POST", body: JSON.stringify({ images: [PHOTO] }), headers: { Origin: ORIGIN, "CF-Connecting-IP": "198.18.0.77" } }), burst.env);
  assert.equal(last.status, 429);
});

test("/label: a model error comes back as a readable message; nothing is stored", async () => {
  const { w } = worker(new Error("Neuron limit exceeded"));
  const res = await post(w, { images: [PHOTO] });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /allowance/);
  const ok = worker("pasta-clean");
  await post(ok.w, { images: [PHOTO] });
  assert.equal(ok.w.env.CACHE.objects.size, 0, "no cache or storage touched");
  assert.equal(ok.w.env.SYNC.objects.size, 0);
});
