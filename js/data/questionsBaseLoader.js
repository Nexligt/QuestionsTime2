/*
  questionsBaseLoader.js
  Seul module de l'application à connaître le chemin exact de
  data/questions.base.json. Le reste de l'app passe uniquement par
  questionsRepository.js pour obtenir des questions, jamais par ce
  module directement.

  Rôle strictement limité au chargement + validation de forme :
  aucune fusion avec les données locales ici (voir questionsRepository.js).
*/

const QUESTIONS_BASE_URL = "./data/questions.base.json";

/**
 * Charge et valide les questions de base.
 * @returns {Promise<Array<{id: number, texte: string, tags: string[], author: string}>>}
 * @throws {Error} si le fichier est inaccessible, invalide, ou mal formé.
 */
export async function loadBaseQuestions() {
  let response;
  try {
    response = await fetch(QUESTIONS_BASE_URL);
  } catch (networkError) {
    throw new Error(
      `[questionsBaseLoader] Échec réseau lors du chargement de ${QUESTIONS_BASE_URL} : ${networkError.message}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `[questionsBaseLoader] Réponse HTTP ${response.status} pour ${QUESTIONS_BASE_URL}`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    throw new Error(
      `[questionsBaseLoader] JSON invalide dans ${QUESTIONS_BASE_URL} : ${parseError.message}`
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      `[questionsBaseLoader] ${QUESTIONS_BASE_URL} doit contenir un tableau de questions.`
    );
  }

  const invalidIndex = data.findIndex(
    (question) => !isValidBaseQuestion(question)
  );
  if (invalidIndex !== -1) {
    throw new Error(
      `[questionsBaseLoader] Question mal formée à l'index ${invalidIndex} de ${QUESTIONS_BASE_URL}.`
    );
  }

  return data;
}

/** Vérifie raisonnablement la forme attendue { id, texte, tags, author }. */
function isValidBaseQuestion(question) {
  return (
    Boolean(question) &&
    typeof question === "object" &&
    typeof question.id === "number" &&
    typeof question.texte === "string" &&
    Array.isArray(question.tags) &&
    typeof question.author === "string"
  );
}
