/* Champ de saisie de l'intervalle de répétition Libre (Paramètres). */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor, mainIsReady, displayedQuestionId } from "./helpers.js";
import { createMainView } from "../js/features/questions/mainView.js";
import { createSettingsView } from "../js/features/settings/settingsView.js";
import { getHistory } from "../js/data/historyRepository.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import {
  CURRENT_QUESTION_ID_KEY, RECENT_QUESTION_COUNT_KEY, SELECTION_MODE_KEY,
  getRecentQuestionCount, parseRecentQuestionCount,
} from "../js/features/questions/questionEngine.js";

beforeEach(resetDatabase);

const section = (v) => v.querySelector('[data-setting="recent-question-count"]');
const field = (v) => section(v).querySelector(".settings-number__input");
const status = (v) => section(v).querySelector(".settings-number__status");
const mountSettings = () => mount(createSettingsView, (v) => section(v) && !field(v).disabled);

async function enter(view, value) {
  status(view).textContent = "";
  field(view).value = value;
  field(view).dispatchEvent(new window.Event("change"));
  await waitFor(() => !field(view).disabled && status(view).textContent !== "");
}

test("champ numérique mobile, valeur par défaut 3, plus de choix fixes", async () => {
  const view = await mountSettings();
  assert.equal(field(view).type, "number");
  assert.equal(field(view).inputMode, "numeric");
  assert.equal(field(view).value, "3");
  assert.equal(section(view).querySelectorAll('input[type="radio"]').length, 0);
});

test("4. une valeur valide est enregistrée (ex. 7, 42)", async () => {
  const view = await mountSettings();
  await enter(view, "7");
  assert.equal(await getSetting(RECENT_QUESTION_COUNT_KEY), 7);
  assert.equal(status(view).dataset.status, "saved");
  await enter(view, "42");
  assert.equal(await getRecentQuestionCount(), 42);
  assert.equal(field(view).value, "42");
});

test("5. valeur vide / invalide / non positive refusée, dernière valeur valide conservée", async () => {
  const view = await mountSettings();
  await enter(view, "8");
  for (const bad of ["", "0", "-2", "2.5", "abc", "1e3"]) {
    await enter(view, bad);
    assert.equal(status(view).dataset.status, "error", `refus de "${bad}"`);
    assert.equal(field(view).value, "8");
    assert.equal(await getSetting(RECENT_QUESTION_COUNT_KEY), 8);
  }
  assert.equal(parseRecentQuestionCount("12"), 12);
  assert.equal(parseRecentQuestionCount("0"), null);
});

test("6. Réinitialiser remet et enregistre 3", async () => {
  await setSetting(RECENT_QUESTION_COUNT_KEY, 15);
  let view = await mountSettings();
  assert.equal(field(view).value, "15");

  section(view).querySelector(".settings-number__reset").click();
  await waitFor(() => !field(view).disabled && status(view).dataset.status === "saved");
  assert.equal(field(view).value, "3");
  assert.equal(await getSetting(RECENT_QUESTION_COUNT_KEY), 3);

  view = await mountSettings();
  assert.equal(field(view).value, "3");
});

test("7. changer la valeur ne modifie ni currentQuestionId, ni la question, ni l'historique ; utilisée au Suivante suivant", async () => {
  await setSetting(SELECTION_MODE_KEY, "libre");
  let main = await mount(createMainView, mainIsReady);
  const shown = displayedQuestionId(main);
  const historyBefore = await getHistory();

  const view = await mountSettings();
  await enter(view, "4");
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), shown);
  assert.deepEqual(await getHistory(), historyBefore);

  main = await mount(createMainView, mainIsReady);
  assert.equal(displayedQuestionId(main), shown);

  // Au prochain "Suivante", fenêtre de 4 : 4 questions distinctes d'affilée.
  const ids = [shown];
  for (let i = 0; i < 3; i++) {
    const button = main.querySelector(".question-next");
    button.click();
    await waitFor(() => !button.disabled);
    ids.push(displayedQuestionId(main));
  }
  assert.equal(new Set(ids).size, 4);
});
