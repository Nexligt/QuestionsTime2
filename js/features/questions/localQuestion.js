/*
  localQuestion.js
  Règles PURES (sans IndexedDB ni DOM) d'une question créée localement :
  normalisation des tags (sans doublons) et validation des champs
  obligatoires. Le modèle reste celui du cahier des charges :
    { id, texte, tags, author }   — aucun champ `source`.
  L'id (négatif) est attribué par questionsRepository.createLocalQuestion.
*/

import { normalizeSearchText } from "../../core/textSearch.js";

/** Clé de comparaison : casse, accents et espaces multiples ignorés. */
export function tagKey(tag) {
  return normalizeSearchText(tag); // même normalisation que les recherches
}

/** Nettoie un tag saisi (espaces superflus retirés). */
export function cleanTag(tag) {
  return String(tag ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Ajoute un tag s'il n'est pas déjà présent (comparaison insensible à la
 * casse et aux accents). Si un tag existant de l'application correspond
 * (`knownTags`), son orthographe est réutilisée pour que les filtres
 * regroupent bien les questions. Ne modifie pas le tableau reçu.
 * @param {string[]} tags
 * @param {string} tag
 * @param {string[]} [knownTags]
 * @returns {string[]}
 */
export function addTag(tags, tag, knownTags = []) {
  const cleaned = cleanTag(tag);
  if (cleaned === "") return [...tags];
  const key = tagKey(cleaned);
  if (tags.some((t) => tagKey(t) === key)) return [...tags];
  const known = knownTags.find((t) => tagKey(t) === key);
  return [...tags, known ?? cleaned];
}

/**
 * Découpe une saisie contenant éventuellement plusieurs tags séparés par
 * des virgules ou des points-virgules, et les ajoute sans doublons.
 * @param {string[]} tags
 * @param {string} text
 * @param {string[]} [knownTags]
 * @returns {string[]}
 */
export function addTagsFromText(tags, text, knownTags = []) {
  return String(text ?? "")
    .split(/[,;]/)
    .reduce((acc, part) => addTag(acc, part, knownTags), [...tags]);
}

/** Tableau de tags sans doublons ni vides. */
export function normalizeTags(tags, knownTags = []) {
  return (tags ?? []).reduce((acc, t) => addTag(acc, t, knownTags), []);
}

export const QUESTION_FIELD_ERRORS = Object.freeze({
  texte: "Le texte de la question est obligatoire.",
  tags: "Ajoutez au moins un tag.",
  author: "L'auteur est obligatoire.",
});

/**
 * Valide et normalise un brouillon de question.
 * @param {{texte?:string, tags?:string[], author?:string}} draft
 * @param {string[]} [knownTags]
 * @returns {{ valid: boolean,
 *             errors: {texte?:string, tags?:string, author?:string},
 *             question: {texte:string, tags:string[], author:string} }}
 */
export function validateQuestionDraft(draft, knownTags = []) {
  const question = {
    texte: String(draft?.texte ?? "").trim(),
    tags: normalizeTags(draft?.tags, knownTags),
    author: String(draft?.author ?? "").replace(/\s+/g, " ").trim(),
  };
  const errors = {};
  if (question.texte === "") errors.texte = QUESTION_FIELD_ERRORS.texte;
  if (question.tags.length === 0) errors.tags = QUESTION_FIELD_ERRORS.tags;
  if (question.author === "") errors.author = QUESTION_FIELD_ERRORS.author;
  return { valid: Object.keys(errors).length === 0, errors, question };
}
