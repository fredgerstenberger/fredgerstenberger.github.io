// Things the browser does that an app wouldn't, handled in one place so a native wrapper (Capacitor) can take
// them over later: no pinch or double-tap zoom (the viewport and touch-action: manipulation do most of it; iOS
// Safari also needs its gesture events stopped), and the in-app text size, remembered on this device.
const TEXT_KEY = "rb.textSize";
export const TEXT_SIZES = [["", "Default"], ["large", "Large"], ["larger", "Larger"]];

export function noZoom() {
  const stop = e => e.preventDefault();
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, stop, { passive: false });
  // Two-finger pinch on browsers without gesture events.
  document.addEventListener("touchmove", e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
}

export function textSize() { try { return localStorage.getItem(TEXT_KEY) || ""; } catch { return ""; } }
export function setTextSize(v) {
  try { v ? localStorage.setItem(TEXT_KEY, v) : localStorage.removeItem(TEXT_KEY); } catch {}
  applyTextSize();
}
export function applyTextSize() {
  const v = textSize();
  if (v) document.documentElement.dataset.text = v; else delete document.documentElement.dataset.text;
}
