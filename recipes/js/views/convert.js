// Kitchen converter: volume ↔ weight (with ingredient densities), tsp/tbsp/cup, oven temps.
import { esc } from "../util.js";
import { shell, render } from "../ui.js";
import { FOODS, matchFood } from "../fooddb.js";
import { equivalents, parseNum } from "../ingredients.js";

const UNIT_CHOICES = [["tsp", "teaspoons"], ["tbsp", "tablespoons"], ["cup", "cups"], ["floz", "fluid ounces"], ["ml", "milliliters"], ["l", "liters"], ["g", "grams"], ["kg", "kilograms"], ["oz", "ounces (weight)"], ["lb", "pounds"]];

export function convertView() {
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem("rb.conv")) || {}; } catch { return {}; } })();
  render(shell({
    title: "Converter",
    body: `
      <div class="row2">
        <label class="field"><span>Amount</span><input type="text" id="amt" inputmode="decimal" value="${esc(saved.amt || "1")}" placeholder="1 1/2"></label>
        <label class="field"><span>Unit</span><select id="unit">${UNIT_CHOICES.map(([v, l]) => `<option value="${v}" ${(saved.unit || "cup") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>Ingredient (for grams ↔ cups)</span>
        <input type="text" id="food" list="cfoods" value="${esc(saved.food || "")}" placeholder="e.g. flour, sugar, butter" autocomplete="off" autocapitalize="none">
        <datalist id="cfoods">${FOODS.filter(f => f.gCup).map(f => `<option value="${esc(f.name)}">`).join("")}</datalist>
        <small id="fnote">Leave blank for liquids (uses water).</small>
      </label>
      <div class="eqs" id="eqs" aria-live="polite"></div>

      <h2 class="sect">Oven temperature</h2>
      <div class="row2">
        <label class="field"><span>°F</span><input type="number" id="tf" inputmode="numeric" value="350"></label>
        <label class="field"><span>°C</span><input type="number" id="tc" inputmode="numeric" value="177"></label>
      </div>

      <h2 class="sect">Cheat sheet</h2>
      <table class="ref">
        <tr><td>3 teaspoons</td><td>1 tbsp</td></tr>
        <tr><td>2 tablespoons</td><td>⅛ cup · 1 fl oz</td></tr>
        <tr><td>4 tablespoons</td><td>¼ cup</td></tr>
        <tr><td>5 tbsp + 1 tsp</td><td>⅓ cup</td></tr>
        <tr><td>8 tablespoons</td><td>½ cup</td></tr>
        <tr><td>16 tablespoons</td><td>1 cup</td></tr>
        <tr><td>1 cup</td><td>237 ml · 8 fl oz</td></tr>
        <tr><td>2 cups</td><td>1 pint</td></tr>
        <tr><td>4 cups</td><td>1 quart · 946 ml</td></tr>
        <tr><td>1 ounce (weight)</td><td>28 g</td></tr>
        <tr><td>1 pound</td><td>454 g</td></tr>
        <tr><td>1 stick butter</td><td>½ cup · 113 g</td></tr>
        <tr><td>1 cup flour</td><td>125 g</td></tr>
        <tr><td>1 cup sugar</td><td>200 g</td></tr>
        <tr><td>1 cup brown sugar (packed)</td><td>220 g</td></tr>
        <tr><td>1 large egg</td><td>50 g</td></tr>
        <tr><td>325 · 350 · 375 · 400 · 425 °F</td><td>165 · 175 · 190 · 205 · 220 °C</td></tr>
      </table>`
  }));

  const amt = document.getElementById("amt"), unit = document.getElementById("unit"), food = document.getElementById("food");
  const eqs = document.getElementById("eqs"), fnote = document.getElementById("fnote");
  function update() {
    const q = parseNum(amt.value.replace(/[½¼¾⅓⅔]/g, m => ({ "½": " 1/2", "¼": " 1/4", "¾": " 3/4", "⅓": " 1/3", "⅔": " 2/3" }[m])).trim());
    const f = food.value.trim() ? matchFood(food.value) : null;
    fnote.textContent = food.value.trim() ? (f && f.gCup ? `Using ${f.name}: 1 cup ≈ ${f.gCup} g` : "Don't know that one; using water") : "Leave blank for liquids (uses water).";
    const list = q ? equivalents(q, unit.value, f && f.gCup ? f : { gCup: 236.588 }) : [];
    eqs.innerHTML = list.map(x => `<div>${esc(x)}</div>`).join("") || `<p class="muted">Enter an amount.</p>`;
    try { sessionStorage.setItem("rb.conv", JSON.stringify({ amt: amt.value, unit: unit.value, food: food.value })); } catch {}
  }
  [amt, unit, food].forEach(x => x.addEventListener("input", update));
  update();

  const tf = document.getElementById("tf"), tc = document.getElementById("tc");
  tf.addEventListener("input", () => { const v = parseFloat(tf.value); if (!isNaN(v)) tc.value = Math.round((v - 32) * 5 / 9); });
  tc.addEventListener("input", () => { const v = parseFloat(tc.value); if (!isNaN(v)) tf.value = Math.round(v * 9 / 5 + 32); });
}
