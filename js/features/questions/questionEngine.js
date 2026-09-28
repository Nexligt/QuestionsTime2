/*
  questionEngine.js
  Orchestration entre le moteur pur (questionSelection.js) et les
  repositories (historyRepository.js, settingsRepository.js).

  mainView.js n'appelle jamais IndexedDB, ni le détail du mode
  Strict/Libre, ni de l'historique, ni de `currentQuestionId` :

    Main View
       ↓
    questionEngine.js  (ce fichier — logique métier)
       ↓
    historyRepository.js + settingsRepository.js
       ↓
    IndexedDB

  --------------------------------------------------------------------
  Question courante (currentQuestionId)
  --------------------------------------------------------------------
  Un simple remontage de Main (F5, retour via "Accueil", navigation
  entre vues) ne doit JAMAIS changer la question affichée ni créer une
  nouvelle entrée d'historique — seule une action explicite ("Suivante",
  plus tard le swipe) le doit. On persiste donc l'id de la question
  actuellement affichée dans le store `settings` déjà existant, sous la
  clé `currentQuestionId` (juste l'id, jamais le contenu complet de la
  question) — pas de nouveau store, pas de deuxième source de vérité.

  Deux points d'entrée distincts, jamais interchangeables :
  - `getCurrentQuestion(availableQuestions)` — à appeler au montage de
    Main. Cas A : `currentQuestionId` correspond à une question
    disponible -> on la réaffiche telle quelle (aucun appel au moteur,
    aucune écriture). Cas B/C : pas de `currentQuestionId` valide
    (première ouverture, ou question devenue indisponible) -> une
    vraie nouvelle sélection est effectuée.
  - `advanceToNextQuestion(availableQuestions)` — à appeler uniquement
    depuis une action explicite de l'utilisateur : déclenche toujours
    une nouvelle sélection.

  --------------------------------------------------------------------
  Historique Strict vs suivi récent Libre : deux univers disjoints
  --------------------------------------------------------------------
  Chaque entrée d'historique (historyRepository.js) porte désormais le
  mode sous lequel elle a été enregistrée. Une sélection faite en Libre
  n'écrit jamais dans l'historique consulté par Strict, et
  inversement : passer de Libre à Strict ne fait donc jamais apparaître
  comme "déjà vue" une question qui n'a été vue qu'en Libre. Le reset
  automatique de la fenêtre récente Libre (§9 du cahier des charges)
  n'efface donc, lui aussi, que les entrées Libre.
*/

import {
  selectNextQuestion,
  SELECTION_MODES,
  SELECTION_STATUS,
  NoQuestionsAvailableError,
} from "./questionSelection.js";
import {
  getAllSeenQuestionIds,
  getRecentlyViewedQuestionIds,
  recordQuestionViewed,
  clearHistory,
} from "../../data/historyRepository.js";
import { getSetting, setSetting } from "../../data/settingsRepository.js";

export const SELECTION_MODE_KEY = "selectionMode";
export const RECENT_QUESTION_COUNT_KEY = "recentQuestionCount";
export const CURRENT_QUESTION_ID_KEY = "currentQuestionId";

// Valeurs par défaut documentées (cahier des charges : mode Strict
// activé par défaut). La future page Paramètres lira/écrira ces mêmes
// clés via settingsRepository.js — aucune deuxième source de vérité.
export const DEFAULT_SELECTION_MODE = SELECTION_MODES.STRICT;
export const DEFAULT_RECENT_QUESTION_COUNT = 3;

function isValidRecentQuestionCount(count) {
  return Number.isInteger(count) && count >= 1;
}

/**
 * Convertit une saisie utilisateur en intervalle valide (entier >= 1).
 * @param {string|number} value
 * @returns {number|null} null si la saisie est vide ou invalide.
 */
export function parseRecentQuestionCount(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const count = Number(text);
  return isValidRecentQuestionCount(count) && Number.isSafeInteger(count) ? count : null;
}

/**
 * Intervalle de répétition du mode Libre : nombre de questions
 * différentes vues récemment qui sont exclues de la sélection
 * (`settings.recentQuestionCount`, 3 par défaut). Valeur invalide -> défaut.
 * @returns {Promise<number>}
 */
export async function getRecentQuestionCount() {
  const count = await getSetting(RECENT_QUESTION_COUNT_KEY, DEFAULT_RECENT_QUESTION_COUNT);
  return isValidRecentQuestionCount(count) ? count : DEFAULT_RECENT_QUESTION_COUNT;
}

/**
 * Enregistre l'intervalle de répétition Libre. Ne touche ni à
 * `currentQuestionId` ni aux historiques : la valeur est simplement
 * relue au prochain "Suivante" / swipe.
 * @param {number} count - entier >= 1.
 * @returns {Promise<number>}
 */
export async function setRecentQuestionCount(count) {
  if (!isValidRecentQuestionCount(count)) {
    throw new Error(`[questionEngine] Intervalle de répétition invalide : "${count}"`);
  }
  await setSetting(RECENT_QUESTION_COUNT_KEY, count);
  return count;
}

/**
 * Mode de sélection courant, pour l'indicateur affiché sur Main.
 * Relu à chaque appel (pas de cache) : reflète immédiatement un
 * changement fait via le helper de debug ou, plus tard, Paramètres.
 * @returns {Promise<"strict"|"libre">}
 */
export function getCurrentSelectionMode() {
  return getSetting(SELECTION_MODE_KEY, DEFAULT_SELECTION_MODE);
}

/**
 * Enregistre le mode de sélection dans `settings.selectionMode` (unique
 * source de vérité, réutilisable telle quelle par la future page
 * Paramètres). Ne touche ni à `currentQuestionId` ni à l'historique : la
 * question affichée ne change pas, le prochain "Suivante" utilisera le
 * nouveau mode (relu à chaque sélection).
 * @param {"strict"|"libre"} mode
 * @returns {Promise<"strict"|"libre">}
 */
export async function setSelectionMode(mode) {
  if (mode !== SELECTION_MODES.STRICT && mode !== SELECTION_MODES.LIBRE) {
    throw new Error(`[questionEngine] Mode de sélection inconnu : "${mode}"`);
  }
  await setSetting(SELECTION_MODE_KEY, mode);
  return mode;
}

/**
 * Réinitialise UNIQUEMENT l'historique Strict (action manuelle de la page
 * Paramètres), via `historyRepository.clearHistory(mode)` déjà existant.
 * L'historique Libre, `currentQuestionId` et `selectionMode` ne sont pas
 * touchés : la question affichée ne change pas, et la prochaine sélection
 * Strict peut de nouveau proposer toutes les questions compatibles.
 * @returns {Promise<void>}
 */
export function resetStrictHistory() {
  return clearHistory(SELECTION_MODES.STRICT);
}

/**
 * Bascule Strict <-> Libre à partir de la valeur enregistrée.
 * @returns {Promise<"strict"|"libre">} le nouveau mode.
 */
export async function toggleSelectionMode() {
  const current = await getCurrentSelectionMode();
  return setSelectionMode(
    current === SELECTION_MODES.LIBRE ? SELECTION_MODES.STRICT : SELECTION_MODES.LIBRE
  );
}

/**
 * Effectue une VRAIE nouvelle sélection via le moteur pur, applique
 * les effets de bord nécessaires, puis retourne le résultat :
 * - Libre, fenêtre récente épuisée -> vide l'historique (cahier des
 *   charges §9, comportement inchangé depuis l'étape précédente) ;
 * - Strict, épuisé -> ne touche à rien, retourne l'état
 *   SELECTION_STATUS.STRICT_EXHAUSTED tel quel (§6/§8) ;
 * - sinon -> enregistre la vue et met à jour `currentQuestionId`.
 * Jamais appelée pour un simple remontage de Main (voir
 * getCurrentQuestion, cas A).
 * @param {Array<{id:number}>} availableQuestions
 * @returns {Promise<{status:string, question?:object}>}
 */
/*
  Sérialisation des sélections : getCurrentQuestion et advanceToNextQuestion
  passent par une file unique. Deux affichages de Main quasi simultanés
  (ex. Main rendu sous le Splash puis « Accueil » aussitôt, au tout premier
  lancement) ne peuvent donc plus choisir chacun une question : le second
  attend la fin de la sélection en cours, relit `currentQuestionId` et
  réaffiche la MÊME question (cas A) — une seule entrée d'historique, et
  aucune question marquée vue sans être affichée.
*/
let selectionQueue = Promise.resolve();

/** Exécute `task` après toutes les sélections en cours (une à la fois). */
function runExclusive(task) {
  const run = selectionQueue.then(task, task);
  selectionQueue = run.catch(() => {}); // une erreur ne bloque pas la file
  return run;
}

async function performSelectionAndPersist(availableQuestions) {
  const [mode, recentQuestionCount] = await Promise.all([
    getSetting(SELECTION_MODE_KEY, DEFAULT_SELECTION_MODE),
    getRecentQuestionCount(),
  ]);

  // L'historique Strict et le suivi récent Libre sont deux univers
  // disjoints (voir historyRepository.js) : on ne lit que celui du mode
  // courant, jamais les deux, et jamais l'un à la place de l'autre.
  const seenIds =
    mode === SELECTION_MODES.STRICT
      ? await getAllSeenQuestionIds(SELECTION_MODES.STRICT)
      : new Set(); // non utilisé par le moteur pur en mode Libre

  const recentIds =
    mode === SELECTION_MODES.LIBRE
      ? await getRecentlyViewedQuestionIds(recentQuestionCount, SELECTION_MODES.LIBRE)
      : new Set(); // non utilisé par le moteur pur en mode Strict

  const result = selectNextQuestion(availableQuestions, {
    mode,
    seenIds,
    recentIds,
  });

  if (result.status === SELECTION_STATUS.STRICT_EXHAUSTED) {
    // §6/§8 : jamais de reset automatique en Strict, jamais d'écriture
    // d'historique ni de currentQuestionId dans ce cas.
    return { status: SELECTION_STATUS.STRICT_EXHAUSTED };
  }

  if (result.recentWasReset) {
    // §9 : reset automatique, mais UNIQUEMENT l'historique Libre — ne
    // touche jamais à l'historique Strict, même si l'utilisateur y est
    // repassé entre-temps (voir historyRepository.js).
    await clearHistory(SELECTION_MODES.LIBRE);
  }

  // La question choisie n'est enregistrée QUE dans l'historique du mode
  // courant : une sélection faite en Libre n'écrit jamais dans
  // l'historique Strict, et réciproquement.
  await recordQuestionViewed(result.question.id, mode);
  await setSetting(CURRENT_QUESTION_ID_KEY, result.question.id);

  return { status: SELECTION_STATUS.SELECTED, question: result.question };
}

/**
 * À appeler au montage de Main (jamais depuis un clic "Suivante").
 * Cas A : `currentQuestionId` correspond à une question disponible ->
 *         réaffichée telle quelle, sans appel au moteur.
 * Cas B : pas de `currentQuestionId` -> première vraie sélection.
 * Cas C : `currentQuestionId` ne correspond plus à rien de disponible
 *         (filtres/suppression à venir) -> traité comme le cas B.
 * @param {Array<{id:number}>} availableQuestions
 * @returns {Promise<{status:string, question?:object}>}
 * @throws {NoQuestionsAvailableError} si `availableQuestions` est vide.
 */
export async function getCurrentQuestion(availableQuestions) {
  if (!Array.isArray(availableQuestions) || availableQuestions.length === 0) {
    throw new NoQuestionsAvailableError();
  }
  return runExclusive(() => resolveCurrentQuestion(availableQuestions));
}

async function resolveCurrentQuestion(availableQuestions) {
  // Lu APRÈS toute sélection en cours (file) : voit la question qu'elle a choisie.
  const currentId = await getSetting(CURRENT_QUESTION_ID_KEY, null);

  if (currentId != null) {
    const current = availableQuestions.find((q) => q.id === currentId);
    if (current) {
      return { status: SELECTION_STATUS.SELECTED, question: current };
    }
    // Cas C : on retombe sur le cas B ci-dessous.
  }

  return performSelectionAndPersist(availableQuestions);
}

/**
 * À appeler uniquement depuis une action explicite de l'utilisateur
 * (bouton "Suivante", plus tard le swipe) : déclenche toujours une
 * nouvelle sélection, jamais depuis un simple remontage de Main.
 * @param {Array<{id:number}>} availableQuestions
 * @returns {Promise<{status:string, question?:object}>}
 * @throws {NoQuestionsAvailableError} si `availableQuestions` est vide.
 */
export async function advanceToNextQuestion(availableQuestions) {
  if (!Array.isArray(availableQuestions) || availableQuestions.length === 0) {
    throw new NoQuestionsAvailableError();
  }

  return runExclusive(() => performSelectionAndPersist(availableQuestions));
}