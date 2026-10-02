// Store picker and aisle-order editor (drag to rearrange; ↑/↓ buttons for keyboard and VoiceOver).
import * as stores from "../stores.js";
import { esc } from "../util.js";
import { modal, toast } from "../ui.js";
import { pix } from "../pixicons.js";

export function openStorePicker(onChange) {
  const cur = stores.current();
  const all = stores.list();
  const { el, close } = modal("Where are you shopping?", `
    <p class="muted" style="margin-top:0;font-size:14px">The list follows each store's aisle order. Your stores sync with your partner; which one you pick stays on this phone.</p>
    <div class="card spick">
      <label class="srow"><input type="radio" name="st" value="" ${cur ? "" : "checked"}><span>Any store<small>Standard aisle order</small></span></label>
      ${all.map(s => `<div class="srow">
        <label><input type="radio" name="st" value="${esc(s.id)}" ${cur === s.id ? "checked" : ""}><span>${esc(s.name)}</span></label>
        <button class="btn small" data-edit="${esc(s.id)}">Aisles</button>
      </div>`).join("")}
    </div>
    <form id="newStore" class="inline" style="margin-top:14px">
      <input type="text" id="storeName" placeholder="Add a store, e.g. Trader Joe's" maxlength="40" autocomplete="off">
      <button class="btn" type="submit">Add</button>
    </form>`);
  el.querySelectorAll('input[name="st"]').forEach(r => r.onchange = () => { stores.pick(r.value); close(); onChange(); });
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
      <span class="ohandle" aria-hidden="true">≡</span>
      <span class="oname">${pix(a, 16)} ${esc(stores.aisleLabel(a))}</span>
      <button class="obtn" data-up aria-label="Move ${esc(stores.aisleLabel(a))} up">↑</button>
      <button class="obtn" data-down aria-label="Move ${esc(stores.aisleLabel(a))} down">↓</button>
    </li>`;
  const { el, close } = modal(isNew ? `Aisles at ${s.name}` : s.name, `
    <p class="muted" style="margin-top:0;font-size:14px">Drag aisles into the order you walk the store${isNew ? ". You can change this anytime" : ""}.</p>
    <ul class="card olist" id="olist">${order.map(rowHTML).join("")}</ul>
    <label class="field" style="margin-top:16px"><span>Name</span><input type="text" id="sName" value="${esc(s.name)}" maxlength="40"></label>
    <div class="btnrow"><button class="btn primary" id="oDone">Done</button><button class="btn danger" id="oDel">Delete store</button></div>`, { onClose: onChange });
  const ul = el.querySelector("#olist");
  const save = () => { order = [...ul.children].map(li => li.dataset.a); stores.setOrder(id, order); };
  ul.addEventListener("click", e => {
    const li = e.target.closest(".orow");
    if (!li) return;
    if (e.target.closest("[data-up]") && li.previousElementSibling) { ul.insertBefore(li, li.previousElementSibling); save(); li.querySelector("[data-up]").focus(); }
    if (e.target.closest("[data-down]") && li.nextElementSibling) { ul.insertBefore(li.nextElementSibling, li); save(); li.querySelector("[data-down]").focus(); }
  });
  // Drag by the handle (or the name): the row follows the finger and the others make room.
  let drag = null;
  ul.addEventListener("pointerdown", e => {
    const li = e.target.closest(".orow");
    if (!li || e.target.closest(".obtn")) return;
    e.preventDefault();
    drag = { li, y0: e.clientY, top: li.offsetTop };
    li.classList.add("dragging");
    li.setPointerCapture?.(e.pointerId);
  });
  ul.addEventListener("pointermove", e => {
    if (!drag) return;
    const { li } = drag;
    const dy = e.clientY - drag.y0;
    li.style.transform = `translateY(${dy}px)`;
    const mid = drag.top + dy + li.offsetHeight / 2;
    const prev = li.previousElementSibling, next = li.nextElementSibling;
    if (prev && mid < prev.offsetTop + prev.offsetHeight / 2) { ul.insertBefore(li, prev); drag.y0 -= prev.offsetHeight; drag.top = li.offsetTop; li.style.transform = `translateY(${e.clientY - drag.y0}px)`; }
    else if (next && mid > next.offsetTop + next.offsetHeight / 2) { ul.insertBefore(next, li); drag.y0 += next.offsetHeight; drag.top = li.offsetTop; li.style.transform = `translateY(${e.clientY - drag.y0}px)`; }
  });
  const end = () => { if (!drag) return; drag.li.classList.remove("dragging"); drag.li.style.transform = ""; drag = null; save(); };
  ul.addEventListener("pointerup", end);
  ul.addEventListener("pointercancel", end);
  el.querySelector("#sName").addEventListener("change", e => stores.rename(id, e.target.value));
  el.querySelector("#oDone").onclick = () => { stores.rename(id, el.querySelector("#sName").value); close(); };
  el.querySelector("#oDel").onclick = () => { stores.remove(id); toast(`Deleted ${s.name}`); close(); };
}
