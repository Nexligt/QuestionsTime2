/*
  wheelView.js
  Mini-application « Roue » (onglet Mini-apps des Paramètres) : roue SVG,
  bouton « Tourner », liste d'entrées modifiable, option « Retirer
  l'entrée tirée » avec « Réinitialiser ». Le résultat est tiré AVANT
  l'animation ; la roue s'arrête exactement sur la part tirée.
*/

import {
  WHEEL_LIMITS,
  WHEEL_SPIN,
  activeEntries,
  drawIndex,
  loadWheelSettings,
  normalizeEntry,
  saveWheelEntries,
  saveWheelRemoveDrawn,
  stopRotation,
} from "./wheel.js";
import { drawWheel } from "./wheelSvg.js";
import { prefersReducedMotion } from "../dice/diceRollOverlay.js";
import { randomUnit } from "../dice/dice.js";

const DELETE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`;

let wheelCounter = 0;

/**
 * @param {string} labelledBy - id du titre de la carte.
 * @returns {HTMLElement}
 */
export function buildWheelApp(labelledBy) {
  const uid = ++wheelCounter;
  const root = document.createElement("div");
  root.className = "wheel-app";
  root.setAttribute("aria-labelledby", labelledBy);
  root.dataset.ready = "false";
  root.dataset.saves = "0";

  // --- Roue ------------------------------------------------------------------
  const stage = document.createElement("div");
  stage.className = "wheel-app__stage";
  const pointer = document.createElement("span");
  pointer.className = "wheel-app__pointer";
  pointer.setAttribute("aria-hidden", "true");
  const wheelButton = document.createElement("button");
  wheelButton.type = "button";
  wheelButton.className = "wheel-app__wheel";
  wheelButton.setAttribute("aria-label", "Tourner la roue");
  const rotor = document.createElement("div");
  rotor.className = "wheel-app__rotor";
  wheelButton.append(rotor);
  stage.append(wheelButton, pointer);

  const result = document.createElement("p");
  result.className = "wheel-app__result";
  result.setAttribute("aria-live", "polite");

  const spinButton = document.createElement("button");
  spinButton.type = "button";
  spinButton.className = "button wheel-app__spin";
  spinButton.textContent = "Tourner";

  // --- Option « Retirer l'entrée tirée » ------------------------------------
  const removeLabel = document.createElement("label");
  removeLabel.className = "settings-choice";
  const removeInput = document.createElement("input");
  removeInput.type = "checkbox";
  removeInput.className = "settings-choice__input wheel-app__remove";
  const removeText = document.createElement("span");
  removeText.className = "settings-choice__text";
  const removeName = document.createElement("span");
  removeName.className = "settings-choice__label";
  removeName.textContent = "Retirer l'entrée tirée";
  const removeDescription = document.createElement("span");
  removeDescription.className = "settings-choice__description";
  removeDescription.textContent = "Elle ne sort plus aux tours suivants.";
  removeText.append(removeName, removeDescription);
  removeLabel.append(removeInput, removeText);

  const drawnRow = document.createElement("div");
  drawnRow.className = "wheel-app__drawn";
  const drawnStatus = document.createElement("p");
  drawnStatus.className = "wheel-app__drawn-status";
  drawnStatus.setAttribute("aria-live", "polite");
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "button button--secondary wheel-app__reset";
  resetButton.textContent = "Réinitialiser";
  drawnRow.append(drawnStatus, resetButton);

  // --- Liste des entrées -------------------------------------------------------
  const listTitle = document.createElement("p");
  listTitle.className = "settings-choice__label wheel-app__list-title";
  listTitle.id = `wheel-list-${uid}`;
  const list = document.createElement("ul");
  list.className = "wheel-app__entries";
  list.setAttribute("aria-labelledby", listTitle.id);
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "button button--secondary wheel-app__add";
  addButton.textContent = "Ajouter une entrée";

  root.append(stage, result, spinButton, removeLabel, drawnRow, listTitle, list, addButton);

  // --- État ------------------------------------------------------------------------
  let entries = [];
  let drawn = new Set(); // index des entrées déjà tirées (option « Retirer »)
  let shown = []; // entrées dessinées sur la roue actuelle
  let shownIndexes = []; // leur index dans `entries`
  let rotation = 0;
  let spinning = false;

  function track(promise) {
    promise
      .then(() => { root.dataset.saves = String(Number(root.dataset.saves) + 1); })
      .catch((error) => console.error("[wheel] Réglage non enregistré :", error));
  }

  function currentEntries() {
    return removeInput.checked ? activeEntries(entries, drawn) : entries;
  }

  /** Redessine la roue avec les entrées en jeu (rotation remise à 0). */
  function redrawWheel() {
    shownIndexes = entries.map((_, i) => i).filter((i) => !removeInput.checked || !drawn.has(i));
    shown = shownIndexes.map((i) => entries[i]);
    rotation = 0;
    rotor.style.transform = "rotate(0deg)";
    rotor.replaceChildren(shown.length ? drawWheel(shown) : document.createTextNode(""));
    root.dataset.wheelCount = String(shown.length);
  }

  function renderDrawn() {
    const remaining = activeEntries(entries, drawn).length;
    drawnRow.hidden = !removeInput.checked;
    drawnStatus.textContent = remaining === 0
      ? "Toutes les entrées ont été tirées."
      : `${remaining} entrée${remaining > 1 ? "s" : ""} en jeu sur ${entries.length}.`;
    resetButton.disabled = drawn.size === 0;
    const empty = currentEntries().length === 0;
    spinButton.disabled = empty;
    wheelButton.disabled = empty;
  }

  function renderEntries() {
    listTitle.textContent = `Entrées (${entries.length} sur ${WHEEL_LIMITS.max} au plus)`;
    list.replaceChildren(...entries.map((entry, index) => {
      const item = document.createElement("li");
      item.className = "wheel-app__entry";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "settings-number__input wheel-app__entry-input";
      input.value = entry;
      input.maxLength = WHEEL_LIMITS.maxLength;
      input.setAttribute("aria-label", `Entrée ${index + 1}`);
      input.addEventListener("change", () => renameEntry(index, input));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button wheel-app__entry-delete";
      remove.setAttribute("aria-label", `Supprimer « ${entry} »`);
      remove.innerHTML = DELETE_ICON;
      remove.disabled = entries.length <= WHEEL_LIMITS.min;
      remove.addEventListener("click", () => deleteEntry(index));
      item.append(input, remove);
      return item;
    }));
    addButton.disabled = entries.length >= WHEEL_LIMITS.max;
  }

  /** Après toute modification de la liste : sauvegarde, tirages remis à zéro. */
  function listChanged({ keepDrawn = false } = {}) {
    if (!keepDrawn) drawn = new Set();
    track(saveWheelEntries(entries));
    renderEntries();
    redrawWheel();
    renderDrawn();
  }

  function renameEntry(index, input) {
    if (spinning) { input.value = entries[index]; return; }
    const value = normalizeEntry(input.value);
    if (!value) { input.value = entries[index]; return; } // entrée vide refusée
    entries[index] = value;
    listChanged({ keepDrawn: true }); // renommer ne remet pas les tirages à zéro
  }

  function deleteEntry(index) {
    if (spinning || entries.length <= WHEEL_LIMITS.min) return;
    entries.splice(index, 1);
    listChanged();
  }

  addButton.addEventListener("click", () => {
    if (spinning || entries.length >= WHEEL_LIMITS.max) return;
    let n = entries.length + 1;
    while (entries.includes(`Entrée ${n}`)) n++;
    entries.push(`Entrée ${n}`);
    listChanged();
    list.lastElementChild?.querySelector("input")?.focus?.();
  });

  removeInput.addEventListener("change", () => {
    if (spinning) { removeInput.checked = !removeInput.checked; return; }
    drawn = new Set();
    track(saveWheelRemoveDrawn(removeInput.checked));
    redrawWheel();
    renderDrawn();
  });

  resetButton.addEventListener("click", () => {
    if (spinning) return;
    drawn = new Set();
    redrawWheel();
    renderDrawn();
  });

  function showResult(entry) {
    result.textContent = entry;
    root.dataset.result = entry;
  }

  function finishSpin(target, entryIndex, entry) {
    rotation = target % 360;
    rotor.style.transform = `rotate(${rotation}deg)`;
    showResult(entry);
    if (removeInput.checked) drawn.add(entryIndex);
    spinning = false;
    root.dataset.spinning = "false";
    renderDrawn();
  }

  function spin() {
    if (spinning || root.dataset.ready !== "true") return; // touchers ignorés pendant la rotation
    // Les entrées retirées disparaissent de la roue au lancer suivant.
    if (shown.length !== currentEntries().length) redrawWheel();
    if (shown.length === 0) return;

    // Tirage AVANT l'animation.
    const picked = drawIndex(shown.length);
    const entry = shown[picked];
    const entryIndex = shownIndexes[picked];
    const turns = WHEEL_SPIN.minTurns + Math.floor(randomUnit() * (WHEEL_SPIN.maxTurns - WHEEL_SPIN.minTurns + 1));
    const target = stopRotation(rotation, picked, shown.length, { turns, offset: randomUnit() });
    root.dataset.picked = String(picked);
    root.dataset.target = String(target);

    spinning = true;
    root.dataset.spinning = "true";
    result.textContent = "";
    const reduced = prefersReducedMotion(root.ownerDocument.defaultView);
    if (reduced || typeof rotor.animate !== "function") {
      finishSpin(target, entryIndex, entry); // résultat direct, sans rotation
      return;
    }
    const animation = rotor.animate(
      [{ transform: `rotate(${rotation}deg)` }, { transform: `rotate(${target}deg)` }],
      { duration: WHEEL_SPIN.duration, easing: WHEEL_SPIN.easing, fill: "forwards" }
    );
    Promise.resolve(animation.finished)
      .catch(() => {})
      .then(() => {
        finishSpin(target, entryIndex, entry);
        animation.cancel?.(); // la position finale est portée par le style
      });
  }

  wheelButton.addEventListener("click", spin);
  spinButton.addEventListener("click", spin);

  loadWheelSettings()
    .catch((error) => {
      console.error("[wheel] Réglages non lus :", error);
      return { entries: null, removeDrawn: false };
    })
    .then((settings) => {
      entries = settings.entries ? [...settings.entries] : ["Joueur 1", "Joueur 2", "Joueur 3"];
      removeInput.checked = settings.removeDrawn;
      renderEntries();
      redrawWheel();
      renderDrawn();
      root.dataset.ready = "true";
    });

  return root;
}
