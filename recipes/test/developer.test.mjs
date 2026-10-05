// Infrastructure (the Worker, Cloudflare, AI models, app keys, public proxies) stays out of regular Settings and
// messages; 7 quick taps on the version number turn the Developer section on or off, on this device only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { device } from "./helpers/device.mjs";

test("7 quick taps on the version number turn developer settings on, and 7 more turn them off", async () => {
  const d = await device({ name: "dev" });
  const D = await d.load("dev");
  assert.equal(D.isDev(), false);
  let r = null;
  for (let i = 0; i < 6; i++) r = D.versionTap(1000 + i * 200);
  assert.equal(r, null, "six taps aren't enough");
  assert.equal(D.versionTap(2300), "on");
  assert.equal(D.isDev(), true);
  assert.equal(D.devText("Couldn't reach your Worker.", "Couldn't sync."), "Couldn't reach your Worker.");
  for (let i = 0; i < 6; i++) D.versionTap(5000 + i * 200);
  assert.equal(D.versionTap(6300), "off");
  assert.equal(D.devText("Couldn't reach your Worker.", "Couldn't sync."), "Couldn't sync.");
  // Slow taps don't count up.
  for (let i = 0; i < 7; i++) assert.equal(D.versionTap(10000 + i * 2000), null);
});

test("regular users get plain messages, never Worker setup steps", async () => {
  const d = await device({ name: "plain" });
  const { scanPhotos, scanLabel } = await d.load("scan");
  await assert.rejects(scanPhotos([], { worker: "" }), e => /isn't available yet/.test(e.message) && !/Worker|Cloudflare/.test(e.message));
  await assert.rejects(scanLabel({}, { worker: "" }), e => /paste the label's text/.test(e.message) && !/Worker|Cloudflare/.test(e.message));
  const dev = await device({ name: "dev2", seed: { "rb.dev": "1" } });
  await assert.rejects((await dev.load("scan")).scanPhotos([], { worker: "" }), e => /Cloudflare Worker/.test(e.message));
});

test("Settings mentions the Worker, models and keys only inside the Developer section", () => {
  const src = readFileSync(new URL("../js/views/settings.js", import.meta.url), "utf8");
  const start = src.indexOf('id="set-dev"'), end = src.indexOf('` : ""}', start);
  assert.ok(start > 0 && end > start, "the Developer section is behind isDev()");
  const before = src.slice(src.indexOf("export function settingsView"), start);
  const lines = before.split("\n").filter(l => /Cloudflare|Worker address|scanModel|APP_KEY|App key|proxies/.test(l) && !/isDev\(\)/.test(l) && !/^\s*\/\//.test(l));
  assert.deepEqual(lines, []);
});
