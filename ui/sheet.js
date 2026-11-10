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
