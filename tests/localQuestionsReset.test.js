/*
  Remise à zéro unique des questions locales (migration IndexedDB v2 -> v3).
  Une base "v2" réaliste est créée avec l'API IndexedDB brute, puis ouverte
  par le vrai js/data/db.js.
*/
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { BASE_QUESTIONS } from "./helpers.js";

const STORE_DEFS = {
  questionsUser: { keyPath: "id" },
  questionsEdits: { keyPath: "id" },
  questionsDeleted: { keyPath: "id" },
  history: { keyPath: "id", autoIncrement: true },
  settings: { keyPath: "key" },
  filters: { keyPath: "key" },
};

function run(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let db;
let repo;

before(async () => {
  // Base v2 existante, avec des questions locales à l'ancien format d'id.
  const open = indexedDB.open("questionstime2", 2);
  open.onupgradeneeded = () => {
    for (const [name, opts] of Object.entries(STORE_DEFS)) open.result.createObjectStore(name, opts);
  };
  const old = await run(open);
  await new Promise((resolve) => {
    const tx = old.transaction(Object.keys(STORE_DEFS), "readwrite");
    tx.objectStore("questionsUser").put({ id: -1727000000000, texte: "Ancienne 1", tags: ["X"], author: "Léo" });
    tx.objectStore("questionsUser").put({ id: -1727000000500, texte: "Ancienne 2", tags: ["Y"], author: "Léo" });
    tx.objectStore("questionsDeleted").put({ id: 4 }); // question de base supprimée
    tx.objectStore("history").add({ questionId: 2, viewedAt: 1, mode: "strict" });
    tx.objectStore("settings").put({ key: "selectionMode", value: "libre" });
    tx.objectStore("settings").put({ key: "currentQuestionId", value: 2 });
    tx.objectStore("settings").put({ key: "lowestLocalQuestionId", value: -1727000000500 });
    tx.objectStore("filters").put({ key: "tagStates", value: { Voyage: "excluded" } });
    tx.oncomplete = resolve;
  });
  old.close();

  const dbModule = await import("../js/data/db.js");
  db = await dbModule.openDatabase(); // déclenche la migration v3
  repo = await import("../js/data/questionsRepository.js");
});

const all = (store) => run(db.transaction(store).objectStore(store).getAll());

test("toutes les questions locales sont supprimées", async () => {
  assert.equal(db.version, 3);
  assert.deepEqual(await all("questionsUser"), []);
  assert.deepEqual(await repo.getLocalQuestions(), []);
});

test("questions de base toujours présentes", async () => {
  const base = await repo.getBaseQuestions();
  assert.equal(base.length, BASE_QUESTIONS.length);
  // B-4 est marquée supprimée dans cette base de test : exclue des disponibles
  // depuis l'étape suppression/restauration, mais toujours dans la base.
  assert.ok(base.some((q) => q.id === 4));
  assert.deepEqual(await repo.getAvailableQuestions(), BASE_QUESTIONS.filter((q) => q.id !== 4));
});

test("filtres, historique, paramètres et questions supprimées intacts", async () => {
  assert.deepEqual(await all("filters"), [{ key: "tagStates", value: { Voyage: "excluded" } }]);
  assert.deepEqual((await all("history")).map(({ id, ...e }) => e), [{ questionId: 2, viewedAt: 1, mode: "strict" }]);
  assert.deepEqual(await all("questionsDeleted"), [{ id: 4 }]);
  const settings = Object.fromEntries((await all("settings")).map((s) => [s.key, s.value]));
  assert.equal(settings.selectionMode, "libre");
  assert.equal(settings.currentQuestionId, 2);
});

test("la numérotation repart à -1, -2, -3 (logique des id inchangée)", async () => {
  const draft = { texte: "Nouvelle", tags: ["Test"], author: "Léo" };
  assert.equal((await repo.createLocalQuestion(draft)).id, -1);
  assert.equal((await repo.createLocalQuestion(draft)).id, -2);
  assert.equal((await repo.createLocalQuestion(draft)).id, -3);
});

test("nettoyage unique : une réouverture ne supprime pas les nouvelles questions", async () => {
  db.close();
  const reopened = await run(indexedDB.open("questionstime2", 3));
  const local = await run(reopened.transaction("questionsUser").objectStore("questionsUser").getAll());
  assert.deepEqual(local.map((q) => q.id).sort((a, b) => b - a), [-1, -2, -3]);
  reopened.close();
});
