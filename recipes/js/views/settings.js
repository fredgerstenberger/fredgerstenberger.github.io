// Settings: theme, filter thresholds, planning, units, import proxy, backups.
import * as store from "../store.js";
import { esc } from "../util.js";
import { shell, render, toast, confirmBox, applyTheme } from "../ui.js";
import { REGIONS } from "../prices.js";
import { SCAN_MODELS } from "../scan.js";
import * as sync from "../sync.js";
import { modal } from "../ui.js";

function ago(t) {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return new Date(t).toLocaleDateString();
}

function syncHTML(s) {
  if (!s.proxy) return `<p class="muted" style="margin-top:0">Set your Worker address above first; sync runs through it.</p>`;
  if (!sync.enabled()) return `
    <p style="margin-top:0">Keep recipes, meal plans, grocery lists, pantry and prices the same on your phone, iPad, computer, or a partner's phone. It also backs everything up to your Cloudflare account.</p>
    <div class="btnrow"><button class="btn primary" id="syncOn">Turn on sync</button></div>
    <details class="breakdown"><summary>Have an invite link or code from another device?</summary>
      <form id="joinForm" class="inline" style="margin-top:8px">
        <input type="text" id="joinCode" placeholder="Paste invite link or code" autocapitalize="none" autocomplete="off" spellcheck="false">
        <button class="btn small" type="submit">Join</button>
      </form>
    </details>`;
  const i = sync.info();
  return `
    <div class="setrow" style="border-top:1px solid var(--sunk)"><span>Status<small id="syncStatus">${i.error ? esc(i.error) : `Last synced ${ago(i.last)}${i.pending ? ` · ${i.pending} change${i.pending > 1 ? "s" : ""} waiting` : ""}`}</small></span>
      <button class="btn small" id="syncNow">Sync now</button></div>
    <p style="margin:14px 0 6px"><b>Add another device or a partner:</b> open this invite link on it.</p>
    <div class="code" id="inviteLink">${esc(sync.inviteLink())}</div>
    <div class="btnrow"><button class="btn small" id="shareInvite">Share invite link</button></div>
    <p class="note" style="font-size:14px">Anyone with this link can see and edit your recipe box, so only share it with people you trust.</p>
    <div class="btnrow"><button class="btn small danger" id="syncOff">Turn off sync on this device</button></div>`;
}

const APP_URL = new URL(".", location.href).href.replace(/#.*$/, "");
const WORKER_HELP = "https://github.com/fredgerstenberger/fredgerstenberger.github.io/blob/main/recipes/worker/README.md";

function askJoin(code, worker) {
  const { el, close } = modal("Join recipe box?", `
    <p style="margin-top:0">This device will sync with the recipe box from your invite link. Recipes and plans already on this device are kept and added to the box.</p>
    ${worker ? `<p class="muted" style="font-size:14px">Worker: ${esc(worker)}</p>` : ""}
    <div class="btnrow"><button class="btn primary" id="jYes">Join and sync</button><button class="btn" id="jNo">Cancel</button></div>`);
  el.querySelector("#jNo").onclick = close;
  el.querySelector("#jYes").onclick = async () => {
    if (worker) store.setSetting("proxy", worker.replace(/\/+$/, ""));
    if (!store.settings().proxy) { toast("Enter your Worker address first"); close(); return; }
    el.querySelector("#jYes").disabled = true;
    el.querySelector("#jYes").textContent = "Syncing…";
    try { const r = await sync.enable(code); toast(`Joined · ${r.applied} item${r.applied === 1 ? "" : "s"} synced`); }
    catch (err) { toast(err.message); }
    close();
    settingsView();
  };
}

export function settingsView() {
  const s = store.settings();
  const st = store.get();
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-set="${key}" data-val="${v}" aria-pressed="${s[key] === v}">${l}</button>`).join("")}</div>`;
  const num = (key, min, max, step = 1) => `<input type="number" data-num="${key}" min="${min}" max="${max}" step="${step}" inputmode="${step < 1 ? "decimal" : "numeric"}" value="${s[key]}">`;
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

      <div class="setrow"><span>Budget<small>$ per serving, at most</small></span>${num("budget", 0.5, 50, 0.25)}</div>

      <h2 class="sect">Prices</h2>
      <label class="field"><span>Where you shop<small>Adjusts the built-in US-average estimates</small></span>
        <select id="region">${REGIONS.map(([id, name, f]) => `<option value="${id}" ${s.priceRegion === id ? "selected" : ""}>${esc(name)}${f ? ` (${f === 1 ? "baseline" : `${f > 1 ? "+" : "−"}${Math.round(Math.abs(f - 1) * 100)}%`})` : ""}</option>`).join("")}</select>
      </label>
      <div class="setrow" id="customRow" ${s.priceRegion === "custom" ? "" : "hidden"}><span>Custom level<small>% of US average (e.g. 115)</small></span>${num("priceCustomPct", 50, 250, 1)}</div>
      <p class="muted" style="font-size:14px;margin:4px 0 0">Regional levels are rough estimates. For real accuracy, enter what your store charges on the <a href="#/prices">Prices</a> screen; your prices are used as-is.</p>

      <h2 class="sect">Cooking &amp; planning</h2>
      <div class="setrow"><span>People per meal<small>Sets suggested servings in the meal plan</small></span>${num("people", 1, 12)}</div>
      <div class="setrow"><span>Default units</span>${seg("units", [["original", "Original"], ["us", "US"], ["metric", "Metric"]])}</div>
      <div class="setrow"><span>Keep screen on in cook mode</span>${seg("wakeLock", [[true, "On"], [false, "Off"]])}</div>

      <h2 class="sect">Recipe import</h2>
      <label class="field"><span>Your Worker address<small>From Cloudflare: links &amp; photo scanning</small></span>
        <div class="inline">
          <input type="url" id="proxy" value="${esc(s.proxy)}" placeholder="https://recipe-proxy.yourname.workers.dev" autocapitalize="none">
          <button class="btn small" id="testProxy">Test</button>
        </div>
        <div class="note" id="testOut" hidden style="margin:8px 0 4px"></div>
        <small>Without one, imports go through free public proxies that are sometimes down. A free Cloudflare Worker is more reliable. <a href="${WORKER_HELP}" target="_blank" rel="noopener">Setup guide ↗</a></small>
      </label>
      <label class="field"><span>Photo scanning model<small>Open-weight vision models on Cloudflare Workers AI</small></span>
        <select id="scanModel">${SCAN_MODELS.map(([id, name]) => `<option value="${id}" ${s.scanModel === id ? "selected" : ""}>${esc(name)}</option>`).join("")}</select>
      </label>
      <label class="field"><span>App key (optional)<small>Only if you added an APP_KEY secret to your Worker</small></span>
        <input type="text" id="scanKey" value="${esc(s.scanKey || "")}" autocapitalize="none" autocomplete="off" spellcheck="false">
      </label>
      <details class="breakdown" style="margin-top:6px"><summary>Add recipes straight from Safari</summary>
        <p><b>Option A: Shortcut (recommended).</b> In the Shortcuts app, make a new shortcut: turn on <i>Show in Share Sheet</i> (accepts URLs), then add the action <i>Open URLs</i> with:</p>
        <div class="code">${esc(APP_URL)}?url=[Shortcut Input]</div>
        <p>Now on any recipe page: Share → your shortcut.</p>
        <p><b>Option B: Bookmarklet.</b> Bookmark any page, edit the bookmark, and replace its address with:</p>
        <div class="code">${esc(bookmarklet)}</div>
      </details>

      <h2 class="sect">Sync</h2>
      <div id="syncBox">${syncHTML(s)}</div>

      <h2 class="sect">Backup</h2>
      <p style="margin-top:0">${sync.enabled() ? "Sync keeps a copy in your Cloudflare account. A backup file is still handy as an extra safety net." : "Everything is saved on this device only. Export a backup now and then, especially before switching phones, or turn on sync above."}</p>
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
  const region = document.getElementById("region");
  region.addEventListener("change", () => {
    store.setSetting("priceRegion", region.value);
    document.getElementById("customRow").hidden = region.value !== "custom";
    flash(region);
  });
  const scanModel = document.getElementById("scanModel");
  scanModel.addEventListener("change", () => { store.setSetting("scanModel", scanModel.value); flash(scanModel); });
  const scanKey = document.getElementById("scanKey");
  const saveKey = () => { const v = scanKey.value.trim(); if (store.settings().scanKey !== v) { store.setSetting("scanKey", v); flash(scanKey); } };
  scanKey.addEventListener("input", saveKey);
  const proxy = document.getElementById("proxy");
  const saveProxy = () => { const v = proxy.value.trim(); if (store.settings().proxy !== v) { store.setSetting("proxy", v); flash(proxy); } };
  proxy.addEventListener("input", saveProxy);
  proxy.addEventListener("change", saveProxy);
  document.getElementById("testProxy").onclick = async e => {
    e.preventDefault();
    const base = proxy.value.trim().replace(/\/+$/, "");
    if (!base) { toast("Enter your Worker address first"); return; }
    store.setSetting("proxy", base);
    const out = document.getElementById("testOut");
    out.hidden = false;
    out.innerHTML = "Testing…";
    let linkOk = false, st = null;
    try {
      const res = await fetch(`${base}/?url=${encodeURIComponent("https://example.com/")}`);
      linkOk = res.ok && /Example Domain/i.test(await res.text());
    } catch {}
    try { const r = await fetch(`${base}/status`); if (r.ok) st = await r.json(); } catch {}
    const line = (ok, text) => `<div>${ok ? "✓" : "✗"} ${text}</div>`;
    out.innerHTML =
      line(linkOk, linkOk ? "Recipe links: working" : "Recipe links: couldn't reach the Worker. Check the address and that it's deployed.") +
      (st == null ? line(false, "Photo scanning: this Worker has the old code. Paste the latest worker.js and deploy.")
        : st.ai ? line(true, `Photo scanning: ready${st.keyRequired ? (store.settings().scanKey ? " (app key set)" : " — but the Worker needs an app key; enter it below") : ""}`)
        : line(false, "Photo scanning: add a Workers AI binding named AI to the Worker, then deploy."));
  };
  // ---- Sync ----
  const runSync = async (msg) => {
    const el = document.getElementById("syncStatus");
    if (el) el.textContent = "Syncing…";
    try { const r = await sync.syncNow(); toast(msg || (r.applied ? `Synced · ${r.applied} update${r.applied > 1 ? "s" : ""}` : "Synced")); }
    catch (err) { toast(err.message); }
    if (location.hash === "#/settings") settingsView();
  };
  document.getElementById("syncOn")?.addEventListener("click", async () => {
    try { await sync.enable(); toast("Sync is on"); } catch (err) { toast(err.message); }
    settingsView();
  });
  document.getElementById("joinForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const v = document.getElementById("joinCode").value.trim();
    let code = v, worker = "";
    try { const u = new URL(v); code = u.searchParams.get("join") || ""; worker = u.searchParams.get("w") || ""; } catch {}
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(code)) { toast("That doesn't look like an invite link or code"); return; }
    askJoin(code, worker);
  });
  document.getElementById("syncNow")?.addEventListener("click", () => runSync());
  document.getElementById("shareInvite")?.addEventListener("click", async () => {
    const link = sync.inviteLink();
    try {
      if (navigator.share) await navigator.share({ title: "Join my Recipe Box", text: "Open this to sync our Recipe Box:", url: link });
      else { await navigator.clipboard.writeText(link); toast("Invite link copied"); }
    } catch {}
  });
  document.getElementById("syncOff")?.addEventListener("click", async () => {
    if (await confirmBox("Stop syncing on this device? Your recipes stay here, and other devices keep their copies.", "Turn off sync", true)) {
      sync.disable(); toast("Sync is off on this device"); settingsView();
    }
  });
  // Opened from an invite link
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem("rb.join")); sessionStorage.removeItem("rb.join"); } catch {}
  if (pending?.code) askJoin(pending.code, pending.worker);

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
