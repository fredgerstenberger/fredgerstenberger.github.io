// Small shared helpers.

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---- Dates / weeks (weeks run Monday → Sunday) ----
const DAY = 86400000;

export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// A week is the 7 days after your shopping & prep day (Settings → Cooking & planning; Sunday by default,
// so weeks run Monday–Sunday). A week's key is the date of its first day.
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]; // Date.getDay() order
let START = 1; // the weekday weeks start on (0 = Sunday)
/** Set the shopping & prep day (0 = Sunday … 6 = Saturday); the week starts the day after. */
export function setPrepDay(dow) { START = ((Math.trunc(Number(dow)) || 0) % 7 + 8) % 7; }
export const prepDay = () => (START + 6) % 7;
/** The week's days in order, as slot day names: ["mon", …, "sun"] by default. */
export const weekDays = () => Array.from({ length: 7 }, (_, i) => WEEKDAYS[(START + i) % 7]);
/** The date of a day ("tue") in the week with this key (whichever weekday the key falls on). */
export function dayDate(key, day) {
  const s = parseWeekKey(key);
  return addDays(s, (WEEKDAYS.indexOf(day) - s.getDay() + 7) % 7);
}

export function startOfWeek(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - (x.getDay() - START + 7) % 7);
  return x;
}

export function weekKey(date) {
  const m = startOfWeek(date);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

export function parseWeekKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// From your shopping & prep day on, we look at the week that starts tomorrow.
export function planningWeekKey(now = new Date()) {
  const d = startOfDay(now);
  if (d.getDay() === prepDay()) return weekKey(addDays(d, 1));
  return weekKey(d);
}

// "This week" / "Next week" / "Last week" for a week key, relative to today.
export function weekRelation(key, now = new Date()) {
  const diff = Math.round((parseWeekKey(key) - startOfWeek(now)) / (7 * DAY));
  return { 0: "This week", 1: "Next week", "-1": "Last week" }[diff] || "";
}

// The shop & prep day (the day before the week), said honestly relative to today.
export function prepLabel(key, now = new Date()) {
  const prep = addDays(parseWeekKey(key), -1), today = startOfDay(now);
  const date = fmtDate(prep, { weekday: "short", month: "short", day: "numeric" });
  if (prep.getTime() === today.getTime()) return "Shop & prep: today";
  return prep < today ? `Shop & prep was ${date}` : `Shop & prep: ${date}`;
}

// Days of a week that are already over (you can't plan new meals there).
export function isPastDay(key, dayIndex, now = new Date()) {
  return addDays(parseWeekKey(key), dayIndex) < startOfDay(now);
}

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
export const MEALS = ["breakfast", "lunch", "dinner"];

export function fmtDate(d, opts = { month: "short", day: "numeric" }) {
  return d.toLocaleDateString(undefined, opts);
}

export function fmtMinutes(min) {
  if (!min) return "";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export function plural(n, word, pluralWord) {
  return `${n} ${n === 1 ? word : (pluralWord || word + "s")}`;
}
