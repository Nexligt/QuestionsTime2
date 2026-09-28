import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetDatabase, mount, waitFor, mainIsReady, displayedQuestionId, BASE_QUESTIONS,
} from "./helpers.js";
import { createMainView } from "../js/features/questions/mainView.js";
import { createSettingsView } from "../js/features/settings/settingsView.js";
import { getHistory, recordQuestionViewed } from "../js/data/historyRepository.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import {
  CURRENT_QUESTION_ID_KEY, SELECTION_MODE_KEY, RECENT_QUESTION_COUNT_KEY,
  getRecentQuestionCount, setRecentQuestionCount, advanceToNextQuestion,
} from "../js/features/questions/questionEngine.js";

beforeEach(resetDatabase);

const section = (v) => v.querySelector('[data-setting="recent-question-count"]');
const mountSettings = () =>
  mount(createSettingsView, (v) => section(v) && !section(v).querySelector("input").disabled);
const field = (v) => section(v).querySelector(".settings-number__input");
async function enter(view, value) {
  field(view).value = value;
  field(view).dispatchEvent(new window.Event("change"));
  await waitFor(() => !field(view).disabled && section(view).querySelector(".settings-number__status").textContent);
}
const byMode = async (mode) => (await getHistory()).filter((h) => h.mode === mode);

/** N sélections Libre via le vrai moteur ; retourne les id dans l'ordre. */
async function runLibre(n, questions = BASE_QUESTIONS) {
  await setSetting(SELECTION_MODE_KEY, "libre");
  const ids = [];
  for (let i = 0; i < n; i++) {
    const result = await advanceToNextQuestion(questions);
    ids.push(result.question.id);
  }
  return ids;
}

test("1. valeur par défaut = 3 (affichée dans Paramètres)", async () => {
  assert.equal(await getSetting(RECENT_QUESTION_COUNT_KEY, null), null);
  assert.equal(await getRecentQuestionCount(), 3);
  const view = await mountSettings();
  assert.equal(field(view).value, "3");
});

test("2. lecture et sauvegarde (nombre dans settings)", async () => {
  let view = await mountSettings();
  await enter(view, "5");
  assert.equal(await getSetting(RECENT_QUESTION_COUNT_KEY), 5);
  assert.equal(await getRecentQuestionCount(), 5);

  view = await mountSettings();
  assert.equal(field(view).value, "5");

  await setRecentQuestionCount(10);
  assert.equal(await getRecentQuestionCount(), 10);
  await assert.rejects(() => setRecentQuestionCount(0));
});

test("3. Libre respecte 1 : jamais deux fois de suite, répétition possible ensuite", async () => {
  await setRecentQuestionCount(1);
  const ids = await runLibre(60);
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1]);
  assert.ok(ids.some((id, i) => i >= 2 && id === ids[i - 2]), "répétition après 1 autre question");
});

test("défaut 3 inchangé : jamais une des 3 dernières questions", async () => {
  const ids = await runLibre(40);
  for (let i = 1; i < ids.length; i++) {
    assert.ok(!ids.slice(Math.max(0, i - 3), i).includes(ids[i]));
  }
});

test("4. Libre respecte 5 : 5 questions différentes, puis reset Libre", async () => {
  await setRecentQuestionCount(5);
  const ids = await runLibre(5);
  assert.equal(new Set(ids).size, 5);
  assert.equal((await byMode("libre")).length, 5);

  await runLibre(1); // les 5 sont récentes -> reset Libre + nouvelle sélection
  assert.equal((await byMode("libre")).length, 1);
});

test("5-6. épuisement Libre : seul l'historique Libre est vidé, Strict intact", async () => {
  await recordQuestionViewed(1, "strict");
  await recordQuestionViewed(3, "strict");
  const strictBefore = await byMode("strict");

  await setRecentQuestionCount(5);
  const subset = BASE_QUESTIONS.slice(0, 2); // ex. résultat de filtres
  const ids = await runLibre(2, subset);
  assert.equal(new Set(ids).size, 2);

  const [third] = await runLibre(1, subset); // fenêtre (5) > questions compatibles (2)
  assert.ok(subset.some((q) => q.id === third));
  assert.deepEqual((await byMode("libre")).map((h) => h.questionId), [third]);
  assert.deepEqual(await byMode("strict"), strictBefore);
});

test("7. changer le réglage ne change ni la question, ni currentQuestionId, ni l'historique", async () => {
  let main = await mount(createMainView, mainIsReady);
  const shown = displayedQuestionId(main);
  const historyBefore = await getHistory();

  const view = await mountSettings();
  await enter(view, "1");
  assert.equal(await getRecentQuestionCount(), 1);

  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), shown);
  assert.deepEqual(await getHistory(), historyBefore);
  main = await mount(createMainView, mainIsReady);
  assert.equal(displayedQuestionId(main), shown);
  assert.deepEqual(await getHistory(), historyBefore);
});

test("8. Strict inchangé, quelle que soit la valeur", async () => {
  await setRecentQuestionCount(1);
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push((await advanceToNextQuestion(BASE_QUESTIONS)).question.id);
  assert.equal(new Set(ids).size, 5);
  const result = await advanceToNextQuestion(BASE_QUESTIONS);
  assert.equal(result.status, "strict-exhausted");
  assert.equal((await byMode("strict")).length, 5);
  assert.equal((await byMode("libre")).length, 0);
});
