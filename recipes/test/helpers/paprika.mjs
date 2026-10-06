// Builds Paprika export files for the tests: a ZIP archive (deflate) with one gzip-compressed JSON entry per
// recipe, named "<name>.paprikarecipe", as Paprika's "Export → All Recipes" makes them. No real export is in the
// repo (personal data); these follow the documented format. Replace with a real fixture when one is available.
import zlib from "node:zlib";

const le = (n, bytes) => { const b = Buffer.alloc(bytes); bytes === 2 ? b.writeUInt16LE(n) : b.writeUInt32LE(n >>> 0); return b; };

/** A ZIP archive from [{ name, data: Buffer }] (each entry deflated). */
export function zip(entries) {
  const locals = [], central = [];
  let offset = 0;
  for (const { name, data, store } of entries) {
    const n = Buffer.from(name), crc = zlib.crc32(data);
    const body = store ? data : zlib.deflateRawSync(data);
    const method = store ? 0 : 8;
    const local = Buffer.concat([le(0x04034b50, 4), le(20, 2), le(0, 2), le(method, 2), le(0, 2), le(0x21, 2), le(crc, 4), le(body.length, 4), le(data.length, 4), le(n.length, 2), le(0, 2), n, body]);
    central.push(Buffer.concat([le(0x02014b50, 4), le(20, 2), le(20, 2), le(0, 2), le(method, 2), le(0, 2), le(0x21, 2), le(crc, 4), le(body.length, 4), le(data.length, 4), le(n.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4), n]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.concat([le(0x06054b50, 4), le(0, 2), le(0, 2), le(entries.length, 2), le(entries.length, 2), le(cd.length, 4), le(offset, 4), le(0, 2)]);
  return Buffer.concat([...locals, cd, end]);
}

/** A Paprika recipe entry: the recipe's JSON, gzip-compressed. */
export const entry = (recipe, name = `${recipe.name || "Untitled"}.paprikarecipe`) => ({ name, data: zlib.gzipSync(Buffer.from(JSON.stringify(recipe))) });

/** A whole export from Paprika recipe objects (plus any raw extra entries). */
export const paprikaExport = (recipes, extra = []) => zip([...recipes.map(r => entry(r)), ...extra]);

/** As the browser hands it over: a File. */
export const asFile = (buf, name = "My Recipes.paprikarecipes") => new File([buf], name);

let n = 0;
/** A Paprika recipe with every field Paprika writes (override any). */
export function recipe(over = {}) {
  n++;
  return {
    uid: `5A1C2E3F-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `Recipe ${n}`,
    ingredients: "1 cup rice\n2 cups water",
    directions: "Rinse the rice.\nSimmer for 18 minutes.",
    description: "", notes: "", nutritional_info: "",
    servings: "4", prep_time: "", cook_time: "", total_time: "", difficulty: "",
    source: "", source_url: "", image_url: null, photo: null, photo_hash: null, photo_large: null, photo_data: null, photos: [],
    categories: [], rating: 0, on_favorites: false, created: "2023-04-02 18:22:31", scale: null,
    hash: "0".repeat(64),
    ...over
  };
}

/** The sample library (test/fixtures/paprika/sample.paprikarecipes): one of everything worth checking. */
export function sampleRecipes() {
  return [
    recipe({
      uid: "8E6F1A52-3B1D-4C6E-9F0A-1D2C3B4A5E61", name: "Korean Beef Bowl",
      ingredients: "1 lb ground beef\n3 cloves garlic, minced\n1/4 cup soy sauce\n2 tbsp brown sugar\n1 tsp sesame oil\n4 green onions (white and green parts), sliced\n2 cups cooked rice",
      directions: "1. Brown the beef in a large skillet.\n2. Add the garlic and cook for 1 minute.\n3. Stir in the soy sauce, sugar and sesame oil; simmer 2 to 3 minutes.\n4. Serve over rice with the green onions.",
      servings: "4 servings", prep_time: "10 mins", cook_time: "15 mins", total_time: "25 mins",
      source: "Damn Delicious", source_url: "https://damndelicious.net/2013/06/14/korean-beef-bowl/",
      image_url: "https://damndelicious.net/wp-content/uploads/2013/06/korean-beef-bowl.jpg",
      categories: ["Dinner", "Asian"], rating: 5, on_favorites: true,
      notes: "Double the sauce for meal prep.",
      nutritional_info: "Calories: 520\nTotal Fat: 22 g\nCarbohydrates: 48 g\nProtein: 30 g\nSodium: 1100 mg"
    }),
    recipe({
      uid: "8E6F1A52-3B1D-4C6E-9F0A-1D2C3B4A5E62", name: "Weeknight Chickpea Curry",
      ingredients: "Curry:\n1 tbsp olive oil\n1 onion, diced\n2 x 400g tins chickpeas, drained\n1 (13.5 oz) can coconut milk\n1-2 tsp curry powder\nSalt, to taste\nFor serving:\nCilantro (optional)\n½ cup plain Greek yogurt",
      directions: "Soften the onion in the oil.\n\nAdd the curry powder, then the chickpeas and coconut milk. Simmer 20-25 minutes.\nSeason and serve with cilantro and yogurt.",
      servings: "Serves 4 to 6", total_time: "40 minutes", categories: ["Dinner", "Vegetarian"], rating: 4,
      description: "Pantry curry from a dog-eared notebook.",
      photo_data: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDA==" // an embedded photo (no web address)
    }),
    recipe({
      uid: "8E6F1A52-3B1D-4C6E-9F0A-1D2C3B4A5E63", name: "Grandma's Banana Bread",
      ingredients: "3 ripe bananas\n1/3 cup melted butter\n3/4 cup sugar\n1 egg, beaten\n1 tsp baking soda\nPinch of salt\n1 1/2 cups all-purpose flour",
      directions: "Mash the bananas. Mix in the butter.\nStir in the rest.\nBake at 350°F for 1 hour.",
      servings: "1 loaf", prep_time: "15 min", cook_time: "1 hr", source: "Grandma's recipe card",
      categories: ["Baking", "Breakfast"], rating: 5, on_favorites: 1,
      notes: "She always added a handful of walnuts.", nutritional_info: "About 200 calories a slice"
    }),
    recipe({
      uid: "8E6F1A52-3B1D-4C6E-9F0A-1D2C3B4A5E64", name: "Overnight Oats",
      ingredients: "1/2 cup rolled oats\n1/2 cup milk\n1/4 cup Greek yogurt\n1 tbsp chia seeds\nHoney, to taste",
      directions: "Mix everything in a jar.\nRefrigerate overnight.",
      servings: "1", prep_time: "5 minutes", total_time: "overnight", categories: ["Breakfast"]
    }),
    recipe({ uid: "8E6F1A52-3B1D-4C6E-9F0A-1D2C3B4A5E65", name: "Lemon Vinaigrette", ingredients: "", directions: "Whisk lemon juice, olive oil, mustard and salt.", categories: ["Sauces"] }),
    recipe({ uid: "8E6F1A52-3B1D-4C6E-9F0A-1D2C3B4A5E66", name: "", ingredients: "2 cups flour\n1 cup water", directions: "Mix and knead." }),
    recipe({
      uid: "8E6F1A52-3B1D-4C6E-9F0A-1D2C3B4A5E67", name: "Trader Joe's Cauliflower Gnocchi Bake",
      ingredients: "1 bag (12 oz) Trader Joe's Cauliflower Gnocchi\n1 cup marinara\n1/2 cup shredded mozzarella",
      directions: "Pan-fry the gnocchi, top with sauce and cheese, broil until bubbly.",
      servings: "2", cook_time: "PT20M", categories: ["Dinner", "Quick"], rating: 3
    })
  ];
}
