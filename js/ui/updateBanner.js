/*
  updateBanner.js
  Bandeau discret « Nouvelle version disponible », au-dessus de la barre du
  bas, avec « Mettre à jour » et une croix pour le fermer. Ne recharge
  jamais la page tout seul.
*/

const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`;

/**
 * @param {() => void} onUpdate - applique la mise à jour.
 * @param {Document} [doc]
 * @returns {HTMLElement}
 */
export function showUpdateBanner(onUpdate, doc = document) {
  doc.querySelector(".update-banner")?.remove();
  const banner = doc.createElement("div");
  banner.className = "update-banner";
  banner.setAttribute("role", "status");
  const text = doc.createElement("p");
  text.className = "update-banner__text";
  text.textContent = "Nouvelle version disponible";
  const update = doc.createElement("button");
  update.type = "button";
  update.className = "button update-banner__update";
  update.textContent = "Mettre à jour";
  update.addEventListener("click", () => {
    update.disabled = true;
    update.textContent = "Mise à jour…";
    onUpdate();
  });
  const close = doc.createElement("button");
  close.type = "button";
  close.className = "icon-button update-banner__close";
  close.setAttribute("aria-label", "Fermer");
  close.innerHTML = CLOSE_ICON;
  close.addEventListener("click", () => banner.remove());
  banner.append(text, update, close);
  doc.body.append(banner);
  return banner;
}
