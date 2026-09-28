/*
  wheel.js
  Mini-application « Roue » : logique pure (entrées, tirage, angle d'arrêt)
  et réglages mémorisés dans le store `settings` existant (aucun nouveau store).

  Géométrie : n parts égales, la part i couvre [i·360/n, (i+1)·360/n[
  degrés, mesurés dans le sens horaire depuis le haut. La roue tourne dans
  le sens horaire de `rotation` degrés ; le repère fixe est en haut.
*/

import { getSetting, setSetting } from "../../../data/settingsRepository.js";
import { randomUnit } from "../dice/dice.js";

export const WHEEL_LIMITS = Object.freeze({ min: 2, max: 20, maxLength: 30 });
export const DEFAULT_WHEEL_ENTRIES = Object.freeze(["Joueur 1", "Joueur 2", "Joueur 3"]);
export const WHEEL_SETTING_KEYS = Object.freeze({ entries: "wheel.entries", removeDrawn: "wheel.removeDrawn" });

/** Réglages de l'animation. */
export const WHEEL_SPIN = Object.freeze({
  duration: 3600, // ms (3 à 4 s)
  minTurns: 5,
  maxTurns: 7,
  easing: "cubic-bezier(0.12, 0.72, 0.16, 1)", // ralentissement progressif
  margin: 0.15, // part de la tranche gardée libre de chaque côté (jamais sur une bordure)
});

/** Entrée nettoyée : espaces superflus retirés, 30 caractères maximum. */
export function normalizeEntry(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, WHEEL_LIMITS.maxLength);
}

/** Liste valide : entrées non vides, 20 au plus ; moins de 2 -> liste par défaut. */
export function normalizeEntries(list) {
  const entries = (Array.isArray(list) ? list : []).map(normalizeEntry).filter(Boolean).slice(0, WHEEL_LIMITS.max);
  return entries.length >= WHEEL_LIMITS.min ? entries : [...DEFAULT_WHEEL_ENTRIES];
}

/** Index tiré au hasard, de 0 à count − 1. */
export function drawIndex(count, random = randomUnit) {
  return Math.min(count - 1, Math.max(0, Math.floor(random() * count)));
}

/** Part sous le repère pour une rotation donnée. */
export function segmentAtRotation(rotation, count) {
  const angle = (((360 - rotation) % 360) + 360) % 360;
  return Math.min(count - 1, Math.floor(angle / (360 / count)));
}

/**
 * Rotation finale (absolue, en degrés) qui amène la part `index` sous le
 * repère, après plusieurs tours complets dans le sens horaire.
 * @param {number} current - rotation actuelle.
 * @param {number} index - part tirée.
 * @param {number} count - nombre de parts.
 * @param {{ turns?: number, offset?: number }} [options] - offset ∈ [0, 1] : position dans la
 *   zone autorisée de la part (hors marges), 0,5 = centre.
 */
export function stopRotation(current, index, count, { turns = WHEEL_SPIN.minTurns, offset = 0.5 } = {}) {
  const segment = 360 / count;
  const inside = WHEEL_SPIN.margin + Math.min(1, Math.max(0, offset)) * (1 - 2 * WHEEL_SPIN.margin);
  const target = (index + inside) * segment; // angle de la roue à placer sous le repère
  const finalMod = (((360 - target) % 360) + 360) % 360;
  const currentMod = ((current % 360) + 360) % 360;
  const delta = (((finalMod - currentMod) % 360) + 360) % 360;
  return current + turns * 360 + delta;
}

/** Entrées encore en jeu (option « Retirer l'entrée tirée »). */
export function activeEntries(entries, drawn) {
  return entries.filter((_, i) => !drawn.has(i));
}

export async function loadWheelSettings() {
  const [entries, removeDrawn] = await Promise.all([
    getSetting(WHEEL_SETTING_KEYS.entries, null),
    getSetting(WHEEL_SETTING_KEYS.removeDrawn, false),
  ]);
  return { entries: normalizeEntries(entries ?? DEFAULT_WHEEL_ENTRIES), removeDrawn: removeDrawn === true };
}

export function saveWheelEntries(entries) {
  return setSetting(WHEEL_SETTING_KEYS.entries, normalizeEntries(entries));
}

export function saveWheelRemoveDrawn(enabled) {
  return setSetting(WHEEL_SETTING_KEYS.removeDrawn, Boolean(enabled));
}
