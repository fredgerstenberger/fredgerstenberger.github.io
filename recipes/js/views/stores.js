// Store picker and aisle-order editor (drag to rearrange; ↑/↓ buttons for keyboard and VoiceOver).
import * as stores from "../stores.js";
import { esc } from "../util.js";
import { modal, toast } from "../ui.js";
import { pix } from "../pixicons.js";
import { icon } from "../sprites.js";

export function openStorePicker(onChange) {
  const cur = stores.current();
  const all = stores.list();
  const { el, close } = modal("Where are you shopping?", `
    <p class="muted" style="margin-top:0;font-size:14px">The list follows each store's aisle order. Your stores sync with your partner; which one you pick stays on this phone.</p>
    <div class="card spick">
      <label class="srow"><input type="radio" name="st" value="" ${cur ? "" : "checked"}><span>Any store<small>Produce, dairy, meat, then packaged aisles; frozen last</small></span></label>
      ${all.map(s => `<div class="srow">
        <label><input type="radio" name="st" value="${esc(s.id)}" ${cur === s.id ? "checked" : ""}><span>${esc(s.name)}</span></label>
        <button class="btn small" data-edit="${esc(s.id)}">Aisles</button>
      </div>`).join("")}
    </div>
    <form id="newStore" class="inline" style="margin-top:14px">
      <input type="text" id="storeName" placeholder="Add a store" maxlength="40" autocomplete="off">
      <button class="btn" type="submit">Add</button>
    </form>`);
  el.querySelectorAll('input[name="st"]').forEach(r => r.onchange = () => {
    stores.pick(r.value); close(); onChange();
    toast(r.value ? `Aisles in ${stores.get(r.value)?.name || "store"} order` : "Standard aisle order");
  });
  el.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openAisleOrder(b.dataset.edit, onChange));
  el.querySelector("#newStore").onsubmit = e => {
    e.preventDefault();
    const name = el.querySelector("#storeName").value.trim();
    if (!name) return;
    const id = stores.add(name);
    stores.pick(id);
    onChange();
    openAisleOrder(id, onChange, true);
  };
}

export function openAisleOrder(id, onChange, isNew = false) {
  const s = stores.get(id);
  if (!s) return;
  let order = stores.orderFor(id);
  const rowHTML = a => `<li class="orow" data-a="${a}">
      <span class="ohandle" aria-hidden="true">${icon("grip", "ic20")}</span>
      <span class="oname">${pix(a, 16)} ${esc(stores.aisleLabel(a))}</span>
      <button class="obtn" data-up aria-label="Move ${esc(stores.aisleLabel(a))} up">${icon("arrowUp", "ic16")}</button>
      <button class="obtn" data-down aria-label="Move ${esc(stores.aisleLabel(a))} down">${icon("arrowDown", "ic16")}</button>
    </li>`;
  const { el, close } = modal(isNew ? `Aisles at ${s.name}` : s.name, `
    <p class="muted" style="margin-top:0;font-size:14px">Drag aisles into the order you walk the store${isNew ? ". You can change this anytime" : ""}. Your list follows as you go.</p>
    <ul class="card olist" id="olist">${order.map(rowHTML).join("")}</ul>
    <label class="field" style="margin-top:16px"><span>Name</span><input type="text" id="sName" value="${esc(s.name)}" maxlength="40"></label>
    <div class="btnrow"><button class="btn primary" id="oDone">Done</button><button class="btn danger" id="oDel">Delete store</button></div>`, { onClose: onChange });
  const ul = el.querySelector("#olist");
  const save = () => { order = [...ul.children].map(li => li.dataset.a); stores.setOrder(id, order); };
  ul.addEventListener("click", e => {
    const li = e.target.closest(".orow");
    if (!li) return;
    if (e.target.closest("[data-up]") && li.previousElementSibling) { ul.insertBefore(li, li.previousElementSibling); save(); onChange(); li.querySelector("[data-up]").focus(); }
    if (e.target.closest("[data-down]") && li.nextElementSibling) { ul.insertBefore(li.nextElementSibling, li); save(); onChange(); li.querySelector("[data-down]").focus(); }
  });
  // Drag by the ≡ handle only, so the rest of each row scrolls the sheet like anything else. Positions are
  // measured on screen (so a scrolled sheet doesn't throw them off), and the sheet scrolls by itself when
  // the finger nears its top or bottom edge.
  const scroller = el.closest(".wbody") || el;
  let drag = null;
  const place = () => {
    const { li, y } = drag;
    li.style.transform = "";
    const natural = li.getBoundingClientRect().top;
    li.style.transform = `translateY(${y - drag.grab - natural}px)`;
    const mid = y - drag.grab + li.offsetHeight / 2;
    const prev = li.previousElementSibling, next = li.nextElementSibling;
    const half = n => { const r = n.getBoundingClientRect(); return r.top + r.height / 2; };
    if (prev && mid < half(prev)) { ul.insertBefore(li, prev); place(); }
    else if (next && mid > half(next)) { ul.insertBefore(next, li); place(); }
  };
  const autoScroll = () => {
    if (!drag) return;
    const r = scroller.getBoundingClientRect(), edge = 56;
    const v = drag.y < r.top + edge ? -8 : drag.y > r.bottom - edge ? 8 : 0;
    if (v) { scroller.scrollTop += v; place(); }
    drag.raf = requestAnimationFrame(autoScroll);
  };
  ul.addEventListener("pointerdown", e => {
    const handle = e.target.closest(".ohandle");
    if (!handle || e.button) return;
    e.preventDefault();
    const li = handle.closest(".orow");
    drag = { li, y: e.clientY, grab: e.clientY - li.getBoundingClientRect().top, id: e.pointerId };
    li.classList.add("dragging");
    handle.setPointerCapture?.(e.pointerId);
    drag.raf = requestAnimationFrame(autoScroll);
  });
  ul.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.y = e.clientY;
    place();
  });
  const end = () => {
    if (!drag) return;
    cancelAnimationFrame(drag.raf);
    drag.li.classList.remove("dragging"); drag.li.style.transform = "";
    drag = null;
    save();
    onChange(); // the list behind the sheet follows right away
  };
  ul.addEventListener("pointerup", end);
  ul.addEventListener("pointercancel", end);
  el.querySelector("#sName").addEventListener("change", e => stores.rename(id, e.target.value));
  el.querySelector("#oDone").onclick = () => { stores.rename(id, el.querySelector("#sName").value); close(); };
  el.querySelector("#oDel").onclick = () => { stores.remove(id); toast(`Deleted ${s.name}`); close(); };
}
