# Recipe Box

A mobile-first recipe app: paste a recipe link, get a clean, cook-friendly page. Plan breakfast, lunch and dinner for the week, and get a merged grocery list.

Live at **https://fredgerstenberger.github.io/recipes/** (after this folder is on `main`).

## Features
- **Import from any recipe site.** Reads the site's structured recipe data, so ads and life stories are stripped out. Falls back to typing a recipe in by hand.
- **Import from cookbook photos.** **Scan photo** sends the page to an open-weight vision model (Qwen / Mistral / Gemma / Llama) on Cloudflare Workers AI through your Worker and returns the recipe. Or copy text from a photo with iPhone Live Text (or from an email or note) and paste it. Either way it's split into title, servings, times, ingredients and steps.
- **Recipe book** with search, star ratings, notes and keywords. Keywords are suggested automatically (chicken, pasta, dinner, …). Quick filters: breakfast, lunch, dinner, low cal, high protein, quick, 4+ stars.
- **Cooking view:** servings scaling, Original/US/Metric units, tap an amount for conversions (tsp ↔ tbsp ↔ cups ↔ grams), tap-to-start timers inside steps, and a cook mode that keeps the screen on.
- **Nutrition:** uses the site's numbers when published. Otherwise it estimates from ingredients using a built-in table of about 250 foods. Foods outside the table are looked up in USDA FoodData Central through the Worker.
- **Meal plan:** Mon–Sun, with Sunday as shop + prep day. Cook a batch once and tick extra slots for leftovers; groceries count each batch once.
- **Grocery list:** merges duplicates across recipes, rounds up to whole packages (boxes, cans, cartons, bunches; a spoonful of a pantry food is one jar or bag, and a small amount of something unknown shows just its name), groups by aisle, and asks once about pantry items like spices and sauces, then remembers your answer.
  - **Tap a row to check it off.** It folds into **In cart** at the bottom, with Undo. Press and hold (or swipe left) for details, edit and remove. A progress bar and the estimated total left sit at the top.
  - **Fast add:** type "2 lb chicken thighs" and it goes to the right aisle with its amount. Suggestions come from what you've added before (most often first) and the food table; chips offer your usual items. Adding something already on the list adds to that line instead of repeating it.
  - **One household list for things you add** (paper towels, cat litter), shown with whichever week you're looking at, so it never disappears when the week changes.
  - **Stores:** without one, the list goes produce, dairy, meat, then the packaged aisles (including Snacks and Drinks), with frozen last. Add your stores and drag the ≡ handles into the order you walk them; the list follows as you go. Stores sync; which one you're shopping at is per phone.
  - **Shopping mode:** bigger rows with only what's left, by aisle, and the screen kept awake (Safari 16.4+, home-screen app on iOS 18.4+). **Done shopping** clears what you added and bought, notes purchases, and can mark pantry foods as stocked.
  - **Live with a partner:** while the list is open it checks for changes every 4 seconds and says what happened ("Emma checked eggs"). Their initial shows on things they added or checked.
  - **Add from a link or Siri:** `…/recipes/?add=milk, eggs` adds items (see below).
- **Prices:** estimated cost per serving for each recipe (a Budget filter and cost sort), weekly food cost in the meal plan, and an estimated total on the grocery list. Official U.S. average prices from the Bureau of Labor Statistics (about 30 staples, refreshed monthly through the Worker), with built-in estimates for the rest, are adjusted for your region (e.g. Irvine ≈ +15%), and you can enter your own store's prices.
- **Pantry, converter, light/dark mode, offline support** (add it to your iPhone home screen). The app opens from its own saved copy, instantly even with a weak signal; a new version downloads in the background and the app offers **Reload** (or uses it the next time it opens).

Data is stored on the device (localStorage). **Sync** (Settings → Sync) keeps it the same across your devices and a partner's, through your Cloudflare Worker: recipes, week plans, grocery lists, pantry, prices and settings merge field by field (each meal, each grocery item, each recipe field), so two people planning or shopping at once keep each other's changes (a grocery list refreshes every few seconds while it's open). Deleting a recipe wins over edits made before it; an edit made after a delete brings the recipe back. Each person rates recipes themselves and the average is shown everywhere (set your name in Settings → Sync so your devices count as one person). Invite another device with **Create invite**. Each invite is a random code that works once and expires after 24 hours. **Reset sync code** removes access for every other device. **Settings → Export backup** is still available.

## Add to the grocery list from a Shortcut or Siri

Opening `https://fredgerstenberger.github.io/recipes/?add=milk, 2 lb chicken thighs, eggs` adds those items to the household list (commas, semicolons or new lines separate items) and opens the grocery list. Items already on the list merge into their line, and the link is removed from the address bar, so reloading doesn't add them twice.

**One-tap iOS Shortcut** (Shortcuts app → **+**):
1. **Ask for Input**: type Text, prompt "Add to groceries". For Siri, use **Dictate Text** instead. For a fixed button, use a **Text** action with e.g. `milk`.
2. **URL Encode** the result from step 1.
3. **Text**: `https://fredgerstenberger.github.io/recipes/?add=`, then insert the **URL Encoded Text** variable right after `=`.
4. **Open URLs** with that text.
5. Name it "Add to groceries". Use **Add to Home Screen** for one tap, or say "Hey Siri, add to groceries".

**iOS limits to know:**
- Shortcuts open links in **Safari**, not the home-screen app, and Safari keeps its own storage. To make Safari add to your shared list, connect Safari to sync once: in the app, **Settings → Sync → Create invite**, then open that invite link in Safari and join. After that, items added through the Shortcut reach every phone within seconds. If Safari isn't connected, the app says "this browser isn't synced" and offers to set it up.
- A web app can't add items in the background or from the share sheet. The Shortcut always opens Safari briefly.

## Files
- `index.html`, `app.css`: page shell and styles ("Calm Pixel": a calm, roomy layout with pixel accents from the portfolio's 8-bit look)
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
- `js/fields.js`: field-by-field merging for grocery lists, pantry, prices and settings
- `js/quickadd.js`: parsing what's typed in the add box, merging duplicates, suggestions, history
- `js/household.js`: the ongoing household list (things you add yourself)
- `js/stores.js`, `js/views/stores.js`: stores and their aisle order
- `js/live.js`: notes for a partner's grocery changes
- `js/pixicons.js`: small pixel icons (aisles, cart, check)
- `worker/`: Cloudflare Worker for reliable link imports and AI photo scanning (see its README for setup)

No build step. To run locally: `python3 -m http.server 8000`, then open http://localhost:8000/recipes/.

**Releasing:** bump `APP_VERSION` in `js/version.js` and `VERSION` in `sw.js` together whenever app files change; phones only pick up a release when `VERSION` changes. A new module goes in `js/`, in `index.html`'s `modulepreload` list and in `sw.js` `FILES` (`test/files.test.mjs` checks all three, and the two versions). The service worker stays off on localhost so edits show up right away; to try it locally, run `localStorage.setItem("rb.sw", "1")` in the console and reload.

## Tests

No build step and no dependencies. With Node 22 or later, from `recipes/`:

```
npm test        # same as: node --test test/*.test.mjs
```

The tests run the app's modules directly in Node (no browser). `test/helpers/device.mjs` gives each simulated phone its own copy of the modules, its own `localStorage` and its own clock, and `test/helpers/worker.mjs` runs the real Worker code in memory, so the sync tests are two phones syncing through the actual `RecipeSync` logic.

