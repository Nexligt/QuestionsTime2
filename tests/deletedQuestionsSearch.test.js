/*
  Questions supprimées : recherche (texte / identifiant) + pagination.
  Un jeu de 14 questions de base est servi par fetch() à la place du
  fichier réel (le code testé, lui, est celui du projet).
*/
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor } from "./helpers.js";

const DATASET = [
  "Quel est ton plat préféré ?",
  "Quel voyage t'a le plus marqué ?",
  "Quelle est ta chanson d'été ?",
  "Quel élève étais-tu au collège ?",
  "Quel café préfères-tu le matin ?",
  "Quel film regardes-tu en boucle ?",
  "Quel livre t'a fait pleurer ?",
  "Quel sport aimerais-tu essayer ?",
  "Quel est ton meilleur souvenir d'enfance ?",
  "Quelle langue voudrais-tu parler ?",
  "Quel animal serais-tu ?",
  "Quelle est la capitale de France selon toi ?",
  "Quel métier rêvais-tu de faire ?",
  "Quelle saison préfères-tu ?",
].map((texte, i) => ({ id: i + 1, texte, tags: ["Test"], author: "base" }));

globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => DATASET, text: async () => "" });

const { createDeletedQuestionsView, DELETED_PAGE_SIZE } = await import(
  "../js/features/questions/deletedQuestionsView.js"
);
const { deleteQuestion, getDeletedQuestionEntries, getAvailableQuestions } = await import(
  "../js/data/questionsRepository.js"
);
const { searchQuestions } = await import("../js/features/questions/questionSearch.js");
const { paginate } = await import("../js/ui/pagination.js");

beforeEach(async () => {
  await resetDatabase();
  for (let id = 1; id <= 12; id++) await deleteQuestion(id); // 12 supprimées
});

const mountDeleted = () => mount(createDeletedQuestionsView, (v) => v.dataset.ready === "true");
const ids = (v) => [...v.querySelectorAll(".deleted-item__id")].map((e) => e.textContent);
const info = (v) => [...v.querySelectorAll(".pager__info")].map((e) => e.textContent);
const buttons = (v, cls) => [...v.querySelectorAll(`.pager__${cls}`)];

function search(v, value) {
  const input = v.querySelector(".deleted-search__input");
  input.value = value;
  input.dispatchEvent(new window.Event("input"));
}

test("constante de pagination = 5 ; découpage pur", () => {
  assert.equal(DELETED_PAGE_SIZE, 5);
  const items = Array.from({ length: 12 }, (_, i) => i);
  assert.equal(paginate(items, 1, 5).pageCount, 3);
  assert.deepEqual(paginate(items, 3, 5).items, [10, 11]);
  assert.equal(paginate(items.slice(0, 7), 1, 5).pageCount, 2);
  assert.equal(paginate(items.slice(0, 3), 1, 5).pageCount, 1);
  assert.equal(paginate([], 4, 5).page, 1);
  assert.equal(paginate(items, 9, 5).page, 3); // borné
});

test("1. recherche par texte (mots partiels, ordre libre)", async () => {
  const v = await mountDeleted();
  search(v, "capital france");
  assert.deepEqual(ids(v), ["B-12"]);
  search(v, "france capitale");
  assert.deepEqual(ids(v), ["B-12"]);
});

test("2-4. insensible aux majuscules, accents et espaces inutiles", async () => {
  const v = await mountDeleted();
  for (const q of ["CAPITALE", "Élève", "eleve", "ELEVE", "  capitale    de   france  "]) {
    search(v, q);
    assert.equal(ids(v).length, 1, q);
  }
  search(v, "cafe");
  assert.deepEqual(ids(v), ["B-5"]);
  search(v, "ÉTÉ");
  assert.deepEqual(ids(v), ["B-3"]);
});

test("5-7. recherche par identifiant : B-12, b-12, 12 (et b12)", async () => {
  const v = await mountDeleted();
  for (const q of ["B-12", "b-12", "12", " b12 ", "B - 12"]) {
    search(v, q);
    assert.deepEqual(ids(v), ["B-12"], q);
  }
  search(v, "B-13"); // non supprimée : jamais listée
  assert.deepEqual(ids(v), []);
  assert.deepEqual(searchQuestions(DATASET, "L-12"), []);
});

test("id dans l'écran : '1' contient, 'B-1' commence par 1, espace final sans effet", async () => {
  const v = await mountDeleted();
  search(v, "1");
  assert.deepEqual(ids(v), ["B-1", "B-10", "B-11", "B-12"]);
  search(v, "B-1");
  assert.deepEqual(ids(v), ["B-1", "B-10", "B-11", "B-12"]);
  search(v, "B-12");
  assert.deepEqual(ids(v), ["B-12"]);
  search(v, "B-1 "); // espace final sans effet
  assert.deepEqual(ids(v), ["B-1", "B-10", "B-11", "B-12"]);
  search(v, "1 ");
  assert.deepEqual(ids(v), ["B-1", "B-10", "B-11", "B-12"]);
});

test("8. pagination de 5 : 12 supprimées -> 3 pages, contrôles en haut et en bas", async () => {
  const v = await mountDeleted();
  assert.deepEqual(ids(v), ["B-1", "B-2", "B-3", "B-4", "B-5"]);
  assert.deepEqual(info(v), ["Page 1 / 3", "Page 1 / 3"]);
  assert.ok(v.querySelector(".pager--top").compareDocumentPosition(v.querySelector(".deleted-list")) & 4);
  assert.ok(v.querySelector(".deleted-list").compareDocumentPosition(v.querySelector(".pager--bottom")) & 4);
  for (const item of v.querySelectorAll(".deleted-item")) {
    assert.equal(item.querySelector(".deleted-item__restore").textContent, "Restaurer");
    assert.ok(item.querySelector(".deleted-item__text").textContent.length > 0);
  }
  search(v, "quel"); // 12 résultats
  assert.deepEqual(info(v), ["Page 1 / 3", "Page 1 / 3"]);
  search(v, "tu"); // résultats filtrés puis paginés
  const count = Number(v.querySelector(".deleted-card__status").dataset.results);
  assert.equal(info(v)[0], `Page 1 / ${Math.ceil(count / 5)}`);
});

test("9-10. Précédent / Suivant (haut et bas) et désactivation", async () => {
  const v = await mountDeleted();
  const [prevTop, prevBottom] = buttons(v, "prev");
  const [nextTop, nextBottom] = buttons(v, "next");
  assert.equal(prevTop.disabled, true);
  assert.equal(prevBottom.disabled, true);
  assert.equal(nextTop.disabled, false);

  nextTop.click();
  assert.deepEqual(ids(v), ["B-6", "B-7", "B-8", "B-9", "B-10"]);
  assert.deepEqual(info(v), ["Page 2 / 3", "Page 2 / 3"]);
  assert.equal(prevTop.disabled, false);
  assert.equal(nextBottom.disabled, false);

  nextBottom.click();
  assert.deepEqual(ids(v), ["B-11", "B-12"]);
  assert.equal(nextTop.disabled, true);
  assert.equal(nextBottom.disabled, true);

  prevBottom.click();
  assert.deepEqual(info(v), ["Page 2 / 3", "Page 2 / 3"]);
  prevTop.click();
  assert.equal(prevTop.disabled, true);
});

test("11. modifier la recherche revient à la page 1", async () => {
  const v = await mountDeleted();
  buttons(v, "next")[0].click();
  buttons(v, "next")[0].click();
  assert.equal(info(v)[0], "Page 3 / 3");
  search(v, "q");
  assert.equal(info(v)[0], "Page 1 / 3");
  assert.equal(ids(v)[0], "B-1");
});

test("12. pagination recalculée après restauration", async () => {
  const v = await mountDeleted();
  buttons(v, "next")[0].click();
  buttons(v, "next")[0].click(); // page 3 : B-11, B-12
  v.querySelector('.deleted-item[data-question-id="11"] .deleted-item__restore').click();
  await waitFor(() => /B-11 restaurée/.test(v.querySelector(".deleted-card__status").textContent));
  assert.deepEqual(ids(v), ["B-12"]);
  assert.equal(info(v)[0], "Page 3 / 3");

  v.querySelector('.deleted-item[data-question-id="12"] .deleted-item__restore').click();
  await waitFor(() => /B-12 restaurée/.test(v.querySelector(".deleted-card__status").textContent));
  // 10 restantes -> 2 pages ; la page 3 n'existe plus : retour sur la page 2.
  assert.deepEqual(info(v), ["Page 2 / 2", "Page 2 / 2"]);
  assert.deepEqual(ids(v), ["B-6", "B-7", "B-8", "B-9", "B-10"]);
  assert.equal(buttons(v, "next")[0].disabled, true);
  assert.equal((await getDeletedQuestionEntries()).length, 10);
  assert.ok((await getAvailableQuestions()).some((q) => q.id === 12));

  // Avec une recherche active : résultats recalculés aussi.
  search(v, "capitale");
  assert.deepEqual(ids(v), []);
});

test("13. aucun résultat : message clair, pas de pagination", async () => {
  const v = await mountDeleted();
  search(v, "zzzz introuvable");
  assert.deepEqual(ids(v), []);
  assert.match(v.querySelector(".deleted-card__status").textContent, /Aucune question supprimée ne correspond/);
  for (const pager of v.querySelectorAll(".pager")) assert.equal(pager.hidden, true);

  search(v, "B-12"); // une seule page : barre masquée
  assert.deepEqual(ids(v), ["B-12"]);
  assert.equal(v.querySelector(".pager").hidden, true);
  assert.equal(v.querySelector(".deleted-card__status").textContent, "");
});
