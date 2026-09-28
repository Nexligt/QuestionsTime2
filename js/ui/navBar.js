/*
  navBar.js
  Construit le menu inférieur à partir de NAV_ITEMS (navConfig.js)
  et le maintient synchronisé avec la vue active fournie par le routeur.
*/

import { NAV_ITEMS } from "./navConfig.js";
import { navigateTo, onViewChange } from "../core/router.js";

const iconCache = new Map();

async function loadIcon(path) {
  if (iconCache.has(path)) return iconCache.get(path);

  const response = await fetch(path);
  const svgText = await response.text();
  iconCache.set(path, svgText);
  return svgText;
}

/**
 * Construit le menu inférieur dans le conteneur fourni.
 * @param {HTMLElement} container
 */
export async function initBottomNav(container) {
  container.innerHTML = "";

  for (const item of NAV_ITEMS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-item";
    button.dataset.view = item.view;
    button.setAttribute("aria-label", item.label);

    const iconWrap = document.createElement("span");
    iconWrap.className = "nav-item__icon";
    iconWrap.innerHTML = await loadIcon(item.icon);

    const labelEl = document.createElement("span");
    labelEl.className = "nav-item__label";
    labelEl.textContent = item.label;

    button.append(iconWrap, labelEl);
    button.addEventListener("click", () => navigateTo(item.view));

    container.append(button);
  }

  onViewChange((activeViewName) => {
    for (const button of container.querySelectorAll(".nav-item")) {
      const isActive = button.dataset.view === activeViewName;
      button.toggleAttribute("aria-current", isActive);
      if (isActive) button.setAttribute("aria-current", "page");
    }
  });
}
