/*
  nextNavigation.js
  Réglage "Navigation vers la question suivante" : bouton, swipe ou les
  deux. Persisté dans le store `settings` existant (clé `nextNavigation`),
  lu par Main à chaque montage et modifié par Paramètres.

  Ce module ne change jamais de question lui-même : il dit seulement
  QUELS déclencheurs sont actifs. Le changement passe toujours par
  `questionEngine.advanceToNextQuestion()` (appelé par mainView.js).
*/

import { getSetting, setSetting } from "../../data/settingsRepository.js";

export const NEXT_NAVIGATION_KEY = "nextNavigation";

export const NEXT_NAVIGATION = Object.freeze({
  BUTTON: "button",
  SWIPE: "swipe",
  BOTH: "both",
});

export const DEFAULT_NEXT_NAVIGATION = NEXT_NAVIGATION.BOTH;

const VALID_VALUES = new Set(Object.values(NEXT_NAVIGATION));

/** @returns {Promise<"button"|"swipe"|"both">} */
export async function getNextNavigation() {
  const value = await getSetting(NEXT_NAVIGATION_KEY, DEFAULT_NEXT_NAVIGATION);
  return VALID_VALUES.has(value) ? value : DEFAULT_NEXT_NAVIGATION;
}

/**
 * @param {"button"|"swipe"|"both"} value
 * @returns {Promise<"button"|"swipe"|"both">}
 */
export async function setNextNavigation(value) {
  if (!VALID_VALUES.has(value)) {
    throw new Error(`[nextNavigation] Valeur inconnue : "${value}"`);
  }
  await setSetting(NEXT_NAVIGATION_KEY, value);
  return value;
}

export function isButtonEnabled(value) {
  return value === NEXT_NAVIGATION.BUTTON || value === NEXT_NAVIGATION.BOTH;
}

export function isSwipeEnabled(value) {
  return value === NEXT_NAVIGATION.SWIPE || value === NEXT_NAVIGATION.BOTH;
}
