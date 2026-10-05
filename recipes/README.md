# Recipe Box

A mobile-first recipe app: paste a recipe link, get a clean, cook-friendly page. Plan breakfast, lunch and dinner for the week, and get a merged grocery list.

Live at **https://fredgerstenberger.github.io/recipes/** (after this folder is on `main`).

## Features
- **Tab bar:** Plan, Recipes, List and More along the bottom. The app opens on **Today** (in Plan, with **Week** beside it: Today | Week): tonight's dinner with its photo and **Start cooking** (opens cook mode), the day's other meals, the grocery list for the week you're shopping for and tomorrow's dinner. **More** holds Pantry, Prices, Stores & aisles, the converter, Sync, Settings and Backup.
- **Import from any recipe site.** Saves a clean, cook-friendly copy from the site's recipe data, credited to the site and author with a link back to the original. Falls back to typing a recipe in by hand. Recipes read automatically from a page or a photo say so, so you know to check them.
- **Import from cookbook photos.** **Scan photo** sends the page to an open-weight vision model (Qwen / Mistral / Gemma / Llama) on Cloudflare Workers AI through your Worker and returns the recipe. Or copy text from a photo with iPhone Live Text (or from an email or note) and paste it. Either way it's split into title, servings, times, ingredients and steps.
- **Recipe book** with search, star ratings, notes and keywords. Keywords are suggested automatically (chicken, pasta, dinner, …). Quick filters along the top (breakfast, lunch, dinner, lighter, high protein, quick, budget, 4+ stars), and a **Filters** sheet with everything: meal, calories, protein, time and cost per serving, rating and keywords.
- **Recipe photos:** a recipe added from a link gets the site's photo, shown on the recipe, in the book and on Today. Recipes saved before photos get theirs automatically, a few at a time while the book is open (or right away with ⋯ → **Get photo from <site>**); it uses the page's recipe data or its share image, never AI. Photos are links kept on each phone (not synced) and cached for offline use. Imports through the Worker include the photo once the Worker is redeployed with this version.
- **Recipe menu (⋯):** Edit, Share, the photo, and Delete (asks first).
- **Cooking view:** servings scaling, Original/US/Metric units, tap an amount for conversions (tsp ↔ tbsp ↔ cups ↔ grams), tap-to-start timers inside steps, and a cook mode that keeps the screen on.
- **Nutrition:** uses the site's numbers when published. Otherwise it estimates from ingredients using a built-in table of about 250 foods. Foods outside the table are looked up in USDA FoodData Central through the Worker.
  - **Specific products** ("protein pasta", "chickpea pasta", "Barilla Protein+ penne", "skim milk") are their own ingredient: the table food (pasta, milk) is used for the aisle and price, and its nutrition stands in until you add the product's. On the grocery list a specific product is its own line ("Protein pasta", "Skim milk"); a recipe that just says "butter" joins the week's one "unsalted butter" line, since words like unsalted, a color or a flavor only change what to buy. When a big ingredient (15%+ of calories or protein) uses stand-in numbers, a note under the recipe's Nutrition says so.
  - **Add a label (optional):** in a recipe's Nutrition section, open **Nutrition by ingredient** (biggest contributors first, each tagged with where its numbers come from) and tap an ingredient. **Paste label image** reads a copied picture of the Nutrition Facts panel (a screenshot, or Photos → Share → Copy Photo) and **Label photo** a photo or screenshot you pick, both through your Worker; **Paste label text** reads iPhone Live Text on the phone (works offline). The same two picture buttons are on each ingredient in the **Fill in missing info?** prompt, where they fill in that ingredient's numbers without leaving the prompt. Check the numbers, save, and every recipe with that product uses them, on every synced phone. Photos aren't kept anywhere. No food logging: just better per-recipe numbers.
- **Store-bought meals:** ready-made lunches and dinners (a Trader Joe's meal) plan like recipes. Add one from the meal plan's recipe picker (**+ Store-bought meal**) or Recipes → **Store-bought**: name, store, servings per package, price, and the label's nutrition (paste a picture of it). It's one grocery line in **Prepared foods** (whole packages for the servings planned, with the store), and its label and price count toward the day's calories and the week's food cost. They stay out of the recipe book unless the Store-bought chip is on. Stored as a recipe with a `ready` field, so it syncs like one; older app versions see a one-ingredient recipe.
- **Meal plan:** a week of 3 meals a day, starting the day after your shop + prep day (Sunday by default, so Mon–Sun; change it in Settings → Cooking & planning, and the plan and grocery lists follow). Cook a batch once and tick extra slots for leftovers; groceries count each batch once.
- **Grocery list:** merges duplicates across recipes, rounds up to whole packages (boxes, cans, cartons, bunches; a spoonful of a pantry food is one jar or bag, and a small amount of something unknown shows just its name), groups by aisle, and asks once about pantry items like spices and sauces, then remembers your answer.
  - **Tap a row to check it off.** It folds into **In cart** at the bottom, with Undo. Press and hold (or swipe left) for details, edit and remove. A progress bar and the estimated total left sit at the top.
  - **Fast add:** type "2 lb chicken thighs" and it goes to the right aisle with its amount. Suggestions come from what you've added before (most often first) and the food table; chips offer your usual items. Adding something already on the list adds to that line instead of repeating it.
  - **A fresh list every week.** Things you add (paper towels, cat litter) go on the week you're looking at. When you open this week's list and last week's list has things that didn't get checked off (yours or from recipes), a card asks **Still need these?**: keep the ones you want ticked and tap **Add to this week**, or **Start fresh**. It's asked once, for both phones; if you skipped it by mistake, **From last week** at the bottom of the list brings it back. Lists older than 8 weeks are deleted.
  - **Stores:** without one, the list goes produce, dairy, meat, then the packaged aisles (including Snacks and Drinks), with frozen last. Add your stores and drag the ≡ handles into the order you walk them; the list follows as you go. Stores sync; which one you're shopping at is per phone.
  - **Shopping mode:** only what's left, by aisle, with the title and week scrolling away and a progress bar pinned at the top, and the screen kept awake (Safari 16.4+, home-screen app on iOS 18.4+). **Stop shopping** goes back to the full list; what you checked off is folded under **Purchased** at the bottom (**In cart** while you shop), and tapping an item there puts it back on the list.
  - **Live with a partner:** while the list is open it checks for changes every 4 seconds and says what happened ("Emma checked eggs"). Their initial shows on things they added or checked.
  - **Add from a link or Siri:** `…/recipes/?add=milk, eggs` adds items (see below).
- **Prices:** estimated cost per serving for each recipe (a Budget filter and cost sort), weekly food cost in the meal plan, and an estimated total on the grocery list. Official U.S. average prices from the Bureau of Labor Statistics (about 30 staples, refreshed monthly through the Worker), with built-in estimates for the rest, are adjusted for your region (e.g. Irvine ≈ +15%), and you can enter your own store's prices.
- **Pantry, converter, light/dark mode, offline support** (add it to your iPhone home screen). The app opens from its own saved copy, instantly even with a weak signal; a new version downloads in the background and the app offers **Reload** (or uses it the next time it opens).

Data is stored on the device (localStorage). **Sync** (Settings → Sync) keeps it the same across your devices and a partner's, through your Cloudflare Worker: recipes, week plans, grocery lists, pantry, prices and settings merge field by field (each meal, each grocery item, each recipe field), so two people planning or shopping at once keep each other's changes (a grocery list refreshes every few seconds while it's open). Deleting a recipe wins over edits made before it; an edit made after a delete brings the recipe back. Each person rates recipes themselves and the average is shown everywhere (set your name in Settings → Sync so your devices count as one person). Invite another device with **Create invite**. Each invite is a random code that works once and expires after 24 hours. **Reset sync code** removes access for every other device. **Settings → Export backup** is still available.

## Add to the grocery list from a Shortcut or Siri

Opening `https://fredgerstenberger.github.io/recipes/?add=milk, 2 lb chicken thighs, eggs` adds those items to this week's list (commas, semicolons or new lines separate items) and opens the grocery list. Items already on the list merge into their line, and the link is removed from the address bar, so reloading doesn't add them twice.

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
- `js/household.js`: things you add yourself, each on a week's list (leftovers, moving them to the next week, pruning old weeks)
- `js/stores.js`, `js/views/stores.js`: stores and their aisle order
- `js/live.js`: notes for a partner's grocery changes
- `js/ready.js`, `js/views/ready.js`: store-bought meals (record, packages and cost; form and page)
- `js/photos.js`: recipe photo links, kept on each phone
- `js/views/today.js`, `js/views/more.js`: the Today and More tabs
- `js/pixicons.js`: small pixel icons (aisles, cart, check)
- `worker/`: Cloudflare Worker for reliable link imports and AI photo scanning (see its README for setup)

**Developer settings:** the Worker address, app key and photo model are hidden from regular Settings. Tap the version number in Settings 7 times to show them (per device; 7 more taps hide them). Messages only mention the Worker in developer mode.

No build step. To run locally: `python3 -m http.server 8000`, then open http://localhost:8000/recipes/.

**Releasing:** bump `APP_VERSION` in `js/version.js` and `VERSION` in `sw.js` together whenever app files change; phones only pick up a release when `VERSION` changes. A new module goes in `js/`, in `index.html`'s `modulepreload` list and in `sw.js` `FILES` (`test/files.test.mjs` checks all three, and the two versions). The service worker stays off on localhost so edits show up right away; to try it locally, run `localStorage.setItem("rb.sw", "1")` in the console and reload.

## Tests

The tests below run on every pull request (GitHub Actions, **Tests** workflow). For what only a real phone can show (home-screen install, offline launch, camera, screen staying awake, dragging aisles), use the [iPhone checklist](PHONE-CHECKLIST.md).

No build step and no dependencies. With Node 22 or later, from `recipes/`:

```
npm test        # same as: node --test test/*.test.mjs
```

Live tests of your deployed Worker's label reading (they use a little Workers AI allowance, so they're separate): `WORKER_URL=https://… APP_KEY=… npm run test:live`, or on GitHub: **Actions → Worker live tests → Run workflow** with repository secrets `WORKER_URL` and `APP_KEY`.

The tests run the app's modules directly in Node (no browser). `test/helpers/device.mjs` gives each simulated phone its own copy of the modules, its own `localStorage` and its own clock, and `test/helpers/worker.mjs` runs the real Worker code in memory, so the sync tests are two phones syncing through the actual `RecipeSync` logic.

