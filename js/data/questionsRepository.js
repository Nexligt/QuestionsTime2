/*
  questionsRepository.js
  Intermédiaire unique entre les fonctionnalités de l'application et
  les données de questions. Le reste de l'app ne doit jamais importer
  questionsBaseLoader.js ni ouvrir de transaction IndexedDB directement
  pour les questions : tout passe par ce module.

  Accès en lecture par source (base JSON, questions locales, éditions
  locales, suppressions locales), liste jouable base + questions locales
  (`getAvailableQuestions`), création (`createLocalQuestion`) et
  modification (`updateLocalQuestion`) d'une question locale.
  Éditions des questions de base / suppressions : étapes ultérieures.
*/

import { loadBaseQuestions } from "./questionsBaseLoader.js";
import { openDatabase, STORES, nextLocalQuestionId } from "./db.js";

/** Cache mémoire du tableau de questions de base (une seule source de vérité). */
let baseQuestionsPromise = null;

/**
 * Questions de base (data/questions.base.json), chargées une seule fois
 * puis réutilisées depuis le cache mémoire.
 * @returns {Promise<Array>}
 */
export function getBaseQuestions() {
  if (!baseQuestionsPromise) {
    baseQuestionsPromise = loadBaseQuestions();
  }
  return baseQuestionsPromise;
}

/**
 * Questions créées localement par l'utilisateur (IndexedDB).
 * @returns {Promise<Array>}
 */
export async function getLocalQuestions() {
  // Uniquement les questions CRÉÉES localement (id négatifs) : les
  // overrides de questions de base (id positifs) ne sont pas des
  // questions supplémentaires (voir getBaseQuestionOverrides).
  return (await getAllFromStore(STORES.QUESTIONS_USER)).filter((q) => q.id < 0);
}

/**
 * Overrides locaux de questions de base : enregistrements de
 * `questionsUser` portant l'id POSITIF de la question de base qu'ils
 * remplacent. Même structure { id, texte, tags, author } (pas de `source` :
 * c'est l'id positif qui identifie un override). data/questions.base.json
 * n'est jamais modifié.
 * @returns {Promise<Array<{id:number, texte:string, tags:string[], author:string}>>}
 */
export async function getBaseQuestionOverrides() {
  return (await getAllFromStore(STORES.QUESTIONS_USER)).filter((q) => q.id > 0);
}

/**
 * Modifications locales appliquées à des questions de base (IndexedDB).
 * @returns {Promise<Array>}
 */
export function getLocalEdits() {
  return getAllFromStore(STORES.QUESTIONS_EDITS);
}

/**
 * Entrées marquant des questions supprimées/masquées localement,
 * qu'elles proviennent de la base ou d'une création locale (IndexedDB).
 * @returns {Promise<Array>}
 */
export function getDeletedQuestionEntries() {
  return getAllFromStore(STORES.QUESTIONS_DELETED);
}

/**
 * Questions jouables : questions de base + questions créées localement.
 * Utilisé par Main (sélection) et Filtres (liste des tags), afin qu'une
 * question créée soit disponible immédiatement.
 *
 * Remarque : les éditions et suppressions locales ne sont pas encore
 * appliquées ici (étapes ultérieures : modification / suppression).
 * @returns {Promise<Array<{id:number, texte:string, tags:string[], author:string}>>}
 */
export async function getAvailableQuestions() {
  const [base, stored, deletedEntries] = await Promise.all([
    getBaseQuestions(),
    getAllFromStore(STORES.QUESTIONS_USER),
    getDeletedQuestionEntries(),
  ]);
  const overrides = new Map(stored.filter((q) => q.id > 0).map((q) => [q.id, q]));
  const deletedIds = new Set(deletedEntries.map((entry) => entry.id));
  const local = stored.filter((q) => q.id < 0);
  // Une seule entrée par id : l'override remplace la question de base à
  // la même position ; la base elle-même (cache mémoire) n'est jamais
  // modifiée. Une question de base supprimée (id dans `questionsDeleted`)
  // est exclue, override compris : jamais d'original affiché à sa place.
  return [
    ...base.filter((q) => !deletedIds.has(q.id)).map((q) => overrides.get(q.id) ?? q),
    ...local,
  ];
}

/**
 * Question telle qu'affichée dans l'application : override s'il existe,
 * sinon question de base (id positif) ; question locale (id négatif).
 * @param {number} id
 * @returns {Promise<{id:number, texte:string, tags:string[], author:string}|null>}
 */
export async function getQuestionById(id) {
  if (typeof id !== "number" || id === 0 || !Number.isFinite(id)) return null;
  return (await getAvailableQuestions()).find((q) => q.id === id) ?? null;
}

/**
 * Enregistre (ou remplace) l'override local d'une question de base dans
 * `questionsUser`, avec le MÊME id positif : un seul enregistrement par
 * question de base, jamais d'id négatif créé, questions.base.json intact.
 * @param {number} id - id d'une question de base existante.
 * @param {{texte:string, tags:string[], author:string}} changes
 * @returns {Promise<{id:number, texte:string, tags:string[], author:string}>}
 */
export async function saveBaseQuestionOverride(id, { texte, tags, author }) {
  const base = await getBaseQuestions();
  if (typeof id !== "number" || !(id > 0) || !base.some((q) => q.id === id)) {
    throw new Error(`[questionsRepository] Question de base introuvable (id ${id}).`);
  }
  const db = await openDatabase();
  const override = { id, texte, tags: [...tags], author };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUESTIONS_USER, "readwrite");
    tx.objectStore(STORES.QUESTIONS_USER).put(override); // remplace l'override éventuel
    tx.oncomplete = () => resolve(override);
    tx.onerror = () =>
      reject(
        new Error(
          `[questionsRepository] Impossible d'enregistrer la modification : ${tx.error?.message ?? tx.error}`
        )
      );
  });
}

/**
 * Clé du store `settings` mémorisant le plus petit id local déjà attribué
 * (repère interne, pas un champ de question). Garantit qu'un numéro n'est
 * jamais réutilisé, même si la question la plus récente est supprimée
 * physiquement plus tard.
 */
export const LOWEST_LOCAL_QUESTION_ID_KEY = "lowestLocalQuestionId"; // même clé que db.js (migration v3)

/**
 * Enregistre une question créée localement dans le store `questionsUser`
 * (aucun nouveau store). L'id est NÉGATIF et SÉQUENTIEL : -1, -2, -3...
 * = plus petit id local déjà attribué - 1, calculé dans UNE transaction à
 * partir de :
 *   - les id des questions locales existantes (`questionsUser`) ;
 *   - les id locaux marqués supprimés (`questionsDeleted`) ;
 *   - le repère `settings.lowestLocalQuestionId`.
 * Une suppression ne libère donc jamais son numéro
 * (ex. -1, -2, -3, suppression de -2 -> prochaine question = -4).
 * Structure stockée exactement : { id, texte, tags, author } — pas de `source`.
 * La validation des champs est faite en amont (features/questions/localQuestion.js).
 * @param {{texte:string, tags:string[], author:string}} input
 * @returns {Promise<{id:number, texte:string, tags:string[], author:string}>}
 */
export async function createLocalQuestion({ texte, tags, author }) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORES.QUESTIONS_USER, STORES.QUESTIONS_DELETED, STORES.SETTINGS],
      "readwrite"
    );
    const userStore = tx.objectStore(STORES.QUESTIONS_USER);
    const deletedStore = tx.objectStore(STORES.QUESTIONS_DELETED);
    const settingsStore = tx.objectStore(STORES.SETTINGS);
    const usedIds = [];
    let pending = 3;
    let question = null;

    function collect(request, extract) {
      request.onsuccess = () => {
        usedIds.push(...extract(request.result));
        pending -= 1;
        if (pending === 0) {
          const id = nextLocalQuestionId(usedIds);
          question = { id, texte, tags: [...tags], author };
          userStore.add(question);
          settingsStore.put({ key: LOWEST_LOCAL_QUESTION_ID_KEY, value: id });
        }
      };
    }

    collect(userStore.getAllKeys(), (keys) => keys);
    collect(deletedStore.getAllKeys(), (keys) => keys);
    collect(settingsStore.get(LOWEST_LOCAL_QUESTION_ID_KEY), (entry) =>
      entry && typeof entry.value === "number" ? [entry.value] : []
    );

    tx.oncomplete = () => resolve(question);
    tx.onerror = () =>
      reject(
        new Error(
          `[questionsRepository] Impossible d'enregistrer la question : ${tx.error?.message ?? tx.error}`
        )
      );
  });
}

/**
 * Lit tous les enregistrements d'un object store IndexedDB.
 * Fonction bas niveau interne : le reste de l'application ne doit pas
 * l'utiliser directement, seules les fonctions exportées ci-dessus le font.
 * @param {string} storeName
 * @returns {Promise<Array>}
 */
async function getAllFromStore(storeName) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          `[questionsRepository] Erreur de lecture sur le store "${storeName}" : ${request.error?.message ?? request.error}`
        )
      );
  });
}

/**
 * Une question locale par son id (null si absente ou si l'id n'est pas local).
 * @param {number} id
 * @returns {Promise<{id:number, texte:string, tags:string[], author:string}|null>}
 */
export async function getLocalQuestion(id) {
  if (typeof id !== "number" || !(id < 0)) return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORES.QUESTIONS_USER, "readonly")
      .objectStore(STORES.QUESTIONS_USER)
      .get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remplace le contenu d'une question locale EXISTANTE dans `questionsUser`.
 * L'id ne change jamais ; aucune question n'est créée si l'id est inconnu
 * (erreur), et les questions de base (id positifs) sont refusées.
 * Structure stockée exactement : { id, texte, tags, author }.
 * La validation des champs est faite en amont (features/questions/localQuestion.js).
 * @param {number} id
 * @param {{texte:string, tags:string[], author:string}} changes
 * @returns {Promise<{id:number, texte:string, tags:string[], author:string}>}
 */
export async function updateLocalQuestion(id, { texte, tags, author }) {
  if (typeof id !== "number" || !(id < 0)) {
    throw new Error(`[questionsRepository] Seules les questions locales sont modifiables (id ${id}).`);
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUESTIONS_USER, "readwrite");
    const store = tx.objectStore(STORES.QUESTIONS_USER);
    let updated = null;
    let missing = false;

    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) {
        missing = true;
        return;
      }
      updated = { id, texte, tags: [...tags], author };
      store.put(updated);
    };

    tx.oncomplete = () =>
      missing
        ? reject(new Error(`[questionsRepository] Question locale introuvable (id ${id}).`))
        : resolve(updated);
    tx.onerror = () =>
      reject(
        new Error(
          `[questionsRepository] Impossible de modifier la question : ${tx.error?.message ?? tx.error}`
        )
      );
  });
}

/**
 * Supprime une question.
 * - Locale (id < 0) : suppression DÉFINITIVE de son enregistrement dans
 *   `questionsUser`. Son numéro n'est jamais réutilisé : le repère
 *   `settings.lowestLocalQuestionId` (voir createLocalQuestion) est
 *   conservé, et abaissé si nécessaire, dans la même transaction.
 * - De base (id > 0) : son id est ajouté à `questionsDeleted` (mécanisme
 *   existant) ; questions.base.json n'est jamais modifié et un éventuel
 *   override est CONSERVÉ tel quel dans `questionsUser` (il réapparaîtra
 *   à la restauration). La question reste invisible tant qu'elle est
 *   supprimée (voir getAvailableQuestions).
 * L'historique n'est jamais modifié.
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteQuestion(id) {
  if (typeof id !== "number" || !Number.isFinite(id) || id === 0) {
    throw new Error(`[questionsRepository] Id de question invalide : ${id}`);
  }
  if (id > 0) {
    const base = await getBaseQuestions();
    if (!base.some((q) => q.id === id)) {
      throw new Error(`[questionsRepository] Question de base introuvable (id ${id}).`);
    }
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const storeNames =
      id < 0 ? [STORES.QUESTIONS_USER, STORES.SETTINGS] : [STORES.QUESTIONS_DELETED];
    const tx = db.transaction(storeNames, "readwrite");

    if (id < 0) {
      tx.objectStore(STORES.QUESTIONS_USER).delete(id);
      const settings = tx.objectStore(STORES.SETTINGS);
      const markerRequest = settings.get(LOWEST_LOCAL_QUESTION_ID_KEY);
      markerRequest.onsuccess = () => {
        const marker = markerRequest.result?.value;
        if (typeof marker !== "number" || id < marker) {
          settings.put({ key: LOWEST_LOCAL_QUESTION_ID_KEY, value: id });
        }
      };
    } else {
      tx.objectStore(STORES.QUESTIONS_DELETED).put({ id });
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new Error(
          `[questionsRepository] Impossible de supprimer la question : ${tx.error?.message ?? tx.error}`
        )
      );
  });
}

/**
 * Questions de BASE supprimées, telles qu'elles réapparaîtraient après
 * restauration (override conservé s'il existe), dans l'ordre du fichier
 * de base. Les questions locales supprimées n'y figurent jamais
 * (suppression définitive).
 * @returns {Promise<Array<{id:number, texte:string, tags:string[], author:string}>>}
 */
export async function getDeletedBaseQuestions() {
  const [base, overrides, deletedEntries] = await Promise.all([
    getBaseQuestions(),
    getBaseQuestionOverrides(),
    getDeletedQuestionEntries(),
  ]);
  const deletedIds = new Set(deletedEntries.map((entry) => entry.id));
  const overrideById = new Map(overrides.map((q) => [q.id, q]));
  return base.filter((q) => deletedIds.has(q.id)).map((q) => overrideById.get(q.id) ?? q);
}

/**
 * Restaure une question de base supprimée : retire son id de
 * `questionsDeleted`. Son override éventuel n'est pas touché : la question
 * réapparaît donc avec sa version modifiée si elle en possède une.
 * @param {number} id - id positif.
 * @returns {Promise<void>}
 */
export async function restoreBaseQuestion(id) {
  if (typeof id !== "number" || !(id > 0)) {
    throw new Error(`[questionsRepository] Seules les questions de base sont restaurables (id ${id}).`);
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUESTIONS_DELETED, "readwrite");
    tx.objectStore(STORES.QUESTIONS_DELETED).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        new Error(
          `[questionsRepository] Impossible de restaurer la question : ${tx.error?.message ?? tx.error}`
        )
      );
  });
}

/**
 * Compteurs calculés à partir des données réelles (Paramètres > Informations) :
 * - baseAvailable : questions de base visibles (non supprimées ; une
 *   question de base modifiée compte toujours comme une question de base) ;
 * - local : questions créées localement (id négatifs) ;
 * - deleted : questions de base supprimées (restaurables). Les questions
 *   locales supprimées ne sont pas comptées : leur suppression est définitive.
 * @returns {Promise<{baseAvailable:number, local:number, deleted:number}>}
 */
export async function getQuestionCounts() {
  const [available, deleted] = await Promise.all([
    getAvailableQuestions(),
    getDeletedBaseQuestions(),
  ]);
  return {
    baseAvailable: available.filter((q) => q.id > 0).length,
    local: available.filter((q) => q.id < 0).length,
    deleted: deleted.length,
  };
}
