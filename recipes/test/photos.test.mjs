// Recipe photos: the image from a site's recipe data, kept on this phone only (never in the synced recipe).
import test from "node:test";
import assert from "node:assert/strict";
import { imageOf, recipeFromLdTexts } from "../js/recipe-data.js";
import { device } from "./helpers/device.mjs";

const IMAGES = [
  // schema.org image as written by recipe sites → the address used
  ["https://a.com/x.jpg", "https://a.com/x.jpg"],
  [["https://a.com/1x1.jpg", "https://a.com/16x9.jpg"], "https://a.com/1x1.jpg"],
  [{ "@type": "ImageObject", url: "https://b.com/y.jpg", width: 1200 }, "https://b.com/y.jpg"],
  [[{ "@type": "ImageObject", contentUrl: "https://c.com/z.webp" }], "https://c.com/z.webp"],
  ["http://insecure.com/x.jpg", ""],
  ["javascript:alert(1)", ""],
  ["https://a.com/x.jpg\" onerror=\"x", ""],
  [null, ""]
];
for (const [img, want] of IMAGES) test(`image: ${JSON.stringify(img)}`, () => assert.equal(imageOf(img), want));

test("a recipe's JSON-LD image comes through the import", () => {
  const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "Recipe", name: "Tacos", image: { "@type": "ImageObject", url: "https://site.com/tacos.jpg" }, recipeIngredient: ["1 lb chicken"], recipeInstructions: ["Cook."] });
  assert.equal(recipeFromLdTexts([ld]).image, "https://site.com/tacos.jpg");
});

test("photos are kept per phone, https only, and can be removed", async () => {
  const A = await device({ name: "A" }), B = await device({ name: "B" });
  const PA = await A.load("photos"), PB = await B.load("photos");
  PA.setPhoto("r1", "https://site.com/tacos.jpg");
  PA.setPhoto("r2", "http://site.com/no.jpg");
  assert.equal(PA.photoOf("r1"), "https://site.com/tacos.jpg");
  assert.equal(PA.photoOf("r2"), null);
  assert.equal(PB.photoOf("r1"), null, "the other phone has its own");
  assert.deepEqual(Object.keys(PA.allPhotos()), ["r1"]);
  PA.setPhoto("r1", null);
  assert.equal(PA.photoOf("r1"), null);
});

test("the photo is not part of the recipe record (so it doesn't sync)", async () => {
  const d = await device({ name: "C" });
  const store = await d.load("store");
  store.putRecipe({ id: "r9", title: "T", ingredients: [], steps: [] });
  assert.equal("image" in store.recipe("r9"), false);
  assert.equal(d.env.localStorage.getItem("recipebox.v1").includes("tacos.jpg"), false);
});
