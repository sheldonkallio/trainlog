// Week screen: pick a week, see totals, see each day's plan and status. Read-only.
import { h } from "./dom.js";
import { dayName, formatShort } from "../lib/dates.js";
import { resolveDay, weekRange, phaseForWeek, phaseColor, weekForDate, intensityOf } from "../lib/plan.js";
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
        class: `wk ph${phaseColor(plan, phaseForWeek(plan, w.number))}${w.number === week.number ? " current" : ""}${w.number === todayWeek ? " today" : ""}`,
        "aria-label": `Week ${w.number}`,
        onclick: () => app.go("week", w.number),
      }, w.number))),
    h("p", { class: "totals" }, totalsText(weekTotals(plan, app.data, week.number))),
    h("div", { class: "days" }, week.days.map(d => dayRow(app, resolveDay(plan, app.data, d.date)))),
    backupSection(app));
}
