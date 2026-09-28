/*
  Deux affichages de Main quasi simultanés au tout premier lancement
  (ex. Main rendu sous le Splash puis « Accueil » aussitôt) : une seule
  sélection, une seule entrée d'historique, la même question partout.
*/
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, mainIsReady, displayedQuestionId, BASE_QUESTIONS } from "./helpers.js";
import { createMainView } from "../js/features/questions/mainView.js";
import { getHistory } from "../js/data/historyRepository.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import {
  getCurrentQuestion, advanceToNextQuestion, CURRENT_QUESTION_ID_KEY, SELECTION_MODE_KEY,
} from "../js/features/questions/questionEngine.js";

beforeEach(resetDatabase);

test("deux affichages de Main rapprochés au premier lancement : une seule question dans l'historique", async () => {
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY, null), null); // tout premier lancement
  const first = createMainView(); // rendu sous le Splash
  const second = createMainView(); // « Accueil » aussitôt après
  document.body.innerHTML = "";
  document.body.append(first, second);

  const start = Date.now();
  while (!(mainIsReady(first) && mainIsReady(second))) {
    if (Date.now() - start > 2000) throw new Error("Main jamais prêt");
    await new Promise((r) => setTimeout(r, 5));
  }

  const history = await getHistory();
  assert.equal(history.length, 1);
  assert.equal(displayedQuestionId(first), displayedQuestionId(second));
  assert.equal(history[0].questionId, displayedQuestionId(second));
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), displayedQuestionId(second));
});

for (const mode of ["strict", "libre"]) {
  test(`moteur (${mode}) : appels simultanés de getCurrentQuestion -> une seule sélection`, async () => {
    await setSetting(SELECTION_MODE_KEY, mode);
    const results = await Promise.all([
      getCurrentQuestion(BASE_QUESTIONS),
      getCurrentQuestion(BASE_QUESTIONS),
      getCurrentQuestion(BASE_QUESTIONS),
    ]);
    const ids = new Set(results.map((r) => r.question.id));
    assert.equal(ids.size, 1);
    const history = await getHistory();
    assert.deepEqual(history.map((h) => [h.questionId, h.mode]), [[[...ids][0], mode]]);
  });
}

test("les sélections restent ordonnées : Suivante pendant un affichage ne crée aucune entrée orpheline", async () => {
  const [shown, next] = await Promise.all([
    getCurrentQuestion(BASE_QUESTIONS),
    advanceToNextQuestion(BASE_QUESTIONS),
  ]);
  const history = await getHistory(); // plus récent en premier
  assert.deepEqual(history.map((h) => h.questionId), [next.question.id, shown.question.id]);
  assert.notEqual(next.question.id, shown.question.id); // Strict : jamais deux fois
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), next.question.id);
});
