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
 * Inverse de `formatQuestionId` (utilisé par la recherche par id).
 * @param {string} label - ex. "B-12", "b-12", "b12", "L-3" (casse et
 *   espaces autour du tiret ignorés).
 * @returns {number|null}
 */
export function parseQuestionId(label) {
  const match = /^([BL])\s*-?\s*(\d+)$/i.exec(String(label ?? "").trim());
  if (!match) return null;
  const n = Number(match[2]);
  if (n === 0) return null;
  return match[1].toUpperCase() === "B" ? n : -n;
}
