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
