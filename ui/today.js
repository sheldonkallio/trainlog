// Today screen: header, backup reminder, run card, strength card, add buttons.
import { h } from "./dom.js";
import { openSheet } from "./sheet.js";
import { addDays, formatDay } from "../lib/dates.js";
import { resolveDay, isLogged, exercisesFor, targetFor } from "../lib/plan.js";
import { setRunLog, clearRunLog, runSummary, parseNum, durationFromParts, exerciseRows, toggleSet, editSet, removeSet, addSet, setExerciseRpe, setStrengthNotes } from "../lib/logs.js";
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

const RPE_CHOICES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const fmtSet = r => `${r.kg ?? "–"} kg × ${r.reps ?? "–"}`;

function strengthCard(app, day) {
  const card = day.strength;
  const session = card.item.session;
  const iso = day.date;
  const exercises = exercisesFor(app.plan, session);
  const blocks = exercises.map(ex => {
    const target = targetFor(app.plan, day.phase?.name, ex.role);
    return { ex, target, rows: exerciseRows(app.data, iso, ex.id, target) };
  });
  const total = blocks.reduce((n, b) => n + b.rows.length, 0);
  const done = blocks.reduce((n, b) => n + b.rows.filter(r => r.done).length, 0);
  const notes = h("textarea", { class: "notes", value: app.data.strengthLogs[iso]?.notes ?? "",
    onchange: e => app.commit(setStrengthNotes(app.data, iso, session, e.target.value.trim()), { rerender: false }) });
  const body = [
    exercises.length ? null : h("p", { class: "muted" }, `Session ${session} has no exercises in the plan.`),
    blocks.map(b => exerciseBlock(app, iso, session, b)),
    exercises.length ? h("label", { class: "field" }, "Session notes", notes) : null,
  ];
  return cardShell(app, day, card, ["🏋️ Session ", session, h("span", { class: "tag" }, `${done}/${total} sets`)], body);
}

function exerciseBlock(app, iso, session, { ex, target, rows }) {
  const rpe = app.data.strengthLogs[iso]?.exercises?.[ex.id]?.rpe ?? null;
  const update = fn => app.commit(fn(app.data));
  return h("div", { class: "exercise" },
    h("div", { class: "ex-head" }, h("b", {}, ex.name), target ? h("span", { class: "target" }, target) : null),
    rows.map((r, i) => h("div", { class: "set" + (r.done ? " done" : "") },
      h("span", { class: "set-n" }, i + 1),
      h("button", { class: "set-val", "aria-label": `Edit set ${i + 1}`, onclick: () => setSheet(app, iso, session, ex, target, i, r) }, fmtSet(r)),
      h("button", {
        class: "check" + (r.done ? " on" : ""),
        "aria-label": r.done ? `Undo set ${i + 1}` : `Log set ${i + 1}`,
        onclick: () => (!r.done && r.kg == null && r.reps == null)
          ? setSheet(app, iso, session, ex, target, i, r)
          : update(d => toggleSet(d, iso, session, ex.id, target, i)),
      }, r.done ? "✓" : ""))),
    h("div", { class: "ex-foot" },
      h("button", { class: "link-btn", onclick: () => update(d => addSet(d, iso, session, ex.id, target)) }, "+ set"),
      h("select", { "aria-label": `${ex.name} RPE`,
        onchange: e => update(d => setExerciseRpe(d, iso, session, ex.id, target, e.target.value ? Number(e.target.value) : null)) },
        h("option", { value: "" }, "RPE –"),
        RPE_CHOICES.map(v => h("option", { value: String(v), selected: rpe === v }, `RPE ${v}`)))));
}

function setSheet(app, iso, session, ex, target, i, row) {
  openSheet(`${ex.name} · set ${i + 1}`, close => {
    const kg = h("input", { type: "text", inputMode: "decimal", value: row.kg ?? "", "aria-label": "Weight in kg" });
    const reps = h("input", { type: "text", inputMode: "numeric", value: row.reps ?? "", "aria-label": "Reps" });
    const bump = (input, delta) => {
      const v = Math.max(0, (parseNum(input.value) ?? 0) + delta);
      input.value = String(Math.round(v * 100) / 100);
    };
    const stepper = (label, input, step) => h("div", { class: "stepper" },
      h("span", {}, label),
      h("button", { "aria-label": `${label} minus ${step}`, onclick: () => bump(input, -step) }, `−${step}`),
      input,
      h("button", { "aria-label": `${label} plus ${step}`, onclick: () => bump(input, step) }, `+${step}`));
    const save = () => {
      if (app.commit(editSet(app.data, iso, session, ex.id, target, i, { kg: parseNum(kg.value), reps: parseNum(reps.value) }))) close();
    };
    return h("div", {},
      stepper("kg", kg, 2.5),
      stepper("reps", reps, 1),
      h("button", { class: "btn", onclick: save }, "Save set ✓"),
      h("button", { class: "btn btn-danger-quiet", onclick: () => { if (app.commit(removeSet(app.data, iso, session, ex.id, target, i))) close(); } }, "Remove set"));
  });
}
