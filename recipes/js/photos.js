// Recipe photos: the picture from a recipe site's data, kept on this phone only (not synced: it's the site's
// image address, and the service worker keeps a copy for offline). Removable per recipe.
const KEY = "rb.photos";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
const write = m => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {} };

/** A web address that's fine to show as an image (https only). */
export const okImage = u => typeof u === "string" && /^https:\/\/[^\s"'<>]+$/i.test(u.trim());

/** Every recipe's photo on this phone, read once (for the book's list). */
export const allPhotos = () => read();
export const photoOf = id => { const u = read()[id]; return okImage(u) ? u : null; };
export function setPhoto(id, url) {
  const m = read();
  if (okImage(url)) m[id] = url.trim(); else delete m[id];
  write(m);
}

// Recipes saved before photos (or on the other phone) get theirs quietly: a few per app session, read from the
// recipe's page the same way an import is (never with AI). A recipe whose page has no photo is asked again a
// week later (for example after the Worker is redeployed).
const TRIED = "rb.photoTried", WEEK = 7 * 86400000;
let filling = false;
export async function fillPhotos(recipes, st, onFound, max = 4) {
  if (filling || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  let tried = {};
  try { tried = JSON.parse(localStorage.getItem(TRIED) || "{}") || {}; } catch {}
  const have = read();
  const todo = recipes.filter(r => /^https?:\/\//i.test(r.url || "") && !okImage(have[r.id]) && !(Date.now() - (tried[r.id] || 0) < WEEK)).slice(0, max);
  if (!todo.length) return;
  filling = true;
  try {
    const { photoFromPage } = await import("./parse.js");
    for (const r of todo) {
      tried[r.id] = Date.now();
      try { localStorage.setItem(TRIED, JSON.stringify(tried)); } catch {}
      try {
        const img = await photoFromPage(r.url, st.proxy || "", st.scanKey || "");
        if (okImage(img) && !photoOf(r.id)) { setPhoto(r.id, img); onFound?.(r.id, img); }
      } catch {}
    }
  } finally { filling = false; }
}
