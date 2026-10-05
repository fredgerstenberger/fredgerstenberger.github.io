// Settings: theme, filter thresholds, planning, units, import proxy, backups.
import { me, setMyName } from "../ratings.js";
import * as store from "../store.js";
import { esc, setPrepDay } from "../util.js";
import { alignWeeks } from "../weeks.js";
import { shell, render, toast, confirmBox, applyTheme } from "../ui.js";
import { REGIONS } from "../prices.js";
import { SCAN_MODELS } from "../scan.js";
import * as sync from "../sync.js";
import { modal } from "../ui.js";
import { APP_VERSION, RELEASED, WHATS_NEW } from "../version.js";
import { icon } from "../sprites.js";
import { showEstimates } from "../tips.js";
import { isDev, versionTap } from "../dev.js";

function ago(t) {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return new Date(t).toLocaleDateString();
}

function syncHTML(s) {
  if (!s.proxy) return isDev() ? `<p class="muted" style="margin-top:0">Set the Worker address in Developer first; sync runs through it.</p>`
    : `<p style="margin-top:0">Got an invite from another phone? Open its link on this device to join.</p>`;
  if (!sync.enabled()) return `
    <p style="margin-top:0">Share recipes, plans and lists across your devices and with a partner.</p>
    <div class="btnrow"><button class="btn primary" id="syncOn">Turn on sync</button></div>
    <details class="breakdown"><summary>Have an invite from another device?</summary>
      <form id="joinForm" class="inline" style="margin-top:8px">
        <input type="text" id="joinCode" placeholder="Invite link or 10-letter code" autocapitalize="characters" autocomplete="off" spellcheck="false">
        <button class="btn small" type="submit">Join</button>
      </form>
    </details>`;
  const i = sync.info();
  return `
    <div class="setrow" style="border-top:1px solid var(--sunk)"><span>Status<small id="syncStatus">${i.error ? esc(i.error) : `Last synced ${ago(i.last)}${i.pending ? `, ${i.pending} change${i.pending > 1 ? "s" : ""} waiting` : ""}`}</small></span>
      <button class="btn small" id="syncNow">Sync now</button></div>
    <label class="field" style="margin-top:12px"><span>Your name</span>
      <input type="text" id="myName" value="${esc(me().name)}" placeholder="Your name" autocomplete="given-name" maxlength="40">
      <small>Use the same name on all your devices.</small></label>
    <p style="margin:14px 0 6px"><b>Add another device or a partner</b></p>
    <p class="muted" style="font-size:14px;margin:0 0 8px">Each invite works once, for 24 hours.</p>
    <div id="inviteOut"></div>
    <div class="btnrow"><button class="btn small primary" id="newInvite">Create invite</button></div>
    <details class="breakdown"><summary>Remove access for other devices</summary>
      <p style="font-size:14px">Other devices stop syncing until you invite them again. This one keeps everything.</p>
      <button class="btn small danger" id="resetCode">Reset sync code</button>
    </details>
    <div class="btnrow"><button class="btn small danger" id="syncOff">Turn off sync on this device</button></div>`;
}

const APP_URL = new URL(".", location.href).href.replace(/#.*$/, "");
const WORKER_HELP = "https://github.com/fredgerstenberger/fredgerstenberger.github.io/blob/main/recipes/worker/README.md";

function askJoin(invite, worker) {
  const { el, close } = modal("Join recipe box?", `
    <p style="margin-top:0">This device joins the shared recipe box. What's already here is kept and added.</p>
    ${worker ? `<p class="muted" style="font-size:14px">Worker: ${esc(worker)}</p>` : ""}
    <div class="btnrow"><button class="btn primary" id="jYes">Join and sync</button><button class="btn" id="jNo">Cancel</button></div>`);
  el.querySelector("#jNo").onclick = close;
  el.querySelector("#jYes").onclick = async () => {
    if (worker) store.setSetting("proxy", worker.replace(/\/+$/, ""));
    if (!store.settings().proxy) { toast("Enter your Worker address first"); close(); return; }
    el.querySelector("#jYes").disabled = true;
    el.querySelector("#jYes").textContent = "Syncing…";
    try { const r = await sync.redeemInvite(invite, worker); toast(`Joined. ${r.applied} item${r.applied === 1 ? "" : "s"} synced.`); }
    catch (err) { toast(err.message); }
    close();
    settingsView();
  };
}

async function showWorkerVersion(s) {
  const el = document.getElementById("workerVer");
  if (!el || !s.proxy) return;
  try {
    const res = await fetch(`${s.proxy.replace(/\/+$/, "")}/status`, { cache: "no-store" });
    const st = await res.json();
    el.textContent = `Worker: ${st.version || "old version"}${st.fdcKey ? ", USDA key set" : ""}`;
  } catch { el.textContent = "Worker: couldn't reach it"; }
}

// Ask the server for the newest version.js; if it's newer than what's running, reload into it.
async function checkForUpdate(btn) {
  btn.disabled = true;
  btn.textContent = "Checking…";
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update().catch(() => {});
    const src = await (await fetch(`js/version.js?t=${Date.now()}`, { cache: "no-store" })).text();
    const latest = Number(src.match(/APP_VERSION\s*=\s*(\d+)/)?.[1]);
    if (latest > APP_VERSION) {
      toast(`Updating to version ${latest}…`);
      setTimeout(() => location.reload(), 800);
      return;
    }
    toast("You're on the latest version");
  } catch { toast("Couldn't check. Are you online?"); }
  btn.disabled = false;
  btn.textContent = "Check for updates";
}

// Restoring a backup: merge (safe, keeps anything newer) or replace (exactly the backup).
function askRestore(data) {
  const when = Date.parse(data.exported);
  const date = when ? new Date(when).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "an unknown date";
  const count = Object.keys(data.recipes || {}).length;
  const synced = sync.enabled();
  return new Promise(resolve => {
    let handled = false;
    const { el, close } = modal("Restore backup?", `
      <p style="margin-top:0">Backup from <b>${esc(date)}</b>, ${count} recipe${count === 1 ? "" : "s"}.</p>
      <div class="btnrow"><button class="btn primary" id="rMerge">Merge</button></div>
      <p class="muted" style="font-size:14px;margin:4px 0 12px">Adds what's missing. Where a recipe is in both, the newer version is kept. Nothing newer is lost${synced ? ", on this phone or on your other synced devices" : ""}.</p>
      <div class="btnrow"><button class="btn danger" id="rReplace">Replace everything</button></div>
      <p class="muted" style="font-size:14px;margin:4px 0 12px">Makes this phone match the backup exactly.${synced ? " <b>Sync is on, so it also replaces everything on your other devices</b>, including changes made after the backup." : ""}</p>
      <div class="btnrow"><button class="btn" id="rCancel">Cancel</button></div>`, { onClose: () => { if (!handled) resolve(null); } });
    el.querySelector("#rMerge").onclick = () => { handled = true; close(); resolve("merge"); };
    el.querySelector("#rCancel").onclick = close;
    el.querySelector("#rReplace").onclick = async () => {
      handled = true;
      close();
      if (synced && !(await confirmBox(`Replace the recipes, plans, lists and settings on every synced device with this backup from ${date}? Anything changed since then is lost everywhere.`, "Replace everywhere", true))) { resolve(null); return; }
      resolve("replace");
    };
  });
}

const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function settingsView() {
  const s = store.settings();
  const st = store.get();
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-set="${key}" data-val="${v}" aria-pressed="${s[key] === v}">${l}</button>`).join("")}</div>`;
  // `label` is what VoiceOver reads for the field (the text beside it isn't tied to it).
  const num = (key, min, max, step = 1, label = "") => `<input type="number" data-num="${key}" min="${min}" max="${max}" step="${step}" inputmode="${step < 1 ? "decimal" : "numeric"}" value="${s[key]}"${label ? ` aria-label="${esc(label)}"` : ""}>`;
  const bookmarklet = `javascript:location.href='${APP_URL}?url='+encodeURIComponent(location.href)`;

  render(shell({
    title: "Settings",
    back: "#/more",
    body: `
      <h2 class="sect">Appearance</h2>
      <div class="setrow"><span>Theme</span>${seg("theme", [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]])}</div>

      <h2 class="sect">Recipe filters</h2>
      <div class="setrow"><span>Lighter<small>kcal per serving, at most</small></span>${num("lowCal", 100, 2000, 25, "Lighter: calories per serving, at most")}</div>
      <div class="setrow"><span>High protein<small>grams per serving, at least</small></span>${num("highProtein", 5, 150, 1, "High protein: grams of protein per serving, at least")}</div>
      <div class="setrow"><span>Quick<small>total minutes, at most</small></span>${num("quickMin", 5, 240, 5, "Quick: total minutes, at most")}</div>

      <div class="setrow"><span>Budget<small>$ per serving, at most</small></span>${num("budget", 0.5, 50, 0.25, "Budget: dollars per serving, at most")}</div>

      <h2 class="sect">Prices</h2>
      <div class="setrow"><span>About estimates<small>How nutrition and costs are worked out</small></span><button class="btn small" id="aboutEst">${icon("info", "ic16")} View</button></div>
      <label class="field"><span>Where you shop<small>Adjusts estimated prices</small></span>
        <select id="region">${REGIONS.map(([id, name, f]) => `<option value="${id}" ${s.priceRegion === id ? "selected" : ""}>${esc(name)}${f ? ` (${f === 1 ? "baseline" : `${f > 1 ? "+" : "-"}${Math.round(Math.abs(f - 1) * 100)}%`})` : ""}</option>`).join("")}</select>
      </label>
      <div class="setrow" id="customRow" ${s.priceRegion === "custom" ? "" : "hidden"}><span>Custom level<small>% of the US average</small></span>${num("priceCustomPct", 50, 250, 1, "Custom price level: percent of US average")}</div>
      <p class="muted" style="font-size:14px;margin:4px 0 0">For exact costs, enter your store's <a href="#/prices">prices</a>.</p>

      <h2 class="sect">Cooking &amp; planning</h2>
      <div class="setrow"><span>Shopping &amp; prep day<small>Your week starts the next day</small></span>
        <select id="prepDay" class="setsel" aria-label="Shopping and prep day">${DAY_LONG.map((d, i) => `<option value="${i}" ${(s.prepDay ?? 0) === i ? "selected" : ""}>${d}</option>`).join("")}</select></div>
      <div class="setrow"><span>People per meal<small>For suggested servings</small></span>${num("people", 1, 12, 1, "People per meal")}</div>
      <div class="setrow"><span>Default units</span>${seg("units", [["original", "Original"], ["us", "US"], ["metric", "Metric"]])}</div>
      <div class="setrow"><span>Keep screen on in cook mode</span>${seg("wakeLock", [[true, "On"], [false, "Off"]])}</div>

      <h2 class="sect">Add from Safari</h2>
      <details class="breakdown" style="margin-top:0"><summary>Set up the Share shortcut</summary>
        <p><b>Option A: Shortcut (recommended).</b> In the Shortcuts app, make a new shortcut: turn on <i>Show in Share Sheet</i> (accepts URLs), then add the action <i>Open URLs</i> with:</p>
        <div class="code">${esc(APP_URL)}?url=[Shortcut Input]</div>
        <p>Then, on any recipe page, tap Share and pick your shortcut.</p>
        <p><b>Option B: Bookmarklet.</b> Bookmark any page, edit the bookmark, and replace its address with:</p>
        <div class="code">${esc(bookmarklet)}</div>
      </details>

      <h2 class="sect" id="set-sync">Sync</h2>
      <div id="syncBox">${syncHTML(s)}</div>

      <h2 class="sect" id="set-backup">Backup</h2>
      <p style="margin-top:0">${sync.enabled() ? "Sync keeps a copy. A backup file is an extra safety net." : "Saved on this device only. Export a backup now and then."}</p>
      <div class="btnrow">
        <button class="btn primary" id="export">Export backup</button>
        <label class="btn" for="importFile">Import backup</label>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
      </div>
      <p class="muted" style="font-size:14px">Last backup: ${st.lastBackup ? new Date(st.lastBackup).toLocaleString() : "never"}</p>

      <h2 class="sect">Install on iPhone</h2>
      <ol class="howto">
        <li>Open this page in <b>Safari</b>.</li>
        <li>Tap <b>Share</b>.</li>
        <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
      </ol>
      <p class="muted" style="font-size:14px">Safari and the Home Screen app keep separate data, so use one.</p>

      <h2 class="sect">Version</h2>
      <div class="setrow"><span><button class="vertap" id="verTap">Recipe Box ${APP_VERSION}</button><small>Released ${new Date(RELEASED + "T12:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</small>${isDev() ? `<small id="workerVer">${s.proxy ? "Worker: checking…" : "Worker: not set up"}</small>` : ""}</span>
        <button class="btn small" id="checkUpdate">Check for updates</button></div>
      <details class="breakdown"><summary>What's new</summary><ul class="howto">${WHATS_NEW.map(x => `<li>${esc(x)}</li>`).join("")}</ul></details>
      ${isDev() ? `      <h2 class="sect" id="set-dev">Developer</h2>
      <p class="muted" style="font-size:14px;margin-top:0">Tap the version number 7 times to hide this section.</p>
      <label class="field"><span>Your Worker address<small>From Cloudflare: links &amp; photo scanning</small></span>
        <div class="inline">
          <input type="url" id="proxy" value="${esc(s.proxy)}" placeholder="https://recipe-proxy.yourname.workers.dev" autocapitalize="none">
          <button class="btn small" id="testProxy">Test</button>
        </div>
        <div class="note" id="testOut" hidden style="margin:8px 0 4px"></div>
        <small>Without one, imports go through free public proxies that are sometimes down. A free Cloudflare Worker is more reliable. <a href="${WORKER_HELP}" target="_blank" rel="noopener">Setup guide</a></small>
      </label>
      <label class="field"><span>Photo scanning model<small>Open-weight vision models on Cloudflare Workers AI</small></span>
        <select id="scanModel">${SCAN_MODELS.map(([id, name]) => `<option value="${id}" ${s.scanModel === id ? "selected" : ""}>${esc(name)}</option>`).join("")}</select>
      </label>
      <label class="field"><span>App key (optional)<small>Only if you added an APP_KEY secret to your Worker</small></span>
        <input type="text" id="scanKey" value="${esc(s.scanKey || "")}" autocapitalize="none" autocomplete="off" spellcheck="false">
      </label>
` : ""}`,
    status: `<span>${Object.keys(st.recipes).length} recipes</span><span>Version ${APP_VERSION}</span>`
  }), { keepScroll: true });
  // From More → Sync / Backup: open at that section.
  let focus = null;
  try { focus = sessionStorage.getItem("rb.setFocus"); sessionStorage.removeItem("rb.setFocus"); } catch {}
  if (focus) document.getElementById(`set-${focus}`)?.scrollIntoView({ block: "start" });

  const root = document.getElementById("app");
  // Every control saves immediately (no need to leave the field), then flashes "Saved ✓".
  const flash = el => {
    const row = el.closest(".setrow, .field");
    if (!row) return toast("Saved");
    let tag = row.querySelector(".savedtag");
    if (!tag) { tag = document.createElement("small"); tag.className = "savedtag"; row.querySelector("span")?.appendChild(tag); }
    tag.innerHTML = `${icon("check", "ic16")} Saved`;
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
  const prep = document.getElementById("prepDay");
  prep.addEventListener("change", () => {
    const d = Number(prep.value);
    store.setSetting("prepDay", d);
    setPrepDay(d);
    alignWeeks(); // meals, checked items and added items move to the new weeks
    store.save();
    try { sessionStorage.removeItem("rb.week"); } catch {} // open the plan and list on the current week
    flash(prep);
    toast(`Weeks now run ${DAY_LONG[(d + 1) % 7]} to ${DAY_LONG[(d + 7) % 7]}`);
  });
  document.getElementById("aboutEst").onclick = showEstimates;
  const region = document.getElementById("region");
  region.addEventListener("change", () => {
    store.setSetting("priceRegion", region.value);
    document.getElementById("customRow").hidden = region.value !== "custom";
    flash(region);
  });
  // Developer settings (shown after 7 taps on the version number).
  document.getElementById("verTap").onclick = () => {
    const now = versionTap();
    if (now) { toast(now === "on" ? "Developer settings on" : "Developer settings off"); settingsView(); if (now === "on") document.getElementById("set-dev")?.scrollIntoView({ block: "start" }); }
  };
  if (isDev()) bindDeveloper(flash);
  bindSync(flash, s);
}

function bindDeveloper(flash) {
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
    let linkOk = false, linkStatus = 0, st = null;
    try {
      const key = store.settings().scanKey;
      const headers = key ? { "X-App-Key": key } : {};
      // A page with no recipe: a working Worker answers "no recipe found" (422).
      let res = await fetch(`${base}/recipe?url=${encodeURIComponent("https://example.com/")}`, { headers });
      linkStatus = res.status;
      linkOk = res.status === 422 && (await res.json().catch(() => ({}))).code === "no_recipe";
      if (!linkOk && linkStatus !== 401) { // older Worker: its page proxy
        res = await fetch(`${base}/?url=${encodeURIComponent("https://example.com/")}`, { headers });
        linkOk = res.ok && /Example Domain/i.test(await res.text());
        if (res.status === 401) linkStatus = 401;
      }
    } catch {}
    try { const r = await fetch(`${base}/status`); if (r.ok) st = await r.json(); } catch {}
    const line = (ok, text) => `<div class="chkline">${icon(ok ? "check" : "close", "ic16")}<span>${text}</span></div>`;
    out.innerHTML =
      line(linkOk, linkOk ? "Recipe links: working" : linkStatus === 401 ? "Recipe links: the Worker needs an app key; enter it below" : "Recipe links: couldn't reach the Worker. Check the address and that it's deployed.") +
      (st == null ? line(false, "Photo scanning: this Worker has the old code. Paste the latest worker.js and deploy.")
        : st.ai ? line(true, `Photo scanning: ready${st.keyRequired ? (store.settings().scanKey ? " (app key set)" : ". The Worker needs an app key; enter it below.") : ""}`)
        : line(false, "Photo scanning: add a Workers AI binding named AI to the Worker, then deploy."));
  };
}

function bindSync(flash, s) {
  // ---- Sync ----
  const runSync = async (msg) => {
    const el = document.getElementById("syncStatus");
    if (el) el.textContent = "Syncing…";
    try { const r = await sync.syncNow(); toast(msg || (r.applied ? `Synced ${r.applied} update${r.applied > 1 ? "s" : ""}` : "Synced")); }
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
    try { const u = new URL(v); code = u.searchParams.get("invite") || ""; worker = u.searchParams.get("w") || ""; } catch {}
    code = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 10) { toast("That doesn't look like an invite link or code"); return; }
    askJoin(code, worker);
  });
  document.getElementById("syncNow")?.addEventListener("click", () => runSync());
  document.getElementById("myName")?.addEventListener("change", e => { setMyName(e.target.value); flash(e.target); });
  document.getElementById("newInvite")?.addEventListener("click", async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const inv = await sync.createInvite();
      const pretty = inv.token.slice(0, 5) + "-" + inv.token.slice(5);
      const out = document.getElementById("inviteOut");
      out.innerHTML = `
        <p style="margin:0 0 4px">Invite code: <b class="px" style="font-size:20px;letter-spacing:1px">${pretty}</b></p>
        <div class="code">${esc(inv.link)}</div>
        <p class="muted" style="font-size:13px;margin:4px 0 0">Works once. Expires ${new Date(inv.expires).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</p>
        <div class="btnrow"><button class="btn small" id="shareInvite">Share invite</button></div>`;
      document.getElementById("shareInvite").onclick = async () => {
        try {
          if (navigator.share) await navigator.share({ title: "Join my Recipe Box", text: `Join my Recipe Box (code ${pretty}, works once):`, url: inv.link });
          else { await navigator.clipboard.writeText(inv.link); toast("Invite link copied"); }
        } catch {}
      };
      btn.textContent = "Create another invite";
    } catch (err) { toast(err.message); }
    btn.disabled = false;
  });
  document.getElementById("resetCode")?.addEventListener("click", async () => {
    if (await confirmBox("Start a new recipe box with a new secret code? Every other device and person stops syncing until you send them a new invite. Nothing is deleted from this device.", "Reset sync code", true)) {
      try { await sync.resetCode(); toast("New sync code. Other devices are removed."); } catch (err) { toast(err.message); }
      settingsView();
    }
  });
  document.getElementById("syncOff")?.addEventListener("click", async () => {
    if (await confirmBox("Stop syncing on this device? Your recipes stay here, and other devices keep their copies.", "Turn off sync", true)) {
      sync.disable(); toast("Sync is off on this device"); settingsView();
    }
  });
  // Opened from an invite link
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem("rb.join")); sessionStorage.removeItem("rb.join"); } catch {}
  if (pending?.invite) askJoin(String(pending.invite).toUpperCase(), pending.worker);

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
    e.target.value = "";
    try {
      const text = await f.text();
      const data = store.readBackup(text);
      const mode = await askRestore(data);
      if (!mode) return;
      const n = store.importJSON(text, mode);
      applyTheme();
      toast(mode === "replace" ? "Restored the backup" : `Merged. ${n} recipe${n === 1 ? "" : "s"} added or updated.`);
      settingsView();
    } catch (err) { toast(err.message || "Import failed"); }
  };
  showWorkerVersion(s);
  document.getElementById("checkUpdate").onclick = e => checkForUpdate(e.currentTarget);
}
