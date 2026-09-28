/*
  Création d'une question depuis Main : application réelle (js/app.js,
  routeur, menu) démarrée dans jsdom et pilotée par clics.
*/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { waitFor, mainIsReady, displayedQuestionId } from "./helpers.js";
import { getLocalQuestions } from "../js/data/questionsRepository.js";
import { getHistory } from "../js/data/historyRepository.js";
import { getSetting } from "../js/data/settingsRepository.js";
import { getTagFilterStates, setTagFilterStates } from "../js/data/filtersRepository.js";
import {
  CURRENT_QUESTION_ID_KEY, SELECTION_MODE_KEY,
} from "../js/features/questions/questionEngine.js";

const root = () => document.getElementById("view-root");
const q = (s) => root().querySelector(s);
const navButton = (view) => document.querySelector(`.nav-item[data-view="${view}"]`);

async function openMain() {
  navButton("main").click();
  await waitFor(() => q(".view--main") && mainIsReady(root()) && !q(".mode-indicator").disabled);
}

function type(el, value) {
  el.value = value;
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function submit() {
  q(".question-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

let shownId;
let historyBefore;

before(async () => {
  document.body.innerHTML = '<main id="view-root"></main><nav id="bottom-nav" hidden></nav>';
  window.matchMedia = () => ({ matches: false });
  await import("../js/app.js");
  await waitFor(() => document.querySelectorAll(".nav-item").length === 4);
  await openMain();
  shownId = displayedQuestionId(root());
  historyBefore = await getHistory();
});

test("1. le bouton + de Main ouvre l'écran de création", async () => {
  q('.action-bar [data-action="add"]').click();
  await waitFor(() => q(".view--question-form"));
  assert.equal(window.location.hash, "#/question-form");
  assert.equal(document.getElementById("bottom-nav").hidden, false);
  assert.ok(q('textarea[name="texte"]'));
  assert.ok(q('input[name="tag"]'));
  assert.ok(q('input[name="author"]'));
  await waitFor(() => q(".question-form__suggestion")); // tags existants proposés
});

test("6. champs obligatoires manquants : message clair, rien d'enregistré", async () => {
  submit();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(window.location.hash, "#/question-form");
  assert.match(q(".question-form__summary").textContent, /champs obligatoires/);
  for (const name of ["texte", "tags", "author"]) {
    assert.notEqual(q(`[data-field="${name}"] .question-form__error`).textContent, "", name);
  }
  assert.equal((await getLocalQuestions()).length, 0);

  // Seul l'auteur manque encore.
  type(q('textarea[name="texte"]'), "Quelle chanson te rappelle ton enfance ?");
  type(q('input[name="tag"]'), "Musique");
  q(".question-form__add-tag").click();
  submit();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(q('[data-field="texte"] .question-form__error').textContent, "");
  assert.equal(q('[data-field="tags"] .question-form__error').textContent, "");
  assert.match(q('[data-field="author"] .question-form__error').textContent, /auteur/i);
  assert.equal((await getLocalQuestions()).length, 0);
});

test("5. plusieurs tags ajoutés sans doublons (saisie + suggestions)", () => {
  const tagInput = q('input[name="tag"]');
  type(tagInput, "musique, Nostalgie");
  q(".question-form__add-tag").click();
  type(tagInput, "NOSTALGIE");
  tagInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  q('.question-form__suggestion[data-tag="Souvenir"]').click();

  const tags = [...root().querySelectorAll(".question-form__tag")].map((b) => b.dataset.tag);
  assert.deepEqual(tags, ["Musique", "Nostalgie", "Souvenir"]);

  // Retrait d'un tag par appui sur la pastille, puis ré-ajout.
  q('.question-form__tag[data-tag="Nostalgie"]').click();
  type(tagInput, "Nostalgie");
  q(".question-form__add-tag").click();
});

test("2-4. création valide : retour sur Main, id négatif, structure correcte", async () => {
  type(q('input[name="author"]'), "  Léo ");
  submit();
  await waitFor(() => q(".view--main") && mainIsReady(root()));

  const local = await getLocalQuestions();
  assert.equal(local.length, 1);
  const [created] = local;
  assert.ok(created.id < 0);
  assert.deepEqual(created, {
    id: created.id,
    texte: "Quelle chanson te rappelle ton enfance ?",
    tags: ["Musique", "Souvenir", "Nostalgie"],
    author: "Léo",
  });
});

test("retour sur Main : même question, currentQuestionId, mode, filtres et historique inchangés", async () => {
  assert.equal(displayedQuestionId(root()), shownId);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), shownId);
  assert.equal(await getSetting(SELECTION_MODE_KEY, "strict"), "strict");
  assert.deepEqual(await getTagFilterStates(), {});
  assert.deepEqual(await getHistory(), historyBefore);
});

test("7. question disponible immédiatement (Filtres + sélection)", async () => {
  const [created] = await getLocalQuestions();

  navButton("filters").click();
  await waitFor(() => q(".view--filters") && q('.filter-tag[data-tag="Nostalgie"]'));
  assert.match(q(".filters-summary").textContent, /sur 6/);

  // Filtre sur le nouveau tag : seule la question locale est compatible.
  await setTagFilterStates({ Nostalgie: "required" });
  await openMain();
  assert.equal(displayedQuestionId(root()), created.id);
  assert.equal(q(".question-card__text").textContent, created.texte);
  await setTagFilterStates({});
});

test("Annuler revient sur Main sans rien créer", async () => {
  await openMain();
  q('.action-bar [data-action="add"]').click();
  await waitFor(() => q(".view--question-form"));
  type(q('textarea[name="texte"]'), "Brouillon");
  q(".question-form__cancel").click();
  await waitFor(() => q(".view--main"));
  assert.equal((await getLocalQuestions()).length, 1);
});
