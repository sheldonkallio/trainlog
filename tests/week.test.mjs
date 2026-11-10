import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adaptSeed, resolveDay, setOverride } from "../lib/plan.js";
import { dayStatus, weekTotals, setRunLog, toggleSet } from "../lib/logs.js";
import { emptyData } from "../lib/store.js";

const seed = () => JSON.parse(readFileSync(new URL("./fixtures/seed.sample.json", import.meta.url), "utf8"));
const plan = adaptSeed(seed());
const status = (data, iso, today) => dayStatus(resolveDay(plan, data, iso), today);

test("planned, not-logged and rest", () => {
  const d = emptyData();
  assert.deepEqual(status(d, "2026-11-11", "2026-11-10"), { mark: "planned", changed: false });
  assert.deepEqual(status(d, "2026-11-11", "2026-11-11"), { mark: "planned", changed: false });
  assert.deepEqual(status(d, "2026-11-11", "2026-11-12"), { mark: "not-logged", changed: false });
  assert.deepEqual(status(d, "2026-11-10", "2026-11-12"), { mark: "rest", changed: false });
});

test("partial and done", () => {
  const p = setRunLog(emptyData(), "2026-11-11", { km: 10 });
  assert.deepEqual(status(p, "2026-11-11", "2026-11-12"), { mark: "partial", changed: false });
  const done = toggleSet(p, "2026-11-11", "B", "deadlift", "3×6–8", 0);
  assert.deepEqual(status(done, "2026-11-11", "2026-11-12"), { mark: "done", changed: false });
});

test("skipped cards don't count against done", () => {
  let d = setOverride(emptyData(), "2026-11-11", "run", { type: "skip" });
  d = setOverride(d, "2026-11-11", "strength", { type: "skip" });
  assert.deepEqual(status(d, "2026-11-11", "2026-11-12"), { mark: "skipped", changed: true });
  const half = toggleSet(setOverride(emptyData(), "2026-11-11", "run", { type: "skip" }), "2026-11-11", "B", "deadlift", "3×6–8", 0);
  assert.deepEqual(status(half, "2026-11-11", "2026-11-12"), { mark: "done", changed: true });
});

test("a day whose only card moved away shows as changed, not skipped", () => {
  const d = setOverride(emptyData(), "2026-11-13", "strength", { type: "move", to: "2026-11-10" });
  assert.deepEqual(status(d, "2026-11-13", "2026-11-12"), { mark: "rest", changed: true });
  assert.deepEqual(status(d, "2026-11-10", "2026-11-09"), { mark: "planned", changed: true });
});

test("weekTotals from the plan alone", () => {
  assert.deepEqual(weekTotals(plan, emptyData(), 1),
    { plannedKm: 40, loggedKm: 0, loggedMinutes: 0, plannedMinutes: 0, hasPlannedMinutes: false, strengthPlanned: 3, strengthDone: 0 });
});

test("weekTotals apply changes and logs", () => {
  let d = setRunLog(emptyData(), "2026-11-09", { km: 6.2, minutes: 38 });
  d = setRunLog(d, "2026-11-11", { km: 9.8, minutes: 55 });
  d = toggleSet(d, "2026-11-09", "A", "squat", "3×6–8", 0);
  d = setOverride(d, "2026-11-14", "run", { type: "skip" });
  d = setOverride(d, "2026-11-13", "strength", { type: "move", to: "2026-11-17" });
  const w1 = weekTotals(plan, d, 1);
  assert.equal(w1.plannedKm, 24);
  assert.equal(w1.loggedKm, 16);
  assert.equal(w1.loggedMinutes, 93);
  assert.equal(w1.strengthPlanned, 2);
  assert.equal(w1.strengthDone, 1);
  assert.equal(weekTotals(plan, d, 2).strengthPlanned, 4);
});

test("weekTotals include planned minutes only when the seed has them", () => {
  const s = seed();
  s.weeks[0].days[0].run.minutes = 40;
  const t = weekTotals(adaptSeed(s), emptyData(), 1);
  assert.equal(t.plannedMinutes, 40);
  assert.equal(t.hasPlannedMinutes, true);
});
