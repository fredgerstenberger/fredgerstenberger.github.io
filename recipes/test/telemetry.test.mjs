// Crash reports carry nothing personal: addresses lose their query and screen details, quoted data in error
// messages goes, breadcrumbs of taps, typing and console lines are dropped.
import test from "node:test";
import assert from "node:assert/strict";
import { routeOf, scrubUrl, scrubText, scrubCrumb, scrubEvent, config } from "../js/telemetry.js";

test("screens lose their details", () => {
  assert.equal(routeOf("#/r/abc123"), "#/r/:id");
  assert.equal(routeOf("#/edit/x-y"), "#/edit/:id");
  assert.equal(routeOf("#/add?url=https%3A%2F%2Fsite.com%2Fbeef"), "#/add");
  assert.equal(routeOf("#/add?text=2%20cups%20flour"), "#/add");
  assert.equal(routeOf("#/plan/2026-10-05"), "#/plan/:week");
  assert.equal(routeOf("#/grocery"), "#/grocery");
  assert.equal(routeOf(""), "#/");
  assert.equal(routeOf("#/<script>"), "#/?");
});

test("addresses lose their query: recipe links, ingredient names, list items, invite codes", () => {
  assert.equal(scrubUrl("https://fredgerstenberger.github.io/recipes/?add=milk,%20eggs#/grocery"), "https://fredgerstenberger.github.io/recipes/#/grocery");
  assert.equal(scrubUrl("https://fredgerstenberger.github.io/recipes/?invite=ABCDEFGHJK&w=x"), "https://fredgerstenberger.github.io/recipes/");
  assert.equal(scrubUrl("https://recipe-proxy.x.workers.dev/nutrition?q=protein%20pasta"), "https://recipe-proxy.x.workers.dev/nutrition");
  assert.equal(scrubUrl("https://recipe-proxy.x.workers.dev/recipe?url=https://site.com/korean-beef"), "https://recipe-proxy.x.workers.dev/recipe");
  assert.equal(scrubUrl("https://fredgerstenberger.github.io/recipes/#/add?url=https://site.com/x"), "https://fredgerstenberger.github.io/recipes/#/add");
  assert.equal(scrubUrl("data:image/jpeg;base64,AAAA"), "[data]");
  assert.equal(scrubUrl("/recipes/js/app.js?v=1"), "/recipes/js/app.js");
});

test("error text loses quoted data and long addresses, keeps code names", () => {
  assert.equal(scrubText(`Unexpected token 'm', "milk, 2 eggs" is not valid JSON`), `Unexpected token 'm', "…" is not valid JSON`);
  assert.equal(scrubText(`JSON Parse error: Unexpected identifier "Korean beef bowl"`), `JSON Parse error: Unexpected identifier "…"`);
  assert.equal(scrubText("Cannot read properties of undefined (reading 'title')"), "Cannot read properties of undefined (reading 'title')");
  assert.equal(scrubText("Couldn't reach your Worker. Check your connection."), "Couldn't reach your Worker. Check your connection.");
  assert.equal(scrubText("Failed to fetch https://w.dev/nutrition?q=feta%20cheese"), "Failed to fetch https://w.dev/nutrition");
  assert.ok(scrubText("x".repeat(1000)).length <= 301);
});

test("breadcrumbs: taps, typing and console lines are dropped; fetches keep method, path and status", () => {
  assert.equal(scrubCrumb({ category: "console", message: "milk" }), null);
  assert.equal(scrubCrumb({ category: "ui.click", message: "button[data-quick=milk]" }), null);
  assert.equal(scrubCrumb({ category: "ui.input" }), null);
  const f = scrubCrumb({ category: "fetch", type: "http", data: { method: "GET", url: "https://w.dev/nutrition?q=feta", status_code: 500, request_body: "secret" } });
  assert.deepEqual(f.data, { method: "GET", url: "https://w.dev/nutrition", status_code: 500 });
  const n = scrubCrumb({ category: "navigation", data: { from: "/recipes/#/r/abc", to: "/recipes/#/add?text=flour" } });
  assert.deepEqual(n.data, { from: "/recipes/#/r/:id", to: "/recipes/#/add" });
});

test("a whole event: nothing personal survives", () => {
  const e = scrubEvent({
    message: `Bad "beef bowl"`,
    request: { url: "https://fredgerstenberger.github.io/recipes/?add=eggs#/r/abc", headers: { "User-Agent": "iPhone", Cookie: "c", Referer: "https://google.com/?q=me" }, query_string: "add=eggs", data: "x" },
    exception: { values: [{ type: "SyntaxError", value: `Unexpected token in "2 cups flour"`, stacktrace: { frames: [{ abs_path: "https://fredgerstenberger.github.io/recipes/js/parse.js?x=1", filename: "js/parse.js", vars: { text: "flour" } }] } }] },
    breadcrumbs: [{ category: "console", message: "flour" }, { category: "fetch", data: { url: "https://w.dev/recipe?url=https://site.com/beef", method: "GET", status_code: 503 } }],
    extra: { recipe: "beef" },
    user: { id: "anon-1", email: "me@x.com", ip_address: "1.2.3.4" },
    contexts: { browser: { name: "Safari" }, state: { recipes: ["beef"] } },
    server_name: "host"
  });
  const json = JSON.stringify(e);
  for (const bad of ["beef", "flour", "eggs", "me@x.com", "1.2.3.4", "Cookie", "google", "?"]) assert.ok(!json.includes(bad), `${bad} removed: ${json}`);
  assert.equal(e.request.headers["User-Agent"], "iPhone");
  assert.equal(e.user.id, "anon-1");
  assert.equal(e.contexts.browser.name, "Safari");
  assert.equal(e.breadcrumbs.length, 1);
});

test("nothing is sent from Node, or with no keys", () => {
  assert.equal(config(), null);
});
