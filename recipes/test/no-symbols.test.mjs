// The interface uses the pixel icon set (js/sprites.js), never emoji or keyboard symbols as icons. This scans
// the modules that build user-facing text (comments stripped) for emoji, arrows, shapes and dingbats.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const UI = [
  ...readdirSync(new URL("js/views/", ROOT)).filter(f => f.endsWith(".js")).map(f => `js/views/${f}`),
  "js/ui.js", "js/app.js", "js/timers.js", "js/fillin.js", "js/labelsheet.js", "js/tips.js", "js/live.js",
  "js/updates.js", "js/version.js", "js/sync.js", "js/data.js", "js/scan.js", "js/stores.js", "index.html"
];
// Allowed on purpose: fractions and degrees in amounts, the en dash in date ranges, the ellipsis on
// "Syncing…", curly quotes.
const ALLOW = new Set([..."½¼¾⅓⅔⅛⅜⅝⅞°–…“”‘’éèñü"]);
const BAD = /[←-⇿⌀-⏿①-⓿■-➿⤀-⥿⬀-⯿•≡⋯›‹×−—≈≤≥]|\p{Extended_Pictographic}/u;

const stripComments = src => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .split("\n").map(l => l.replace(/(^|[^:"'`\\])\/\/.*$/, "$1")).join("\n");

for (const f of UI) {
  test(`no emoji or symbol icons in ${f}`, () => {
    const src = stripComments(readFileSync(new URL(f, ROOT), "utf8"));
    const hits = [];
    src.split("\n").forEach((line, i) => {
      for (const ch of line) if (!ALLOW.has(ch) && BAD.test(ch)) hits.push(`${f}:${i + 1} ${JSON.stringify(ch)} ${line.trim().slice(0, 80)}`);
    });
    assert.deepEqual(hits, [], "use icon() from js/sprites.js (or plain words) instead");
  });
}

test("the check catches what it should", () => {
  for (const ch of ["★", "✕", "⋯", "▶", "↗", "📷", "≡", "·".replace("·", "•"), "×", "—"]) assert.ok(BAD.test(ch), ch);
  for (const ch of ["½", "°", "a"]) assert.ok(!BAD.test(ch), ch);
});
