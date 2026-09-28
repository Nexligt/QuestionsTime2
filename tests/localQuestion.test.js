/* Question locale : règles pures + repository + moteur Strict/Libre. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, BASE_QUESTIONS } from "./helpers.js";
import {
  addTag, addTagsFromText, normalizeTags, validateQuestionDraft, QUESTION_FIELD_ERRORS,
} from "../js/features/questions/localQuestion.js";
import {
  createLocalQuestion, getLocalQuestions, getAvailableQuestions,
} from "../js/data/questionsRepository.js";
import { getHistory } from "../js/data/historyRepository.js";
import { setSetting } from "../js/data/settingsRepository.js";
import {
  advanceToNextQuestion, setRecentQuestionCount, SELECTION_MODE_KEY,
} from "../js/features/questions/questionEngine.js";

beforeEach(resetDatabase);

const valid = { texte: "Ta chanson préférée ?", tags: ["Musique"], author: "Léo" };

test("5. plusieurs tags, sans doublons (casse/accents/espaces ignorés)", () => {
  let tags = addTag([], "Musique");
  tags = addTag(tags, "  musique ");
  tags = addTag(tags, "Soirée");
  tags = addTag(tags, "SOIREE");
  tags = addTag(tags, "   ");
  assert.deepEqual(tags, ["Musique", "Soirée"]);
  assert.deepEqual(addTagsFromText([], "A, b ; a,  C  "), ["A", "b", "C"]);
  // orthographe d'un tag existant réutilisée (regroupement dans les filtres)
  assert.deepEqual(addTag([], "souvenir", ["Souvenir"]), ["Souvenir"]);
  assert.deepEqual(normalizeTags(["x", "X", "y"]), ["x", "y"]);
});

test("6. validation : texte, au moins un tag et auteur obligatoires", () => {
  const empty = validateQuestionDraft({ texte: "  ", tags: [" "], author: "" });
  assert.equal(empty.valid, false);
  assert.deepEqual(empty.errors, {
    texte: QUESTION_FIELD_ERRORS.texte,
    tags: QUESTION_FIELD_ERRORS.tags,
    author: QUESTION_FIELD_ERRORS.author,
  });
  assert.deepEqual(validateQuestionDraft({ ...valid, author: " " }).errors, { author: QUESTION_FIELD_ERRORS.author });
  assert.deepEqual(validateQuestionDraft({ ...valid, tags: [] }).errors, { tags: QUESTION_FIELD_ERRORS.tags });

  const ok = validateQuestionDraft({ texte: "  Q ?  ", tags: ["a", "A", "b"], author: "  Léo   Dupont " });
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.question, { texte: "Q ?", tags: ["a", "b"], author: "Léo Dupont" });
});

test("2-4. création : id négatif, structure exacte { id, texte, tags, author }", async () => {
  const created = await createLocalQuestion(valid);
  assert.ok(Number.isInteger(created.id) && created.id < 0);
  assert.deepEqual(Object.keys(created).sort(), ["author", "id", "tags", "texte"]);
  assert.equal("source" in created, false);

  const [stored] = await getLocalQuestions();
  assert.deepEqual(stored, { id: created.id, ...valid });
  assert.ok(BASE_QUESTIONS.every((q) => q.id > 0 && q.id !== created.id));
});

test("ids uniques même pour deux créations dans la même milliseconde", async () => {
  const realNow = Date.now;
  Date.now = () => 1_700_000_000_000;
  try {
    const a = await createLocalQuestion(valid);
    const b = await createLocalQuestion(valid);
    assert.notEqual(a.id, b.id);
    assert.ok(a.id < 0 && b.id < 0);
  } finally {
    Date.now = realNow;
  }
});

test("7. question disponible immédiatement (base + locales)", async () => {
  const created = await createLocalQuestion(valid);
  const available = await getAvailableQuestions();
  assert.equal(available.length, BASE_QUESTIONS.length + 1);
  assert.deepEqual(available.at(-1), created);
});

test("8. Strict inchangé : les 6 questions une seule fois, puis épuisement", async () => {
  const created = await createLocalQuestion(valid);
  const questions = await getAvailableQuestions();
  const ids = [];
  for (let i = 0; i < questions.length; i++) ids.push((await advanceToNextQuestion(questions)).question.id);
  assert.equal(new Set(ids).size, 6);
  assert.ok(ids.includes(created.id));
  assert.equal((await advanceToNextQuestion(questions)).status, "strict-exhausted");
  assert.equal((await getHistory()).length, 6);
});

test("8. Libre inchangé : fenêtre récente respectée avec la question locale", async () => {
  await createLocalQuestion(valid);
  const questions = await getAvailableQuestions();
  await setSetting(SELECTION_MODE_KEY, "libre");
  await setRecentQuestionCount(5);
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push((await advanceToNextQuestion(questions)).question.id);
  assert.equal(new Set(ids).size, 6); // 5 récentes exclues -> 6 distinctes
  const history = await getHistory();
  assert.ok(history.every((h) => h.mode === "libre"));
});
