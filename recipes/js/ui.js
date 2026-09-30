// Shared UI building blocks: window shell, modal, toast, stars, recipe meta line.
import { esc, fmtMinutes } from "./util.js";
import { sprite } from "./sprites.js";
import { nutritionFor } from "./nutrition.js";
import * as store from "./store.js";
import { recipeCost, money } from "./prices.js";

export function applyTheme() {
  const t = store.settings().theme;
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

export const app = () => document.getElementById("app");

export function go(hash) { location.hash = hash; }

/** A full-page retro window. The close box goes back (or home). */
export function shell({ title, body, status = "", actions = "", back = "#/" }) {
  return `<main class="page">
    <section class="win screen">
      <div class="titlebar">
        <span class="tb-left"><a class="backbtn" href="${esc(back)}" aria-label="${back === "#/" ? "Home" : "Back"}">${sprite("back")}</a></span>
        <h1 class="wintitle">${esc(title)}</h1>
        <span class="tb-right">${actions}</span>
      </div>
      <div class="wbody">${body}</div>
      ${status ? `<div class="statusbar">${status}</div>` : ""}
    </section>
  </main>`;
}

export function render(html, { keepScroll = false } = {}) {
  const y = window.scrollY;
  app().innerHTML = html;
  window.scrollTo(0, keepScroll ? y : 0);
}

// ---- Modal ----
let onModalClose = null;
export function modal(title, html, { onClose } = {}) {
  const dlg = document.getElementById("modal");
  document.getElementById("modal-title").textContent = title;
  const body = document.getElementById("modal-body");
  body.innerHTML = html;
  onModalClose = onClose || null;
  if (!dlg.open) dlg.showModal();
  body.scrollTop = 0;
  return { el: body, close: closeModal };
}
export function closeModal() {
  const dlg = document.getElementById("modal");
  if (dlg.open) dlg.close();
}
export function initModal() {
  const dlg = document.getElementById("modal");
  const x = document.getElementById("modal-close");
  x.innerHTML = sprite("close");
  x.addEventListener("click", closeModal);
  dlg.addEventListener("click", e => { if (e.target === dlg) closeModal(); });
  dlg.addEventListener("close", () => { const f = onModalClose; onModalClose = null; f && f(); });
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
export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---- Stars ----
export function starsHTML(rating = 0) {
  return `<div class="stars" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map(n =>
    `<button data-star="${n}" class="${n <= rating ? "on" : "off"}" aria-label="${n} star${n > 1 ? "s" : ""}" aria-pressed="${n <= rating}">${sprite("star")}</button>`
  ).join("")}</div>`;
}
export const miniStars = r => r ? "★".repeat(r) + "☆".repeat(5 - r) : "";

export function nutriShort(r) {
  const n = nutritionFor(r);
  if (!n || !n.kcal) return "";
  const t = n.source === "estimate" ? "~" : "";
  return `${t}${Math.round(n.kcal)} kcal · ${t}${Math.round(n.protein)} g protein`;
}

export function metaLine(r) {
  const bits = [];
  if (r.rating) bits.push(`<span class="mstars" aria-label="${r.rating} stars">${miniStars(r.rating)}</span>`);
  if (r.totalMin) bits.push(`<span>${fmtMinutes(r.totalMin)}</span>`);
  const n = nutriShort(r);
  if (n) bits.push(`<span>${n}</span>`);
  const c = recipeCost(r);
  if (c.total > 0) bits.push(`<span>~${money(c.perServing)}/serving</span>`);
  return bits.join("");
}
