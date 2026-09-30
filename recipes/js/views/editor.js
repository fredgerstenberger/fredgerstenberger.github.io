// Add a recipe from a URL (or by hand), and edit existing recipes.
import * as store from "../store.js";
import { esc, uid, domainOf } from "../util.js";
import { shell, render, toast, go } from "../ui.js";
import { importFromUrl } from "../parse.js";
import { autoTags } from "../tags.js";

export function addView(params) {
  const s = store.settings();
  const pre = params.get("url") || "";
  render(shell({
    title: "Add recipe",
    back: "#/book",
    body: `
      <form id="urlForm">
        <label class="field"><span>Recipe link</span>
          <div class="inline">
            <input type="url" id="url" inputmode="url" placeholder="https://…" value="${esc(pre)}" autocomplete="off" autocapitalize="none" required>
            <button class="btn primary" type="submit" id="fetchBtn">Get it</button>
          </div>
          <small>Paste a link from any recipe site. The ads and life story get stripped out.</small>
        </label>
      </form>
      <div class="btnrow" style="margin-top:0"><button class="btn small" id="pasteBtn" type="button">Paste from clipboard</button></div>
      <div id="status"></div>
      <div id="editor"></div>
      <p class="muted" style="font-size:14px;margin-top:22px">Or <button class="btn small" id="manualBtn" type="button">type one in</button></p>
      ${s.proxy ? "" : `<p class="note">Imports use free public proxies, which are sometimes slow or down. For reliable imports, <a href="#/settings">set up your own free proxy</a> (5 minutes).</p>`}`
  }));

  const statusEl = document.getElementById("status");
  const editorEl = document.getElementById("editor");
  const urlIn = document.getElementById("url");

  async function run() {
    const url = urlIn.value.trim();
    if (!/^https?:\/\//i.test(url)) { statusEl.innerHTML = `<p class="note error">That doesn't look like a web link.</p>`; return; }
    const dup = store.recipes().find(r => r.url === url);
    if (dup) {
      statusEl.innerHTML = `<p class="note">Already in your book: <a href="#/r/${dup.id}">${esc(dup.title)}</a></p>`;
      return;
    }
    const btn = document.getElementById("fetchBtn");
    btn.disabled = true;
    editorEl.innerHTML = "";
    statusEl.innerHTML = `<p class="note" id="st">Starting…</p>`;
    try {
      const r = await importFromUrl(url, store.settings().proxy, msg => { const el = document.getElementById("st"); if (el) el.textContent = msg; });
      statusEl.innerHTML = `<p class="note">Found it. Check it over, then save.</p>`;
      showEditor(editorEl, {
        id: uid(), title: r.title, url: r.url, site: r.site, author: r.author,
        yield: r.yield, yieldText: r.yieldText, prepMin: r.prepMin, cookMin: r.cookMin, totalMin: r.totalMin,
        ingredients: r.ingredients, steps: r.steps, nutrition: r.nutrition,
        tags: autoTags(r), rating: 0, notes: "", siteKeywords: r.siteKeywords
      }, true);
    } catch (e) {
      statusEl.innerHTML = `<div class="note error"><b>${esc(e.message)}</b>
        ${e.details ? `<ul>${e.details.map(d => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
        <div class="btnrow"><button class="btn small" id="retry">Try again</button><button class="btn small" id="manual2">Enter it by hand</button></div></div>`;
      document.getElementById("retry").onclick = run;
      document.getElementById("manual2").onclick = () => manual(url);
    } finally {
      btn.disabled = false;
    }
  }

  function manual(url = "") {
    statusEl.innerHTML = "";
    showEditor(editorEl, { id: uid(), title: "", url, site: domainOf(url), ingredients: [], steps: [], tags: [], rating: 0, notes: "" }, true);
  }

  document.getElementById("urlForm").onsubmit = e => { e.preventDefault(); run(); };
  document.getElementById("manualBtn").onclick = () => manual();
  const pasteBtn = document.getElementById("pasteBtn");
  if (!navigator.clipboard?.readText) pasteBtn.hidden = true;
  pasteBtn.onclick = async () => {
    try {
      const t = await navigator.clipboard.readText();
      const found = (t.match(/https?:\/\/\S+/) || [])[0];
      if (found) { urlIn.value = found; run(); } else toast("No link on the clipboard");
    } catch { toast("Clipboard not available — long-press the box to paste"); }
  };
  if (pre) run(); else urlIn.focus();
}

export function editView(id) {
  const r = store.recipe(id);
  if (!r) return go("#/book");
  render(shell({ title: "Edit recipe", back: `#/r/${id}`, body: `<div id="editor"></div>` }));
  showEditor(document.getElementById("editor"), structuredClone(r), false);
}

function showEditor(el, r, isNew) {
  el.innerHTML = `
    <form id="edit">
      ${isNew ? `<h2 class="sect">Check it over</h2>` : ""}
      <label class="field"><span>Title</span><input type="text" name="title" value="${esc(r.title)}" required></label>
      <div class="row3">
        <label class="field"><span>Servings</span><input type="number" name="yield" min="1" max="99" inputmode="numeric" value="${r.yield || ""}" placeholder="4"></label>
        <label class="field"><span>Prep min</span><input type="number" name="prepMin" min="0" inputmode="numeric" value="${r.prepMin || ""}"></label>
        <label class="field"><span>Cook min</span><input type="number" name="cookMin" min="0" inputmode="numeric" value="${r.cookMin || ""}"></label>
      </div>
      <label class="field"><span>Total time (min)</span><input type="number" name="totalMin" min="0" inputmode="numeric" value="${r.totalMin || ""}" placeholder="Prep + cook"></label>
      <label class="field"><span>Ingredients</span>
        <textarea name="ingredients" rows="10" placeholder="One per line, e.g.&#10;2 cups flour&#10;1 (14.5 oz) can diced tomatoes&#10;# Sauce  ← a line starting with # is a section heading">${esc((r.ingredients || []).join("\n"))}</textarea>
        <small>One per line. Start a line with # for a section heading.</small>
      </label>
      <label class="field"><span>Steps</span>
        <textarea name="steps" rows="10" placeholder="One step per line">${esc((r.steps || []).join("\n"))}</textarea>
        <small>One step per line. Times like “10 minutes” become tap-to-start timers.</small>
      </label>
      <label class="field"><span>Keywords</span>
        <input type="text" name="tags" value="${esc((r.tags || []).join(", "))}" autocapitalize="none" placeholder="chicken, dinner, pasta">
        <small>Comma separated. ${isNew ? "Suggested automatically — edit freely." : `<button type="button" class="btn small" id="suggest" style="margin-top:6px">Re-suggest keywords</button>`}</small>
      </label>
      <label class="field"><span>Source link</span><input type="url" name="url" value="${esc(r.url || "")}" autocapitalize="none" placeholder="https://…"></label>
      ${r.nutrition ? `<p class="muted" style="font-size:14px">Nutrition from the site: ${Math.round(r.nutrition.kcal || 0)} kcal per serving. <label class="check" style="display:inline-flex;min-height:0"><input type="checkbox" name="dropNutri"> Ignore it and estimate instead</label></p>` : ""}
      <div class="btnrow">
        <button class="btn primary" type="submit">${isNew ? "Save to recipe book" : "Save changes"}</button>
        ${isNew ? "" : `<a class="btn" href="#/r/${r.id}">Cancel</a>`}
      </div>
    </form>`;

  const form = el.querySelector("#edit");
  const lines = v => v.split("\n").map(x => x.trim()).filter(Boolean);
  el.querySelector("#suggest")?.addEventListener("click", () => {
    const tmp = { ...r, title: form.title.value, ingredients: lines(form.ingredients.value) };
    const merged = [...new Set([...form.tags.value.split(",").map(x => x.trim().toLowerCase()).filter(Boolean), ...autoTags(tmp)])];
    form.tags.value = merged.join(", ");
  });
  form.onsubmit = e => {
    e.preventDefault();
    const n = name => { const v = parseInt(form[name].value, 10); return isNaN(v) ? 0 : v; };
    r.title = form.title.value.trim() || "Untitled recipe";
    r.yield = n("yield") || null;
    r.prepMin = n("prepMin"); r.cookMin = n("cookMin");
    r.totalMin = n("totalMin") || (r.prepMin + r.cookMin);
    r.ingredients = lines(form.ingredients.value);
    r.steps = lines(form.steps.value);
    r.tags = [...new Set(form.tags.value.split(",").map(x => x.trim().toLowerCase()).filter(Boolean))];
    r.url = form.url.value.trim();
    r.site = domainOf(r.url);
    if (form.dropNutri?.checked) r.nutrition = null;
    delete r.siteKeywords;
    store.putRecipe(r);
    toast(isNew ? "Saved to your recipe book" : "Saved");
    go(`#/r/${r.id}`);
  };
  if (isNew) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
