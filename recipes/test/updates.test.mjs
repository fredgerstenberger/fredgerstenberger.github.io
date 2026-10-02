// What each open tab does when a new release takes over, so nothing typed is lost.
import test from "node:test";
import assert from "node:assert/strict";
import { device } from "./helpers/device.mjs";

const d = await device({ name: "updates" });
const { hasUnsaved, updateAction } = await d.load("updates");

// ---- (4) Updating open tabs without losing typed text ----
const F = (tagName, value, defaultValue, type = "text", extra = {}) => ({ tagName, type, value, defaultValue, ...extra });
const FIELDS = [
  // fields, unsaved?
  [[], false],
  [[F("INPUT", "Lemon chicken", "Lemon chicken")], false],
  [[F("INPUT", "Lemon chicken!", "Lemon chicken")], true],
  [[F("TEXTAREA", "Step 1", "", "textarea")], true],
  [[F("INPUT", "pasta", "", "search")], false],
  [[F("INPUT", "2", "1", "radio")], false],
  [[F("INPUT", "edited", "", "text", { disabled: true })], false],
  [[F("INPUT", "12", "10", "number")], true],
  [[F("INPUT", "a", "a"), F("TEXTAREA", "typed", "", "textarea")], true]
];
FIELDS.forEach(([fields, unsaved], n) => test(`unsaved text #${n + 1}: ${unsaved}`, () => assert.equal(hasUnsaved(fields), unsaved)));

const ACTIONS = [
  // tapped Reload in this tab?, unsaved text here?, what happens
  [true, false, "reload"],
  [true, true, "confirm"],
  [false, false, "reload"],
  [false, true, "defer"]
];
for (const [askedHere, unsaved, action] of ACTIONS) {
  test(`update: ${askedHere ? "this tab" : "another tab"}, ${unsaved ? "unsaved text" : "nothing typed"} → ${action}`, () => assert.equal(updateAction({ askedHere, unsaved }), action));
}
