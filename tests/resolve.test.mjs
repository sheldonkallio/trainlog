import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adaptSeed, resolveDay, isLogged, setOverride, undoChange, addSession, canMoveTo, cardActions } from "../lib/plan.js";
import { emptyData } from "../lib/store.js";

const plan = adaptSeed(JSON.parse(readFileSync(new URL("./fixtures/seed.sample.json", import.meta.url), "utf8")));

test("a plain plan day has planned cards and no logs", () => {
  const d = resolveDay(plan, emptyData(), "2026-11-09");
  assert.equal(d.inPlan, true);
  assert.equal(d.week, 1);
  assert.equal(d.phase.name, "Re-entry");
  assert.deepEqual(d.run, { kind: "run", state: "planned", item: { type: "Easy Z2", description: "6 km easy", km: 6 }, log: null });
  assert.deepEqual(d.strength, { kind: "strength", state: "planned", item: { session: "A" }, log: null });
});

test("a rest day has no cards; a date outside the plan has no week or phase", () => {
  const rest = resolveDay(plan, emptyData(), "2026-11-10");
  assert.equal(rest.run, null);
  assert.equal(rest.strength, null);
  const out = resolveDay(plan, emptyData(), "2026-12-25");
  assert.deepEqual(out, { date: "2026-12-25", inPlan: false, week: null, phase: null, run: null, strength: null });
});

test("skip changes only that card", () => {
  const data = setOverride(emptyData(), "2026-11-09", "run", { type: "skip" });
  const d = resolveDay(plan, data, "2026-11-09");
  assert.equal(d.run.state, "skipped");
  assert.equal(d.strength.state, "planned");
});

test("swapping a run keeps its distance and says what it replaced", () => {
  const data = setOverride(emptyData(), "2026-11-11", "run", { type: "swap", runType: "Easy Z2" });
  const run = resolveDay(plan, data, "2026-11-11").run;
  assert.equal(run.state, "swapped");
  assert.deepEqual(run.item, { type: "Easy Z2", description: "Swapped from MP", km: 10 });
  assert.equal(run.original.type, "MP");
});

test("swapping a session", () => {
  const data = setOverride(emptyData(), "2026-11-11", "strength", { type: "swap", session: "C" });
  assert.deepEqual(resolveDay(plan, data, "2026-11-11").strength.item, { session: "C" });
});

test("a move shows on both dates", () => {
  const data = setOverride(emptyData(), "2026-11-11", "strength", { type: "move", to: "2026-11-12" });
  const src = resolveDay(plan, data, "2026-11-11").strength;
  assert.equal(src.state, "moved-out");
  assert.equal(src.movedTo, "2026-11-12");
  const dst = resolveDay(plan, data, "2026-11-12").strength;
  assert.equal(dst.state, "moved-in");
  assert.equal(dst.movedFrom, "2026-11-11");
  assert.deepEqual(dst.item, { session: "B" });
});

test("canMoveTo refuses dates that already have that kind of card", () => {
  const data = emptyData();
  assert.equal(canMoveTo(plan, data, "strength", "2026-11-11", "2026-11-12"), true);
  assert.equal(canMoveTo(plan, data, "strength", "2026-11-11", "2026-11-13"), false);
  assert.equal(canMoveTo(plan, data, "run", "2026-11-11", "2026-11-12"), false);
  assert.equal(canMoveTo(plan, data, "run", "2026-11-11", "2026-11-11"), false);
  assert.equal(canMoveTo(plan, data, "run", "2026-11-11", "not-a-date"), false);
  const moved = setOverride(data, "2026-11-11", "strength", { type: "move", to: "2026-11-12" });
  assert.equal(canMoveTo(plan, moved, "strength", "2026-11-09", "2026-11-12"), false);
});

test("added sessions fill empty slots only, inside or outside the plan", () => {
  let data = addSession(plan, emptyData(), "2026-11-10", { kind: "run", runType: "Easy Z2" });
  assert.deepEqual(resolveDay(plan, data, "2026-11-10").run,
    { kind: "run", state: "added", item: { type: "Easy Z2", description: "", km: null }, log: null });
  assert.equal(addSession(plan, data, "2026-11-10", { kind: "run" }), data);
  assert.equal(addSession(plan, data, "2026-11-09", { kind: "strength", session: "B" }), data);
  data = addSession(plan, data, "2026-12-25", { kind: "strength", session: "A" });
  assert.equal(resolveDay(plan, data, "2026-12-25").strength.state, "added");
});

test("undo restores the plan for every kind of change", () => {
  const cases = [
    ["2026-11-09", "run", { type: "skip" }],
    ["2026-11-11", "run", { type: "swap", runType: "Long" }],
    ["2026-11-11", "strength", { type: "move", to: "2026-11-12" }],
  ];
  for (const [iso, kind, change] of cases) {
    const changed = setOverride(emptyData(), iso, kind, change);
    const back = undoChange(changed, resolveDay(plan, changed, iso)[kind], iso);
    assert.deepEqual(back.overrides, {}, `${kind} ${change.type}`);
    assert.equal(resolveDay(plan, back, iso)[kind].state, "planned");
  }
  const moved = setOverride(emptyData(), "2026-11-11", "strength", { type: "move", to: "2026-11-12" });
  const fromTarget = undoChange(moved, resolveDay(plan, moved, "2026-11-12").strength, "2026-11-12");
  assert.equal(resolveDay(plan, fromTarget, "2026-11-11").strength.state, "planned");
  assert.equal(resolveDay(plan, fromTarget, "2026-11-12").strength, null);
  const added = addSession(plan, emptyData(), "2026-11-10", { kind: "strength", session: "B" });
  const gone = undoChange(added, resolveDay(plan, added, "2026-11-10").strength, "2026-11-10");
  assert.deepEqual(gone.added, {});
});

test("two changes on one date are independent", () => {
  let data = setOverride(emptyData(), "2026-11-11", "run", { type: "skip" });
  data = setOverride(data, "2026-11-11", "strength", { type: "swap", session: "A" });
  const back = undoChange(data, resolveDay(plan, data, "2026-11-11").run, "2026-11-11");
  assert.deepEqual(back.overrides, { "2026-11-11": { strength: { type: "swap", session: "A" } } });
});

test("change helpers never mutate their input", () => {
  const data = emptyData();
  const snap = JSON.stringify(data);
  setOverride(data, "2026-11-09", "run", { type: "skip" });
  addSession(plan, data, "2026-11-10", { kind: "run" });
  assert.equal(JSON.stringify(data), snap);
});

test("a log on a date with no card still shows, as an added card", () => {
  const data = { ...emptyData(), runLogs: { "2026-11-10": { done: true, km: 5, minutes: 30, avgHr: null, rpe: null, notes: "" } } };
  const run = resolveDay(plan, data, "2026-11-10").run;
  assert.equal(run.state, "added");
  assert.equal(run.log.km, 5);
  const strength = { ...emptyData(), strengthLogs: { "2026-11-12": { session: "A", exercises: { squat: { sets: [{ kg: 80, reps: 8, done: true }] } }, notes: "" } } };
  assert.deepEqual(resolveDay(plan, strength, "2026-11-12").strength.item, { session: "A" });
});

test("isLogged", () => {
  assert.equal(isLogged({ kind: "run", log: null }), false);
  assert.equal(isLogged({ kind: "run", log: { done: true } }), true);
  assert.equal(isLogged({ kind: "strength", log: { exercises: { squat: { sets: [{ kg: 80, reps: 8, done: false }] } } } }), false);
  assert.equal(isLogged({ kind: "strength", log: { exercises: { squat: { sets: [{ kg: 80, reps: 8, done: true }] } } } }), true);
});

test("cardActions never offer a change that would hide a log", () => {
  const done = { exercises: { squat: { sets: [{ kg: 80, reps: 8, done: true }] } } };
  assert.deepEqual(cardActions({ kind: "run", state: "planned", log: null }), ["skip", "swap", "move"]);
  assert.deepEqual(cardActions({ kind: "run", state: "planned", log: { done: true } }), ["swap"]);
  assert.deepEqual(cardActions({ kind: "run", state: "skipped", log: null }), ["undo"]);
  assert.deepEqual(cardActions({ kind: "run", state: "swapped", log: { done: true } }), ["undo"]);
  assert.deepEqual(cardActions({ kind: "run", state: "added", log: null }), ["undo"]);
  assert.deepEqual(cardActions({ kind: "run", state: "added", log: { done: true } }), []);
  assert.deepEqual(cardActions({ kind: "strength", state: "moved-in", log: null }), ["undo"]);
  assert.deepEqual(cardActions({ kind: "strength", state: "moved-in", log: done }), []);
  assert.deepEqual(cardActions({ kind: "strength", state: "moved-out", log: null }), ["undo"]);
});
