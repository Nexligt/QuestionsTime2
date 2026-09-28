/* Formulaire : charger une question par son ID, restaurer l'original d'une question de base modifiée. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor, BASE_QUESTIONS } from "./helpers.js";
import { createQuestionFormView } from "../js/features/questions/questionFormView.js";
import {
  createLocalQuestion, deleteQuestion, saveBaseQuestionOverride, getBaseQuestionOverrides, getDeletedQuestionEntries,
} from "../js/data/questionsRepository.js";

beforeEach(resetDatabase);

const base = (id) => BASE_QUESTIONS.find((q) => q.id === id);
const editView = () => document.querySelector(".view--question-edit");

async function load(label) {
  const v = await mount(createQuestionFormView, (x) => x.querySelector(".question-form__suggestion"));
  v.querySelector(".question-form__load-input").value = label;
  v.querySelector(".question-form__load-button").click();
  await waitFor(() => v.dataset.loadStatus);
  if (v.dataset.loadStatus === "ok") await waitFor(() => editView()?.dataset.ready === "true");
  return v;
}

test("chargement par ID : question de base et question locale, en mode modification", async () => {
  await load("B-3");
  assert.equal(editView().dataset.questionId, "3");
  assert.equal(editView().querySelector(".question-form__title").textContent, "Modifier la question");
  assert.equal(editView().querySelector('textarea[name="texte"]').value, base(3).texte);

  const local = await createLocalQuestion({ texte: "Ma locale ?", tags: ["Perso"], author: "Léo" });
  await load("l-1");
  assert.equal(editView().dataset.questionId, String(local.id));
  assert.equal(editView().querySelector('textarea[name="texte"]').value, "Ma locale ?");
});

test("chargement par ID : inconnu ou mal saisi -> message clair, rien n'est chargé", async () => {
  let v = await load("B-999");
  assert.equal(v.dataset.loadStatus, "unknown");
  assert.match(v.querySelector(".question-form__load-status").textContent, /Aucune question B-999/);
  assert.equal(editView(), null);
  v = await load("L-7");
  assert.equal(v.dataset.loadStatus, "unknown");
  v = await load("xyz");
  assert.equal(v.dataset.loadStatus, "invalid");
  assert.match(v.querySelector(".question-form__load-status").textContent, /B-5 ou L-3/);
});

test("chargement par ID : question supprimée -> non chargée, lien vers Supprimées", async () => {
  await deleteQuestion(2);
  const v = await load("B-2");
  assert.equal(v.dataset.loadStatus, "deleted");
  assert.equal(editView(), null);
  const status = v.querySelector(".question-form__load-status");
  assert.match(status.textContent, /B-2 est supprimée/);
  assert.equal(status.querySelector("a").getAttribute("href"), "#/deleted-questions");
});

test("restaurer l'original : confirmation, version locale supprimée, version du JSON rechargée", async () => {
  await saveBaseQuestionOverride(3, { texte: "Version modifiée", tags: ["X"], author: "Léo" });
  await deleteQuestion(5);
  const deletedBefore = await getDeletedQuestionEntries();
  await load("B-3");
  const v = editView();
  const button = v.querySelector(".question-form__restore");
  assert.equal(v.querySelector('textarea[name="texte"]').value, "Version modifiée");
  assert.equal(button.hidden, false);

  button.click(); // confirmation, rien d'écrit
  assert.equal(v.querySelector(".question-form__restore-confirm").hidden, false);
  assert.equal((await getBaseQuestionOverrides()).length, 1);
  v.querySelector(".question-form__restore-cancel").click();
  assert.equal(button.hidden, false);
  assert.equal((await getBaseQuestionOverrides()).length, 1);

  button.click();
  v.querySelector(".question-form__restore-confirm-button").click();
  await waitFor(() => v.querySelector('textarea[name="texte"]').value === base(3).texte);
  assert.deepEqual(await getBaseQuestionOverrides(), []);
  assert.equal(button.hidden, true);
  assert.equal(v.querySelector(".question-form__restore-confirm").hidden, true);
  assert.deepEqual(await getDeletedQuestionEntries(), deletedBefore); // supprimées intactes
});

test("« Restaurer l'original » absent : question de base non modifiée, question locale, création", async () => {
  await load("B-4");
  assert.equal(editView().querySelector(".question-form__restore").hidden, true);
  await createLocalQuestion({ texte: "Locale", tags: ["Perso"], author: "Léo" });
  await load("L-1");
  assert.equal(editView().querySelector(".question-form__restore").hidden, true);
  const v = await mount(createQuestionFormView, (x) => x.querySelector(".question-form__suggestion"));
  assert.equal(v.querySelector(".question-form__restore").hidden, true);
});
