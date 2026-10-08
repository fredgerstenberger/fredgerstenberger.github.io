// The old address only sends people to app.bakfan.com, keeping a link's query and fragment, and its service worker
// replaces any cached copy of the old app with that redirect.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const dir = new URL("../", import.meta.url);
const read = f => fs.readFileSync(new URL(f, dir), "utf8");

function visit(search = "", hash = "") {
  let went = null, registered = null;
  const ctx = { location: { protocol: "https:", search, hash, replace: u => { went = u; } }, navigator: { serviceWorker: { register: f => { registered = f; return Promise.resolve(); } } } };
  vm.runInNewContext(read("redirect.js"), ctx);
  return { went, registered };
}

test("everyone goes to app.bakfan.com, with a link's query and fragment", () => {
  assert.deepEqual(visit(), { went: "https://app.bakfan.com/", registered: "sw.js" });
  assert.equal(visit("?add=milk,%20eggs").went, "https://app.bakfan.com/?add=milk,%20eggs", "shortcuts still work");
  assert.equal(visit("?url=https%3A%2F%2Fexample.com%2Fchili", "#x").went, "https://app.bakfan.com/?url=https%3A%2F%2Fexample.com%2Fchili#x");
});

test("the page redirects without JavaScript too, and caches only files that exist", () => {
  const html = read("index.html");
  assert.match(html, /http-equiv="refresh" content="0; url=https:\/\/app\.bakfan\.com\/"/);
  assert.match(html, /<script src="redirect\.js"><\/script>/);
  const sw = read("sw.js");
  const files = JSON.parse(sw.match(/const FILES = (\[[^\]]*\])/)[1]);
  for (const f of files) if (f !== "./") assert.ok(fs.existsSync(new URL(f, dir)), f);
  assert.match(sw, /const VERSION = "rb-v43-redirect"/, "a new version, so installed copies update");
  assert.match(sw, /self\.skipWaiting\(\);\n\}\);/, "takes over at once");
  assert.ok(!fs.existsSync(new URL("moved.js", dir)) && !fs.existsSync(new URL("move-crypto.js", dir)), "the move page is gone");
});
