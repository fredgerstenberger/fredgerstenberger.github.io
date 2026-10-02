import { ldJsonBlocks, recipeFromLdTexts, finishRecipe, htmlTitle, pageTextLite } from "../js/recipe-data.js";

// Recipe Box helper — a small Cloudflare Worker with two jobs:
//
//   1. GET  /recipe?url=https://some-recipe-site.com/recipe[&ai=1&model=…]
//      Reads a recipe page and returns just the recipe as JSON (from the page's structured data, or
//      with AI when there is none). It never returns the page itself, so it isn't a general proxy.
//      Results are cached for a week. (The old GET /?url= page proxy is retired.)
//
//   2. POST /scan   { images: ["data:image/jpeg;base64,…"], model?: "@cf/…" }
//      POST /read   { text: "…page text…", model?: "@cf/…" }  (recipe pages with no structured data)
//
//   3. POST /sync   { box: "<secret code>", since: 0, changes: [{ k, u, v }] }
//      Keeps your recipes, plans, lists and settings in sync between devices. Each recipe box
//      (identified by its secret code) is stored in its own Durable Object (built-in database).
//
//      POST /invite         { box }   → one-time invite code (expires in 24 h)
//      POST /invite/redeem  { token } → the box's secret, once; the invite is deleted
//
//   4. GET /prices            Official average grocery prices from the U.S. Bureau of Labor Statistics,
//                             refreshed monthly (cron trigger) and cached.
//      GET /nutrition?q=name  USDA FoodData Central nutrition + portion weights for an ingredient
//                             the app doesn't know; each ingredient is looked up once and cached.
//
// Optional secrets (Worker → Settings → Variables and Secrets), never put keys in this file:
//   FDC_KEY  free key from https://api.data.gov/signup (without it, USDA's very limited DEMO_KEY is used)
//   BLS_KEY  free key from https://data.bls.gov/registrationEngine/ (optional; works without one)
//      Reads a cookbook photo with an open-weight vision model on Cloudflare Workers AI
//      and returns the recipe as JSON. Needs a Workers AI binding named "AI"
//      (Worker → Settings → Bindings → Add → Workers AI → name it AI).
//
// Optional: add a secret named APP_KEY (Worker → Settings → Variables and Secrets) and
// enter the same value in the app's Settings, so only your app can use your AI allowance.

// Only your app may use this Worker. Add more origins if you host the app elsewhere.
const ALLOWED_ORIGINS = [
  "https://fredgerstenberger.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
];

// Vision models the app may ask for. The first one is the default.
const MODELS = [
  "@cf/qwen/qwen3.8-27b",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/google/gemma-3-12b-it",
  "@cf/meta/llama-3.2-11b-vision-instruct"
];

// Shown at /status so you can confirm which version Cloudflare is running.
const VERSION = "2026-10-05";

const MAX_PAGE_BYTES = 5_000_000;
const MAX_SCAN_BYTES = 8_000_000; // request body: up to a few resized photos

const PROMPT = `You are reading a photo of a recipe, usually a cookbook page.
Return ONLY a JSON object, no other text, with exactly these keys:
{
  "title": string,
  "servings": number or null,
  "prepMin": number or null,
  "cookMin": number or null,
  "totalMin": number or null,
  "ingredients": [string],
  "steps": [string],
  "notes": string
}
Rules:
- Copy ingredient lines exactly as printed, one per array item, keeping quantities and units (e.g. "1 1/2 cups all-purpose flour, sifted"). Write fractions like 1/2, not ½.
- If the ingredients are grouped under sub-headings (e.g. "For the sauce"), add the heading as its own item starting with "# ".
- Steps: one item per step, without the step number. Join lines that wrap mid-sentence.
- Times are in minutes. Servings is a single number (use the first number of a range).
- If there are several recipes, return the main (largest) one. If several photos are pages of the same recipe, combine them in order.
- Do not invent anything that isn't on the page. Use null or "" when something isn't shown.
- "notes" is for headnotes, tips or variations printed with the recipe (short).`;

const READ_PROMPT = PROMPT.replace("You are reading a photo of a recipe, usually a cookbook page.",
  "You are reading the text of a recipe web page (with menus, ads and comments mixed in). Ignore everything that isn't the recipe.")
  .replace("If several photos are pages of the same recipe, combine them in order.", "");

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type, X-App-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

// Refuse anything that isn't an ordinary public web address: private/reserved IPv4 ranges, any IPv6
// literal, numeric tricks like 2130706433 or 0x7f.0.0.1, and local-only names.
function isPrivateHost(host) {
  const h = String(host || "").toLowerCase().replace(/\.+$/, "");
  if (!h || h.startsWith("[") || h.includes(":")) return true;                 // IPv6 literals: recipes never need them
  if (/(^|\.)(localhost|local|internal|intranet|lan|home\.arpa|corp)$/.test(h)) return true;
  const parts = h.split(".");
  if (parts.every(x => /^(0x[0-9a-f]*|\d+)$/.test(x))) {
    // Numeric host: only plain dotted-decimal public IPv4 is allowed.
    if (parts.length !== 4 || parts.some(x => !/^(0|[1-9]\d{0,2})$/.test(x) || +x > 255)) return true;
    const [a, b] = parts.map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  return false;
}

function allowedTarget(u) {
  return /^https?:$/.test(u.protocol) && !u.username && !u.password && !isPrivateHost(u.hostname);
}

// Light rate limit for the link proxy: per address, per Worker instance (each Cloudflare location runs
// its own, so this only stops bursts; APP_KEY is what actually locks the Worker to your app).
const RATE = { max: 30, windowMs: 60_000 };
const hits = new Map();
function rateLimited(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "?";
  const now = Date.now();
  let e = hits.get(ip);
  if (!e || now > e.reset) { e = { n: 0, reset: now + RATE.windowMs }; hits.set(ip, e); }
  if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  return ++e.n > RATE.max;
}

// ---------- 1. Recipe page proxy ----------
// Download a public web page, following redirects ourselves so every hop gets the address check.
// Returns { html, url } or { error, status }.
async function fetchPublicPage(url) {
  try {
    let res;
    for (let hop = 0; ; hop++) {
      res = await fetch(url.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        },
        redirect: "manual",
        cf: { cacheTtl: 3600, cacheEverything: true }
      });
      const loc = res.status >= 300 && res.status < 400 && res.headers.get("Location");
      if (!loc) break;
      if (hop >= 5) return { error: "Too many redirects", status: 508 };
      try { url = new URL(loc, url); } catch { return { error: "Bad redirect", status: 502 }; }
      if (!allowedTarget(url)) return { error: "URL not allowed", status: 400 };
    }
    if (!res.ok) return { error: `The site answered HTTP ${res.status}`, status: 502 };
    if (Number(res.headers.get("Content-Length")) > MAX_PAGE_BYTES) return { error: "Page too large", status: 413 };
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_PAGE_BYTES) return { error: "Page too large", status: 413 };
    return { html: new TextDecoder().decode(body), url };
  } catch (e) {
    return { error: `Couldn't download the page: ${e.message}`, status: 502 };
  }
}

const RECIPE_TTL = 7 * 24 * 3600 * 1000;

// GET /recipe?url=…[&ai=1&model=…] → { recipe, via: "data" | "ai" }
// The Worker reads the page and returns only the recipe, never the page itself, so it's no use as a
// general-purpose proxy. Results are cached for a week and shared, so a popular recipe is fetched once.
async function recipe(request, env, headers) {
  if (env.APP_KEY && request.headers.get("X-App-Key") !== env.APP_KEY) return json({ error: "Wrong or missing app key. Enter the same key in Recipe Box → Settings." }, 401, headers);
  if (rateLimited(request)) return json({ error: "Too many requests. Try again in a minute." }, 429, headers);
  const params = new URL(request.url).searchParams;
  let url;
  try { url = new URL(params.get("url")); } catch { return json({ error: "Missing or invalid url" }, 400, headers); }
  if (!allowedTarget(url)) return json({ error: "That address isn't allowed." }, 400, headers);
  url.hash = "";
  const wantAI = params.get("ai") === "1" && !!env.AI;
  const model = MODELS.includes(params.get("model")) ? params.get("model") : MODELS[0];

  const key = "recipe:" + url.href;
  if (env.CACHE) {
    const hit = (await cacheOp(env, { get: [key] }).catch(() => ({})))[key];
    if (hit && Date.now() - hit.at < RECIPE_TTL && (hit.via === "data" || wantAI)) return json({ recipe: hit.recipe, via: hit.via, cached: true }, 200, headers);
  }

  const page = await fetchPublicPage(url);
  if (page.error) return json({ error: page.error }, page.status, headers);
  let out = null;
  const r = recipeFromLdTexts(ldJsonBlocks(page.html));
  if (r && r.ingredients.length) out = { recipe: finishRecipe(r, url.href, htmlTitle(page.html)), via: "data" };
  else if (wantAI) {
    const textForAI = pageTextLite(page.html).slice(0, 40000);
    if (textForAI.length >= 50) {
      try {
        const got = extractJSON(answerText(await runModel(env, model, [], textForAI)));
        if (got && Array.isArray(got.ingredients) && got.ingredients.length) {
          out = { recipe: { ...got, title: got.title || htmlTitle(page.html), url: url.href, site: url.hostname.replace(/^www\./, "") }, via: "ai", model };
        }
      } catch (e) {
        const msg = String(e.message || e);
        return json({ error: `AI couldn't read the page: ${msg}${/limit|quota|neuron|429/i.test(msg) ? ". You may have used up today's free Workers AI allowance." : ""}` }, 502, headers);
      }
    }
  }
  if (!out) return json({ error: "Downloaded the page but couldn't find a recipe on it.", code: "no_recipe", ai: !!env.AI }, 422, headers);
  if (env.CACHE) await cacheOp(env, { put: { [key]: { ...out, at: Date.now() } } }).catch(() => {});
  return json(out, 200, headers);
}

// ---------- 2. Photo scan ----------

// Workers AI models don't all answer in the same shape; pull the text out of whichever one we got.
function answerText(out) {
  if (out == null) return "";
  if (typeof out === "string") return out;
  if (typeof out.response === "string") return out.response;
  if (out.response && typeof out.response === "object") return JSON.stringify(out.response);
  const c = out.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map(p => p.text || "").join("");
  if (out.result) return answerText(out.result);
  return JSON.stringify(out);
}

function extractJSON(text) {
  const t = String(text).replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

function dataUrlBytes(dataUrl) {
  const b64 = dataUrl.split(",")[1] || "";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function runModel(env, model, images, text) {
  // Chat format with OpenAI-style image parts — used by the current vision models.
  const chat = {
    messages: [{
      role: "user",
      content: text != null
        ? `${READ_PROMPT}\n\n--- PAGE TEXT ---\n${text}`
        : [
          { type: "text", text: PROMPT },
          ...images.map(url => ({ type: "image_url", image_url: { url } }))
        ]
    }],
    max_tokens: 4096,
    temperature: 0.1
  };
  try {
    return await env.AI.run(model, chat);
  } catch (e) {
    // Older Llama vision format: one image as raw bytes plus a prompt.
    if (model.includes("llama-3.2") && images.length) {
      return await env.AI.run(model, { prompt: PROMPT, image: [...dataUrlBytes(images[0])], max_tokens: 4096 });
    }
    throw e;
  }
}

async function scan(request, env, headers) {
  if (!env.AI) {
    return json({ error: "Workers AI isn't connected. In the Worker's Settings → Bindings, add a Workers AI binding named AI, then deploy again." }, 500, headers);
  }
  if (env.APP_KEY && request.headers.get("X-App-Key") !== env.APP_KEY) {
    return json({ error: "Wrong or missing app key. Enter the same key in Recipe Box → Settings." }, 401, headers);
  }
  const size = Number(request.headers.get("Content-Length") || 0);
  if (size > MAX_SCAN_BYTES) return json({ error: "Photos too large. Try one page at a time." }, 413, headers);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400, headers); }
  const isRead = new URL(request.url).pathname.replace(/\/+$/, "") === "/read";
  const images = isRead ? [] : (body.images || []).filter(s => typeof s === "string" && s.startsWith("data:image/")).slice(0, 4);
  const pageText = isRead ? String(body.text || "").slice(0, 40000) : null;
  if (isRead ? pageText.trim().length < 50 : !images.length) return json({ error: isRead ? "No page text received." : "No photo received." }, 400, headers);
  const model = MODELS.includes(body.model) ? body.model : MODELS[0];

  let out;
  try {
    out = await runModel(env, model, images, pageText);
  } catch (e) {
    const msg = String(e.message || e);
    const hint = /agree/i.test(msg) && model.includes("llama")
      ? " Meta requires a one-time license agreement for this model; pick a different model in Settings."
      : /limit|quota|neuron|429/i.test(msg) ? " You may have used up today's free Workers AI allowance; try again tomorrow." : "";
    return json({ error: `The model couldn't read the photo: ${msg}.${hint}` }, 502, headers);
  }

  const text = answerText(out);
  const recipe = extractJSON(text);
  if (!recipe) return json({ model, recipe: null, text }, 200, headers); // app falls back to its text parser
  return json({ model, recipe }, 200, headers);
}

// ---------- 4. Official data: BLS prices + USDA nutrition ----------

// BLS Average Price series (U.S. city average). Item codes verified against BLS/FRED.
const BLS_SERIES = {
  APU0000708111: "eggs (dozen)", APU0000703112: "ground beef (lb)", APU0000FF1101: "chicken breast, boneless (lb)",
  APU0000706111: "chicken, whole (lb)", APU0000709112: "milk, whole (gallon)", APU0000702111: "bread, white (lb)",
  APU0000701312: "rice, white (lb)", APU0000701322: "spaghetti & macaroni (lb)", APU0000FS1101: "butter (lb)",
  APU0000710212: "cheddar (lb)", APU0000704111: "bacon (lb)", APU0000712112: "potatoes (lb)",
  APU0000711211: "bananas (lb)", APU0000701111: "flour (lb)", APU0000715211: "sugar (lb)",
  APU0000712311: "tomatoes (lb)", APU0000712211: "lettuce, iceberg (lb)", APU0000711311: "oranges (lb)",
  APU0000703613: "sirloin steak (lb)", APU0000704211: "pork chops (lb)", APU0000716141: "peanut butter (lb)",
  APU0000712404: "onions, yellow (lb)", APU0000712405: "green onions (lb)", APU0000712406: "sweet peppers (lb)",
  APU0000712403: "carrots (lb)", APU0000712409: "cucumbers (lb)", APU0000711415: "strawberries (12 oz)",
  APU0000711412: "lemons (lb)", APU0000711111: "apples (lb)", APU0000703432: "beef for stew (lb)",
  APU0000704311: "ham (lb)"
};

async function cacheOp(env, body) {
  const stub = env.CACHE.get(env.CACHE.idFromName("shared-data"));
  const res = await stub.fetch("https://cache/op", { method: "POST", body: JSON.stringify(body) });
  return res.json();
}

async function refreshPrices(env) {
  const ids = Object.keys(BLS_SERIES);
  const year = new Date().getUTCFullYear();
  const items = {};
  const per = env.BLS_KEY ? 50 : 25;
  for (let i = 0; i < ids.length; i += per) {
    const body = { seriesid: ids.slice(i, i + per), startyear: String(year - 1), endyear: String(year) };
    if (env.BLS_KEY) body.registrationkey = env.BLS_KEY;
    const res = await fetch(`https://api.bls.gov/publicAPI/${env.BLS_KEY ? "v2" : "v1"}/timeseries/data/`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const data = await res.json();
    for (const s of data?.Results?.series || []) {
      const latest = (s.data || []).find(d => /^M\d\d$/.test(d.period) && d.period !== "M13" && !isNaN(parseFloat(d.value)));
      if (latest) items[s.seriesID] = { value: parseFloat(latest.value), year: +latest.year, month: +latest.period.slice(1) };
    }
  }
  if (!Object.keys(items).length) throw new Error("BLS returned no prices");
  const record = { updated: Date.now(), items };
  await cacheOp(env, { put: { "bls:prices": record } });
  return record;
}

async function prices(env, headers) {
  if (!env.CACHE) return json({ error: "Data cache isn't set up yet. Redeploy the Worker from GitHub." }, 500, headers);
  let rec = (await cacheOp(env, { get: ["bls:prices"] }))["bls:prices"];
  // Normally the monthly cron keeps this fresh; refresh here too if it's missing or over 40 days old.
  if (!rec || Date.now() - rec.updated > 40 * 86400000) {
    try { rec = await refreshPrices(env); } catch (e) { if (!rec) return json({ error: `Couldn't get BLS prices: ${e.message}` }, 502, headers); }
  }
  return json({ source: "U.S. Bureau of Labor Statistics, Average Price Data (U.S. city average)", ...rec }, 200, headers);
}

const NUTRIENTS = { kcal: [1008, 2047, 2048], protein: [1003], fat: [1004], carbs: [1005], fiber: [1079] };

function pickNutrients(list) {
  const out = {};
  for (const [k, ids] of Object.entries(NUTRIENTS)) {
    for (const id of ids) {
      const n = (list || []).find(x => (x.nutrientId ?? x.nutrient?.id) === id);
      const v = n ? (n.value ?? n.amount) : undefined;
      if (v != null) { out[k] = +v; break; }
    }
    out[k] ??= 0;
  }
  return out;
}

// Score search results: every query word present, prefer plain raw/whole foods, avoid baby food and restaurant items.
function scoreFood(f, words) {
  const d = (f.description || "").toLowerCase();
  let s = 0;
  for (const w of words) s += d.includes(w) ? 3 : -4;
  if (/\braw\b/.test(d)) s += 2;
  if (/babyfood|baby food|infant|toddler|restaurant|fast food|school lunch|formulated/.test(d)) s -= 10;
  if (f.dataType === "Foundation") s += 1;
  s -= d.split(",").length * 0.3; // simpler descriptions first
  return s;
}

function portions(food) {
  let gCup = null, gEach = null;
  for (const p of food.foodPortions || []) {
    const unit = `${p.measureUnit?.name || ""} ${p.modifier || ""} ${p.portionDescription || ""}`.toLowerCase();
    const amt = p.amount || p.value || 1;
    const g = p.gramWeight / amt;
    if (!g) continue;
    if (!gCup && /\bcup\b/.test(unit)) gCup = g;
    else if (!gCup && /\btbsp\b|tablespoon/.test(unit)) gCup = g * 16;
    else if (!gEach && /medium|large|whole|each|item|fruit|small|slice|piece|clove|link|breast|thigh|egg|bulb|head|stalk|ear|fillet|leaf|sprig/.test(unit)) gEach = g;
  }
  return { gCup: gCup ? Math.round(gCup) : null, gEach: gEach ? Math.round(gEach) : null };
}

async function nutrition(request, env, headers) {
  if (!env.CACHE) return json({ error: "Data cache isn't set up yet. Redeploy the Worker from GitHub." }, 500, headers);
  if (env.APP_KEY && request.headers.get("X-App-Key") !== env.APP_KEY) return json({ error: "Wrong or missing app key." }, 401, headers);
  const q = String(new URL(request.url).searchParams.get("q") || "").toLowerCase().replace(/[^a-z0-9 '%-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 2) return json({ error: "Missing ?q=" }, 400, headers);
  const key = "fdc:" + q;
  const hit = (await cacheOp(env, { get: [key] }))[key];
  if (hit) return json(hit, 200, headers);

  const apiKey = env.FDC_KEY || "DEMO_KEY";
  const base = "https://api.nal.usda.gov/fdc/v1";
  const sres = await fetch(`${base}/foods/search?api_key=${apiKey}&query=${encodeURIComponent(q)}&dataType=${encodeURIComponent("Foundation,SR Legacy")}&pageSize=10`);
  if (!sres.ok) return json({ error: `USDA lookup failed (HTTP ${sres.status}).${sres.status === 429 ? " Add a free FDC_KEY secret for a higher limit." : ""}` }, 502, headers);
  const found = (await sres.json()).foods || [];
  const words = q.split(" ").filter(w => w.length > 2);
  const best = found.map(f => ({ f, s: scoreFood(f, words) })).sort((a, b) => b.s - a.s)[0];
  let result = { q, match: null };
  if (best && best.s > 0) {
    let food = best.f, por = { gCup: null, gEach: null };
    try {
      const dres = await fetch(`${base}/food/${food.fdcId}?api_key=${apiKey}`);
      if (dres.ok) { const detail = await dres.json(); por = portions(detail); if (!food.foodNutrients?.length) food = detail; }
    } catch {}
    result = { q, match: { fdcId: food.fdcId, description: food.description, dataType: food.dataType, nu: pickNutrients(food.foodNutrients), ...por } };
  }
  await cacheOp(env, { put: { [key]: result } });
  return json(result, 200, headers);
}

// Shared cache for official data (one Durable Object for everyone): simple get/put of JSON values.
export class DataCache {
  constructor(state) { this.storage = state.storage; }
  async fetch(request) {
    const body = await request.json();
    const out = {};
    if (body.get) for (const k of body.get) out[k] = (await this.storage.get(k)) ?? null;
    if (body.put) await this.storage.put(body.put);
    // "take": read and delete in one step (one-time invites can't be redeemed twice).
    if (body.take) {
      for (const k of body.take) { out[k] = (await this.storage.get(k)) ?? null; await this.storage.delete(k); }
    }
    return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
  }
}

// ---------- 3b. One-time invites ----------
// A device that's already in the box asks for an invite code. The code works once and expires
// after 24 hours; redeeming it hands the box's secret to the new device and deletes the invite.
const INVITE_TTL = 24 * 3600 * 1000;
const INVITE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I mix-ups

function inviteToken() {
  const b = crypto.getRandomValues(new Uint8Array(10));
  return [...b].map(x => INVITE_ABC[x % INVITE_ABC.length]).join("");
}

async function invite(request, env, headers) {
  if (!env.CACHE) return json({ error: "Data cache isn't set up yet. Redeploy the Worker from GitHub." }, 500, headers);
  if (env.APP_KEY && request.headers.get("X-App-Key") !== env.APP_KEY) return json({ error: "Wrong or missing app key." }, 401, headers);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400, headers); }
  const url = new URL(request.url);
  if (url.pathname.replace(/\/+$/, "") === "/invite/redeem") {
    const token = String(body.token || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (token.length !== 10) return json({ error: "That invite code isn't valid." }, 400, headers);
    const rec = (await cacheOp(env, { take: ["inv:" + token] }))["inv:" + token];
    if (!rec || rec.exp < Date.now()) return json({ error: "That invite has already been used or has expired. Ask for a new one." }, 404, headers);
    return json({ box: rec.box }, 200, headers);
  }
  const box = String(body.box || "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(box)) return json({ error: "Invalid sync code." }, 400, headers);
  const token = inviteToken();
  const exp = Date.now() + INVITE_TTL;
  await cacheOp(env, { put: { ["inv:" + token]: { box, exp } } });
  return json({ token, expires: exp }, 200, headers);
}

// ---------- 3. Sync ----------

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sync(request, env, headers) {
  if (!env.SYNC) return json({ error: "Sync storage isn't set up on this Worker yet. Redeploy it from GitHub (it's in the config)." }, 500, headers);
  if (env.APP_KEY && request.headers.get("X-App-Key") !== env.APP_KEY) {
    return json({ error: "Wrong or missing app key. Enter the same key in Recipe Box → Settings." }, 401, headers);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400, headers); }
  const box = String(body.box || "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(box)) return json({ error: "Invalid sync code." }, 400, headers);
  const changes = Array.isArray(body.changes) ? body.changes.slice(0, 2000) : [];
  // The secret code itself is never stored; the box is looked up by its hash.
  const stub = env.SYNC.get(env.SYNC.idFromName(await sha256(box)));
  const res = await stub.fetch("https://sync/box", {
    method: "POST",
    body: JSON.stringify({ since: Number(body.since) || 0, changes })
  });
  return new Response(res.body, { status: res.status, headers: { ...headers, "Content-Type": "application/json" } });
}

// One Durable Object per recipe box. Records: "k:<key>" → { u: edited-at ms, v: value|null, s: sequence }.
// Newest edit wins per record; clients pull everything changed since their last sequence number.
export class RecipeSync {
  constructor(state) { this.storage = state.storage; }

  async fetch(request) {
    const { since, changes } = await request.json();
    let seq = (await this.storage.get("__seq")) || 0;
    const writes = {};
    for (const c of changes) {
      if (!c || typeof c.k !== "string" || c.k.length > 200 || typeof c.u !== "number") continue;
      const key = "k:" + c.k;
      const cur = writes[key] || await this.storage.get(key);
      if (!cur || c.u > cur.u) writes[key] = { u: c.u, v: c.v === undefined ? null : c.v, s: ++seq };
    }
    const entries = Object.entries(writes);
    for (let i = 0; i < entries.length; i += 100) await this.storage.put(Object.fromEntries(entries.slice(i, i + 100)));
    await this.storage.put("__seq", seq);
    const all = await this.storage.list({ prefix: "k:" });
    const records = [];
    for (const [key, r] of all) if (r.s > since) records.push({ k: key.slice(2), u: r.u, v: r.v });
    return new Response(JSON.stringify({ seq, records }), { headers: { "Content-Type": "application/json" } });
  }
}

export default {
  // Monthly cron (see wrangler.jsonc): refresh official prices after BLS publishes them.
  async scheduled(event, env, ctx) {
    if (env.CACHE) ctx.waitUntil(refreshPrices(env).catch(e => console.error("BLS refresh failed", e)));
  },

  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);

    if (request.method === "OPTIONS") return new Response(null, { headers });
    const path = new URL(request.url).pathname.replace(/\/+$/, "");

    // /status is for checking setup from a browser tab, so it answers anyone (it reveals no data).
    // Everything else only answers your app: browsers always send its Origin on these requests.
    // (Scripts can fake an Origin header, so set APP_KEY to really lock the Worker down.)
    if (path !== "/status" && !ALLOWED_ORIGINS.includes(origin)) return new Response("Forbidden", { status: 403, headers });

    if (path === "/scan" || path === "/read") {
      if (request.method !== "POST") return json({ error: "Use POST" }, 405, headers);
      return scan(request, env, headers);
    }
    if (path === "/sync") {
      if (request.method !== "POST") return json({ error: "Use POST" }, 405, headers);
      return sync(request, env, headers);
    }
    if (path === "/invite" || path === "/invite/redeem") {
      if (request.method !== "POST") return json({ error: "Use POST" }, 405, headers);
      return invite(request, env, headers);
    }
    if (path === "/recipe") return recipe(request, env, headers);
    if (path === "/prices") return prices(env, headers);
    if (path === "/nutrition") return nutrition(request, env, headers);
    if (path === "/status") {
      return json({ ok: true, version: VERSION, ai: !!env.AI, sync: !!env.SYNC, data: !!env.CACHE, fdcKey: !!env.FDC_KEY, blsKey: !!env.BLS_KEY, keyRequired: !!env.APP_KEY, models: MODELS }, 200, headers);
    }
    // The old "send me this page" route (GET /?url=) is retired: use /recipe. Older app versions then
    // fall back to the public proxies until they update.
    if (path === "" && new URL(request.url).searchParams.has("url")) {
      return json({ error: "This Worker now reads recipes itself. Update Recipe Box (Settings → Check for updates)." }, 410, headers);
    }
    return json({ error: "Not found" }, 404, headers);
  }
};
