// Shared UI building blocks: window shell, modal, toast, stars, recipe meta line.
import { esc, fmtMinutes } from "./util.js";
import { avgRating } from "./ratings.js";
import { sprite, icon } from "./sprites.js";
import { nutritionFor } from "./nutrition.js";
import * as store from "./store.js";
import { recipeCost, money } from "./prices.js";
import { adoptPhotos } from "./photos.js";

export function applyTheme() {
  const t = store.settings().theme;
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

export const app = () => document.getElementById("app");

export function go(hash) { location.hash = hash; }

/** A full page in the Calm Pixel style: a top bar with the back arrow, the page title beside it and the page's
 * actions on the right (like the grocery list). bigTitle: false for screens that draw their own big title (a
 * recipe, whose name is often long); its top bar then shows the title only once you've scrolled past it.
 * back: null for the tab bar's screens, which need no back arrow. */
export function shell({ title, body, status = "", actions = "", back = "#/", calm = true, bigTitle = true, inlineTitle = calm && bigTitle }) {
  if (calm && bigTitle && !inlineTitle) body = `<h1 class="ctitle">${esc(title)}</h1>` + body;
  return `<main class="page${calm ? " calm" : ""}">
    <section class="win screen">
      <div class="titlebar${inlineTitle ? " inline" : ""}">
        <span class="tb-left">${back ? `<a class="backbtn" href="${esc(back)}" aria-label="${back === "#/" ? "Today" : "Back"}">${icon("chevLeft", "ic24")}</a>` : ""}</span>
        <h1 class="wintitle">${esc(title)}</h1>
        <span class="tb-right">${actions}</span>
      </div>
      <div class="wbody">${body}</div>
      ${status ? `<div class="statusbar">${status}</div>` : ""}
    </section>
  </main>`;
}

// Calm pages show the title in the top bar once the big title has scrolled away.
if (typeof addEventListener === "function") addEventListener("scroll", () => document.querySelector(".page.calm")?.classList.toggle("scrolled", scrollY > 56), { passive: true });

export function render(html, { keepScroll = false } = {}) {
  const y = window.scrollY;
  app().innerHTML = html;
  adoptPhotos(app());
  window.scrollTo(0, keepScroll ? y : 0);
}

// ---- Modal ----
// While a sheet is open the page behind it is pinned in place. On iPhone, touches on a sheet over a scrolled
// page could otherwise go to the page (it scrolled instead of the sheet responding); pinning the page also
// stops it scrolling underneath. The page returns to the same spot when the sheet closes.
let lockedY = null;
function lockPage() {
  if (lockedY != null) return;
  lockedY = window.scrollY;
  const b = document.body.style;
  b.position = "fixed"; b.top = `-${lockedY}px`; b.left = "0"; b.right = "0"; b.width = "100%";
  document.documentElement.classList.add("modal-open");
}
function unlockPage() {
  if (lockedY == null) return;
  const y = lockedY; lockedY = null;
  const b = document.body.style;
  b.position = b.top = b.left = b.right = b.width = "";
  document.documentElement.classList.remove("modal-open");
  window.scrollTo(0, y);
}

let onModalClose = null;
export function modal(title, html, { onClose } = {}) {
  const dlg = document.getElementById("modal");
  document.getElementById("modal-title").textContent = title;
  const body = document.getElementById("modal-body");
  body.innerHTML = html;
  onModalClose = onClose || null;
  if (!dlg.open) { lockPage(); dlg.showModal(); }
  body.scrollTop = 0;
  return { el: body, close: closeModal };
}
export function closeModal() {
  const dlg = document.getElementById("modal");
  if (dlg.open) { unlockPage(); dlg.close(); }
}
export function initModal() {
  const dlg = document.getElementById("modal");
  const x = document.getElementById("modal-close");
  x.innerHTML = sprite("close");
  x.addEventListener("click", closeModal);
  dlg.addEventListener("click", e => { if (e.target === dlg) closeModal(); });
  dlg.addEventListener("close", () => { unlockPage(); const f = onModalClose; onModalClose = null; f && f(); });
}

export function confirmBox(message, okLabel = "Delete", danger = true) {
  return new Promise(resolve => {
    let answered = false;
    const { el, close } = modal("Are you sure?", `
      <p style="margin-top:0">${esc(message)}</p>
      <div class="btnrow">
        <button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(okLabel)}</button>
        <button class="btn" data-cancel>Cancel</button>
      </div>`, { onClose: () => { if (!answered) resolve(false); } });
    el.querySelector("[data-ok]").onclick = () => { answered = true; close(); resolve(true); };
    el.querySelector("[data-cancel]").onclick = () => close();
  });
}

// ---- Toast ----
let toastTimer;
// action: { label, run, ms } adds a button (e.g. Undo) and keeps the toast up a little longer (ms).
// badge: a person's initial shown first (for a partner's changes).
export function toast(msg, action = null, badge = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  if (badge) { const b = document.createElement("span"); b.className = "gby"; b.textContent = badge; t.prepend(b); }
  t.classList.toggle("act", !!action);
  t.classList.toggle("who", !!badge);
  if (action) {
    const b = document.createElement("button");
    b.textContent = action.label;
    b.onclick = () => { t.hidden = true; action.run(); };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? action.ms || 4000 : 2200);
}

// ---- Stars ----
export function starsHTML(rating = 0, { label = "Rating", small = false } = {}) {
  return `<div class="stars${small ? " small" : ""}" role="group" aria-label="${label}">${[1, 2, 3, 4, 5].map(n =>
    `<button data-star="${n}" class="${n <= rating ? "on" : "off"}" aria-label="${n} star${n > 1 ? "s" : ""}" aria-pressed="${n <= rating}">${icon(n <= rating ? "star" : "starEmpty")}</button>`
  ).join("")}</div>`;
}
// Stars you can't tap (an average), rounded to the nearest whole star.
export function starsShow(avg = 0) {
  const n = Math.round(avg);
  return `<div class="stars show" role="img" aria-label="Average ${Math.round(avg * 10) / 10} of 5 stars">${[1, 2, 3, 4, 5].map(i =>
    `<span class="${i <= n ? "on" : "off"}">${icon(i <= n ? "star" : "starEmpty")}</span>`).join("")}</div>`;
}
export const miniStars = r => r ? "★".repeat(r) + "☆".repeat(5 - r) : "";

export function nutriShort(r) {
  const n = nutritionFor(r);
  if (!n || !n.kcal) return "";
  return `${Math.round(n.kcal)} kcal · ${Math.round(n.protein)} g protein`;
}

export function metaLine(r) {
  const bits = [];
  if (r.ready && typeof r.ready === "object") bits.push(`<span class="rdtag">Store-bought</span>`);
  const avg = Math.round(avgRating(r));
  if (avg) bits.push(`<span class="mstars" aria-label="${avg} stars">${miniStars(avg)}</span>`);
  if (r.totalMin) bits.push(`<span>${fmtMinutes(r.totalMin)}</span>`);
  const n = nutriShort(r);
  if (n) bits.push(`<span>${n}</span>`);
  const c = recipeCost(r);
  if (c.total > 0) bits.push(`<span class="ccost">${money(c.perServing)} per serving</span>`);
  return bits.join("");
}
