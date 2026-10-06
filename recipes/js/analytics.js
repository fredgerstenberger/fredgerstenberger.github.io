// Usage stats (PostHog): is the weekly loop working (recipes in, a week planned, a list shopped, meals cooked,
// the next week planned)? A short, fixed list of events about outcomes: never taps, screens or anything you
// typed. track() checks every event against the list below and drops whatever isn't on it, so recipe names,
// ingredients, list items, notes, links, nutrition and prices can't be sent by mistake. PostHog loads in the
// background once the page is idle; until then events wait in a short queue. Nothing waits on it, and if it
// can't load, or sharing is off (Settings), nothing is sent and nothing else changes.
import * as store from "./store.js";
import * as house from "./household.js";
import { enabled as syncEnabled } from "./sync.js";
import { config, anonId, appContext, scrubUrl } from "./telemetry.js";
import { weekKey, parseWeekKey, addDays, startOfDay, planningWeekKey, weekRelation, dayDate, MEALS } from "./util.js";

const COUNT = "count", BOOL = "bool";
const WEEK = ["this", "next", "other"];
const KIND = ["recipe", "store_bought"];

/** Every event the app can send, with the only properties each may carry. */
export const EVENTS = {
  app_opened: { resumed: BOOL },
  household_created: {},
  household_joined: { method: ["link", "code"] },
  recipe_added: { kind: KIND },
  recipe_imported: { import_method: ["link", "text", "photo"], read_by_ai: BOOL },
  meal_plan_created: { week: WEEK, kind: KIND },
  grocery_list_generated: { number_of_unique_items: COUNT, number_of_recipes_contributing: COUNT, pantry_items_skipped: COUNT },
  shopping_started: { number_of_items: COUNT },
  meal_completed: { meal_type: MEALS, is_batch: BOOL },
  week_completed: { meals_planned: COUNT, meals_completed: COUNT, shopped: BOOL },
  next_week_planned: { week: WEEK },
  paprika_import_started: {},
  paprika_import_completed: { recipe_count: COUNT, imported_count: COUNT, skipped_count: COUNT, duplicate_count: COUNT },
  paprika_import_failed: { reason: ["not_zip", "empty", "unreadable", "error", "storage_full"], recipe_count: COUNT, imported_count: COUNT, skipped_count: COUNT, duplicate_count: COUNT }
};

/** An event's properties, keeping only what the list allows (counts, true/false, fixed words), or null. */
export function clean(event, props = {}) {
  const spec = EVENTS[event];
  if (!spec) return null;
  const out = {};
  for (const [k, rule] of Object.entries(spec)) {
    const v = props[k];
    if (rule === COUNT) { if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = Math.round(v); }
    else if (rule === BOOL) { if (typeof v === "boolean") out[k] = v; }
    else if (rule.includes(v)) out[k] = v;
  }
  return out;
}

// PostHog adds the page address and referrer itself: the address loses its query and the screen's details
// (#/add?url=… is a recipe link), the referrer goes. Anything not on the list above never leaves.
const PH_OK = new Set(["$identify", "$create_alias"]);
export function scrubCapture(ev) {
  if (!ev || !(ev.event in EVENTS || PH_OK.has(ev.event))) return null;
  for (const bag of [ev.properties, ev.$set, ev.$set_once]) {
    if (!bag) continue;
    for (const k of Object.keys(bag)) {
      const v = bag[k];
      if (/referr|utm_|gclid|fbclid|campaign/i.test(k) || (v && typeof v === "object")) delete bag[k];
      else if (/url|pathname|href/i.test(k) && typeof v === "string") bag[k] = scrubUrl(v);
    }
  }
  return ev;
}

let ph = null, started = false;
const queue = []; // [event, props, time] until PostHog loads

/** Events waiting for PostHog to load, as [event, properties] (for tests). */
export const queued = () => queue.map(([e, p]) => [e, p]);

/** Send an event (never throws, never waits). Returns whether it was sent or queued. */
export function track(event, props = {}) {
  try {
    const p = clean(event, props);
    if (!p || !started || !config()?.key) return false;
    const all = { ...p, ...appContext(), sync_enabled: syncEnabled() };
    if (ph) ph.capture(event, all);
    else if (queue.length < 50) queue.push([event, all, new Date()]);
    else return false;
    return true;
  } catch { return false; }
}

// ---- Once only ----
// Events that happen once per week or per meal remember that they were sent, on this device (not synced: a
// partner's phone counts its own person). Kept 120 days.
const SENT = "rb.sent";
function sentMap() { try { return JSON.parse(localStorage.getItem(SENT)) || {}; } catch { return {}; } }
export const wasSent = key => !!sentMap()[key];
function markSent(key) {
  const m = sentMap(), old = Date.now() - 120 * 86400000;
  for (const k of Object.keys(m)) if (m[k] < old) delete m[k];
  m[key] = Date.now();
  try { localStorage.setItem(SENT, JSON.stringify(m)); } catch {}
}
/** track(), once per key on this device. */
export function trackOnce(key, event, props = {}) {
  if (wasSent(key)) return false;
  const ok = track(event, props);
  if (ok) markSent(key);
  return ok;
}

// ---- The weekly loop ----

const rel = key => ({ "This week": "this", "Next week": "next" })[weekRelation(key)] || "other";
const plannedMeals = key => (store.week(key).meals || []).filter(m => store.recipe(m.rid));

/** Before adding a meal to a week: call with the week, then mealPlanned(...) after saving. */
export const weekIsEmpty = key => !plannedMeals(key).length;

/** A meal was added to a week. The week's first: meal_plan_created, and next_week_planned if the week before had meals too. */
export function mealPlanned(key, rid, wasEmpty) {
  if (!wasEmpty) return;
  const week = rel(key);
  trackOnce(`plan:${key}`, "meal_plan_created", { week, kind: store.recipe(rid)?.ready ? "store_bought" : "recipe" });
  if (plannedMeals(weekKey(addDays(parseWeekKey(key), -7))).length) trackOnce(`next:${key}`, "next_week_planned", { week });
}

/** The grocery list was shown with what's left after the pantry (sec from sectionize). Once per week. */
export function listShown(key, sec) {
  const items = sec.buy.length + sec.ask.length;
  if (!items && !sec.have.length) return;
  const recipes = new Set(plannedMeals(key).map(m => m.rid)).size;
  if (!recipes) return;
  trackOnce(`list:${key}`, "grocery_list_generated", { number_of_unique_items: items, number_of_recipes_contributing: recipes, pantry_items_skipped: sec.have.length });
}

const slotTime = (key, slot) => { const [d, m] = slot.split("-"); return dayDate(key, d).getTime() + MEALS.indexOf(m); };

/**
 * The planned batch that cooking this recipe now most likely completes: this week's or the week being planned,
 * not already marked, cooked within 2 days of today, nearest first. null if none (then there's nothing to ask).
 */
export function plannedBatch(rid, now = new Date()) {
  const today = startOfDay(now).getTime();
  let best = null;
  for (const key of new Set([weekKey(now), planningWeekKey(now)])) {
    for (const m of plannedMeals(key)) {
      if (m.rid !== rid || !m.slots?.length || wasSent(`made:${m.id}`)) continue;
      const slot = [...m.slots].sort((a, b) => slotTime(key, a) - slotTime(key, b))[0];
      const dist = Math.abs(dayDate(key, slot.split("-")[0]).getTime() - today) / 86400000;
      if (dist <= 2 && (!best || dist < best.dist)) best = { key, meal: m, slot, dist };
    }
  }
  return best;
}

/** "Done cooking? Yes": the batch from plannedBatch() is made. */
export function mealMade(b) {
  trackOnce(`made:${b.meal.id}`, "meal_completed", { meal_type: b.slot.split("-")[1], is_batch: b.meal.slots.length > 1 });
}

/** Last week ended: week_completed once, if anything was planned. */
export function checkWeekEnded(now = new Date()) {
  const key = weekKey(addDays(now, -7));
  const meals = plannedMeals(key);
  if (!meals.length) return;
  const g = store.get().grocery?.[key];
  const shopped = Object.values(g?.checked || {}).some(Boolean) || (g?.extras || []).some(e => e.checked) || house.inWeek(key).some(h => h.checked);
  trackOnce(`week:${key}`, "week_completed", { meals_planned: meals.length, meals_completed: meals.filter(m => wasSent(`made:${m.id}`)).length, shopped });
}

/** True when usage stats are on and configured (the "Done cooking?" question only asks then). */
export const analyticsOn = () => started && !!config()?.key;

// ---- Start ----

/** app_opened now and when coming back after 30+ minutes away; checks whether last week ended. */
export function startAnalytics() {
  try {
    const c = config();
    if (started || !c?.key) return;
    started = true;
    let hiddenAt = 0;
    const opened = resumed => { track("app_opened", { resumed }); checkWeekEnded(); };
    opened(false);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30 * 60000) { hiddenAt = 0; opened(true); }
    });
    const load = () => import("../vendor/posthog.min.js").then(({ default: posthog }) => {
      if (!started) return;
      posthog.init(c.key, {
        api_host: c.host,
        persistence: "localStorage",
        person_profiles: "identified_only",
        bootstrap: { distinctID: anonId() },
        autocapture: false, capture_pageview: false, capture_pageleave: false, rageclick: false,
        capture_dead_clicks: false, capture_exceptions: false, capture_performance: false,
        disable_session_recording: true, disable_surveys: true, disable_product_tours: true,
        disable_conversations: true, disable_web_experiments: true, advanced_disable_flags: true,
        disable_external_dependency_loading: true, save_referrer: false, save_campaign_params: false,
        respect_dnt: true, mask_all_text: true, mask_all_element_attributes: true,
        before_send: scrubCapture
      });
      ph = posthog;
      for (const [e, p, t] of queue.splice(0)) ph.capture(e, p, { timestamp: t });
    }).catch(() => { queue.length = 0; started = false; }); // couldn't load: count nothing, ask nothing
    (window.requestIdleCallback || (f => setTimeout(f, 1500)))(load, { timeout: 4000 });
  } catch {}
}

/** Settings → sharing turned off: stop now and forget this device's PostHog ID. */
export function stopAnalytics() {
  try { ph?.opt_out_capturing(); ph?.reset(); } catch {}
  try { for (const k of Object.keys(localStorage)) if (k.includes("ph_")) localStorage.removeItem(k); } catch {}
  ph = null; started = false; queue.length = 0;
}
