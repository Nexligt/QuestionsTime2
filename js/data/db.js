/*
  db.js
  Point d'accès unique à IndexedDB. Aucune logique métier ici :
  seulement l'ouverture de la base et la définition des object stores.
  Les futures étapes (historique, filtres, paramètres, suppressions...)
  viendront lire/écrire dans ces stores via des modules dédiés
  (ex. js/data/questionsRepository.js), pas directement ici.

  --------------------------------------------------------------------
  Choix d'identifiants (voir aussi README.md, section "Identifiants")
  --------------------------------------------------------------------
  Le modèle de donnée reste celui du cahier des charges :
    { id, texte, tags, author }

  - Questions de base   -> id numérique positif, fourni par
                            data/questions.base.json (ex. 1, 2, 3...).
  - Questions créées par
    l'utilisateur        -> id numérique NÉGATIF et SÉQUENTIEL :
                            -1, -2, -3... (plus petit id local déjà
                            attribué, moins 1). Un numéro n'est JAMAIS
                            réutilisé, même après suppression (voir
                            `nextLocalQuestionId` et
                            questionsRepository.createLocalQuestion).

  Pourquoi ce choix :
  - Aucune collision possible avec les id positifs du fichier de base
    (les deux espaces sont disjoints par construction, sans registre
    à maintenir).
  - Reste un simple "number", donc pleinement compatible avec
    IndexedDB comme keyPath, y compris pour le tri et les curseurs.
  - Numéros courts et lisibles, affichés "B-1" / "L-1" (voir
    features/questions/questionId.js) sans jamais stocker ce libellé.
*/

const DB_NAME = "questionstime2";
// v1 -> v2 : ajout de l'object store FILTERS. Toute nouvelle évolution du
// schéma (nouvel object store, changement de keyPath...) doit incrémenter
// cette valeur pour que `onupgradeneeded` s'exécute à nouveau.
// v2 -> v3 : remise à zéro UNIQUE des questions locales créées avant le
// passage aux id séquentiels (-1, -2, -3...). Voir `onupgradeneeded`.
const DB_VERSION = 3;

/** Repère du plus petit id local attribué (voir questionsRepository.js). */
const LOWEST_LOCAL_QUESTION_ID_KEY = "lowestLocalQuestionId";

/** Noms des object stores. Centralisés ici pour éviter les fautes de frappe. */
export const STORES = {
  QUESTIONS_USER: "questionsUser", // questions créées localement
  QUESTIONS_EDITS: "questionsEdits", // modifications de questions de base
  QUESTIONS_DELETED: "questionsDeleted", // id des questions supprimées (base ou user)
  HISTORY: "history",
  SETTINGS: "settings",
  FILTERS: "filters", // préférences de filtrage (par tag, etc.), même forme que SETTINGS
};

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/**
 * Ouvre (ou crée) la base IndexedDB et retourne une connexion partagée.
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion ?? 0;

      if (!db.objectStoreNames.contains(STORES.QUESTIONS_USER)) {
        db.createObjectStore(STORES.QUESTIONS_USER, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.QUESTIONS_EDITS)) {
        db.createObjectStore(STORES.QUESTIONS_EDITS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.QUESTIONS_DELETED)) {
        db.createObjectStore(STORES.QUESTIONS_DELETED, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.HISTORY)) {
        db.createObjectStore(STORES.HISTORY, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.FILTERS)) {
        db.createObjectStore(STORES.FILTERS, { keyPath: "key" });
      }

      // Migration v3 (une seule fois, bases existantes uniquement) :
      // suppression de toutes les questions locales (`questionsUser`)
      // pour repartir proprement avec les id -1, -2, -3... Le repère
      // technique du plus petit id local est retiré avec elles, sinon la
      // numérotation reprendrait après les anciens id (-Date.now()).
      // Aucun autre store ni réglage n'est touché (questions de base,
      // filtres, historique, paramètres, questions supprimées). Les
      // futures questions locales ne sont jamais supprimées automatiquement.
      if (oldVersion >= 1 && oldVersion < 3) {
        const tx = request.transaction;
        tx.objectStore(STORES.QUESTIONS_USER).clear();
        tx.objectStore(STORES.SETTINGS).delete(LOWEST_LOCAL_QUESTION_ID_KEY);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

/**
 * Prochain identifiant local : plus petit id local déjà attribué moins 1
 * (-1 s'il n'y en a aucun). Fonction pure : l'appelant lui fournit TOUS
 * les id locaux déjà attribués, y compris ceux de questions supprimées,
 * pour qu'un numéro ne soit jamais libéré.
 * @param {Iterable<number>} usedIds - id déjà attribués (les id >= 0 sont ignorés).
 * @returns {number}
 */
export function nextLocalQuestionId(usedIds) {
  let minId = 0;
  for (const id of usedIds) {
    if (typeof id === "number" && Number.isFinite(id) && id < minId) minId = id;
  }
  return minId - 1;
}
