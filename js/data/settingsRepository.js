/*
  settingsRepository.js
  Accès générique au store IndexedDB `settings` (paires clé/valeur).

  Utilisé pour l'instant uniquement par js/features/questions/questionEngine.js
  pour connaître le mode de sélection courant (Strict/Libre), afin
  d'éviter une seconde source de vérité en mémoire. Ce module reste
  volontairement générique : la future page Paramètres pourra le
  réutiliser tel quel pour d'autres réglages.
*/

import { openDatabase, STORES } from "./db.js";

/**
 * Lit une valeur de paramètre.
 * @param {string} key
 * @param {*} defaultValue - retourné si la clé n'existe pas encore.
 * @returns {Promise<*>}
 */
export async function getSetting(key, defaultValue) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORES.SETTINGS, "readonly")
      .objectStore(STORES.SETTINGS)
      .get(key);

    request.onsuccess = () =>
      resolve(request.result ? request.result.value : defaultValue);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Écrit une valeur de paramètre.
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
export async function setSetting(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SETTINGS, "readwrite");
    tx.objectStore(STORES.SETTINGS).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
