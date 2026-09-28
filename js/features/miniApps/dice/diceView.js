/*
  diceView.js
  Mini-application « Dés » (onglet Mini-apps des Paramètres) :
  réglages (nombre de dés, faces, animation), bouton « Lancer »,
  résultats et total. Réglages mémorisés dans le store `settings`.
*/

import {
  DICE_COUNT,
  DICE_FACES,
  FACE_PRESETS,
  clampDiceCount,
  loadDiceSettings,
  parseFaces,
  rollDice,
  saveDiceAnimation,
  saveDiceCount,
  saveDiceFaces,
} from "./dice.js";
import { createDie } from "./dieShape.js";
import { prefersReducedMotion, showDiceRoll } from "./diceRollOverlay.js";

let diceCounter = 0;

/**
 * @param {string} labelledBy - id du titre de la carte.
 * @returns {HTMLElement}
 */
export function buildDiceApp(labelledBy) {
  const uid = ++diceCounter;
  const root = document.createElement("div");
  root.className = "dice-app";
  root.setAttribute("aria-labelledby", labelledBy);
  root.dataset.ready = "false";
  root.dataset.saves = "0";

  // --- Nombre de dés ------------------------------------------------------
  const countField = document.createElement("div");
  countField.className = "settings-number";
  const countLabel = document.createElement("label");
  countLabel.className = "settings-choice__label";
  countLabel.htmlFor = `dice-count-${uid}`;
  countLabel.textContent = `Nombre de dés (${DICE_COUNT.min} à ${DICE_COUNT.max})`;
  const countInput = document.createElement("input");
  countInput.id = `dice-count-${uid}`;
  countInput.type = "number";
  countInput.inputMode = "numeric";
  countInput.min = String(DICE_COUNT.min);
  countInput.max = String(DICE_COUNT.max);
  countInput.step = "1";
  countInput.className = "settings-number__input dice-app__count";
  countInput.value = String(DICE_COUNT.default);
  countField.append(countLabel, countInput);

  // --- Nombre de faces ------------------------------------------------------
  const facesField = document.createElement("div");
  facesField.className = "dice-app__faces";
  const facesLabel = document.createElement("p");
  facesLabel.className = "settings-choice__label dice-app__label";
  facesLabel.id = `dice-faces-label-${uid}`;
  facesLabel.textContent = "Nombre de faces";
  const presets = document.createElement("div");
  presets.className = "settings-choices settings-segmented dice-app__presets";
  presets.setAttribute("role", "radiogroup");
  presets.setAttribute("aria-labelledby", facesLabel.id);
  for (const faces of FACE_PRESETS) {
    const label = document.createElement("label");
    label.className = "settings-choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `dice-faces-${uid}`;
    input.value = String(faces);
    input.className = "settings-choice__input";
    input.checked = faces === DICE_FACES.default;
    const text = document.createElement("span");
    text.className = "settings-choice__text";
    const name = document.createElement("span");
    name.className = "settings-choice__label";
    name.textContent = String(faces);
    text.append(name);
    label.append(input, text);
    presets.append(label);
  }
  const otherRow = document.createElement("div");
  otherRow.className = "dice-app__other";
  const otherLabel = document.createElement("label");
  otherLabel.htmlFor = `dice-faces-other-${uid}`;
  otherLabel.textContent = `Autre (${DICE_FACES.min} à ${DICE_FACES.max})`;
  const otherInput = document.createElement("input");
  otherInput.id = `dice-faces-other-${uid}`;
  otherInput.type = "number";
  otherInput.inputMode = "numeric";
  otherInput.min = String(DICE_FACES.min);
  otherInput.max = String(DICE_FACES.max);
  otherInput.step = "1";
  otherInput.placeholder = "—";
  otherInput.className = "settings-number__input dice-app__faces-other";
  otherRow.append(otherLabel, otherInput);
  const facesStatus = document.createElement("p");
  facesStatus.className = "settings-number__status";
  facesStatus.setAttribute("aria-live", "polite");
  facesField.append(facesLabel, presets, otherRow, facesStatus);

  // --- Animation ------------------------------------------------------------
  const animationLabel = document.createElement("label");
  animationLabel.className = "settings-choice";
  const animationInput = document.createElement("input");
  animationInput.type = "checkbox";
  animationInput.className = "settings-choice__input dice-app__animation";
  animationInput.checked = true;
  const animationText = document.createElement("span");
  animationText.className = "settings-choice__text";
  const animationName = document.createElement("span");
  animationName.className = "settings-choice__label";
  animationName.textContent = "Animation du lancer";
  const animationDescription = document.createElement("span");
  animationDescription.className = "settings-choice__description";
  animationDescription.textContent = "Désactivée : résultat direct.";
  animationText.append(animationName, animationDescription);
  animationLabel.append(animationInput, animationText);

  // --- Lancer et résultats ------------------------------------------------
  const rollButton = document.createElement("button");
  rollButton.type = "button";
  rollButton.className = "button dice-app__roll";
  rollButton.textContent = "Lancer";
  rollButton.disabled = true; // réactivé une fois les réglages lus

  const results = document.createElement("div");
  results.className = "dice-app__results";
  results.setAttribute("aria-live", "polite");
  results.hidden = true;
  const diceList = document.createElement("ul");
  diceList.className = "dice-app__dice";
  diceList.setAttribute("aria-label", "Résultats");
  const total = document.createElement("p");
  total.className = "dice-app__total";
  results.append(diceList, total);

  root.append(countField, facesField, animationLabel, rollButton, results);

  // --- État -----------------------------------------------------------------
  let faces = DICE_FACES.default;

  function track(promise) {
    promise
      .then(() => { root.dataset.saves = String(Number(root.dataset.saves) + 1); })
      .catch((error) => console.error("[dice] Réglage non enregistré :", error));
  }

  function showFaces(value) {
    faces = value;
    const preset = FACE_PRESETS.includes(value);
    for (const input of presets.querySelectorAll("input")) input.checked = Number(input.value) === value;
    if (preset) otherInput.value = "";
    else otherInput.value = String(value);
    otherInput.removeAttribute("aria-invalid");
    facesStatus.textContent = "";
  }

  countInput.addEventListener("change", () => {
    const count = clampDiceCount(countInput.value);
    countInput.value = String(count);
    track(saveDiceCount(count));
  });

  presets.addEventListener("change", (event) => {
    const value = parseFaces(event.target.value);
    if (value === null) return;
    showFaces(value);
    track(saveDiceFaces(value));
  });

  otherInput.addEventListener("change", () => {
    if (otherInput.value.trim() === "") { showFaces(faces); return; }
    const value = parseFaces(otherInput.value);
    if (value === null) {
      otherInput.setAttribute("aria-invalid", "true");
      facesStatus.textContent = `Nombre entier de ${DICE_FACES.min} à ${DICE_FACES.max}.`;
      return;
    }
    showFaces(value);
    track(saveDiceFaces(value));
  });

  animationInput.addEventListener("change", () => track(saveDiceAnimation(animationInput.checked)));

  rollButton.addEventListener("click", () => {
    const { values, total: sum } = rollDice(countInput.value, faces);
    diceList.replaceChildren(...values.map((value) => {
      const item = document.createElement("li");
      item.append(createDie(value, faces));
      return item;
    }));
    total.textContent = `Total : ${sum}`;
    results.hidden = false;
    if (animationInput.checked && !prefersReducedMotion(root.ownerDocument.defaultView)) {
      showDiceRoll({ values, faces, container: root.ownerDocument.body, returnFocus: rollButton });
    }
  });

  loadDiceSettings()
    .then((settings) => {
      countInput.value = String(settings.count);
      showFaces(settings.faces);
      animationInput.checked = settings.animation;
    })
    .catch((error) => console.error("[dice] Réglages non lus :", error))
    .finally(() => {
      rollButton.disabled = false;
      root.dataset.ready = "true";
    });

  return root;
}
