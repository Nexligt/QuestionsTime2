/* Formulaire de création : zone des tags repliable + suggestions en direct. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount } from "./helpers.js";
import { createQuestionFormView } from "../js/features/questions/questionFormView.js";
import { searchTags } from "../js/features/filters/tagFilters.js";

beforeEach(resetDatabase);

const mountForm = () => mount(createQuestionFormView, (v) => v.querySelector(".question-form__suggestion"));
const $ = (v, s) => v.querySelector(s);
const suggestionTags = (v) => [...v.querySelectorAll(".question-form__suggestion")].map((b) => b.dataset.tag);
const chosenTags = (v) => [...v.querySelectorAll(".question-form__tag")].map((b) => b.dataset.tag);

function type(v, value) {
  const input = $(v, 'input[name="tag"]');
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}

test("ouverture/fermeture de la zone des tags, champ d'ajout toujours accessible", async () => {
  const v = await mountForm();
  const toggle = $(v, ".question-form__suggestions-toggle");
  const zone = $(v, ".question-form__suggestions-zone");
  assert.equal(toggle.getAttribute("aria-controls"), zone.id);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.match(toggle.textContent, /Tags existants \(5\)/);

  toggle.click();
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(zone.hidden, true);
  const input = $(v, 'input[name="tag"]');
  assert.equal(input.closest("[hidden]"), null); // champ toujours visible
  assert.equal($(v, ".question-form__add-tag").closest("[hidden]"), null);
  assert.equal($(v, 'input[name="author"]').closest("[hidden]"), null);

  toggle.click();
  assert.equal(zone.hidden, false);

  // Replié puis saisie : la zone se rouvre sur les suggestions.
  toggle.click();
  type(v, "sou");
  assert.equal(zone.hidden, false);
});

test("recherche en direct parmi les tags existants", async () => {
  const v = await mountForm();
  assert.equal(suggestionTags(v).length, 5); // saisie vide : tous
  type(v, "ré");
  assert.deepEqual(suggestionTags(v), ["Réflexion"]);
  type(v, "o");
  assert.deepEqual(suggestionTags(v), ["Émotion", "Réflexion", "Souvenir", "Voyage"]);
  type(v, "zzz");
  assert.deepEqual(suggestionTags(v), []);
});

test("recherche insensible aux majuscules, accents et espaces (même logique que Filtres)", async () => {
  const v = await mountForm();
  for (const query of ["EMOTION", "emo", "  émo  ", "e m o", "ÉmOtIoN"]) {
    type(v, query);
    assert.deepEqual(suggestionTags(v), ["Émotion"], query);
  }
  type(v, "sou venir");
  assert.deepEqual(suggestionTags(v), ["Souvenir"]);
  assert.deepEqual(searchTags(["Émotion", "Voyage"], " V OY "), ["Voyage"]);
});

test("sélection d'une suggestion : orthographe existante, saisie vidée", async () => {
  const v = await mountForm();
  type(v, "emo");
  $(v, '.question-form__suggestion[data-tag="Émotion"]').click();
  assert.deepEqual(chosenTags(v), ["Émotion"]);
  assert.equal($(v, 'input[name="tag"]').value, "");
  // Un tag déjà choisi n'est plus proposé.
  assert.ok(!suggestionTags(v).includes("Émotion"));
  assert.match($(v, ".question-form__suggestions-toggle").textContent, /\(4\)/);
});

test("aucun doublon (suggestion, saisie en minuscules, sans accents)", async () => {
  const v = await mountForm();
  $(v, '.question-form__suggestion[data-tag="Souvenir"]').click();
  type(v, "  SOUVENIR ");
  $(v, ".question-form__add-tag").click();
  type(v, "emotion");
  $(v, ".question-form__add-tag").click(); // reprend l'orthographe "Émotion"
  type(v, "Émotion");
  $(v, ".question-form__add-tag").click();
  assert.deepEqual(chosenTags(v), ["Souvenir", "Émotion"]);
});

test("un nouveau tag inexistant peut toujours être créé", async () => {
  const v = await mountForm();
  type(v, "Cuisine");
  assert.deepEqual(suggestionTags(v), []);
  assert.match($(v, ".question-form__hint").textContent, /« Cuisine » est un nouveau tag/);
  $(v, ".question-form__add-tag").click();
  assert.deepEqual(chosenTags(v), ["Cuisine"]);

  type(v, "Sou");
  assert.equal($(v, ".question-form__hint").dataset.newTag, "true");
  type(v, "souvenir");
  assert.equal($(v, ".question-form__hint").dataset.newTag, "false"); // existe déjà
});
