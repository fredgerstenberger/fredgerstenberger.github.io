// Single recipe: cooking-friendly view with scaling, unit conversion, timers, nutrition, tags, notes.
import * as store from "../store.js";
import { esc, fmtMinutes, debounce, domainOf } from "../util.js";
import { shell, render, starsHTML, confirmBox, toast, go, modal } from "../ui.js";
import { photoOf, setPhoto } from "../photos.js";
import { photoFromPage } from "../parse.js";
import { ratingOf, rate } from "../ratings.js";
import * as sync from "../sync.js";
import { parseIngredient, displayAmount, equivalents } from "../ingredients.js";
import { nutritionFor, servingsOf, ingredientCounts, countsText } from "../nutrition.js";
import { findTimes, startTimer } from "../timers.js";
import { sprite, icon } from "../sprites.js";
import { tipHTML, estimatesNoticeHTML, estimatesButton, bindEstimatesNotice } from "../tips.js";
import { openAddToPlan } from "./plan.js";
import { recipeCost, money, REGIONS } from "../prices.js";
import { infoItems, openInfo, askAfterSave } from "../fillin.js";
import { openFoodSheet } from "../labelsheet.js";
import { isReady } from "../ready.js";
import { readyView } from "./ready.js";

const progress = {}; // id → { ings:Set, steps:Set, servings, cook }
let redrawCurrent = null;
// New official data (USDA/BLS) arrived: refresh the open recipe in place, keeping your scroll position.
export function refreshRecipe() { redrawCurrent?.(); }
let wakeLock = null;

async function lockScreen() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener?.("release", () => { wakeLock = null; });
    }
  } catch { wakeLock = null; }
}
function unlockScreen() { try { wakeLock?.release(); } catch {} wakeLock = null; }
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && document.body.classList.contains("cook") && !wakeLock) lockScreen();
});

export function leaveRecipe() {
  document.body.classList.remove("cook");
  unlockScreen();
  document.querySelector(".pop")?.remove();
}

function regionName() {
  const s = store.settings();
  if (s.priceRegion === "custom") return `${s.priceCustomPct}% of US average`;
  return (REGIONS.find(x => x[0] === s.priceRegion) || REGIONS[0])[1];
}

// Your rating is the big row you tap; the household's average is a small line under it. (Before, the
// average was big and on top, so it looked like the place to tap.) On your own (no sync, nobody else has
// rated), it's just your stars.
function ratingHTML(r) {
  const R = ratingOf(r);
  const mine = !sync.enabled() && !R.others.length ? R.mine || (R.legacy ? R.avg : 0) : R.mine;
  const hint = mine ? "" : tipHTML("rate", "Tap a star to rate it.");
  const shared = sync.enabled() || R.others.length;
  const avg = shared && R.count
    ? `<p class="ravg">${icon("star", "ic16")}<b>${Math.round(R.avg * 10) / 10}</b> average from ${R.count} rating${R.count > 1 ? "s" : ""}${R.others.some(o => o.name) ? `<span class="ravgwho">${R.others.filter(o => o.name).map(o => `${esc(o.name)} ${o.stars}`).join(", ")}</span>` : ""}</p>`
    : "";
  return `<div class="ratingbox">
    <div class="rmine"><span class="rlabel">Your rating</span>${starsHTML(mine, { label: "Your rating" })}</div>${hint}
    ${avg}
  </div>`;
}

// Each ingredient's part of the nutrition, biggest first, with where its numbers come from. Tapping one
// opens its nutrition: scan or paste the product's label to make it exact.
const SRC = { label: "Label", yours: "Yours", usda: "USDA", standin: "Using {base}", table: "", none: "Not counted" };
function nuRowsHTML(rows) {
  const seen = new Set();
  return rows.filter(r => r.key).slice().sort((a, b) => (b.kcal ?? -1) - (a.kcal ?? -1)).map(row => {
    const tag = (SRC[row.source] ?? "").replace("{base}", row.food || "");
    const dup = seen.has(row.key + row.line); seen.add(row.key + row.line);
    if (dup) return "";
    return `<li><button class="nurow ${row.source === "none" ? "miss" : ""}" data-food="${esc(row.key)}">
      <span class="nuname">${esc(row.line)}${tag ? `<small class="nutag ${row.source}">${esc(tag)}</small>` : ""}</span>
      <span class="nuval">${row.kcal != null ? `${Math.round(row.kcal)} kcal<br>${Math.round(row.protein)} g P` : "?"}</span>
      <span class="nugo">${icon("chevRight", "ic16")}</span>
    </button></li>`;
  }).join("");
}

// One quiet line under Nutrition when the estimate leans on numbers that aren't really this recipe's: a big
// contributor (15%+ of calories or protein) on stand-in values, or one with none (20%+ of the weight).
// Otherwise, ingredients with no nutrition at all are named, with the same form the first prompt showed.
// Dismissed per recipe and ingredient, on this phone.
const NUDGE_KEY = "rb.nuhide";
const cap1 = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);
const nudgeHidden = () => { try { return JSON.parse(localStorage.getItem(NUDGE_KEY) || "{}"); } catch { return {}; } };
export function nuNudge(r, nu) {
  if (nu.source !== "estimate" || !nu.rows) return null;
  const hidden = nudgeHidden(), id = k => `${r.id}|${k}`;
  const weighed = nu.rows.filter(x => x.grams > 0).reduce((t, x) => t + x.grams, 0);
  const big = nu.rows
    .filter(x => x.key && !hidden[id(x.key)] && (x.source === "standin" ? x.share >= 0.15 : x.source === "none" && x.grams > 0 && x.grams / weighed >= 0.2))
    .sort((a, b) => (b.share || 0) - (a.share || 0) || (b.grams || 0) - (a.grams || 0))[0];
  if (big) return { hide: id(big.key), key: big.key, action: "Add its label",
    text: big.source === "standin" ? `${cap1(big.key)} uses regular ${big.food} values` : `${cap1(big.key)} isn't counted` };
  const missing = infoItems(r).filter(it => it.needNu && !it.food?.nu);
  const names = missing.map(it => it.key), hide = id("missing:" + names.join(","));
  if (!missing.length || hidden[hide]) return null;
  return { hide, items: missing, action: "Add info", text: `Not counted: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}` };
}

// Where a recipe came from, near its title: the site and author, with a link back to the original. Recipes
// that AI read from a page or a photo say so, so people know to check them.
function sourceHTML(r) {
  const note = r.origin === "photo" ? "Imported from photo" : r.origin === "ai-page" ? "Read from page" : "";
  if (!r.url) return `<p class="rsource">${r.author ? `<span>By ${esc(r.author)}</span>` : "<span>Your recipe</span>"}${note ? `<span class="rorigin">${note}</span>` : ""}</p>`;
  return `<p class="rsource"><span class="rsite">${esc(r.site || domainOf(r.url))}</span>${r.author ? `<span>By ${esc(r.author)}</span>` : ""}
    <a class="rview" href="${esc(r.url)}" target="_blank" rel="noopener">View original ${icon("external", "ic16")}</a>${note ? `<span class="rorigin">${note}</span>` : ""}</p>`;
}
const costCounts = c => {
  const n = c.rows.length, priced = c.rows.filter(x => x.cost != null).length;
  return n ? `${priced} of ${n} ingredient${n === 1 ? "" : "s"} priced` : "";
};

function fmtN(n) { return n == null || isNaN(n) ? "–" : Math.round(n); }

export function recipeView(id) {
  const r = store.recipe(id);
  if (!r) { render(shell({ title: "Not found", back: "#/book", body: `<p>That recipe isn't in your book anymore.</p><a class="btn" href="#/book">Back to recipe book</a>` })); return; }
  if (isReady(r)) return readyView(r); // a store-bought meal has its own simpler page
  const P = progress[id] ||= { ings: new Set(), steps: new Set(), servings: servingsOf(r), cook: false };
  const s = store.settings();
  // The unit toggle on a recipe is temporary; changing the default in Settings resets it.
  if (P.modeBase !== s.units) { P.mode = null; P.modeBase = s.units; }
  let mode = P.mode || s.units;

  function draw(keepScroll = true) {
    const base = servingsOf(r);
    const mult = P.servings / base;
    const nu = nutritionFor(r);
    const nudge = nuNudge(r, nu);
    const photo = photoOf(r.id);
    const cost = recipeCost(r);
    const est = nu.source === "estimate";

    let stepNo = 0;
    const firstOpen = (() => { let i = 0; for (const st of r.steps || []) { if (!st.startsWith("#")) { if (!P.steps.has(i)) return i; i++; } } return -1; })();

    const ingEditHTML = (r.ingredients || []).map((line, i) => `
      <li class="ingedit"><input type="text" data-ingtext="${i}" value="${esc(line)}" aria-label="Ingredient ${i + 1}" autocomplete="off">
      <button class="iconbtn" data-ingdel="${i}" aria-label="Remove ingredient">${icon("close", "ic16")}</button></li>`).join("") + `
      <li class="ingedit"><input type="text" id="ingAdd" placeholder="Add an ingredient" autocomplete="off">
      <button class="btn small" id="ingAddBtn">Add</button></li>`;

    const ingHTML = (r.ingredients || []).map((line, i) => {
      const ing = parseIngredient(line);
      if (!ing) return "";
      if (ing.header) return `<li class="hdr">${esc(ing.header)}</li>`;
      const done = P.ings.has(i);
      let amt = "", rest = esc(line);
      if (ing.qty != null) {
        const a = displayAmount(ing, mult, mode);
        const canConvert = ing.unit && equivalents(ing.qty * mult, ing.unit, ing.food).length > 1;
        amt = canConvert
          ? `<button class="amt" data-conv="${i}" aria-label="Show conversions for ${esc(a)}">${esc(a)}</button>`
          : `<span class="amt">${esc(a)}</span>`;
        rest = esc((ing.display || ing.name) + (ing.note ? `, ${ing.note}` : ""));
      }
      return `<li class="${done ? "done" : ""}"><label><input type="checkbox" data-ing="${i}" ${done ? "checked" : ""}><span>${amt} ${rest}</span></label></li>`;
    }).join("");

    let si = 0;
    const stepHTML = (r.steps || []).map(st => {
      if (st.startsWith("#")) return `<li class="hdr">${esc(st.replace(/^#+\s*/, ""))}</li>`;
      const i = si++; stepNo++;
      const cls = P.steps.has(i) ? "done" : i === firstOpen ? "current" : "";
      const { html, timers } = findTimes(esc(st));
      return `<li class="step ${cls}" data-step="${i}"><div class="stepbody"><span>${html}</span>${timers.map(tm =>
        `<button class="timelink" data-min="${tm.min}" data-label="Step ${stepNo}" aria-label="Start ${tm.text} timer">${icon("timer", "ic16")}<span>${tm.text}</span></button>`).join("")}</div></li>`;
    }).join("");

    const times = [];
    if (r.prepMin) times.push(`Prep ${fmtMinutes(r.prepMin)}`);
    if (r.cookMin) times.push(`${times.length ? "cook" : "Cook"} ${fmtMinutes(r.cookMin)}`);

    render(shell({
      bigTitle: false,
      title: r.title,
      back: "#/book",
      // Cooking: Exit cook in the top bar. Otherwise the ⋯ menu (Edit, Share, photo, Delete).
      actions: P.cook ? `<button class="tb-btn" id="cookBtn" aria-pressed="true">Exit cook</button>`
        : `<button class="tb-btn tb-more" id="moreBtn" aria-label="More actions" aria-haspopup="dialog">${icon("more", "ic20")}</button>`,
      body: `
        ${photo ? `<img class="rphoto hide-cook" data-photo src="${esc(photo)}" alt="" decoding="sync" referrerpolicy="no-referrer">` : ""}
        <h2 class="rtitle">${esc(r.title)}</h2>
        ${sourceHTML(r)}
        <div class="hide-cook">${ratingHTML(r)}</div>
        <dl class="facts">
          ${r.totalMin ? `<div><dt>Time</dt><dd>${fmtMinutes(r.totalMin)}${times.length ? `<br><span class="muted" style="font-size:14px">${times.join(", ")}</span>` : ""}</dd></div>` : ""}
          <div><dt>Servings</dt><dd>
            <span class="stepper"><button id="sMinus" aria-label="Fewer servings">${icon("minus", "ic16")}</button><output id="sOut">${P.servings}</output><button id="sPlus" aria-label="More servings">${icon("plus", "ic16")}</button></span>
            ${P.servings !== base ? `<br><button class="btn small" id="sReset" style="margin-top:8px">Reset to ${base}</button>` : ""}
          </dd></div>
          ${cost.total > 0 ? `<div><dt>Cost</dt><dd>${money(cost.perServing)}/serving<br><span class="muted" style="font-size:14px">${money(cost.perServing * P.servings)} for ${P.servings}</span></dd></div>` : ""}
          ${nu.kcal ? `<div><dt>Per serving</dt><dd>${fmtN(nu.kcal)} kcal<br><span class="muted" style="font-size:14px">${fmtN(nu.protein)} g protein</span></dd></div>` : ""}
        </dl>
        <div class="btnrow hide-cook rbtns">
          <button class="btn primary" id="planBtn">+ Meal plan</button>
          ${P.cook ? "" : `<button class="btn" id="cookBtn">Cook mode</button>`}
        </div>

        <h2 class="sect">Ingredients <small>${P.ings.size && !P.editIngs ? `<button class="btn small" id="clearIngs" style="min-height:28px">Clear ${P.ings.size}</button> ` : ""}<button class="btn small" id="editIngs" style="min-height:28px">${P.editIngs ? "Done" : `${icon("edit", "ic16")} Edit`}</button></small></h2>
        ${P.editIngs ? `<p class="muted" style="font-size:14px;margin:0 0 8px">Changes save as you go. Start a line with # for a section heading.</p>
        <ul class="ings">${ingEditHTML}</ul>` : `
        <div class="cookbar">
          <div class="seg" role="group" aria-label="Units">
            ${[["original", "Original"], ["us", "US"], ["metric", "Metric"]].map(([v, l]) => `<button data-mode="${v}" aria-pressed="${mode === v}">${l}</button>`).join("")}
          </div>
        </div>
        ${tipHTML("convert", "Tap an amount to see it in other units.")}
        <ul class="ings">${ingHTML || `<li class="muted">No ingredients yet.</li>`}</ul>`}

        <h2 class="sect">Steps <small>${P.steps.size ? `<button class="btn small" id="clearSteps" style="min-height:28px">Reset</button>` : ""}</small></h2>
        ${P.steps.size ? "" : tipHTML("steps", "Tap a step when it's done. The next one stays highlighted.")}
        <ol class="steps">${stepHTML || `<li class="muted">No steps yet.</li>`}</ol>

        <div class="hide-cook">
          <h2 class="sect">Nutrition <small>per serving ${estimatesButton()}</small></h2>
          ${estimatesNoticeHTML()}
          ${nu.kcal ? `
          <div class="nutri">
            <div><b>${fmtN(nu.kcal)}</b><span>calories</span></div>
            <div><b>${fmtN(nu.protein)}g</b><span>protein</span></div>
            <div><b>${fmtN(nu.carbs)}g</b><span>carbs</span></div>
            <div><b>${fmtN(nu.fat)}g</b><span>fat</span></div>
            <div><b>${fmtN(nu.fiber)}g</b><span>fiber</span></div>
            ${nu.sodium != null ? `<div><b>${fmtN(nu.sodium)}</b><span>mg sodium</span></div>` : ""}
          </div>` : ""}
          <p class="muted nusrc">${est
            ? `${countsText(ingredientCounts(nu))}${nu.assumedServings ? `<br>Assumes 4 servings. Set servings in Edit.` : ""}`
            : `From ${esc(r.site || "the recipe")}${nu.serving ? `<br>Serving: ${esc(nu.serving)}` : ""}`}</p>
          ${nudge ? `<p class="nunote" id="nunote"><span>${esc(nudge.text)}<button class="linkbtn" id="nuAct">${nudge.action}</button></span><button class="nux" id="nuHide" aria-label="Hide this note">${icon("close", "ic16")}</button></p>` : ""}
          ${nu.rows && nu.rows.length ? `<details class="breakdown nubd" ${P.nubd ? "open" : ""}><summary>Nutrition by ingredient</summary>
            <ul class="nurows">${nuRowsHTML(nu.rows)}</ul>
          </details>` : ""}

          <h2 class="sect">Cost <small>${estimatesButton()}</small></h2>
          ${cost.total > 0 ? `<div class="nutri">
            <div><b>${money(cost.perServing)}</b><span>per serving</span></div>
            <div><b>${money(cost.total)}</b><span>whole recipe</span></div>
          </div>` : ""}
          <p class="muted nusrc">${costCounts(cost)}<br>${esc(regionName())} prices <a href="#/prices">Edit prices</a></p>
          <details class="breakdown"><summary>Cost breakdown</summary><table>
            ${cost.rows.map(row => row.cost != null
              ? `<tr><td>${esc(row.line)}</td><td class="n">${money(row.cost)}</td></tr>`
              : `<tr class="miss"><td>${esc(row.line)}<br><span>No price</span></td><td class="n">?</td></tr>`).join("")}
          </table></details>
          ${infoItems(r, true).length ? `<div class="btnrow"><button class="btn small" id="ingInfo">${icon("edit", "ic16")} Ingredient info</button></div>` : ""}

          <h2 class="sect">Keywords</h2>
          <div class="chips" id="tags">
            ${(r.tags || []).map(tg => `<button class="chip" data-rmtag="${esc(tg)}" aria-label="Remove ${esc(tg)}">${esc(tg)} <span class="x">${icon("close", "ic16")}</span></button>`).join("")}
          </div>
          <form id="tagForm" class="inline" style="margin-top:10px">
            <input type="text" id="tagIn" placeholder="Add a keyword" autocomplete="off" autocapitalize="none">
            <button class="btn small" type="submit">Add</button>
          </form>

          <h2 class="sect">Notes</h2>
          <div class="notesbox">
            <textarea id="notes" placeholder="Swaps, tweaks, what to try next time">${esc(r.notes || "")}</textarea>
            <div class="saved" id="saved"></div>
          </div>
        </div>`,
      status: `<span>${r.created ? `Added ${new Date(r.created).toLocaleDateString()}` : ""}</span>`
    }), { keepScroll });
    document.body.classList.toggle("cook", P.cook);
    bind();
  }

  function bind() {
    const root = document.getElementById("app");
    bindEstimatesNotice(root);
    root.querySelectorAll("[data-star]").forEach(b => b.onclick = () => {
      const n = +b.dataset.star, mine = ratingOf(r).mine;
      rate(r, mine === n ? 0 : n); // tap your current rating again to clear it
      draw();
    });
    const setServ = v => { P.servings = Math.max(1, Math.min(99, v)); draw(); };
    document.getElementById("sMinus").onclick = () => setServ(P.servings - 1);
    document.getElementById("sPlus").onclick = () => setServ(P.servings + 1);
    document.getElementById("sReset")?.addEventListener("click", () => setServ(servingsOf(r)));
    root.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { mode = P.mode = b.dataset.mode; draw(); });
    root.querySelectorAll("[data-ing]").forEach(c => c.onchange = () => {
      const i = +c.dataset.ing;
      c.checked ? P.ings.add(i) : P.ings.delete(i);
      c.closest("li").classList.toggle("done", c.checked);
    });
    document.getElementById("clearIngs")?.addEventListener("click", () => { P.ings.clear(); draw(); });
    document.getElementById("editIngs").onclick = () => { P.editIngs = !P.editIngs; P.ings.clear(); draw(); if (!P.editIngs) askAfterSave(r.id); };
    document.getElementById("ingInfo")?.addEventListener("click", () => openInfo(r, infoItems(r, true)));
    root.querySelector(".nubd")?.addEventListener("toggle", e => { P.nubd = e.target.open; });
    root.querySelectorAll("[data-food]").forEach(b => b.onclick = () => openFoodSheet(r, b.dataset.food));
    const note = () => nuNudge(r, nutritionFor(r));
    document.getElementById("nuAct")?.addEventListener("click", () => { const n = note(); if (n) n.key ? openFoodSheet(r, n.key) : openInfo(r, n.items); });
    document.getElementById("nuHide")?.addEventListener("click", () => {
      const n = note();
      if (n) try { localStorage.setItem(NUDGE_KEY, JSON.stringify({ ...nudgeHidden(), [n.hide]: 1 })); } catch {}
      document.getElementById("nunote")?.remove();
    });
    if (P.editIngs) {
      const saveIngs = () => { store.putRecipe(r); };
      root.querySelectorAll("[data-ingtext]").forEach(inp => inp.addEventListener("change", () => {
        const v = inp.value.trim();
        const i = +inp.dataset.ingtext;
        if (v) r.ingredients[i] = v; else r.ingredients.splice(i, 1);
        saveIngs();
        if (!v) draw();
      }));
      root.querySelectorAll("[data-ingdel]").forEach(b => b.onclick = () => { r.ingredients.splice(+b.dataset.ingdel, 1); saveIngs(); draw(); });
      const addIng = () => {
        const inp = document.getElementById("ingAdd");
        const v = inp.value.trim();
        if (!v) return;
        (r.ingredients ||= []).push(v);
        saveIngs(); draw();
        document.getElementById("ingAdd")?.focus();
      };
      document.getElementById("ingAddBtn").onclick = addIng;
      document.getElementById("ingAdd").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addIng(); } });
    }
    document.getElementById("clearSteps")?.addEventListener("click", () => { P.steps.clear(); draw(); });
    root.querySelectorAll("li.step").forEach(li => li.onclick = e => {
      const tb = e.target.closest(".timelink");
      if (tb) { e.stopPropagation(); startTimer(+tb.dataset.min, `${tb.dataset.label}, ${r.title.slice(0, 18)}`); toast(`Timer started: ${tb.textContent.trim()}`); return; }
      const i = +li.dataset.step;
      P.steps.has(i) ? P.steps.delete(i) : P.steps.add(i);
      draw();
    });
    root.querySelectorAll("[data-conv]").forEach(b => b.onclick = e => {
      e.preventDefault(); e.stopPropagation();
      showConversions(b, parseIngredient(r.ingredients[+b.dataset.conv]), P.servings / servingsOf(r));
    });
    document.getElementById("cookBtn").onclick = () => {
      P.cook = !P.cook;
      if (P.cook && s.wakeLock) lockScreen(); else unlockScreen();
      draw(false);
      if (P.cook) document.querySelector(".ings")?.scrollIntoView({ block: "start" });
      toast(P.cook ? (s.wakeLock && "wakeLock" in navigator ? "Cook mode on. Your screen stays awake." : "Cook mode on") : "Cook mode off");
    };
    document.getElementById("planBtn").onclick = () => openAddToPlan(r.id);
    document.getElementById("moreBtn")?.addEventListener("click", () => recipeMenu(r, () => draw()));
    root.querySelectorAll("[data-rmtag]").forEach(b => b.onclick = () => {
      r.tags = (r.tags || []).filter(x => x !== b.dataset.rmtag); store.putRecipe(r); draw();
    });
    document.getElementById("tagForm").onsubmit = e => {
      e.preventDefault();
      const v = document.getElementById("tagIn").value.trim().toLowerCase();
      if (!v) return;
      const add = v.split(",").map(x => x.trim()).filter(Boolean);
      r.tags = [...new Set([...(r.tags || []), ...add])];
      store.putRecipe(r); draw();
      document.getElementById("tagIn").focus();
    };
    const saved = document.getElementById("saved");
    const saveNotes = debounce(v => { r.notes = v; store.putRecipe(r); saved.innerHTML = `${icon("check", "ic16")} Saved`; setTimeout(() => saved.textContent = "", 1500); }, 500);
    document.getElementById("notes").addEventListener("input", e => { saved.textContent = "Saving"; saveNotes(e.target.value); });
  }

  redrawCurrent = () => { if (location.hash === `#/r/${id}`) draw(true); };
  draw(false);
  // From Today's Start cooking: straight into cook mode.
  let cookNow = false;
  try { cookNow = sessionStorage.getItem("rb.cookNow") === id; if (cookNow) sessionStorage.removeItem("rb.cookNow"); } catch {}
  if (cookNow && !P.cook) document.getElementById("cookBtn")?.click();
}

// The recipe's ⋯ menu: things you do now and then, with Delete set apart at the bottom.
function recipeMenu(r, redraw) {
  const photo = photoOf(r.id);
  const { el, close } = modal("Recipe", `
    <div class="rmenu">
      <a class="rmitem" href="#/edit/${r.id}">Edit recipe</a>
      <button class="rmitem" id="rmShare">Share recipe</button>
      ${photo ? `<button class="rmitem" id="rmNoPhoto">Remove photo</button>` : r.url ? `<button class="rmitem" id="rmPhoto">Get photo from ${esc(r.site || domainOf(r.url))}</button>` : ""}
      <button class="rmitem danger" id="rmDelete">Delete recipe…</button>
    </div>`);
  el.querySelector("#rmShare").onclick = async () => {
    const text = [r.title, "", ...(r.ingredients || []), "", ...(r.steps || []).map((x, i) => `${i + 1}. ${x}`), r.url ? `\n${r.url}` : ""].join("\n").trim();
    close();
    try {
      if (navigator.share) await navigator.share({ title: r.title, text, ...(r.url ? { url: r.url } : {}) });
      else { await navigator.clipboard.writeText(text); toast("Recipe copied"); }
    } catch {}
  };
  el.querySelector("#rmNoPhoto")?.addEventListener("click", () => { setPhoto(r.id, null); close(); redraw(); toast("Photo removed from this phone"); });
  el.querySelector("#rmPhoto")?.addEventListener("click", async e => {
    e.currentTarget.disabled = true; e.currentTarget.textContent = "Getting the photo…";
    const st = store.settings();
    try {
      const img = await photoFromPage(r.url, st.proxy || "", st.scanKey || "");
      close();
      if (img) { setPhoto(r.id, img); redraw(); toast("Photo added (on this phone)"); }
      else toast("That page doesn't list a photo");
    } catch { close(); toast("Couldn't reach the page"); }
  });
  el.querySelector("#rmDelete").onclick = async () => {
    close();
    if (await confirmBox(`Delete “${r.title}”? It will also be removed from your meal plans.`)) {
      store.deleteRecipe(r.id); setPhoto(r.id, null); toast("Recipe deleted"); go("#/book");
    }
  };
}

function showConversions(btn, ing, mult) {
  document.querySelector(".pop")?.remove();
  const q = ing.qty * mult;
  const list = equivalents(q, ing.unit, ing.food);
  const pop = document.createElement("div");
  pop.className = "pop win";
  pop.innerHTML = `<span class="px">${esc(ing.food ? ing.food.name : ing.name)}</span><ul>${list.map(x => `<li>${esc(x)}</li>`).join("")}</ul>${ing.food?.gCup ? "" : `<span class="muted" style="font-size:12px">Grams assume water density.</span>`}`;
  document.body.appendChild(pop);
  const rect = btn.getBoundingClientRect();
  const w = pop.offsetWidth;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + window.scrollX))}px`;
  pop.style.top = `${rect.bottom + window.scrollY + 6}px`;
  setTimeout(() => {
    const close = e => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener("click", close, true); } };
    document.addEventListener("click", close, true);
  });
}
