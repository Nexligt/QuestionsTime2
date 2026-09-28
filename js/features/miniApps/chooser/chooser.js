/*
  chooser.js
  Mini-application « Qui commence ? » (principe « Chwazi ») : réglages et
  tirage du doigt gagnant (logique pure).
*/

import { randomUnit } from "../dice/dice.js";

export const CHOOSER = Object.freeze({
  waitMs: 3000, // nombre de doigts stable pendant 3 s -> tirage
  minFingers: 2,
  colors: 6, // .chooser__circle--0 … --5 (themes.css), puis réutilisées
});

/** Doigt gagnant parmi les identifiants posés. */
export function pickWinner(ids, random = randomUnit) {
  if (ids.length === 0) return null;
  return ids[Math.min(ids.length - 1, Math.floor(random() * ids.length))];
}

/** Première couleur libre (sinon la moins utilisée). */
export function nextColor(usedColors) {
  const counts = Array.from({ length: CHOOSER.colors }, (_, i) => usedColors.filter((c) => c === i).length);
  const min = Math.min(...counts);
  return counts.indexOf(min);
}
