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
