// Crash and error reports (Sentry): is Recipe Box broken, where, on which kind of device (an anonymous ID,
// see telemetry.js) and in which version. index.html runs this file before the app, so it can report an app
// that fails to start. Sentry itself loads in the background once the page is idle; until then errors wait in
// a short queue. Every report is scrubbed first (telemetry.js scrubEvent). If Sentry can't load, or sharing is
// off, nothing changes and nothing is sent.
import { config, anonId, appContext, RELEASE, scrubEvent, scrubCrumb } from "./telemetry.js";

const queue = []; // [error, context], until Sentry loads
let sdk = null, started = false;

const hold = (err, ctx) => { if (queue.length < 20) queue.push([err, ctx]); };
const onError = e => hold(e.error || new Error(e.message || "Script error"), {});
const onRejection = e => hold(e.reason, {});

function send(err, { area = "", endpoint = "", status = 0, level = "error" } = {}) {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Non-Error rejection");
  sdk.captureException(e, {
    level,
    tags: { ...(area && { area }), ...(endpoint && { endpoint }), ...(status && { status: String(status) }) },
    ...(endpoint ? { fingerprint: ["worker", endpoint, String(status)] } : {})
  });
}

/** Report an error the app caught. ctx: { area, endpoint, status, level }. Never throws, never waits. */
export function report(err, ctx = {}) {
  try {
    if (!started || !config()?.dsn) return;
    sdk ? send(err, ctx) : hold(err, ctx);
  } catch {}
}

/** A Worker call that failed on the Worker's side (a 5xx). A 502 is an outside service the Worker asked (the
 * recipe site, BLS, USDA) failing, not a bug, so it isn't reported. */
export function reportWorker(area, endpoint, status = 0) {
  if (status === 502) return;
  report(new Error(`Worker ${endpoint} failed${status ? ` (HTTP ${status})` : ""}`), { area, endpoint, status });
}

function stopHolding() { removeEventListener("error", onError); removeEventListener("unhandledrejection", onRejection); }

function start() {
  const c = config();
  if (started || !c?.dsn) return;
  started = true;
  // Take over from the page's first script, which kept errors from before this file ran.
  const early = window.__rbErr || [];
  window.__rbErrOff = true;
  for (const err of early.splice(0)) hold(err, { area: "startup" });
  addEventListener("error", onError);
  addEventListener("unhandledrejection", onRejection);
  const load = () => import("../vendor/sentry.min.js").then(S => {
    if (!started) return; // sharing was turned off meanwhile
    const ctx = appContext();
    S.init({
      dsn: c.dsn,
      release: RELEASE,
      environment: c.environment,
      sendDefaultPii: false,
      // Sentry 11 collects user info (the IP address) by default unless told not to; sendDefaultPii alone no
      // longer covers it. Only the browser's user agent is kept, for the device and browser version.
      dataCollection: {
        userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false, stackFrameVariables: false,
        httpHeaders: { request: { allow: ["user-agent"] }, response: false }
      },
      maxBreadcrumbs: 30,
      ignoreErrors: [/ResizeObserver loop/],
      beforeSend: e => scrubEvent(e),
      beforeBreadcrumb: b => scrubCrumb(b),
      initialScope: { user: { id: anonId() }, tags: ctx }
    });
    sdk = S;
    stopHolding(); // Sentry's own handlers catch everything from here
    for (const [err, cx] of queue.splice(0)) send(err, cx);
  }).catch(() => { stopHolding(); queue.length = 0; started = false; });
  (window.requestIdleCallback || (f => setTimeout(f, 1500)))(load, { timeout: 4000 });
}

/** Settings → sharing turned off: stop sending now. */
export function stopMonitor() {
  try { sdk?.close(); } catch {}
  stopHolding();
  sdk = null; started = false; queue.length = 0;
}

try { start(); } catch {}
