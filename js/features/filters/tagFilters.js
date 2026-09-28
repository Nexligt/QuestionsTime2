/*
  tagFilters.js
  Logique PURE des filtres par tag (aucun accès IndexedDB ni DOM).

  Chaque tag est dans l'un de ces trois états :
  - "required" (obligatoire) : la question DOIT posséder ce tag ;
  - "neutral"  (neutre)      : aucune contrainte ;
  - "excluded" (exclu)       : la question NE DOIT PAS posséder ce tag.

  Plusieurs tags obligatoires sont cumulés en ET ; tous les tags exclus
  sont interdits. Seuls les états non neutres sont stockés
  (`{ [tag]: "required" | "excluded" }`) : un tag absent de l'objet est
  neutre.

  Les filtres sont appliqués AVANT le moteur Strict/Libre : mainView.js
  passe `applyTagFilters(questions, states)` à questionEngine.js, qui ne
  sait rien des filtres (aucune seconde logique de sélection).
*/

import { normalizeSearchText } from "../../core/textSearch.js";

export const TAG_FILTER_STATES = Object.freeze({
  REQUIRED: "required",
  NEUTRAL: "neutral",
  EXCLUDED: "excluded",
});

/** Ordre du cycle au toucher : neutre -> obligatoire -> exclu -> neutre. */
const TAG_STATE_CYCLE = [
  TAG_FILTER_STATES.NEUTRAL,
  TAG_FILTER_STATES.REQUIRED,
  TAG_FILTER_STATES.EXCLUDED,
];

/**
 * État suivant dans le cycle.
 * @param {string} state
 * @returns {string}
 */
export function getNextTagState(state) {
  const index = TAG_STATE_CYCLE.indexOf(state);
  return TAG_STATE_CYCLE[(index + 1) % TAG_STATE_CYCLE.length];
}

/**
 * État d'un tag dans un objet d'états (neutre s'il n'y figure pas).
 * @param {Record<string,string>} states
 * @param {string} tag
 */
export function getTagState(states, tag) {
  const state = states?.[tag];
  return state === TAG_FILTER_STATES.REQUIRED || state === TAG_FILTER_STATES.EXCLUDED
    ? state
    : TAG_FILTER_STATES.NEUTRAL;
}

/**
 * Retourne un NOUVEL objet d'états où `tag` prend `state` (un tag neutre
 * est retiré de l'objet). Ne modifie jamais l'objet reçu.
 * @param {Record<string,string>} states
 * @param {string} tag
 * @param {string} state
 * @returns {Record<string,string>}
 */
export function withTagState(states, tag, state) {
  const next = { ...(states ?? {}) };
  if (state === TAG_FILTER_STATES.NEUTRAL) {
    delete next[tag];
  } else {
    next[tag] = state;
  }
  return next;
}

/**
 * Liste des tags distincts présents dans les questions, triée
 * alphabétiquement (français). Récupérée dynamiquement : aucune liste
 * de tags codée en dur.
 * @param {Array<{tags:string[]}>} questions
 * @returns {string[]}
 */
export function extractTags(questions) {
  const tags = new Set();
  for (const question of questions ?? []) {
    for (const tag of question?.tags ?? []) {
      if (typeof tag === "string" && tag.trim() !== "") tags.add(tag);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

/** Minuscules, sans accents ni espaces, pour une recherche tolérante. */
function normalizeForSearch(value) {
  // Normalisation commune (core/textSearch.js), puis espaces ignorés
  // ("  voy age " trouve "Voyage").
  return normalizeSearchText(value).replace(/ /g, "");
}

/**
 * Filtre une liste de tags selon une recherche (sous-chaîne, insensible
 * à la casse, aux accents et aux espaces). Recherche vide -> tous les tags.
 * Utilisée par l'écran Filtres ET par les suggestions du formulaire de
 * création (une seule logique de recherche).
 * @param {string[]} tags
 * @param {string} query
 * @returns {string[]}
 */
export function searchTags(tags, query) {
  const needle = normalizeForSearch(query ?? "");
  if (needle === "") return [...tags];
  return tags.filter((tag) => normalizeForSearch(tag).includes(needle));
}

/**
 * Retire des états les tags qui n'existent plus dans les questions
 * disponibles (sinon un tag obligatoire devenu invisible bloquerait
 * toute sélection sans pouvoir être désactivé).
 * @param {Record<string,string>} states
 * @param {string[]} availableTags
 * @returns {Record<string,string>}
 */
export function pruneUnknownTags(states, availableTags) {
  const known = new Set(availableTags);
  const pruned = {};
  for (const [tag, state] of Object.entries(states ?? {})) {
    if (known.has(tag) && getTagState(states, tag) !== TAG_FILTER_STATES.NEUTRAL) {
      pruned[tag] = state;
    }
  }
  return pruned;
}

/**
 * Questions compatibles avec les filtres : possèdent TOUS les tags
 * obligatoires (ET) et AUCUN tag exclu. Ne modifie pas le tableau reçu.
 * @param {Array<{tags:string[]}>} questions
 * @param {Record<string,string>} states
 * @returns {Array}
 */
export function applyTagFilters(questions, states) {
  const required = [];
  const excluded = [];
  for (const tag of Object.keys(states ?? {})) {
    const state = getTagState(states, tag);
    if (state === TAG_FILTER_STATES.REQUIRED) required.push(tag);
    else if (state === TAG_FILTER_STATES.EXCLUDED) excluded.push(tag);
  }

  return (questions ?? []).filter((question) => {
    const tags = new Set(question?.tags ?? []);
    return required.every((tag) => tags.has(tag)) && !excluded.some((tag) => tags.has(tag));
  });
}
