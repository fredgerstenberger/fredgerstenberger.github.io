# iPhone checklist

About 10 minutes with two iPhones (yours and Emma's). These are the things the automated tests can only simulate: they run in Chromium, and iOS Safari behaves differently for home-screen apps, the camera, keeping the screen awake and dragging. Do it after a release that touches these areas, or now and then. Note anything that fails (and which phone and iOS version) and send it over.

Before you start: both phones are on the new version (**Settings** shows "Recipe Box" and the version number; if one is behind, open the app, wait for **Recipe Box updated · Reload**, and tap Reload).

## 1. Home-screen app and offline (2 min)

- [ ] Open the app from the **home-screen icon**, not Safari. It fills the screen with no Safari address bar.
- [ ] Turn on **Airplane Mode**, close the app (swipe it away), and open it again. It opens right away with your recipes, plan and list.
- [ ] Still offline: open a recipe, check off a grocery item. Turn Airplane Mode off; within a few seconds the check shows on Emma's phone.

## 2. Updates (1 min, only when a new version was just released)

- [ ] With the app open, after the release: **Recipe Box updated · Reload** appears at the bottom within a minute or so (or after switching away and back).
- [ ] Start typing in a box (a recipe note, say) without saving, then tap Reload: it asks before reloading, so what you typed isn't lost by accident.
- [ ] Tap Reload with nothing unsaved: the app reloads and Settings shows the new version.

## 3. Grocery list and shopping (3 min)

- [ ] Type in the add box: `ice cream` adds Ice cream (not cream). `2% milk` and `oat milk` are separate lines. `half and half` is one item. `1,000 g flour` reads as a thousand grams.
- [ ] On an item that's a variety of something a recipe needs, **Use for recipe** works.
- [ ] Tap **Start shopping** and leave the phone untouched for 2 minutes: the screen stays on. (Needs iOS 18.4 or later for the home-screen app; on older iOS it just dims as usual.) Leave shopping mode; the screen dims normally again.
- [ ] Emma adds an item and checks one off on her phone while your list is open: within a few seconds yours updates and shows a note like "Emma checked eggs".
- [ ] **Stores**: pick a store, open its aisles. Drag an aisle by its **≡** handle to a new spot; the order sticks after leaving and coming back. Scroll the aisle list by swiping anywhere **except** the handle: it scrolls without moving aisles.

## 4. Recipes (2 min)

- [ ] On a recipe, tap the big **Your rating** stars: your rating saves, and the small average line updates on both phones.
- [ ] In **Nutrition by ingredient**, tap an ingredient, then **Scan label**: choose **Take Photo**, shoot a real Nutrition Facts panel, check the numbers, Save. The recipe's nutrition changes.
- [ ] Same again with **Photo Library** (a photo or screenshot of a label).
- [ ] **Paste label text**: in Photos, open a label photo, press and hold the text, **Copy** (Live Text), paste into the box, **Read label**. The numbers match the label. This one also works offline.
- [ ] **Scan photo** on a cookbook page imports a recipe.

## 5. Shortcut (1 min, if you use it)

- [ ] Run the add-to-list Shortcut (see the README): Safari opens and the item lands on the list on both phones. If Safari says "this browser isn't synced", join sync in Safari once with an invite link.

## 6. Looks (1 min)

- [ ] Switch iPhone **Dark Mode** on and off (Control Center): every screen stays readable in both, including toasts and pop-up sheets.
- [ ] Rotate to landscape on the grocery list and a recipe: nothing is cut off and nothing scrolls sideways.
- [ ] **Settings**: the app key, Worker address and scan model are filled in (open Settings on both phones once to be sure).
