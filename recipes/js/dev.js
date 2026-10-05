// Developer settings: the Worker address, app key, photo model and setup notes stay out of regular Settings and
// messages. Tapping the version number in Settings 7 times turns them on or off, on this device only. Everything
// keeps working with the values already saved either way.
const KEY = "rb.dev";
export const isDev = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export function setDev(on) { try { on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch {} }

let taps = 0, last = 0;
/** Count a tap on the version number; on the 7th quick tap, flip developer settings. Returns "on", "off" or null. */
export function versionTap(now = Date.now()) {
  taps = now - last < 1500 ? taps + 1 : 1;
  last = now;
  if (taps < 7) return null;
  taps = 0;
  setDev(!isDev());
  return isDev() ? "on" : "off";
}

/** The technical message in developer mode, the plain one otherwise. */
export const devText = (technical, plain) => (isDev() ? technical : plain);
