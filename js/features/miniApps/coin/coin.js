/*
  coin.js
  Mini-application « Pile ou face » : logique pure (tirage, angle final).
  Rotation autour de l'axe vertical (rotateY) : « Face » visible à 0°
  (modulo 360), « Pile » à 180°.
*/

import { randomUnit } from "../dice/dice.js";

export const COIN_SIDES = Object.freeze(["Pile", "Face"]);

/** Réglages de l'animation. */
export const COIN_FLIP = Object.freeze({
  duration: 1500, // ms
  minTurns: 4,
  maxTurns: 6,
  jump: "2.5rem", // hauteur du saut (reste dans la carte)
});

const SIDE_ANGLE = { Face: 0, Pile: 180 };

/** Tirage : « Pile » ou « Face ». */
export function flipCoin(random = randomUnit) {
  return random() < 0.5 ? "Pile" : "Face";
}

/** Face visible pour une rotation donnée. */
export function sideAtRotation(rotation) {
  const angle = ((rotation % 360) + 360) % 360;
  return angle > 90 && angle < 270 ? "Pile" : "Face";
}

/** Rotation finale : plusieurs tours complets, arrêt exactement sur `side`. */
export function finalRotation(current, side, turns = COIN_FLIP.minTurns) {
  const currentMod = ((current % 360) + 360) % 360;
  const delta = (((SIDE_ANGLE[side] - currentMod) % 360) + 360) % 360;
  return current + turns * 360 + delta;
}
