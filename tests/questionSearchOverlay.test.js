/* Main : recherche d'une question dans une couche par-dessus la page. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor, mainIsReady, displayedQuestionId, BASE_QUESTIONS } from "./helpers.js";
import { createMainView } from "../js/features/questions/mainView.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import { setTagFilterStates } from "../js/data/filtersRepository.js";
import { CURRENT_QUESTION_ID_KEY } from "../js/features/questions/questionEngine.js";

beforeEach(async () => {
  await resetDatabase();
  document.querySelectorAll(".question-search").forEach((o) => o.remove());
});

const mountMain = () => mount(createMainView, (v) => mainIsReady(v) && !v.querySelector('[data-action="search"]').disabled);
const overlay = () => document.querySelector(".question-search");
const results = () => [...overlay().querySelectorAll(".question-search__item")].map((b) => Number(b.dataset.questionId));
function type(value) {
  const input = overlay().querySelector(".question-search__input");
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}

test("bouton de recherche à côté des autres, couche par-dessus Main avec toutes les questions", async () => {
  const v = await mountMain();
  const actions = [...v.querySelectorAll(".action-bar [data-action]")].map((b) => b.dataset.action);
  assert.deepEqual(actions, ["add", "search", "edit", "delete"]);
  v.querySelector('[data-action="search"]').click();
  assert.ok(overlay());
  assert.equal(overlay().getAttribute("role"), "dialog");
  assert.ok(v.isConnected); // Main reste dessous
  assert.equal(results().length, BASE_QUESTIONS.length);
});

test("même recherche que Supprimées : texte et ID", async () => {
  const v = await mountMain();
  v.querySelector('[data-action="search"]').click();
  type("B-3");
  assert.deepEqual(results(), [3]);
  const word = BASE_QUESTIONS[0].texte.split(" ").find((w) => w.length > 5);
  type(word.toUpperCase());
  assert.ok(results().includes(BASE_QUESTIONS[0].id));
  type("zzzz introuvable");
  assert.deepEqual(results(), []);
  assert.match(overlay().querySelector(".question-search__status").textContent, /Aucune question/);
});

test("toucher un résultat : couche fermée, question affichée et devenue courante", async () => {
  const v = await mountMain();
  const before = displayedQuestionId(v);
  const target = BASE_QUESTIONS.find((q) => q.id !== before).id;
  v.querySelector('[data-action="search"]').click();
  type(`B-${target}`);
  overlay().querySelector(".question-search__item").click();
  assert.equal(overlay(), null);
  await waitFor(() => displayedQuestionId(v) === target);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY, null), target);
});

test("la croix ferme la recherche sans rien changer", async () => {
  const v = await mountMain();
  const before = displayedQuestionId(v);
  v.querySelector('[data-action="search"]').click();
  type("B-1");
  overlay().querySelector(".question-search__close").click();
  assert.equal(overlay(), null);
  assert.equal(displayedQuestionId(v), before);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY, null), before);
});

test("filtres respectés : seules les questions compatibles sont proposées", async () => {
  const tag = BASE_QUESTIONS[0].tags[0];
  await setTagFilterStates({ [tag]: "excluded" });
  const v = await mountMain();
  v.querySelector('[data-action="search"]').click();
  const expected = BASE_QUESTIONS.filter((q) => !q.tags.includes(tag)).map((q) => q.id);
  assert.deepEqual(results(), expected);
});
