/*
  dice.js
  Mini-application « Dés » : logique pure (bornes, tirage) et réglages
  mémorisés dans le store `settings` existant (aucun nouveau store).
*/

import { getSetting, setSetting } from "../../../data/settingsRepository.js";

/** Nombre de dés : 1 à 10. */
export const DICE_COUNT = Object.freeze({ min: 1, max: 10, default: 2 });
/** Nombre de faces : 2 à 100 (champ « autre »). */
export const DICE_FACES = Object.freeze({ min: 2, max: 100, default: 6 });
/** Faces proposées par les boutons à segments. */
export const FACE_PRESETS = Object.freeze([4, 6, 8, 10, 12, 20]);

/** Clés dans le store `settings`. */
export const DICE_SETTING_KEYS = Object.freeze({
  count: "dice.count",
  faces: "dice.faces",
  animation: "dice.animation",
});

function toInteger(value) {
  if (typeof value === "string") value = value.trim() === "" ? NaN : Number(value);
  return Number.isInteger(value) ? value : null;
}

/** Nombre de dés ramené entre 1 et 10 (valeur invalide -> défaut). */
export function clampDiceCount(value) {
  const n = toInteger(value);
  if (n === null) return DICE_COUNT.default;
  return Math.min(DICE_COUNT.max, Math.max(DICE_COUNT.min, n));
}

/** Nombre de faces valide (entier de 2 à 100) ou null. */
export function parseFaces(value) {
  const n = toInteger(value);
  return n !== null && n >= DICE_FACES.min && n <= DICE_FACES.max ? n : null;
}

/** Nombre aléatoire uniforme dans [0, 1). */
export function randomUnit() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  return Math.random();
}

/** Un dé : entier de 1 à `faces` inclus. */
export function rollDie(faces, random = randomUnit) {
  const r = random();
  const value = Math.floor(r * faces) + 1;
  return Math.min(faces, Math.max(1, value)); // garde-fou si random() renvoie 1
}

/** Plusieurs dés : valeurs et total. */
export function rollDice(count, faces, random = randomUnit) {
  const values = Array.from({ length: clampDiceCount(count) }, () => rollDie(faces, random));
  return { values, total: values.reduce((a, b) => a + b, 0) };
}

/** Réglages mémorisés (valeurs toujours valides). */
export async function loadDiceSettings() {
  const [count, faces, animation] = await Promise.all([
    getSetting(DICE_SETTING_KEYS.count, DICE_COUNT.default),
    getSetting(DICE_SETTING_KEYS.faces, DICE_FACES.default),
    getSetting(DICE_SETTING_KEYS.animation, true),
  ]);
  return {
    count: clampDiceCount(count),
    faces: parseFaces(faces) ?? DICE_FACES.default,
    animation: animation !== false,
  };
}

export function saveDiceCount(count) {
  return setSetting(DICE_SETTING_KEYS.count, clampDiceCount(count));
}

export function saveDiceFaces(faces) {
  const valid = parseFaces(faces);
  if (valid === null) return Promise.reject(new RangeError("faces"));
  return setSetting(DICE_SETTING_KEYS.faces, valid);
}

export function saveDiceAnimation(enabled) {
  return setSetting(DICE_SETTING_KEYS.animation, Boolean(enabled));
}
