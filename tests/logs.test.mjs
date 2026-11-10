import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNum, durationFromParts, formatDuration, runSummary, setRunLog, clearRunLog, defaultSetCount, lastSetsFor, exerciseRows, toggleSet, editSet, removeSet, addSet, setExerciseRpe, setStrengthNotes } from "../lib/logs.js";
import { emptyData } from "../lib/store.js";

const T = "3×6–8 @ RPE 6–7";
const history = () => {
  const d = emptyData();
  d.strengthLogs["2026-11-09"] = { session: "A", exercises: { squat: { sets: [{ kg: 75, reps: 8, done: true }, { kg: 75, reps: 8, done: true }] } }, notes: "" };
  d.strengthLogs["2026-11-13"] = { session: "C", exercises: { squat: { sets: [{ kg: 80, reps: 8, done: true }, { kg: 80, reps: 6, done: true }, { kg: 80, reps: 6, done: false }] } }, notes: "" };
  return d;
};

test("parseNum accepts commas and rejects junk", () => {
  assert.equal(parseNum("6.2"), 6.2);
  assert.equal(parseNum("6,2"), 6.2);
  assert.equal(parseNum("62,5"), 62.5);
  assert.equal(parseNum(" 80 "), 80);
  assert.equal(parseNum(80), 80);
  assert.equal(parseNum(""), null);
  assert.equal(parseNum("abc"), null);
  assert.equal(parseNum("-5"), null);
  assert.equal(parseNum(null), null);
});

test("durations", () => {
  assert.equal(durationFromParts("", "38"), 38);
  assert.equal(durationFromParts("1", "5"), 65);
  assert.equal(durationFromParts("2", ""), 120);
  assert.equal(durationFromParts("", ""), null);
  assert.equal(formatDuration(38), "38 min");
  assert.equal(formatDuration(65), "1h 05m");
  assert.equal(formatDuration(161), "2h 41m");
  assert.equal(formatDuration(0), "0 min");
});

test("runSummary skips empty fields", () => {
  assert.equal(runSummary({ done: true, km: 6.2, minutes: 38, avgHr: 141, rpe: 3 }), "6.2 km · 38 min · HR 141 · RPE 3");
  assert.equal(runSummary({ done: true, km: 5, minutes: null, avgHr: null, rpe: null }), "5 km");
  assert.equal(runSummary({ done: true }), "Done");
});

test("setRunLog fills defaults and merges; clearRunLog removes", () => {
  let d = setRunLog(emptyData(), "2026-11-09", { km: 6.2 });
  assert.deepEqual(d.runLogs["2026-11-09"], { done: true, km: 6.2, minutes: null, avgHr: null, rpe: null, notes: "" });
  d = setRunLog(d, "2026-11-09", { rpe: 3 });
  assert.equal(d.runLogs["2026-11-09"].km, 6.2);
  assert.equal(d.runLogs["2026-11-09"].rpe, 3);
  assert.deepEqual(clearRunLog(d, "2026-11-09").runLogs, {});
});

test("defaultSetCount reads the leading set count", () => {
  assert.equal(defaultSetCount("3×6–8 @ RPE 6–7"), 3);
  assert.equal(defaultSetCount("4x5"), 4);
  assert.equal(defaultSetCount("2 × 30–45 s"), 2);
  assert.equal(defaultSetCount("AMRAP"), 3);
  assert.equal(defaultSetCount(""), 3);
});

test("lastSetsFor uses the latest earlier log in any session, done sets only", () => {
  const d = history();
  d.strengthLogs["2026-11-16"] = { session: "A", exercises: { squat: { sets: [{ kg: 85, reps: 5, done: true }] } }, notes: "" };
  assert.deepEqual(lastSetsFor(d, "squat", "2026-11-16"), [{ kg: 80, reps: 8 }, { kg: 80, reps: 6 }]);
  assert.deepEqual(lastSetsFor(d, "squat", "2026-11-13"), [{ kg: 75, reps: 8 }, { kg: 75, reps: 8 }]);
  assert.equal(lastSetsFor(d, "squat", "2026-11-09"), null);
  assert.equal(lastSetsFor(d, "bench", "2026-11-20"), null);
});

test("lastSetsFor skips a log where that exercise has no done sets", () => {
  const d = history();
  d.strengthLogs["2026-11-14"] = { session: "A", exercises: { squat: { sets: [{ kg: 90, reps: 3, done: false }] } }, notes: "" };
  assert.deepEqual(lastSetsFor(d, "squat", "2026-11-16"), [{ kg: 80, reps: 8 }, { kg: 80, reps: 6 }]);
});

test("exerciseRows pre-fills from history, else blank rows from the target", () => {
  assert.deepEqual(exerciseRows(history(), "2026-11-16", "squat", T),
    [{ kg: 80, reps: 8, done: false }, { kg: 80, reps: 6, done: false }]);
  assert.deepEqual(exerciseRows(emptyData(), "2026-11-09", "squat", T),
    [{ kg: null, reps: null, done: false }, { kg: null, reps: null, done: false }, { kg: null, reps: null, done: false }]);
});

test("toggleSet logs a pre-filled set in one call, and toggles back", () => {
  let d = toggleSet(history(), "2026-11-16", "A", "squat", T, 0);
  assert.deepEqual(d.strengthLogs["2026-11-16"], {
    session: "A",
    exercises: { squat: { sets: [{ kg: 80, reps: 8, done: true }, { kg: 80, reps: 6, done: false }] } },
    notes: "",
  });
  assert.deepEqual(exerciseRows(d, "2026-11-16", "squat", T)[0], { kg: 80, reps: 8, done: true });
  d = toggleSet(d, "2026-11-16", "A", "squat", T, 0);
  assert.equal(d.strengthLogs["2026-11-16"].exercises.squat.sets[0].done, false);
});

test("editSet, removeSet and addSet", () => {
  let d = editSet(history(), "2026-11-16", "A", "squat", T, 1, { kg: 82.5, reps: 6 });
  assert.deepEqual(d.strengthLogs["2026-11-16"].exercises.squat.sets[1], { kg: 82.5, reps: 6, done: true });
  d = addSet(d, "2026-11-16", "A", "squat", T);
  assert.deepEqual(d.strengthLogs["2026-11-16"].exercises.squat.sets[2], { kg: 82.5, reps: 6, done: false });
  d = removeSet(d, "2026-11-16", "A", "squat", T, 0);
  assert.deepEqual(d.strengthLogs["2026-11-16"].exercises.squat.sets.map(s => s.kg), [82.5, 82.5]);
  const blank = addSet(emptyData(), "2026-11-09", "A", "plank", "");
  assert.equal(blank.strengthLogs["2026-11-09"].exercises.plank.sets.length, 4);
});

test("RPE and notes", () => {
  let d = setExerciseRpe(history(), "2026-11-16", "A", "squat", T, 7.5);
  assert.equal(d.strengthLogs["2026-11-16"].exercises.squat.rpe, 7.5);
  assert.equal(d.strengthLogs["2026-11-16"].exercises.squat.sets.length, 2);
  d = setExerciseRpe(d, "2026-11-16", "A", "squat", T, null);
  assert.equal("rpe" in d.strengthLogs["2026-11-16"].exercises.squat, false);
  d = setStrengthNotes(d, "2026-11-16", "A", "felt strong");
  assert.equal(d.strengthLogs["2026-11-16"].notes, "felt strong");
  const fresh = setStrengthNotes(emptyData(), "2026-11-20", "C", "short on time");
  assert.deepEqual(fresh.strengthLogs["2026-11-20"], { session: "C", exercises: {}, notes: "short on time" });
});

test("updaters never mutate their input", () => {
  const d = history();
  const snap = JSON.stringify(d);
  toggleSet(d, "2026-11-13", "C", "squat", T, 2);
  editSet(d, "2026-11-13", "C", "squat", T, 0, { kg: 1, reps: 1 });
  setRunLog(d, "2026-11-13", { km: 1 });
  assert.equal(JSON.stringify(d), snap);
});
