// Joining a partner's recipe box with a one-time invite, from a brand-new phone that knows nothing yet
// (no Worker address, no app key): the invite link carries the Worker, and redeeming it hands over the rest.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";
import { makeWorker } from "./helpers/worker.mjs";

async function phone(w, name, settings = {}) {
  const d = await device({ name, fetch: w.fetchFor(), seed: { "recipebox.v1": { settings } } });
  return { ...d, store: await d.load("store"), sync: await d.load("sync") };
}

async function invited(w, key = "") {
  const A = await phone(w, "A", { proxy: w.base, scanKey: key });
  A.store.putRecipe({ id: "r1", title: "Korean Beef Bowl", ingredients: ["1 lb beef"], steps: [] });
  await A.sync.enable();
  const inv = await A.sync.createInvite();
  return { A, inv };
}

test("an invite link joins a fresh phone to the box, Worker address and all", async () => {
  const w = makeWorker();
  const { A, inv } = await invited(w);
  const u = new URL(inv.link);
  assert.equal(u.searchParams.get("invite"), inv.token);
  assert.equal(u.searchParams.get("w"), w.base);
  const B = await phone(w, "B");
  await B.sync.redeemInvite(u.searchParams.get("invite"), u.searchParams.get("w"));
  assert.equal(B.store.settings().proxy, w.base);
  assert.equal(B.store.recipe("r1")?.title, "Korean Beef Bowl");
  assert.equal(B.sync.info().code, A.sync.info().code);
  // Works once.
  const C = await phone(w, "C");
  await assert.rejects(C.sync.redeemInvite(inv.token, w.base), /already been used|expired/);
});

test("a Worker with an app key: the invite brings the key along", async () => {
  const w = makeWorker({ APP_KEY: "s3cret-key" });
  const { inv } = await invited(w, "s3cret-key");
  const B = await phone(w, "B");
  await B.sync.redeemInvite(inv.token, w.base);
  assert.equal(B.store.settings().scanKey, "s3cret-key");
  assert.equal(B.store.recipe("r1")?.title, "Korean Beef Bowl");
  // Without a valid invite the key stays secret.
  const r = await w.call("/invite/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "ABCDEFGHJK" }) });
  const body = await r.json();
  assert.equal(r.status, 404);
  assert.equal(body.key, undefined);
});

test("a typed code with no Worker address asks for the whole link", async () => {
  const w = makeWorker();
  const { inv } = await invited(w);
  const B = await phone(w, "B");
  await assert.rejects(B.sync.redeemInvite(inv.token, ""), /whole invite link/);
});
