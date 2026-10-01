// Sync between devices through your Cloudflare Worker (POST /sync → a Durable Object per recipe box).
//
// The app's data is split into records — each recipe, each week's plan and grocery checks,
// pantry, prices and settings. Every record remembers when it was last edited on this device;
// the newest edit of a record wins. Edits made offline are sent the next time sync runs.
import * as store from "./store.js";

const KEY = "recipebox.sync";
let meta = loadMeta();
let running = null, again = false, timer = null, interval = null;

function loadMeta() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
function saveMeta() {
  try { meta ? localStorage.setItem(KEY, JSON.stringify(meta)) : localStorage.removeItem(KEY); } catch {}
}

export const enabled = () => !!meta?.code;
export const info = () => meta ? { code: meta.code, last: meta.last || 0, error: meta.error || "", pending: (meta.dirty || []).length } : null;

// JSON with sorted keys, so the same data always fingerprints the same on every device.
function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}

// Short, fast fingerprint of a record (to notice edits without storing copies).
function fp(v) { return hash(stable(v)); }
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const DEVICE_ONLY_SETTINGS = ["theme"];

function records() {
  const s = store.get();
  const out = {};
  for (const [id, r] of Object.entries(s.recipes || {})) out["r:" + id] = r;
  for (const [wk, p] of Object.entries(s.plan || {})) out["p:" + wk] = p;
  for (const [wk, g] of Object.entries(s.grocery || {})) out["g:" + wk] = g;
  out.pantry = s.pantry || {};
  out.prices = s.prices || {};
  const settings = { ...s.settings };
  for (const k of DEVICE_ONLY_SETTINGS) delete settings[k];
  out.settings = settings;
  return out;
}

// Replace an object's contents in place, so screens holding a reference see the new data.
function fill(target, v) {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, v);
  return target;
}

function apply(k, v) {
  const s = store.get();
  const [kind, id] = k.includes(":") ? [k.slice(0, 1), k.slice(2)] : [k, ""];
  const coll = { r: "recipes", p: "plan", g: "grocery" }[kind];
  if (coll) {
    s[coll] ||= {};
    if (v == null) delete s[coll][id];
    else if (s[coll][id]) fill(s[coll][id], v);
    else s[coll][id] = v;
  } else if (k === "pantry") fill(s.pantry ||= {}, v || {});
  else if (k === "prices") { fill(s.prices ||= {}, v || {}); s.pricesUpdated = Date.now(); }
  else if (k === "settings" && v) {
    const keep = Object.fromEntries(DEVICE_ONLY_SETTINGS.map(x => [x, s.settings[x]]));
    Object.assign(s.settings, v, keep);
  }
}

// Called after every local save: note which records changed and when.
function stamp() {
  if (!meta) return;
  const now = Date.now();
  const recs = records();
  const dirty = new Set(meta.dirty);
  for (const [k, v] of Object.entries(recs)) {
    const h = fp(v);
    if (meta.h[k] !== h) { meta.h[k] = h; meta.u[k] = now; dirty.add(k); }
  }
  for (const k of Object.keys(meta.h)) {
    if (!(k in recs) && meta.h[k] !== null) { meta.h[k] = null; meta.u[k] = now; dirty.add(k); }
  }
  meta.dirty = [...dirty];
  saveMeta();
  if (meta.dirty.length) schedule(3000);
}

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow().catch(() => {}), ms);
}

export async function syncNow() {
  if (!meta) return { applied: 0 };
  if (running) { again = true; return running; }
  running = (async () => {
    const st = store.settings();
    if (!st.proxy) throw new Error("Set your Worker address first.");
    const recs = records();
    const sent = meta.dirty.slice();
    const sentHash = Object.fromEntries(sent.map(k => [k, meta.h[k]]));
    const changes = sent.map(k => ({ k, u: meta.u[k] || 0, v: k in recs ? recs[k] : null }));
    let res, data;
    try {
      res = await fetch(`${st.proxy.replace(/\/+$/, "")}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(st.scanKey ? { "X-App-Key": st.scanKey } : {}) },
        body: JSON.stringify({ box: meta.code, since: meta.since || 0, changes })
      });
      data = await res.json().catch(() => ({}));
    } catch {
      meta.error = "Offline — will sync when you're back online.";
      saveMeta();
      throw new Error(meta.error);
    }
    if (!res.ok) {
      meta.error = data.error || `Sync failed (HTTP ${res.status}).`;
      saveMeta();
      throw new Error(meta.error);
    }
    // Sent records are done unless they were edited again while we were waiting.
    meta.dirty = meta.dirty.filter(k => !(sent.includes(k) && meta.h[k] === sentHash[k]));
    let applied = 0;
    for (const r of data.records || []) {
      if (!(r.k in meta.u) || r.u > meta.u[r.k]) {
        apply(r.k, r.v);
        meta.u[r.k] = r.u;
        meta.h[r.k] = r.v == null ? null : fp(r.v);
        meta.dirty = meta.dirty.filter(x => x !== r.k);
        applied++;
      }
    }
    meta.since = data.seq || meta.since;
    meta.last = Date.now();
    meta.error = "";
    saveMeta();
    if (applied) {
      store.save(); // persists; stamp() sees nothing new because hashes are already updated
      window.dispatchEvent(new CustomEvent("rb:synced", { detail: { applied } }));
    }
    return { applied };
  })();
  try { return await running; }
  finally {
    running = null;
    if (again) { again = false; schedule(500); }
  }
}

function newCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map(b => abc[b % abc.length]).join("");
}

// Start syncing this device. With no code, creates a new recipe box; with a code, joins it.
// When joining, everything already on this device counts as older than anything in the box
// (edited at time -1), so the box's settings, pantry and prices win, and only things the box
// doesn't have yet (e.g. this device's own recipes) are added to it.
export async function enable(code) {
  meta = { code: code || newCode(), since: 0, h: {}, u: {}, dirty: [], last: 0, error: "" };
  for (const [k, v] of Object.entries(records())) {
    meta.h[k] = fp(v);
    meta.u[k] = code ? -1 : 0;
    meta.dirty.push(k);
  }
  saveMeta();
  start();
  return syncNow();
}

export function disable() {
  meta = null;
  saveMeta();
  clearTimeout(timer);
  clearInterval(interval);
}

// ---- One-time invites ----
// The box's secret code never goes in a link. Instead the Worker issues a random 10-letter invite
// that works once and expires after 24 hours; redeeming it hands the secret to the new device.
async function post(path, body, worker) {
  const st = store.settings();
  const w = (worker || st.proxy || "").replace(/\/+$/, "");
  if (!w) throw new Error("Set your Worker address first.");
  let res;
  try {
    res = await fetch(`${w}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(st.scanKey ? { "X-App-Key": st.scanKey } : {}) },
      body: JSON.stringify(body)
    });
  } catch { throw new Error("Couldn't reach your Worker. Check your connection."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status}).`);
  return data;
}

export async function createInvite() {
  if (!meta) throw new Error("Turn on sync first.");
  const { token, expires } = await post("/invite", { box: meta.code });
  const base = new URL(".", location.href).href.replace(/#.*$/, "");
  const w = store.settings().proxy;
  return { token, expires, link: `${base}?invite=${token}${w ? `&w=${encodeURIComponent(w)}` : ""}` };
}

export async function redeemInvite(token, worker) {
  const { box } = await post("/invite/redeem", { token }, worker);
  return enable(box);
}

// Start a fresh box with a new secret code (removes access for every other device).
export async function resetCode() {
  return enable();
}

let started = false;
export function start() {
  if (!meta) return;
  if (!started) {
    started = true;
    store.onChange(stamp);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && meta) schedule(300); });
    window.addEventListener("online", () => { if (meta) schedule(300); });
  }
  clearInterval(interval);
  interval = setInterval(() => { if (meta && document.visibilityState === "visible") syncNow().catch(() => {}); }, 60000);
  stamp();
  schedule(500);
}
