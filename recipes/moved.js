// Recipe Box moved from this address (fredgerstenberger.github.io/recipes/) to https://app.bakfan.com.
// Browsers keep a site's data per address, so this page hands this phone's data over in one tap:
//   Move my data → pack everything the app kept here, encrypt it on the phone (move-crypto.js), upload only the
//   encrypted bytes to the Worker for 24 hours, and open app.bakfan.com/#move=<id>.<key>. The key is in the
//   #fragment, which never reaches a server; the new address fetches the bytes once, decrypts and merges them.
// After a move this address shows "Moved" with a link instead of the app, so nobody keeps editing the old copy.
// The data stays here as a fallback (never deleted), with Download a backup file.
import { packStorage, encryptPayload, backupText } from "./move-crypto.js";

export const NEW_APP = "https://app.bakfan.com";
export const API = "https://api.bakfan.com";
export const MOVED = "rb.moved";

const parse = s => { try { return JSON.parse(s); } catch { return null; } };

/** "moved" (already handed over), "data" (has recipes or plans to move) or "empty" (nothing here). */
export function moveState(storage) {
  if (storage.getItem(MOVED)) return "moved";
  const s = parse(storage.getItem("recipebox.v1"));
  const has = !!s && (Object.keys(s.recipes || {}).length || Object.values(s.plan || {}).some(p => p?.meals?.length) || Object.keys(s.household || {}).length);
  return has || storage.getItem("recipebox.sync") ? "data" : "empty";
}

/**
 * Upload this phone's data, encrypted. Tries api.bakfan.com, then the Worker address saved in the app's settings
 * (the same Worker at its old workers.dev address). On success marks this address as moved and returns the link.
 */
export async function moveData(storage, fetchImpl = fetch) {
  const { bytes, key } = await encryptPayload(packStorage(storage));
  const settings = parse(storage.getItem("recipebox.v1"))?.settings || {};
  const headers = { "Content-Type": "application/octet-stream", ...(settings.scanKey ? { "X-App-Key": settings.scanKey } : {}) };
  const apis = [...new Set([API, String(settings.proxy || "").replace(/\/+$/, "")].filter(Boolean))];
  let last = null;
  for (const api of apis) {
    let res;
    try { res = await fetchImpl(`${api}/move`, { method: "POST", headers, body: bytes }); }
    catch { last = new Error("Couldn't connect. Check your connection, then try again."); continue; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { last = new Error(res.status === 413 ? "There's more here than a move can carry. Download a backup file, then import it at the new address (Settings, Backup)." : data.error || `Something went wrong (${res.status}). Try again in a minute.`); continue; }
    storage.setItem(MOVED, JSON.stringify({ at: Date.now() }));
    return `${NEW_APP}/#move=${data.id}.${key}`;
  }
  throw last || new Error("Couldn't connect. Check your connection, then try again.");
}

/** Shortcut and share links (?add=…, ?url=…, ?invite=…) keep working: they go to the new address. */
export const forwardTo = search => (/[?&](add|url|text|invite)=/.test(search || "") ? `${NEW_APP}/${search}` : null);

// ---- The page ----

const $ = id => document.getElementById(id);
const show = id => { for (const s of document.querySelectorAll("section[data-screen]")) s.hidden = s.id !== id; };

function download() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([backupText(packStorage(localStorage).keys)], { type: "application/json" }));
  a.download = `recipe-box-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

async function move(btn) {
  const status = btn.closest("section").querySelector("[role=status]");
  btn.disabled = true; status.hidden = false; status.className = "note"; status.textContent = "Packing up your recipes, plans and lists…";
  try {
    const link = await moveData(localStorage);
    // A Home Screen app on iPhone opens other addresses in Safari, which keeps its own data. So it hands over
    // the link instead, to paste in Recipe Box added to the Home Screen from app.bakfan.com.
    if (navigator.standalone === true) { $("link").value = link; show("handoff"); return; }
    location.href = link;
  } catch (e) {
    status.className = "note error"; status.textContent = e.message;
    btn.disabled = false; btn.textContent = "Try again";
  }
}

export function start() {
  const st = moveState(localStorage);
  const fwd = forwardTo(location.search);
  if (fwd && st !== "data") return location.replace(fwd);
  show(st === "moved" ? "moved" : st === "data" ? "move" : "empty");
  for (const b of document.querySelectorAll("[data-move]")) b.onclick = () => move(b);
  for (const b of document.querySelectorAll("[data-backup]")) b.onclick = download;
  $("copy").onclick = async () => {
    try { await navigator.clipboard.writeText($("link").value); $("copy").textContent = "Copied"; }
    catch { $("link").select(); }
  };
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}

if (typeof document !== "undefined" && document.getElementById("move")) start();
