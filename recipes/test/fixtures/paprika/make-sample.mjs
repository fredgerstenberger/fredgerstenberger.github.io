// Writes sample.paprikarecipes (7 recipes plus one broken entry), to try the importer in the app:
//   node test/fixtures/paprika/make-sample.mjs
import fs from "node:fs";
import { paprikaExport, sampleRecipes } from "../../helpers/paprika.mjs";

const broken = { name: "Broken Recipe.paprikarecipe", data: Buffer.from("not gzip, not json") };
fs.writeFileSync(new URL("./sample.paprikarecipes", import.meta.url), paprikaExport(sampleRecipes(), [broken]));
console.log("wrote sample.paprikarecipes");
