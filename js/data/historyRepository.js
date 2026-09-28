/*
  historyRepository.js
  Centralise les accès au store IndexedDB `history` (déjà créé par
  js/data/db.js, aucune modification de schéma nécessaire pour cette
  étape). Le reste de l'application ne doit jamais ouvrir de
  transaction sur ce store directement : tout passe par ce module.

  --------------------------------------------------------------------
  Modèle d'une entrée d'historique
  --------------------------------------------------------------------
    { id: <auto-incrémenté par IndexedDB>, questionId: number,
      viewedAt: number, mode: "strict"|"libre" }

  Volontairement minimal : on ne stocke ni le texte, ni les tags, ni
  l'auteur de la question — uniquement de quoi savoir QUELLE question a
  été vue, QUAND, et SOUS QUEL MODE. Le contenu complet reste dans
  questions.base.json / IndexedDB (questions locales), accessible via
  questionsRepository.js.

  --------------------------------------------------------------------
  Pourquoi un champ `mode` plutôt qu'un second store
  --------------------------------------------------------------------
  L'historique Strict (« déjà vue, tout court ») et le suivi de
  répétition récente du mode Libre doivent rester complètement
  indépendants : une question vue en Libre ne doit jamais compter comme
  « déjà vue » en Strict, et un reset d'épuisement Libre ne doit jamais
  effacer ce que Strict a vu. Plutôt que de créer un second store (non
  indispensable), chaque entrée porte simplement le mode sous lequel
  elle a été enregistrée ; toutes les fonctions ci-dessous filtrent
  explicitement par mode. Aucun index dédié n'est créé sur ce champ
  (volume de données trop faible pour le justifier) : `clearHistory`
  filtre via un curseur plutôt qu'un index.
*/

import { openDatabase, STORES } from "./db.js";

/**
 * Enregistre une question comme vue à l'instant présent, sous le mode
 * donné. Le mode fait partie intégrante de l'entrée : voir la note en
 * tête de fichier sur l'indépendance Strict/Libre.
 * @param {number} questionId
 * @param {"strict"|"libre"} mode
 * @returns {Promise<void>}
 */
export async function recordQuestionViewed(questionId, mode) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.HISTORY, "readwrite");
    tx.objectStore(STORES.HISTORY).add({
      questionId,
      viewedAt: Date.now(),
      mode,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retourne tout l'historique (tous modes confondus), trié du plus
 * récent au plus ancien.
 * @returns {Promise<Array<{id:number, questionId:number, viewedAt:number, mode:string}>>}
 */
export async function getHistory() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORES.HISTORY, "readonly")
      .objectStore(STORES.HISTORY)
      .getAll();

    request.onsuccess = () => {
      // `getAll()` renvoie les entrées dans l'ordre croissant de la clé
      // auto-incrémentée, donc dans l'ordre chronologique exact
      // d'insertion (le plus ancien en premier) — un ordre fiable même
      // si deux sélections tombent sur le même Date.now() (résolution
      // milliseconde). On ne trie volontairement PAS par `viewedAt` :
      // en cas d'égalité, un tri par valeur serait ambigu et pourrait
      // inverser l'ordre réel (bug détecté par les tests d'intégration,
      // voir README). On se contente d'inverser ce tableau pour obtenir
      // "le plus récent en premier".
      resolve([...request.result].reverse());
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Identifiants de TOUTES les questions déjà vues SOUS CE MODE, sans
 * limite de temps (utilisé par le mode Strict — une question vue
 * uniquement en Libre n'apparaît jamais dans ce résultat).
 * @param {"strict"|"libre"} mode
 * @returns {Promise<Set<number>>}
 */
export async function getAllSeenQuestionIds(mode) {
  const history = await getHistory();
  return new Set(
    history.filter((entry) => entry.mode === mode).map((entry) => entry.questionId)
  );
}

/**
 * Identifiants des `count` questions DISTINCTES vues le plus récemment
 * SOUS CE MODE (utilisé par le mode Libre — les entrées enregistrées
 * sous un autre mode sont ignorées, voir la note en tête de fichier).
 * Si l'historique de ce mode contient moins de `count` questions
 * distinctes, retourne simplement tout ce qui est disponible — ce
 * n'est jamais considéré comme une erreur (voir questionEngine.js,
 * section "petites collections").
 * @param {number} count
 * @param {"strict"|"libre"} mode
 * @returns {Promise<Set<number>>}
 */
export async function getRecentlyViewedQuestionIds(count, mode) {
  const history = await getHistory(); // déjà trié du plus récent au plus ancien
  const recentIds = new Set();

  for (const entry of history) {
    if (entry.mode !== mode) continue;
    if (recentIds.size >= count) break;
    recentIds.add(entry.questionId);
  }

  return recentIds;
}

/**
 * Indique si une question a déjà été vue au moins une fois SOUS CE MODE.
 * @param {number} questionId
 * @param {"strict"|"libre"} mode
 * @returns {Promise<boolean>}
 */
export async function hasBeenViewed(questionId, mode) {
  const seenIds = await getAllSeenQuestionIds(mode);
  return seenIds.has(questionId);
}

/**
 * Vide l'historique d'UN SEUL mode. Appelé par questionEngine.js quand
 * la fenêtre récente du mode Libre est épuisée, afin de ne jamais
 * bloquer la sélection suivante — les entrées de l'autre mode ne sont
 * jamais touchées (voir la note en tête de fichier ; c'est le point
 * central de cette correction : un reset Libre ne doit jamais effacer
 * l'historique Strict, et réciproquement).
 *
 * Aucun index n'existe sur `mode` (non indispensable vu le volume) :
 * on filtre via un curseur plutôt que de modifier le schéma IndexedDB.
 * @param {"strict"|"libre"} mode
 * @returns {Promise<void>}
 */
export async function clearHistory(mode) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.HISTORY, "readwrite");
    const store = tx.objectStore(STORES.HISTORY);
    const cursorRequest = store.openCursor();

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return; // fin du parcours
      if (cursor.value.mode === mode) {
        cursor.delete();
      }
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}