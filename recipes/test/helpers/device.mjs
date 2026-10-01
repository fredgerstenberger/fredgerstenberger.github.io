// Simulated phones for tests: each has its own localStorage, window events, fetch and app modules.
import { register } from "node:module";
register("./hooks.mjs", import.meta.url);

globalThis.__rbDevices ||= {};
let seq = 0;

function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    get length() { return m.size; }
  };
}

/**
 * Create a device. opts.fetch handles network calls; opts.timers = true uses real timers
 * (default: timers are no-ops, so background syncs never run on their own during a test).
 * opts.seed: object written to localStorage before the modules load.
 */
export async function device(opts = {}) {
  const name = `${opts.name || "dev"}-${++seq}`;
  const win = new EventTarget();
  const noop = () => 0;
  const env = {
    localStorage: memoryStorage(),
    window: win,
    document: { visibilityState: "visible", addEventListener() {}, getElementById: () => null },
    location: { hash: opts.hash || "", href: "http://localhost:8000/recipes/" },
    fetch: opts.fetch || (async () => { throw new Error("offline"); }),
    navigator: {},
    setTimeout: opts.timers ? setTimeout : noop,
    clearTimeout: opts.timers ? clearTimeout : noop,
    setInterval: opts.timers ? setInterval : noop,
    clearInterval: opts.timers ? clearInterval : noop,
    // opts.clock: this phone's clock is off by that many ms
    Date: opts.clock ? class extends Date { static now() { return super.now() + opts.clock; } } : Date
  };
  win.addEventListener = win.addEventListener.bind(win);
  win.dispatchEvent = win.dispatchEvent.bind(win);
  for (const [k, v] of Object.entries(opts.seed || {})) env.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  globalThis.__rbDevices[name] = env;
  const load = m => import(new URL(`../../js/${m}.js?rbdev=${name}`, import.meta.url).href);
  return { name, env, load };
}
