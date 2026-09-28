/*
  Modification d'une question locale depuis Main : application réelle
  (js/app.js, routeur, menu) démarrée dans jsdom et pilotée par clics.
*/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { waitFor, mainIsReady, displayedQuestionId, BASE_QUESTIONS } from "./helpers.js";
import { openDatabase, STORES } from "../js/data/db.js";
import {
  createLocalQuestion, getLocalQuestions, getBaseQuestions, updateLocalQuestion, getLocalEdits,
} from "../js/data/questionsRepository.js";
import { getHistory } from "../js/data/historyRepository.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import { getTagFilterStates, setTagFilterStates } from "../js/data/filtersRepository.js";
import {
  CURRENT_QUESTION_ID_KEY, SELECTION_MODE_KEY,
} from "../js/features/questions/questionEngine.js";

const root = () => document.getElementById("view-root");
const q = (s) => root().querySelector(s);
const navButton = (view) => document.querySelector(`.nav-item[data-view="${view}"]`);
const editButton = () => q('.action-bar [data-action="edit"]');
const chosenTags = () => [...root().querySelectorAll(".question-form__tag")].map((b) => b.dataset.tag);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openMain() {
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

async function snapshot() {
  const db = await openDatabase();
  const all = (store) =>
    new Promise((resolve) => {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result);
    });
  return {
    history: await getHistory(),
    currentQuestionId: await getSetting(CURRENT_QUESTION_ID_KEY),
    mode: await getSetting(SELECTION_MODE_KEY, "strict"),
    filters: await getTagFilterStates(),
    deleted: await all(STORES.QUESTIONS_DELETED),
    edits: await getLocalEdits(),
  };
}

let before0;
const original = { texte: "Ton film culte ?", tags: ["Cinéma", "Souvenir"], author: "Léo" };

before(async () => {
  await createLocalQuestion(original); // -1
  await createLocalQuestion({ texte: "Autre locale", tags: ["Autre"], author: "Zoé" }); // -2
  await setSetting(CURRENT_QUESTION_ID_KEY, -1);
  await setSetting(SELECTION_MODE_KEY, "libre");
  await setTagFilterStates({ Voyage: "excluded" });

  document.body.innerHTML = '<main id="view-root"></main><nav id="bottom-nav" hidden></nav>';
  window.matchMedia = () => ({ matches: false });
  await import("../js/app.js");
  await waitFor(() => document.querySelectorAll(".nav-item").length === 4);
  await openMain();
  assert.equal(displayedQuestionId(root()), -1);
  before0 = await snapshot();
});

test("1. le bouton Modifier ouvre le formulaire de modification", async () => {
  assert.equal(editButton().disabled, false);
  await openEditor();
  assert.equal(window.location.hash, "#/question-edit");
  assert.equal(q(".question-form__title").textContent, "Modifier la question");
  assert.equal(q(".question-form__submit").textContent, "Enregistrer les modifications");
  assert.equal(q(".question-form__id").textContent, "Question L-1");
});

test("2. valeurs existantes préremplies ; tags repliables et suggestions disponibles", async () => {
  assert.equal(q('textarea[name="texte"]').value, original.texte);
  assert.equal(q('input[name="author"]').value, original.author);
  assert.deepEqual(chosenTags(), original.tags);
  assert.ok(q(".question-form__suggestions-toggle"));
  type(q('input[name="tag"]'), "emo");
  assert.deepEqual([...root().querySelectorAll(".question-form__suggestion")].map((b) => b.dataset.tag), ["Émotion"]);
  type(q('input[name="tag"]'), "");
});

test("6. validations identiques à la création : rien n'est enregistré", async () => {
  const texte = q('textarea[name="texte"]');
  const author = q('input[name="author"]');
  type(texte, "  ");
  type(author, "");
  for (const tag of chosenTags()) q(`.question-form__tag[data-tag="${tag}"]`).click();
  submit();
  await sleep(30);
  assert.equal(window.location.hash, "#/question-edit");
  for (const name of ["texte", "tags", "author"]) {
    assert.notEqual(q(`[data-field="${name}"] .question-form__error`).textContent, "", name);
  }
  const [stored] = (await getLocalQuestions()).filter((x) => x.id === -1);
  assert.deepEqual(stored, { id: -1, ...original });
});

test("11. Annuler ne modifie rien", async () => {
  q(".question-form__cancel").click();
  await waitFor(() => q(".view--main") && mainIsReady(root()));
  const [stored] = (await getLocalQuestions()).filter((x) => x.id === -1);
  assert.deepEqual(stored, { id: -1, ...original });
  assert.equal(q(".question-card__text").textContent, original.texte);
  assert.deepEqual(await snapshot(), before0);
});

test("3-5. modification du texte, de l'auteur, ajout et retrait de tags", async () => {
  await openEditor();
  assert.equal(q('textarea[name="texte"]').value, original.texte); // rechargé depuis la base
  type(q('textarea[name="texte"]'), "  Ton film culte, et pourquoi ?  ");
  type(q('input[name="author"]'), "Léo M.");
  q('.question-form__tag[data-tag="Souvenir"]').click(); // retrait
  q('.question-form__suggestion[data-tag="Émotion"]').click(); // ajout depuis suggestion
  type(q('input[name="tag"]'), "cinema"); // doublon (sans accent) ignoré
  q(".question-form__add-tag").click();
  type(q('input[name="tag"]'), "Débat");
  q(".question-form__add-tag").click(); // nouveau tag
  assert.deepEqual(chosenTags(), ["Cinéma", "Émotion", "Débat"]);
  submit();
  await waitFor(() => q(".view--main") && mainIsReady(root()));
});

test("7-9. même id interne, remplacée dans IndexedDB, aucune question créée", async () => {
  const local = await getLocalQuestions();
  assert.equal(local.length, 2);
  const stored = local.find((x) => x.id === -1);
  assert.deepEqual(stored, {
    id: -1,
    texte: "Ton film culte, et pourquoi ?",
    tags: ["Cinéma", "Émotion", "Débat"],
    author: "Léo M.",
  });
  assert.deepEqual(local.find((x) => x.id === -2), { id: -2, texte: "Autre locale", tags: ["Autre"], author: "Zoé" });
});

test("8 & 10. visible immédiatement sur Main, avec le même numéro L-1", async () => {
  assert.equal(displayedQuestionId(root()), -1);
  assert.equal(q(".question-card__id").textContent, "L-1");
  assert.equal(q(".question-card__text").textContent, "Ton film culte, et pourquoi ?");
  assert.deepEqual([...root().querySelectorAll(".question-card__tags .tag-chip")].map((t) => t.textContent), ["Cinéma", "Émotion", "Débat"]);
});

test("12. Strict/Libre, historique, filtres, currentQuestionId et suppressions inchangés", async () => {
  assert.deepEqual(await snapshot(), before0);
  assert.equal(q(".mode-indicator").textContent, "Mode : Libre");
});

test("13. questions de base inchangées ; updateLocalQuestion refuse une question de base", async () => {
  assert.deepEqual(await getBaseQuestions(), BASE_QUESTIONS);
  assert.deepEqual(await getLocalEdits(), []);
  await assert.rejects(() => updateLocalQuestion(1, original));
  await assert.rejects(() => updateLocalQuestion(-99, original)); // inconnue : pas de création
  assert.equal((await getLocalQuestions()).length, 2);

  await setSetting(CURRENT_QUESTION_ID_KEY, 2);
  navButton("settings").click(); // quitter Main pour forcer un remontage
  await waitFor(() => q(".view--settings"));
  await openMain();
  await waitFor(() => displayedQuestionId(root()) === 2);
  // Depuis l'étape "override", Modifier est aussi actif sur une question de base.
  assert.equal(editButton().disabled, false);
});
