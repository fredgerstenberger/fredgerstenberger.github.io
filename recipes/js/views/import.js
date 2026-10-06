// Import from Paprika: choose the exported file, see what's in it, import. The reading and sorting is in
// paprika.js; this screen only shows it. Recipe names appear on this screen only (never in analytics or logs).
import * as store from "../store.js";
import { esc, plural, cap } from "../util.js";
import { shell, render, toast } from "../ui.js";
import { analyzeFile, saveRecipes, ImportError } from "../paprika.js";
import { myKey } from "../ratings.js";
import { track } from "../analytics.js";
import { report } from "../monitor.js";
import { icon } from "../sprites.js";
import { showOnly } from "./book.js";

const bar = (done, total) => `<span class="impbar" aria-hidden="true"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></span>`;
const list = items => `<ul class="implist">${items.map(it => `<li>${esc(it.recipe.title)}${it.match ? ` <a href="#/r/${esc(it.match)}">yours</a>` : ""}</li>`).join("")}</ul>`;

export function importView() {
  render(shell({
    title: "Import from Paprika",
    back: "#/add",
    body: `
      <div class="card impbox impcard">
        <p style="margin-top:0">Bring your Paprika recipes into Recipe Box, with their ratings, categories, notes and favorites.</p>
        <ol class="howto">
          <li>In Paprika, select all your recipes and choose <b>Export</b>.</li>
          <li>Pick <b>Paprika Recipe Format</b>. It makes a file ending in <b>.paprikarecipes</b>.</li>
          <li>Save it to Files, then choose it here.</li>
        </ol>
        <div class="btnrow"><label class="btn primary" for="ppFile">${icon("plus", "ic16")} Choose file</label></div>
        <input type="file" id="ppFile" hidden>
        <p class="muted" style="font-size:0.8235rem;margin-bottom:0">The file is read on this phone and never uploaded. Nothing in your recipe book is changed or replaced.</p>
      </div>
      <div id="ppOut" aria-live="polite"></div>`
  }));
  const out = document.getElementById("ppOut");
  const input = document.getElementById("ppFile");
  input.onchange = () => { const f = input.files?.[0]; input.value = ""; if (f) analyze(f, out); };
}

async function analyze(file, out) {
  track("paprika_import_started");
  out.innerHTML = `<div class="card impbox"><p style="margin:0 0 8px">Reading your recipes…</p>${bar(0, 1)}<p class="muted" id="ppN" style="margin:6px 0 0;font-size:0.8235rem"></p></div>`;
  let a;
  try {
    a = await analyzeFile(file, {
      existing: store.recipes(), me: myKey(),
      onProgress: (d, t) => { const n = document.getElementById("ppN"); if (n) { n.textContent = `${d} of ${t}`; n.previousElementSibling.firstElementChild.style.width = `${Math.round(d / t * 100)}%`; } }
    });
  } catch (e) {
    const known = e instanceof ImportError;
    if (!known) report(e, { area: "paprika-import" }); // the error only, never the file's contents
    track("paprika_import_failed", { reason: known ? e.code : "error" });
    out.innerHTML = `<p class="note error">${esc(known ? e.message : "Something went wrong reading that file. Try exporting from Paprika again.")}</p>`;
    return;
  }
  preview(a, out);
}

function preview(a, out) {
  const by = s => a.items.filter(it => it.status === s);
  const ready = by("ready"), same = by("sameName"), dup = by("duplicate"), already = by("already");
  const look = a.items.filter(it => it.problems.length && it.status !== "already" && it.status !== "duplicate");
  const row = (n, label, note = "") => n ? `<li><b>${n}</b> ${typeof label === "function" ? label(n === 1) : label}${note ? `<small>${note}</small>` : ""}</li>` : "";
  const draw = () => {
    const withDup = document.getElementById("ppDup")?.checked;
    const todo = [...ready, ...same, ...(withDup ? dup : [])];
    out.innerHTML = `
      <div class="card impbox impsum">
        <h2 class="sect" style="margin-top:0">${plural(a.total, "recipe")} found</h2>
        <ul class="impcounts">
          ${row(ready.filter(it => !it.problems.length).length, "ready to import")}
          ${row(same.length, one => one ? "shares a name with one you have" : "share a name with ones you have", "Imported as new recipes, so you can compare.")}
          ${row(look.length, one => one ? "needs a look" : "need a look", "Missing a title or ingredients. Imported with what's there.")}
          ${row(dup.length, one => one ? "looks like a recipe you already have" : "look like recipes you already have", "Same link, or same name and ingredients. Left out.")}
          ${row(already.length, "already imported from Paprika", "Left out.")}
          ${row(a.unreadable.length, "couldn't be read", "Left out. Try exporting them from Paprika again.")}
        </ul>
        ${dup.length ? `<label class="check"><input type="checkbox" id="ppDup" ${withDup ? "checked" : ""}> Import the ${plural(dup.length, "possible duplicate")} too</label>` : ""}
        ${same.length ? `<details class="breakdown"><summary>Same name as yours</summary>${list(same)}</details>` : ""}
        ${look.length ? `<details class="breakdown"><summary>Need a look</summary>${list(look)}</details>` : ""}
        ${dup.length ? `<details class="breakdown"><summary>Possible duplicates</summary>${list(dup)}</details>` : ""}
        <div class="btnrow">${todo.length ? `<button class="btn primary" id="ppGo">Import ${plural(todo.length, "recipe")}</button>` : `<p class="muted" style="margin:0">Nothing new to import.</p>`}</div>
      </div>`;
    document.getElementById("ppDup")?.addEventListener("change", draw);
    document.getElementById("ppGo")?.addEventListener("click", () => run(todo, { a, dup, withDup, look, same }, out));
  };
  draw();
  out.scrollIntoView({ block: "start", behavior: "smooth" });
}

async function run(todo, info, out) {
  out.innerHTML = `<div class="card impbox"><p style="margin:0 0 8px">Importing recipes…</p>${bar(0, 1)}<p class="muted" id="ppN" style="margin:6px 0 0;font-size:0.8235rem">0 of ${todo.length}</p></div>`;
  const res = await saveRecipes(todo, {
    onProgress: (d, t) => { const n = document.getElementById("ppN"); if (n) { n.textContent = `${d} of ${t}`; n.previousElementSibling.firstElementChild.style.width = `${Math.round(d / t * 100)}%`; } }
  });
  const { a, dup, withDup, look, same } = info;
  const imported = res.saved.length;
  const skipped = a.total - imported - (withDup ? 0 : dup.length);
  track(res.left ? "paprika_import_failed" : "paprika_import_completed", {
    ...(res.left ? { reason: "storage_full" } : {}),
    recipe_count: a.total, imported_count: imported, skipped_count: Math.max(0, skipped), duplicate_count: dup.length
  });
  const saved = new Set(res.saved);
  const lookSaved = look.filter(it => saved.has(it.recipe.id)), sameSaved = same.filter(it => saved.has(it.recipe.id));
  const link = items => `<ul class="implist">${items.map(it => `<li><a href="#/r/${esc(it.recipe.id)}">${esc(it.recipe.title)}</a></li>`).join("")}</ul>`;
  out.innerHTML = `
    <div class="card impbox impsum">
      <h2 class="sect" style="margin-top:0">${res.left ? "Import stopped" : "Import complete"}</h2>
      <ul class="impcounts">
        <li><b>${imported}</b> ${imported === 1 ? "recipe" : "recipes"} imported</li>
        ${skipped > 0 ? `<li><b>${skipped}</b> skipped<small>${cap([a.items.some(it => it.status === "already") && "already imported", a.unreadable.length && "couldn't be read", res.left && "didn't fit on this phone"].filter(Boolean).join(", "))}.</small></li>` : ""}
        ${dup.length && !withDup ? `<li><b>${dup.length}</b> possible ${dup.length === 1 ? "duplicate" : "duplicates"} left out<small>Import again and tick "Import the possible duplicates too" to add them.</small></li>` : ""}
      </ul>
      ${res.left ? `<p class="note error">This phone ran out of room after ${plural(imported, "recipe")}. ${plural(res.left, "recipe")} weren't imported. Everything already saved is safe.</p>` : ""}
      ${sameSaved.length ? `<details class="breakdown"><summary>Same name as one you had (${sameSaved.length})</summary>${link(sameSaved)}</details>` : ""}
      ${lookSaved.length ? `<details class="breakdown" open><summary>Need a look (${lookSaved.length})</summary>${link(lookSaved)}</details>` : ""}
      <div class="btnrow">${imported ? `<a class="btn primary" href="#/book" id="ppView">View imported recipes</a>` : ""}</div>
    </div>`;
  document.getElementById("ppView")?.addEventListener("click", () => {
    showOnly(":paprika");
  });
  out.scrollIntoView({ block: "start", behavior: "smooth" });
  if (imported) toast(`Imported ${plural(imported, "recipe")}`);
}
