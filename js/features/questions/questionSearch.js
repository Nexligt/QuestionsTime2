/*
  questionSearch.js
  Recherche PURE dans une liste de questions, par texte OU par identifiant.
  - Texte : chaque mot de la recherche doit apparaître (majuscules,
    accents et espaces superflus ignorés — core/textSearch.js).
  - Identifiant (casse et espaces de début/fin ignorés ; variantes
    "b3", "B - 3", "b-3" acceptées) :
      "3"   -> tout id dont le numéro CONTIENT 3 (B-3, B-39, B-53, L-30…) ;
      "B-1" -> ids de base commençant par 1 (B-1, B-12, B-133…) ; idem "L-1" ;
      "B" / "B-" -> toutes les questions de base ; "L" / "L-" -> toutes les locales.
*/

import { matchesAllWords } from "../../core/textSearch.js";
import { QUESTION_ID_PATTERN } from "./questionId.js";

/** "B-3", "b3", "B - 3", "B – 3", "L-3"... : série et numéro (voir questionId.js). */
const PREFIXED_ID_PATTERN = QUESTION_ID_PATTERN;

/** "B", "B-", "B -", "L"... sans numéro : toute la série (base ou locale). */
const SERIES_PATTERN = /^([BL])\s*[-\u2010-\u2015\u2212]?$/i;

/**
 * @param {{id:number, texte:string}} question
 * @param {string} query
 * @returns {boolean}
 */
export function matchesQuestionQuery(question, query) {
  const trimmed = String(query ?? "").trim();
  if (trimmed === "") return true;

  const number = String(Math.abs(question.id));

  // "B" / "B-" : toutes les questions de base ; "L" / "L-" : toutes les locales.
  const series = SERIES_PATTERN.exec(trimmed);
  if (series) return (series[1].toUpperCase() === "B") === question.id > 0;

  // Numéro seul : tout id (B ou L) dont le numéro contient la saisie.
  if (/^\d+$/.test(trimmed) && number.includes(trimmed)) return true;

  // "B-1" / "L-1" (et variantes) : ids de la série dont le numéro
  // COMMENCE par la saisie (B-1, B-12, B-133…).
  const prefixed = PREFIXED_ID_PATTERN.exec(trimmed);
  if (prefixed) {
    const isBase = prefixed[1].toUpperCase() === "B";
    return isBase === question.id > 0 && number.startsWith(String(Number(prefixed[2])));
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
