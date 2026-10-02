// Live notes for a partner's grocery changes: "Emma checked eggs", "Emma added coffee".
// The list is snapshotted before a sync is applied and compared after, so everything found is a
// change from another phone. Unchecks and removals update the list quietly (who did them isn't
// recorded), and a name is only shown when the other phone has one set.
import { parseAdd } from "./quickadd.js";

/** What's on a week's list right now, by line: { id: { name, checked, by, cb, added } }. */
export function snapshot(state, week) {
  const out = {}, g = state.grocery?.[week] || {};
  for (const [id, on] of Object.entries(g.checked || {})) if (on) out["i:" + id] = { name: g.edits?.[id]?.name || id, checked: true, cb: g.checkedBy?.[id] || "" };
  const manual = (list, pre) => list.forEach(e => { if (e?.id) out[pre + e.id] = { name: (parseAdd(e.text)?.name || e.text || "").toLowerCase(), checked: !!e.checked, cb: e.cb || "", by: e.by || "", added: true }; });
  manual(Object.entries(state.household || {}).map(([id, h]) => ({ id, ...h })), "h:");
  manual(g.extras || [], "x:");
  return out;
}

/** Changes between two snapshots worth a note: [{ who, verb: "checked" | "added", name }]. */
export function changes(before, after) {
  const out = [];
  for (const [id, a] of Object.entries(after)) {
    const b = before[id];
    if (!b && a.added) out.push({ who: a.by, verb: "added", name: a.name });
    if (a.checked && !b?.checked) out.push({ who: a.cb, verb: "checked", name: a.name });
  }
  return out;
}

const list = names => names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;

/** One short line for a toast, or "" if there's nothing to say. */
export function describe(chs) {
  if (!chs.length) return "";
  const who = [...new Set(chs.map(c => c.who))];
  const part = verb => { const n = chs.filter(c => c.verb === verb).map(c => c.name); return n.length ? `${verb} ${list(n)}` : ""; };
  const what = [part("checked"), part("added")].filter(Boolean).join(" · ");
  if (who.length === 1 && who[0]) return `${who[0]} ${what}`;
  return `${what.charAt(0).toUpperCase() + what.slice(1)} on another phone`;
}

/** The initial to show in a note or on a row ("Emma" → "E"). */
export const initial = name => (name || "").trim().charAt(0).toUpperCase();
