// Recipe Box proxy — a tiny Cloudflare Worker that downloads a recipe page for the app.
// Browsers block one site from reading another site's pages; this Worker does it for you.
//
// Usage: GET https://<your-worker>.workers.dev/?url=https://some-recipe-site.com/recipe

// Only your app may use this proxy. Add more origins if you host the app elsewhere.
const ALLOWED_ORIGINS = [
  "https://fredgerstenberger.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
];

const MAX_BYTES = 5_000_000;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept",
    "Vary": "Origin"
  };
}

function isPrivateHost(host) {
  return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd])/i.test(host);
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);

    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers });
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return new Response("Forbidden", { status: 403, headers });

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
      if (body.byteLength > MAX_BYTES) return new Response("Page too large", { status: 413, headers });
      return new Response(body, {
        status: res.status,
        headers: { ...headers, "Content-Type": res.headers.get("Content-Type") || "text/html; charset=utf-8" }
      });
    } catch (e) {
      return new Response(`Fetch failed: ${e.message}`, { status: 502, headers });
    }
  }
};
