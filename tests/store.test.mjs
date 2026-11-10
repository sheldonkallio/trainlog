import { test } from "node:test";
import assert from "node:assert/strict";
import { STORAGE_KEY, emptyData, checkData, loadData, saveData, markEdited, makeBackup, readBackup, backupReminder } from "../lib/store.js";

const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } };
};
const sample = () => ({
  ...emptyData(),
  runLogs: {
    "2026-11-09": { done: true, km: 6.2, minutes: 38, avgHr: 141, rpe: 3, notes: "" },
    "2026-11-11": { done: true, km: 10, minutes: 55, avgHr: null, rpe: 6, notes: "hot" },
  },
  strengthLogs: {
    "2026-11-13": { session: "C", exercises: { squat: { sets: [{ kg: 80, reps: 8, done: true }] } }, notes: "" },
  },
});

test("emptyData has every part and version 1", () => {
  assert.deepEqual(emptyData(), { version: 1, overrides: {}, added: {}, runLogs: {}, strengthLogs: {}, lastBackupAt: null, dirtySince: null });
  assert.equal(checkData(emptyData()), null);
});

test("loadData on empty storage gives empty data", () => {
  assert.deepEqual(loadData(fakeStorage()), { ok: true, data: emptyData() });
});

test("loadData refuses damaged data and leaves it untouched", () => {
  const s = fakeStorage({ [STORAGE_KEY]: "{not json" });
  const r = loadData(s);
  assert.equal(r.ok, false);
  assert.equal(r.raw, "{not json");
  assert.match(r.error, /not valid JSON/);
  assert.equal(s.getItem(STORAGE_KEY), "{not json");

  const v2 = loadData(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ ...emptyData(), version: 2 }) }));
  assert.equal(v2.ok, false);
  assert.match(v2.error, /unsupported version 2/);

  const badKey = loadData(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ ...emptyData(), runLogs: { "11/09/2026": {} } }) }));
  assert.equal(badKey.ok, false);
  assert.match(badKey.error, /runLogs has a bad date key "11\/09\/2026"/);
});

test("loadData reports storage that throws", () => {
  const r = loadData({ getItem() { throw new Error("SecurityError"); } });
  assert.equal(r.ok, false);
  assert.equal(r.raw, null);
  assert.match(r.error, /SecurityError/);
});

test("saveData round-trips and reports failure", () => {
  const s = fakeStorage();
  assert.deepEqual(saveData(s, sample()), { ok: true });
  assert.deepEqual(loadData(s), { ok: true, data: sample() });
  const full = { setItem() { throw new Error("QuotaExceededError"); } };
  assert.deepEqual(saveData(full, emptyData()), { ok: false, error: "QuotaExceededError" });
});

test("markEdited sets dirtySince once and does not mutate", () => {
  const d = emptyData();
  const a = markEdited(d, "2026-11-10");
  assert.equal(a.dirtySince, "2026-11-10");
  assert.equal(d.dirtySince, null);
  assert.equal(markEdited(a, "2026-11-12").dirtySince, "2026-11-10");
});

test("makeBackup then readBackup round-trips with a summary", () => {
  const b = makeBackup({ ...sample(), dirtySince: "2026-11-09" }, "2026-11-20");
  assert.equal(b.filename, "trainlog-backup-2026-11-20.json");
  assert.equal(b.data.lastBackupAt, "2026-11-20");
  assert.equal(b.data.dirtySince, null);
  const r = readBackup(b.text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, b.data);
  assert.deepEqual(r.summary, { logs: 3, from: "2026-11-09", to: "2026-11-13" });
});

test("readBackup rejects bad files with a reason", () => {
  assert.match(readBackup("nope").error, /isn't valid JSON/);
  assert.match(readBackup("[]").error, /not a JSON object/);
  assert.match(readBackup(JSON.stringify({ ...emptyData(), version: 2 })).error, /unsupported version 2/);
  const { runLogs, ...noRuns } = emptyData();
  assert.match(readBackup(JSON.stringify(noRuns)).error, /runLogs must be an object/);
  const noExercises = { ...emptyData(), strengthLogs: { "2026-11-09": { session: "A" } } };
  assert.match(readBackup(JSON.stringify(noExercises)).error, /strength log 2026-11-09 has no exercises/);
});

test("backupReminder only after 7 days with unsaved changes", () => {
  assert.equal(backupReminder(emptyData(), "2026-12-01"), null);
  const never = { ...emptyData(), dirtySince: "2026-11-10" };
  assert.equal(backupReminder(never, "2026-11-17"), null);
  assert.deepEqual(backupReminder(never, "2026-11-18"), { days: 8, never: true });
  const old = { ...emptyData(), lastBackupAt: "2026-10-01", dirtySince: "2026-11-17" };
  assert.deepEqual(backupReminder(old, "2026-11-17"), { days: 47, never: false });
  const fresh = { ...emptyData(), lastBackupAt: "2026-11-15", dirtySince: "2026-11-16" };
  assert.equal(backupReminder(fresh, "2026-11-20"), null);
});
