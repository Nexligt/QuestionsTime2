/*
  filtersRepository.js
  Accès au store IndexedDB `filters` (déjà créé par db.js, keyPath "key",
  même forme clé/valeur que `settings`) : aucun nouveau store.

  Une seule entrée pour l'instant :
    { key: "tagStates", value: { [tag]: "required" | "excluded" } }
  (les tags neutres ne sont pas stockés — voir features/filters/tagFilters.js).
*/

import { openDatabase, STORES } from "./db.js";

export const TAG_STATES_KEY = "tagStates";

/**
 * États des filtres par tag enregistrés ({} si aucun).
 * @returns {Promise<Record<string,string>>}
 */
export async function getTagFilterStates() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORES.FILTERS, "readonly")
      .objectStore(STORES.FILTERS)
      .get(TAG_STATES_KEY);

    request.onsuccess = () => {
      const value = request.result?.value;
      resolve(value && typeof value === "object" ? { ...value } : {});
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remplace les états des filtres par tag enregistrés.
 * @param {Record<string,string>} states
 * @returns {Promise<void>}
 */
export async function setTagFilterStates(states) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FILTERS, "readwrite");
    tx.objectStore(STORES.FILTERS).put({ key: TAG_STATES_KEY, value: { ...states } });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
