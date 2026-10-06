// Today: the app's first screen (the Plan tab), with the week's plan beside it (Today | Week). Tonight's dinner with its photo, the day's other meals, the
// grocery list and tomorrow, with Week one tap away.
import * as store from "../store.js";
import { esc, weekKey, planningWeekKey, addDays, prepDay, MEALS, cap, plural, fmtDate } from "../util.js";
import { shell, render } from "../ui.js";
import { sectionize } from "../grocery.js";
import { inWeek } from "../household.js";
import { nutritionFor } from "../nutrition.js";
import { photoOf } from "../photos.js";
import { estimatesNoticeHTML, bindEstimatesNotice } from "../tips.js";
import { icon } from "../sprites.js";
import { isCooked, cookSlot } from "../cooked.js";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The meals planned on a date: [{ m: "dinner", r: recipe }] in breakfast, lunch, dinner order.
function mealsOn(date) {
  const meals = store.week(weekKey(date)).meals || [], day = WEEKDAYS[date.getDay()];
  const key = weekKey(date);
  return MEALS.flatMap(m => meals.filter(x => x.slots.includes(`${day}-${m}`)).map(x => {
    const leftover = cookSlot(key, x) !== `${day}-${m}`;
    return { m, r: store.recipe(x.rid), leftover, cooked: isCooked(x) && !leftover };
  }))
    .filter(x => x.r);
}

/**
 * Swipe between Today and Week: left on Today goes to Week, right on Week back to Today. A short, mostly
 * sideways swipe only; not from the screen's edges (the system's own gestures), not on rows that scroll
 * sideways or in text boxes, and not while a sheet is open or `when()` says no (moving a meal in Week).
 */
export function planSwipe(href, dir, when = () => true) {
  const page = document.querySelector("#app .page");
  if (!page) return;
  let x0 = 0, y0 = 0, t0 = 0, ok = false;
  page.addEventListener("touchstart", e => {
    const t = e.touches[0];
    ok = e.touches.length === 1 && when() && !document.getElementById("modal")?.open
      && t.clientX > 24 && t.clientX < innerWidth - 24
      && !e.target.closest("input, textarea, select, .chipscroll, .weekgrid, [data-noswipe]");
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
  }, { passive: true });
  page.addEventListener("touchend", e => {
    if (!ok) return;
    ok = false;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Date.now() - t0 > 700 || Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || (dir === "left") !== (dx < 0)) return;
    try { sessionStorage.setItem("rb.slide", dir); } catch {}
    location.hash = href;
  }, { passive: true });
  // Arrived by a swipe: slide in from that side.
  let slide = null;
  try { slide = sessionStorage.getItem("rb.slide"); sessionStorage.removeItem("rb.slide"); } catch {}
  if (slide) page.classList.add(slide === "left" ? "slide-from-right" : "slide-from-left");
}

/** The Today | Week switch shared by Today and the meal plan. */
export const planSwitch = on => `<div class="seg planseg" role="group" aria-label="Plan view">
  <a href="#/" ${on === "today" ? 'aria-current="page"' : ""}>Today</a><a href="#/plan" ${on === "week" ? 'aria-current="page"' : ""}>Week</a></div>`;

const cookedTag = `<span class="cooked">${icon("check", "ic14")}Cooked</span>`;

export function todayView({ backupNag = "" } = {}) {
  const now = new Date();
  const today = mealsOn(now), tomorrow = mealsOn(addDays(now, 1));
  const hero = today.find(x => x.m === "dinner") || today[today.length - 1];
  const rest = today.filter(x => x !== hero);
  const n = Object.keys(store.get().recipes).length;

  // Groceries for the week you're shopping for, and when shopping day is.
  const wk = planningWeekKey(now);
  let toBuy = 0;
  try { const sec = sectionize(wk); toBuy = sec.buy.filter(i => !i.checked).length + sec.extras.filter(e => !e.checked).length + inWeek(wk).filter(h => !h.checked).length; } catch {}
  const away = (prepDay() - now.getDay() + 7) % 7;
  const shopDay = away === 0 ? "today" : away === 1 ? "tomorrow" : `on ${DAY_LONG[prepDay()]}`;

  const meta = r => {
    const nu = nutritionFor(r), bits = [];
    if (r.totalMin) bits.push(`${r.totalMin} min`);
    if (r.yield) bits.push(plural(r.yield, "serving"));
    if (nu.kcal) bits.push(`${Math.round(nu.kcal)} kcal`);
    return bits.join(", ");
  };
  const heroPhoto = hero && photoOf(hero.r.id);

  render(shell({
    title: "Today",
    back: null,
    actions: planSwitch("today"),
    body: `
      <div class="csub"><span>${esc(fmtDate(now, { weekday: "long", month: "long", day: "numeric" }))}</span></div>
      ${hero ? `<section class="card tdhero" aria-label="${cap(hero.m)} today">
        ${heroPhoto ? `<img class="tdphoto" data-photo src="${esc(heroPhoto)}" alt="" decoding="sync" referrerpolicy="no-referrer">` : ""}
        <div class="tdbody">
          <div class="tdkind">${hero.m === "dinner" ? "Dinner tonight" : `${cap(hero.m)} today`}${hero.leftover ? ", leftovers" : ""}${hero.r.ready ? `, store-bought${hero.r.ready.store ? `, ${esc(hero.r.ready.store)}` : ""}` : ""}${hero.cooked ? cookedTag : ""}</div>
          <a class="tdtitle" href="#/r/${hero.r.id}">${esc(hero.r.title)}</a>
          ${meta(hero.r) ? `<div class="tdmeta">${esc(meta(hero.r))}</div>` : ""}
          <div class="tdbtns">${hero.r.ready || hero.cooked ? `<a class="cbtn primary" href="#/r/${hero.r.id}">Open</a>` : `<a class="cbtn primary" href="#/r/${hero.r.id}" data-cook="${hero.r.id}">Start cooking</a>`}<a class="cbtn" href="#/plan">Change</a></div>
        </div>
      </section>` : `<section class="card tdempty">
        <b>Nothing planned today</b>
        <p>${n ? "Pick something from your recipes for today or the rest of the week." : "Add a recipe from a link, a cookbook photo or by typing it, then plan it here."}</p>
        <div class="tdbtns">${n ? `<a class="cbtn primary" href="#/plan">Plan a meal</a>` : `<a class="cbtn primary" href="#/add">Add a recipe</a>`}</div>
      </section>`}
      ${rest.length ? `<div class="card"><ul class="glist">${rest.map(x => `<li class="tdrow"><a href="#/r/${x.r.id}"><span class="tdslot">${cap(x.m)}</span><span class="tdname">${esc(x.r.title)}</span>${x.cooked ? cookedTag : x.leftover ? `<span class="tdtag">Leftovers</span>` : ""}</a></li>`).join("")}</ul></div>` : ""}
      <a class="card tdlist" href="#/grocery/${wk}">
        <span class="tdlisttext"><b>Groceries</b><small>${toBuy ? `${toBuy} to get, shopping day is ${shopDay}` : `Shopping day is ${shopDay}`}</small></span>
        <span class="tdgo">${icon("chevRight", "ic16")}</span>
      </a>
      ${tomorrow.length ? `<p class="tdnext"><span>Tomorrow</span> ${esc((tomorrow.find(x => x.m === "dinner") || tomorrow[0]).r.title)}</p>` : ""}
      ${hero && nutritionFor(hero.r).kcal ? estimatesNoticeHTML() : ""}
      ${backupNag}`
  }));
  bindEstimatesNotice(document.getElementById("app"));
  planSwipe("#/plan", "left");
  // Start cooking: open the recipe straight into cook mode.
  document.querySelector("[data-cook]")?.addEventListener("click", e => { try { sessionStorage.setItem("rb.cookNow", e.currentTarget.dataset.cook); } catch {} });
}
