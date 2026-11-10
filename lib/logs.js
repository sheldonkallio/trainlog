// Run logs, strength sets, pre-fill from history, and weekly sums.
// Updaters return new data and never change what they're given.
import { resolveDay, isLogged } from "./plan.js";

export function parseNum(text) {
  if (text == null) return null;
  const s = String(text).trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

export function durationFromParts(hours, minutes) {
  const h = parseNum(hours), m = parseNum(minutes);
  if (h == null && m == null) return null;
  return Math.round((h ?? 0) * 60 + (m ?? 0));
}

export function formatDuration(min) {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}

export function runSummary(log) {
  const parts = [];
  if (log.km != null) parts.push(`${log.km} km`);
  if (log.minutes != null) parts.push(formatDuration(log.minutes));
  if (log.avgHr != null) parts.push(`HR ${log.avgHr}`);
  if (log.rpe != null) parts.push(`RPE ${log.rpe}`);
  return parts.length ? parts.join(" · ") : "Done";
}

export function setRunLog(data, iso, fields) {
  const next = structuredClone(data);
  next.runLogs[iso] = { done: true, km: null, minutes: null, avgHr: null, rpe: null, notes: "", ...next.runLogs[iso], ...fields };
  return next;
}

export function clearRunLog(data, iso) {
  const next = structuredClone(data);
  delete next.runLogs[iso];
  return next;
}

export function defaultSetCount(target) {
  const m = String(target ?? "").match(/(\d+)\s*[×x]/);
  return m ? Number(m[1]) : 3;
}

export function lastSetsFor(data, exerciseId, beforeIso) {
  const dates = Object.keys(data.strengthLogs).filter(d => d < beforeIso).sort().reverse();
  for (const d of dates) {
    const done = (data.strengthLogs[d].exercises?.[exerciseId]?.sets || []).filter(s => s.done);
    if (done.length) return done.map(({ kg, reps }) => ({ kg, reps }));
  }
  return null;
}

export function exerciseRows(data, iso, exerciseId, target) {
  const own = data.strengthLogs[iso]?.exercises?.[exerciseId]?.sets;
  if (own) return own.map(s => ({ ...s }));
  const base = lastSetsFor(data, exerciseId, iso)
    || Array.from({ length: defaultSetCount(target) }, () => ({ kg: null, reps: null }));
  return base.map(s => ({ kg: s.kg, reps: s.reps, done: false }));
}

function withLog(data, iso, session) {
  const next = structuredClone(data);
  const log = (next.strengthLogs[iso] ||= { session, exercises: {}, notes: "" });
  return { next, log };
}

function withExercise(data, iso, session, exerciseId, target, change) {
  const rows = exerciseRows(data, iso, exerciseId, target);
  const { next, log } = withLog(data, iso, session);
  const ex = (log.exercises[exerciseId] ||= {});
  ex.sets = rows;
  change(ex);
  return next;
}

export function toggleSet(data, iso, session, exerciseId, target, i) {
  return withExercise(data, iso, session, exerciseId, target, ex => { ex.sets[i].done = !ex.sets[i].done; });
}

export function editSet(data, iso, session, exerciseId, target, i, { kg, reps }) {
  return withExercise(data, iso, session, exerciseId, target, ex => { ex.sets[i] = { kg, reps, done: true }; });
}

export function removeSet(data, iso, session, exerciseId, target, i) {
  return withExercise(data, iso, session, exerciseId, target, ex => { ex.sets.splice(i, 1); });
}

export function addSet(data, iso, session, exerciseId, target) {
  return withExercise(data, iso, session, exerciseId, target, ex => {
    const last = ex.sets.at(-1);
    ex.sets.push({ kg: last?.kg ?? null, reps: last?.reps ?? null, done: false });
  });
}

export function setExerciseRpe(data, iso, session, exerciseId, target, rpe) {
  return withExercise(data, iso, session, exerciseId, target, ex => {
    if (rpe == null) delete ex.rpe; else ex.rpe = rpe;
  });
}

export function setStrengthNotes(data, iso, session, notes) {
  const { next, log } = withLog(data, iso, session);
  log.notes = notes;
  return next;
}

const isActive = card => card.state !== "skipped" && card.state !== "moved-out";

export function dayStatus(day, today) {
  const cards = [day.run, day.strength].filter(Boolean);
  const changed = cards.some(c => c.state !== "planned");
  const active = cards.filter(isActive);
  const logged = active.filter(isLogged).length;
  let mark;
  if (!active.length) mark = cards.some(c => c.state === "skipped") ? "skipped" : "rest";
  else if (logged === active.length) mark = "done";
  else if (logged > 0) mark = "partial";
  else mark = day.date < today ? "not-logged" : "planned";
  return { mark, changed };
}

const round1 = x => Math.round(x * 10) / 10;

export function weekTotals(plan, data, weekNumber) {
  const week = plan.weeks.find(w => w.number === weekNumber);
  const t = { plannedKm: 0, loggedKm: 0, loggedMinutes: 0, plannedMinutes: 0, hasPlannedMinutes: false, strengthPlanned: 0, strengthDone: 0 };
  if (!week) return t;
  for (const { date } of week.days) {
    const { run, strength } = resolveDay(plan, data, date);
    if (run && isActive(run)) {
      if (run.item.km != null) t.plannedKm += run.item.km;
      if (run.item.minutes != null) { t.plannedMinutes += run.item.minutes; t.hasPlannedMinutes = true; }
    }
    if (run && isLogged(run)) { t.loggedKm += run.log.km || 0; t.loggedMinutes += run.log.minutes || 0; }
    if (strength && isActive(strength)) {
      t.strengthPlanned++;
      if (isLogged(strength)) t.strengthDone++;
    }
  }
  t.plannedKm = round1(t.plannedKm);
  t.loggedKm = round1(t.loggedKm);
  return t;
}
