/* Recherche par identifiant : "3" (contient), "B-3" / "L-3" (exact) ; l'espace final n'a aucun effet. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchQuestions } from "../js/features/questions/questionSearch.js";
import { formatQuestionId } from "../js/features/questions/questionId.js";

const IDS = [3, 13, 30, 39, 43, 53, 7, 103, -3, -30, -43, -13, -8];
const QUESTIONS = IDS.map((id) => ({ id, texte: `Question sans chiffre`, tags: [], author: "x" }));
const found = (query) => searchQuestions(QUESTIONS, query).map((q) => formatQuestionId(q.id));

test("numéro seul '3' : tous les id (B et L) dont le numéro contient 3", () => {
  const expected = ["B-3", "B-13", "B-30", "B-39", "B-43", "B-53", "B-103", "L-3", "L-30", "L-43", "L-13"];
  assert.deepEqual(found("3"), expected);
  assert.deepEqual(found("  3"), expected); // espaces de début ignorés
  assert.deepEqual(found("30"), ["B-30", "L-30"]);
  assert.deepEqual(found("5"), ["B-53"]);
});

test("'B-3' : uniquement B-3 (ni B-53, ni B-39, ni L-3)", () => {
  for (const q of ["B-3", "b-3", "b3", "B3", "B - 3", "  B-3"]) {
    assert.deepEqual(found(q), ["B-3"], q);
  }
  assert.deepEqual(found("B-53"), ["B-53"]);
  assert.deepEqual(found("B-8"), []); // L-8 existe, mais pas B-8
  for (const q of ["L-3", "l-3", "l3", "L - 3"]) {
    assert.deepEqual(found(q), ["L-3"], q);
  }
});

test("l'espace final n'a aucune signification : '3 ' = '3', 'B-3 ' = 'B-3', 'L-3 ' = 'L-3'", () => {
  assert.deepEqual(found("3 "), found("3"));
  assert.ok(found("3 ").includes("B-39"));
  assert.deepEqual(found("B-3 "), ["B-3"]);
  assert.deepEqual(found("b3 "), ["B-3"]);
  assert.deepEqual(found("L-3 "), ["L-3"]);
});

test("recherche par texte inchangée", () => {
  const list = [
    { id: 1, texte: "Quelle est la capitale de France ?" },
    { id: 2, texte: "Ton plat préféré ?" },
  ];
  assert.deepEqual(searchQuestions(list, "capital france").map((q) => q.id), [1]);
  assert.deepEqual(searchQuestions(list, "PREFERE").map((q) => q.id), [2]);
  assert.deepEqual(searchQuestions(list, "").map((q) => q.id), [1, 2]);
  assert.deepEqual(searchQuestions(list, "zzz"), []);
});
