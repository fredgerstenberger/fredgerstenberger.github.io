// The real Worker (worker.js) running in-process with in-memory Durable Object storage.
import * as W from "../../worker/worker.js";

export const ORIGIN = "http://localhost:8000";

function memoryStorage() {
  const m = new Map();
  return {
    get: async k => structuredClone(m.get(k)),
    delete: async k => m.delete(k),
    put: async (k, v) => {
      if (typeof k === "object") for (const [a, b] of Object.entries(k)) m.set(a, structuredClone(b));
      else m.set(k, structuredClone(v));
    },
    list: async ({ prefix } = {}) => new Map([...m].filter(([k]) => !prefix || k.startsWith(prefix)).sort().map(([k, v]) => [k, structuredClone(v)]))
  };
}

function namespace(Cls) {
  const objs = new Map();
  return {
    idFromName: n => n,
    get: id => {
      if (!objs.has(id)) objs.set(id, new Cls({ storage: memoryStorage() }));
      const o = objs.get(id);
      return { fetch: (u, i) => o.fetch(new Request(u, i)) };
    },
    objects: objs
  };
}

export function makeWorker(extraEnv = {}) {
  const env = { AI: null, SYNC: namespace(W.RecipeSync), CACHE: namespace(W.DataCache), ...extraEnv };
  const base = "https://worker.test";
  // A fetch for a simulated phone: calls to the Worker go in-process, with the app's Origin header.
  const fetchFor = (origin = ORIGIN) => async (url, init = {}) => {
    url = String(url);
    if (!url.startsWith(base)) throw new Error("offline: " + url);
    const headers = new Headers(init.headers || {});
    if (origin) headers.set("Origin", origin);
    return W.default.fetch(new Request(url, { ...init, headers }), env);
  };
  return { env, base, fetchFor, call: (path, init) => fetchFor()(base + path, init), W };
}
