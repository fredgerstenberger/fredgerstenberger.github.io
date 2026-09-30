// Kitchen timers: tap a time in a step to start one. Survive reloads; beep (8-bit style) when done.
import { esc, uid } from "./util.js";

const KEY = "recipebox.timers";
let timers = load();
let audio = null;
let tick = null;
let dock = null;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(timers)); } catch {}
}

// iOS only allows audio after a tap, so unlock it when a timer is started.
function unlockAudio() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const o = audio.createOscillator(), g = audio.createGain();
    g.gain.value = 0; o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.01);
  } catch {}
}

function chiptune() {
  if (!audio) return;
  const notes = [784, 988, 1175, 1568];
  const t0 = audio.currentTime;
  notes.forEach((f, i) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "square"; o.frequency.value = f;
    g.gain.setValueAtTime(0.08, t0 + i * 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.12 + 0.11);
    o.connect(g).connect(audio.destination);
    o.start(t0 + i * 0.12); o.stop(t0 + i * 0.12 + 0.12);
  });
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
}

const left = t => t.pausedLeft != null ? t.pausedLeft : Math.max(0, t.endsAt - Date.now());

function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function startTimer(minutes, label) {
  unlockAudio();
  const ms = Math.round(minutes * 60000);
  timers.push({ id: uid(), label, duration: ms, endsAt: Date.now() + ms, pausedLeft: null, done: false });
  persist();
  render();
}

function render() {
  if (!dock) return;
  if (!timers.length) {
    dock.hidden = true; dock.innerHTML = "";
    clearInterval(tick); tick = null;
    document.body.classList.remove("has-timers");
    return;
  }
  document.body.classList.add("has-timers");
  dock.hidden = false;
  dock.innerHTML = timers.map(t => {
    const ms = left(t);
    return `<div class="timer ${t.done ? "done" : ""} ${t.pausedLeft != null ? "paused" : ""}" data-id="${t.id}">
      <span class="tlabel">${esc(t.label)}</span>
      <span class="tclock" aria-live="off">${t.done ? "DONE" : fmt(ms)}</span>
      ${t.done ? "" : `<button class="tbtn" data-act="pause" aria-label="${t.pausedLeft != null ? "Resume" : "Pause"} timer">${t.pausedLeft != null ? "▶" : "❚❚"}</button>`}
      <button class="tbtn" data-act="stop" aria-label="${t.done ? "Dismiss" : "Cancel"} timer">✕</button>
    </div>`;
  }).join("");
  if (!tick) tick = setInterval(update, 500);
}

function update() {
  let changed = false, ringing = false;
  for (const t of timers) {
    if (!t.done && t.pausedLeft == null && left(t) <= 0) { t.done = true; t.doneAt = Date.now(); changed = true; }
    if (t.done) ringing = true;
  }
  if (changed) persist();
  // Ring every 2.5 s while any timer is done and not dismissed (for up to 2 minutes).
  if (ringing) {
    const now = Date.now();
    const active = timers.some(t => t.done && now - t.doneAt < 120000);
    if (active && (!update.last || now - update.last > 2500)) { chiptune(); update.last = now; }
  }
  if (changed) return render();
  dock.querySelectorAll(".timer").forEach(el => {
    const t = timers.find(x => x.id === el.dataset.id);
    if (t && !t.done) el.querySelector(".tclock").textContent = fmt(left(t));
  });
}

export function initTimers(el) {
  dock = el;
  dock.addEventListener("click", e => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const id = b.closest(".timer").dataset.id;
    const t = timers.find(x => x.id === id);
    if (!t) return;
    if (b.dataset.act === "stop") timers = timers.filter(x => x !== t);
    else if (t.pausedLeft != null) { t.endsAt = Date.now() + t.pausedLeft; t.pausedLeft = null; unlockAudio(); }
    else t.pausedLeft = left(t);
    persist();
    render();
  });
  render();
}

// Wrap time mentions ("10 minutes", "1-2 hours") in step text with tappable timer buttons.
const TIME_RE = /(\d+(?:\.\d+)?|\d+\s*\/\s*\d+)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;

export function linkTimes(escapedText, label) {
  return escapedText.replace(TIME_RE, (m, a, b, unit) => {
    const u = unit.toLowerCase();
    const mult = u.startsWith("h") ? 60 : u.startsWith("s") ? 1 / 60 : 1;
    const n = a.includes("/") ? a.split("/").reduce((x, y) => +x / +y) : parseFloat(a);
    const min = n * mult;
    if (!min || min > 24 * 60) return m;
    return `<button class="timelink" data-min="${min}" data-label="${esc(label)}" title="Start a timer">⏲ ${m}</button>`;
  });
}
