// Sync between devices through your Cloudflare Worker (POST /sync → a Durable Object per recipe box).
//
// The app's data is split into records — each recipe, each week's plan and grocery checks,
// pantry, prices and settings. Every record remembers when it was last edited on this device;
// the newest edit of a record wins. Records two people often edit at once (grocery lists, pantry,
// prices, settings) merge field by field instead (see fields.js). Edits made offline are sent the
// next time sync runs.
import * as store from "./store.js";
import { bump } from "./data.js";
import { fp, isFieldRecord, isDeletable, toFields, fromFields, stampFields, mergeFields, latestEdit, FT } from "./fields.js";

const KEY = "recipebox.sync";
let meta = loadMeta();
let running = null, again = false, timer = null, interval = null;
const retries = new Map();

function loadMeta() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
function saveMeta() {
  try { meta ? localStorage.setItem(KEY, JSON.stringify(meta)) : localStorage.removeItem(KEY); } catch {}
}

export const enabled = () => !!meta?.code;
export const info = () => meta ? { code: meta.code, last: meta.last || 0, error: meta.error || "", pending: (meta.dirty || []).length } : null;

const DEVICE_ONLY_SETTINGS = ["theme"];

function records() {
  const s = store.get();
  const out = {};
  for (const [id, r] of Object.entries(s.recipes || {})) out["r:" + id] = r;
  for (const [wk, p] of Object.entries(s.plan || {})) out["p:" + wk] = p;
  for (const [wk, g] of Object.entries(s.grocery || {})) out["g:" + wk] = g;
  out.pantry = s.pantry || {};
  out.prices = s.prices || {};
  out.foods = s.foods || {};
  out.asked = s.asked || {};
  out.history = s.history || {};
  out.stores = s.stores || {};
  out.household = s.household || {};
  const settings = { ...s.settings };
  for (const k of DEVICE_ONLY_SETTINGS) delete settings[k];
  out.settings = settings;
  // Empty weeks that were never synced (e.g. a grocery list that was only looked at) stay local.
  for (const k of Object.keys(out)) {
    if (!k.startsWith("p:") && !k.startsWith("g:")) continue;
    const v = out[k];
    const empty = k.startsWith("p:") ? !(v.meals || []).length : !Object.keys(toFields(k, v)).length;
    if (empty && !(meta && k in meta.u)) delete out[k];
  }
  // Field-merged records in their normal shape (no stray _ft from an older app version).
  for (const k of Object.keys(out)) if (isFieldRecord(k)) {
    if (k.startsWith("g:")) (out[k].extras || []).forEach((e, i) => { if (e && e.at == null) e.at = i; });
    out[k] = fromFields(k, toFields(k, out[k]));
  }
  return out;
}

// Per-field edit times of a field-merged record.
function times(k) { return (meta.ft ||= {})[k] ||= {}; }

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
  else if (k === "foods" || k === "asked") { fill(s[k] ||= {}, v || {}); bump(); }
  else if (k === "history" || k === "stores" || k === "household") fill(s[k] ||= {}, v || {});
  else if (k === "prices") { fill(s.prices ||= {}, v || {}); s.pricesUpdated = Date.now(); }
  else if (k === "settings" && v) {
    const keep = Object.fromEntries(DEVICE_ONLY_SETTINGS.map(x => [x, s.settings[x]]));
    Object.assign(s.settings, v, keep);
  }
}

// Called after every local save: note which records changed and when.
// info.times: { recordKey: time } for records restored from a backup, which keep their original
// edit times instead of "now" so they don't beat newer edits made elsewhere.
function stamp(info) {
  if (!meta) return;
  const now = Date.now();
  const when = k => info?.times?.[k] ?? now;
  const recs = records();
  const dirty = new Set(meta.dirty);
  for (const [k, v] of Object.entries(recs)) {
    const h = fp(v);
    if (meta.h[k] !== h) {
      const t = when(k);
      meta.h[k] = h; meta.u[k] = k in meta.u && t <= meta.u[k] ? meta.u[k] + 1 : t; dirty.add(k);
      if (isFieldRecord(k)) stampFields(times(k), toFields(k, v), when(k));
    }
  }
  for (const k of Object.keys(meta.h)) {
    if (!(k in recs) && meta.h[k] !== null && (!isFieldRecord(k) || isDeletable(k))) {
      // A delete is timed after every edit we know of, so it beats them.
      const last = isFieldRecord(k) ? latestEdit({}, times(k), meta.u[k] ?? 0) : -Infinity;
      meta.h[k] = null; meta.u[k] = Math.max(now, (meta.u[k] ?? 0) + 1, last + 1); dirty.add(k);
    }
  }
  meta.dirty = [...dirty];
  saveMeta();
  if (meta.dirty.length) schedule(onGrocery() ? 1000 : 3000);
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
    const changes = sent.map(k => ({ k, u: meta.u[k] || 0, v: k in recs ? (isFieldRecord(k) ? { ...recs[k], [FT]: times(k) } : recs[k]) : null }));
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
    // The box echoes back every write it accepted. One that didn't come back lost to a copy with the
    // same or a later time (two phones in the same millisecond, or clocks that disagree) that we've
    // already merged; send ours again, timed after it, so the edit isn't silently dropped.
    const echoed = new Set((data.records || []).map(r => r.k));
    for (const k of sent) {
      if (echoed.has(k)) { retries.delete(k); continue; }
      const n = (retries.get(k) || 0) + 1;
      retries.set(k, n);
      if (n > 5) continue; // give up on this one for now (the box keeps refusing it)
      meta.u[k] = Math.max(Date.now(), (meta.u[k] || 0) + 1);
      if (!meta.dirty.includes(k)) meta.dirty.push(k);
    }
    let applied = 0;
    for (const r of data.records || []) {
      if (isFieldRecord(r.k)) { applied += mergeIn(r); continue; }
      // Newest wins; an exact tie goes to the larger fingerprint, as on the Worker, so all devices agree.
      if (!(r.k in meta.u) || r.u > meta.u[r.k] || (r.u === meta.u[r.k] && fp(r.v ?? null) > (meta.h[r.k] ?? fp(null)))) {
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
    if (meta.dirty.length) again = true; // merged results to send back
    return { applied };
  })();
  try { return await running; }
  finally {
    running = null;
    if (again) { again = false; schedule(500); }
  }
}

// Merge a field-merged record from the box into ours. Returns 1 if our data changed.
function mergeIn(r) {
  const k = r.k;
  const cur = records()[k];
  const local = { fields: toFields(k, cur), times: times(k), u: meta.u[k] ?? 0 };
  const keep = u => { meta.u[k] = u; if (!meta.dirty.includes(k)) meta.dirty.push(k); return 0; };
  const done = () => { meta.dirty = meta.dirty.filter(x => x !== k); };
  // Recipes can be deleted: the later of the delete and the other copy's newest edit wins; a tie deletes.
  if (isDeletable(k)) {
    const incomingTimes = (r.v && r.v[FT]) || {};
    if (r.v == null) {
      if (cur === undefined) { meta.h[k] = null; meta.u[k] = Math.max(meta.u[k] ?? r.u, r.u); done(); return 0; }
      if (r.u >= latestEdit(local.fields, local.times, local.u)) { apply(k, null); meta.h[k] = null; meta.u[k] = r.u; done(); return 1; }
      return keep(Math.max(Date.now(), r.u + 1)); // edited here after it was deleted: put it back
    }
    if (cur === undefined && meta.h[k] === null) { // we deleted it
      const tin = latestEdit(toFields(k, r.v), incomingTimes, r.u);
      if (tin <= (meta.u[k] ?? -Infinity)) return keep(Math.max(Date.now(), r.u + 1, meta.u[k])); // re-send the delete
      local.fields = {}; local.times = {}; local.u = -Infinity;        // edited elsewhere after our delete: bring it back
    }
  }
  const incoming = { fields: toFields(k, r.v), times: (r.v && r.v[FT]) || {}, u: r.u };
  const m = mergeFields(local, incoming);
  meta.ft[k] = m.times;
  let changed = 0;
  if (fp(m.fields) !== fp(local.fields)) {
    apply(k, fromFields(k, m.fields));
    changed = 1;
  }
  meta.h[k] = fp(records()[k]);
  if (m.sameAsIncoming) {
    meta.u[k] = Math.max(meta.u[k] ?? 0, r.u);
    meta.dirty = meta.dirty.filter(x => x !== k);
  } else {
    // Ours has edits the box doesn't: send the merged copy back, newer than the box's.
    meta.u[k] = Math.max(Date.now(), r.u + 1);
    if (!meta.dirty.includes(k)) meta.dirty.push(k);
  }
  return changed;
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
  meta = { code: code || newCode(), since: 0, h: {}, u: {}, ft: {}, fv: FIELD_VERSION, dirty: [], last: 0, error: "" };
  for (const [k, v] of Object.entries(records())) {
    meta.h[k] = fp(v);
    meta.u[k] = code ? -1 : 0;
    if (isFieldRecord(k)) stampFields(times(k), toFields(k, v), meta.u[k]);
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

const onGrocery = () => /^#\/grocery/.test(location.hash || "");

// Records that became field-merged in a newer version (grocery etc. in v14, plans and recipes in v16):
// give every field its record's last edit time, and note the record's new normal form so nothing
// is re-sent just because of the upgrade.
const FIELD_VERSION = 2;
function migrate() {
  if (!meta || (meta.fv || 0) >= FIELD_VERSION) return;
  meta.ft ||= {};
  for (const [k, v] of Object.entries(records())) {
    if (!isFieldRecord(k) || !(k in meta.u)) continue;
    if (!Object.keys(times(k)).length) stampFields(times(k), toFields(k, v), meta.u[k]);
    if (!meta.dirty.includes(k)) meta.h[k] = fp(v);
  }
  meta.fv = FIELD_VERSION;
  saveMeta();
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
  migrate();
  // Every minute normally; every 8 seconds while a grocery list is open, so a partner's checks show up fast.
  clearInterval(interval);
  let lastPoll = Date.now();
  interval = setInterval(() => {
    if (!meta || document.visibilityState !== "visible") return;
    if (Date.now() - lastPoll < (onGrocery() ? 8000 : 60000)) return;
    lastPoll = Date.now();
    syncNow().catch(() => {});
  }, 4000);
  stamp();
  schedule(500);
}
