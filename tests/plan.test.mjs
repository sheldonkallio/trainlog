import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adaptSeed, weekForDate, weekRange, phaseForWeek, targetFor, exercisesFor, intensityOf } from "../lib/plan.js";

const raw = () => JSON.parse(readFileSync(new URL("./fixtures/seed.sample.json", import.meta.url), "utf8"));
const plan = adaptSeed(raw());

test("adaptSeed indexes every day by date", () => {
  assert.equal(plan.dayByDate.size, 14);
  assert.deepEqual(plan.dayByDate.get("2026-11-11"),
    { date: "2026-11-11", week: 1, run: { type: "MP", description: "2×3 km @ MP", km: 10 }, session: "B" });
  assert.deepEqual(plan.dayByDate.get("2026-11-10"), { date: "2026-11-10", week: 1, run: null, session: null });
});

test("adaptSeed lists run types in first-seen order", () => {
  assert.deepEqual(plan.runTypes, ["Easy Z2", "MP", "Long", "Intervals"]);
});

test("adaptSeed rejects a broken file with a reason", () => {
  assert.throws(() => adaptSeed(null), /plan.seed.json: not a JSON object/);
  assert.throws(() => adaptSeed({}), /meta.start and meta.end/);
  const badSession = raw(); badSession.weeks[0].days[0].session = "Z";
  assert.throws(() => adaptSeed(badSession), /2026-11-09: unknown session Z/);
  const badDate = raw(); badDate.weeks[0].days[1].date = "2026-11-31";
  assert.throws(() => adaptSeed(badDate), /week 1: bad date 2026-11-31/);
  const noTargets = raw(); delete noTargets.targetsByPhase;
  assert.throws(() => adaptSeed(noTargets), /targetsByPhase missing/);
});

test("weekForDate covers the first and last day of the block and nothing outside", () => {
  assert.equal(weekForDate(plan, "2026-11-09").number, 1);
  assert.equal(weekForDate(plan, "2026-11-15").number, 1);
  assert.equal(weekForDate(plan, "2026-11-16").number, 2);
  assert.equal(weekForDate(plan, "2026-11-22").number, 2);
  assert.equal(weekForDate(plan, "2026-11-08"), null);
  assert.equal(weekForDate(plan, "2026-11-23"), null);
});

test("weekRange gives the first and last date of a week", () => {
  assert.deepEqual(weekRange(plan.weeks[1]), { start: "2026-11-16", end: "2026-11-22" });
});

test("phases, targets and exercises", () => {
  assert.equal(phaseForWeek(plan, 1).name, "Re-entry");
  assert.equal(phaseForWeek(plan, 2).name, "Build");
  assert.equal(phaseForWeek(plan, 3), null);
  assert.equal(targetFor(plan, "Re-entry", "lowerMain"), "3×6–8 @ RPE 6–7");
  assert.equal(targetFor(plan, "Build", "core"), "3×45 s");
  assert.equal(targetFor(plan, "Nope", "core"), "");
  assert.equal(targetFor(plan, undefined, "core"), "");
  assert.deepEqual(exercisesFor(plan, "C").map(e => e.id), ["squat", "pullup", "plank"]);
  assert.deepEqual(exercisesFor(plan, "Z"), []);
});

test("intensityOf groups run types by name", () => {
  assert.equal(intensityOf("Easy Z2"), "easy");
  assert.equal(intensityOf("Recovery"), "easy");
  assert.equal(intensityOf("Long"), "long");
  assert.equal(intensityOf("MP"), "tempo");
  assert.equal(intensityOf("Tempo"), "tempo");
  assert.equal(intensityOf("Threshold"), "tempo");
  assert.equal(intensityOf("Intervals"), "interval");
  assert.equal(intensityOf("Hill repeats"), "interval");
  assert.equal(intensityOf("Strides"), "other");
  assert.equal(intensityOf(undefined), "other");
});
