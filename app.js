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
