// More: everything that isn't Recipes, Plan or the List.
import * as store from "../store.js";
import * as sync from "../sync.js";
import { shell, render } from "../ui.js";
import { openStorePicker } from "./stores.js";
import { APP_VERSION } from "../version.js";
import { plural, fmtDate } from "../util.js";
import { icon } from "../sprites.js";

export function moreView() {
  const s = store.get();
  const onHand = Object.values(s.pantry || {}).filter(v => v === true).length;
  const syncText = sync.enabled() ? (sync.info().error ? "Paused" : "On") : "Off";
  const row = (href, label, note = "", attrs = "") => `<li><a class="morerow" href="${href}" ${attrs}><span>${label}</span>${note ? `<small>${note}</small>` : ""}<span class="tdgo">${icon("chevRight", "ic16")}</span></a></li>`;
  render(shell({
    title: "More",
    back: null,
    body: `
      <div class="card"><ul class="glist">
        ${row("#/pantry", "Pantry", onHand ? `${onHand} on hand` : "")}
        ${row("#/prices", "Prices")}
        ${row("#/more", "Stores &amp; aisles", "", 'id="moreStores"')}
        ${row("#/convert", "Unit converter")}
      </ul></div>
      <div class="card"><ul class="glist">
        ${row("#/settings", "Sync", syncText, 'data-focus="sync"')}
        ${row("#/settings", "Settings")}
        ${row("#/settings", "Backup", s.lastBackup ? `Last: ${fmtDate(new Date(s.lastBackup))}` : "", 'data-focus="backup"')}
      </ul></div>
      <p class="muted" style="font-size:14px;margin:var(--s3) 4px">Recipe Box ${APP_VERSION}<br>${plural(Object.keys(s.recipes).length, "recipe")}</p>`
  }));
  document.getElementById("moreStores").onclick = e => { e.preventDefault(); openStorePicker(() => {}); };
  // Sync and Backup open Settings at their section.
  document.querySelectorAll("[data-focus]").forEach(a => a.onclick = () => { try { sessionStorage.setItem("rb.setFocus", a.dataset.focus); } catch {} });
}
