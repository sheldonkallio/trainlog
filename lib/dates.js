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
