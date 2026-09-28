/*
  Écran Paramètres : l'application réelle (js/app.js, routeur, menu
  inférieur) est démarrée dans jsdom, puis pilotée par des clics.
*/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { waitFor, mainIsReady, displayedQuestionId } from "./helpers.js";
import { getHistory } from "../js/data/historyRepository.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import {
  CURRENT_QUESTION_ID_KEY, SELECTION_MODE_KEY,
} from "../js/features/questions/questionEngine.js";

const root = () => document.getElementById("view-root");
const navButton = (view) => document.querySelector(`.nav-item[data-view="${view}"]`);
const modeInput = (value) => root().querySelector(`.settings-choice__input[value="${value}"]`);
const checkedMode = () => root().querySelector(".settings-choice__input:checked")?.value;

async function openMain() {
  navButton("main").click();
  await waitFor(() => root().querySelector(".view--main") && mainIsReady(root())
    && !root().querySelector(".mode-indicator").disabled);
}

async function openSettings() {
  navButton("settings").click();
  await waitFor(() => root().querySelector(".view--settings") && !modeInput("strict").disabled);
}

async function chooseMode(value) {
  modeInput(value).click();
  await waitFor(() => !modeInput(value).disabled && root().querySelector(".settings-choices").dataset.mode === value);
}

before(async () => {
  document.body.innerHTML =
    '<main id="view-root"></main><nav id="bottom-nav" hidden></nav>';
  window.matchMedia = () => ({ matches: false }); // absent de jsdom
  await import("../js/app.js");
  await waitFor(() => document.querySelectorAll(".nav-item").length === 4);
  // Lancement : le Splash est une couche au-dessus de Main (déjà rendu).
  await waitFor(() => document.querySelector(".splash-intro") && root().querySelector(".view--main"));
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" })); // passer le Splash
  await waitFor(() => !document.querySelector(".splash-intro"));
});

let shownId;
let historyBefore;

test("1. Paramètres s'ouvre depuis la navigation", async () => {
  await openMain();
  shownId = displayedQuestionId(root());
  historyBefore = await getHistory();

  await openSettings();
  assert.equal(window.location.hash, "#/settings");
  assert.equal(document.getElementById("bottom-nav").hidden, false);
  assert.equal(navButton("settings").getAttribute("aria-current"), "page");
  assert.equal(root().querySelector("h1").textContent, "Paramètres");
  assert.ok(root().querySelector('.settings-section[data-setting="selection-mode"]'));
});

test("2. affiche le mode réellement enregistré", async () => {
  assert.equal(checkedMode(), "strict"); // défaut
  await setSetting(SELECTION_MODE_KEY, "libre");
  await openMain();
  await openSettings();
  assert.equal(checkedMode(), "libre");
});

test("3. changement Libre -> Strict -> Libre enregistré immédiatement", async () => {
  await chooseMode("strict");
  assert.equal(await getSetting(SELECTION_MODE_KEY), "strict");
  assert.equal(checkedMode(), "strict");

  await chooseMode("libre");
  assert.equal(await getSetting(SELECTION_MODE_KEY), "libre");
  assert.equal(checkedMode(), "libre");
});

test("4. retour sur Main : même question, mode à jour", async () => {
  await openMain();
  assert.equal(displayedQuestionId(root()), shownId);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), shownId);
  assert.equal(root().querySelector(".mode-indicator").textContent, "Mode : Libre");
});

test("5. aucun changement d'historique", async () => {
  assert.deepEqual(await getHistory(), historyBefore);
});

test("6. régression : le bouton de mode de Main fonctionne toujours et Paramètres le reflète", async () => {
  const button = root().querySelector(".mode-indicator");
  button.click();
  await waitFor(() => !button.disabled && button.textContent === "Mode : Strict");
  assert.equal(await getSetting(SELECTION_MODE_KEY), "strict");
  assert.equal(displayedQuestionId(root()), shownId);

  await openSettings();
  assert.equal(checkedMode(), "strict");
  assert.deepEqual(await getHistory(), historyBefore);
});
