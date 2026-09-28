/* Recherche par identifiant : "3" (contient), "B-3" / "L-3" (numéro commençant par 3) ; l'espace final n'a aucun effet. */
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

test("'B-3' : ids de base dont le numéro commence par 3 (ni B-13, ni B-53, ni L-3)", () => {
  for (const q of ["B-3", "b-3", "b3", "B3", "B - 3", "  B-3"]) {
    assert.deepEqual(found(q), ["B-3", "B-30", "B-39"], q);
  }
  assert.deepEqual(found("B-39"), ["B-39"]);
  assert.deepEqual(found("B-10"), ["B-103"]);
  assert.deepEqual(found("B-8"), []); // L-8 existe, mais pas B-8
  for (const q of ["L-3", "l-3", "l3", "L - 3"]) {
    assert.deepEqual(found(q), ["L-3", "L-30"], q);
  }
});

test("l'espace final n'a aucune signification : '3 ' = '3', 'B-3 ' = 'B-3', 'L-3 ' = 'L-3'", () => {
  assert.deepEqual(found("3 "), found("3"));
  assert.ok(found("3 ").includes("B-39"));
  assert.deepEqual(found("B-3 "), found("B-3"));
  assert.deepEqual(found("b3 "), found("B-3"));
  assert.deepEqual(found("L-3 "), found("L-3"));
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

test("ID avec ou sans espaces, tiret simple ou typographique (– — −) : B-12 = B - 12", async () => {
  const { matchesQuestionQuery } = await import("../js/features/questions/questionSearch.js");
  const { parseQuestionId } = await import("../js/features/questions/questionId.js");
  for (const q of ["B-12", "B - 12", "b - 12", "B -12", "B- 12", "B12", " B - 12 ", "B – 12", "B—12", "B − 12", "B - 12"]) {
    assert.equal(matchesQuestionQuery({ id: 12, texte: "x" }, q), true, q);
    assert.equal(matchesQuestionQuery({ id: 120, texte: "x" }, q), true, q); // commence par 12
    assert.equal(matchesQuestionQuery({ id: 212, texte: "x" }, q), false, q);
    assert.equal(parseQuestionId(q), 12, q);
  }
  assert.equal(parseQuestionId("L – 3"), -3);
  assert.equal(matchesQuestionQuery({ id: -3, texte: "x" }, "L – 3"), true);
});

test("« B » / « B- » : toutes les questions de base ; « L » / « L- » : toutes les locales", async () => {
  const { searchQuestions } = await import("../js/features/questions/questionSearch.js");
  const list = [{ id: 1, texte: "Plan B ?" }, { id: 12, texte: "x" }, { id: -1, texte: "Plan B local" }, { id: -3, texte: "y" }];
  for (const q of ["B", "b", "B-", "B -", " B - ", "B –"]) assert.deepEqual(searchQuestions(list, q).map((x) => x.id), [1, 12], q);
  for (const q of ["L", "l-", "L - "]) assert.deepEqual(searchQuestions(list, q).map((x) => x.id), [-1, -3], q);
  assert.deepEqual(searchQuestions(list, "B-12").map((x) => x.id), [12]); // ID complet : inchangé
  assert.deepEqual(searchQuestions(list, "Plan B").map((x) => x.id), [1, -1]); // mots : inchangé
});
