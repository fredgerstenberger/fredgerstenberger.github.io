// Every app module must be preloaded by index.html and cached by sw.js, or a release can ship a file
// that phones never get (round 3, item 5).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = new URL("..", import.meta.url).pathname;
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".js") ? [path.join(dir, e.name)] : []);
const modules = walk("js").sort();
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const preloaded = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m => m[1]);
const cached = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));

test("every js module is preloaded by index.html", () => {
  assert.deepEqual(modules.filter(f => !preloaded.includes(f)), []);
  assert.deepEqual(preloaded.filter(f => !modules.includes(f)), [], "preloads point at files that exist");
});

test("every js module (and the page, styles and icons) is cached by sw.js", () => {
  assert.deepEqual(modules.filter(f => !cached.includes(f)), []);
  for (const f of cached) assert.ok(f === "./" || fs.existsSync(path.join(root, f)), `${f} exists`);
  for (const f of ["index.html", "app.css", "manifest.webmanifest"]) assert.ok(cached.includes(f), f);
});

test("sw.js VERSION matches APP_VERSION", async () => {
  const { APP_VERSION } = await import(new URL("../js/version.js", import.meta.url));
  assert.equal(sw.match(/const VERSION = "rb-v(\d+)"/)[1], String(APP_VERSION));
});
