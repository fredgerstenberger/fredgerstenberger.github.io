// Recipe book Filters sheet limits, and photos filled in for recipes saved before photos.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const R = (id, extra) => ({ id, title: id, yield: 2, ingredients: ["1 lb chicken breast", "1 cup rice"], steps: ["Cook."], created: 1, updated: 1, ...extra });

test("Filters: calories, protein, time, cost and rating limits; unknown values don't pass", async () => {
  const d = await device({ name: "F" });
  const { withinLimits } = await d.load("views/book");
  const { nutritionFor } = await d.load("nutrition");
  const r = R("a", { totalMin: 30 }), slow = R("b", { totalMin: 90 }), notime = R("c");
  const k = nutritionFor(r).kcal, p = nutritionFor(r).protein;
  assert.ok(k > 0 && p > 0);
  assert.equal(withinLimits(r, {}), true);
  assert.equal(withinLimits(r, { kcal: Math.ceil(k) }), true);
  assert.equal(withinLimits(r, { kcal: Math.floor(k) - 1 }), false);
  assert.equal(withinLimits(r, { protein: Math.floor(p) }), true);
  assert.equal(withinLimits(r, { protein: Math.ceil(p) + 1 }), false);
  assert.equal(withinLimits(r, { time: 45 }), true);
  assert.equal(withinLimits(slow, { time: 45 }), false);
  assert.equal(withinLimits(notime, { time: 45 }), false, "no time listed doesn't count as quick");
  assert.equal(withinLimits(r, { cost: 100 }), true);
  assert.equal(withinLimits(r, { cost: 0.01 }), false);
  assert.equal(withinLimits(r, { rating: 4 }), false, "unrated");
  assert.equal(withinLimits({ ...r, rating: 5 }, { rating: 4 }), true);
  assert.equal(withinLimits(r, { kcal: "" }), true, "a cleared field is no limit");
});

const page = img => `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", name: "X", image: img, recipeIngredient: ["1 egg"], recipeInstructions: ["Cook."] })}</script></head><body>${"x".repeat(600)}</body></html>`;

test("photos: recipes saved before photos get theirs, a few at a time, and aren't asked again for a week", async () => {
  const calls = [];
  const d = await device({ name: "P", fetch: async u => { calls.push(String(u)); return new Response(page("https://site.com/" + (String(u).includes("a.html") ? "a" : "b") + ".jpg"), { status: 200 }); } });
  const P = await d.load("photos");
  const recipes = [R("a", { url: "https://site.com/a.html" }), R("b", { url: "https://site.com/b.html" }), R("c")];
  const found = [];
  await P.fillPhotos(recipes, {}, id => found.push(id));
  assert.deepEqual(found.sort(), ["a", "b"]);
  assert.equal(P.photoOf("a"), "https://site.com/a.jpg");
  const n = calls.length;
  P.setPhoto("a", null);
  await P.fillPhotos(recipes, {}, () => {});
  assert.equal(calls.length, n, "tried this week: not fetched again");
});

test("photos: an older Worker's recipe has no photo, so the page is read through the public proxies", async () => {
  const d = await device({ name: "W", fetch: async u => {
    u = String(u);
    if (u.startsWith("https://w.example/recipe")) return new Response(JSON.stringify({ recipe: { title: "X", ingredients: ["1 egg"], steps: ["Cook."] } }), { status: 200 });
    return new Response(page("https://site.com/w.jpg"), { status: 200 });
  } });
  const { photoFromPage } = await d.load("parse");
  assert.equal(await photoFromPage("https://site.com/w.html", "https://w.example", "k"), "https://site.com/w.jpg");
});

test("photos: a page without recipe data still gives its share image", async () => {
  const d = await device({ name: "O" });
  const { imageFromHtml } = await d.load("parse");
  assert.equal(imageFromHtml(`<meta property="og:image" content="https://cdn.site.com/p.jpg?w=1200&amp;h=630">`), "https://cdn.site.com/p.jpg?w=1200&h=630");
  assert.equal(imageFromHtml(`<meta content="https://x.com/t.jpg" name="twitter:image">`), "https://x.com/t.jpg");
  assert.equal(imageFromHtml(`<meta property="og:image" content="http://x.com/insecure.jpg">`), "");
});
