/*
  infoSection.js
  Section "Informations" de Paramètres : liste de libellés / valeurs en
  lecture seule, recalculée à chaque ouverture de la page à partir des
  données réelles (jamais de valeur écrite en dur, hormis la version).

  Ajouter une information = ajouter une entrée dans INFO_ITEMS :
    { id, label, read: (context) => valeur | Promise<valeur> }
  `context` contient les données partagées déjà chargées (ex. compteurs),
  pour ne lire IndexedDB qu'une seule fois.
*/

import { APP_VERSION } from "../../core/appVersion.js";
import { getQuestionCounts } from "../../data/questionsRepository.js";

export const INFO_ITEMS = [
  { id: "version", label: "Version", read: () => APP_VERSION },
  { id: "base-count", label: "Questions de base disponibles", read: (ctx) => ctx.counts.baseAvailable },
  { id: "local-count", label: "Questions locales", read: (ctx) => ctx.counts.local },
  { id: "deleted-count", label: "Questions supprimées", read: (ctx) => ctx.counts.deleted },
];

/**
 * @param {string} labelledBy - id du titre de la section.
 * @returns {HTMLElement}
 */
export function buildInfoSection(labelledBy) {
  const list = document.createElement("dl");
  list.className = "settings-info";
  list.setAttribute("aria-labelledby", labelledBy);
  list.dataset.ready = "false";

  const values = new Map();
  for (const item of INFO_ITEMS) {
    const row = document.createElement("div");
    row.className = "settings-info__row";
    row.dataset.info = item.id;
    const term = document.createElement("dt");
    term.className = "settings-info__label";
    term.textContent = item.label;
    const value = document.createElement("dd");
    value.className = "settings-info__value";
    value.textContent = "…";
    row.append(term, value);
    list.append(row);
    values.set(item.id, value);
  }

  (async () => {
    let counts = null;
    try {
      counts = await getQuestionCounts();
    } catch (error) {
      console.error("[infoSection] Compteurs indisponibles :", error);
    }
    const context = { counts };
    for (const item of INFO_ITEMS) {
      let text;
      try {
        const result = await item.read(context);
        text = result === undefined || result === null ? "—" : String(result);
      } catch {
        text = "—"; // information indisponible (ex. lecture IndexedDB impossible)
      }
      values.get(item.id).textContent = text;
    }
    list.dataset.ready = "true";
  })();

  return list;
}
