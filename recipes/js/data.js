// Official data from your Worker: BLS grocery prices (monthly) and USDA nutrition lookups for
// ingredients the built-in table doesn't know. Everything is cached on the phone, so the app keeps
// working offline and if the government sites are down.
import * as store from "./store.js";

const PRICES_KEY = "recipebox.blsprices";
const FDC_KEY = "recipebox.fdc";
let version = 0;

const read = k => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const dataVersion = () => version;
function changed() { version++; window.dispatchEvent(new CustomEvent("rb:data")); }

function worker() { return (store.settings().proxy || "").replace(/\/+$/, ""); }
function headers() { const k = store.settings().scanKey; return k ? { "X-App-Key": k } : {}; }

// ---------- Prices (BLS Average Price Data) ----------
// Series → the app's ingredient, in the basis the app prices it by (l = per lb, p = per package).
const LB = 453.592;
export const BLS_MAP = {
  APU0000708111: [["eggs", "p", v => v]],                       // per dozen = one carton
  APU0000703112: [["ground beef", "l", v => v]],
  APU0000FF1101: [["chicken breast", "l", v => v]],
  APU0000706111: [["whole chicken", "l", v => v]],
  APU0000709112: [["milk", "p", v => v / 2]],                     // per gallon → half-gallon carton
  APU0000702111: [["bread", "l", v => v]],
  APU0000701312: [["rice", "l", v => v]],
  APU0000701322: [["pasta", "l", v => v], ["orzo", "l", v => v]],
  APU0000FS1101: [["butter", "l", v => v]],
  APU0000710212: [["cheddar", "l", v => v]],
  APU0000704111: [["bacon", "l", v => v]],
  APU0000712112: [["potato", "l", v => v]],
  APU0000711211: [["banana", "l", v => v]],
  APU0000701111: [["flour", "l", v => v]],
  APU0000715211: [["sugar", "l", v => v]],
  APU0000712311: [["tomato", "l", v => v]],
  APU0000712211: [["lettuce", "l", v => v]],
  APU0000711311: [["orange", "l", v => v]],
  APU0000703613: [["steak", "l", v => v]],
  APU0000704211: [["pork chops", "l", v => v]],
  APU0000716141: [["peanut butter", "l", v => v]],
  APU0000712404: [["onion", "l", v => v], ["red onion", "l", v => v]],
  APU0000712405: [["green onion", "l", v => v]],
  APU0000712406: [["bell pepper", "l", v => v]],
  APU0000712403: [["carrot", "l", v => v]],
  APU0000712409: [["cucumber", "l", v => v]],
  APU0000711415: [["strawberries", "l", v => v * 16 / 12]],      // per 12 oz → per lb
  APU0000711412: [["lemon", "l", v => v]],
  APU0000711111: [["apple", "l", v => v]],
  APU0000703432: [["beef chuck", "l", v => v]],
  APU0000704311: [["ham", "l", v => v]]
};

let priceCache = read(PRICES_KEY);

// food name → { price, basis, period } from the latest BLS data (U.S. city average)
export function officialPrice(name) {
  return priceCache?.map?.[name] || null;
}
export const officialInfo = () => priceCache ? { period: priceCache.period, fetched: priceCache.fetched, count: Object.keys(priceCache.map || {}).length } : null;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function refreshPrices(force = false) {
  const w = worker();
  if (!w) return null;
  if (!force && priceCache && Date.now() - priceCache.fetched < 3 * 86400000) return priceCache;
  try {
    const res = await fetch(`${w}/prices`, { headers: headers() });
    if (!res.ok) return priceCache;
    const data = await res.json();
    const map = {};
    let latest = null;
    for (const [id, rec] of Object.entries(data.items || {})) {
      for (const [name, basis, conv] of BLS_MAP[id] || []) {
        map[name] = { price: Math.round(conv(rec.value) * 100) / 100, basis, period: `${MONTHS[rec.month - 1]} ${rec.year}` };
      }
      if (!latest || rec.year * 12 + rec.month > latest.year * 12 + latest.month) latest = rec;
    }
    priceCache = { map, fetched: Date.now(), period: latest ? `${MONTHS[latest.month - 1]} ${latest.year}` : "" };
    write(PRICES_KEY, priceCache);
    changed();
  } catch {}
  return priceCache;
}

// ---------- Nutrition (USDA FoodData Central) ----------
let fdcCache = read(FDC_KEY) || {};
const queue = new Set(), inflight = new Set();
let timer = null;

// A food-like object (same shape as the built-in table) for an ingredient looked up at USDA.
export function usdaFood(key) {
  const hit = fdcCache[key];
  if (!hit || !hit.match) return null;
  const m = hit.match;
  return {
    name: key, aliases: [key], aisle: "other", kind: "F",
    nu: m.nu, gCup: m.gCup, gEach: m.gEach, pkg: null, liquid: false,
    usda: { fdcId: m.fdcId, description: m.description }
  };
}

// Called when an ingredient isn't in the built-in table: look it up once (in the background).
export function noteUnknown(key) {
  if (!key || key.length < 3 || key in fdcCache || inflight.has(key) || !worker()) return;
  queue.add(key);
  clearTimeout(timer);
  timer = setTimeout(drain, 600);
}

async function drain() {
  const batch = [...queue].slice(0, 12);
  batch.forEach(k => { queue.delete(k); inflight.add(k); });
  let got = 0;
  for (const k of batch) {
    try {
      const res = await fetch(`${worker()}/nutrition?q=${encodeURIComponent(k)}`, { headers: headers() });
      if (res.ok) { fdcCache[k] = await res.json(); got++; }
      else if (res.status === 400) fdcCache[k] = { match: null };
    } catch {}
    inflight.delete(k);
  }
  if (got) { write(FDC_KEY, fdcCache); changed(); }
  if (queue.size) timer = setTimeout(drain, 1000);
}
