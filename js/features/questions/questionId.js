/*
  questionId.js
  Représentation AFFICHÉE de l'identifiant d'une question. Rien n'est
  stocké sous cette forme : l'id interne reste un nombre
  (positif = base, négatif = question locale).
    1   -> "B-1"     27  -> "B-27"
    -1  -> "L-1"     -27 -> "L-27"
*/

/**
 * @param {number} id - id interne.
 * @returns {string}
 */
export function formatQuestionId(id) {
  if (typeof id !== "number" || !Number.isFinite(id) || id === 0) return String(id);
  return id > 0 ? `B-${id}` : `L-${Math.abs(id)}`;
}

/**
 * ID saisi : « B-12 », « B - 12 », « b12 »… Le tiret peut être un trait
 * d'union ou un tiret typographique (–, —, −) : les claviers de téléphone
 * remplacent souvent « - » entouré d'espaces par « – ».
 */
export const QUESTION_ID_PATTERN = /^([BL])\s*[-\u2010-\u2015\u2212]?\s*(\d+)$/i;

/**
 * Inverse de `formatQuestionId` (utilisé par la recherche par id).
 * @param {string} label - ex. "B-12", "B - 12", "b12", "L – 3" (casse,
 *   espaces et type de tiret ignorés).
 * @returns {number|null}
 */
export function parseQuestionId(label) {
  const match = QUESTION_ID_PATTERN.exec(String(label ?? "").trim());
  if (!match) return null;
  const n = Number(match[2]);
  if (n === 0) return null;
  return match[1].toUpperCase() === "B" ? n : -n;
}
