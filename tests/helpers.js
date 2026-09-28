/*
  Environnement de test partagé : IndexedDB simulée (fake-indexeddb),
  DOM simulé (jsdom) et fetch() servant tests/fixtures/questions.base.json.
  Les tests importent directement les fichiers réels du projet.
*/
import "fake-indexeddb/auto";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Jeu de questions de base FIGÉ pour les tests (5 questions, id 1 à 5) :
// les tests ne dépendent pas du contenu réel de data/questions.base.json,
// qui peut évoluer librement. Le chargeur réel (questionsBaseLoader.js)
// est bien exécuté : seul fetch() est simulé.
const baseJsonPath = fileURLToPath(new URL("./fixtures/questions.base.json", import.meta.url));
export const BASE_QUESTIONS = JSON.parse(readFileSync(baseJsonPath, "utf-8"));

const dom = new JSDOM("<!DOCTYPE html><body></body>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => JSON.parse(readFileSync(baseJsonPath, "utf-8")),
  text: async () => "<svg></svg>", // icônes du menu (navBar.js)
});

const { openDatabase, STORES } = await import("../js/data/db.js");

/** Vide tous les stores entre deux tests. */
export async function resetDatabase() {
  const db = await openDatabase();
  const names = Object.values(STORES);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(names, "readwrite");
    for (const name of names) tx.objectStore(name).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/** Attend qu'une condition devienne vraie (rendu asynchrone des vues). */
export async function waitFor(condition, timeout = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error("waitFor : délai dépassé");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Monte une vue et attend la fin de son chargement. */
export async function mount(render, isReady) {
  const view = render();
  document.body.innerHTML = "";
  document.body.append(view);
  await waitFor(() => isReady(view));
  return view;
}

/** Vue Main prête : question, message, ou bouton réactivé. */
export function mainIsReady(view) {
  const text = view.querySelector(".question-card")?.textContent ?? "";
  return !text.includes("Chargement") && (
    !view.querySelector(".question-next").disabled ||
    Boolean(view.querySelector('[data-status="no-matching-question"]'))
  );
}

export function displayedQuestionId(view) {
  // Id interne (data-question-id) ; le texte affiché est "B-n" / "L-n".
  const raw = view.querySelector(".question-card__id")?.dataset.questionId;
  return raw === undefined ? null : Number(raw);
}
