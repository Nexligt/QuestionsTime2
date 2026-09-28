import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAG_FILTER_STATES as S,
  applyTagFilters,
  extractTags,
  searchTags,
  getNextTagState,
  withTagState,
  pruneUnknownTags,
} from "../js/features/filters/tagFilters.js";
import { BASE_QUESTIONS } from "./helpers.js";

const ids = (list) => list.map((q) => q.id).sort((a, b) => a - b);

test("tags récupérés dynamiquement depuis les questions", () => {
  assert.deepEqual(extractTags(BASE_QUESTIONS), [
    "Émotion", "Réflexion", "Sexualité", "Souvenir", "Voyage",
  ]);
});

test("cycle des 3 états : neutre -> obligatoire -> exclu -> neutre", () => {
  assert.equal(getNextTagState(S.NEUTRAL), S.REQUIRED);
  assert.equal(getNextTagState(S.REQUIRED), S.EXCLUDED);
  assert.equal(getNextTagState(S.EXCLUDED), S.NEUTRAL);
  assert.deepEqual(withTagState({ A: S.REQUIRED }, "A", S.NEUTRAL), {});
});

test("1. tag obligatoire", () => {
  assert.deepEqual(ids(applyTagFilters(BASE_QUESTIONS, { Réflexion: S.REQUIRED })), [2, 4]);
});

test("2. tag exclu", () => {
  assert.deepEqual(ids(applyTagFilters(BASE_QUESTIONS, { Souvenir: S.EXCLUDED })), [2]);
});

test("3. combinaison : obligatoires en ET, exclus tous interdits", () => {
  assert.deepEqual(
    ids(applyTagFilters(BASE_QUESTIONS, { Souvenir: S.REQUIRED, Réflexion: S.REQUIRED })),
    [4]
  );
  assert.deepEqual(
    ids(applyTagFilters(BASE_QUESTIONS, { Sexualité: S.EXCLUDED, Voyage: S.EXCLUDED })),
    [2, 3, 4]
  );
  assert.deepEqual(
    ids(applyTagFilters(BASE_QUESTIONS, {
      Souvenir: S.REQUIRED, Sexualité: S.EXCLUDED, Voyage: S.EXCLUDED,
    })),
    [3, 4]
  );
});

test("4. recherche de tags (casse et accents ignorés)", () => {
  const tags = extractTags(BASE_QUESTIONS);
  assert.deepEqual(searchTags(tags, "emo"), ["Émotion"]);
  assert.deepEqual(searchTags(tags, "  VOY "), ["Voyage"]);
  assert.deepEqual(searchTags(tags, "e").length, 5);
  assert.deepEqual(searchTags(tags, ""), tags);
  assert.deepEqual(searchTags(tags, "zzz"), []);
});

test("5. aucun résultat compatible -> liste vide, sans erreur", () => {
  assert.deepEqual(
    applyTagFilters(BASE_QUESTIONS, { Voyage: S.REQUIRED, Réflexion: S.REQUIRED }),
    []
  );
});

test("tags inconnus ignorés (ne bloquent pas la sélection)", () => {
  assert.deepEqual(
    pruneUnknownTags({ Inconnu: S.REQUIRED, Voyage: S.EXCLUDED }, extractTags(BASE_QUESTIONS)),
    { Voyage: S.EXCLUDED }
  );
});
