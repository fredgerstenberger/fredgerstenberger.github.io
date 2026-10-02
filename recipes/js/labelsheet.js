// One ingredient's nutrition: where its numbers come from, and an optional way to make them exact by
// scanning or pasting the product's Nutrition Facts label. Opened by tapping an ingredient in a recipe's
// "Nutrition by ingredient" list (or from Ingredient info). Nothing here ever pops up on its own.
import * as store from "./store.js";
import { esc } from "./util.js";
import { modal, toast } from "./ui.js";
import { bump } from "./data.js";
import { parseIngredient } from "./ingredients.js";
import { parseLabelText, checkLabel, normalizeLabel, labelToFood } from "./label.js";
import { scanLabel } from "./scan.js";
import { openInfo, infoItems } from "./fillin.js";

const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const r0 = n => (n == null ? "–" : Math.round(n));

/** What the ingredient's numbers are now, in a short line. */
export function sourceLine(food, key) {
  const lab = food?.label;
  if (lab) return `From the label you added${lab.at ? ` · ${fmtDate(lab.at)}` : ""}${lab.servingText ? ` · per ${esc(lab.servingText)}: ${r0(lab.kcal)} kcal, ${r0(lab.protein)} g protein` : ""}`;
  if (food?.yours || (food?.custom && food?.nu)) return "Your numbers";
  if (food?.usda) return `USDA: ${esc(food.usda.description)}`;
  if (food?.standIn) return `Using regular ${esc(food.base || food.name)} values for ${esc(key)}`;
  if (food?.nu) return `Built-in values for ${esc(food.name)}`;
  return "No nutrition yet, so it isn't counted";
}

function foodFor(recipe, key) {
  for (const line of recipe.ingredients || []) {
    const ing = parseIngredient(line);
    if (!ing || ing.header) continue;
    const k = ing.food?.infoKey || ing.food?.name;
    if (k === key || (!ing.food && key && line.toLowerCase().includes(key))) return { food: ing.food, line };
  }
  return { food: null, line: "" };
}

export function openFoodSheet(recipe, key, onDone = () => {}) {
  const { food, line } = foodFor(recipe, key);
  const mine = store.get().foods?.[key];
  const st = store.settings();
  const { el, close } = modal(cap1(key), `
    <p class="muted" style="margin-top:0;font-size:14px">${esc(line)}</p>
    <p class="fsrc">${sourceLine(food, key)}</p>
    <p style="font-size:15px;margin:0 0 12px">Add the product's Nutrition Facts label to make it exact. It's used in every recipe with ${esc(key)}, on every synced phone.</p>
    <div class="fsact">
      <label class="btn primary fsfile">📷 Scan label<input type="file" accept="image/*" id="fsPhoto" hidden></label>
      <button class="btn" id="fsPaste">Paste label text</button>
      <button class="btn" id="fsType">Type numbers</button>
    </div>
    ${mine?.nu ? `<button class="btn small danger" id="fsRemove" style="margin-top:10px">Remove ${mine.label ? "label" : "my numbers"}</button>` : ""}
    <p class="muted" id="fsStatus" style="font-size:14px;min-height:1.2em"></p>`, { onClose: onDone });

  const status = t => { const s = el.querySelector("#fsStatus"); if (s) s.textContent = t; };
  el.querySelector("#fsPhoto").onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    status("Reading the label… this takes a few seconds.");
    try {
      const { label, check } = await scanLabel(file, { worker: st.proxy, model: st.scanModel, key: st.scanKey });
      confirmLabel(key, label, check, "photo", close);
    } catch (err) { status(err.message); }
  };
  el.querySelector("#fsPaste").onclick = () => pasteLabel(key, close);
  el.querySelector("#fsType").onclick = () => {
    const it = infoItems(recipe, true).find(i => i.key === key);
    if (it) openInfo(recipe, [it]); else toast("Nothing to fill in for this one");
  };
  el.querySelector("#fsRemove")?.addEventListener("click", () => {
    const keep = { ...mine };
    delete keep.nu; delete keep.nuRef; delete keep.label; delete keep.gCup; delete keep.gEach;
    store.putFood(key, keep.priceRef ? keep : null);
    close(); bump();
    toast(`${cap1(key)} uses the built-in values again`);
  });
}

function pasteLabel(key, closeParent) {
  const { el } = modal(`Paste label · ${key}`, `
    <p style="margin-top:0;font-size:15px">Copy the label's text and paste it here. On iPhone: open the photo, press and hold the text, then Copy (Live Text). Works offline.</p>
    <textarea id="lpText" rows="9" placeholder="Nutrition Facts&#10;Serving size 2 oz (56g)&#10;Calories 190&#10;…"></textarea>
    <div class="btnrow"><button class="btn primary" id="lpRead">Read label</button></div>
    <p class="muted" id="lpMsg" style="font-size:14px"></p>`);
  el.querySelector("#lpRead").onclick = () => {
    const f = parseLabelText(el.querySelector("#lpText").value);
    if (f.kcal == null && f.protein == null) { el.querySelector("#lpMsg").textContent = "Couldn't find calories or protein in that text. Check it's the Nutrition Facts part."; return; }
    confirmLabel(key, f, checkLabel(f), "text", closeParent);
  };
}

// The values read from the label, editable, then saved as the ingredient's info.
function confirmLabel(key, raw, check, how, done) {
  const f = normalizeLabel(raw);
  const n = (name, v, label, unit = "g") => `<label>${label}<span class="lin"><input type="number" name="${name}" inputmode="decimal" step="any" min="0" value="${v ?? ""}"><small>${unit}</small></span></label>`;
  const warn = c => c && c.ok === false ? `Calories don't match the protein, carbs and fat (those add up to about ${c.expected} kcal). Check the numbers against the label.` : "";
  const { el, close } = modal(`Label · ${key}`, `
    <p style="margin-top:0;font-size:15px">Check these against the label, then save. Values are per serving.</p>
    <form id="lcForm" class="lcform">
      <label class="wide">Serving size<input type="text" name="servingText" value="${esc(f.servingText || "")}" placeholder="e.g. 2 oz (56g)"></label>
      ${n("grams", f.grams ?? f.ml, f.ml && !f.grams ? "Serving (≈ g, from mL)" : "Serving weight", "g")}
      ${n("kcal", f.kcal, "Calories", "kcal")}
      ${n("protein", f.protein, "Protein")}
      ${n("carbs", f.carbs, "Total carbs")}
      ${n("fat", f.fat, "Total fat")}
      ${n("fiber", f.fiber, "Fiber")}
      <p class="lcwarn" id="lcWarn" ${warn(check) ? "" : "hidden"}>${warn(check)}</p>
      <div class="btnrow"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" id="lcCancel">Cancel</button></div>
    </form>`);
  const form = el.querySelector("#lcForm");
  const read = () => {
    const v = k => { const x = parseFloat(form.elements[k].value); return isNaN(x) ? null : x; };
    return { ...f, servingText: form.elements.servingText.value.trim() || null, grams: v("grams"), ml: f.grams ? f.ml : null, kcal: v("kcal"), protein: v("protein"), carbs: v("carbs"), fat: v("fat"), fiber: v("fiber") };
  };
  form.addEventListener("input", () => { const w = warn(checkLabel(read())); const p = el.querySelector("#lcWarn"); p.textContent = w; p.hidden = !w; });
  el.querySelector("#lcCancel").onclick = close;
  form.onsubmit = e => {
    e.preventDefault();
    const vals = read();
    if (!vals.grams) { toast("Add the serving weight in grams (it's usually in brackets after the serving size)"); return; }
    const entry = labelToFood(vals, { how, at: Date.now() });
    if (!entry) { toast("Add at least the calories and the serving weight"); return; }
    const prev = store.get().foods?.[key];
    if (prev?.priceRef) entry.priceRef = prev.priceRef; // keep a price you entered
    store.putFood(key, entry);
    close(); done?.(); bump();
    toast(`Saved · ${key} now uses its label`);
  };
}
