/*
  questionSelection.js
  Moteur PUR de sélection de la prochaine question : mode Strict et
  mode Libre (non strict).

  Aucun accès à IndexedDB ni au DOM ici — uniquement des fonctions
  synchrones qui reçoivent déjà les données nécessaires (questions
  disponibles, id déjà vus, id récemment vus) et renvoient une décision.
  L'orchestration (lecture/écriture de l'historique et des paramètres,
  gestion de `currentQuestionId`) vit dans questionEngine.js ; le rendu
  vit dans mainView.js.

  --------------------------------------------------------------------
  Strict et Libre ne se comportent PLUS de la même façon en cas
  d'épuisement (distinction volontairement explicite dans le code,
  pas un simple booléen partagé) :
  --------------------------------------------------------------------
  - Strict  : une question déjà vue ne peut jamais être reproposée.
              Si plus aucune candidate n'existe, on ne réinitialise
              JAMAIS l'historique automatiquement — c'est un état
              fonctionnel normal, signalé par
              `{ status: SELECTION_STATUS.STRICT_EXHAUSTED }`, à charge
              de l'appelant (l'interface, ou plus tard un reset manuel
              dans Paramètres) d'en tenir compte.
  - Libre   : seule la fenêtre récente (`recentIds`) est prise en
              compte. Si elle bloque toute sélection, on la réinitialise
              automatiquement et on sélectionne quand même une question
              — jamais traité comme une erreur ni comme un blocage.

  Conçu pour recevoir plus tard une liste déjà filtrée par tags : ce
  module ne sait rien de l'origine de `availableQuestions` (aujourd'hui
  la base complète, demain le résultat des filtres — voir cahier des
  charges §12).
*/

export const SELECTION_MODES = Object.freeze({
  STRICT: "strict",
  LIBRE: "libre",
});

/** Formes de résultat retournées par `selectNextQuestion`. */
export const SELECTION_STATUS = Object.freeze({
  SELECTED: "selected",
  STRICT_EXHAUSTED: "strict-exhausted",
});

/**
 * Levée uniquement quand `availableQuestions` est vide : aucune
 * question n'existe réellement (cas B). À distinguer de l'épuisement
 * Strict, qui ne lève jamais cette erreur et se résout via
 * `SELECTION_STATUS.STRICT_EXHAUSTED`.
 */
export class NoQuestionsAvailableError extends Error {
  constructor() {
    super("Aucune question disponible pour la sélection.");
    this.name = "NoQuestionsAvailableError";
  }
}

/**
 * Choisit un élément au hasard dans une liste de candidates, sans
 * modifier le tableau reçu. Sélection aléatoire simple et fiable
 * (Math.random), volontairement isolée du reste de la logique métier
 * et de tout rendu HTML (cahier des charges §10).
 * @param {Array} candidates
 * @returns {*}
 */
export function pickRandomCandidate(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("[questionSelection] pickRandomCandidate : liste vide.");
  }
  const randomIndex = Math.floor(Math.random() * candidates.length);
  return candidates[randomIndex];
}

/**
 * Sélectionne la prochaine question selon le mode courant.
 *
 * @param {Array<{id:number}>} availableQuestions - questions parmi
 *   lesquelles choisir (base complète aujourd'hui ; résultat des
 *   filtres dans une étape ultérieure).
 * @param {object} options
 * @param {"strict"|"libre"} options.mode
 * @param {Set<number>} options.seenIds - tous les id déjà vus (Strict).
 * @param {Set<number>} options.recentIds - id vus récemment (Libre).
 * @returns {
 *   { status: "selected", question: object, recentWasReset: boolean } |
 *   { status: "strict-exhausted" }
 * }
 * @throws {NoQuestionsAvailableError} si `availableQuestions` est vide
 *   (cas B — à ne jamais confondre avec l'épuisement Strict ci-dessus,
 *   qui n'est pas une erreur).
 */
export function selectNextQuestion(availableQuestions, options) {
  const { mode, seenIds, recentIds } = options;

  if (!Array.isArray(availableQuestions) || availableQuestions.length === 0) {
    throw new NoQuestionsAvailableError();
  }

  if (mode === SELECTION_MODES.LIBRE) {
    const recentSet =
      recentIds instanceof Set ? recentIds : new Set(recentIds ?? []);
    let candidates = availableQuestions.filter((q) => !recentSet.has(q.id));
    let recentWasReset = false;

    if (candidates.length === 0) {
      // Toutes les questions disponibles sont dans la fenêtre récente :
      // on la réinitialise et on sélectionne quand même une question,
      // jamais traité comme une erreur ni comme un blocage.
      candidates = availableQuestions;
      recentWasReset = true;
    }

    return {
      status: SELECTION_STATUS.SELECTED,
      question: pickRandomCandidate(candidates),
      recentWasReset,
    };
  }

  // Mode Strict : une question déjà vue ne peut jamais être reproposée.
  const seenSet = seenIds instanceof Set ? seenIds : new Set(seenIds ?? []);
  const candidates = availableQuestions.filter((q) => !seenSet.has(q.id));

  if (candidates.length === 0) {
    // Épuisement Strict : PAS de reset automatique (contrairement au
    // comportement précédent) — état fonctionnel normal, à charge de
    // l'appelant de le signaler et de proposer un reset manuel plus tard.
    return { status: SELECTION_STATUS.STRICT_EXHAUSTED };
  }

  return {
    status: SELECTION_STATUS.SELECTED,
    question: pickRandomCandidate(candidates),
    recentWasReset: false,
  };
}
