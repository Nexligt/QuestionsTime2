/*
  playerPick.js
  Option « Joueur désigné » : à chaque changement de question, une entrée
  de la Roue (Paramètres > Mini-apps > Roue) est tirée au hasard pour
  indiquer qui répond. Réglage et dernier tirage dans le store `settings`.
*/

import { getSetting, setSetting } from "../../data/settingsRepository.js";
import { loadWheelSettings } from "../miniApps/wheel/wheel.js";
import { randomUnit } from "../miniApps/dice/dice.js";

export const PLAYER_PICK_KEY = "playerPick"; // "on" | "off"
export const PLAYER_PICK_CURRENT_KEY = "playerPickCurrent"; // { questionId, name }
export const PLAYER_PICK_NO_REPEAT_KEY = "playerPickNoRepeat"; // "on" (défaut) | "off"
export const PLAYER_PICK = Object.freeze({ ON: "on", OFF: "off" });

/* Changements de réglage : Réglages et la mini-app Roue restent synchronisés. */
const changes = new EventTarget();

/** @param {(detail: { key: string, value: string }) => void} listener @returns {() => void} */
export function onPlayerPickChange(listener) {
  const handler = (event) => listener(event.detail);
  changes.addEventListener("change", handler);
  return () => changes.removeEventListener("change", handler);
}

function notify(key, value) {
  const event = new Event("change");
  event.detail = { key, value };
  changes.dispatchEvent(event);
}

const normalize = (value) => (value === PLAYER_PICK.ON ? PLAYER_PICK.ON : PLAYER_PICK.OFF);

export async function getPlayerPick() {
  return (await getSetting(PLAYER_PICK_KEY, PLAYER_PICK.OFF)) === PLAYER_PICK.ON ? PLAYER_PICK.ON : PLAYER_PICK.OFF;
}

/** Enregistre le réglage et renvoie la valeur retenue. */
export async function setPlayerPick(value) {
  const normalized = normalize(value);
  await setSetting(PLAYER_PICK_KEY, normalized);
  notify(PLAYER_PICK_KEY, normalized);
  return normalized;
}

/** « Jamais deux fois de suite le même nom » (activé par défaut). */
export async function getPlayerNoRepeat() {
  return (await getSetting(PLAYER_PICK_NO_REPEAT_KEY, PLAYER_PICK.ON)) === PLAYER_PICK.OFF ? PLAYER_PICK.OFF : PLAYER_PICK.ON;
}

export async function setPlayerNoRepeat(value) {
  const normalized = normalize(value);
  await setSetting(PLAYER_PICK_NO_REPEAT_KEY, normalized);
  notify(PLAYER_PICK_NO_REPEAT_KEY, normalized);
  return normalized;
}

/**
 * Tirage : une entrée au hasard ; avec `noRepeat`, différente de la
 * précédente quand c'est possible.
 */
export function pickPlayer(entries, previous = null, random = randomUnit, { noRepeat = true } = {}) {
  const pool = noRepeat && entries.length > 1 ? entries.filter((name) => name !== previous) : entries;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/**
 * Joueur pour la question affichée, ou null si l'option est désactivée.
 * `isNew` : la question vient de changer (Suivante, swipe, recherche) ->
 * nouveau tirage. Sinon (retour sur Main), le joueur déjà tiré est gardé.
 */
export async function resolvePlayer(questionId, isNew) {
  if ((await getPlayerPick()) !== PLAYER_PICK.ON) return null;
  const [{ entries }, current, noRepeat] = await Promise.all([
    loadWheelSettings(),
    getSetting(PLAYER_PICK_CURRENT_KEY, null),
    getPlayerNoRepeat(),
  ]);
  if (!isNew && current?.questionId === questionId && entries.includes(current.name)) return current.name;
  const name = pickPlayer(entries, current?.name ?? null, randomUnit, { noRepeat: noRepeat === PLAYER_PICK.ON });
  if (name !== null) await setSetting(PLAYER_PICK_CURRENT_KEY, { questionId, name });
  return name;
}
