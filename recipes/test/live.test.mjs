// Live notes for a partner's grocery changes (item 7).
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const d = await device({ name: "live" });
const L = await d.load("live");
const WK = "2026-10-05";

test("item 7: a partner checking and adding things reads as one short note", () => {
  const before = L.snapshot({ grocery: { [WK]: { checked: {}, extras: [] } }, household: { h1: { text: "paper towels", checked: false, by: "Fred" } } }, WK);
  const after = L.snapshot({
    grocery: { [WK]: { checked: { eggs: true }, checkedBy: { eggs: "Emma" }, extras: [] } },
    household: { h1: { text: "paper towels", checked: true, cb: "Emma", by: "Fred" }, h2: { text: "2 lb coffee", checked: false, by: "Emma" } }
  }, WK);
  const chs = L.changes(before, after);
  assert.deepEqual(chs.map(c => `${c.who} ${c.verb} ${c.name}`).sort(), ["Emma added coffee", "Emma checked eggs", "Emma checked paper towels"]);
  assert.equal(L.describe(chs), "Emma checked eggs and paper towels · added coffee");
});

test("item 7: notes name the person only when it's one known person; quiet for unchecks and removals", () => {
  assert.equal(L.describe([{ who: "", verb: "checked", name: "eggs" }]), "Checked eggs on another phone");
  assert.equal(L.describe([{ who: "Emma", verb: "checked", name: "a" }, { who: "Fred", verb: "checked", name: "b" }, { who: "Emma", verb: "checked", name: "c" }]), "Checked a, b and 1 more on another phone");
  const a = L.snapshot({ grocery: { [WK]: { checked: { eggs: true } } }, household: { h1: { text: "foil", checked: true } } }, WK);
  const b = L.snapshot({ grocery: { [WK]: { checked: {} } }, household: {} }, WK);
  assert.deepEqual(L.changes(a, b), []);
  assert.equal(L.describe([]), "");
  assert.equal(L.initial(" emma"), "E");
});

test("item 7: an edited name is used for a recipe item", () => {
  const s = L.snapshot({ grocery: { [WK]: { checked: { "plant milk": true }, edits: { "plant milk": { name: "oat milk" } } } } }, WK);
  assert.equal(s["i:plant milk"].name, "oat milk");
});
