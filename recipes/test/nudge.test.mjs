// The note under a recipe's Nutrition: a big contributor on stand-in values (or not counted) is named once,
// quietly; stand-ins don't count as "recognized".
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const d = await device({ name: "nudge" });
const store = await d.load("store");
const { nutritionFor } = await d.load("nutrition");
const { nuNudge } = await d.load("views/recipe");

let n = 0;
function recipe(ingredients) {
  const id = "r" + ++n;
  store.get().recipes[id] = { id, title: "T", yield: 4, ingredients, steps: [], updated: n };
  return store.get().recipes[id];
}

test("protein pasta on regular pasta's numbers: named, and not counted as recognized", () => {
  const r = recipe(["1 lb protein pasta", "2 tbsp olive oil", "1 cup marinara sauce", "1/4 cup parmesan"]);
  const nu = nutritionFor(r);
  assert.ok(nu.coverage < 1, `coverage ${nu.coverage}`);
  const note = nuNudge(r, nu);
  assert.equal(note.text, "Protein pasta uses regular pasta values");
  assert.equal(note.key, "protein pasta");
  assert.equal(note.action, "Add its label");
});

test("a small stand-in isn't worth a note", () => {
  const r = recipe(["2 lb chicken breast", "2 cups rice", "1 tbsp low-sodium soy sauce"]);
  assert.equal(nuNudge(r, nutritionFor(r))?.key ?? null, null);
});

test("ingredients with no nutrition at all are named, with the fill-in form", () => {
  const r = recipe(["2 cups rice", "1 tsp zorbleberry powder"]);
  const note = nuNudge(r, nutritionFor(r));
  assert.match(note.text, /^Not counted: zorbleberry/);
  assert.equal(note.action, "Add info");
  assert.ok(note.items.length >= 1);
});

test("a big ingredient with no numbers is named first", () => {
  const r = recipe(["500 g zorbleberries", "1 cup rice"]);
  assert.equal(nuNudge(r, nutritionFor(r)).text, "Zorbleberries isn't counted");
});

test("hidden notes stay hidden (per recipe and ingredient)", () => {
  const r = recipe(["1 lb protein pasta", "1 cup marinara sauce"]);
  const note = nuNudge(r, nutritionFor(r));
  d.env.localStorage.setItem("rb.nuhide", JSON.stringify({ [note.hide]: 1 }));
  assert.equal(nuNudge(r, nutritionFor(r)), null);
});
