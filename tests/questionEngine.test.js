/* Non-régression Strict/Libre/currentQuestionId (sans filtre actif). */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetDatabase, mount, waitFor, mainIsReady, displayedQuestionId,
} from "./helpers.js";
import { createMainView } from "../js/features/questions/mainView.js";
import { getHistory } from "../js/data/historyRepository.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import {
  CURRENT_QUESTION_ID_KEY, SELECTION_MODE_KEY, RECENT_QUESTION_COUNT_KEY,
} from "../js/features/questions/questionEngine.js";

beforeEach(resetDatabase);

const mountMain = () => mount(createMainView, mainIsReady);
async function clickNext(view) {
  const button = view.querySelector(".question-next");
  button.click();
  await waitFor(() => !button.disabled);
}

test("montage : sélection + historique + currentQuestionId ; remontage : inchangé", async () => {
  let view = await mountMain();
  const first = displayedQuestionId(view);
  assert.ok(first >= 1);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), first);
  assert.equal((await getHistory()).length, 1);
  assert.match(view.querySelector(".mode-indicator").textContent, /Strict/);

  view = await mountMain();
  assert.equal(displayedQuestionId(view), first);
  assert.equal((await getHistory()).length, 1);
});

test("Strict : Suivante change la question, épuisement sans reset", async () => {
  const view = await mountMain();
  const seen = new Set([displayedQuestionId(view)]);
  for (let i = 0; i < 4; i++) {
    await clickNext(view);
    seen.add(displayedQuestionId(view));
  }
  assert.equal(seen.size, 5);
  await clickNext(view);
  assert.match(view.querySelector(".question-card").textContent, /toutes les questions disponibles/);
  assert.equal((await getHistory()).length, 5);
});

test("Libre : jamais bloqué, historique Strict intact", async () => {
  await mountMain(); // 1 entrée Strict
  await setSetting(SELECTION_MODE_KEY, "libre");
  await setSetting(RECENT_QUESTION_COUNT_KEY, 5);
  const view = await mountMain();
  assert.match(view.querySelector(".mode-indicator").textContent, /Libre/);
  for (let i = 0; i < 12; i++) {
    await clickNext(view);
    assert.ok(displayedQuestionId(view) >= 1);
  }
  const strict = (await getHistory()).filter((h) => h.mode === "strict");
  assert.equal(strict.length, 1);
});
