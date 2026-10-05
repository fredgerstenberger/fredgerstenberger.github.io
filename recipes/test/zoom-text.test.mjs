// No pinch or double-tap zoom, and text that follows the phone's text size (rem units on an iOS body root).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("the viewport blocks zoom and the gesture handling lives in platform.js", () => {
  assert.match(read("index.html"), /maximum-scale=1, user-scalable=no/);
  const p = read("js/platform.js");
  for (const ev of ["gesturestart", "gesturechange"]) assert.match(p, new RegExp(ev));
  assert.match(read("app.css"), /touch-action: manipulation/);
  assert.match(read("app.css"), /input, select, textarea \{ font-size: max\(16px, 1rem\); \}/);
});

test("font sizes are in rem so Dynamic Type and Text size scale them", () => {
  const css = read("app.css");
  assert.match(css, /font: -apple-system-body/);
  const px = css.split("\n").filter(l => /font-size:\s*\d+(\.\d+)?px|font:\s*(\d{3}\s+)?\d+(\.\d+)?px/.test(l) && !/max\(16px/.test(l) && !/^html/.test(l)); // the root sizes themselves are px
  assert.deepEqual(px, []);
});
