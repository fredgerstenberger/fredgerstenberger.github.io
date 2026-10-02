// Module hooks for tests. Importing an app module with ?rbdev=<name> gives that simulated device its
// own copy of the whole module graph, with browser globals (localStorage, window, fetch, …) taken
// from globalThis.__rbDevices[name]. The prefix is added on the first line so line numbers still match.
const APP = new URL("../../", import.meta.url).href; // recipes/

export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  const dev = context.parentURL && context.parentURL.startsWith(APP) ? new URL(context.parentURL).searchParams.get("rbdev") : null;
  if (dev && r.url.startsWith(APP) && !r.url.includes("/test/")) {
    const u = new URL(r.url);
    if (!u.searchParams.has("rbdev")) { u.searchParams.set("rbdev", dev); return { ...r, url: u.href }; }
  }
  return r;
}

const NAMES = ["localStorage", "window", "document", "location", "fetch", "navigator", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"];

export async function load(url, context, next) {
  const r = await next(url, context);
  const dev = url.startsWith(APP) ? new URL(url).searchParams.get("rbdev") : null;
  if (!dev || r.format !== "module") return r;
  const pre = `const __rbd = globalThis.__rbDevices[${JSON.stringify(dev)}]; const ${NAMES.map(n => `${n} = __rbd.${n}`).join(", ")};`;
  return { ...r, source: pre + String(r.source) };
}
