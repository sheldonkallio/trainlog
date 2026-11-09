# TrainLog MVP (Logging Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first web app for logging runs and kg × reps strength sets against the Buriram Marathon plan, with per-card skip/swap/move, a Week view, JSON backup and offline use.

**Architecture:** Static files served by GitHub Pages, with no build step. Pure ES modules in `lib/` do all the calculation and are tested with `node --test`. Small `ui/` modules build the DOM. `app.js` boots the app, routes on the URL hash, and is the only place that saves to `localStorage`. The plan (`plan.seed.json`) is read-only. Everything the user enters lives in one `localStorage` key, kept as separate `overrides` / `added` / `runLogs` / `strengthLogs` maps.

**Tech Stack:** HTML, CSS, vanilla JavaScript (ES modules), `node:test` + `node:assert/strict` (Node 24), a service worker, a Web App Manifest, and Python's `http.server` for the local preview.

**Spec:** `docs/superpowers/specs/2026-11-09-trainlog-mvp-design.md`

## Global Constraints

- No npm, no `package.json`, no bundler, no third-party libraries. Browser code is plain ES modules loaded with `<script type="module">`.
- All URLs are relative (`./app.js`, `lib/plan.js`), because GitHub Pages serves the app from `/trainlog/`, not `/`.
- Dates are local `YYYY-MM-DD` strings. Always get "today" from `localISO(new Date())`. Never use `toISOString()` for a calendar date.
- `lib/` modules are pure: no DOM, no `localStorage`, no `new Date()` inside them. Today's date is always passed in.
- Data updaters never mutate their input. They return a new object, made with `structuredClone`.
- Number inputs are `type="text"` with `inputmode="decimal"` or `"numeric"`, never `type="number"`. Chrome on Android empties a `type="number"` value that contains a comma (`62,5`). `parseNum` accepts commas.
- Tap targets are at least 44 × 44 px. The layout is one column, max 560 px wide, and must work at 360 px.
- Storage key: `trainlog.v1`. Data `version: 1`.
- Backup filename: `trainlog-backup-YYYY-MM-DD.json`.
- Run all tests: `node --test "tests/*.test.mjs"` from the repo root.
- Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\Users\sheld\OneDrive\Documents\Claude\Code\TrainLog` (already a git repo on `main`, with the spec committed).

## Changes from the spec (Sheldon reviews these with the plan)

1. **Extra files.**
   - `lib/dates.js` holds the date helpers.
   - `styles.css` holds the CSS.
   - The UI is split into `ui/dom.js`, `ui/sheet.js`, `ui/today.js`, `ui/week.js` and `ui/backup.js`, so `app.js` stays small.
   - `tools/make-icons.mjs` generates the app icons.
2. **Strength sets carry `done`.** Sets are stored as `{ kg, reps, done }`. The first tap on an exercise saves its pre-filled rows as `done: false`. ✓ flips `done`, which makes undo easy. Only `done` sets count as logged or feed the next pre-fill.
3. **Backup tracking.** `lastBackupAt` is a date (`YYYY-MM-DD`), not a datetime, and a new field `dirtySince` holds the date of the first change since the last backup. Logs are keyed by training date, not entry date, so the date on a log can't tell whether it was backed up. The reminder shows when `dirtySince` is set and more than 7 days have passed since `lastBackupAt` (or since `dirtySince`, if there has never been a backup).
4. **Run duration is two fields, Hours and Minutes.** Android's number keypad has no ":" key, so `1:05` can't be typed on it.
5. **+ Add run / + Add strength appear only when that slot is empty.** A skipped card still holds its slot. To change a skipped run into a different run, use Undo, then Swap.
6. **No offline cache on localhost.** The service worker is registered only off `localhost` and `127.0.0.1`, so cached files never hide code changes during development.

## Review Focus

1. **Early-morning entries in UTC+7.** A run logged at 00:30 on 12 Nov must land on `2026-11-12`. A tab left open past midnight must move "today" forward when the app comes back into view. *Test: `localISO` with a 00:30 local time (Task 1). Manual check: the `visibilitychange` refresh (Task 7).*
2. **Android decimal commas.** Typing `62,5` kg or `6,2` km must save 62.5 or 6.2, not blank. *Test: `parseNum` cases (Task 4).*
3. **Damaged saved data.** If `trainlog.v1` can't be read, the app must not boot over it and must never overwrite it. It offers a raw download instead. *Tests: `loadData` damaged-data cases (Task 2).*
4. **Plan changes never hide a log.** Undoing an added or moved-in card that has a log, or a log on a date with no card, must still show the log. *Tests: `cardActions` and the "log on a day with no card" test (Task 4).*
5. **A stale offline app.** If a new file isn't in the service worker's list, the installed app breaks offline or serves old code. *Test: `tests/sw.test.mjs` checks that `FILES` matches the real files (Task 13).*

## File map

| File | Responsibility | Task |
|---|---|---|
| `.gitignore`, `.nojekyll`, `.claude/launch.json` | Repo hygiene, Pages without Jekyll, local preview server | 1 |
| `lib/dates.js` | Calendar-date strings: local today, add/diff days, weekday, formatting | 1 |
| `lib/store.js` | Empty data, data-shape check, load/save, backup make/read, reminder rule | 2 |
| `tests/fixtures/seed.sample.json` | Two-week fake plan in the adapted seed shape, used by all lib tests | 3 |
| `lib/plan.js` | Seed adapter and lookups, `resolveDay`, plan-change updaters, card actions, run intensity | 3, 4 |
| `lib/logs.js` | Number/duration parsing, run-log and set updaters, pre-fill, day status, week totals | 5, 6 |
| `index.html`, `styles.css` | Page shell and all styles | 7 |
| `app.js` | Boot, hash routing, `commit` (the only save), error screens | 7 |
| `ui/dom.js`, `ui/sheet.js` | `h()` element builder, downloads; bottom sheet, menu, toast | 7 |
| `ui/week.js`, `ui/backup.js` | Week screen; backup and restore UI | 8, 12 |
| `ui/today.js` | Today screen: header, run card and sheet, strength checklist, change menus | 9, 10, 11 |
| `sw.js`, `manifest.json`, `icons/*`, `tools/make-icons.mjs`, `README.md` | Offline cache, install, icons, release notes | 13 |

---

### Task 1: Repo scaffold and date helpers

**Files:**
- Modify: `.gitignore`
- Create: `.nojekyll` (empty), `.claude/launch.json`, `lib/dates.js`
- Test: `tests/dates.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces (from `lib/dates.js`):
  - `isISODate(s: any) → boolean`
  - `localISO(date: Date) → "YYYY-MM-DD"`, using the local calendar
  - `addDays(iso, n: number) → iso`
  - `daysBetween(a, b) → number`, which is `b − a` in days
  - `weekdayIndex(iso) → 0..6`, Monday = 0
  - `mondayOf(iso) → iso`
  - `dayName(iso) → "Wed"`
  - `formatDay(iso) → "Wed 11 Nov"`
  - `formatShort(iso) → "11 Nov"`

- [ ] **Step 1: Scaffold files**

`.gitignore` (replace contents):
```
.superpowers/
node_modules/
```

Create an empty `.nojekyll`.

`.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "trainlog",
      "runtimeExecutable": "python",
      "runtimeArgs": ["-m", "http.server", "8137"],
      "port": 8137
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`tests/dates.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isISODate, localISO, addDays, daysBetween, weekdayIndex, mondayOf, dayName, formatDay, formatShort } from "../lib/dates.js";

test("isISODate accepts real calendar dates only", () => {
  assert.equal(isISODate("2026-11-09"), true);
  assert.equal(isISODate("2026-02-30"), false);
  assert.equal(isISODate("2026-11-9"), false);
  assert.equal(isISODate(null), false);
  assert.equal(isISODate(20261109), false);
});

test("localISO uses the local calendar day, not UTC", () => {
  assert.equal(localISO(new Date(2026, 10, 12, 0, 30)), "2026-11-12");
  assert.equal(localISO(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("addDays crosses months and years", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-11-09", 76), "2027-01-24");
});

test("daysBetween is b minus a", () => {
  assert.equal(daysBetween("2026-11-09", "2027-01-24"), 76);
  assert.equal(daysBetween("2026-11-17", "2026-11-10"), -7);
  assert.equal(daysBetween("2026-10-01", "2026-11-17"), 47);
});

test("weekdays run Monday = 0 to Sunday = 6", () => {
  assert.equal(weekdayIndex("2026-11-09"), 0);
  assert.equal(weekdayIndex("2026-11-15"), 6);
  assert.equal(weekdayIndex("2027-01-23"), 5);
  assert.equal(mondayOf("2026-11-15"), "2026-11-09");
  assert.equal(mondayOf("2026-11-09"), "2026-11-09");
  assert.equal(mondayOf("2027-01-01"), "2026-12-28");
});

test("formatting", () => {
  assert.equal(dayName("2026-11-11"), "Wed");
  assert.equal(formatDay("2026-11-11"), "Wed 11 Nov");
  assert.equal(formatShort("2027-01-23"), "23 Jan");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/dates.test.mjs`
Expected: FAIL with `Cannot find module` … `lib/dates.js`

- [ ] **Step 4: Implement `lib/dates.js`**

```js
// Calendar dates as "YYYY-MM-DD" strings in the user's local calendar.
// Arithmetic runs in UTC on those strings, so it never shifts with timezone or DST.
const DAY_MS = 86400000;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = n => String(n).padStart(2, "0");
const toUTC = iso => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = ms => { const t = new Date(ms); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };

export function isISODate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUTC(toUTC(s)) === s;
}
export function localISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function addDays(iso, n) { return fromUTC(toUTC(iso) + n * DAY_MS); }
export function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / DAY_MS); }
export function weekdayIndex(iso) { return (new Date(toUTC(iso)).getUTCDay() + 6) % 7; }
export function mondayOf(iso) { return addDays(iso, -weekdayIndex(iso)); }
export function dayName(iso) { return DOW[weekdayIndex(iso)]; }
export function formatShort(iso) { const t = new Date(toUTC(iso)); return `${t.getUTCDate()} ${MON[t.getUTCMonth()]}`; }
export function formatDay(iso) { return `${dayName(iso)} ${formatShort(iso)}`; }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/dates.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add .gitignore .nojekyll .claude/launch.json lib/dates.js tests/dates.test.mjs
git commit -m "Scaffold TrainLog and add calendar-date helpers"
```

---

### Task 2: Storage, data shape and backup rules (`lib/store.js`)

**Files:**
- Create: `lib/store.js`
- Test: `tests/store.test.mjs`

**Interfaces:**
- Consumes: `isISODate`, `daysBetween` from `lib/dates.js`.
- Produces:
  - `STORAGE_KEY = "trainlog.v1"`
  - `emptyData() → Data`, where `Data = { version: 1, overrides: {}, added: {}, runLogs: {}, strengthLogs: {}, lastBackupAt: null, dirtySince: null }`
  - `checkData(obj) → string | null` (an error message, or `null` if valid)
  - `loadData(storage) → { ok: true, data } | { ok: false, raw: string | null, error: string }`
  - `saveData(storage, data) → { ok: true } | { ok: false, error: string }`
  - `markEdited(data, today) → Data` (sets `dirtySince` only if it's `null`)
  - `makeBackup(data, today) → { data, filename, text }` (`data` has `lastBackupAt = today` and `dirtySince = null`)
  - `readBackup(text) → { ok: true, data, summary: { logs, from, to } } | { ok: false, error }`
  - `backupReminder(data, today) → null | { days: number, never: boolean }`
- `storage` is anything with `getItem(key)` and `setItem(key, value)`.

- [ ] **Step 1: Write the failing test**

`tests/store.test.mjs`:
```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/store.test.mjs`
Expected: FAIL with `Cannot find module` … `lib/store.js`

- [ ] **Step 3: Implement `lib/store.js`**

```js
// Everything the user enters, as one JSON value under one localStorage key.
// Storage is passed in (window.localStorage in the app, a stand-in in tests).
import { isISODate, daysBetween } from "./dates.js";

export const STORAGE_KEY = "trainlog.v1";
const MAPS = ["overrides", "added", "runLogs", "strengthLogs"];

export function emptyData() {
  return { version: 1, overrides: {}, added: {}, runLogs: {}, strengthLogs: {}, lastBackupAt: null, dirtySince: null };
}

export function checkData(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "not a JSON object";
  if (obj.version !== 1) return `unsupported version ${obj.version}`;
  for (const k of MAPS) {
    const v = obj[k];
    if (!v || typeof v !== "object" || Array.isArray(v)) return `${k} must be an object`;
    for (const d of Object.keys(v)) if (!isISODate(d)) return `${k} has a bad date key "${d}"`;
  }
  for (const [d, log] of Object.entries(obj.strengthLogs)) {
    if (!log || typeof log.exercises !== "object" || log.exercises === null) return `strength log ${d} has no exercises`;
  }
  for (const k of ["lastBackupAt", "dirtySince"]) {
    if (obj[k] != null && !isISODate(obj[k])) return `${k} must be a date or null`;
  }
  return null;
}

export function loadData(storage) {
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); }
  catch (e) { return { ok: false, raw: null, error: `Phone storage can't be read (${e.message})` }; }
  if (raw == null) return { ok: true, data: emptyData() };
  let obj;
  try { obj = JSON.parse(raw); }
  catch { return { ok: false, raw, error: "Saved data is not valid JSON" }; }
  const err = checkData(obj);
  return err ? { ok: false, raw, error: `Saved data is damaged: ${err}` } : { ok: true, data: obj };
}

export function saveData(storage, data) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

export function markEdited(data, today) {
  return data.dirtySince ? data : { ...data, dirtySince: today };
}

export function makeBackup(data, today) {
  const saved = { ...data, lastBackupAt: today, dirtySince: null };
  return { data: saved, filename: `trainlog-backup-${today}.json`, text: JSON.stringify(saved, null, 2) };
}

export function readBackup(text) {
  let obj;
  try { obj = JSON.parse(text); }
  catch { return { ok: false, error: "This file isn't valid JSON." }; }
  const err = checkData(obj);
  if (err) return { ok: false, error: `This isn't a TrainLog backup: ${err}.` };
  const dates = [...Object.keys(obj.runLogs), ...Object.keys(obj.strengthLogs)].sort();
  const logs = Object.keys(obj.runLogs).length + Object.keys(obj.strengthLogs).length;
  return { ok: true, data: obj, summary: { logs, from: dates[0] ?? null, to: dates.at(-1) ?? null } };
}

export function backupReminder(data, today) {
  if (!data.dirtySince) return null;
  const days = daysBetween(data.lastBackupAt ?? data.dirtySince, today);
  return days > 7 ? { days, never: !data.lastBackupAt } : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/store.test.mjs`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/store.js tests/store.test.mjs
git commit -m "Store: data shape, load/save, backup and reminder rules"
```

---

### Task 3: Seed adapter and plan lookups (`lib/plan.js`, part 1)

**Gate:** `plan.seed.json` must be in hand before this task starts. If it isn't in `C:\Users\sheld\Downloads` or the repo root, stop and ask Sheldon for it.

**Files:**
- Create: `plan.seed.json` (copied from Sheldon's file), `tests/fixtures/seed.sample.json`, `lib/plan.js`
- Test: `tests/plan.test.mjs`

**Interfaces:**
- Consumes: `isISODate` from `lib/dates.js`.
- Produces:
  - `adaptSeed(raw) → Plan`, or throws `Error("plan.seed.json: <reason>")`
  - `Plan` has these fields:
    - `meta`, `phases`, `weeks`, `sessionTemplates` and `targetsByPhase`, from the seed
    - `dayByDate: Map<iso, { date, week: number, run: Run | null, session: string | null }>`
    - `runTypes: string[]`, in first-seen order
  - `Run = { type: string, description: string, km?: number, minutes?: number }`
  - `Phase = { name, fromWeek, toWeek, guidance }`
  - `Exercise = { id, name, role }`
  - `weekForDate(plan, iso) → week | null`
  - `weekRange(week) → { start, end }`
  - `phaseForWeek(plan, n) → Phase | null`
  - `targetFor(plan, phaseName, role) → string` (`""` if none)
  - `exercisesFor(plan, session) → Exercise[]`
  - `intensityOf(runType) → "interval" | "tempo" | "long" | "easy" | "other"`

- [ ] **Step 1: Check the real seed against the expected shape**

Copy Sheldon's file to the repo root as `plan.seed.json`, then print its top-level keys and the first day of the first week:

```bash
node -e "const s=require('./plan.seed.json');console.log(Object.keys(s));console.log(JSON.stringify(s.phases?.[0]));console.log(JSON.stringify(s.weeks?.[0]?.days?.[0]));console.log(JSON.stringify(Object.entries(s.sessionTemplates||{})[0]));console.log(JSON.stringify(Object.entries(s.targetsByPhase||{})[0]))"
```

Expected shape (the same as the fixture in Step 2):
- top-level keys: `meta`, `phases`, `weeks`, `sessionTemplates`, `targetsByPhase`
- a phase: `{ name, fromWeek, toWeek, guidance }`
- a day: `{ date, run: { type, description, km? } | null, session: "A" | null }`
- an exercise: `{ id, name, role }`

**If the real file matches,** continue to Step 2.

**If it differs,** add a `normalizeSeed(raw)` function at the top of `lib/plan.js`. It converts the real shape into the expected shape, and `adaptSeed` calls it first. Then:
- Add `tests/fixtures/seed.real-excerpt.json`: the real file cut down to its first two weeks.
- Add a test: `adaptSeed` of that excerpt gives the right `dayByDate` entry for the first day, `runTypes`, and `phaseForWeek(plan, 1).name`.
- Also check that the date range is 2026-11-09 to 2027-01-23, as in the PRD.
- Show Sheldon the mapping before committing.

- [ ] **Step 2: Create the fixture**

`tests/fixtures/seed.sample.json`:
```json
{
  "meta": { "name": "Sample block", "start": "2026-11-09", "end": "2026-11-22" },
  "phases": [
    { "name": "Re-entry", "fromWeek": 1, "toWeek": 1, "guidance": "RPE 6–7" },
    { "name": "Build", "fromWeek": 2, "toWeek": 2, "guidance": "RPE 7–8" }
  ],
  "weeks": [
    { "number": 1, "days": [
      { "date": "2026-11-09", "run": { "type": "Easy Z2", "description": "6 km easy", "km": 6 }, "session": "A" },
      { "date": "2026-11-10", "run": null, "session": null },
      { "date": "2026-11-11", "run": { "type": "MP", "description": "2×3 km @ MP", "km": 10 }, "session": "B" },
      { "date": "2026-11-12", "run": { "type": "Easy Z2", "description": "8 km easy", "km": 8 }, "session": null },
      { "date": "2026-11-13", "run": null, "session": "C" },
      { "date": "2026-11-14", "run": { "type": "Long", "description": "16 km long", "km": 16 }, "session": null },
      { "date": "2026-11-15", "run": null, "session": null }
    ]},
    { "number": 2, "days": [
      { "date": "2026-11-16", "run": { "type": "Easy Z2", "description": "7 km easy", "km": 7 }, "session": "A" },
      { "date": "2026-11-17", "run": null, "session": null },
      { "date": "2026-11-18", "run": { "type": "Intervals", "description": "6×800 m", "km": 9 }, "session": "B" },
      { "date": "2026-11-19", "run": { "type": "Easy Z2", "description": "8 km easy", "km": 8 }, "session": null },
      { "date": "2026-11-20", "run": null, "session": "C" },
      { "date": "2026-11-21", "run": { "type": "Long", "description": "18 km long", "km": 18 }, "session": null },
      { "date": "2026-11-22", "run": null, "session": null }
    ]}
  ],
  "sessionTemplates": {
    "A": [
      { "id": "squat", "name": "Back squat", "role": "lowerMain" },
      { "id": "bench", "name": "Bench press", "role": "upperMain" },
      { "id": "row", "name": "Row", "role": "upperAcc" },
      { "id": "plank", "name": "Plank", "role": "core" }
    ],
    "B": [
      { "id": "deadlift", "name": "Deadlift", "role": "lowerMain" },
      { "id": "ohp", "name": "Overhead press", "role": "upperMain" },
      { "id": "lunge", "name": "Walking lunge", "role": "lowerAcc" }
    ],
    "C": [
      { "id": "squat", "name": "Back squat", "role": "lowerMain" },
      { "id": "pullup", "name": "Pull-up", "role": "upperMain" },
      { "id": "plank", "name": "Plank", "role": "core" }
    ]
  },
  "targetsByPhase": {
    "Re-entry": { "upperMain": "3×6–8 @ RPE 6–7", "lowerMain": "3×6–8 @ RPE 6–7", "upperAcc": "2×10–12", "lowerAcc": "2×10–12", "core": "2×30–45 s" },
    "Build": { "upperMain": "4×5–6 @ RPE 7–8", "lowerMain": "4×5–6 @ RPE 7–8", "upperAcc": "3×8–10", "lowerAcc": "3×8–10", "core": "3×45 s" }
  }
}
```

- [ ] **Step 3: Write the failing test**

`tests/plan.test.mjs`:
```js
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --test tests/plan.test.mjs`
Expected: FAIL with `Cannot find module` … `lib/plan.js`

- [ ] **Step 5: Implement the first part of `lib/plan.js`**

```js
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test tests/plan.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add plan.seed.json tests/fixtures/seed.sample.json lib/plan.js tests/plan.test.mjs
git commit -m "Plan: seed adapter, week/phase/target lookups, run intensity"
```
(If Step 1 added `normalizeSeed` and `tests/fixtures/seed.real-excerpt.json`, add those too.)

---

### Task 4: Day building and plan changes (`lib/plan.js`, part 2)

**Files:**
- Modify: `lib/plan.js` (append)
- Test: `tests/resolve.test.mjs`

**Interfaces:**
- Consumes: `Plan` from Task 3, and `emptyData` (in tests) from Task 2.
- Produces:
  - `resolveDay(plan, data, iso) → Day`
  - `Day = { date, inPlan: boolean, week: number | null, phase: Phase | null, run: Card | null, strength: Card | null }`
  - `Card = { kind: "run" | "strength", state, item, log }`, where:
    - `state` is `"planned" | "skipped" | "swapped" | "moved-out" | "moved-in" | "added"`
    - `item` is a `Run` for a run card, or `{ session }` for a strength card
    - `log` is the run log, the strength log, or `null`
    - Optional extras: `original` (swapped), `movedTo` (moved-out), `movedFrom` (moved-in)
  - `isLogged(card) → boolean` (run: `log.done`; strength: any set with `done`)
  - `setOverride(data, iso, kind, change) → Data`, where `change` is `{ type: "skip" }`, `{ type: "swap", runType }`, `{ type: "swap", session }` or `{ type: "move", to }`
  - `undoChange(data, card, iso) → Data`
  - `addSession(plan, data, iso, entry) → Data`, where `entry` is `{ kind: "run", runType? }` or `{ kind: "strength", session }`. Returns the same `data` object unchanged if that slot is taken.
  - `canMoveTo(plan, data, kind, from, to) → boolean`
  - `cardActions(card) → Array<"skip" | "swap" | "move" | "undo">`

- [ ] **Step 1: Write the failing test**

`tests/resolve.test.mjs`:
```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/resolve.test.mjs`
Expected: FAIL with `SyntaxError: The requested module '../lib/plan.js' does not provide an export named 'resolveDay'`

- [ ] **Step 3: Append to `lib/plan.js`**

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS, all tests (dates 6, store 9, plan 7, resolve 14).

- [ ] **Step 5: Commit**

```bash
git add lib/plan.js tests/resolve.test.mjs
git commit -m "Plan: build the day from plan + changes + logs; skip/swap/move/add/undo"
```

---

### Task 5: Run logs, sets and pre-fill (`lib/logs.js`, part 1)

**Files:**
- Create: `lib/logs.js`
- Test: `tests/logs.test.mjs`

**Interfaces:**
- Consumes: `emptyData` (tests only).
- Produces:
  - `parseNum(text) → number | null`. Accepts `"6,2"`. Returns `null` for blank, negative or non-numeric input.
  - `durationFromParts(hours, minutes) → number | null` (total minutes)
  - `formatDuration(min) → "38 min" | "1h 05m"`
  - `runSummary(log) → "6.2 km · 38 min · HR 141 · RPE 3"`, or `"Done"`
  - `setRunLog(data, iso, fields) → Data`; `clearRunLog(data, iso) → Data`
  - `defaultSetCount(target) → number`
  - `lastSetsFor(data, exerciseId, beforeIso) → [{ kg, reps }] | null`
  - `exerciseRows(data, iso, exerciseId, target) → [{ kg, reps, done }]`
  - Set updaters. Each takes `(data, iso, session, exerciseId, target, …)` and returns `Data`:
    - `toggleSet(…, i)`
    - `editSet(…, i, { kg, reps })`
    - `removeSet(…, i)`
    - `addSet(…)`
    - `setExerciseRpe(…, rpe | null)`
  - `setStrengthNotes(data, iso, session, notes) → Data`

- [ ] **Step 1: Write the failing test**

`tests/logs.test.mjs`:
```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/logs.test.mjs`
Expected: FAIL with `Cannot find module` … `lib/logs.js`

- [ ] **Step 3: Implement `lib/logs.js`**

```js
// Run logs, strength sets, pre-fill from history, and weekly sums.
// Updaters return new data and never change what they're given.

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/logs.test.mjs`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/logs.js tests/logs.test.mjs
git commit -m "Logs: run log, sets with one-tap logging, pre-fill from last session"
```

---

### Task 6: Day status and week totals (`lib/logs.js`, part 2)

**Files:**
- Modify: `lib/logs.js` (append, plus one import at the top)
- Test: `tests/week.test.mjs`

**Interfaces:**
- Consumes: `resolveDay`, `isLogged` from `lib/plan.js`.
- Produces:
  - `dayStatus(day: Day, today) → { mark: "done" | "partial" | "skipped" | "planned" | "not-logged" | "rest", changed: boolean }`
  - `weekTotals(plan, data, weekNumber) → { plannedKm, loggedKm, loggedMinutes, plannedMinutes, hasPlannedMinutes, strengthPlanned, strengthDone }`

- [ ] **Step 1: Write the failing test**

`tests/week.test.mjs`:
```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/week.test.mjs`
Expected: FAIL with `does not provide an export named 'dayStatus'`

- [ ] **Step 3: Add to `lib/logs.js`**

Add at the top of the file:
```js
import { resolveDay, isLogged } from "./plan.js";
```

Append:
```js
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
```

- [ ] **Step 4: Run all tests**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS, all tests (logs 12, week 7, plus the earlier ones).

- [ ] **Step 5: Commit**

```bash
git add lib/logs.js tests/week.test.mjs
git commit -m "Logs: day status marks and weekly planned-vs-logged totals"
```

---

### Task 7: App shell, routing and the single save path

**Files:**
- Create: `index.html`, `styles.css`, `app.js`, `ui/dom.js`, `ui/sheet.js`, plus stub `ui/today.js` and stub `ui/week.js`. Tasks 8 and 9 replace the stubs.

**Interfaces:**
- Consumes:
  - `localISO`, `isISODate` from `lib/dates.js`
  - `adaptSeed`, `weekForDate` from `lib/plan.js`
  - `loadData`, `saveData`, `markEdited` from `lib/store.js`
- Produces:
  - `App = { plan, data, today, commit(next, { edit = true, rerender = true }) → boolean, go(view: "day" | "week", arg) }`
    - `commit` is the only save. On failure it shows a toast, leaves `app.data` unchanged and returns `false`.
    - `edit: false` skips `markEdited` (used by backup and restore).
    - `rerender: false` is used for notes, so a textarea keeps focus.
  - From `ui/dom.js`:
    - `h(tag, props, ...children) → Element`. `props` keys: `class`, `on<event>`, `aria-*`, or DOM properties.
    - `downloadText(filename, text)`
  - From `ui/sheet.js`:
    - `openSheet(title, build: (close) → Element)`
    - `closeSheet()`
    - `openMenu(title, items: [{ label, onPick }])`
    - `toast(msg, ms = 3500)`
  - Screen modules export:
    - `renderToday(app, iso) → Element`
    - `renderWeek(app, weekNumber) → Element`
  - Routes: `#/day/<iso>` and `#/week/<n>`. `#/day` or an empty hash means today; `#/week` means the week containing today.

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#2b4aa8">
  <title>TrainLog</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main id="main"><p class="note">Loading…</p></main>
  <nav class="tabbar">
    <a href="#/day" data-view="today">Today</a>
    <a href="#/week" data-view="week">Week</a>
  </nav>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `styles.css`**

```css
:root {
  --bg: #f6f7fb; --card: #fff; --ink: #1b1f2a; --muted: #6b7280; --line: #e3e6ee;
  --accent: #2b4aa8; --accent-soft: #e8edfa; --ok: #1f9d55; --danger: #c0392b;
  --easy: #2e9e5b; --long: #2f6fd1; --tempo: #e08a1e; --interval: #d14343; --other: #8a8f9c;
  --ph0: #dfe7fb; --ph1: #fde8cf; --ph2: #f9d9d9; --ph3: #dcefe2;
  --warn-bg: #fff4d6; --warn-ink: #7a5300;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #12141a; --card: #1c1f27; --ink: #e8eaf0; --muted: #9aa1b2; --line: #2c303b;
    --accent: #8fa8ff; --accent-soft: #263055;
    --ph0: #26304d; --ph1: #4a3a22; --ph2: #4a2a2a; --ph3: #24402e;
    --warn-bg: #3d3216; --warn-ink: #f3d58a;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
button:disabled { opacity: .35; cursor: default; }
input, textarea, select { font: inherit; color: inherit; }
#main { max-width: 560px; margin: 0 auto; padding: 12px 16px calc(84px + env(safe-area-inset-bottom)); }
.visually-hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.note { color: var(--muted); text-align: center; }

.day-head { margin-bottom: 12px; }
.day-nav { display: flex; align-items: center; justify-content: space-between; }
.day-title { font-size: 20px; font-weight: 700; padding: 8px 12px; }
.icon-btn { min-width: 44px; min-height: 44px; font-size: 24px; color: var(--muted); border-radius: 10px; }
.day-sub { color: var(--muted); font-size: 14px; display: flex; gap: 6px; justify-content: center; align-items: center; flex-wrap: wrap; }
.pill { background: var(--accent-soft); color: var(--accent); border-radius: 999px; padding: 1px 10px; font-weight: 600; font-size: 13px; }
.link-btn { color: var(--accent); font-weight: 600; padding: 8px 4px; min-height: 44px; }

.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px; margin-bottom: 12px; }
.card-off { opacity: .7; }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.card-title { font-weight: 700; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.tag { font-size: 12px; font-weight: 600; color: var(--muted); background: var(--bg); border-radius: 999px; padding: 1px 8px; }
.muted { color: var(--muted); font-size: 14px; margin: 4px 0; }
.btn { display: block; width: 100%; text-align: center; background: var(--accent); color: #fff; border-radius: 12px; padding: 12px; font-weight: 600; margin-top: 8px; min-height: 48px; }
.btn-quiet { background: var(--accent-soft); color: var(--accent); }
.btn-danger-quiet { background: transparent; color: var(--danger); }
.summary { display: block; width: 100%; text-align: left; padding: 10px 0 2px; font-variant-numeric: tabular-nums; min-height: 44px; }
.row, .adds { display: flex; gap: 10px; }
.row .btn, .adds .btn { margin-top: 0; }
.reminder { display: block; width: 100%; text-align: left; background: var(--warn-bg); color: var(--warn-ink); border-radius: 12px; padding: 12px; margin-bottom: 12px; font-size: 14px; }

.exercise { padding: 10px 0 4px; border-top: 1px solid var(--line); margin-top: 8px; }
.ex-head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.target { color: var(--accent); font-size: 13px; }
.set { display: flex; align-items: center; gap: 10px; min-height: 48px; }
.set-n { width: 18px; color: var(--muted); font-size: 13px; text-align: center; }
.set-val { flex: 1; text-align: left; min-height: 44px; color: var(--muted); font-variant-numeric: tabular-nums; font-size: 17px; }
.set.done .set-val { color: var(--ink); }
.check { width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--line); color: #fff; font-size: 20px; flex: none; }
.check.on { background: var(--ok); border-color: var(--ok); }
.ex-foot { display: flex; justify-content: space-between; align-items: center; }
.ex-foot select { border: 1px solid var(--line); background: var(--card); border-radius: 8px; padding: 8px; font-size: 14px; min-height: 40px; }

.field { display: block; font-size: 14px; color: var(--muted); margin-top: 10px; }
.field input, .field textarea, textarea.notes { display: block; width: 100%; margin-top: 4px; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); font-size: 17px; color: var(--ink); }
textarea { min-height: 64px; }
.two { display: flex; gap: 10px; }
.two > * { flex: 1; }
.rpe { display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; margin-top: 4px; }
.rpe button { min-height: 44px; border-radius: 8px; background: var(--bg); font-weight: 600; color: var(--ink); }
.rpe button.on { background: var(--accent); color: #fff; }
.stepper { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
.stepper > span { width: 44px; color: var(--muted); }
.stepper input { flex: 1; min-width: 0; text-align: center; font-size: 22px; padding: 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); color: var(--ink); }
.stepper button { min-width: 56px; min-height: 48px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); font-weight: 700; }

.week-strip { display: flex; gap: 4px; margin: 4px 0 12px; }
.wk { flex: 1; min-height: 32px; border-radius: 6px; font-size: 11px; color: var(--ink); border: 2px solid transparent; }
.wk.current { border-color: var(--accent); font-weight: 700; }
.wk.today { text-decoration: underline; }
.ph0 { background: var(--ph0); } .ph1 { background: var(--ph1); } .ph2 { background: var(--ph2); } .ph3 { background: var(--ph3); }
.totals { font-size: 14px; color: var(--muted); text-align: center; margin: 0 0 12px; font-variant-numeric: tabular-nums; }
.day-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; margin-bottom: 6px; min-height: 52px; }
.day-row.today { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.day-row.dim { opacity: .55; }
.dr-date { width: 76px; font-size: 14px; flex: none; }
.dr-items { flex: 1; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.dr-status { min-width: 40px; text-align: right; font-size: 18px; }
.chip { font-size: 12px; font-weight: 600; color: #fff; border-radius: 999px; padding: 2px 8px; }
.chip.easy { background: var(--easy); } .chip.long { background: var(--long); } .chip.tempo { background: var(--tempo); }
.chip.interval { background: var(--interval); } .chip.other { background: var(--other); }
.chip.str { background: var(--accent-soft); color: var(--accent); }
.chip.off { opacity: .45; text-decoration: line-through; }

.tabbar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; background: var(--card); border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom); }
.tabbar a { flex: 1; text-align: center; padding: 14px 0; color: var(--muted); text-decoration: none; font-weight: 600; }
.tabbar a.active { color: var(--accent); }

.sheet-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, .35); display: flex; align-items: flex-end; justify-content: center; z-index: 10; }
.sheet { background: var(--card); width: 100%; max-width: 560px; border-radius: 16px 16px 0 0; padding: 8px 16px calc(16px + env(safe-area-inset-bottom)); max-height: 88vh; overflow: auto; }
.sheet-head { display: flex; justify-content: space-between; align-items: center; }
.sheet-head h3 { margin: 0; font-size: 17px; }
.menu-item { display: block; width: 100%; text-align: left; padding: 14px 4px; border-top: 1px solid var(--line); font-size: 17px; min-height: 48px; }
.date-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 8px; }
.date-chip { min-height: 52px; border-radius: 8px; background: var(--bg); font-size: 12px; line-height: 1.2; color: var(--ink); }
.date-chip.current { outline: 2px solid var(--accent); }
.error-text { color: var(--danger); font-size: 14px; min-height: 1.2em; margin: 8px 0 0; }
.toast { position: fixed; left: 50%; bottom: calc(76px + env(safe-area-inset-bottom)); transform: translateX(-50%); background: #1b1f2a; color: #fff; padding: 10px 14px; border-radius: 10px; font-size: 14px; z-index: 20; max-width: 90vw; }
.fatal { padding: 24px 4px; }
.fatal h2 { margin: 0 0 8px; }
```

- [ ] **Step 3: Write `ui/dom.js`**

```js
// Tiny DOM builder. Text children are always added as text, never parsed as HTML.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k.startsWith("aria-") || !(k in el)) el.setAttribute(k, v === true ? "" : v);
    else el[k] = v;
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function downloadText(filename, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 4: Write `ui/sheet.js`**

```js
// Bottom sheet, option menu and toast. Only one sheet is open at a time.
import { h } from "./dom.js";

export function closeSheet() {
  document.querySelector(".sheet-backdrop")?.remove();
}

export function openSheet(title, build) {
  closeSheet();
  const backdrop = h("div", { class: "sheet-backdrop", onclick: e => { if (e.target === backdrop) closeSheet(); } });
  const sheet = h("div", { class: "sheet", role: "dialog", "aria-label": title },
    h("div", { class: "sheet-head" },
      h("h3", {}, title),
      h("button", { class: "icon-btn", "aria-label": "Close", onclick: closeSheet }, "✕")));
  sheet.append(build(closeSheet));
  backdrop.append(sheet);
  document.body.append(backdrop);
}

export function openMenu(title, items) {
  openSheet(title, close => h("div", {},
    items.map(it => h("button", { class: "menu-item", onclick: () => { close(); it.onPick(); } }, it.label))));
}

let toastTimer;
export function toast(msg, ms = 3500) {
  document.querySelector(".toast")?.remove();
  clearTimeout(toastTimer);
  const el = h("div", { class: "toast", role: "status" }, msg);
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), ms);
}
```

- [ ] **Step 5: Write stub screens**

`ui/today.js`:
```js
import { h } from "./dom.js";
export function renderToday(app, iso) { return h("p", { class: "note" }, `Today: ${iso}`); }
```

`ui/week.js`:
```js
import { h } from "./dom.js";
export function renderWeek(app, n) { return h("p", { class: "note" }, `Week ${n}`); }
```

- [ ] **Step 6: Write `app.js`**

```js
// Boot, routing, and the one place data is saved.
import { localISO, isISODate } from "./lib/dates.js";
import { adaptSeed, weekForDate } from "./lib/plan.js";
import { loadData, saveData, markEdited } from "./lib/store.js";
import { h, downloadText } from "./ui/dom.js";
import { toast, closeSheet } from "./ui/sheet.js";
import { renderToday } from "./ui/today.js";
import { renderWeek } from "./ui/week.js";

const main = document.getElementById("main");
const app = { plan: null, data: null, today: localISO(new Date()), commit, go };

function commit(next, { edit = true, rerender = true } = {}) {
  const saved = edit ? markEdited(next, app.today) : next;
  const res = saveData(localStorage, saved);
  if (!res.ok) { toast(`Couldn't save: ${res.error}`, 6000); return false; }
  app.data = saved;
  if (rerender) render();
  return true;
}

function go(view, arg) {
  location.hash = view === "week" ? `#/week/${arg}` : `#/day/${arg}`;
}

function defaultWeek() {
  const w = weekForDate(app.plan, app.today);
  if (w) return w.number;
  const first = app.plan.weeks[0];
  return app.today < first.days[0].date ? first.number : app.plan.weeks.at(-1).number;
}

function parseHash() {
  const [, view, arg] = location.hash.split("/");
  if (view === "week") {
    const n = Number(arg);
    return { view: "week", week: Number.isInteger(n) && n > 0 ? n : defaultWeek() };
  }
  return { view: "today", date: isISODate(arg) ? arg : app.today };
}

function render() {
  const route = parseHash();
  main.replaceChildren(route.view === "week" ? renderWeek(app, route.week) : renderToday(app, route.date));
  for (const a of document.querySelectorAll(".tabbar a")) a.classList.toggle("active", a.dataset.view === route.view);
}

function fatal(title, message, raw) {
  main.replaceChildren(h("div", { class: "fatal" },
    h("h2", {}, title),
    h("p", {}, message),
    raw != null ? h("button", { class: "btn", onclick: () => downloadText(`trainlog-raw-${app.today}.json`, raw) }, "Download raw data") : null));
}

async function boot() {
  let raw;
  try {
    const res = await fetch("./plan.seed.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  } catch (e) {
    return fatal("Couldn't load the training plan", `plan.seed.json didn't load (${e.message}). Check your connection and reload.`);
  }
  try { app.plan = adaptSeed(raw); }
  catch (e) { return fatal("The training plan file has a problem", e.message); }

  const loaded = loadData(localStorage);
  if (!loaded.ok) return fatal("Your saved data can't be read", `${loaded.error}. Nothing has been changed or deleted.`, loaded.raw);
  app.data = loaded.data;

  window.addEventListener("hashchange", () => { closeSheet(); render(); window.scrollTo(0, 0); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const now = localISO(new Date());
    if (now !== app.today) { app.today = now; render(); }
  });
  render();
}

boot();
```

- [ ] **Step 7: Check in the browser**

Start the preview with `preview_start` (name `trainlog`). Open `http://localhost:8137/` at the mobile preset (375 × 812). Check:
- The page shows `Today: <today's date>`, and the Today tab is highlighted.
- Tapping Week shows `Week <n>`, and the URL is `#/week`.
- `#/day/2026-11-11` shows `Today: 2026-11-11`.
- `#/week/2` shows `Week 2`.
- The console has no errors.

Then rename `plan.seed.json` to `plan.seed.json.bak` and reload. The page should show "Couldn't load the training plan". Rename it back.

Then, in the console, run `localStorage.setItem("trainlog.v1", "{bad")` and reload. The page should show "Your saved data can't be read" with a **Download raw data** button, and `localStorage.getItem("trainlog.v1")` should still be `"{bad"`. Clean up with `localStorage.removeItem("trainlog.v1")`.

- [ ] **Step 8: Commit**

```bash
git add index.html styles.css app.js ui/
git commit -m "App shell: boot, hash routing, single save path, error screens"
```

---

### Task 8: Week screen and first deploy (Checkpoint 1)

**Files:**
- Modify: `ui/week.js` (replace the stub)
- Create: `ui/backup.js` (placeholder: `backupSection` returns `null` until Task 12)

**Interfaces:**
- Consumes:
  - `resolveDay`, `weekRange`, `phaseForWeek`, `weekForDate`, `intensityOf` from `lib/plan.js`
  - `dayStatus`, `weekTotals`, `formatDuration` from `lib/logs.js`
  - `dayName`, `formatShort` from `lib/dates.js`
- Produces:
  - `renderWeek(app, n) → Element`
  - `backupSection(app) → Element | null` (from `ui/backup.js`, filled in Task 12)

- [ ] **Step 1: Write `ui/backup.js` placeholder**

```js
export function backupSection(app) { return null; }
export async function backUp(app) {}
```

- [ ] **Step 2: Write `ui/week.js`**

```js
// Week screen: pick a week, see totals, see each day's plan and status. Read-only.
import { h } from "./dom.js";
import { dayName, formatShort } from "../lib/dates.js";
import { resolveDay, weekRange, phaseForWeek, weekForDate, intensityOf } from "../lib/plan.js";
import { dayStatus, weekTotals, formatDuration } from "../lib/logs.js";
import { backupSection } from "./backup.js";

const ICON = { done: "✓", partial: "◐", skipped: "✕", planned: "○", "not-logged": "·", rest: "" };
const LABEL = { done: "Done", partial: "Partly done", skipped: "Skipped", planned: "Planned", "not-logged": "Not logged", rest: "Rest" };
const off = card => card.state === "skipped" || card.state === "moved-out";

function totalsText(t) {
  const time = formatDuration(t.loggedMinutes) + (t.hasPlannedMinutes ? ` / ${formatDuration(t.plannedMinutes)}` : "");
  return `Run ${t.loggedKm.toFixed(1)} / ${t.plannedKm} km · ${time} · Strength ${t.strengthDone} / ${t.strengthPlanned}`;
}

function dayRow(app, day) {
  const st = dayStatus(day, app.today);
  const label = LABEL[st.mark] + (st.changed ? ", changed" : "");
  return h("button", {
    class: "day-row" + (day.date === app.today ? " today" : "") + (st.mark === "not-logged" ? " dim" : ""),
    "aria-label": `${dayName(day.date)} ${formatShort(day.date)}: ${label}`,
    onclick: () => app.go("day", day.date),
  },
    h("span", { class: "dr-date" }, h("b", {}, dayName(day.date)), " ", formatShort(day.date)),
    h("span", { class: "dr-items" },
      day.run ? h("span", { class: `chip ${intensityOf(day.run.item.type)}${off(day.run) ? " off" : ""}` }, day.run.item.type) : null,
      day.strength ? h("span", { class: `chip str${off(day.strength) ? " off" : ""}` }, day.strength.item.session) : null,
      !day.run && !day.strength ? h("span", { class: "muted" }, "Rest") : null),
    h("span", { class: "dr-status" }, ICON[st.mark], st.changed ? " ↔" : ""));
}

export function renderWeek(app, n) {
  const { plan } = app;
  const week = plan.weeks.find(w => w.number === n) || plan.weeks[0];
  const idx = plan.weeks.indexOf(week);
  const prev = plan.weeks[idx - 1], next = plan.weeks[idx + 1];
  const { start, end } = weekRange(week);
  const phase = phaseForWeek(plan, week.number);
  const todayWeek = weekForDate(plan, app.today)?.number ?? null;
  const phaseIndex = p => Math.max(0, plan.phases.indexOf(p)) % 4;

  return h("div", { class: "screen" },
    h("header", { class: "day-head" },
      h("div", { class: "day-nav" },
        h("button", { class: "icon-btn", "aria-label": "Previous week", disabled: !prev, onclick: () => app.go("week", prev.number) }, "‹"),
        h("div", { class: "day-title" }, `Week ${week.number} of ${plan.weeks.length}`),
        h("button", { class: "icon-btn", "aria-label": "Next week", disabled: !next, onclick: () => app.go("week", next.number) }, "›")),
      h("div", { class: "day-sub" },
        `${formatShort(start)} – ${formatShort(end)}`,
        phase ? h("span", { class: "pill" }, phase.name) : null,
        todayWeek != null && todayWeek !== week.number ? h("button", { class: "link-btn", onclick: () => app.go("week", todayWeek) }, "This week") : null)),
    h("div", { class: "week-strip" },
      plan.weeks.map(w => h("button", {
        class: `wk ph${phaseIndex(phaseForWeek(plan, w.number))}${w.number === week.number ? " current" : ""}${w.number === todayWeek ? " today" : ""}`,
        "aria-label": `Week ${w.number}`,
        onclick: () => app.go("week", w.number),
      }, w.number))),
    h("p", { class: "totals" }, totalsText(weekTotals(plan, app.data, week.number))),
    h("div", { class: "days" }, week.days.map(d => dayRow(app, resolveDay(plan, app.data, d.date)))),
    backupSection(app));
}
```

- [ ] **Step 3: Check in the browser**

Preview at the mobile preset, then open `#/week`. Check:
- The header reads `Week n of 11` with the right date range and phase.
- The strip shows 11 blocks shaded by phase. The current week has a border, and today's week is underlined.
- There are 7 rows from Mon to Sun. Run chips are coloured (easy green, long blue, MP orange, intervals red), and session letters show.
- Today's row has a blue border.
- Tapping a row goes to `#/day/<date>`.
- ‹ and › step through the weeks and are disabled at the ends. **This week** appears only on other weeks.
- The totals line shows `Run 0.0 / <planned> km · 0 min · Strength 0 / <n>`.
- At 360 px wide (`resize_window` 360 × 740) nothing scrolls sideways.
- Compare three weeks against `plan.seed.json` by eye: the first, a middle one, and the last.

- [ ] **Step 4: Commit**

```bash
git add ui/week.js ui/backup.js
git commit -m "Week screen: week picker, totals, day rows with status marks"
```

- [ ] **Step 5: Deploy to GitHub Pages**

Ask Sheldon to create an empty **public** repo named `trainlog` on github.com (no README), and to send its URL. Then:

```bash
git remote add origin https://github.com/<sheldon-username>/trainlog.git
git push -u origin main
```

Ask Sheldon to open the repo's **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save. Wait for the green "Your site is live at …" banner. The site URL is `https://<sheldon-username>.github.io/trainlog/`.

- [ ] **Step 6: CHECKPOINT 1. Stop for Sheldon's review.**

Sheldon opens the Pages URL on his phone. Every week matches the plan. Do not start Task 9 until he says it's correct.

---

### Task 9: Today screen and run logging

**Files:**
- Modify: `ui/today.js` (replace the stub)

**Interfaces:**
- Consumes:
  - `resolveDay`, `isLogged` from `lib/plan.js`
  - `setRunLog`, `clearRunLog`, `runSummary`, `parseNum`, `durationFromParts` from `lib/logs.js`
  - `backupReminder` from `lib/store.js`
  - `addDays`, `formatDay` from `lib/dates.js`
  - `openSheet` from `ui/sheet.js`
  - `backUp` from `ui/backup.js`
- Produces:
  - `renderToday(app, iso)`
  - Internal helpers that Tasks 10 and 11 extend in this same file:
    - `cardShell(app, day, card, titleChildren, bodyChildren) → Element`
    - `stateTag(card) → Element | null`

- [ ] **Step 1: Write `ui/today.js`**

```js
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
```

- [ ] **Step 2: Check in the browser**

Preview at the mobile preset, then open `#/day/<a planned run date from the seed>`. Check:
- **Header:** shows `Wed 11 Nov`-style date, `Week n`, the phase pill and `lift at …`.
- **Day arrows:** ‹ and › move one day.
- **Date picker:** tapping the date opens Chrome's date picker, and choosing a date navigates there.
- **Today button:** appears when another date is open and returns to today.
- **Rest days:** a rest date shows "Rest day".
- **Outside the plan:** a date before the plan shows "No plan for this date" and "Outside the plan".
- **Run logging:**
  1. Tap **Log run**. The sheet opens with the km field focused.
  2. Type `6,2`, minutes `38`, HR `141`, tap RPE 3, then **Save run ✓**.
  3. The card shows `✓ 6.2 km · 38 min · HR 141 · RPE 3`.
  4. Reload: the summary is still there.
  5. Tap the summary: the fields are pre-filled. **Clear log** removes it.
- **Timing:** logging a run takes under 30 s, with a stopwatch.
- **Week screen:** after logging, that day shows ◐ (strength not done) or ✓ (run-only day), and the totals include the km.

- [ ] **Step 3: Commit**

```bash
git add ui/today.js
git commit -m "Today screen: header, date navigation, run logging sheet"
```

---

### Task 10: Strength checklist with pre-fill (Checkpoint 2)

**Files:**
- Modify: `ui/today.js` (replace `strengthCard`, add the set editor, extend the imports)

**Interfaces:**
- Consumes:
  - `exercisesFor`, `targetFor` from `lib/plan.js`
  - `exerciseRows`, `toggleSet`, `editSet`, `removeSet`, `addSet`, `setExerciseRpe`, `setStrengthNotes`, `parseNum` from `lib/logs.js`
- Produces: the finished strength card on Today.

- [ ] **Step 1: Extend the imports in `ui/today.js`**

Replace the `lib/plan.js` and `lib/logs.js` import lines with:
```js
import { resolveDay, isLogged, exercisesFor, targetFor } from "../lib/plan.js";
import { setRunLog, clearRunLog, runSummary, parseNum, durationFromParts, exerciseRows, toggleSet, editSet, removeSet, addSet, setExerciseRpe, setStrengthNotes } from "../lib/logs.js";
```

- [ ] **Step 2: Replace `strengthCard` and add the set editor**

```js
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
```

- [ ] **Step 3: Check in the browser**

Preview at the mobile preset, then open a date with session A.

**First session (no history):**
- Each exercise shows its target (e.g. `3×6–8 @ RPE 6–7`) and the target's number of `– kg × –` rows.
- Tap ✓ on a blank row: the editor opens.
- Set kg `80` (try typing `62,5` once too), reps `8`, then **Save set ✓**. The row turns solid with a green ✓, and the tag reads `1/n sets`.

**Second session (with history):**
- Go to the next date with session A, or C if it shares an exercise. That exercise's rows are pre-filled in grey from the first session.
- **One tap:** ✓ logs a pre-filled set.
- **Undo:** ✓ again undoes it.
- **Steppers:** −2.5 and +2.5 work.
- **Remove set** and **+ set** work.
- **RPE:** choosing an RPE keeps the page's scroll position.
- **Notes:** typing session notes and tapping elsewhere saves them (check with a reload).

**Timing:** use a stopwatch on a full pre-filled session. It should be about 1 tap per set and well under 3 minutes.

**Week screen:** the day shows ✓ once both the run and the session have something logged.

Run `node --test "tests/*.test.mjs"`. All tests still pass.

- [ ] **Step 4: Commit and push**

```bash
git add ui/today.js
git commit -m "Today: strength checklist with one-tap sets, pre-fill from last session"
git push
```

- [ ] **Step 5: CHECKPOINT 2. Stop for Sheldon's review.**

Sheldon logs a real gym session and a run on his phone from the Pages URL. Collect his feedback before Task 11.

---

### Task 11: Skip, swap, move, add and undo (Checkpoint 3)

**Files:**
- Modify: `ui/today.js`

**Interfaces:**
- Consumes:
  - `cardActions`, `setOverride`, `undoChange`, `addSession`, `canMoveTo` from `lib/plan.js`
  - `mondayOf`, `dayName`, `formatShort` from `lib/dates.js`
  - `openMenu` from `ui/sheet.js`
- Produces: the `⋯` menu on each card, the Move sheet, and the add buttons.

- [ ] **Step 1: Extend the imports in `ui/today.js`**

```js
import { openSheet, openMenu } from "./sheet.js";
import { addDays, formatDay, mondayOf, dayName, formatShort } from "../lib/dates.js";
import { resolveDay, isLogged, exercisesFor, targetFor, cardActions, setOverride, undoChange, addSession, canMoveTo } from "../lib/plan.js";
```

- [ ] **Step 2: Replace the `menuButton` stub and add the change helpers**

```js
const ACTION_LABEL = { skip: "Skip", swap: "Swap…", move: "Move to…", undo: "Undo change" };
const kindWord = kind => (kind === "run" ? "run" : "strength session");

function menuButton(app, day, card) {
  const actions = cardActions(card);
  if (!actions.length) return null;
  const run = {
    skip: () => app.commit(setOverride(app.data, day.date, card.kind, { type: "skip" })),
    undo: () => app.commit(undoChange(app.data, card, day.date)),
    swap: () => swapMenu(app, day.date, card),
    move: () => moveSheet(app, day.date, card.kind),
  };
  return h("button", { class: "icon-btn", "aria-label": `Change this ${kindWord(card.kind)}`,
    onclick: () => openMenu(`Change this ${kindWord(card.kind)}`, actions.map(a => ({ label: ACTION_LABEL[a], onPick: run[a] }))) }, "⋯");
}

function swapMenu(app, iso, card) {
  if (card.kind === "run") {
    openMenu("Swap to", app.plan.runTypes.filter(t => t !== card.item.type).map(t => ({
      label: t, onPick: () => app.commit(setOverride(app.data, iso, "run", { type: "swap", runType: t })),
    })));
  } else {
    openMenu("Swap to", Object.keys(app.plan.sessionTemplates).filter(s => s !== card.item.session).map(s => ({
      label: `Session ${s}`, onPick: () => app.commit(setOverride(app.data, iso, "strength", { type: "swap", session: s })),
    })));
  }
}

function moveSheet(app, from, kind) {
  openSheet(`Move ${kindWord(kind)} to…`, close => {
    const msg = h("p", { class: "error-text", role: "alert" });
    const move = to => {
      if (!canMoveTo(app.plan, app.data, kind, from, to)) {
        msg.textContent = to === from ? "That's the same day." : `${formatDay(to)} already has a ${kindWord(kind)}.`;
        return;
      }
      if (app.commit(setOverride(app.data, from, kind, { type: "move", to }))) close();
    };
    const start = mondayOf(from);
    const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
    const other = h("input", { type: "date", onchange: e => { if (e.target.value) move(e.target.value); } });
    return h("div", {},
      h("div", { class: "date-grid" }, days.map(d => h("button", {
        class: "date-chip" + (d === from ? " current" : ""),
        disabled: !canMoveTo(app.plan, app.data, kind, from, d),
        "aria-label": formatDay(d),
        onclick: () => move(d),
      }, dayName(d), h("br"), formatShort(d)))),
      h("label", { class: "field" }, "Other date", other),
      msg);
  });
}

function addButtons(app, day) {
  const buttons = [];
  if (!day.run) buttons.push(h("button", { class: "btn btn-quiet", onclick: () => openMenu("Add a run",
    app.plan.runTypes.map(t => ({ label: t, onPick: () => app.commit(addSession(app.plan, app.data, day.date, { kind: "run", runType: t })) }))) }, "+ Add run"));
  if (!day.strength) buttons.push(h("button", { class: "btn btn-quiet", onclick: () => openMenu("Add a strength session",
    Object.keys(app.plan.sessionTemplates).map(s => ({ label: `Session ${s}`, onPick: () => app.commit(addSession(app.plan, app.data, day.date, { kind: "strength", session: s })) }))) }, "+ Add strength"));
  return buttons.length ? h("div", { class: "adds" }, buttons) : null;
}
```

- [ ] **Step 3: Show the add buttons**

In `renderToday`, add `addButtons(app, day)` as the last child after the strength card:
```js
    day.strength ? strengthCard(app, day) : null,
    addButtons(app, day));
```

- [ ] **Step 4: Check in the browser**

At the mobile preset, with a stopwatch on each change (each should take under 30 s):
- **Skip a run:** the card dims and shows "Skipped". The strength card is unchanged. In Week, the day shows ↔. **Undo change** restores it.
- **Swap a run:** the card shows the new type, the "Swapped" tag and "Swapped from …". In Week, the chip colour changes.
- **Swap a session:** the A exercises change to C's.
- **Move a session to Friday:**
  - the source card shows "Moved to Fri …", which links to Friday
  - Friday shows the session with a "Moved from …" tag
  - in the Move sheet, dates that already have a session are greyed out
  - picking a busy date in **Other date** shows the error line
  - **Undo** from Friday's card puts the session back on the original date
- **Add sessions:** on a rest day, **+ Add run** then Easy Z2 adds a run card tagged "Added". **Undo change** removes it.
- **Logged cards:** log a run on a planned card. The ⋯ menu then offers only **Swap…**. On an added card with a log, there is no ⋯ at all.
- **Week totals:** they reflect skipped and moved items.

Run `node --test "tests/*.test.mjs"`. All tests still pass.

- [ ] **Step 5: Commit and push**

```bash
git add ui/today.js
git commit -m "Today: per-card skip/swap/move/undo menu and add-session buttons"
git push
```

- [ ] **Step 6: CHECKPOINT 3. Stop for Sheldon's review.**

Sheldon tries a skip, a swap and a move on his phone. Each takes under 30 s.

---

### Task 12: Backup, restore and the reminder

**Files:**
- Modify: `ui/backup.js` (replace the placeholder)

**Interfaces:**
- Consumes:
  - `makeBackup`, `readBackup` from `lib/store.js`
  - `formatDay`, `formatShort` from `lib/dates.js`
  - `h`, `downloadText` from `ui/dom.js`
  - `openSheet`, `toast` from `ui/sheet.js`
- Produces:
  - `backupSection(app) → Element`, used at the bottom of Week
  - `backUp(app) → Promise<void>`, used by Week and by the reminder line on Today

- [ ] **Step 1: Write `ui/backup.js`**

```js
// Backup (share sheet if the phone can share the file, otherwise a download) and restore.
import { h, downloadText } from "./dom.js";
import { openSheet, toast } from "./sheet.js";
import { formatDay, formatShort } from "../lib/dates.js";
import { makeBackup, readBackup } from "../lib/store.js";

export async function backUp(app) {
  const { data, filename, text } = makeBackup(app.data, app.today);
  try {
    const file = new File([text], filename, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: filename });
    else downloadText(filename, text);
  } catch (e) {
    if (e.name === "AbortError") return;
    toast(`Backup failed: ${e.message}`, 6000);
    return;
  }
  if (app.commit(data, { edit: false })) toast(`Saved ${filename}`);
}

async function restoreFrom(app, file) {
  if (!file) return;
  const res = readBackup(await file.text());
  if (!res.ok) { toast(res.error, 6000); return; }
  const { logs, from, to } = res.summary;
  const range = from ? `, ${formatShort(from)} – ${formatShort(to)}` : "";
  openSheet("Restore this backup?", close => h("div", {},
    h("p", {}, `${logs} logs${range}. This replaces everything on this phone.`),
    h("button", { class: "btn", onclick: () => { if (app.commit(res.data, { edit: false })) { close(); toast("Backup restored"); } } }, "Replace with backup"),
    h("button", { class: "btn btn-quiet", onclick: close }, "Cancel")));
}

export function backupSection(app) {
  const picker = h("input", { type: "file", accept: ".json,application/json", class: "visually-hidden", tabIndex: -1,
    onchange: e => { const f = e.target.files[0]; e.target.value = ""; restoreFrom(app, f); } });
  return h("section", { class: "card" },
    h("div", { class: "card-title" }, "Backup"),
    h("p", { class: "muted" }, app.data.lastBackupAt ? `Last backup ${formatDay(app.data.lastBackupAt)}` : "Not backed up yet"),
    h("div", { class: "row" },
      h("button", { class: "btn", onclick: () => backUp(app) }, "Back up"),
      h("button", { class: "btn btn-quiet", onclick: () => picker.click() }, "Restore…")),
    picker);
}
```

- [ ] **Step 2: Check in the browser**

- **Back up:** at the bottom of Week, tap **Back up**. On desktop it downloads `trainlog-backup-<today>.json`, and the text changes to "Last backup <today>".
- **Contents:** open the file. It holds `version: 1`, the logs and the overrides.
- **Restore round trip:**
  1. Log something new, then **Restore…** the file.
  2. The sheet shows the log count and date range.
  3. **Replace with backup** brings back the old state.
  4. **Cancel** changes nothing.
- **Bad file:** restoring a `.json` that isn't a backup (e.g. `manifest.json` after Task 13, or any small JSON file) shows "This isn't a TrainLog backup: …", and the data is unchanged.
- **Reminder:**
  1. In the console, set `dirtySince` and `lastBackupAt` to dates 9 days back:
     ```js
     const d = JSON.parse(localStorage.getItem("trainlog.v1"));
     d.dirtySince = d.lastBackupAt = "<9 days ago>";
     localStorage.setItem("trainlog.v1", JSON.stringify(d));
     ```
  2. Reload. Today shows "Last backup 9 days ago · Back up".
  3. Tapping it backs up, and the line disappears.

- [ ] **Step 3: Commit**

```bash
git add ui/backup.js
git commit -m "Backup and restore with a checked summary; backup reminder on Today"
```

---

### Task 13: Offline use, install, icons (Checkpoint 4)

**Files:**
- Create: `sw.js`, `manifest.json`, `tools/make-icons.mjs`, `icons/icon-192.png`, `icons/icon-512.png` (generated), `README.md`
- Modify: `index.html` (add the manifest and icon links), `app.js` (register the service worker and ask for persistent storage)
- Test: `tests/sw.test.mjs`

**Interfaces:**
- Consumes: every app file. `FILES` in `sw.js` must list each one.
- Produces: an offline-capable, installable app.

- [ ] **Step 1: Write the failing test**

`tests/sw.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sw = readFileSync(new URL("sw.js", root), "utf8");
const match = sw.match(/const FILES = (\[[\s\S]*?\]);/);
assert.ok(match, "const FILES = [...] not found in sw.js");
const files = JSON.parse(match[1]);

test("every file sw.js caches exists", () => {
  for (const f of files) if (f !== "./") assert.ok(existsSync(new URL(f, root)), `${f} is listed in sw.js but missing`);
});

test("every app file is cached", () => {
  const needed = ["./index.html", "./styles.css", "./app.js", "./plan.seed.json", "./manifest.json",
    "./icons/icon-192.png", "./icons/icon-512.png",
    ...readdirSync(new URL("lib/", root)).map(f => `./lib/${f}`),
    ...readdirSync(new URL("ui/", root)).map(f => `./ui/${f}`)];
  for (const f of needed) assert.ok(files.includes(f), `${f} is not in sw.js FILES`);
});

test("cache name carries a version", () => {
  assert.match(sw, /const CACHE = "trainlog-v\d+";/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/sw.test.mjs`
Expected: FAIL with `ENOENT` … `sw.js`

- [ ] **Step 3: Write `tools/make-icons.mjs` and generate the icons**

```js
// Writes icons/icon-192.png and icons/icon-512.png: a white dumbbell on the accent blue.
// The shape stays inside the central 60%, so Android's maskable crop never cuts it.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [0x2b, 0x4a, 0xa8], FG = [0xff, 0xff, 0xff];
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function inDumbbell(x, y) {
  const bar = y > 0.47 && y < 0.53 && x > 0.3 && x < 0.7;
  const plates = ((x > 0.3 && x < 0.37) || (x > 0.63 && x < 0.7)) && y > 0.34 && y < 0.66;
  const ends = ((x > 0.24 && x < 0.3) || (x > 0.7 && x < 0.76)) && y > 0.4 && y < 0.6;
  return bar || plates || ends;
}
function png(size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) row.set(inDumbbell((x + 0.5) / size, (y + 0.5) / size) ? FG : BG, 1 + x * 3);
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
mkdirSync(new URL("../icons/", import.meta.url), { recursive: true });
for (const size of [192, 512]) writeFileSync(new URL(`../icons/icon-${size}.png`, import.meta.url), png(size));
console.log("Wrote icons/icon-192.png and icons/icon-512.png");
```

Run: `node tools/make-icons.mjs`
Expected: `Wrote icons/icon-192.png and icons/icon-512.png`. Open one with the Read tool and check that a white dumbbell sits on blue.

- [ ] **Step 4: Write `manifest.json`**

```json
{
  "name": "TrainLog",
  "short_name": "TrainLog",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f6f7fb",
  "theme_color": "#2b4aa8",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 5: Write `sw.js`**

The `FILES` list must stay valid JSON: double quotes, no trailing comma.

```js
// Offline cache. Bump CACHE ("trainlog-v2", "-v3", …) on every release that changes any file below.
const CACHE = "trainlog-v1";
const FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./lib/dates.js",
  "./lib/logs.js",
  "./lib/plan.js",
  "./lib/store.js",
  "./ui/backup.js",
  "./ui/dom.js",
  "./ui/sheet.js",
  "./ui/today.js",
  "./ui/week.js",
  "./plan.seed.json",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS, all tests including the 3 in `sw.test.mjs`.

- [ ] **Step 7: Link the manifest and register the service worker**

In `index.html`, after the `theme-color` meta, add:
```html
  <link rel="manifest" href="manifest.json">
  <link rel="icon" href="icons/icon-192.png">
```

In `app.js`, at the end of `boot()` after `render();`, add:
```js
  navigator.storage?.persist?.().catch(() => {});
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  if ("serviceWorker" in navigator && !local) navigator.serviceWorker.register("./sw.js").catch(() => {});
```

- [ ] **Step 8: Write `README.md`**

```markdown
# TrainLog

Phone-first training log for the Buriram Marathon block. Plain HTML/JS, no build step.

- Run locally: `python -m http.server 8137`, then open http://localhost:8137/ (no offline cache on localhost).
- Tests: `node --test "tests/*.test.mjs"`
- Release: bump `CACHE` in `sw.js`, then commit and `git push`. GitHub Pages serves `main`.
  The phone picks up the new version the next time the app is opened.
- Your logs live only on your phone. Use **Week → Back up** regularly.
- Spec: `docs/superpowers/specs/2026-11-09-trainlog-mvp-design.md`
```

- [ ] **Step 9: Commit and push**

```bash
git add sw.js manifest.json tools/make-icons.mjs icons/ index.html app.js README.md tests/sw.test.mjs
git commit -m "Offline cache, home-screen install, icons, persistent storage"
git push
```

- [ ] **Step 10: CHECKPOINT 4. Stop for Sheldon's review.**

On his Android phone, from the Pages URL, Sheldon:
1. Opens the app once online, then uses Chrome's menu → **Add to Home screen**.
2. Turns on airplane mode, opens TrainLog from the home screen, and logs a set. It works and saves.
3. Backs up, opens the Pages URL in a Chrome Incognito tab, uses **Restore…** with that file, and sees his logs.

Then go through spec section 3 and the PRD's success criteria S1–S6 that apply to this scope, one by one, and report which are met.

---

## After the plan

The deferred specs (progress charts, CSV export, template and phase editing, plan import) each get their own brainstorm → spec → plan cycle.
