/*
  textSearch.js
  Normalisation de texte commune à toutes les recherches de l'application
  (tags dans Filtres et dans le formulaire, questions supprimées...) :
  une seule règle pour ignorer majuscules, accents et espaces superflus.
*/

/**
 * Minuscules, sans accents, espaces multiples réduits à un seul, sans
 * espaces de début/fin. Ex. "  Capitale  de FRANCE " -> "capitale de france".
 * @param {*} value
 * @returns {string}
 */
export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Vrai si CHAQUE mot de la recherche apparaît dans le texte (ordre libre,
 * mots partiels acceptés). Ex. "capital france" trouve
 * "Quelle est la capitale de France ?". Recherche vide -> vrai.
 * @param {string} text
 * @param {string} query
 * @returns {boolean}
 */
export function matchesAllWords(text, query) {
  const words = normalizeSearchText(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearchText(text);
  return words.every((word) => haystack.includes(word));
}
