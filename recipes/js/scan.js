// Read cookbook photos with an open-weight vision model, via your Cloudflare Worker (Workers AI).
import { parseRecipeText } from "./parse.js";
import { devText } from "./dev.js";
import { reportWorker } from "./monitor.js";

export const SCAN_MODELS = [
  ["@cf/qwen/qwen3.8-27b", "Qwen 3.8 27B"],
  ["@cf/mistralai/mistral-small-3.1-24b-instruct", "Mistral Small 3.1 24B"],
  ["@cf/google/gemma-3-12b-it", "Gemma 3 12B (fastest)"],
  ["@cf/meta/llama-3.2-11b-vision-instruct", "Llama 3.2 11B Vision"]
];

// Shrink a photo to a JPEG data URL (long side ≤ maxSide) so uploads are fast and cheap.
export async function shrinkPhoto(file, maxSide = 1600, quality = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't open that photo."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const num = v => { const n = parseFloat(v); return isNaN(n) || n <= 0 ? 0 : Math.round(n); };
const strs = a => (Array.isArray(a) ? a : typeof a === "string" ? a.split("\n") : [])
  .map(x => (typeof x === "string" ? x : x?.text || x?.name || "").replace(/\s+/g, " ").trim())
  .filter(Boolean);

// Turn whatever the model returned into the app's recipe shape.
export function normalizeScan(data) {
  if (data.recipe) {
    const r = data.recipe;
    const prep = num(r.prepMin), cook = num(r.cookMin);
    return {
      title: String(r.title || "").trim() || "Untitled recipe",
      yield: num(r.servings) || null,
      yieldText: "",
      prepMin: prep, cookMin: cook,
      totalMin: num(r.totalMin) || prep + cook,
      ingredients: strs(r.ingredients).map(s => s.replace(/^[-*\u2022\u25A2]\s*/, "")),
      steps: strs(r.steps).map(s => s.replace(/^(step\s*)?\d+[.):]\s*/i, "")),
      description: String(r.notes || "").trim(),
      siteKeywords: []
    };
  }
  // The model answered in plain text: run it through the same parser as pasted text.
  return parseRecipeText(data.text || "");
}

export async function scanPhotos(files, { worker, model, key }, onStatus = () => {}) {
  if (!worker) throw new Error(devText("Set up your Cloudflare Worker first (Settings, Developer).", "Photo scanning isn't available yet. You can paste the recipe's text instead."));
  onStatus("Preparing photo…");
  const images = [];
  for (const f of files) images.push(await shrinkPhoto(f));
  onStatus("Reading the recipe… this can take 20–60 seconds.");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 150000);
  let res;
  try {
    res = await fetch(`${worker.replace(/\/+$/, "")}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { "X-App-Key": key } : {}) },
      body: JSON.stringify({ images, model }),
      signal: ctrl.signal
    });
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "The scan took too long. Try again." : devText("Couldn't reach your Worker. Check the address in Settings.", "Couldn't scan the photo. Check your connection and try again."));
  } finally {
    clearTimeout(t);
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 404 || res.status === 405) throw new Error(devText("Your Worker doesn't have photo scanning yet. Paste the latest worker.js into Cloudflare and deploy (see the setup guide).", "Photo scanning isn't available right now."));
  if (res.status >= 500) reportWorker("scan", "/scan", res.status);
  if (!res.ok) throw new Error(data.error || `Scan failed (HTTP ${res.status}).`);
  const r = normalizeScan(data);
  r.model = data.model;
  return r;
}

/**
 * Run a request; if it fails because you switched to another app while it was going (iPhone stops a web app's
 * requests in the background), send it again once you're back, instead of making you start over. Once only.
 */
export async function resendIfInterrupted(send, doc = typeof document !== "undefined" ? document : null) {
  let away = false;
  const mark = () => { if (doc?.visibilityState === "hidden") away = true; };
  doc?.addEventListener?.("visibilitychange", mark);
  try {
    return await send();
  } catch (e) {
    if (!away && doc?.visibilityState !== "hidden") throw e;
    if (doc?.visibilityState === "hidden") await new Promise(res => {
      const back = () => { if (doc.visibilityState !== "hidden") { doc.removeEventListener("visibilitychange", back); res(); } };
      doc.addEventListener("visibilitychange", back);
    });
    return await send();
  } finally {
    doc?.removeEventListener?.("visibilitychange", mark);
  }
}

// A Nutrition Facts label (photo or screenshot) → its fields, checked, via your Worker's /label.
// The photo is shrunk on the phone and not kept anywhere (it's sent a second time only if you switched apps
// while it was being read).
export async function scanLabel(file, { worker, model, key }) {
  if (!worker) throw new Error(devText("Label scanning uses your Cloudflare Worker (Settings, Developer). You can paste the label's text instead.", "Reading label pictures isn't available yet. You can paste the label's text instead."));
  // A label is text, so a smaller picture reads as well and faster.
  const image = await shrinkPhoto(file, 1100, 0.8);
  const send = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 90000);
    try {
      return await fetch(`${worker.replace(/\/+$/, "")}/label`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { "X-App-Key": key } : {}) },
        body: JSON.stringify({ images: [image], model }),
        signal: ctrl.signal
      });
    } finally { clearTimeout(t); }
  };
  let res;
  try {
    res = await resendIfInterrupted(send);
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "Reading the label took too long. Try again, or paste its text." : devText("Couldn't reach your Worker. You can paste the label's text instead.", "Couldn't read the label. Check your connection, or paste its text."));
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 404 || res.status === 405) throw new Error(devText("Your Worker doesn't read labels yet. Deploy the latest worker.js (see the setup guide), or paste the label's text.", "Reading label pictures isn't available right now. You can paste the label's text instead."));
  if (res.status >= 500) reportWorker("label", "/label", res.status);
  if (!res.ok) throw new Error(data.error || `Couldn't read the label (HTTP ${res.status}).`);
  if (!data.label) throw new Error(data.error || "Couldn't read that label. Try a closer, straighter photo, or paste its text.");
  return { label: data.label, check: data.check || null, model: data.model };
}

/** A copied picture (a screenshot, or Photos → Share → Copy Photo) from the clipboard, for the label reader.
 * Must run from a tap; iPhone shows its "Paste" bubble first. Throws a message to show when there's none. */
export async function imageFromClipboard() {
  if (!navigator.clipboard?.read) throw new Error("This browser can't paste pictures here. Use Label photo instead.");
  let items;
  try { items = await navigator.clipboard.read(); }
  catch { throw new Error("Nothing was pasted. Copy the label picture first (in Photos, tap Share, then Copy Photo), then tap Paste label image."); }
  for (const item of items) {
    const type = item.types.find(t => t.startsWith("image/"));
    if (type) return await item.getType(type);
  }
  throw new Error("The clipboard has no picture. Copy the label picture first (in Photos, tap Share, then Copy Photo).");
}

/** The picture in a paste event (pasting with a keyboard or the edit menu), or null. */
export function imageFromPasteEvent(e) {
  for (const item of e.clipboardData?.items || []) if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  return null;
}
