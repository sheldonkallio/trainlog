import { h } from "./dom.js";
export function renderWeek(app, n) { return h("p", { class: "note" }, `Week ${n}`); }
