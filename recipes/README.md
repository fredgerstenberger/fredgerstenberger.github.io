# Recipe Box

A mobile-first recipe app: paste a recipe link, get a clean, cook-friendly page. Plan breakfast, lunch and dinner for the week, and get a merged grocery list.

Live at **https://fredgerstenberger.github.io/recipes/** (after this folder is on `main`).

## Features
- **Import from any recipe site.** Reads the site's structured recipe data, so ads and life stories are stripped out. Falls back to typing a recipe in by hand.
- **Recipe book** with search, star ratings, notes and keywords. Keywords are suggested automatically (chicken, pasta, dinner, …). Quick filters: breakfast, lunch, dinner, low cal, high protein, quick, 4+ stars.
- **Cooking view:** servings scaling, Original/US/Metric units, tap an amount for conversions (tsp ↔ tbsp ↔ cups ↔ grams), tap-to-start timers inside steps, and a cook mode that keeps the screen on.
- **Nutrition:** uses the site's numbers when published. Otherwise it estimates from ingredients using a built-in table of about 250 foods (marked with `~`).
- **Meal plan:** Mon–Sun, with Sunday as shop + prep day. Cook a batch once and tick extra slots for leftovers; groceries count each batch once.
- **Grocery list:** merges duplicates across recipes, rounds up to whole packages (boxes, cans, cartons, bunches), groups by aisle, and asks once about pantry items like spices and sauces, then remembers your answer.
- **Pantry, converter, light/dark mode, offline support** (add it to your iPhone home screen).

Data is stored on the device (localStorage). Use **Settings → Export backup**.

## Files
- `index.html`, `app.css`: page shell and styles (same 8-bit look as the portfolio)
- `js/fooddb.js`: ingredient table (nutrition, aisle, pantry type, package sizes)
- `js/ingredients.js`: ingredient line parser and unit conversions
- `js/parse.js`: fetch via proxy + recipe extraction (JSON-LD, microdata, heuristics)
- `js/grocery.js`, `js/nutrition.js`, `js/tags.js`: list building, nutrition estimates, auto keywords
- `js/views/*`: screens
- `sw.js`, `manifest.webmanifest`, `icons/`: installable, offline-capable app
- `worker/`: optional Cloudflare Worker proxy for reliable imports (see its README)

No build step. To run locally: `python3 -m http.server 8000`, then open http://localhost:8000/recipes/.
