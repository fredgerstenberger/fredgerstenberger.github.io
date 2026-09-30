// Single recipe: cooking-friendly view with scaling, unit conversion, timers, nutrition, tags, notes.
import * as store from "../store.js";
import { esc, fmtMinutes, debounce, domainOf } from "../util.js";
import { shell, render, starsHTML, confirmBox, toast, go } from "../ui.js";
import { parseIngredient, displayAmount, equivalents } from "../ingredients.js";
import { nutritionFor, servingsOf } from "../nutrition.js";
import { findTimes, startTimer } from "../timers.js";
import { sprite } from "../sprites.js";
import { openAddToPlan } from "./plan.js";
import { recipeCost, money, REGIONS } from "../prices.js";

const progress = {}; // id → { ings:Set, steps:Set, servings, cook }
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

function fmtN(n) { return n == null || isNaN(n) ? "–" : Math.round(n); }

export function recipeView(id) {
  const r = store.recipe(id);
  if (!r) { render(shell({ title: "Not found", back: "#/book", body: `<p>That recipe isn't in your book anymore.</p><a class="btn" href="#/book">Back to recipe book</a>` })); return; }
  const P = progress[id] ||= { ings: new Set(), steps: new Set(), servings: servingsOf(r), cook: false };
  const s = store.settings();
  // The unit toggle on a recipe is temporary; changing the default in Settings resets it.
  if (P.modeBase !== s.units) { P.mode = null; P.modeBase = s.units; }
  let mode = P.mode || s.units;

  function draw(keepScroll = true) {
    const base = servingsOf(r);
    const mult = P.servings / base;
    const nu = nutritionFor(r);
    const cost = recipeCost(r);
    const est = nu.source === "estimate";
    const t = est ? "~" : "";

    let stepNo = 0;
    const firstOpen = (() => { let i = 0; for (const st of r.steps || []) { if (!st.startsWith("#")) { if (!P.steps.has(i)) return i; i++; } } return -1; })();

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
        rest = esc(ing.name + (ing.note ? `, ${ing.note}` : ""));
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
        `<button class="timelink" data-min="${tm.min}" data-label="Step ${stepNo}" aria-label="Start ${tm.text} timer">${sprite("clock")}<span>${tm.text}</span></button>`).join("")}</div></li>`;
    }).join("");

    const times = [];
    if (r.prepMin) times.push(`Prep ${fmtMinutes(r.prepMin)}`);
    if (r.cookMin) times.push(`Cook ${fmtMinutes(r.cookMin)}`);

    render(shell({
      title: r.title,
      back: "#/book",
      actions: `<button class="tb-btn" id="cookBtn" aria-pressed="${P.cook}">${P.cook ? "Exit cook" : "Cook mode"}</button>`,
      body: `
        <h2 class="rtitle">${esc(r.title)}</h2>
        <p class="rsource">${r.url ? `from <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.site || domainOf(r.url))} ↗</a>` : "Your recipe"}${r.author ? ` · ${esc(r.author)}` : ""}</p>
        <div class="hide-cook">${starsHTML(r.rating || 0)}</div>
        <dl class="facts">
          ${r.totalMin ? `<div><dt>Time</dt><dd>${fmtMinutes(r.totalMin)}${times.length ? `<br><span class="muted" style="font-size:14px">${times.join(" · ")}</span>` : ""}</dd></div>` : ""}
          <div><dt>Servings</dt><dd>
            <span class="stepper"><button id="sMinus" aria-label="Fewer servings">−</button><output id="sOut">${P.servings}</output><button id="sPlus" aria-label="More servings">+</button></span>
            ${P.servings !== base ? `<br><button class="btn small" id="sReset" style="margin-top:8px">Reset to ${base}</button>` : ""}
          </dd></div>
          ${cost.total > 0 ? `<div><dt>Cost</dt><dd>~${money(cost.perServing)}/serving<br><span class="muted" style="font-size:14px">~${money(cost.perServing * P.servings)} for ${P.servings}</span></dd></div>` : ""}
          ${nu.kcal ? `<div><dt>Per serving</dt><dd>${t}${fmtN(nu.kcal)} kcal<br><span class="muted" style="font-size:14px">${t}${fmtN(nu.protein)} g protein</span></dd></div>` : ""}
        </dl>
        <div class="btnrow hide-cook">
          <button class="btn primary" id="planBtn">+ Meal plan</button>
          <a class="btn" href="#/edit/${r.id}">Edit</a>
          <button class="btn danger" id="delBtn">Delete</button>
        </div>

        <h2 class="sect">Ingredients <small>${P.ings.size ? `${P.ings.size} checked · <button class="btn small" id="clearIngs" style="min-height:28px">Clear</button>` : ""}</small></h2>
        <div class="cookbar">
          <div class="seg" role="group" aria-label="Units">
            ${[["original", "Original"], ["us", "US"], ["metric", "Metric"]].map(([v, l]) => `<button data-mode="${v}" aria-pressed="${mode === v}">${l}</button>`).join("")}
          </div>
          <span class="muted" style="font-size:13px">Tap an amount to convert</span>
        </div>
        <ul class="ings">${ingHTML || `<li class="muted">No ingredients yet.</li>`}</ul>

        <h2 class="sect">Steps <small>${P.steps.size ? `<button class="btn small" id="clearSteps" style="min-height:28px">Reset</button>` : "Tap a step when done"}</small></h2>
        <ol class="steps">${stepHTML || `<li class="muted">No steps yet.</li>`}</ol>

        <div class="hide-cook">
          <h2 class="sect">Nutrition <small>per serving</small></h2>
          ${nu.kcal ? `
          <div class="nutri">
            <div><b>${t}${fmtN(nu.kcal)}</b><span>calories</span></div>
            <div><b>${t}${fmtN(nu.protein)}g</b><span>protein</span></div>
            <div><b>${t}${fmtN(nu.carbs)}g</b><span>carbs</span></div>
            <div><b>${t}${fmtN(nu.fat)}g</b><span>fat</span></div>
            <div><b>${t}${fmtN(nu.fiber)}g</b><span>fiber</span></div>
            ${nu.sodium != null ? `<div><b>${fmtN(nu.sodium)}</b><span>mg sodium</span></div>` : ""}
          </div>` : ""}
          <p class="muted" style="font-size:14px;margin:0 0 6px">${est
            ? `Estimated from ingredients (${Math.round(nu.coverage * 100)}% recognized)${nu.assumedServings ? ", assuming 4 servings — set servings in Edit" : ` for ${nu.servings} servings`}.`
            : `From ${esc(r.site || "the recipe")}${nu.serving ? ` · serving: ${esc(nu.serving)}` : ""}.`}</p>
          ${nu.rows && nu.rows.length ? `<details class="breakdown"><summary>Ingredient breakdown</summary><table>
            ${nu.rows.map(row => row.food
              ? `<tr><td>${esc(row.line)}<br><span class="muted">→ ${esc(row.food)}${row.grams ? `, ${Math.round(row.grams)} g` : ""}</span></td><td class="n">${Math.round(row.kcal)} kcal<br>${Math.round(row.protein)} g P</td></tr>`
              : `<tr class="miss"><td>${esc(row.line)}<br><span>not recognized — not counted</span></td><td class="n">?</td></tr>`).join("")}
          </table></details>` : ""}

          <h2 class="sect">Cost <small>estimate</small></h2>
          ${cost.total > 0 ? `<div class="nutri">
            <div><b>~${money(cost.perServing)}</b><span>per serving</span></div>
            <div><b>~${money(cost.total)}</b><span>whole recipe</span></div>
          </div>` : ""}
          <p class="muted" style="font-size:14px;margin:0 0 6px">Cost of the amounts used (${Math.round(cost.coverage * 100)}% of ingredients priced), ${esc(regionName())} prices. <a href="#/prices">Edit prices</a></p>
          <details class="breakdown"><summary>Cost breakdown</summary><table>
            ${cost.rows.map(row => row.cost != null
              ? `<tr><td>${esc(row.line)}</td><td class="n">${money(row.cost)}</td></tr>`
              : `<tr class="miss"><td>${esc(row.line)}<br><span>no price — not counted</span></td><td class="n">?</td></tr>`).join("")}
          </table></details>

          <h2 class="sect">Keywords</h2>
          <div class="chips" id="tags">
            ${(r.tags || []).map(tg => `<button class="chip" data-rmtag="${esc(tg)}" aria-label="Remove ${esc(tg)}">${esc(tg)} <span class="x">✕</span></button>`).join("")}
          </div>
          <form id="tagForm" class="inline" style="margin-top:10px">
            <input type="text" id="tagIn" placeholder="Add keyword (e.g. spicy)" autocomplete="off" autocapitalize="none">
            <button class="btn small" type="submit">Add</button>
          </form>

          <h2 class="sect">Notes</h2>
          <div class="notesbox">
            <textarea id="notes" placeholder="Swaps, tweaks, what to do differently next time…">${esc(r.notes || "")}</textarea>
            <div class="saved" id="saved"></div>
          </div>
        </div>`,
      status: `<span>${r.created ? `Added ${new Date(r.created).toLocaleDateString()}` : ""}</span><span>${est ? "~ = estimate" : ""}</span>`
    }), { keepScroll });
    document.body.classList.toggle("cook", P.cook);
    bind();
  }

  function bind() {
    const root = document.getElementById("app");
    root.querySelectorAll("[data-star]").forEach(b => b.onclick = () => {
      const n = +b.dataset.star;
      r.rating = r.rating === n ? n - 1 : n;
      store.putRecipe(r); draw();
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
    document.getElementById("clearSteps")?.addEventListener("click", () => { P.steps.clear(); draw(); });
    root.querySelectorAll("li.step").forEach(li => li.onclick = e => {
      const tb = e.target.closest(".timelink");
      if (tb) { e.stopPropagation(); startTimer(+tb.dataset.min, `${r.title.slice(0, 18)} · ${tb.dataset.label}`); toast(`Timer started: ${tb.textContent.trim()}`); return; }
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
      toast(P.cook ? (s.wakeLock && "wakeLock" in navigator ? "Cook mode · screen stays on" : "Cook mode") : "Cook mode off");
    };
    document.getElementById("planBtn").onclick = () => openAddToPlan(r.id);
    document.getElementById("delBtn").onclick = async () => {
      if (await confirmBox(`Delete “${r.title}”? It will also be removed from your meal plans.`)) {
        store.deleteRecipe(r.id); toast("Recipe deleted"); go("#/book");
      }
    };
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
    const saveNotes = debounce(v => { r.notes = v; store.putRecipe(r); saved.textContent = "Saved ✓"; setTimeout(() => saved.textContent = "", 1500); }, 500);
    document.getElementById("notes").addEventListener("input", e => { saved.textContent = "…"; saveNotes(e.target.value); });
  }

  draw(false);
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
