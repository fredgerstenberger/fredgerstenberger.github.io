// Prices: see the estimate used for each ingredient and enter your own store's prices.
import * as store from "../store.js";
import { esc } from "../util.js";
import { shell, render, modal, toast } from "../ui.js";
import { FOODS, AISLES } from "../fooddb.js";
import { priceEntry, basisLabel, basisGrams, BASE_PRICES, regionFactor, money, REGIONS } from "../prices.js";
import { officialInfo, refreshPrices } from "../data.js";

let query = "";
let onlyMine = false;

export function pricesView() {
  const s = store.settings();
  const region = s.priceRegion === "custom" ? `${s.priceCustomPct}% of US average` : (REGIONS.find(r => r[0] === s.priceRegion) || REGIONS[0])[1];
  const mineCount = Object.keys(store.get().prices || {}).length;

  render(shell({
    title: "Prices",
    back: "#/more",
    body: `
      <p style="margin-top:0">Prices for <b>${esc(region)}</b> (<a href="#/settings">change</a>). Tap an item to enter what <b>your</b> store charges; your prices are used exactly and marked ★.</p>
      ${officialInfo() ? `<p class="note" style="font-size:14px">${officialInfo().count} items use <b>official U.S. average prices</b> from the Bureau of Labor Statistics (${esc(officialInfo().period)}), adjusted for your region and refreshed monthly. They're marked <span class="kind">BLS</span>. Others are estimates.</p>`
        : `<p class="note" style="font-size:14px">Connect your Worker in Settings to use official monthly prices from the Bureau of Labor Statistics for ~30 staples.</p>`}
      <input type="search" id="pq" placeholder="Search ingredients…" value="${esc(query)}" autocomplete="off" autocapitalize="none">
      <div class="chips" style="margin:10px 0 4px">
        <button class="chip" id="mineOnly" aria-pressed="${onlyMine}">★ My prices (${mineCount})</button>
      </div>
      <div id="plist"></div>`,
    status: `<span>Estimates ×${regionFactor().toFixed(2)} vs US average</span><span>${mineCount} yours</span>`
  }), { keepScroll: true });

  const listEl = document.getElementById("plist");
  function draw() {
    const q = query.trim().toLowerCase();
    const mine = store.get().prices || {};
    const foods = FOODS.filter(f => f.kind !== "X" && BASE_PRICES[f.name] && BASE_PRICES[f.name].price > 0)
      .filter(f => !q || f.aliases.some(a => a.includes(q)))
      .filter(f => !onlyMine || mine[f.name]);
    listEl.innerHTML = AISLES.map(([id, label]) => {
      const fs = foods.filter(f => f.aisle === id).sort((a, b) => a.name.localeCompare(b.name));
      if (!fs.length) return "";
      return `<div class="aisle">${label}</div><ul class="plist">${fs.map(f => {
        const e = priceEntry(f.name);
        return `<li><button class="pricerow" data-food="${esc(f.name)}"><span>${esc(f.name)}${e.mine ? ` <span class="kind">★ yours</span>` : e.official ? ` <span class="kind">BLS</span>` : ""}</span><span class="pr">${money(e.price)} <small>/ ${esc(basisLabel(f, e.basis))}</small></span></button></li>`;
      }).join("")}</ul>`;
    }).join("") || `<p class="muted">No matches.</p>`;
  }
  document.getElementById("pq").addEventListener("input", e => { query = e.target.value; draw(); });
  document.getElementById("mineOnly").onclick = () => { onlyMine = !onlyMine; pricesView(); };
  listEl.addEventListener("click", e => {
    const b = e.target.closest("[data-food]");
    if (b) editPrice(b.dataset.food, () => pricesView());
  });
  draw();
  refreshPrices().then(() => { if (location.hash === "#/prices") draw(); });
}

export function editPrice(name, done) {
  const f = FOODS.find(x => x.name === name);
  const e = priceEntry(name);
  const bases = ["p", "e", "l"].filter(b => basisGrams(f, b));
  const est = BASE_PRICES[name];
  const estNow = est ? Math.round(est.price * regionFactor() * 100) / 100 : null;
  const { el, close } = modal("Your price", `
    <p style="margin:0 0 4px;font-weight:700;font-size:18px">${esc(name)}</p>
    <p class="muted" style="margin:0 0 14px;font-size:14px">Estimate: ${money(estNow)} / ${esc(basisLabel(f, est.basis))}</p>
    <div class="row2">
      <label class="field"><span>Price ($)</span><input type="number" id="pp" inputmode="decimal" step="0.01" min="0" value="${e.price}"></label>
      <label class="field"><span>Per</span><select id="pb">${bases.map(b => `<option value="${b}" ${e.basis === b ? "selected" : ""}>${esc(basisLabel(f, b))}</option>`).join("")}</select></label>
    </div>
    <div class="btnrow">
      <button class="btn primary" id="ok">Save my price</button>
      ${e.mine ? `<button class="btn" id="reset">Use estimate</button>` : ""}
    </div>`);
  el.querySelector("#ok").onclick = () => {
    const v = parseFloat(el.querySelector("#pp").value);
    if (isNaN(v) || v < 0) { toast("Enter a price"); return; }
    store.setPrice(name, Math.round(v * 100) / 100, el.querySelector("#pb").value);
    close(); toast("Saved"); done && done();
  };
  el.querySelector("#reset")?.addEventListener("click", () => { store.setPrice(name, null); close(); toast("Back to estimate"); done && done(); });
}
