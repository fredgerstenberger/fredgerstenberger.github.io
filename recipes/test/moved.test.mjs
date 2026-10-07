// The old address's move page: what it shows, the one-tap move (encrypted upload, then marked as moved), and links
// forwarded to the new address.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { moveState, moveData, forwardTo, MOVED, NEW_APP, API } from "../moved.js";
import { decryptPayload, parseMoveHash } from "../move-crypto.js";

function storage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const STATE = { recipes: { r1: { id: "r1", title: "Chili" } }, plan: {}, settings: { proxy: "https://recipe-proxy.fred.workers.dev", scanKey: "k3y" } };
const phone = () => storage({ "recipebox.v1": JSON.stringify(STATE), "recipebox.sync": JSON.stringify({ code: "BOX" }), "recipebox.me": "{\"id\":\"a\"}" });

test("what the page shows: move (data here), moved (already handed over), or just the new address", () => {
  assert.equal(moveState(phone()), "data");
  assert.equal(moveState(storage()), "empty");
  assert.equal(moveState(storage({ "recipebox.v1": JSON.stringify({ recipes: {}, plan: {} }) })), "empty");
  const s = phone(); s.setItem(MOVED, "{}");
  assert.equal(moveState(s), "moved");
});

test("Move my data: uploads only encrypted bytes, with the app key, then marks this address as moved", async () => {
  const s = phone(), calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: "A".repeat(22), expires: 1 }), { status: 200 }); };
  const link = await moveData(s, fetchImpl);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${API}/move`);
  assert.equal(calls[0].init.headers["X-App-Key"], "k3y");
  assert.ok(!new TextDecoder().decode(calls[0].init.body).includes("Chili"), "nothing readable leaves the phone");
  assert.ok(link.startsWith(`${NEW_APP}/#move=`));
  const { key } = parseMoveHash(new URL(link).hash);
  const p = await decryptPayload(calls[0].init.body, key);
  assert.equal(JSON.parse(p.keys["recipebox.v1"]).recipes.r1.title, "Chili");
  assert.equal(JSON.parse(p.keys["recipebox.sync"]).code, "BOX", "the sync box goes too");
  assert.ok(s.getItem(MOVED), "marked as moved");
  assert.equal(moveState(s), "moved");
  assert.ok(s.getItem("recipebox.v1"), "the data here is kept as a fallback");
});

test("can't reach api.bakfan.com: tries the saved Worker address; nothing works: not marked, a plain message", async () => {
  const s = phone(), urls = [];
  const flaky = async url => { urls.push(url); if (url.startsWith(API)) throw new TypeError("Load failed"); return new Response(JSON.stringify({ id: "B".repeat(22) }), { status: 200 }); };
  assert.ok((await moveData(s, flaky)).includes("B".repeat(22)));
  assert.deepEqual(urls, [`${API}/move`, "https://recipe-proxy.fred.workers.dev/move"]);
  const s2 = phone();
  await assert.rejects(moveData(s2, async () => { throw new TypeError("Load failed"); }), /Couldn't connect/);
  assert.equal(s2.getItem(MOVED), null, "a failed move doesn't mark the address as moved");
  const s3 = phone();
  await assert.rejects(moveData(s3, async () => new Response("{}", { status: 413 })), /backup file/);
  assert.equal(s3.getItem(MOVED), null);
});

test("shortcut and share links go to the new address", () => {
  assert.equal(forwardTo("?add=milk,%20eggs"), `${NEW_APP}/?add=milk,%20eggs`);
  assert.equal(forwardTo("?invite=ABCDEFGHJK&w=x"), `${NEW_APP}/?invite=ABCDEFGHJK&w=x`);
  assert.equal(forwardTo(""), null);
});

test("the page and its service worker: every file the worker caches exists, and it's a new release", () => {
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const files = JSON.parse(sw.match(/const FILES = (\[[^\]]*\])/)[1]);
  for (const f of files.filter(f => f !== "./")) assert.ok(fs.existsSync(new URL("../" + f, import.meta.url)), f);
  assert.match(sw, /const VERSION = "rb-v42-moved"/);
  assert.match(sw, /"skip-waiting"/, "arrives through the app's usual update prompt");
});
