// Crash reports (Sentry, monitor.js) and usage stats (PostHog, analytics.js): the keys, the Settings switch,
// the anonymous ID they share, and the scrubbing that keeps recipes, lists and anything typed out of both.
// Nothing here can stop the app: every storage access is guarded, and with no keys everything stays off.
import { APP_VERSION } from "./version.js";
import { isDev } from "./dev.js";

// Public client keys: they're meant to be in the page (they can send data, not read it). Empty = off.
export const SENTRY_DSN = "https://292a254d7db80098e4247b1292f1bbd8@o4512205803552768.ingest.us.sentry.io/4512207501721600";
export const POSTHOG_KEY = "";
export const POSTHOG_HOST = "https://us.i.posthog.com";

export const RELEASE = `recipe-box@${APP_VERSION}`;

const SHARE = "rb.share", ANON = "rb.anon", LOCAL = "rb.obs";
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

/** Settings → Share anonymous crash reports and usage (on unless turned off, per device). */
export const sharing = () => get(SHARE) !== "0";
export function setSharing(on) {
  set(SHARE, on ? null : "0");
  if (!on) set(ANON, null); // turning it back on starts a new anonymous ID
}

const isLocal = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/**
 * Where to send, or null to send nothing: sharing off, no keys, Node tests, or a copy running on your own
 * computer. (To try it locally, put test keys in localStorage rb.obs: {"dsn": "…", "key": "…", "host": "…"}.)
 */
export function config() {
  if (typeof location === "undefined" || !sharing()) return null;
  let local = null;
  if (isLocal()) { try { local = JSON.parse(get(LOCAL)); } catch {} if (!local) return null; }
  else if (location.protocol !== "https:") return null;
  const c = local
    ? { dsn: local.dsn || "", key: local.key || "", host: local.host || POSTHOG_HOST, environment: "local" }
    : { dsn: SENTRY_DSN, key: POSTHOG_KEY, host: POSTHOG_HOST, environment: "production" };
  return c.dsn || c.key ? c : null;
}

/** A random ID for this device, shared by crash reports and usage stats. Not tied to you or your household. */
export function anonId() {
  let id = get(ANON);
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID()
      : Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("-");
    set(ANON, id);
  }
  return id;
}

export function standalone() {
  try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch { return false; }
}

/** Context sent with every report and event. */
export const appContext = () => ({ app_version: APP_VERSION, platform: "web", standalone: standalone(), dev_mode: isDev() });

// ---- Scrubbing ----

/** A screen without its details: #/r/abc → #/r/:id, #/add?url=… → #/add, #/plan/2026-10-05 → #/plan/:week. */
export function routeOf(hash = "") {
  const h = String(hash || "").replace(/^#?\/?/, "#/").split("?")[0]
    .replace(/^#\/(r|edit)\/.+$/, "#/$1/:id")
    .replace(/^#\/(plan|grocery)\/.+$/, "#/$1/:week");
  return /^#\/[\w/:-]*$/.test(h) ? h : "#/?";
}

/**
 * A web address cut to where it went. The query is dropped (recipe links, recipe text, grocery items,
 * ingredient names and invite codes travel there) and the app's own screens lose their details.
 */
export function scrubUrl(u) {
  if (!u) return u;
  const s = String(u);
  if (/^(data|blob):/i.test(s)) return "[data]";
  try {
    const x = new URL(s, "https://relative.invalid/");
    const base = x.origin === "https://relative.invalid" ? "" : x.origin;
    return `${base}${x.pathname}${x.hash ? routeOf(x.hash) : ""}`;
  } catch { return "[url]"; }
}

// A quoted part of an error message is often a piece of your data ("Unexpected token 'm', "milk, eggs" is not
// valid JSON"). Short code-like names stay ('title' in "reading 'title'"); anything else becomes "…".
const QUOTED = /(^|[\s(:,=])(["'`“‘])([^"'`“”‘’\n]*)(["'`”’])(?=$|[\s),.:;!?])/g;
/** Error text with addresses cut down, quoted data removed and a length cap. */
export function scrubText(s, max = 300) {
  if (s == null) return s;
  const t = String(s)
    .replace(/\b(?:https?:\/\/|data:|blob:)[^\s"'<>)]+/gi, m => scrubUrl(m))
    .replace(QUOTED, (all, pre, open, body, close) => /^[\w$.-]{0,40}$/.test(body) ? all : `${pre}${open}…${close}`);
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** A Sentry breadcrumb, cut to what helps debugging, or null to drop it (console lines, taps and typing). */
export function scrubCrumb(b) {
  if (!b) return null;
  const cat = String(b.category || "");
  if (cat === "console" || cat.startsWith("ui.")) return null;
  const out = { timestamp: b.timestamp, category: cat, type: b.type, level: b.level };
  const d = b.data || {};
  if (cat === "navigation") out.data = { from: scrubUrl(d.from), to: scrubUrl(d.to) };
  else if (cat === "fetch" || cat === "xhr") out.data = { method: d.method, url: scrubUrl(d.url), status_code: d.status_code };
  if (b.message) out.message = scrubText(b.message, 200);
  return out;
}

const CONTEXTS = new Set(["browser", "os", "device", "app", "culture", "runtime", "trace", "rb"]);
/** A Sentry event, with anything that could hold your data removed. Changes and returns it. */
export function scrubEvent(e) {
  if (!e) return e;
  if (e.request) {
    const ua = e.request.headers?.["User-Agent"];
    e.request = { url: scrubUrl(e.request.url), ...(ua ? { headers: { "User-Agent": ua } } : {}) };
  }
  if (e.message) e.message = scrubText(e.message);
  if (e.logentry) e.logentry = { message: scrubText(e.logentry.message) };
  for (const x of e.exception?.values || []) {
    if (x.value) x.value = scrubText(x.value);
    for (const f of x.stacktrace?.frames || []) {
      if (f.abs_path) f.abs_path = scrubUrl(f.abs_path);
      if (f.filename) f.filename = scrubUrl(f.filename);
      delete f.vars;
    }
  }
  if (e.breadcrumbs) e.breadcrumbs = e.breadcrumbs.map(scrubCrumb).filter(Boolean);
  if (e.transaction) e.transaction = scrubUrl(e.transaction);
  if (e.culprit) e.culprit = scrubText(e.culprit, 200);
  if (e.contexts) for (const k of Object.keys(e.contexts)) if (!CONTEXTS.has(k)) delete e.contexts[k];
  if (e.user) e.user = e.user.id ? { id: e.user.id } : {};
  delete e.extra;
  delete e.server_name;
  return e;
}
