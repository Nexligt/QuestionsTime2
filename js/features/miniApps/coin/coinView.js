/*
  coinView.js
  Mini-application « Pile ou face » : pièce SVG à deux faces, lancer en 3D
  (CSS rotateY + backface-visibility, Web Animations API), résultat sous
  la pièce et compteur de la session. Le résultat est tiré AVANT l'animation.
*/

import { COIN_FLIP, finalRotation, flipCoin } from "./coin.js";
import { prefersReducedMotion } from "../dice/diceRollOverlay.js";
import { randomUnit } from "../dice/dice.js";

/** Face de la pièce (SVG), motif différent pour Pile et Face. */
function coinFaceSvg(side) {
  const motif = side === "Face"
    ? '<path class="coin__motif" d="M50 22l5.3 10.8 11.9 1.7-8.6 8.4 2 11.8L50 49.1l-10.6 5.6 2-11.8-8.6-8.4 11.9-1.7z"/>'
    : '<circle class="coin__motif coin__motif--ring" cx="50" cy="38" r="11"/>';
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <circle class="coin__body" cx="50" cy="50" r="47"/>
    <circle class="coin__rim" cx="50" cy="50" r="40"/>
    ${motif}
    <text class="coin__label" x="50" y="70" text-anchor="middle" dominant-baseline="central">${side.toUpperCase()}</text>
  </svg>`;
}

/**
 * @param {string} labelledBy - id du titre.
 * @returns {HTMLElement}
 */
export function buildCoinApp(labelledBy) {
  const root = document.createElement("div");
  root.className = "coin-app";
  root.setAttribute("aria-labelledby", labelledBy);
  root.dataset.spinning = "false";
  root.dataset.rotation = "0";

  const stage = document.createElement("div");
  stage.className = "coin-app__stage";
  const coinButton = document.createElement("button");
  coinButton.type = "button";
  coinButton.className = "coin-app__coin";
  coinButton.setAttribute("aria-label", "Lancer la pièce");
  const coin = document.createElement("div");
  coin.className = "coin";
  for (const side of ["Face", "Pile"]) {
    const face = document.createElement("div");
    face.className = `coin__face coin__face--${side.toLowerCase()}`;
    face.innerHTML = coinFaceSvg(side);
    coin.append(face);
  }
  coinButton.append(coin);
  stage.append(coinButton);

  const result = document.createElement("p");
  result.className = "coin-app__result";
  result.setAttribute("aria-live", "polite");

  const flipButton = document.createElement("button");
  flipButton.type = "button";
  flipButton.className = "button coin-app__flip";
  flipButton.textContent = "Lancer";

  const counterRow = document.createElement("div");
  counterRow.className = "coin-app__counter-row";
  const counter = document.createElement("p");
  counter.className = "coin-app__counter";
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "button button--secondary coin-app__reset";
  resetButton.textContent = "Remettre à zéro";
  counterRow.append(counter, resetButton);

  root.append(stage, result, flipButton, counterRow);

  // --- État (session uniquement) -------------------------------------------
  const counts = { Pile: 0, Face: 0 };
  let rotation = 0;
  let spinning = false;

  function renderCounter() {
    counter.textContent = `Pile : ${counts.Pile} · Face : ${counts.Face}`;
    resetButton.disabled = counts.Pile + counts.Face === 0;
  }

  function setRotation(value) {
    rotation = value;
    coin.style.transform = `rotateY(${value}deg)`;
    root.dataset.rotation = String(value);
  }

  function finish(side, target) {
    setRotation(target % 360);
    result.textContent = side;
    root.dataset.result = side;
    counts[side] += 1;
    renderCounter();
    spinning = false;
    root.dataset.spinning = "false";
  }

  function flip() {
    if (spinning) return; // touchers ignorés pendant l'animation
    const side = flipCoin(); // tirage AVANT l'animation
    const turns = COIN_FLIP.minTurns + Math.floor(randomUnit() * (COIN_FLIP.maxTurns - COIN_FLIP.minTurns + 1));
    const target = finalRotation(rotation, side, turns);
    root.dataset.drawn = side;
    spinning = true;
    root.dataset.spinning = "true";
    result.textContent = "";

    if (prefersReducedMotion(root.ownerDocument.defaultView) || typeof coin.animate !== "function") {
      finish(side, target); // résultat direct
      return;
    }
    const at = (t) => rotation + (target - rotation) * t;
    const up = `translateY(calc(-1 * ${COIN_FLIP.jump}))`;
    const animation = coin.animate([
      { transform: `translateY(0) rotateY(${rotation}deg) scale(1)`, easing: "ease-out" },
      { transform: `${up} rotateY(${at(0.5)}deg) scale(1.15)`, offset: 0.45, easing: "ease-in" },
      { transform: `translateY(0) rotateY(${at(0.88)}deg) scale(1)`, offset: 0.82, easing: "ease-out" },
      { transform: `translateY(-0.5rem) rotateY(${at(0.97)}deg) scale(1)`, offset: 0.91, easing: "ease-in" },
      { transform: `translateY(0) rotateY(${target}deg) scale(1)` },
    ], { duration: COIN_FLIP.duration, fill: "forwards" });
    Promise.resolve(animation.finished)
      .catch(() => {})
      .then(() => {
        finish(side, target);
        animation.cancel?.(); // position finale portée par le style
      });
  }

  coinButton.addEventListener("click", flip);
  flipButton.addEventListener("click", flip);
  resetButton.addEventListener("click", () => {
    counts.Pile = 0;
    counts.Face = 0;
    renderCounter();
  });

  setRotation(0);
  renderCounter();
  return root;
}
