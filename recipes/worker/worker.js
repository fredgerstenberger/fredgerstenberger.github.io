// Recipe Box helper — a small Cloudflare Worker with two jobs:
//
//   1. GET  /?url=https://some-recipe-site.com/recipe
//      Downloads a recipe page for the app (browsers can't read other sites directly).
//
//   2. POST /scan   { images: ["data:image/jpeg;base64,…"], model?: "@cf/…" }
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

function isPrivateHost(host) {
  return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd])/i.test(host);
}

// ---------- 1. Recipe page proxy ----------
async function proxy(request, headers) {
  const target = new URL(request.url).searchParams.get("url");
  let url;
  try { url = new URL(target); } catch { return new Response("Missing or invalid ?url=", { status: 400, headers }); }
  if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) {
    return new Response("URL not allowed", { status: 400, headers });
  }
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      },
      redirect: "follow",
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_PAGE_BYTES) return new Response("Page too large", { status: 413, headers });
    return new Response(body, {
      status: res.status,
      headers: { ...headers, "Content-Type": res.headers.get("Content-Type") || "text/html; charset=utf-8" }
    });
  } catch (e) {
    return new Response(`Fetch failed: ${e.message}`, { status: 502, headers });
  }
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

async function runModel(env, model, images) {
  // Chat format with OpenAI-style image parts — used by the current vision models.
  const chat = {
    messages: [{
      role: "user",
      content: [
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
    if (model.includes("llama-3.2")) {
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
  const images = (body.images || []).filter(s => typeof s === "string" && s.startsWith("data:image/")).slice(0, 4);
  if (!images.length) return json({ error: "No photo received." }, 400, headers);
  const model = MODELS.includes(body.model) ? body.model : MODELS[0];

  let out;
  try {
    out = await runModel(env, model, images);
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);

    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return new Response("Forbidden", { status: 403, headers });

    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (path === "/scan") {
      if (request.method !== "POST") return json({ error: "Use POST" }, 405, headers);
      return scan(request, env, headers);
    }
    if (path === "/status") {
      return json({ ok: true, ai: !!env.AI, keyRequired: !!env.APP_KEY, models: MODELS }, 200, headers);
    }
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers });
    return proxy(request, headers);
  }
};
