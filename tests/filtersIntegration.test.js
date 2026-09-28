import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetDatabase, mount, waitFor, mainIsReady, displayedQuestionId,
} from "./helpers.js";
import { createMainView } from "../js/features/questions/mainView.js";
import { createFiltersView } from "../js/features/filters/filtersView.js";
import { getTagFilterStates, setTagFilterStates } from "../js/data/filtersRepository.js";
import { getHistory } from "../js/data/historyRepository.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import {
  CURRENT_QUESTION_ID_KEY, SELECTION_MODE_KEY,
} from "../js/features/questions/questionEngine.js";

beforeEach(resetDatabase);

const mountMain = () => mount(createMainView, mainIsReady);
const mountFilters = () =>
  mount(createFiltersView, (v) => !v.querySelector(".filters-search__input").disabled);
const tagButton = (view, tag) => view.querySelector(`.filter-tag[data-tag="${tag}"]`);

async function clickNext(view) {
  const button = view.querySelector(".question-next");
  button.click();
  await waitFor(() => !button.disabled);
}

test("4. vue Filtres : la recherche filtre la liste des tags", async () => {
  const view = await mountFilters();
  const input = view.querySelector(".filters-search__input");
  assert.equal(view.querySelectorAll(".filter-tag").length, 5);

  input.value = "souv";
  input.dispatchEvent(new window.Event("input"));
  assert.deepEqual(
    [...view.querySelectorAll(".filter-tag")].map((b) => b.dataset.tag),
    ["Souvenir"]
  );

  input.value = "xyz";
  input.dispatchEvent(new window.Event("input"));
  assert.equal(view.querySelectorAll(".filter-tag").length, 0);
  assert.match(view.querySelector(".filters-tags").textContent, /Aucun tag trouvé/);
});

test("6. persistance : clics cycliques enregistrés puis relus au remontage", async () => {
  let view = await mountFilters();
  tagButton(view, "Réflexion").click(); // neutre -> obligatoire
  tagButton(view, "Voyage").click(); // neutre -> obligatoire
  tagButton(view, "Voyage").click(); // obligatoire -> exclu
  await new Promise((r) => setTimeout(r, 50)); // fin des écritures

  assert.deepEqual(await getTagFilterStates(), { Réflexion: "required", Voyage: "excluded" });

  view = await mountFilters(); // "rechargement" de la vue
  assert.equal(tagButton(view, "Réflexion").dataset.state, "required");
  assert.equal(tagButton(view, "Voyage").dataset.state, "excluded");
  assert.equal(tagButton(view, "Souvenir").dataset.state, "neutral");
  assert.match(view.querySelector(".filters-summary").textContent, /2 question\(s\) compatible\(s\) sur 5/);

  tagButton(view, "Voyage").click(); // exclu -> neutre (retiré du stockage)
  await new Promise((r) => setTimeout(r, 50)); // fin des écritures
  assert.deepEqual(await getTagFilterStates(), { Réflexion: "required" });
});

test("7. Strict : le moteur ne reçoit que les questions filtrées", async () => {
  await setTagFilterStates({ Voyage: "required" }); // seule la question 1
  const view = await mountMain();
  assert.equal(displayedQuestionId(view), 1);

  // Si le moteur recevait les 5 questions, "Suivante" en proposerait une autre.
  await clickNext(view);
  assert.match(view.querySelector(".question-card").textContent, /toutes les questions disponibles/);
  const history = await getHistory();
  assert.deepEqual(history.map((h) => h.questionId), [1]);
});

test("7. Libre : toutes les sélections restent dans les questions filtrées", async () => {
  await setSetting(SELECTION_MODE_KEY, "libre");
  await setTagFilterStates({ Réflexion: "required" }); // questions 2 et 4
  const view = await mountMain();
  const seen = new Set([displayedQuestionId(view)]);
  for (let i = 0; i < 15; i++) {
    await clickNext(view);
    seen.add(displayedQuestionId(view));
  }
  assert.deepEqual([...seen].sort(), [2, 4]);
  for (const entry of await getHistory()) assert.ok([2, 4].includes(entry.questionId));
});

test("filtres conservés après Suivante et retour sur Main ; currentQuestionId respecté", async () => {
  await setTagFilterStates({ Souvenir: "excluded" }); // seule la question 2
  let view = await mountMain();
  assert.equal(displayedQuestionId(view), 2);

  view = await mountMain(); // retour sur Main : même question, pas de nouvelle entrée
  assert.equal(displayedQuestionId(view), 2);
  assert.equal((await getHistory()).length, 1);
  assert.deepEqual(await getTagFilterStates(), { Souvenir: "excluded" });
});

test("question courante devenue incompatible -> nouvelle question compatible", async () => {
  await setSetting(CURRENT_QUESTION_ID_KEY, 1);
  await setTagFilterStates({ Voyage: "excluded" });
  const view = await mountMain();
  assert.notEqual(displayedQuestionId(view), 1);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), displayedQuestionId(view));
});

test("5. aucun résultat compatible : message, pas d'erreur, rien d'écrit", async () => {
  await setSetting(CURRENT_QUESTION_ID_KEY, 3);
  await setTagFilterStates({ Voyage: "required", Réflexion: "required" });
  const view = await mountMain();

  assert.match(view.querySelector(".question-card").textContent, /Aucune question ne correspond aux filtres actifs/);
  assert.equal(view.querySelector(".question-next").disabled, true);
  assert.equal((await getHistory()).length, 0);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), 3);

  const filters = await mountFilters();
  assert.match(filters.querySelector(".filters-summary").textContent, /Aucune question ne correspond/);
});

test("tag enregistré mais disparu des questions : ignoré", async () => {
  await setTagFilterStates({ TagSupprimé: "required" });
  const view = await mountMain();
  assert.ok(displayedQuestionId(view) >= 1);
});
