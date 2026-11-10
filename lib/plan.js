// The training plan (read-only) and the day you see after your changes are applied.
import { isISODate } from "./dates.js";

export function adaptSeed(raw) {
  const fail = msg => { throw new Error(`plan.seed.json: ${msg}`); };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("not a JSON object");
  const { meta, phases, weeks, sessionTemplates, targetsByPhase } = raw;
  if (!meta || !isISODate(meta.start) || !isISODate(meta.end)) fail("meta.start and meta.end must be YYYY-MM-DD dates");
  if (!Array.isArray(phases) || !phases.length) fail("phases must be a non-empty list");
  if (!Array.isArray(weeks) || !weeks.length) fail("weeks must be a non-empty list");
  if (!sessionTemplates || typeof sessionTemplates !== "object") fail("sessionTemplates missing");
  if (!targetsByPhase || typeof targetsByPhase !== "object") fail("targetsByPhase missing");
  const dayByDate = new Map();
  const runTypes = [];
  for (const w of weeks) {
    if (!Number.isInteger(w.number) || !Array.isArray(w.days)) fail("each week needs a number and a days list");
    for (const d of w.days) {
      if (!isISODate(d.date)) fail(`week ${w.number}: bad date ${d.date}`);
      if (d.session != null && !sessionTemplates[d.session]) fail(`${d.date}: unknown session ${d.session}`);
      dayByDate.set(d.date, { date: d.date, week: w.number, run: d.run || null, session: d.session || null });
      if (d.run && !runTypes.includes(d.run.type)) runTypes.push(d.run.type);
    }
  }
  return { meta, phases, weeks, sessionTemplates, targetsByPhase, dayByDate, runTypes };
}

export function weekForDate(plan, iso) {
  const day = plan.dayByDate.get(iso);
  return day ? plan.weeks.find(w => w.number === day.week) : null;
}

export function weekRange(week) {
  return { start: week.days[0].date, end: week.days[week.days.length - 1].date };
}

export function phaseForWeek(plan, n) {
  return plan.phases.find(p => n >= p.fromWeek && n <= p.toWeek) || null;
}

export function targetFor(plan, phaseName, role) {
  return plan.targetsByPhase[phaseName]?.[role] ?? "";
}

export function exercisesFor(plan, session) {
  return plan.sessionTemplates[session] || [];
}

export function intensityOf(type) {
  const t = String(type ?? "").toLowerCase();
  if (/interval|repeat|\breps\b|hill|vo2/.test(t)) return "interval";
  if (/\bmp\b|marathon pace|tempo|threshold/.test(t)) return "tempo";
  if (/long/.test(t)) return "long";
  if (/easy|z2|zone 2|recovery|aerobic/.test(t)) return "easy";
  return "other";
}

const KINDS = ["run", "strength"];

function plannedItem(day, kind) {
  if (!day) return null;
  if (kind === "run") return day.run ? { ...day.run } : null;
  return day.session ? { session: day.session } : null;
}

function logHasContent(kind, log) {
  if (!log) return false;
  if (kind === "run") return !!log.done;
  return Object.values(log.exercises || {}).some(e => (e.sets || []).some(s => s.done));
}

export function isLogged(card) {
  return !!card && logHasContent(card.kind, card.log);
}

function movedInFrom(data, kind, iso) {
  for (const [date, o] of Object.entries(data.overrides)) {
    if (o[kind]?.type === "move" && o[kind].to === iso) return date;
  }
  return null;
}

export function resolveDay(plan, data, iso) {
  const day = plan.dayByDate.get(iso) || null;
  const week = day ? day.week : null;
  const out = { date: iso, inPlan: !!day, week, phase: week != null ? phaseForWeek(plan, week) : null, run: null, strength: null };
  for (const kind of KINDS) {
    const planned = plannedItem(day, kind);
    const ov = data.overrides[iso]?.[kind];
    let card = null;
    if (planned) {
      if (!ov) card = { kind, state: "planned", item: planned };
      else if (ov.type === "skip") card = { kind, state: "skipped", item: planned };
      else if (ov.type === "move") card = { kind, state: "moved-out", item: planned, movedTo: ov.to };
      else if (ov.type === "swap") {
        const item = kind === "run"
          ? { type: ov.runType, description: `Swapped from ${planned.type}`, km: planned.km ?? null }
          : { session: ov.session };
        card = { kind, state: "swapped", item, original: planned };
      }
    }
    if (!card) {
      const src = movedInFrom(data, kind, iso);
      const srcItem = src && plannedItem(plan.dayByDate.get(src), kind);
      if (srcItem) card = { kind, state: "moved-in", item: srcItem, movedFrom: src };
    }
    if (!card) {
      const add = (data.added[iso] || []).find(a => a.kind === kind);
      if (add) card = { kind, state: "added", item: kind === "run" ? { type: add.runType || "Run", description: "", km: null } : { session: add.session } };
    }
    const log = (kind === "run" ? data.runLogs[iso] : data.strengthLogs[iso]) || null;
    if (!card && logHasContent(kind, log)) {
      card = { kind, state: "added", item: kind === "run" ? { type: "Run", description: "", km: null } : { session: log.session } };
    }
    if (card) card.log = log;
    out[kind] = card;
  }
  return out;
}

export function setOverride(data, iso, kind, change) {
  const next = structuredClone(data);
  next.overrides[iso] = { ...next.overrides[iso], [kind]: change };
  return next;
}

function dropOverride(d, iso, kind) {
  if (!d.overrides[iso]) return;
  delete d.overrides[iso][kind];
  if (!Object.keys(d.overrides[iso]).length) delete d.overrides[iso];
}

export function undoChange(data, card, iso) {
  const next = structuredClone(data);
  if (card.state === "moved-in") dropOverride(next, card.movedFrom, card.kind);
  else if (card.state === "added") {
    next.added[iso] = (next.added[iso] || []).filter(a => a.kind !== card.kind);
    if (!next.added[iso].length) delete next.added[iso];
  } else dropOverride(next, iso, card.kind);
  return next;
}

export function addSession(plan, data, iso, entry) {
  if (resolveDay(plan, data, iso)[entry.kind]) return data;
  const next = structuredClone(data);
  (next.added[iso] ||= []).push(entry);
  return next;
}

export function canMoveTo(plan, data, kind, from, to) {
  return isISODate(to) && to !== from && resolveDay(plan, data, to)[kind] === null;
}

export function cardActions(card) {
  const logged = isLogged(card);
  if (card.state === "planned") return logged ? ["swap"] : ["skip", "swap", "move"];
  if (logged && (card.state === "added" || card.state === "moved-in")) return [];
  return ["undo"];
}
