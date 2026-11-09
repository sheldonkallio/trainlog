# TrainLog MVP: Logging Core

Status: draft for review
Date: 2026-11-09
Source: `PRD.md` (TrainLog PRD, 2026-11-09), narrowed in brainstorming

## 1. Purpose

A personal phone tool for logging training against the 11-week Buriram Marathon plan
(Nov 9 2026 – Jan 23 2027). It must be clean and simple enough to use every day at the
gym and after runs. Planning stays in UltraBase. Run metrics stay on the Suunto watch;
TrainLog records only a few summary fields.

The plan, your changes to it, and your logs are kept separate. Changing the plan never
rewrites the original, and logging never changes the plan.

## 2. Decisions

| Question | Decision |
|---|---|
| Scope | Logging core only (section 3). The rest of the PRD comes in later specs. |
| Storage (PRD Q1) | Phone only, in browser `localStorage`, plus JSON backup and restore. No sync. |
| Phone | Android, Chrome. Installing to the home screen is optional. |
| Standalone (PRD Q2) | New `Code/TrainLog` folder and its own git repo. UltraBase is not changed. |
| Stack (PRD Q3) | Plain HTML, CSS and ES-module JavaScript, with no build step and no npm dependencies. Node's built-in test runner, as in UltraBase. |
| Hosting (PRD Q4) | GitHub Pages from a new public repo, served from the `main` branch root. |
| Strength logging layout | Checklist: all exercises and sets on one scrolling page (option A from the mockups). |

## 3. Scope

**In v1**
- **Today:** date navigation, phase and lifting guidance, run logging, and strength logging pre-filled from your last session.
- **Changing the plan per card:** skip, swap, move to another date, undo. Adding a run or strength session to any day.
- **Week:** a read-only view of any week, with totals and a status for each day.
- **Backup** and restore as JSON, plus a backup reminder.
- **Offline use** and home-screen install.

**Deferred to later specs** (still in the PRD MVP)
- Progress charts (strength, running, adherence)
- CSV export
- Editing session templates and phase rules
- Importing a new plan JSON

**Out of scope** (as in the PRD): watch/Strava sync, AI coaching, multiple users,
nutrition.

## 4. Files

```
TrainLog/
  index.html        page shell, styles, bottom bar (Today | Week)
  app.js            draws screens and handles taps; no calculations
  lib/plan.js       calculations: day building, week/phase/target lookup
  lib/logs.js       calculations: last-session sets, weekly totals, day status
  lib/store.js      localStorage read/save, backup export and validation
  plan.seed.json    the plan, loaded as-is, never written by the app
  manifest.json     home-screen install
  sw.js             offline cache
  tests/*.test.mjs  node --test, one file per lib module
  .gitignore        includes .superpowers/
```

`lib/` modules are pure functions: no DOM, no `localStorage`, and the current date is
always passed in. That makes them testable in Node. `app.js` is the only file that
touches the DOM, and `lib/store.js` takes the storage object as a parameter so tests can
pass in a stand-in.

## 5. Data

### 5.1 Plan (read-only, from `plan.seed.json`)

The file isn't in hand yet. Its structure is assumed from the PRD, and plan step 1 checks
it against the real file:

- `meta`: name, start date, end date
- `phases`: name, week range, lifting guidance text (e.g. "Re-entry: RPE 6–7")
- `weeks → days`: date, planned run (type, description, distance if given), session id (`A`/`B`/`C` or none)
- `sessionTemplates`: `A`/`B`/`C` → ordered exercises `{ id, name, role }`, where role is one of `upperMain`, `lowerMain`, `upperAcc`, `lowerAcc`, `core`
- `targetsByPhase`: phase × role → target text (e.g. "3×6–8 @ RPE 6–7")

If the real file differs, `lib/plan.js` gets an adapter that turns it into this shape.
The rest of the app depends only on the adapted shape.

### 5.2 What you enter

Everything goes under one `localStorage` key, `trainlog.v1`:

```js
{
  version: 1,
  overrides: {            // by date; each card's change is independent
    "2026-11-12": {
      run?:      { type: "skip" } | { type: "swap", runType } | { type: "move", to: "2026-11-14" },
      strength?: { type: "skip" } | { type: "swap", session: "B" } | { type: "move", to: "2026-11-14" }
    }
  },
  added: {                // sessions added to a date
    "2026-11-15": [ { kind: "run", runType? } | { kind: "strength", session: "B" } ]
  },
  runLogs: {
    "2026-11-11": { done: true, km: 6.2, minutes: 38, avgHr: 141, rpe: 3, notes: "" }
  },
  strengthLogs: {
    "2026-11-11": {
      session: "A",
      exercises: { "<exerciseId>": { sets: [ { kg: 80, reps: 8 } ], rpe?: 7 } },
      notes: ""
    }
  },
  lastBackupAt: "2026-11-09T20:15:00+07:00" | null
}
```

- **Dates** are local `YYYY-MM-DD` strings, never derived from UTC.
- **Exercises are keyed by stable `id`**, so history survives renames.
- **Logs for one date:** each date holds at most one run log and one strength log. An added session on a day with nothing else planned uses those same slots. If a day already has a planned run, its `+ Add run` option is hidden (likewise for strength).

### 5.3 Building the day you see

`resolveDay(date, plan, data)` returns, for each of the run and strength cards:

- **planned item:** the plan day, then its override, then added sessions
- **state:** `planned` / `skipped` / `swapped` / `moved-out` (with target date) / `moved-in` (with source date) / `added`
- **log:** the log for that date, if any

A move puts the card in the `moved-out` state on its source date and adds a `moved-in`
copy to its target date. **Undo change** deletes the override, and the original plan shows
again. A card can't be moved onto a date that already has a planned or moved-in card of
the same kind; that date is greyed out in the date picker.

## 6. Today screen

**Header:** ‹ date ›. The arrows go back or forward one day, and tapping the date opens
a date picker. A **Today** button shows whenever another date is open. Below that: week
number, phase, and the phase's lifting guidance.

**Run card**
- Shows the planned run type and description. Tap the card to open the log fields:
  - km (decimal)
  - duration (`38` = minutes; `1:05` = h:mm)
  - avg HR
  - RPE as tap targets 1–10
  - notes
- Number fields use the number keypad.
- When saved, the card collapses to one line: `6.2 km · 38 min · HR 141 · RPE 3`. Tap it to edit.

**Strength card (checklist)**
- **Each exercise shows** its name and target text, from `targetsByPhase[phase][role]`.
- **Pre-fill:** set rows are pre-filled in grey from the most recent earlier date that has
  a log for that exercise id, in any session. The number of sets copies that log.
- **No history:** the set count is the first number in the target text ("3×6–8" gives 3,
  otherwise 3), and kg and reps start blank.
- **Logging a set:**
  - **✓** logs the set as shown (1 tap).
  - Tapping the numbers opens an editor: kg ±2.5, reps ±1, typed entry, **Remove set**.
  - **+ set** adds a set copying the last one.
- An optional RPE row per exercise, and a session notes field at the end.
- Every change saves straight away. There is no Save button.

**Changing the plan:** each card has a **⋯** menu:
- **Skip**
- **Swap**: a run type from the plan's run types, or session A/B/C
- **Move to…**: date picker
- **Undo change**, shown when the card has an override

**Card states**
- **Skipped:** the card hides its log fields.
- **Moved out:** the card shows "Moved to Fri 13" with a link to that date.
- **Rest day, or both cards skipped:** shows **+ Add run** and **+ Add strength session**.

**Backup reminder:** shown when there are logs newer than `lastBackupAt` and the last
backup (or first log, if never backed up) is more than 7 days old. It reads "Last backup
9 days ago · Back up".

## 7. Week screen

- **Picking a week:**
  - **Header:** ‹ Week 3 of 11 · Nov 23–29 › and a **This week** button.
  - **Week strip:** 11 blocks shaded by phase. Tap one to jump to that week.
  - Any week is reachable in ≤ 2 interactions.
- **Totals:** `Run 24.0 / 32 km · 2h 41m · Strength 2 / 3`. That's logged km against planned km, logged time, and strength sessions logged out of planned. Planned run time is shown only if the seed has durations. These counts use the plan after your changes are applied.
- **Days:** seven stacked rows, Monday to Sunday. Each row shows:
  - the day and date
  - the run chip, coloured by intensity, chosen by matching the run type name:
    - easy/Z2/recovery: green
    - long: blue
    - MP/tempo/threshold: orange
    - intervals/reps/hills: red
    - anything else: grey
  - the session letter
  - a status mark
- **Status marks:**
  - **✓ done:** every card still on that day (not skipped, not moved out) has a log
  - **◐ partial:** some but not all
  - **✕ skipped:** all planned cards skipped and nothing logged
  - **↔ changed:** any override or added session, shown next to the other marks
  - **○ planned:** today or later, nothing logged
  - **· not logged:** a past date with nothing logged, shown dimmed
- Today's row is highlighted. Tap a row to open that date in Today.
- **Backup section** (at the bottom):
  - **Back up:** creates `trainlog-backup-YYYY-MM-DD.json`. It uses the Web Share API with a file where available, and otherwise downloads the file. Sets `lastBackupAt`.
  - **Restore:** pick a file, check it, then show a summary: "142 logs, Nov 9 – Dec 20. This replaces what's on this phone." Nothing changes until you confirm.

## 8. Offline use and install

- `sw.js` serves from cache first for `index.html`, `app.js`, `lib/*`, `plan.seed.json`
  and `manifest.json`. The cache name includes a version that each release changes.
  The new version takes over the next time the app is opened.
- `manifest.json` allows "Add to Home screen" on Android Chrome.
- On first launch the app calls `navigator.storage.persist()` so Chrome won't clear its
  data under storage pressure.

## 9. Errors

| Situation | Behaviour |
|---|---|
| Stored data can't be read | Never overwritten. Shows an error with a **Download raw data** button. |
| Save to `localStorage` fails | A "Couldn't save" message; what you entered stays on screen. |
| Date outside the plan | "No plan for this date". **+ Add run / strength** still available. |
| `plan.seed.json` fails to load | A clear error message instead of a blank screen. |
| Restore file invalid (bad JSON, wrong `version`, wrong shape) | Rejected with the reason; current data unchanged. |
| Logged exercise id no longer in the templates | Log kept as-is; not shown on Today. |

## 10. Testing

`node --test tests/` covers:

- **`lib/plan.js`:**
  - week and phase lookup on the first and last day of the block and at phase boundaries
  - `resolveDay` with no override, skip, swap, move (both dates), add, and undo
  - moving onto a blocked date is refused
  - a date outside the plan
  - adapting the seed (once the real file is in hand)
- **`lib/logs.js`:**
  - last-session sets for an exercise across different sessions
  - ignoring the current and later dates
  - the fallback set count from target text
  - weekly totals with changes applied
  - each day status
- **`lib/store.js`:**
  - loading empty storage
  - loading storage that can't be read (not overwritten)
  - backup validation (good, bad JSON, wrong version, wrong shape)
  - the reminder rule
  - export-then-restore round trip

Screens are checked in a phone-width browser preview, and by you on the phone at each
checkpoint.

## 11. Build order and checkpoints

1. Scaffold, `.gitignore`, load and adapt `plan.seed.json`, read-only Week screen,
   GitHub Pages deploy. **Checkpoint:** the plan is visible and correct on your phone.
2. Today screen read-only, then run logging, then strength logging with pre-fill.
   **Checkpoint:** you log a real gym session.
3. Skip, swap, move, add, undo. **Checkpoint:** changing a day takes < 30 s.
4. Backup, restore, backup reminder, offline cache, manifest, persistent storage.
   **Checkpoint:** works in airplane mode; a backup restores on a fresh browser profile.

## 12. Open items

- **`plan.seed.json` is needed before build step 1.** Its structure in 5.1 is assumed.
- **GitHub:** you create the public `trainlog` repo in the browser once (the `gh` CLI isn't installed). After that, deploys are `git push`.
- **PRD wording:** the PRD says UltraBase "has no data entry". It has check-offs and weigh-ins, but no set/rep logging, so the case for a separate tool still holds.
