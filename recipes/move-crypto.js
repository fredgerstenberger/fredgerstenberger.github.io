// Moving a phone's data to a new address: everything Recipe Box keeps on the phone, packed, compressed and
// encrypted on the phone with a random key (AES-GCM, 256-bit). Only the encrypted bytes are uploaded (Worker
// POST /move); the key travels in the new address's #fragment, which browsers never send to a server.
//
// The old address's "Recipe Box has moved" page uses an identical copy of this file
// (fredgerstenberger.github.io: recipes/move-crypto.js). Keep the two the same.

export const MOVE_FORMAT = 1;
const KEEP = /^(recipebox\.|rb\.)/;            // the app's own keys
const SKIP = new Set(["rb.moved", "rb.obs", "rb.sw"]); // the old address's own state and local test switches

export class MoveError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Everything the app keeps in this storage (localStorage), as { app, format, at, keys: { key: string } }. */
export function packStorage(storage) {
  const keys = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k != null && KEEP.test(k) && !SKIP.has(k)) keys[k] = storage.getItem(k);
  }
  return { app: "recipe-box", format: MOVE_FORMAT, at: Date.now(), keys };
}

const b64url = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

/** Pack → gzip → encrypt. Returns { bytes: IV (12) + ciphertext, key: the key, base64url }. */
export async function encryptPayload(payload) {
  const plain = await pipe(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream("gzip"));
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const bytes = new Uint8Array(12 + ct.length);
  bytes.set(iv); bytes.set(ct, 12);
  return { bytes, key: b64url(new Uint8Array(await crypto.subtle.exportKey("raw", key))) };
}

/** Decrypt → gunzip → the payload. A wrong key or damaged bytes throw MoveError("bad_key"). */
export async function decryptPayload(bytes, keyText) {
  let plain;
  try {
    const key = await crypto.subtle.importKey("raw", unb64url(keyText), { name: "AES-GCM" }, false, ["decrypt"]);
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12) }, key, bytes.subarray(12)));
  } catch {
    throw new MoveError("bad_key", "This move link doesn't match its data. Open the old address and tap Move my data again.");
  }
  const p = JSON.parse(new TextDecoder().decode(await pipe(plain, new DecompressionStream("gzip"))));
  if (p?.app !== "recipe-box" || !p.keys || typeof p.keys !== "object") throw new MoveError("bad_data", "That isn't data from this app.");
  return p;
}

/** "#move=<id>.<key>" → { id, key }, or null. */
export function parseMoveHash(hash) {
  const m = String(hash || "").match(/^#move=([A-Za-z0-9]{22})\.([A-Za-z0-9_-]{43})$/);
  return m ? { id: m[1], key: m[2] } : null;
}

/** The recipe book as a backup file's text (the same format as Settings → Export backup), from packed keys. */
export function backupText(keys) {
  const state = JSON.parse(keys["recipebox.v1"] || "{}");
  return JSON.stringify({ app: "recipe-box", exported: new Date().toISOString(), ...state }, null, 1);
}
