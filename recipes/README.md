# Recipe Box

A mobile-first recipe app: paste a recipe link, get a clean, cook-friendly page. Plan breakfast, lunch and dinner for the week, and get a merged grocery list.

Live at **https://fredgerstenberger.github.io/recipes/** (after this folder is on `main`).

## Features
- **Import from any recipe site.** Reads the site's structured recipe data, so ads and life stories are stripped out. Falls back to typing a recipe in by hand.
- **Import from cookbook photos.** **Scan photo** sends the page to an open-weight vision model (Qwen / Mistral / Gemma / Llama) on Cloudflare Workers AI through your Worker and returns the recipe. Or copy text from a photo with iPhone Live Text (or from an email or note) and paste it. Either way it's split into title, servings, times, ingredients and steps.
- **Recipe book** with search, star ratings, notes and keywords. Keywords are suggested automatically (chicken, pasta, dinner, …). Quick filters: breakfast, lunch, dinner, low cal, high protein, quick, 4+ stars.
- **Cooking view:** servings scaling, Original/US/Metric units, tap an amount for conversions (tsp ↔ tbsp ↔ cups ↔ grams), tap-to-start timers inside steps, and a cook mode that keeps the screen on.
- **Nutrition:** uses the site's numbers when published. Otherwise it estimates from ingredients using a built-in table of about 250 foods (marked with `~`). Foods outside the table are looked up in USDA FoodData Central through the Worker.
- **Meal plan:** Mon–Sun, with Sunday as shop + prep day. Cook a batch once and tick extra slots for leftovers; groceries count each batch once.
- **Grocery list:** merges duplicates across recipes, rounds up to whole packages (boxes, cans, cartons, bunches), groups by aisle, and asks once about pantry items like spices and sauces, then remembers your answer.
- **Prices:** estimated cost per serving for each recipe (a Budget filter and cost sort), weekly food cost in the meal plan, and an estimated total on the grocery list. Official U.S. average prices from the Bureau of Labor Statistics (about 30 staples, refreshed monthly through the Worker), with built-in estimates for the rest, are adjusted for your region (e.g. Irvine ≈ +15%), and you can enter your own store's prices.
- **Pantry, converter, light/dark mode, offline support** (add it to your iPhone home screen).

Data is stored on the device (localStorage). **Sync** (Settings → Sync) keeps it the same across your devices and a partner's, through your Cloudflare Worker: each recipe, week plan, grocery list, pantry, prices and settings syncs separately and the newest edit wins. Invite another device with **Create invite**. Each invite is a random code that works once and expires after 24 hours. **Reset sync code** removes access for every other device. **Settings → Export backup** is still available.

## Files
- `index.html`, `app.css`: page shell and styles (same 8-bit look as the portfolio)
- `js/fooddb.js`: ingredient table (nutrition, aisle, pantry type, package sizes)
- `js/ingredients.js`: ingredient line parser and unit conversions
- `js/parse.js`: fetch via proxy + recipe extraction (JSON-LD, microdata, heuristics)
- `js/grocery.js`, `js/nutrition.js`, `js/tags.js`: list building, nutrition estimates, auto keywords
- `js/prices.js`: price table, regional adjustment, recipe and grocery cost
- `js/views/*`: screens
- `sw.js`, `manifest.webmanifest`, `icons/`: installable, offline-capable app
- `js/scan.js`: photo shrinking and the scan request
- `js/data.js`: official prices (BLS) and USDA nutrition lookups via the Worker
- `js/sync.js`: device sync (change tracking, push/pull, invites)
- `worker/`: Cloudflare Worker for reliable link imports and AI photo scanning (see its README for setup)

No build step. To run locally: `python3 -m http.server 8000`, then open http://localhost:8000/recipes/.
