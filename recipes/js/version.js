// App version shown in Settings. Bump together with VERSION in sw.js ("rb-v" + APP_VERSION).
export const APP_VERSION = 17;
export const RELEASED = "2026-10-02";
export const WHATS_NEW = [
  "Shared ratings: everyone rates recipes themselves and the average is what shows. Set your name in Settings → Sync.",
  "Planning together: meals added, moved or removed on two phones at once all stick, and recipe edits (rating on one phone, notes on the other) both keep.",
  "\"half a dozen eggs\", \"2 + 1/2 cups\" and the grocery list's \"2 dozen (24 eggs)\" now read right.",
  "Recipe links are read by your Worker, which sends back just the recipe (faster, and the Worker can't be used as a proxy).",
  "Shopping together: checking items on two phones at once no longer undoes each other, and checks show up within seconds.",
  "Restoring a backup keeps anything newer (Merge), or replaces everything only when you say so.",
  "Better ingredient reading: \"1 dozen eggs\", \"2 x 400g tins\", \"1 tbsp + 1 tsp\"; \"large onion\" keeps its size; US amounts like \"½ cup + 1 tbsp\".",
  "\"20 to 25 minutes\" offers both timers; finished timers say how long ago.",
  "After saving a recipe, you're asked once to fill in nutrition or prices the app doesn't know. Change them anytime with Ingredient info.",
  "Price per serving has its own line on every recipe card.",
  "Tapped recipes no longer stay highlighted on iPhone.",
  "New font: Nunito, easier to read. The 8-bit icons stay.",
  "Official U.S. grocery prices (BLS) and USDA nutrition through your Worker.",
  "One-time sync invites: each code works once and expires after 24 hours.",
  "Edit grocery items and recipe ingredients; add-to-list is at the top."
];
