// The Cloudflare Worker (issue 3: proxy access; plus RecipeSync's merge rules).
import test from "node:test";
import assert from "node:assert/strict";
import { makeWorker, ORIGIN } from "./helpers/worker.mjs";

// Pages "on the internet" for the proxy, including redirects.
function web(routes) {
  const seen = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); seen.push(url);
    const r = routes[url];
    if (!r) return new Response("not found", { status: 404 });
    if (r.redirect) return new Response(null, { status: 302, headers: { Location: r.redirect } });
    return new Response(r.body || "<html>" + "x".repeat(600) + "</html>", { status: 200, headers: { "Content-Type": "text/html" } });
  };
  return { seen, restore: () => { globalThis.fetch = orig; } };
}

const proxied = u => "/?url=" + encodeURIComponent(u);
let ip = 0;
const get = (w, path, headers = {}) => w.W.default.fetch(new Request(w.base + path, { headers: { "CF-Connecting-IP": `198.51.100.${++ip % 250}`, ...headers } }), w.env);

test("proxy: requests without the app's Origin are refused", async () => {
  const w = makeWorker();
  const net = web({ "https://example.com/": {} });
  try {
    assert.equal((await get(w, proxied("https://example.com/"))).status, 403);                          // curl / server script
    assert.equal((await get(w, proxied("https://example.com/"), { Origin: "https://evil.test" })).status, 403);
    assert.equal((await get(w, proxied("https://example.com/"), { Origin: ORIGIN })).status, 200);
  } finally { net.restore(); }
});

test("proxy: with APP_KEY set, the key is required", async () => {
  const w = makeWorker({ APP_KEY: "s3cret" });
  const net = web({ "https://example.com/": {} });
  try {
    assert.equal((await get(w, proxied("https://example.com/"), { Origin: ORIGIN })).status, 401);
    assert.equal((await get(w, proxied("https://example.com/"), { Origin: ORIGIN, "X-App-Key": "nope" })).status, 401);
    assert.equal((await get(w, proxied("https://example.com/"), { Origin: ORIGIN, "X-App-Key": "s3cret" })).status, 200);
  } finally { net.restore(); }
});

test("proxy: private and local addresses are refused, including through redirects", async () => {
  const w = makeWorker();
  const net = web({
    "https://example.com/r1": { redirect: "http://169.254.169.254/latest/meta-data" },
    "https://example.com/r2": { redirect: "http://localhost:8080/" },
    "https://example.com/r3": { redirect: "https://example.com/ok" },
    "https://example.com/ok": {}
  });
  const o = { Origin: ORIGIN };
  try {
    for (const bad of ["http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://172.20.0.1/", "http://100.64.0.1/", "http://[::1]/",
      "http://[::ffff:127.0.0.1]/", "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/", "http://localhost./", "http://printer.local/",
      "http://db.internal/", "file:///etc/passwd", "ftp://example.com/"]) {
      assert.equal((await get(w, proxied(bad), o)).status, 400, bad);
    }
    assert.equal((await get(w, proxied("https://example.com/r1"), o)).status, 400);
    assert.equal((await get(w, proxied("https://example.com/r2"), o)).status, 400);
    assert.ok(!net.seen.some(u => /169\.254|localhost/.test(u)), "never fetched a private address");
    assert.equal((await get(w, proxied("https://example.com/r3"), o)).status, 200, "ordinary redirects still work");
  } finally { net.restore(); }
});

test("proxy: light per-address rate limit", async () => {
  const w = makeWorker();
  const net = web({ "https://example.com/": {} });
  try {
    const h = { Origin: ORIGIN, "CF-Connecting-IP": "203.0.113.9" };
    let last;
    for (let i = 0; i < 40; i++) last = await get(w, proxied("https://example.com/"), h);
    assert.equal(last.status, 429);
    assert.equal((await get(w, proxied("https://example.com/"), { ...h, "CF-Connecting-IP": "203.0.113.10" })).status, 200);
  } finally { net.restore(); }
});

test("/status still works from a plain browser tab (no Origin), for the setup check", async () => {
  const w = makeWorker({ APP_KEY: "s3cret" });
  const res = await get(w, "/status");
  assert.equal(res.status, 200);
  const st = await res.json();
  assert.equal(st.ok, true);
  assert.equal(st.keyRequired, true);
});

test("RecipeSync: newest write of a record wins; older and equal-time writes are ignored", async () => {
  const w = makeWorker();
  const post = async body => (await w.call("/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ box: "b".repeat(24), ...body }) })).json();
  let r = await post({ since: 0, changes: [{ k: "r:1", u: 10, v: { t: "a" } }] });
  assert.deepEqual(r.records.map(x => [x.k, x.u, x.v.t]), [["r:1", 10, "a"]]);
  r = await post({ since: r.seq, changes: [{ k: "r:1", u: 5, v: { t: "old" } }, { k: "r:1", u: 10, v: { t: "tie" } }] });
  assert.deepEqual(r.records, [], "rejected writes are not echoed");
  r = await post({ since: 0, changes: [{ k: "r:1", u: 11, v: { t: "b" } }] });
  assert.equal(r.records.find(x => x.k === "r:1").v.t, "b");
});
