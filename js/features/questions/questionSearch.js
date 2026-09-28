/*
  questionSearch.js
  Recherche PURE dans une liste de questions, par texte OU par identifiant.
  - Texte : chaque mot de la recherche doit apparaître (majuscules,
    accents et espaces superflus ignorés — core/textSearch.js).
  - Identifiant (casse et espaces de début/fin ignorés ; variantes
    "b3", "B - 3", "b-3" acceptées) :
      "3"   -> tout id dont le numéro CONTIENT 3 (B-3, B-39, B-53, L-30…) ;
      "B-3" -> uniquement B-3 ; "L-3" -> uniquement L-3.
*/

import { matchesAllWords } from "../../core/textSearch.js";

/** "B-3", "b3", "B - 3", "L-3"... : série et numéro. */
const PREFIXED_ID_PATTERN = /^([BL])\s*-?\s*(\d+)$/i;

/**
 * @param {{id:number, texte:string}} question
 * @param {string} query
 * @returns {boolean}
 */
export function matchesQuestionQuery(question, query) {
  const trimmed = String(query ?? "").trim();
  if (trimmed === "") return true;

  const number = String(Math.abs(question.id));

  // Numéro seul : tout id (B ou L) dont le numéro contient la saisie.
  if (/^\d+$/.test(trimmed) && number.includes(trimmed)) return true;

  // "B-3" / "L-3" (et variantes) : exactement cet id.
  const prefixed = PREFIXED_ID_PATTERN.exec(trimmed);
  if (prefixed) {
    const isBase = prefixed[1].toUpperCase() === "B";
    return isBase === question.id > 0 && number === String(Number(prefixed[2]));
  }

  return matchesAllWords(question.texte, trimmed);
}

/**
 * @template {{id:number, texte:string}} Q
 * @param {Q[]} questions
 * @param {string} query
 * @returns {Q[]}
 */
export function searchQuestions(questions, query) {
  return questions.filter((question) => matchesQuestionQuery(question, query));
}
