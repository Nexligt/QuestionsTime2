/*
  Réinitialisation de l'historique Strict depuis Paramètres :
  application réelle (js/app.js) démarrée dans jsdom et pilotée par clics.
*/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { waitFor, mainIsReady, displayedQuestionId } from "./helpers.js";
import { getHistory, recordQuestionViewed } from "../js/data/historyRepository.js";
import { getSetting } from "../js/data/settingsRepository.js";
import {
  CURRENT_QUESTION_ID_KEY, SELECTION_MODE_KEY,
} from "../js/features/questions/questionEngine.js";

const root = () => document.getElementById("view-root");
const navButton = (view) => document.querySelector(`.nav-item[data-view="${view}"]`);
const q = (selector) => root().querySelector(selector);

async function openMain() {
  navButton("main").click();
  await waitFor(() => q(".view--main") && mainIsReady(root()) && !q(".mode-indicator").disabled);
}

async function openSettings() {
  navButton("settings").click();
  await waitFor(() => q(".view--settings") && q(".settings-reset__button"));
}

async function clickNext() {
  const button = q(".question-next");
  button.click();
  await waitFor(() => !button.disabled);
}

const strictIds = async () =>
  (await getHistory()).filter((h) => h.mode === "strict").map((h) => h.questionId);
const libreEntries = async () => (await getHistory()).filter((h) => h.mode === "libre");

let shownId;
let libreBefore;
let seenBefore;

before(async () => {
  document.body.innerHTML = '<main id="view-root"></main><nav id="bottom-nav" hidden></nav>';
  window.matchMedia = () => ({ matches: false });
  await import("../js/app.js");
  await waitFor(() => document.querySelectorAll(".nav-item").length === 4);

  // Mode Strict (défaut) : les 5 questions vues, puis épuisement.
  await openMain();
  for (let i = 0; i < 4; i++) await clickNext();
  // Entrées Libre préexistantes, qui doivent survivre au reset.
  await recordQuestionViewed(2, "libre");
  await recordQuestionViewed(4, "libre");

  shownId = displayedQuestionId(root());
  seenBefore = await strictIds();
  libreBefore = await libreEntries();
  assert.equal(new Set(seenBefore).size, 5);
});

test("le bouton indique clairement l'historique Strict et demande confirmation", async () => {
  await openSettings();
  const button = q(".settings-reset__button");
  assert.match(button.textContent, /historique Strict/);
  assert.equal(q(".settings-reset__confirm").hidden, true);

  button.click();
  assert.equal(q(".settings-reset__confirm").hidden, false);
  assert.equal(button.hidden, true);

  // Annuler : rien n'est supprimé.
  q(".settings-reset__cancel-button").click();
  assert.equal(q(".settings-reset__confirm").hidden, true);
  assert.equal(button.hidden, false);
  assert.deepEqual(await strictIds(), seenBefore);
});

test("1-2. confirmation : historique Strict supprimé, historique Libre intact", async () => {
  q(".settings-reset__button").click();
  q(".settings-reset__confirm-button").click();
  await waitFor(() => q(".settings-reset__status").dataset.status === "done");

  assert.deepEqual(await strictIds(), []);
  assert.deepEqual(await libreEntries(), libreBefore);
  assert.match(q(".settings-reset__status").textContent, /réinitialisé/);
});

test("3-4. currentQuestionId et selectionMode inchangés", async () => {
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), shownId);
  assert.equal(await getSetting(SELECTION_MODE_KEY, "strict"), "strict");
});

test("5. retour sur Main : même question affichée", async () => {
  await openMain();
  assert.equal(displayedQuestionId(root()), shownId);
  assert.equal(q(".mode-indicator").textContent, "Mode : Strict");
  assert.deepEqual(await strictIds(), []); // simple remontage : aucune écriture
});

test("6. après reset, Strict peut de nouveau proposer des questions déjà vues", async () => {
  // Avant le reset, un "Suivante" aurait donné l'épuisement Strict.
  const reselected = new Set();
  for (let i = 0; i < 5; i++) {
    await clickNext();
    const id = displayedQuestionId(root());
    assert.ok(id !== null, "une question doit être proposée, pas l'épuisement");
    reselected.add(id);
  }
  assert.equal(reselected.size, 5);
  for (const id of reselected) assert.ok(seenBefore.includes(id));
  assert.deepEqual(await libreEntries(), libreBefore);
});
