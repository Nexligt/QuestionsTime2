/*
  diceRollOverlay.js
  Lancer animé : couche temporaire au premier plan. Les dés tournent,
  rebondissent puis s'arrêtent sur leur valeur (~1 s). Un toucher (ou
  Échap) ferme la couche. Web Animations API, sans bibliothèque.
*/

import { createDie, setDieValue } from "./dieShape.js";
import { rollDie } from "./dice.js";

/** Réglages de l'animation. */
export const DICE_ROLL_TIMINGS = Object.freeze({
  duration: 1000, // durée du lancer d'un dé
  stagger: 60, // décalage entre deux dés
  faceChange: 90, // changement de face pendant la rotation
  settle: 0.55, // part de la durée à laquelle le dé touche la table
});

/** « Réduire les animations » activé sur l'appareil ? */
export function prefersReducedMotion(win = globalThis.window) {
  return Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

/**
 * Affiche le lancer par-dessus l'application.
 * @param {{ values: number[], faces: number, container?: HTMLElement, returnFocus?: HTMLElement }} options
 * @returns {{ overlay: HTMLElement, close: () => void }}
 */
export function showDiceRoll({ values, faces, container = document.body, returnFocus = null }) {
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const overlay = doc.createElement("div");
  overlay.className = "dice-roll";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Lancer de dés");
  overlay.tabIndex = -1;

  const tray = doc.createElement("div");
  tray.className = "dice-roll__tray";
  const hint = doc.createElement("p");
  hint.className = "dice-roll__hint";
  hint.textContent = "Toucher pour fermer";
  overlay.append(tray, hint);

  const timers = [];
  const animations = [];
  const width = win?.innerWidth ?? 375;
  const height = win?.innerHeight ?? 700;

  values.forEach((value, index) => {
    const die = createDie(rollDie(faces), faces);
    die.classList.add("dice-roll__die");
    tray.append(die);

    const delay = index * DICE_ROLL_TIMINGS.stagger;
    const landAt = delay + DICE_ROLL_TIMINGS.duration * DICE_ROLL_TIMINGS.settle;
    // Faces qui défilent pendant la rotation, puis valeur finale.
    const spin = win?.setInterval ? win.setInterval(() => setDieValue(die, rollDie(faces), faces), DICE_ROLL_TIMINGS.faceChange) : null;
    const stop = () => { if (spin !== null) win.clearInterval(spin); setDieValue(die, value, faces); };
    timers.push({ spin, land: win?.setTimeout ? win.setTimeout(stop, landAt) : (stop(), null) });

    if (typeof die.animate === "function") {
      const fromX = Math.round((Math.random() - 0.5) * width * 0.8);
      const turn = Math.random() < 0.5 ? -1 : 1;
      animations.push(die.animate([
        { transform: `translate(${fromX}px, ${-height * 0.6}px) rotate(0deg) scale(0.7)`, opacity: 0 },
        { transform: `translate(0, 0) rotate(${540 * turn}deg) scale(1)`, opacity: 1, offset: DICE_ROLL_TIMINGS.settle },
        { transform: `translate(0, -1.5rem) rotate(${650 * turn}deg)`, offset: 0.72 },
        { transform: `translate(0, 0) rotate(${700 * turn}deg)`, offset: 0.86 },
        { transform: `translate(0, -0.35rem) rotate(${715 * turn}deg)`, offset: 0.93 },
        { transform: `translate(0, 0) rotate(${720 * turn}deg)` },
      ], { duration: DICE_ROLL_TIMINGS.duration, delay, easing: "ease-out", fill: "backwards" }));
    } else {
      stop();
    }
  });

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    for (const t of timers) {
      if (t.spin !== null) win.clearInterval(t.spin);
      if (t.land !== null) win.clearTimeout(t.land);
    }
    for (const a of animations) a.cancel?.();
    doc.removeEventListener("keydown", onKeydown);
    overlay.remove();
    returnFocus?.focus?.({ preventScroll: true });
  }
  function onKeydown(event) {
    if (event.key === "Escape") close();
  }
  overlay.addEventListener("click", close);
  doc.addEventListener("keydown", onKeydown);

  container.append(overlay);
  overlay.focus?.({ preventScroll: true });
  return { overlay, close };
}
