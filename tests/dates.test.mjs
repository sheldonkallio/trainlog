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
