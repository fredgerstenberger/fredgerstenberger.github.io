// Paprika library import (js/paprika.js): reading the export, mapping to ordinary recipes, sorting out repeats and
// duplicates, saving in batches, and imported recipes working like any other (nutrition, cost, plan, list, sync).
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import fs from "node:fs";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";
import { paprikaExport, asFile, recipe, sampleRecipes, zip, entry } from "./helpers/paprika.mjs";

const ME = "n:fred";
async function phone(seed = {}, name = "pap") {
  const d = await device({ name, seed: { "recipebox.v1": { recipes: {}, ...seed } } });
  return { ...d, store: await d.load("store"), P: await d.load("paprika"), photos: await d.load("photos") };
}
const byTitle = (items, t) => items.find(i => i.recipe.title === t);

test("the sample export: every recipe read, the broken entry counted, nothing saved yet", async () => {
  const p = await phone();
  const file = asFile(fs.readFileSync(new URL("./fixtures/paprika/sample.paprikarecipes", import.meta.url)));
  const steps = [];
  const a = await p.P.analyzeFile(file, { existing: [], me: ME, onProgress: (d, t) => steps.push([d, t]) });
  assert.equal(a.total, 8);
  assert.equal(a.items.length, 7);
  assert.deepEqual(a.unreadable, ["Broken Recipe.paprikarecipe"]);
  assert.deepEqual(steps.at(-1), [8, 8]);
  assert.equal(Object.keys(p.store.get().recipes).length, 0, "analyzing saves nothing");
});

test("mapping: every useful field lands in the normal recipe record", async () => {
  const p = await phone();
  const a = await p.P.analyzeFile(asFile(paprikaExport(sampleRecipes())), { existing: [], me: ME });
  const { recipe: r, photo, problems } = byTitle(a.items, "Korean Beef Bowl");
  assert.deepEqual(problems, []);
  assert.equal(r.ingredients.length, 7);
  assert.equal(r.ingredients[5], "4 green onions (white and green parts), sliced", "kept exactly as written");
  assert.deepEqual(r.steps[0], "Brown the beef in a large skillet.", "Paprika's own numbering removed");
  assert.equal(r.yield, 4); assert.equal(r.yieldText, "4 servings");
  assert.deepEqual([r.prepMin, r.cookMin, r.totalMin], [10, 15, 25]);
  assert.equal(r.url, "https://damndelicious.net/2013/06/14/korean-beef-bowl/");
  assert.equal(r.site, "damndelicious.net");
  assert.deepEqual(r.tags, ["dinner", "asian"]);
  assert.equal(r.rating, 5); assert.deepEqual(r.ratings, { [ME]: 5 });
  assert.deepEqual(r.favorites, { [ME]: true });
  assert.deepEqual(r.nutrition, { kcal: 520, fat: 22, carbs: 48, protein: 30, sodium: 1100 });
  assert.equal(r.notes, "Double the sauce for meal prep.", "nutrition fully read, so not repeated in the notes");
  assert.equal(r.importId, "paprika:8E6F1A52-3B1D-4C6E-9F0A-1D2C3B4A5E61");
  assert.equal(r.origin, "paprika");
  assert.equal(new Date(r.created).getFullYear(), 2023);
  assert.equal(photo, "https://damndelicious.net/wp-content/uploads/2013/06/korean-beef-bowl.jpg");
});

test("mapping: headings, package sizes, ranges, to taste, optional, servings text, kept notes", async () => {
  const p = await phone();
  const ING = await p.load("ingredients");
  const a = await p.P.analyzeFile(asFile(paprikaExport(sampleRecipes())), { existing: [], me: ME });
  const c = byTitle(a.items, "Weeknight Chickpea Curry");
  assert.deepEqual(c.recipe.ingredients, ["# Curry", "1 tbsp olive oil", "1 onion, diced", "2 x 400g tins chickpeas, drained", "1 (13.5 oz) can coconut milk", "1-2 tsp curry powder", "Salt, to taste", "# For serving", "Cilantro (optional)", "½ cup plain Greek yogurt"]);
  assert.deepEqual(c.recipe.steps.length, 3, "blank lines dropped");
  assert.equal(c.recipe.yield, 4); assert.equal(c.recipe.yieldText, "Serves 4 to 6");
  assert.equal(c.recipe.totalMin, 40);
  assert.equal(c.recipe.notes, "Pantry curry from a dog-eared notebook.");
  assert.equal(c.photo, null, "a photo stored inside the export has no web address: left out, recipe still imports");
  // The same ingredient reader as every other recipe.
  const tins = ING.parseIngredient("2 x 400g tins chickpeas, drained");
  assert.ok(tins.qty > 0);
  assert.equal(ING.parseIngredient("# Curry").header, "Curry");
  assert.ok(ING.parseIngredient("1-2 tsp curry powder"));

  const b = byTitle(a.items, "Grandma's Banana Bread").recipe;
  assert.equal(b.site, "Grandma's recipe card", "a source with no link is kept as the source");
  assert.equal(b.cookMin, 60); assert.equal(b.yieldText, "1 loaf");
  assert.equal(b.nutrition, null);
  assert.match(b.notes, /She always added a handful of walnuts\.\n\nNutrition \(from Paprika\):\nAbout 200 calories a slice/);
  assert.deepEqual(b.favorites, { [ME]: true }, "on_favorites: 1 counts");

  const o = byTitle(a.items, "Overnight Oats").recipe;
  assert.equal(o.totalMin, 5, "an unreadable total time falls back to prep + cook");
  assert.match(o.notes, /Total time: overnight/);
  assert.equal(byTitle(a.items, "Trader Joe's Cauliflower Gnocchi Bake").recipe.cookMin, 20, "ISO times");
});

test("recipes missing things: imported and marked to look at; empty ones skipped", async () => {
  const p = await phone();
  const a = await p.P.analyzeFile(asFile(paprikaExport([...sampleRecipes(), recipe({ name: "", ingredients: "", directions: "" }), { uid: "X", name: "Bare" }])), { existing: [], me: ME });
  assert.deepEqual(byTitle(a.items, "Lemon Vinaigrette").problems, ["no ingredients"]);
  assert.deepEqual(byTitle(a.items, "Untitled recipe").problems, ["no title"]);
  const bare = byTitle(a.items, "Bare").recipe; // only a name: every optional field missing
  assert.deepEqual([bare.ingredients, bare.steps, bare.tags, bare.rating, bare.notes], [[], [], [], 0, ""]);
  assert.equal(a.unreadable.length, 1, "the empty recipe is skipped");
});

test("bad files: not a ZIP, no recipes, nothing readable; one exported recipe on its own works", async () => {
  const p = await phone();
  await assert.rejects(p.P.analyzeFile(asFile(Buffer.from("hello, this is not a zip file at all"), "x.txt")), e => e.code === "not_zip");
  await assert.rejects(p.P.analyzeFile(asFile(zip([{ name: "readme.txt", data: Buffer.from("hi") }]))), e => e.code === "empty");
  await assert.rejects(p.P.analyzeFile(asFile(zip([]))), e => e.code === "empty");
  await assert.rejects(p.P.analyzeFile(asFile(zip([{ name: "a.paprikarecipe", data: Buffer.from("junk") }]))), e => e.code === "unreadable");
  const one = zlib.gzipSync(Buffer.from(JSON.stringify(recipe({ name: "Solo" }))));
  const a = await p.P.analyzeFile(asFile(one, "Solo.paprikarecipe"), { existing: [], me: ME });
  assert.equal(a.items[0].recipe.title, "Solo");
  // Entries stored without compression, and Mac archive clutter ignored.
  const stored = zip([{ ...entry(recipe({ name: "Stored" })), store: true }, { name: "__MACOSX/._Stored.paprikarecipe", data: Buffer.from("x") }]);
  assert.equal((await p.P.analyzeFile(asFile(stored), { existing: [], me: ME })).items[0].recipe.title, "Stored");
});

test("one malformed recipe among good ones: the rest import", async () => {
  const p = await phone();
  const recipes = Array.from({ length: 5 }, (_, i) => recipe({ name: `Good ${i}` }));
  const file = asFile(paprikaExport(recipes, [{ name: "Bad.paprikarecipe", data: zlib.gzipSync(Buffer.from("{ not json")) }, entry(["an", "array"], "Arr.paprikarecipe")]));
  const a = await p.P.analyzeFile(file, { existing: [], me: ME });
  assert.equal(a.items.length, 5);
  assert.deepEqual(a.unreadable.sort(), ["Arr.paprikarecipe", "Bad.paprikarecipe"]);
});

test("duplicates: same Paprika ID = already imported; same link or same recipe = duplicate; same name only = imported, marked", async () => {
  const p = await phone();
  const existing = [
    { id: "e1", title: "Korean Beef Bowl", url: "http://www.damndelicious.net/2013/06/14/korean-beef-bowl", ingredients: ["x"] },
    { id: "e2", title: "Overnight Oats", ingredients: ["1/2 cup rolled oats", "1/2 cup milk", "1/4 cup greek yogurt", "1 tbsp chia seeds", "Honey, to taste"] },
    { id: "e3", title: "Banana Bread!", ingredients: ["4 bananas"] },
    { id: "e4", title: "Lemon Vinaigrette", importId: "paprika:8E6F1A52-3B1D-4C6E-9F0A-1D2C3B4A5E65", ingredients: [] }
  ];
  const s = sampleRecipes();
  s[2].name = "Banana Bread";
  const a = await p.P.analyzeFile(asFile(paprikaExport(s)), { existing, me: ME });
  const st = t => { const i = byTitle(a.items, t); return [i.status, i.match]; };
  assert.deepEqual(st("Korean Beef Bowl"), ["duplicate", "e1"], "same link (http/www/trailing slash ignored)");
  assert.deepEqual(st("Overnight Oats"), ["duplicate", "e2"], "same name and same ingredients");
  assert.deepEqual(st("Banana Bread"), ["sameName", "e3"], "same name, different recipe: imported as new");
  assert.deepEqual(st("Lemon Vinaigrette"), ["already", "e4"]);
  assert.equal(st("Weeknight Chickpea Curry")[0], "ready");
  assert.equal(st("Untitled recipe")[0], "ready", "untitled recipes aren't name matches");
});

test("saving: in batches, photos kept on the phone, existing recipes untouched; importing again finds them all", async () => {
  const p = await phone({ recipes: { mine: { id: "mine", title: "My Own Chili", ingredients: ["1 lb beef"], steps: [], notes: "keep me" } } });
  const file = asFile(paprikaExport(sampleRecipes()));
  const a = await p.P.analyzeFile(file, { existing: p.store.recipes(), me: ME });
  const todo = a.items.filter(i => i.status !== "already" && i.status !== "duplicate");
  const prog = [];
  const res = await p.P.saveRecipes(todo, { batch: 3, onProgress: (d, t) => prog.push(d) });
  assert.equal(res.saved.length, 7); assert.equal(res.left, 0);
  assert.deepEqual(prog, [3, 6, 7]);
  assert.equal(p.store.recipe("mine").notes, "keep me");
  assert.equal(Object.keys(p.store.get().recipes).length, 8);
  const beef = p.store.recipes().find(r => r.title === "Korean Beef Bowl");
  assert.equal(p.photos.photoOf(beef.id), "https://damndelicious.net/wp-content/uploads/2013/06/korean-beef-bowl.jpg");
  assert.equal(JSON.parse(p.env.localStorage.getItem("recipebox.v1")).recipes[beef.id].title, "Korean Beef Bowl", "saved to storage");
  const again = await p.P.analyzeFile(file, { existing: p.store.recipes(), me: ME });
  assert.deepEqual([...new Set(again.items.map(i => i.status))], ["already"], "a repeat import adds nothing");
});

test("storage full: stops cleanly, keeps what fit, nothing half-saved", async () => {
  const p = await phone({ recipes: { mine: { id: "mine", title: "Mine", ingredients: [], steps: [] } } });
  const a = await p.P.analyzeFile(asFile(paprikaExport(Array.from({ length: 10 }, (_, i) => recipe({ name: `R${i}` })))), { existing: [], me: ME });
  const ls = p.env.localStorage, set = ls.setItem.bind(ls);
  let writes = 0;
  ls.setItem = (k, v) => { if (k === "recipebox.v1" && ++writes > 2) throw new Error("QuotaExceededError"); set(k, v); };
  const res = await p.P.saveRecipes(a.items, { batch: 4 });
  assert.deepEqual([res.saved.length, res.left], [8, 2]);
  assert.equal(Object.keys(p.store.get().recipes).length, 9, "the batch that didn't fit isn't kept in memory either");
  assert.equal(Object.keys(JSON.parse(ls.getItem("recipebox.v1")).recipes).length, 9, "and storage has the same");
});

test("a large library: 1,000 recipes analyze in a few seconds", async () => {
  const p = await phone();
  const many = Array.from({ length: 1000 }, (_, i) => recipe({ name: `Recipe number ${i}`, ingredients: Array.from({ length: 12 }, (_, j) => `${j + 1} cups ingredient ${j}`).join("\n"), directions: "Step one.\nStep two.\nStep three.", categories: ["Dinner"] }));
  const t0 = Date.now();
  const a = await p.P.analyzeFile(asFile(paprikaExport(many)), { existing: [], me: ME });
  assert.equal(a.items.length, 1000);
  assert.ok(Date.now() - t0 < 8000, `took ${Date.now() - t0} ms`);
});

test("imported recipes work like any other: nutrition, cost, scaling, meal plan, grocery list", async () => {
  const p = await phone();
  const a = await p.P.analyzeFile(asFile(paprikaExport(sampleRecipes())), { existing: [], me: ME });
  await p.P.saveRecipes(a.items);
  const N = await p.load("nutrition"), C = await p.load("prices"), G = await p.load("grocery");
  const curry = p.store.recipes().find(r => r.title === "Weeknight Chickpea Curry");
  const beef = p.store.recipes().find(r => r.title === "Korean Beef Bowl");
  assert.equal(N.nutritionFor(beef).kcal, 520, "the label from Paprika is used");
  assert.ok(N.nutritionFor(curry).kcal > 0, "estimated from the ingredients like any recipe");
  assert.ok(C.recipeCost(curry).total > 0);
  const wk = "2026-10-05";
  p.store.editWeek(wk).meals.push({ id: "m1", rid: curry.id, servings: 8, slots: ["mon-dinner"] }, { id: "m2", rid: beef.id, servings: 4, slots: ["tue-dinner"] });
  p.store.save();
  const names = G.buildList(wk).map(i => i.name.toLowerCase()).join(" | ");
  for (const n of ["chickpea", "coconut milk", "ground beef", "green onion"]) assert.match(names, new RegExp(n), n);
  assert.doesNotMatch(names, /curry:|for serving/, "headings aren't groceries");
});

test("household sync: one phone imports, the other gets the recipes with ratings and favorites", async () => {
  const w = makeWorker();
  const mk = async name => { const d = await device({ name, fetch: w.fetchFor(), seed: { "recipebox.v1": { settings: { proxy: w.base } } } }); return { ...d, store: await d.load("store"), sync: await d.load("sync"), P: await d.load("paprika"), R: await d.load("ratings") }; };
  const A = await mk("impA"), B = await mk("impB");
  A.R.setMyName("Fred");
  await A.sync.enable(); await B.sync.enable(A.sync.info().code);
  const a = await A.P.analyzeFile(asFile(paprikaExport(sampleRecipes())), { existing: A.store.recipes(), me: A.R.myKey() });
  await A.P.saveRecipes(a.items);
  for (let i = 0; i < 4; i++) { await A.sync.syncNow(); await B.sync.syncNow(); }
  const beef = B.store.recipes().find(r => r.title === "Korean Beef Bowl");
  assert.equal(B.store.recipes().length, 7);
  assert.deepEqual(beef.favorites, { "n:fred": true });
  assert.deepEqual(beef.ratings, { "n:fred": 5 });
  assert.equal(beef.importId, "paprika:8E6F1A52-3B1D-4C6E-9F0A-1D2C3B4A5E61");
  // Importing the same file on the second phone finds them all.
  const again = await B.P.analyzeFile(asFile(paprikaExport(sampleRecipes())), { existing: B.store.recipes(), me: "n:emma" });
  assert.deepEqual([...new Set(again.items.map(i => i.status))], ["already"]);
});
