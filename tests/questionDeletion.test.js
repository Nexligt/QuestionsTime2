/*
  Suppression / restauration : questions locales (définitif), questions de
  base (questionsDeleted, restaurables) et overrides. Application réelle
  (js/app.js) pilotée par clics.
*/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { waitFor, mainIsReady, displayedQuestionId, BASE_QUESTIONS } from "./helpers.js";
import {
  createLocalQuestion, getLocalQuestions, getBaseQuestions, getAvailableQuestions,
  getBaseQuestionOverrides, saveBaseQuestionOverride, getDeletedQuestionEntries,
  getDeletedBaseQuestions, deleteQuestion,
} from "../js/data/questionsRepository.js";
import { getHistory, recordQuestionViewed } from "../js/data/historyRepository.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import { getTagFilterStates } from "../js/data/filtersRepository.js";
import {
  CURRENT_QUESTION_ID_KEY, SELECTION_MODE_KEY,
} from "../js/features/questions/questionEngine.js";

const BASE_JSON = new URL("../data/questions.base.json", import.meta.url);
const baseFileBefore = readFileSync(BASE_JSON, "utf-8");

const root = () => document.getElementById("view-root");
const q = (s) => root().querySelector(s);
const navButton = (view) => document.querySelector(`.nav-item[data-view="${view}"]`);
const deleteButton = () => q('.action-bar [data-action="delete"]');
const availableIds = async () => (await getAvailableQuestions()).map((x) => x.id);
const localIds = async () => (await getLocalQuestions()).map((x) => x.id).sort((a, b) => b - a);

async function openMain() {
  navButton("settings").click(); // quitter Main pour forcer un remontage
  await waitFor(() => q(".view--settings"));
  navButton("main").click();
  await waitFor(() => q(".view--main") && mainIsReady(root()) && !q(".mode-indicator").disabled);
}

async function showOnMain(id) {
  await setSetting(CURRENT_QUESTION_ID_KEY, id);
  await openMain();
  assert.equal(displayedQuestionId(root()), id);
}

/** Supprime la question affichée via le bouton + la confirmation. */
async function deleteDisplayed() {
  const shown = displayedQuestionId(root());
  deleteButton().click();
  assert.equal(q(".delete-confirm").hidden, false);
  q(".delete-confirm__confirm").click();
  await waitFor(() => {
    const main = q(".view--main");
    return main && mainIsReady(root()) && displayedQuestionId(root()) !== shown;
  });
}

async function openDeleted() {
  navButton("deleted-questions").click();
  await waitFor(() => q(".view--deleted")?.dataset.ready === "true");
}

const OVERRIDE_3 = { texte: "Compliment (version modifiée)", tags: ["Émotion"], author: "Léo" };

before(async () => {
  for (const n of [1, 2, 3]) {
    await createLocalQuestion({ texte: `Locale ${n}`, tags: ["Perso"], author: "Zoé" }); // -1, -2, -3
  }
  await saveBaseQuestionOverride(3, OVERRIDE_3);
  await recordQuestionViewed(1, "strict");
  await recordQuestionViewed(-2, "strict");
  await recordQuestionViewed(2, "libre");

  document.body.innerHTML = '<main id="view-root"></main><nav id="bottom-nav" hidden></nav>';
  window.matchMedia = () => ({ matches: false });
  await import("../js/app.js");
  await waitFor(() => document.querySelectorAll(".nav-item").length === 4);
});

test("Annuler la confirmation ne supprime rien", async () => {
  await showOnMain(-2);
  deleteButton().click();
  assert.match(q(".delete-confirm__message").textContent, /définitivement la question L-2/);
  q(".delete-confirm__cancel").click();
  assert.equal(q(".delete-confirm").hidden, true);
  assert.deepEqual(await localIds(), [-1, -2, -3]);
});

test("1 & 5. suppression d'une question locale : disparaît de Main et des disponibles", async () => {
  const historyBefore = await getHistory();
  await deleteDisplayed();

  assert.deepEqual(await localIds(), [-1, -3]);
  assert.ok(!(await availableIds()).includes(-2));
  const shown = displayedQuestionId(root());
  assert.ok((await availableIds()).includes(shown)); // jamais une question inexistante
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), shown);
  // Historique conservé (y compris l'entrée de -2) ; seule la nouvelle sélection est ajoutée.
  const history = await getHistory();
  assert.deepEqual(history.slice(1), historyBefore);
  assert.equal(history[0].questionId, shown);
  assert.equal(history[0].mode, "strict");
  // Jamais listée dans « Questions supprimées ».
  assert.ok(!(await getDeletedQuestionEntries()).some((e) => e.id === -2));
});

test("2. un id local supprimé n'est jamais réutilisé", async () => {
  assert.equal((await createLocalQuestion({ texte: "Locale 4", tags: ["Perso"], author: "Zoé" })).id, -4);
  await deleteQuestion(-4); // la plus récente
  assert.equal((await createLocalQuestion({ texte: "Locale 5", tags: ["Perso"], author: "Zoé" })).id, -5);
  assert.deepEqual(await localIds(), [-1, -3, -5]);
});

test("3-5. suppression d'une question de base : questionsDeleted, fichier intact, absente de Main", async () => {
  await showOnMain(1);
  deleteButton().click();
  assert.match(q(".delete-confirm__message").textContent, /B-1 \? Elle pourra être restaurée/);
  q(".delete-confirm__confirm").click();
  await waitFor(() => q(".view--main") && mainIsReady(root()) && displayedQuestionId(root()) !== 1);

  assert.deepEqual(await getDeletedQuestionEntries(), [{ id: 1 }]);
  assert.ok(!(await availableIds()).includes(1));
  assert.equal(readFileSync(BASE_JSON, "utf-8"), baseFileBefore);
  assert.deepEqual(await getBaseQuestions(), BASE_QUESTIONS);
  assert.ok((await getHistory()).some((h) => h.questionId === 1)); // historique conservé
});

test("10. base supprimée avec override : ni l'override ni l'original ne s'affichent", async () => {
  await showOnMain(3);
  assert.equal(q(".question-card__text").textContent, OVERRIDE_3.texte);
  await deleteDisplayed();

  const available = await getAvailableQuestions();
  assert.ok(!available.some((x) => x.id === 3));
  assert.deepEqual(await getBaseQuestionOverrides(), [{ id: 3, ...OVERRIDE_3 }]); // override conservé
  assert.deepEqual((await getDeletedQuestionEntries()).map((e) => e.id).sort(), [1, 3]);

  // Même en visant directement l'id 3, Main n'affiche rien de B-3.
  await setSetting(CURRENT_QUESTION_ID_KEY, 3);
  await openMain();
  assert.notEqual(displayedQuestionId(root()), 3);
  assert.ok(!root().textContent.includes(BASE_QUESTIONS.find((x) => x.id === 3).texte));
});

test("6. l'écran Questions supprimées liste les bases supprimées (B-n, texte, Restaurer)", async () => {
  await openDeleted();
  const items = [...root().querySelectorAll(".deleted-item")];
  assert.deepEqual(items.map((i) => i.querySelector(".deleted-item__id").textContent), ["B-1", "B-3"]);
  assert.equal(items[0].querySelector(".deleted-item__text").textContent, BASE_QUESTIONS[0].texte);
  assert.equal(items[1].querySelector(".deleted-item__text").textContent, OVERRIDE_3.texte);
  for (const item of items) assert.equal(item.querySelector(".deleted-item__restore").textContent, "Restaurer");
  assert.ok(!root().textContent.includes("L-")); // aucune question locale
});

test("7-9. restauration : disponible à nouveau, override conservé", async () => {
  q('.deleted-item[data-question-id="3"] .deleted-item__restore').click();
  await waitFor(() => /B-3 restaurée/.test(q(".deleted-card__status").textContent));
  assert.deepEqual([...root().querySelectorAll(".deleted-item__id")].map((e) => e.textContent), ["B-1"]);
  assert.deepEqual(await getDeletedQuestionEntries(), [{ id: 1 }]);

  const restored = (await getAvailableQuestions()).find((x) => x.id === 3);
  assert.deepEqual(restored, { id: 3, ...OVERRIDE_3 }); // version modifiée
  assert.equal((await getAvailableQuestions()).filter((x) => x.id === 3).length, 1);

  q('.deleted-item[data-question-id="1"] .deleted-item__restore').click();
  await waitFor(() => /Aucune question supprimée/.test(q(".deleted-card__status").textContent) || /B-1 restaurée/.test(q(".deleted-card__status").textContent));
  await waitFor(() => root().querySelectorAll(".deleted-item").length === 0);
  assert.deepEqual((await getAvailableQuestions()).find((x) => x.id === 1), BASE_QUESTIONS[0]);

  await showOnMain(3); // visible à nouveau sur Main, avec l'override
  assert.equal(q(".question-card__text").textContent, OVERRIDE_3.texte);
  assert.equal(q(".question-card__id").textContent, "B-3");
  assert.equal(readFileSync(BASE_JSON, "utf-8"), baseFileBefore);
});

test("11. questions locales restantes intactes", async () => {
  assert.deepEqual(await getLocalQuestions(), [
    { id: -5, texte: "Locale 5", tags: ["Perso"], author: "Zoé" },
    { id: -3, texte: "Locale 3", tags: ["Perso"], author: "Zoé" },
    { id: -1, texte: "Locale 1", tags: ["Perso"], author: "Zoé" },
  ].sort((a, b) => a.id - b.id));
});

test("12. Strict/Libre et historique cohérents ; filtres intacts", async () => {
  assert.equal(await getSetting(SELECTION_MODE_KEY, "strict"), "strict");
  assert.deepEqual(await getTagFilterStates(), {});
  const history = await getHistory();
  const libre = history.filter((h) => h.mode === "libre");
  assert.deepEqual(libre.map((h) => h.questionId), [2]); // jamais touché
  // Strict : les questions encore disponibles ne sont jamais reproposées deux fois.
  const questions = await getAvailableQuestions();
  const { advanceToNextQuestion } = await import("../js/features/questions/questionEngine.js");
  const seen = new Set(history.filter((h) => h.mode === "strict").map((h) => h.questionId));
  for (let i = 0; i < questions.length; i++) {
    const result = await advanceToNextQuestion(questions);
    if (result.status === "strict-exhausted") break;
    assert.ok(!seen.has(result.question.id));
    seen.add(result.question.id);
  }
  assert.equal((await advanceToNextQuestion(questions)).status, "strict-exhausted");
});

test("suppression impossible pour un id de base inconnu ou 0", async () => {
  await assert.rejects(() => deleteQuestion(999));
  await assert.rejects(() => deleteQuestion(0));
  assert.deepEqual(await getDeletedBaseQuestions(), []);
});
