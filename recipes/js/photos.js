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
