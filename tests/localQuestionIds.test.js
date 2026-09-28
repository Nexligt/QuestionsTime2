/* IDs locaux séquentiels (-1, -2…), jamais réutilisés ; affichage B-n / L-n. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, mainIsReady, displayedQuestionId } from "./helpers.js";
import { openDatabase, STORES, nextLocalQuestionId } from "../js/data/db.js";
import { createLocalQuestion, getLocalQuestions } from "../js/data/questionsRepository.js";
import { setSetting, getSetting } from "../js/data/settingsRepository.js";
import { formatQuestionId, parseQuestionId } from "../js/features/questions/questionId.js";
import { createMainView } from "../js/features/questions/mainView.js";
import { setTagFilterStates } from "../js/data/filtersRepository.js";
import { CURRENT_QUESTION_ID_KEY } from "../js/features/questions/questionEngine.js";

beforeEach(resetDatabase);

const draft = (n) => ({ texte: `Question ${n}`, tags: ["Test"], author: "Léo" });
const create = async (n) => (await createLocalQuestion(draft(n))).id;

/** Simule une future suppression : retirée de questionsUser, marquée supprimée. */
async function simulateDeletion(id, { markDeleted = true } = {}) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.QUESTIONS_USER, STORES.QUESTIONS_DELETED], "readwrite");
    tx.objectStore(STORES.QUESTIONS_USER).delete(id);
    if (markDeleted) tx.objectStore(STORES.QUESTIONS_DELETED).put({ id });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

test("première question locale -> -1, puis -2, -3…", async () => {
  assert.equal(await create(1), -1);
  assert.equal(await create(2), -2);
  assert.equal(await create(3), -3);
  assert.equal(await create(4), -4);
  assert.deepEqual((await getLocalQuestions()).map((q) => q.id).sort((a, b) => b - a), [-1, -2, -3, -4]);
});

test("suppression de -2 puis création -> -4", async () => {
  await create(1); await create(2); await create(3);
  await simulateDeletion(-2);
  assert.equal(await create(4), -4);
});

test("aucun id réutilisé, même si la plus récente est supprimée (avec ou sans marque)", async () => {
  await create(1); await create(2); await create(3);
  await simulateDeletion(-3); // marquée supprimée
  assert.equal(await create(4), -4);
  await simulateDeletion(-4, { markDeleted: false }); // suppression physique seule
  assert.equal(await create(5), -5);

  const ids = [];
  for (let i = 6; i <= 10; i++) ids.push(await create(i));
  const all = [-1, -2, -3, -4, -5, ...ids];
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(ids, [-6, -7, -8, -9, -10]);
});

test("règle pure : min - 1, id de base ignorés", () => {
  assert.equal(nextLocalQuestionId([]), -1);
  assert.equal(nextLocalQuestionId([1, 2, 27]), -1);
  assert.equal(nextLocalQuestionId([-1, -3, 5]), -4);
});

test("structure inchangée { id, texte, tags, author } et id de base intacts", async () => {
  await create(1);
  const [q] = await getLocalQuestions();
  assert.deepEqual(Object.keys(q).sort(), ["author", "id", "tags", "texte"]);
  assert.equal(typeof q.id, "number");
});

test("affichage B-n / L-n, sans modifier l'id interne", () => {
  assert.equal(formatQuestionId(1), "B-1");
  assert.equal(formatQuestionId(27), "B-27");
  assert.equal(formatQuestionId(-1), "L-1");
  assert.equal(formatQuestionId(-27), "L-27");
  assert.equal(parseQuestionId("B-27"), 27);
  assert.equal(parseQuestionId("L-27"), -27);
  assert.equal(parseQuestionId("#3"), null);
});

test("Main affiche B-n pour une question de base (id interne numérique)", async () => {
  await setSetting(CURRENT_QUESTION_ID_KEY, 1);
  const view = await mount(createMainView, mainIsReady);
  const idEl = view.querySelector(".question-card__id");
  assert.equal(idEl.textContent, "B-1");
  assert.equal(displayedQuestionId(view), 1);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), 1); // stocké en nombre
});

test("Main affiche L-n pour une question locale ; currentQuestionId reste l'id interne", async () => {
  await create(1);
  await create(2); // -2
  await setTagFilterStates({ Test: "required" });
  await setSetting(CURRENT_QUESTION_ID_KEY, -2);
  const view = await mount(createMainView, mainIsReady);
  assert.equal(view.querySelector(".question-card__id").textContent, "L-2");
  assert.equal(displayedQuestionId(view), -2);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), -2);
});
