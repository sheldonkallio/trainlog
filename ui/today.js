// Today screen: header, backup reminder, run card, strength card, add buttons.
import { h } from "./dom.js";
import { openSheet } from "./sheet.js";
import { addDays, formatDay } from "../lib/dates.js";
import { resolveDay, isLogged } from "../lib/plan.js";
import { setRunLog, clearRunLog, runSummary, parseNum, durationFromParts } from "../lib/logs.js";
import { backupReminder } from "../lib/store.js";
import { backUp } from "./backup.js";

export function renderToday(app, iso) {
  const day = resolveDay(app.plan, app.data, iso);
  return h("div", { class: "screen" },
    dayHeader(app, day),
    reminderLine(app),
    day.inPlan ? null : h("p", { class: "note" }, "No plan for this date."),
    day.inPlan && !day.run && !day.strength ? h("p", { class: "note" }, "Rest day") : null,
    day.run ? runCard(app, day) : null,
    day.strength ? strengthCard(app, day) : null);
}

function dayHeader(app, day) {
  const picker = h("input", { type: "date", class: "visually-hidden", tabIndex: -1, value: day.date,
    onchange: e => { if (e.target.value) app.go("day", e.target.value); } });
  const openPicker = () => { try { picker.showPicker(); } catch { picker.click(); } };
  return h("header", { class: "day-head" },
    h("div", { class: "day-nav" },
      h("button", { class: "icon-btn", "aria-label": "Previous day", onclick: () => app.go("day", addDays(day.date, -1)) }, "‹"),
      h("button", { class: "day-title", "aria-label": "Pick a date", onclick: openPicker }, formatDay(day.date)),
      h("button", { class: "icon-btn", "aria-label": "Next day", onclick: () => app.go("day", addDays(day.date, 1)) }, "›"),
      picker),
    h("div", { class: "day-sub" },
      day.week != null ? `Week ${day.week}` : "Outside the plan",
      day.phase ? h("span", { class: "pill" }, day.phase.name) : null,
      day.phase?.guidance ? `lift at ${day.phase.guidance}` : null,
      day.date !== app.today ? h("button", { class: "link-btn", onclick: () => app.go("day", app.today) }, "Today") : null));
}

function reminderLine(app) {
  const r = backupReminder(app.data, app.today);
  if (!r) return null;
  const text = r.never ? `No backup yet · Back up` : `Last backup ${r.days} days ago · Back up`;
  return h("button", { class: "reminder", onclick: () => backUp(app) }, text);
}

export function stateTag(card) {
  if (card.state === "swapped") return h("span", { class: "tag" }, "Swapped");
  if (card.state === "added") return h("span", { class: "tag" }, "Added");
  if (card.state === "moved-in") return h("span", { class: "tag" }, `Moved from ${formatDay(card.movedFrom)}`);
  return null;
}

export function cardShell(app, day, card, titleChildren, bodyChildren) {
  const offState = card.state === "skipped" || card.state === "moved-out";
  let body = bodyChildren;
  if (card.state === "skipped") body = h("p", { class: "muted" }, "Skipped");
  if (card.state === "moved-out") body = h("button", { class: "link-btn", onclick: () => app.go("day", card.movedTo) }, `Moved to ${formatDay(card.movedTo)} ›`);
  return h("section", { class: "card" + (offState ? " card-off" : "") },
    h("div", { class: "card-head" }, h("div", { class: "card-title" }, titleChildren, stateTag(card)), menuButton(app, day, card)),
    body);
}

function menuButton(app, day, card) { return null; } // Task 11

function runCard(app, day) {
  const card = day.run;
  const body = [
    card.item.description ? h("p", { class: "muted" }, card.item.description) : null,
    isLogged(card)
      ? h("button", { class: "summary", onclick: () => runSheet(app, day.date) }, "✓ ", runSummary(card.log))
      : h("button", { class: "btn", onclick: () => runSheet(app, day.date) }, "Log run"),
  ];
  return cardShell(app, day, card, ["🏃 ", card.item.type], body);
}

function runSheet(app, iso) {
  const log = app.data.runLogs[iso] || {};
  openSheet("Log run", close => {
    const km = h("input", { type: "text", inputMode: "decimal", value: log.km ?? "" });
    const hrs = h("input", { type: "text", inputMode: "numeric", value: log.minutes >= 60 ? Math.floor(log.minutes / 60) : "" });
    const mins = h("input", { type: "text", inputMode: "numeric", value: log.minutes != null ? log.minutes % 60 : "" });
    const hr = h("input", { type: "text", inputMode: "numeric", value: log.avgHr ?? "" });
    const notes = h("textarea", { value: log.notes ?? "" });
    let rpe = log.rpe ?? null;
    const rpeRow = h("div", { class: "rpe" }, Array.from({ length: 10 }, (_, i) => i + 1).map(v =>
      h("button", { class: v === rpe ? "on" : "", "aria-label": `RPE ${v}`, onclick: () => {
        rpe = rpe === v ? null : v;
        [...rpeRow.children].forEach((b, j) => b.classList.toggle("on", j + 1 === rpe));
      } }, v)));
    const save = () => {
      const fields = { done: true, km: parseNum(km.value), minutes: durationFromParts(hrs.value, mins.value), avgHr: parseNum(hr.value), rpe, notes: notes.value.trim() };
      if (app.commit(setRunLog(app.data, iso, fields))) close();
    };
    requestAnimationFrame(() => km.focus());
    return h("div", {},
      h("label", { class: "field" }, "Distance (km)", km),
      h("div", { class: "two" }, h("label", { class: "field" }, "Hours", hrs), h("label", { class: "field" }, "Minutes", mins)),
      h("label", { class: "field" }, "Avg HR", hr),
      h("div", { class: "field" }, "RPE", rpeRow),
      h("label", { class: "field" }, "Notes", notes),
      h("button", { class: "btn", onclick: save }, "Save run ✓"),
      app.data.runLogs[iso] ? h("button", { class: "btn btn-danger-quiet", onclick: () => { if (app.commit(clearRunLog(app.data, iso))) close(); } }, "Clear log") : null);
  });
}

function strengthCard(app, day) {
  const card = day.strength;
  return cardShell(app, day, card, ["🏋️ Session ", card.item.session], h("p", { class: "muted" }, "Strength logging comes in the next step."));
}
