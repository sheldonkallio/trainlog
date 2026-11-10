import { h } from "./dom.js";
export function renderToday(app, iso) { return h("p", { class: "note" }, `Today: ${iso}`); }
