// Settings: theme, filter thresholds, planning, units, import proxy, backups.
import * as store from "../store.js";
import { esc } from "../util.js";
import { shell, render, toast, confirmBox, applyTheme } from "../ui.js";

const APP_URL = new URL(".", location.href).href.replace(/#.*$/, "");
const WORKER_HELP = "https://github.com/fredgerstenberger/fredgerstenberger.github.io/blob/main/recipes/worker/README.md";

export function settingsView() {
  const s = store.settings();
  const st = store.get();
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-set="${key}" data-val="${v}" aria-pressed="${s[key] === v}">${l}</button>`).join("")}</div>`;
  const num = (key, min, max, step = 1) => `<input type="number" data-num="${key}" min="${min}" max="${max}" step="${step}" inputmode="numeric" value="${s[key]}">`;
  const bookmarklet = `javascript:location.href='${APP_URL}?url='+encodeURIComponent(location.href)`;

  render(shell({
    title: "Settings",
    body: `
      <h2 class="sect">Appearance</h2>
      <div class="setrow"><span>Theme</span>${seg("theme", [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]])}</div>

      <h2 class="sect">Recipe filters</h2>
      <div class="setrow"><span>Low calorie<small>kcal per serving, at most</small></span>${num("lowCal", 100, 2000, 25)}</div>
      <div class="setrow"><span>High protein<small>grams per serving, at least</small></span>${num("highProtein", 5, 150)}</div>
      <div class="setrow"><span>Quick<small>total minutes, at most</small></span>${num("quickMin", 5, 240, 5)}</div>

      <h2 class="sect">Cooking &amp; planning</h2>
      <div class="setrow"><span>People per meal<small>Sets suggested servings in the meal plan</small></span>${num("people", 1, 12)}</div>
      <div class="setrow"><span>Default units</span>${seg("units", [["original", "Original"], ["us", "US"], ["metric", "Metric"]])}</div>
      <div class="setrow"><span>Keep screen on in cook mode</span>${seg("wakeLock", [[true, "On"], [false, "Off"]])}</div>

      <h2 class="sect">Recipe import</h2>
      <label class="field"><span>Your proxy URL (optional)</span>
        <div class="inline">
          <input type="url" id="proxy" value="${esc(s.proxy)}" placeholder="https://recipe-proxy.yourname.workers.dev" autocapitalize="none">
          <button class="btn small" id="testProxy">Test</button>
        </div>
        <small>Without one, imports go through free public proxies that are sometimes down. A free Cloudflare Worker is more reliable. <a href="${WORKER_HELP}" target="_blank" rel="noopener">Setup guide ↗</a></small>
      </label>
      <details class="breakdown" style="margin-top:6px"><summary>Add recipes straight from Safari</summary>
        <p><b>Option A: Shortcut (recommended).</b> In the Shortcuts app, make a new shortcut: turn on <i>Show in Share Sheet</i> (accepts URLs), then add the action <i>Open URLs</i> with:</p>
        <div class="code">${esc(APP_URL)}?url=[Shortcut Input]</div>
        <p>Now on any recipe page: Share → your shortcut.</p>
        <p><b>Option B: Bookmarklet.</b> Bookmark any page, edit the bookmark, and replace its address with:</p>
        <div class="code">${esc(bookmarklet)}</div>
      </details>

      <h2 class="sect">Backup</h2>
      <p style="margin-top:0">Everything is saved on this device only. Export a backup now and then, especially before switching phones.</p>
      <div class="btnrow">
        <button class="btn primary" id="export">Export backup</button>
        <label class="btn" for="importFile">Import backup</label>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
      </div>
      <p class="muted" style="font-size:14px">Last backup: ${st.lastBackup ? new Date(st.lastBackup).toLocaleString() : "never"}</p>

      <h2 class="sect">Install on iPhone</h2>
      <ol class="howto">
        <li>Open this page in <b>Safari</b>.</li>
        <li>Tap <b>Share</b> (the square with an arrow).</li>
        <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
      </ol>
      <p class="muted" style="font-size:14px">It opens full-screen, works offline for cooking, and iOS is much less likely to clear its data.</p>
      <p class="note">Heads up: on iPhone, the Home Screen app and Safari keep <b>separate</b> data. Recipes and settings saved in one won't appear in the other. Pick one (the Home Screen app is best) or move data with Export/Import.</p>

      <h2 class="sect">Danger zone</h2>
      <button class="btn danger" id="wipe">Delete all data</button>`,
    status: `<span>${Object.keys(st.recipes).length} recipes</span><span>Recipe Box v1</span>`
  }), { keepScroll: true });

  const root = document.getElementById("app");
  // Every control saves immediately (no need to leave the field), then flashes "Saved ✓".
  const flash = el => {
    const row = el.closest(".setrow, .field");
    if (!row) return toast("Saved");
    let tag = row.querySelector(".savedtag");
    if (!tag) { tag = document.createElement("small"); tag.className = "savedtag"; row.querySelector("span")?.appendChild(tag); }
    tag.textContent = "Saved ✓";
    clearTimeout(tag._t); tag._t = setTimeout(() => { tag.textContent = ""; }, 1600);
  };
  root.querySelectorAll("[data-set]").forEach(b => b.onclick = () => {
    const k = b.dataset.set;
    let v = b.dataset.val;
    if (v === "true") v = true; else if (v === "false") v = false;
    store.setSetting(k, v);
    if (k === "theme") applyTheme();
    b.parentElement.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    flash(b);
  });
  root.querySelectorAll("[data-num]").forEach(inp => {
    const saveNum = () => {
      const v = parseFloat(inp.value);
      const min = parseFloat(inp.min), max = parseFloat(inp.max);
      if (isNaN(v) || v < min || v > max) return;
      if (store.settings()[inp.dataset.num] !== v) { store.setSetting(inp.dataset.num, v); flash(inp); }
    };
    inp.addEventListener("input", saveNum);
    inp.addEventListener("change", saveNum);
    inp.addEventListener("blur", () => { if (isNaN(parseFloat(inp.value))) inp.value = store.settings()[inp.dataset.num]; });
  });
  const proxy = document.getElementById("proxy");
  const saveProxy = () => { const v = proxy.value.trim(); if (store.settings().proxy !== v) { store.setSetting("proxy", v); flash(proxy); } };
  proxy.addEventListener("input", saveProxy);
  proxy.addEventListener("change", saveProxy);
  document.getElementById("testProxy").onclick = async e => {
    e.preventDefault();
    const base = proxy.value.trim().replace(/\/+$/, "");
    if (!base) { toast("Enter your proxy URL first"); return; }
    store.setSetting("proxy", base);
    try {
      const res = await fetch(`${base}/?url=${encodeURIComponent("https://example.com/")}`);
      const t = await res.text();
      toast(res.ok && /Example Domain/i.test(t) ? "Proxy works ✓" : `Proxy answered but looks wrong (HTTP ${res.status})`);
    } catch { toast("Couldn't reach the proxy"); }
  };
  document.getElementById("export").onclick = async () => {
    const json = store.exportJSON();
    const name = `recipe-box-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: "application/json" });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "Recipe Box backup" }); settingsView(); return; }
    } catch (err) { if (err.name === "AbortError") return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    settingsView();
  };
  document.getElementById("importFile").onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const replace = await confirmBox("Replace everything on this device with the backup? Choose Cancel to merge the backup's recipes into your current book instead.", "Replace all", true);
      const n = store.importJSON(text, replace ? "replace" : "merge");
      applyTheme();
      toast(`Imported ${n} recipes`);
      settingsView();
    } catch (err) { toast(err.message || "Import failed"); }
  };
  document.getElementById("wipe").onclick = async () => {
    if (await confirmBox("Delete every recipe, plan, list and setting on this device? Export a backup first if you might want them back.", "Delete everything")) {
      store.resetAll(); applyTheme(); toast("All data deleted"); settingsView();
    }
  };
}
