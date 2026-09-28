/*
  Modification d'une question de base = override local de même id positif
  dans `questionsUser`. Application réelle (js/app.js) pilotée par clics.
*/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { waitFor, mainIsReady, displayedQuestionId, BASE_QUESTIONS } from "./helpers.js";
import { openDatabase, STORES } from "../js/data/db.js";
import {
  createLocalQuestion, getLocalQuestions, getBaseQuestions, getAvailableQuestions,
  getBaseQuestionOverrides, saveBaseQuestionOverride,
} from "../js/data/questionsRepository.js";
import { getHistory, recordQuestionViewed } from "../js/data/historyRepository.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import { getTagFilterStates, setTagFilterStates } from "../js/data/filtersRepository.js";
import {
  CURRENT_QUESTION_ID_KEY, SELECTION_MODE_KEY,
} from "../js/features/questions/questionEngine.js";

const BASE_JSON = new URL("../data/questions.base.json", import.meta.url);
const baseFileBefore = readFileSync(BASE_JSON, "utf-8");
const ORIGINAL_3 = BASE_QUESTIONS.find((x) => x.id === 3);

const root = () => document.getElementById("view-root");
const q = (s) => root().querySelector(s);
const navButton = (view) => document.querySelector(`.nav-item[data-view="${view}"]`);
const editButton = () => q('.action-bar [data-action="edit"]');
const chosenTags = () => [...root().querySelectorAll(".question-form__tag")].map((b) => b.dataset.tag);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openMain() {
  navButton("settings").click(); // quitter Main pour forcer un remontage
  await waitFor(() => q(".view--settings"));
  navButton("main").click();
  await waitFor(() => q(".view--main") && mainIsReady(root()) && !q(".mode-indicator").disabled);
}

async function openEditor() {
  editButton().click();
  await waitFor(() => q(".view--question-edit") && !q(".question-form__submit").disabled);
}

function type(el, value) {
  el.value = value;
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}

const submit = () =>
  q(".question-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

async function allStored() {
  const db = await openDatabase();
  return new Promise((resolve) => {
    const r = db.transaction(STORES.QUESTIONS_USER).objectStore(STORES.QUESTIONS_USER).getAll();
    r.onsuccess = () => resolve(r.result);
  });
}

async function snapshot() {
  return {
    history: await getHistory(),
    currentQuestionId: await getSetting(CURRENT_QUESTION_ID_KEY),
    mode: await getSetting(SELECTION_MODE_KEY, "strict"),
    filters: await getTagFilterStates(),
    locals: await getLocalQuestions(),
  };
}

let state0;
const local1 = { texte: "Question locale", tags: ["Perso"], author: "Zoé" };

before(async () => {
  await createLocalQuestion(local1); // -1
  await recordQuestionViewed(3, "strict");
  await setSetting(CURRENT_QUESTION_ID_KEY, 3);
  await setSetting(SELECTION_MODE_KEY, "libre");
  await setTagFilterStates({ Voyage: "excluded" });

  document.body.innerHTML = '<main id="view-root"></main><nav id="bottom-nav" hidden></nav>';
  window.matchMedia = () => ({ matches: false });
  await import("../js/app.js");
  await waitFor(() => document.querySelectorAll(".nav-item").length === 4);
  await openMain();
  assert.equal(displayedQuestionId(root()), 3);
  state0 = await snapshot();
});

test("1. Modifier est actif sur une question de base et ouvre le formulaire", async () => {
  assert.equal(editButton().disabled, false);
  await openEditor();
  assert.equal(window.location.hash, "#/question-edit");
  assert.equal(q(".question-form__title").textContent, "Modifier la question");
  assert.equal(q(".question-form__id").textContent, "Question B-3");
});

test("2. formulaire prérempli avec la question de base affichée", () => {
  assert.equal(q('textarea[name="texte"]').value, ORIGINAL_3.texte);
  assert.equal(q('input[name="author"]').value, ORIGINAL_3.author);
  assert.deepEqual(chosenTags(), ORIGINAL_3.tags);
});

test("10. Annuler ne modifie rien", async () => {
  type(q('textarea[name="texte"]'), "Brouillon abandonné");
  q(".question-form__cancel").click();
  await waitFor(() => q(".view--main") && mainIsReady(root()));
  assert.deepEqual(await getBaseQuestionOverrides(), []);
  assert.equal(q(".question-card__text").textContent, ORIGINAL_3.texte);
  assert.deepEqual(await snapshot(), state0);
});

test("3-4. la modification crée un override de même id positif, sans id négatif", async () => {
  await openEditor();
  type(q('textarea[name="texte"]'), "Quel compliment t'a le plus marqué, et pourquoi ?");
  type(q('input[name="author"]'), "Léo");
  q('.question-form__tag[data-tag="Souvenir"]').click();
  type(q('input[name="tag"]'), "Fierté");
  q(".question-form__add-tag").click();
  submit();
  await waitFor(() => q(".view--main") && mainIsReady(root()));

  assert.deepEqual(await getBaseQuestionOverrides(), [
    { id: 3, texte: "Quel compliment t'a le plus marqué, et pourquoi ?", tags: ["Émotion", "Fierté"], author: "Léo" },
  ]);
  const ids = (await allStored()).map((x) => x.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [-1, 3]); // aucun nouvel id négatif
});

test("5. questions.base.json et la base chargée restent inchangés", async () => {
  assert.equal(readFileSync(BASE_JSON, "utf-8"), baseFileBefore);
  assert.deepEqual(await getBaseQuestions(), BASE_QUESTIONS);
  assert.deepEqual((await getBaseQuestions()).find((x) => x.id === 3), ORIGINAL_3);
});

test("6. une seule question pour cet id dans la liste", async () => {
  const available = await getAvailableQuestions();
  assert.equal(available.filter((x) => x.id === 3).length, 1);
  assert.equal(available.length, BASE_QUESTIONS.length + 1);
  assert.equal(available.find((x) => x.id === 3).texte, "Quel compliment t'a le plus marqué, et pourquoi ?");
  assert.deepEqual(available.map((x) => x.id), [...BASE_QUESTIONS.map((x) => x.id), -1]); // ordre conservé
});

test("7 & 9. override affiché immédiatement sur Main, toujours B-3", async () => {
  assert.equal(displayedQuestionId(root()), 3);
  assert.equal(q(".question-card__id").textContent, "B-3");
  assert.equal(q(".question-card__text").textContent, "Quel compliment t'a le plus marqué, et pourquoi ?");
  assert.deepEqual([...root().querySelectorAll(".question-card__tags .tag-chip")].map((t) => t.textContent), ["Émotion", "Fierté"]);
});

test("8. modifier à nouveau remplace l'override sans doublon (formulaire prérempli par l'override)", async () => {
  await openEditor();
  assert.equal(q('textarea[name="texte"]').value, "Quel compliment t'a le plus marqué, et pourquoi ?");
  assert.equal(q('input[name="author"]').value, "Léo");
  assert.deepEqual(chosenTags(), ["Émotion", "Fierté"]);
  type(q('textarea[name="texte"]'), "Version 3");
  submit();
  await waitFor(() => q(".view--main") && mainIsReady(root()));

  const stored = await allStored();
  assert.equal(stored.filter((x) => x.id === 3).length, 1);
  assert.equal(stored.length, 2);
  assert.equal((await getBaseQuestionOverrides())[0].texte, "Version 3");
  assert.equal(q(".question-card__text").textContent, "Version 3");
  assert.equal(q(".question-card__id").textContent, "B-3");
});

test("11-12. mode, historique, filtres, currentQuestionId et questions locales inchangés", async () => {
  assert.deepEqual(await snapshot(), state0);
  assert.deepEqual(await getLocalQuestions(), [{ id: -1, ...local1 }]);
  assert.equal(q(".mode-indicator").textContent, "Mode : Libre");
});

test("les id locaux continuent à -2 ; l'override ne compte pas comme question locale", async () => {
  const created = await createLocalQuestion({ texte: "Nouvelle", tags: ["X"], author: "Léo" });
  assert.equal(created.id, -2);
  await assert.rejects(() => saveBaseQuestionOverride(99, local1)); // id de base inconnu
  await assert.rejects(() => saveBaseQuestionOverride(-1, local1)); // jamais pour un id local
  assert.equal((await allStored()).filter((x) => x.id === 3).length, 1);
});
